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

// roster(): men M01.., women F01.., grades cycle 1-3 (A, B, C) by position.
const gradeOf = (name: string) => ((Number(name.slice(1)) - 1) % 3) + 1

describe('draw generation (44 men, 20 women, no teams: 5 courts, 5-hour limit, at most 6 games each)', () => {
  let browser: Browser
  let page: Page
  let comp: number
  let rows: Row[] = []
  before(async () => {
    browser = await launch()
    page = await newPage(browser)
    await login(page, 'Draw Tester')
    comp = await createCompetition(page, 'Draw Test')
    await addPlayers(page, comp, roster(44, 20))
  })
  after(() => closeBrowser(browser))

  it('shows a quick plan before generating', async () => {
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, /64 players \(44 men, 20 women\)/)
    assert.match(text, /up to 96 matches/)
    assert.match(text, /20 rounds/)
    assert.match(text, /estimated finish 14:00/)
    assert.match(text, /fits the time limit/)
  })

  it('refuses nonsense settings', async () => {
    await generate(page, comp, { hours: 5, maxGames: 99, serverOnly: true })
    assert.match((await banner(page)) ?? '', /invalid/i)
  })

  it('generates a full draw inside the 5 hours', async () => {
    await generate(page, comp, { seed: 11 })
    assert.match((await banner(page)) ?? '', /Schedule generated/)
    rows = await readSchedule(page, comp)
    assert(rows.length >= 90 && rows.length <= 96, `${rows.length} matches (96 when everyone plays 6)`)
    assert(Math.max(...rows.map((r) => r.round)) <= 20, 'no round after 14:00')
    assert.equal(rows.reduce((n, r) => n + r.warnings, 0), 0, 'no clash, line-up, grade or team warnings')
  })

  it('nobody plays more than 6 games, and almost everyone plays all 6', () => {
    const games = new Map<string, number>()
    for (const r of rows) for (const n of r.names) games.set(n, (games.get(n) ?? 0) + 1)
    assert.equal(games.size, 64, 'everyone plays')
    assert(Math.max(...games.values()) <= 6, 'at most 6 games')
    assert([...games.values()].filter((g) => g === 6).length >= 56, 'almost everyone has all 6')
  })

  it('all four players in a match are within one grade, and women only meet women or play mixed', () => {
    for (const r of rows) {
      const g = r.names.map(gradeOf)
      assert(Math.max(...g) - Math.min(...g) <= 1, `round ${r.round} court ${r.court}: grades ${g}`)
      if (r.event === 'MD') assert(r.names.every((n) => n.startsWith('M')), "no woman in men's doubles")
      const women = (side: string[]) => side.filter((n) => n.startsWith('F')).length
      const a = women(r.names.slice(0, 2)), b = women(r.names.slice(2))
      assert(a === b || (a === 2 && b === 0), `round ${r.round} court ${r.court}: sides must be the same type (or women vs men)`)
    }
  })

  it("no one plays twice in a round, and men's doubles sit on the lower courts", () => {
    for (const r of new Set(rows.map((x) => x.round))) {
      const inRound = rows.filter((x) => x.round === r).sort((a, b) => a.court - b.court)
      const names = inRound.flatMap((x) => x.names)
      assert.equal(new Set(names).size, names.length, `round ${r}: a player appears twice`)
      assert.deepEqual(inRound.map((x) => x.court), inRound.map((_, i) => i + 1), `round ${r}: courts are 1..n`)
      assert(inRound.length <= 5, `round ${r}: more matches than courts`)
      const firstXD = inRound.findIndex((x) => x.event === 'XD')
      if (firstXD >= 0) assert(inRound.slice(firstXD).every((x) => x.event === 'XD'), `round ${r}: men's doubles after mixed`)
    }
  })

  it('a tighter time limit gives fewer games instead of a late finish', async () => {
    await generate(page, comp, { hours: 4, seed: 11 }) // 4 hours = 16 rounds
    assert.match((await banner(page)) ?? '', /fewer games than planned/)
    const tight = await readSchedule(page, comp)
    assert(Math.max(...tight.map((r) => r.round)) <= 16, 'nothing after 13:00')
    assert(tight.length < rows.length, 'fewer matches than the 5-hour draw')
    await generate(page, comp, { seed: 11 }) // back to the full draw
    rows = await readSchedule(page, comp)
  })

  it('regenerating replaces the draw while nothing has started', async () => {
    const a = JSON.stringify(rows.slice(0, 5))
    await generate(page, comp, { seed: 12 })
    const again = await readSchedule(page, comp)
    assert.notEqual(JSON.stringify(again.slice(0, 5)), a)
    assert(again.length >= 90 && again.length <= 96)
    rows = again
  })

  it('refuses to regenerate once a match has been scored', async () => {
    const first = (await listMatches(page, comp))[0]
    await setScore(page, comp, first.id, 'live', '1', '0')
    await generate(page, comp, { seed: 13 })
    assert.match((await banner(page)) ?? '', /Not allowed once matches have been started or scored/)
    assert.equal((await readSchedule(page, comp)).length, rows.length, 'draw untouched')
  })
})
