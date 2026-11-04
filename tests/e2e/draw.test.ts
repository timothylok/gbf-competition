import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, addPlayers, banner, createCompetition, generate, go, launch, listMatches, login, newPage, roster, setScore } from './helpers'

interface Row { round: number; court: number; event: 'MD' | 'XD'; names: string[]; warnings: number }

async function readSchedule(page: Page, comp: number): Promise<Row[]> {
  await go(page, `/admin/c/${comp}/schedule`)
  return page.evaluate(() =>
    [...document.querySelectorAll('section')].flatMap((s) => {
      const round = Number(s.querySelector('h3')?.textContent?.match(/Round (\d+)/)?.[1])
      return [...s.querySelectorAll('ul li')].map((li) => {
        const spans = [...li.querySelectorAll(':scope > span')]
        const label = spans[2]?.textContent ?? ''
        return {
          round,
          court: Number(spans[0].textContent?.replace(/\D/g, '')),
          event: (spans[1].textContent?.includes("Men's") ? 'MD' : 'XD') as 'MD' | 'XD',
          names: label.split(/\s*\/\s*|\s+vs\s+/).map((x) => x.trim()).filter(Boolean),
          warnings: li.querySelectorAll('span[title]').length,
        }
      })
    }),
  )
}

describe('draw generation (44 men, 20 women: men\'s doubles first, mixed second, 5-hour limit)', () => {
  let browser: Browser
  let page: Page
  let comp: number
  before(async () => {
    browser = await launch()
    page = await newPage(browser)
    await login(page, 'Draw Tester')
    comp = await createCompetition(page, 'Draw Test')
    await addPlayers(page, comp, roster(44, 20))
  })
  after(() => closeBrowser(browser))

  it('shows an accurate plan before generating', async () => {
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, /64 players \(44 men, 20 women\)/)
    assert.match(text, /84 matches \(Men's doubles 44, Mixed doubles 40\)/)
    assert.match(text, /17 rounds/)
    assert.match(text, /estimated finish 13:15/)
    assert.match(text, /fits the time limit/)
  })

  it('refuses a draw that would run past the time limit, and creates nothing', async () => {
    await generate(page, comp, { hours: 4 }) // needs 17 rounds = 4h15
    assert.match((await banner(page)) ?? '', /does not fit the time limit/)
    assert.match(await page.evaluate(() => document.body.innerText), /No matches yet/)
  })

  it('refuses nonsense settings', async () => {
    await generate(page, comp, { hours: 5, md: 99, serverOnly: true })
    assert.match((await banner(page)) ?? '', /invalid/i)
  })

  it('generates 84 matches inside 17 rounds with no warnings', async () => {
    await generate(page, comp, { seed: 11 })
    assert.match((await banner(page)) ?? '', /Schedule generated/)
    const rows = await readSchedule(page, comp)
    assert.equal(rows.length, 84)
    assert.equal(Math.max(...rows.map((r) => r.round)), 17)
    assert.equal(rows.filter((r) => r.event === 'MD').length, 44)
    assert.equal(rows.filter((r) => r.event === 'XD').length, 40)
    assert.equal(rows.reduce((n, r) => n + r.warnings, 0), 0, 'no clash or line-up warnings')
  })

  it('gives every man 4+ men\'s doubles games and every woman 4 mixed games, none in men\'s doubles', async () => {
    const rows = await readSchedule(page, comp)
    const count = (event: string, prefix: string) => {
      const c = new Map<string, number>()
      for (const r of rows.filter((x) => x.event === event)) for (const n of r.names) if (n.startsWith(prefix)) c.set(n, (c.get(n) ?? 0) + 1)
      return c
    }
    const mdMen = count('MD', 'M')
    assert.equal(mdMen.size, 44, 'all 44 men play men\'s doubles')
    assert([...mdMen.values()].every((n) => n === 4), 'exactly 4 men\'s doubles games each')
    assert.equal(count('MD', 'F').size, 0, 'no woman in men\'s doubles')
    const xdWomen = count('XD', 'F')
    assert.equal(xdWomen.size, 20)
    assert([...xdWomen.values()].every((n) => n === 4), 'exactly 4 mixed games per woman')
    const xdMen = count('XD', 'M')
    assert(xdMen.size > 30, 'mixed places are shared across many men')
    const total = new Map<string, number>()
    for (const r of rows) for (const n of r.names) total.set(n, (total.get(n) ?? 0) + 1)
    const menTotals = [...total].filter(([n]) => n.startsWith('M')).map(([, v]) => v)
    assert(Math.max(...menTotals) - Math.min(...menTotals) <= 2, 'men\'s total games within 2 of each other')
  })

  it('no one plays twice in a round, and men\'s doubles sit on the lower courts', async () => {
    const rows = await readSchedule(page, comp)
    for (const r of new Set(rows.map((x) => x.round))) {
      const inRound = rows.filter((x) => x.round === r).sort((a, b) => a.court - b.court)
      const names = inRound.flatMap((x) => x.names)
      assert.equal(new Set(names).size, names.length, `round ${r}: a player appears twice`)
      assert.deepEqual(inRound.map((x) => x.court), inRound.map((_, i) => i + 1), `round ${r}: courts are 1..n`)
      const firstXD = inRound.findIndex((x) => x.event === 'XD')
      if (firstXD >= 0) assert(inRound.slice(firstXD).every((x) => x.event === 'XD'), `round ${r}: men's doubles after mixed`)
    }
  })

  it('regenerating replaces the draw (same size, different order) while nothing has started', async () => {
    const a = JSON.stringify((await readSchedule(page, comp)).slice(0, 5))
    await generate(page, comp, { seed: 12 })
    const rows = await readSchedule(page, comp)
    assert.equal(rows.length, 84)
    assert.notEqual(JSON.stringify(rows.slice(0, 5)), a)
  })

  it('refuses to regenerate once a match has been scored', async () => {
    const first = (await listMatches(page, comp))[0]
    await setScore(page, comp, first.id, 'live', '1', '0')
    await generate(page, comp, { seed: 13 })
    assert.match((await banner(page)) ?? '', /Not allowed once matches have been started or scored/)
    assert.equal((await readSchedule(page, comp)).length, 84, 'draw untouched')
  })
})
