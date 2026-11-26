import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { addPlayers, banner, cards, closeBrowser, createCompetition, fetchHtml, generate, go, launch, login, newPage, roster, setStatus, submit } from './helpers'

/**
 * The newer game rules, end to end, on the real pages: letter grades, handicap (women vs men) matches with a
 * head start, the B-with-D partner rule and the "happy to partner D grade" flag.
 * 5 courts and a 5-hour limit, like a real session. Own roster, so it does not depend on the other files.
 */

const MEN = 27
const WOMEN = 19
const COURTS = 5
const HOURS = 5
const LETTERS = ['C', 'C', 'B', 'C', 'D'] // cycles; gives a mix of B, C and D like the real list
const GRADE: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 }

interface Person { gender: 'M' | 'F'; letter: string; grade: number }
const people = new Map<string, Person>()
const lines: string[] = []
for (let i = 1; i <= MEN; i++) {
  const letter = LETTERS[(i - 1) % LETTERS.length]
  const name = `M${String(i).padStart(2, '0')}`
  people.set(name, { gender: 'M', letter, grade: GRADE[letter] })
  lines.push(`${name}, M, ${letter}`)
}
for (let i = 1; i <= WOMEN; i++) {
  const letter = LETTERS[(i + 1) % LETTERS.length]
  const name = `F${String(i).padStart(2, '0')}`
  people.set(name, { gender: 'F', letter, grade: GRADE[letter] })
  lines.push(`${name}, F, ${letter}`)
}

interface Row { round: number; court: number; kind: string; names: string[]; headStart: string | null; warnings: string[] }

async function readSchedule(page: Page, comp: number): Promise<Row[]> {
  await go(page, `/admin/c/${comp}/schedule`)
  return page.evaluate(() =>
    [...document.querySelectorAll('section')].flatMap((s) => {
      const round = Number(s.querySelector('h3')?.textContent?.match(/Round (\d+)/)?.[1])
      return [...s.querySelectorAll('ul li')].map((li) => {
        const spans = [...li.querySelectorAll(':scope > span')]
        return {
          round,
          court: Number((spans[0]?.textContent ?? '').replace(/\D/g, '')),
          kind: (spans[1]?.textContent ?? '').trim(),
          names: (spans[2]?.textContent ?? '').trim().split(/\s*\/\s*|\s+vs\s+/).map((x) => x.trim()).filter(Boolean),
          headStart: spans.map((x) => x.textContent?.trim() ?? '').find((x) => /^Women start/.test(x)) ?? null,
          warnings: [...li.querySelectorAll('span[title]')].map((x) => x.getAttribute('title') ?? ''),
        }
      })
    }),
  )
}

const p = (name: string) => people.get(name)!
const womenIn = (names: string[]) => names.filter((n) => p(n).gender === 'F').length
/** Independent copy of the rule: avg grade of each side rounded, women one lower = 6, level = 4, one woman + man = half. */
function expectedHeadStart(names: string[]): number | null {
  const a = names.slice(0, 2), b = names.slice(2)
  const wa = womenIn(a), wb = womenIn(b)
  if (!((wa > 0 && wb === 0) || (wb > 0 && wa === 0))) return null
  const [ws, ms] = wa > 0 ? [a, b] : [b, a]
  const avg = (s: string[]) => Math.round((p(s[0]).grade + p(s[1]).grade) / 2)
  const gap = avg(ws) - avg(ms)
  const full = gap === 0 ? 4 : gap === 1 ? 6 : 0
  return womenIn(ws) === 1 ? Math.floor(full / 2) : full
}

