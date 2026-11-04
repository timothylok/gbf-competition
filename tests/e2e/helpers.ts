import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer-core'
import { existsSync } from 'node:fs'

export const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3200'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find((p) => p && existsSync(p))
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome/Chromium executable.')
  return found
}

/** Close Chrome, but never hang the test run if it will not close: wait 5s, then kill the process. */
export async function closeBrowser(b: Browser) {
  await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
  try { b.process()?.kill('SIGKILL') } catch { /* already gone */ }
}

export const launch = (): Promise<Browser> => puppeteer.launch({ executablePath: chromePath(), headless: true })

export async function newPage(ctx: Browser | BrowserContext, mobile = false): Promise<Page> {
  const page = await ctx.newPage()
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1100, height: 900 })
  page.setDefaultTimeout(30_000)
  return page
}

export const go = (p: Page, url: string) => p.goto(BASE + url, { waitUntil: 'networkidle0' })
export const here = (p: Page) => new URL(p.url()).pathname

/** One-shot banner text (?ok= / ?err= messages, login errors). */
export const banner = (p: Page): Promise<string | null> => p.$eval('[role=status],[role=alert]', (e) => e.textContent).catch(() => null)

export async function login(page: Page, name = 'E2E Admin', password = PASSWORD) {
  await go(page, '/admin/login')
  await page.type('#name', name)
  await page.type('#password', password)
  await page.click('button[type=submit].btn-primary')
  await Promise.race([
    page.waitForFunction(() => location.pathname === '/admin', { timeout: 20_000 }),
    page.waitForSelector('[role=alert]', { timeout: 20_000 }),
  ]).catch(() => {})
  await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => {})
}

export async function logout(page: Page) {
  await go(page, '/admin')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Sign out/.test(b.textContent ?? ''))?.click()),
  ])
}

type Finder = [string, string | null][] // [fieldName, expectedValue | null = "field exists"]

/** Fill the form that matches `finder`, then click a button (by text or value) or submit, and wait for the page. */
export async function submit(page: Page, finder: Finder, values: Record<string, string>, button?: string, opts: { serverOnly?: boolean } = {}) {
  await page.evaluate(
    (finder, values, serverOnly) => {
      const f = [...document.forms].find((x) => finder.every(([n, v]) => (v === null ? !!x.querySelector(`[name=${n}]`) : (x.querySelector(`[name=${n}]`) as HTMLInputElement | null)?.value === v)))
      if (!f) throw new Error('form not found: ' + JSON.stringify(finder))
      for (const [k, v] of Object.entries(values)) (f.querySelector(`[name=${k}]`) as HTMLInputElement).value = v
      if (serverOnly) f.noValidate = true // skip min/max/required so the server's own validation is what gets tested
    },
    finder, values, opts.serverOnly ?? false,
  )
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(
      (finder, button) => {
        const f = [...document.forms].find((x) => finder.every(([n, v]) => (v === null ? !!x.querySelector(`[name=${n}]`) : (x.querySelector(`[name=${n}]`) as HTMLInputElement | null)?.value === v)))!
        const b = button ? [...f.querySelectorAll('button')].find((x) => x.textContent?.trim() === button || x.value === button) : null
        b ? b.click() : f.requestSubmit()
      },
      finder, button ?? null,
    ),
  ])
}

// ---------- seeding through the real admin UI ----------

export async function createCompetition(page: Page, name = 'E2E Competition'): Promise<number> {
  await go(page, '/admin')
  await submit(page, [['courts', null], ['event_date', null]], { name })
  const id = Number(page.url().match(/\/admin\/c\/(\d+)/)?.[1])
  if (!id) throw new Error('competition was not created: ' + page.url())
  return id
}

/** "M01, M, 2" lines. Men are M01.., women F01.., grades cycle 1-3. */
export function roster(men: number, women: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lines: string[] = []
  for (let i = 1; i <= men; i++) lines.push(`M${pad(i)}, M, ${((i - 1) % 3) + 1}`)
  for (let i = 1; i <= women; i++) lines.push(`F${pad(i)}, F, ${((i - 1) % 3) + 1}`)
  return lines.join('\n')
}

export async function addPlayers(page: Page, comp: number, text: string) {
  await go(page, `/admin/c/${comp}/players`)
  await submit(page, [['id', String(comp)], ['text', null]], { text })
}

export async function generate(page: Page, comp: number, opts: { md?: number; xd?: number; hours?: number; seed?: number; serverOnly?: boolean } = {}) {
  await go(page, `/admin/c/${comp}/schedule`)
  await submit(page, [['mdGames', null]], { mdGames: String(opts.md ?? 4), xdGames: String(opts.xd ?? 4), hours: String(opts.hours ?? 5), seed: String(opts.seed ?? 1) }, 'Generate schedule', { serverOnly: opts.serverOnly })
}

export async function setStatus(page: Page, comp: number, status: 'draft' | 'live' | 'finished') {
  await go(page, `/admin/c/${comp}`)
  await submit(page, [['id', String(comp)], ['courts', null]], { status }, 'Save')
}

export async function seed(page: Page, opts: { name?: string; men?: number; women?: number; live?: boolean } = {}) {
  const comp = await createCompetition(page, opts.name)
  await addPlayers(page, comp, roster(opts.men ?? 12, opts.women ?? 8))
  await generate(page, comp)
  if (opts.live) await setStatus(page, comp, 'live')
  return comp
}

export interface ScoreCard {
  id: number
  event: 'MD' | 'XD'
  court: number
  status: string
  names: string[] // [a1, a2, b1, b2]
}

export async function listMatches(page: Page, comp: number): Promise<ScoreCard[]> {
  await go(page, `/admin/c/${comp}/scores`)
  return page.evaluate(() =>
    [...document.forms]
      .filter((f) => f.querySelector('[name=score_a]'))
      .map((f) => {
        const spans = [...f.querySelectorAll('header span')].map((s) => s.textContent?.trim() ?? '')
        const names = [...f.querySelectorAll('p.flex-1')].flatMap((p) => (p as HTMLElement).innerText.split('\n').map((x) => x.trim()).filter(Boolean))
        return {
          id: Number((f.querySelector('[name=id]') as HTMLInputElement).value),
          event: (/Men/.test(spans[spans.length - 1]) ? 'MD' : 'XD') as 'MD' | 'XD',
          court: Number(spans[0].replace(/\D/g, '')),
          status: f.querySelector('footer .chip')?.textContent?.trim() ?? '',
          names,
        }
      }),
  )
}

export async function setScore(page: Page, comp: number, matchId: number, intent: 'done' | 'live' | 'reset' | 'cancel', a = '', b = '') {
  await go(page, `/admin/c/${comp}/scores`)
  await submit(page, [['id', String(matchId)], ['score_a', null]], { score_a: a, score_b: b }, intent)
}

// ---------- anonymous (logged-out) HTTP helpers ----------

export async function fetchHtml(path: string, cookie?: string): Promise<{ status: number; html: string; text: string; location: string | null }> {
  const r = await fetch(BASE + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })
  const html = await r.text()
  return { status: r.status, html, text: toText(html), location: r.headers.get('location') }
}

export function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Text of each match panel (<article>) on a public page. */
export const cards = (html: string): string[] => html.split('<article').slice(1).map((c) => toText('<article' + c.split('</article>')[0]))

/** Cells of each standings table row. */
export const tableRows = (html: string): string[][] =>
  [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => toText(c[1])))
    .filter((r) => r.length > 1)
