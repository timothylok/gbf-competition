import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, BASE, launch, listMatches, login, newPage, seed, setScore, setStatus } from './helpers'
import config from '../../tailwind.config'

const PALETTE = Object.values(config.theme!.colors as Record<string, string>).filter((v) => v.startsWith('#')).map((v) => v.toLowerCase())
const rgbToHex = (rgb: string) => '#' + (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')

describe('layout: phone width, accessibility, colours', () => {
  let browser: Browser
  let admin: Page
  let phone: Page
  let comp: number
  let pages: [string, string][]

  before(async () => {
    browser = await launch()
    admin = await newPage(browser)
    await login(admin, 'Layout Tester')
    comp = await seed(admin, { name: 'Layout Cup', men: 12, women: 8, live: true })
    const ms = await listMatches(admin, comp)
    await setScore(admin, comp, ms[0].id, 'done', '15', '9')
    await setScore(admin, comp, ms.find((m) => m.event === 'XD')!.id, 'done', '12', '12')
    await setScore(admin, comp, ms[2].id, 'live', '7', '5')
    await setStatus(admin, comp, 'live')
    // The admin session is reused on a phone-sized page so admin screens can be audited too.
    phone = await browser.newPage()
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await phone.setCookie(...(await admin.cookies()))
    pages = [
      ['live', `/?c=${comp}`], ['schedule', `/schedule?c=${comp}`], ['standings', `/standings?c=${comp}`], ['events', '/events'],
      ['admin home', '/admin'], ['admin overview', `/admin/c/${comp}`], ['admin players', `/admin/c/${comp}/players`],
      ['admin schedule', `/admin/c/${comp}/schedule`], ['admin scores', `/admin/c/${comp}/scores`], ['audit', '/admin/audit'],
    ]
  })
  after(() => closeBrowser(browser))

  const visit = async (url: string, lang?: 'zh') => {
    await phone.setCookie({ name: 'lang', value: lang ?? 'en', url: BASE })
    await phone.goto(BASE + url, { waitUntil: 'networkidle0' })
  }

  describe('phone width (390px)', () => {
    it('never scrolls sideways on any page', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const r = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth, vw: innerWidth }))
        assert(r.scroll <= r.vw, `${name}: page is ${r.scroll}px wide on a ${r.vw}px screen`)
      }
    })
    it('has comfortably tappable links, buttons and fields (at least 32px high)', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const small = await phone.evaluate(() =>
          [...document.querySelectorAll('a, button, input, select, textarea, summary')]
            .filter((e) => (e as HTMLInputElement).type !== 'hidden' && !e.closest('.sr-only') && e.getClientRects().length > 0)
            .filter((e) => e.getBoundingClientRect().height < 31.5)
            .map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || (e as HTMLInputElement).name || '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().height)}px`),
        )
        assert.deepEqual(small, [], `${name}: small tap targets`)
      }
    })
    it('keeps the header to two lines at most', async () => {
      for (const [name, url] of pages.slice(0, 3)) {
        await visit(url)
        const h = await phone.evaluate(() => document.querySelector('header')!.getBoundingClientRect().height)
        assert(h <= 130, `${name}: header is ${Math.round(h)}px tall`)
      }
    })
    it('keeps text readable (nothing under 11px)', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const tiny = await phone.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).length)
        assert.equal(tiny, 0, `${name}: ${tiny} tiny text elements`)
      }
    })
    it('makes Save final the big primary button on score cards', async () => {
      await visit(`/admin/c/${comp}/scores`)
      const b = await phone.evaluate(() => {
        const e = document.querySelector('button[value=done]') as HTMLElement
        const r = e.getBoundingClientRect()
        return { w: r.width, h: r.height, vw: innerWidth }
      })
      assert(b.w > b.vw * 0.7, `Save final is only ${Math.round(b.w)}px wide`)
      assert(b.h >= 44)
    })
  })

  describe('Pantone colours as rendered', () => {
    it('paints men\'s doubles headers PANTONE 2995 C and mixed doubles headers PANTONE 812 C', async () => {
      await visit(`/?c=${comp}`)
      const colours = await phone.evaluate(() => [...document.querySelectorAll('article > header')].map((h) => ({ event: (h.lastElementChild?.textContent ?? '').trim(), bg: getComputedStyle(h).backgroundColor })))
      const md = colours.filter((c) => /Men/.test(c.event)), xd = colours.filter((c) => /Mixed/.test(c.event))
      assert(md.length > 0 && xd.length > 0, 'both event types are on the live board')
      for (const c of md) assert.equal(rgbToHex(c.bg), '#00a9e0')
      for (const c of xd) assert.equal(rgbToHex(c.bg), '#ff5fa2')
    })
    it('uses only Pantone colours for text, backgrounds and borders on every page', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const used = await phone.evaluate(() => {
          const out: [string, string][] = [] // [colour, where]
          for (const e of document.querySelectorAll('body, body *')) {
            // skip hidden elements and Next.js's dev overlay (custom elements), which only exists under `next dev`
            if (e.getClientRects().length === 0 || e.tagName.includes('-') || e.closest('nextjs-portal, [data-nextjs-toast], script, style, noscript')) continue
            const cs = getComputedStyle(e)
            const where = `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 40)}`
            out.push([cs.color, where + ' (text)'])
            if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.push([cs.backgroundColor, where + ' (background)'])
            for (const side of ['top', 'right', 'bottom', 'left']) {
              if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0) out.push([cs.getPropertyValue(`border-${side}-color`), where + ' (border)'])
            }
          }
          return out
        })
        const bad = used.filter(([c]) => !/,\s*0\)$/.test(c) /* fully transparent, e.g. inactive tab borders */).map(([c, where]) => [rgbToHex(c), where] as const).filter(([h]) => !PALETTE.includes(h)).map(([h, where]) => `${h} on ${where}`)
        assert.deepEqual([...new Set(bad)].slice(0, 8), [], `${name}: colours outside the palette`)
      }
    })
  })

  describe('animated Live badge', () => {
    const badgeColours = async () => {
      const seen = new Set<string>()
      for (let i = 0; i < 14; i++) {
        seen.add(await phone.$eval('.live-badge', (e) => getComputedStyle(e).color))
        await new Promise((r) => setTimeout(r, 250))
      }
      return [...seen].map(rgbToHex)
    }
    it('shows on the competition header and on live matches, on a dark background', async () => {
      await visit(`/?c=${comp}`)
      const r = await phone.evaluate(() => ({ n: document.querySelectorAll('.live-badge').length, bg: getComputedStyle(document.querySelector('.live-badge')!).backgroundColor, header: !!document.querySelector('h1 + .live-badge, .live-badge') }))
      assert(r.n >= 2, `expected the header badge and at least one match badge, found ${r.n}`)
      assert.equal(rgbToHex(r.bg), '#101820')
    })
    it('really changes colour over time, using only the four Pantone colours', async () => {
      await visit(`/?c=${comp}`)
      const colours = await badgeColours()
      assert(colours.length >= 3, `only saw ${colours.join(', ')}`)
      for (const c of colours) assert(['#ff5fa2', '#00a9e0', '#f5df4d', '#88b04b'].includes(c), `${c} is not one of the four`)
    })
    it('stands still, in yellow, when the visitor prefers reduced motion', async () => {
      await phone.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
      await visit(`/?c=${comp}`)
      assert.equal(await phone.$eval('.live-badge', (e) => getComputedStyle(e).animationName), 'none')
      const colours = await badgeColours()
      assert.deepEqual(colours, ['#f5df4d'])
      await phone.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
    })
  })

  describe('accessibility basics', () => {
    it('has a language, a title and exactly one h1 on every page', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const r = await phone.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, h1: document.querySelectorAll('h1').length }))
        assert.match(r.lang, /^en-NZ$/, `${name}: lang`)
        assert(r.title.length > 3, `${name}: title`)
        assert.equal(r.h1, 1, `${name}: h1 count`)
      }
    })
    it('labels every form control', async () => {
      for (const [name, url] of pages) {
        await visit(url)
        const unlabelled = await phone.evaluate(() =>
          [...document.querySelectorAll('input, select, textarea')]
            .filter((e) => (e as HTMLInputElement).type !== 'hidden')
            .filter((e) => {
              const el = e as HTMLInputElement
              return !el.getAttribute('aria-label') && !(el.id && document.querySelector(`label[for="${el.id}"]`)) && !el.closest('label')
            })
            .map((e) => (e as HTMLInputElement).name || e.tagName),
        )
        assert.deepEqual(unlabelled, [], `${name}: controls without a label`)
      }
    })
    it('marks the current page in navigation', async () => {
      await visit(`/standings?c=${comp}`)
      assert.equal(await phone.$eval('nav[aria-label=Sections] [aria-current=page]', (e) => e.textContent), 'Standings')
      await visit(`/admin/c/${comp}/scores`)
      assert.equal(await phone.$eval('nav[aria-label="Competition sections"] [aria-current=page]', (e) => e.textContent), 'Scores')
    })
    it('gives data tables a caption and header scopes', async () => {
      await visit(`/standings?c=${comp}`)
      const r = await phone.evaluate(() => ({ caption: !!document.querySelector('table caption'), scoped: [...document.querySelectorAll('th')].every((t) => t.getAttribute('scope') === 'col') }))
      assert(r.caption && r.scoped)
    })
    it('exposes the winner to screen readers, not just by colour', async () => {
      await visit(`/?c=${comp}`)
      assert((await phone.$$eval('article .sr-only', (e) => e.length)) > 0)
    })
    it('serves the Chinese version as zh-HK on every public page', async () => {
      for (const [, url] of pages.slice(0, 4)) {
        await visit(url, 'zh')
        assert.equal(await phone.evaluate(() => document.documentElement.lang), 'zh-HK')
      }
    })
  })
})