describe(`game rules: letter grades, handicap and pairing (${MEN} men, ${WOMEN} women, ${COURTS} courts, ${HOURS} hours)`, () => {
  let browser: Browser
  let page: Page
  let comp: number
  let rows: Row[]

  before(async () => {
    browser = await launch()
    page = await newPage(browser)
    await login(page, 'Rules Tester')
    comp = await createCompetition(page, 'Rules Test')
    // 5 courts explicitly, whatever the default is
    await go(page, `/admin/c/${comp}`)
    await submit(page, [['id', String(comp)], ['courts', null]], { courts: String(COURTS) }, 'Save')
    await addPlayers(page, comp, lines.join('\n'))
    await generate(page, comp, { hours: HOURS, seed: 7 })
    rows = await readSchedule(page, comp)
  })
  after(() => closeBrowser(browser))

  it('accepts letter grades and shows them as letters on the Players tab', async () => {
    await go(page, `/admin/c/${comp}/players`)
    const grades = await page.$$eval('input[name=grade]', (els) => els.map((e) => (e as HTMLInputElement).value))
    assert.equal(grades.length, MEN + WOMEN, 'every player imported')
    assert([...new Set(grades)].sort().join('') === 'BCD', `letters shown, got ${[...new Set(grades)]}`)
  })

  it('the plan line shows handicap matches and the draw fits 5 courts in 5 hours', async () => {
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, new RegExp(`${MEN + WOMEN} players \\(${MEN} men, ${WOMEN} women\\)`))
    assert.match(text, new RegExp(`Men's doubles ${MEN}, Mixed doubles ${WOMEN}, Handicap doubles ${WOMEN}`))
    assert.match(text, /fits the time limit/)
    assert.equal(rows.length, MEN + WOMEN + WOMEN)
    const rounds = Math.max(...rows.map((r) => r.round))
    assert(rounds <= (HOURS * 60) / 15, `${rounds} rounds must fit ${HOURS} hours of 15-minute rounds`)
    for (const r of new Set(rows.map((x) => x.round))) {
      const inRound = rows.filter((x) => x.round === r)
      assert(inRound.length <= COURTS, `round ${r}: more matches than courts`)
      assert.deepEqual(inRound.map((x) => x.court).sort((a, b) => a - b), inRound.map((_, i) => i + 1), `round ${r}: courts 1..n, none twice`)
      const names = inRound.flatMap((x) => x.names)
      assert.equal(new Set(names).size, names.length, `round ${r}: a player appears twice`)
    }
    assert.equal(rows.reduce((n, r) => n + r.warnings.length, 0), 0, 'no clash, line-up or B-with-D warnings')
  })

  it('the admin pages show when the competition ends, and no match ends after start + 5 hours', async () => {
    const rounds = Math.max(...rows.map((r) => r.round))
    const total = 9 * 60 + rounds * 15
    const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    assert(total <= 9 * 60 + HOURS * 60, `last match ends ${end}, after the ${HOURS}-hour limit (14:00)`)
    await go(page, `/admin/c/${comp}`)
    assert.match(await page.$eval('[data-testid=comp-times]', (e) => e.textContent ?? ''), new RegExp(`Starts 09:00 · End time 14:00 · Competition ends ${end} · ${rounds} rounds`))
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, new RegExp(`Competition ends ${end}`))
    assert.match(text, /Round 1 · 09:00–09:15 \(15 min\)/i) // headings are shown in capitals
    assert(rows.every((r) => r.round <= (HOURS * 60) / 15), 'every round ends by 14:00')
  })

  it('every woman plays 4 women\'s games; handicap matches are two women (side A) vs two men', () => {
    const handicap = rows.filter((r) => r.kind === 'Handicap doubles')
    assert.equal(handicap.length, WOMEN, 'half of the women\'s games are handicap')
    for (const m of handicap) {
      assert.equal(womenIn(m.names.slice(0, 2)), 2, `round ${m.round} court ${m.court}: side A is the two women`)
      assert.equal(womenIn(m.names.slice(2)), 0, `round ${m.round} court ${m.court}: side B is two men`)
    }
    const games = new Map<string, number>()
    for (const r of rows) for (const n of r.names) if (p(n).gender === 'F') games.set(n, (games.get(n) ?? 0) + 1)
    assert.equal(games.size, WOMEN)
    assert([...games.values()].every((n) => n === 4), 'exactly 4 games per woman')
    assert(rows.filter((r) => r.kind === "Men's doubles").every((r) => womenIn(r.names) === 0), 'no woman in men\'s doubles')
  })

  it('every handicap match shows the right head start (4 level, 6 one grade lower)', () => {
    for (const m of rows.filter((r) => r.kind === 'Handicap doubles')) {
      const exp = expectedHeadStart(m.names)
      assert(exp && exp > 0, `${m.names.join('/')}: the draw only makes matches the rules cover`)
      assert.equal(m.headStart, `Women start +${exp}`, m.names.join(' / '))
    }
    for (const m of rows.filter((r) => r.kind !== 'Handicap doubles')) assert.equal(m.headStart, null, 'no head start outside handicap matches')
  })

  it('never partners a B-grade player with a D-grade player', () => {
    for (const m of rows) {
      for (const pair of [m.names.slice(0, 2), m.names.slice(2)]) {
        const g = pair.map((n) => p(n).letter).sort().join('')
        assert.notEqual(g, 'BD', `round ${m.round}: ${pair.join(' & ')} is a B with a D`)
      }
    }
  })

  it('the Players tab saves "Happy to partner D grade" and the draw still works with it', async () => {
    await go(page, `/admin/c/${comp}/players`)
    await page.evaluate(() => {
      const f = [...document.forms].find((x) => (x.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === 'M01')!
      ;(f.querySelector('[name=d_friendly]') as HTMLInputElement).checked = true
    })
    await submit(page, [['nickname', 'M01']], {}, 'Save')
    assert.match((await banner(page)) ?? '', /Saved/)
    await go(page, `/admin/c/${comp}/players`)
    const checked = await page.evaluate(() => {
      const f = [...document.forms].find((x) => (x.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === 'M01')!
      return (f.querySelector('[name=d_friendly]') as HTMLInputElement).checked
    })
    assert.equal(checked, true, 'flag stays ticked after saving')
    await generate(page, comp, { hours: HOURS, seed: 8 })
    rows = await readSchedule(page, comp)
    assert.equal(rows.length, MEN + WOMEN + WOMEN)
    assert.equal(rows.reduce((n, r) => n + r.warnings.length, 0), 0)
  })

  it('score entry and the public schedule show the head start', async () => {
    await go(page, `/admin/c/${comp}/scores`)
    const scoreText = await page.evaluate(() => document.body.innerText)
    assert.match(scoreText, /Women start \+[46]/)
    assert.match(scoreText, /handicap doubles/i) // the score screen shows labels in capitals
    await setStatus(page, comp, 'live')
    const html = (await fetchHtml(`/schedule?c=${comp}`)).html
    const handicapCards = cards(html).filter((c) => /Handicap doubles/.test(c))
    assert.equal(handicapCards.length, WOMEN)
    assert(handicapCards.every((c) => /Women start \+[46]/.test(c)), 'every public handicap card shows its head start')
  })

  it('refuses a hand-made or edited match that would end after the time limit', async () => {
    const men = [...people].filter(([, v]) => v.gender === 'M').map(([n]) => n)
    const fill = async (round: string, court: string) => {
      await go(page, `/admin/c/${comp}/schedule`)
      await page.evaluate((round, court, men) => {
        const f = [...document.forms].find((x) => x.querySelector('[name=comp]') && !x.querySelector('[name=id]') && x.querySelector('[name=a1]')) as HTMLFormElement
        ;['a1', 'a2', 'b1', 'b2'].forEach((field, i) => {
          const sel = f.querySelector(`[name=${field}]`) as HTMLSelectElement
          sel.value = [...sel.options].find((o) => o.text.startsWith(men[i] + ' '))!.value
        })
        ;(f.querySelector('[name=event]') as HTMLSelectElement).value = 'MD'
        ;(f.querySelector('[name=round]') as HTMLInputElement).value = round
        ;(f.querySelector('[name=court]') as HTMLInputElement).value = court
        f.requestSubmit()
      }, round, court, men)
      await page.waitForNavigation({ waitUntil: 'networkidle0' })
    }
    const before = (await readSchedule(page, comp)).length
    await fill('21', '1') // round 21 = 14:00-14:15, after the 14:00 limit
    assert.match((await banner(page)) ?? '', /would end after the time limit/)
    assert.equal((await readSchedule(page, comp)).length, before, 'nothing was created')
    await fill('20', '1') // round 20 = 13:45-14:00, ends exactly at the limit
    assert.match((await banner(page)) ?? '', /Created/)
    const last = (await readSchedule(page, comp)).find((r) => r.round === 20)!
    assert.equal(last.warnings.length, 0, 'ending exactly at the limit is fine')
    // editing a match into a late round is refused too
    const editHref = await page.$$eval('a', (as) => as.filter((a) => a.textContent?.trim() === 'Edit').map((a) => (a as HTMLAnchorElement).href).pop()!)
    await page.goto(editHref, { waitUntil: 'networkidle0' })
    await submit(page, [['id', null], ['comp', String(comp)], ['court', null]], { round: '22' }, 'Save')
    assert.match((await banner(page)) ?? '', /would end after the time limit/)
  })

  it('warns on a hand-made B + D partnership and shows half a head start for one woman + one man', async () => {
    const pick = async (selects: Record<string, string>, round: string, court: string, event = 'MD') => {
      await go(page, `/admin/c/${comp}/schedule`)
      await page.evaluate((selects, round, court, event) => {
        const f = [...document.forms].find((x) => x.querySelector('[name=comp]') && !x.querySelector('[name=id]') && x.querySelector('[name=a1]')) as HTMLFormElement
        for (const [field, nick] of Object.entries(selects)) {
          const sel = f.querySelector(`[name=${field}]`) as HTMLSelectElement
          const opt = [...sel.options].find((o) => o.text.startsWith(nick + ' '))
          if (!opt) throw new Error('player not in list: ' + nick)
          sel.value = opt.value
        }
        ;(f.querySelector('[name=event]') as HTMLSelectElement).value = event
        ;(f.querySelector('[name=round]') as HTMLInputElement).value = round
        ;(f.querySelector('[name=court]') as HTMLInputElement).value = court
        f.requestSubmit()
      }, selects, round, court, event)
      await page.waitForNavigation({ waitUntil: 'networkidle0' })
    }
    // find one B and one D man for the bad pair, and two other men
    const men = [...people].filter(([, v]) => v.gender === 'M')
    const b = men.find(([, v]) => v.letter === 'B')![0]
    const d = men.find(([, v]) => v.letter === 'D')![0]
    const others = men.filter(([, v]) => v.letter === 'C').slice(0, 2).map(([n]) => n)
    await pick({ a1: b, a2: d, b1: others[0], b2: others[1] }, '14', '1')
    assert.match((await banner(page)) ?? '', /Created/)
    let all = await readSchedule(page, comp)
    const bad = all.find((r) => r.round === 14)!
    assert(bad.warnings.some((w) => /B and D grades are partnered/.test(w)), `B+D warning shown, got ${JSON.stringify(bad.warnings)}`)

    // one woman + one man against two men: half a head start (2 at the same grade)
    const woman = [...people].find(([, v]) => v.gender === 'F' && v.letter === 'C')![0]
    await pick({ a1: woman, a2: others[0], b1: others[1], b2: men.find(([n, v]) => v.letter === 'C' && !others.includes(n) && n !== others[0])![0] }, '15', '1', 'XD')
    all = await readSchedule(page, comp)
    const half = all.find((r) => r.round === 15)!
    assert.equal(half.kind, 'Handicap doubles')
    assert.equal(half.headStart, 'Women start +2')
    assert.equal(half.warnings.length, 0, 'a women-vs-men line-up is not flagged as a mismatch')
  })
  it('the New competition form has an end time (default 14:00), and a draw that ends after it is refused', async () => {
    await go(page, '/admin')
    assert.equal(await page.$eval('#end_time', (e) => (e as HTMLInputElement).value), '14:00', 'End time field on the new-competition form')
    const small = await createCompetition(page, 'End Time Test')
    await go(page, `/admin/c/${small}`)
    assert.equal(await page.$eval('#end_time', (e) => (e as HTMLInputElement).value), '14:00', 'saved with the default')
    await addPlayers(page, small, roster(12, 8))
    // end time 10:00 = 4 rounds of 15 minutes; the draw needs more, so it is refused and nothing is created
    await go(page, `/admin/c/${small}`)
    await submit(page, [['id', String(small)], ['courts', null]], { end_time: '10:00' }, 'Save')
    assert.match((await banner(page)) ?? '', /Saved/)
    await generate(page, small, { hours: 5, seed: 1 })
    assert.match((await banner(page)) ?? '', /does not fit the time limit/)
    assert.match(await page.evaluate(() => document.body.innerText), /No matches yet/)
    // an end time before the start time is rejected
    await go(page, `/admin/c/${small}`)
    await submit(page, [['id', String(small)], ['courts', null]], { end_time: '08:00' }, 'Save')
    assert.match((await banner(page)) ?? '', /Check the form|invalid|Please/i)
    // later end time: the same draw is accepted and ends by it
    await go(page, `/admin/c/${small}`)
    await submit(page, [['id', String(small)], ['courts', null]], { end_time: '12:00' }, 'Save')
    await generate(page, small, { hours: 5, seed: 1 })
    const made = await readSchedule(page, small)
    assert(made.length > 0, 'a draw that fits the end time is created')
    assert(Math.max(...made.map((r) => r.round)) <= 12, 'no round ends after 12:00 (12 rounds from 09:00)')
  })
})
