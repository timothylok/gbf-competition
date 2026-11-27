import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import type { Browser, Page } from 'puppeteer-core'
import { BASE, addPlayers, banner, cards, closeBrowser, createCompetition, fetchHtml, generate, go, launch, listMatches, login, newPage, roster, setScore, setStatus, submit } from './helpers'

/**
 * The game rules end to end, on the real pages: Philippines (-F) vs the rest, same type and same grade
 * (never more than one grade apart), handicap as a fallback, at most 6 games, 5 courts and a 5-hour limit.
 * Own roster (synthetic names, real mix of team, sex and grade), so it does not depend on the other files.
 */

const COURTS = 5
const HOURS = 5
const CAP = 6
const GRADE: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 }

interface Person { gender: 'M' | 'F'; letter: string; grade: number; team: 'F' | 'R' }
const people = new Map<string, Person>()
const lines: string[] = []
// [team, gender, grade letter, count]: Philippines 21 (10 men, 11 women), Rest 25 (17 men, 8 women)
const SPEC: ['F' | 'R', 'M' | 'F', string, number][] = [
  ['F', 'M', 'B', 3], ['F', 'M', 'C', 7], ['F', 'F', 'B', 2], ['F', 'F', 'C', 8], ['F', 'F', 'D', 1],
  ['R', 'M', 'B', 4], ['R', 'M', 'C', 10], ['R', 'M', 'D', 3], ['R', 'F', 'C', 5], ['R', 'F', 'D', 3],
]
const counter: Record<string, number> = {}
for (const [team, gender, letter, count] of SPEC) {
  for (let i = 0; i < count; i++) {
    const k = `${team}${gender}`
    counter[k] = (counter[k] ?? 0) + 1
    const base = `${team === 'F' ? 'P' : 'R'}${gender === 'M' ? 'M' : 'W'}${String(counter[k]).padStart(2, '0')}`
    const name = team === 'F' ? `${base}-F` : base // Philippines nicknames end in -F
    people.set(name, { gender, letter, grade: GRADE[letter], team })
    lines.push(`${name}, ${gender}, ${letter}`)
  }
}
const N = people.size
const WOMEN = [...people.values()].filter((p) => p.gender === 'F').length

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
          names: (spans[2]?.textContent ?? '').trim().split(/\s*\/\s*|\s+vs\s+/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/ - \([A-I]\)$/, '')),
          headStart: spans.map((x) => x.textContent?.trim() ?? '').find((x) => /^Start/.test(x)) ?? null,
          // the cross doubles limit has its own test and its own box, so its chip is not counted with the line-up warnings
          warnings: [...li.querySelectorAll('span[title]')].map((x) => x.getAttribute('title') ?? '').filter((x) => !/more than one cross doubles/i.test(x)),
        }
      })
    }),
  )
}

const p = (name: string) => people.get(name)!
const womenIn = (names: string[]) => names.filter((n) => p(n).gender === 'F').length
/** Independent copy of the starting-score rule (no Upper C in this roster): men B 14, C 6, D 4; women B 6, C 2, D 1. */
function expectedStart(names: string[]): string {
  const w = (n: string) => {
    const x = p(n)
    return x.gender === 'M' ? ({ 2: 14, 3: 6, 4: 4 } as Record<number, number>)[x.grade] : ({ 2: 6, 3: 2, 4: 1 } as Record<number, number>)[x.grade]
  }
  const sa = w(names[0]) + w(names[1])
  const sb = w(names[2]) + w(names[3])
  const pts = Math.ceil(Math.abs(sa - sb) / 2)
  return `Start ${sa < sb ? pts : 0} : ${sb < sa ? pts : 0}`
}
const gamesOf = (rows: Row[]) => {
  const g = new Map<string, number>()
  for (const r of rows) for (const n of r.names) g.set(n, (g.get(n) ?? 0) + 1)
  return g
}
/** The n-th player with this grade, team and gender (so a test can name a clean line-up). */
const pick = (letter: string, team: 'F' | 'R', gender: 'M' | 'F', n = 0) =>
  [...people].filter(([, v]) => v.letter === letter && v.team === team && v.gender === gender)[n][0]

describe(`game rules: Philippines vs the rest, grades, handicap (${N} players, ${COURTS} courts, ${HOURS} hours, ${CAP} games)`, () => {
  let browser: Browser
  let page: Page
  let comp: number
  let rows: Row[]

  /** Fill the "Add match" form with named players and submit. */
  async function addMatchByHand(lineup: Record<string, string>, round: string, court: string, event: string) {
    await go(page, `/admin/c/${comp}/schedule`)
    await page.evaluate((lineup, round, court, event) => {
      const f = [...document.forms].find((x) => x.querySelector('[name=comp]') && !x.querySelector('[name=id]') && x.querySelector('[name=a1]')) as HTMLFormElement
      for (const [field, nick] of Object.entries(lineup)) {
        const sel = f.querySelector(`[name=${field}]`) as HTMLSelectElement
        const opt = [...sel.options].find((o) => o.text.startsWith(nick + ' '))
        if (!opt) throw new Error('player not in list: ' + nick)
        sel.value = opt.value
      }
      ;(f.querySelector('[name=event]') as HTMLSelectElement).value = event
      ;(f.querySelector('[name=round]') as HTMLInputElement).value = round
      ;(f.querySelector('[name=court]') as HTMLInputElement).value = court
      f.requestSubmit()
    }, lineup, round, court, event)
    await page.waitForNavigation({ waitUntil: 'networkidle0' })
  }

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
    assert.equal(grades.length, N, 'every player imported')
    assert.equal([...new Set(grades)].sort().join(''), 'BCD', 'letters shown')
  })

  it('the plan line shows the teams and a quick estimate that fits 5 courts in 5 hours', async () => {
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, new RegExp(`${N} players \\(27 men, ${WOMEN} women; Philippines 21, Rest 25\\)`))
    assert.match(text, /up to 69 matches \(63 \+ 6 same-team filler\)/)
    assert.match(text, /14 rounds/)
    assert.match(text, /estimated finish 12:45/) // 09:00 + 15 min warm-up + 14 rounds
    assert.match(text, /fits the time limit/)
  })

  it('the draw fits the courts and the 5 hours, with no warnings', () => {
    const rounds = Math.max(...rows.map((r) => r.round))
    assert(rounds <= (HOURS * 60 - 15) / 15, `${rounds} rounds must fit ${HOURS} hours after the 15-minute warm-up`)
    assert(rows.length >= 66 && rows.length <= 69, `${rows.length} matches (69 when everyone plays 6)`)
    for (const r of new Set(rows.map((x) => x.round))) {
      const inRound = rows.filter((x) => x.round === r)
      assert(inRound.length <= COURTS, `round ${r}: more matches than courts`)
      assert.deepEqual(inRound.map((x) => x.court).sort((a, b) => a - b), inRound.map((_, i) => i + 1), `round ${r}: courts 1..n, none twice`)
      const names = inRound.flatMap((x) => x.names)
      assert.equal(new Set(names).size, names.length, `round ${r}: a player appears twice`)
    }
    assert.equal(rows.reduce((n, r) => n + r.warnings.length, 0), 0, 'no clash, line-up, grade or team warnings')
  })

  it('nobody plays more than 6 games, and nearly everyone plays all 6', () => {
    const g = gamesOf(rows)
    assert.equal(g.size, N, 'every player is in the draw')
    assert(Math.max(...g.values()) <= CAP, 'at most 6 games')
    assert([...g.values()].filter((x) => x === CAP).length >= N - 2, 'at most 2 players are short of 6')
  })

  it('Philippines (-F) always plays the rest; only the larger team plays same-team filler', () => {
    let sameTeam = 0
    for (const m of rows) {
      const a = m.names.slice(0, 2).map((n) => p(n).team)
      const b = m.names.slice(2).map((n) => p(n).team)
      assert(a[0] === a[1] && b[0] === b[1], `round ${m.round}: a side mixes the teams`)
      if (a[0] === b[0]) {
        sameTeam++
        assert.equal(a[0], 'R', 'the rest (25) is the larger team, so only it plays filler')
      }
    }
    assert(sameTeam > 0 && sameTeam <= 8, `${sameTeam} filler matches`)
  })

  it('same type on both sides, all four players within one grade; women vs men as cross doubles', () => {
    for (const m of rows) {
      const g = m.names.map((n) => p(n).grade)
      assert(Math.max(...g) - Math.min(...g) <= 1, `round ${m.round} court ${m.court}: grades ${m.names.map((n) => p(n).letter)}`)
      const wa = womenIn(m.names.slice(0, 2)), wb = womenIn(m.names.slice(2))
      if (wa === 0 && wb === 0) assert.equal(m.kind, "Men's doubles")
      else if (wa === 1 && wb === 1) assert.equal(m.kind, 'Mixed doubles')
      else if (wa === 2 && wb === 2) assert.equal(m.kind, "Women's doubles")
      else {
        assert(wa === 2 && wb === 0, `round ${m.round}: women (side A) vs men is the only type mix allowed`)
        assert.equal(m.kind, 'Cross doubles')
      }
    }
    assert(rows.some((m) => m.kind === "Women's doubles"), 'women play women')
    assert(rows.some((m) => m.kind === 'Cross doubles'), "the Philippines women (11) outnumber the rest's (8), so some play the rest's men")
  })

  it('every match, of every type, shows the right whole-number starting score', () => {
    for (const m of rows) assert.equal(m.headStart, expectedStart(m.names), m.names.join(' / '))
  })

  it('shows the cross doubles limit (at most one per player) and lists any exceptions', async () => {
    const counts = new Map<string, number>()
    for (const m of rows.filter((r) => r.kind === 'Cross doubles')) for (const n of m.names) counts.set(n, (counts.get(n) ?? 0) + 1)
    const over = [...counts.values()].filter((c) => c > 1).length
    await go(page, `/admin/c/${comp}/schedule`)
    const box = await page.$eval('[data-testid=cross-limit]', (e) => e.textContent ?? '')
    assert.match(box, /Cross doubles limit \(at most one per player\)/)
    const listed = await page.$$eval('[data-testid=cross-exceptions]', (els) => (els[0]?.textContent ?? '').replace(/^\s*Exceptions:\s*/, '').split('; ').filter(Boolean).length)
    assert.equal(listed, over, over === 0 ? 'no exceptions, none listed' : 'every player with more than one is listed')
    if (over === 0) assert.match(box, /everyone is within the limit/)
  })

  it('the Players tab saves "Happy to partner D grade" and the draw still works with it', async () => {
    await go(page, `/admin/c/${comp}/players`)
    await page.evaluate(() => {
      const f = [...document.forms].find((x) => (x.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === 'PM01-F')!
      ;(f.querySelector('[name=d_friendly]') as HTMLInputElement).checked = true
    })
    await submit(page, [['nickname', 'PM01-F']], {}, 'Save')
    assert.match((await banner(page)) ?? '', /Saved/)
    await go(page, `/admin/c/${comp}/players`)
    const checked = await page.evaluate(() => {
      const f = [...document.forms].find((x) => (x.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === 'PM01-F')!
      return (f.querySelector('[name=d_friendly]') as HTMLInputElement).checked
    })
    assert.equal(checked, true, 'flag stays ticked after saving')
    await generate(page, comp, { hours: HOURS, seed: 8 })
    rows = await readSchedule(page, comp)
    assert(rows.length >= 66 && rows.length <= 69)
    assert.equal(rows.reduce((n, r) => n + r.warnings.length, 0), 0)
  })

  it('score entry and the public schedule show the starting score', async () => {
    const handicap = rows.filter((r) => r.kind === 'Cross doubles').length
    assert(handicap > 0)
    await go(page, `/admin/c/${comp}/scores`)
    const scoreText = await page.evaluate(() => document.body.innerText)
    assert.match(scoreText, /Start \d+ : \d+ \(Side A : Side B\)/)
    assert.match(scoreText, /cross doubles/i) // the score screen shows labels in capitals
    await setStatus(page, comp, 'live')
    const html = (await fetchHtml(`/schedule?c=${comp}`)).html
    const handicapCards = cards(html).filter((c) => /Cross doubles/.test(c))
    assert.equal(handicapCards.length, handicap)
    assert(cards(html).every((c) => /Start \d+ : \d+/.test(c)), 'every public card shows its starting score')
    assert(cards(html).some((c) => /Women's doubles/.test(c)), "women's doubles cards are labelled")
  })

  it('every portal page shows grades after the nickname, like the PDF', async () => {
    const GRADED = /\b([PR][MW]\d\d(?:-F)?) - \(([A-D])\)/g
    const NAMES = /\b[PR][MW]\d\d(?:-F)?\b/g
    // Visible text only: Next.js streams page data in <script> chunks that can split a nickname from its grade.
    const check = (raw: string, label: string) => {
      const html = raw.replace(/<script[\s\S]*?<\/script>/g, '')
      const graded = [...html.matchAll(GRADED)]
      assert(graded.length > 0, `${label}: no graded names`)
      const bare = [...html.matchAll(NAMES)].filter((m) => !html.slice(m.index! + m[0].length).startsWith(' - ('))
      assert.equal(bare.length, 0, `${label}: a nickname without its grade: ${bare.slice(0, 3).map((m) => html.slice(Math.max(0, m.index! - 60), m.index! + 40)).join(' || ')}`)
      for (const [, name, letter] of graded) assert.equal(letter, p(name).letter, `${label}: ${name} shown with grade ${letter}`)
    }
    // one finished match so the standings have rows
    const first = (await listMatches(page, comp)).find((m) => m.status === 'Scheduled')!
    await setScore(page, comp, first.id, 'done', '15', '10')

    check((await fetchHtml(`/?c=${comp}`)).html, 'Live page')
    const sched = (await fetchHtml(`/schedule?c=${comp}`)).html
    check(sched, 'Schedule page (cards and the player filter)')
    check((await fetchHtml(`/standings?c=${comp}`)).html, 'Standings page')
    const playerId = sched.match(/href="\/players\/(\d+)\?c=/)![1]
    const player = (await fetchHtml(`/players/${playerId}?c=${comp}`)).html
    check(player, 'Player page')
    assert.match(player.match(/<h1[^>]*>([^<]*)<\/h1>/)![1], /^[PR][MW]\d\d(-F)? - \([A-D]\)$/, 'player page heading')

    // admin pages (signed in): the match lines show them too
    await go(page, `/admin/c/${comp}/scores`)
    const scoreNames = await page.$$eval('p.flex-1', (els) => els.flatMap((e) => (e as HTMLElement).innerText.split('\n').map((x) => x.trim()).filter(Boolean)))
    assert(scoreNames.length > 0 && scoreNames.every((n) => /^[PR][MW]\d\d(-F)? - \([A-D]\)$/.test(n)), 'score entry cards show grades')
    await go(page, `/admin/c/${comp}/schedule`)
    const schedNames = await page.$$eval('li > span.flex-1', (els) => els.map((e) => e.textContent ?? ''))
    assert(schedNames.length > 0 && schedNames.every((t) => t.split(/ \/ | vs /).every((n) => /^[PR][MW]\d\d(-F)? - \([A-D]\)$/.test(n.trim()))), 'admin schedule shows grades')
  })

  it('the admin pages show when the competition ends, and no match ends after start + 5 hours', async () => {
    const rounds = Math.max(...rows.map((r) => r.round))
    const total = 9 * 60 + 15 + rounds * 15 // 15-minute warm-up first
    const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    assert(total <= 9 * 60 + HOURS * 60, `last match ends ${end}, after the ${HOURS}-hour limit (14:00)`)
    await go(page, `/admin/c/${comp}`)
    assert.match(await page.$eval('[data-testid=comp-times]', (e) => e.textContent ?? ''), new RegExp(`Starts 09:00 · End time 14:00 · Competition ends ${end} · ${rounds} rounds`))
    await go(page, `/admin/c/${comp}/schedule`)
    const text = await page.evaluate(() => document.body.innerText)
    assert.match(text, new RegExp(`Competition ends ${end}`))
    assert.match(text, /Round 1 · 09:15–09:30 \(15 min\)/i) // headings are shown in capitals
    assert.match(await page.$eval('[data-testid=warmup]', (e) => e.textContent ?? ''), /Warm-up 09:00–09:15 · all courts, no matches/)
  })

  it('refuses a hand-made or edited match that would end after the time limit', async () => {
    const lineup = { a1: pick('C', 'F', 'M', 1), a2: pick('C', 'F', 'M', 2), b1: pick('C', 'R', 'M', 1), b2: pick('C', 'R', 'M', 2) }
    const before = (await readSchedule(page, comp)).length
    await addMatchByHand(lineup, '20', '1', 'MD') // round 20 = 14:00-14:15, after the 14:00 limit
    assert.match((await banner(page)) ?? '', /would end after the time limit/)
    assert.equal((await readSchedule(page, comp)).length, before, 'nothing was created')
    await addMatchByHand(lineup, '19', '1', 'MD') // round 19 = 13:45-14:00, ends exactly at the limit
    assert.match((await banner(page)) ?? '', /Created/)
    const last = (await readSchedule(page, comp)).find((r) => r.round === 19)!
    assert.equal(last.warnings.length, 0, 'ending exactly at the limit is fine, and a clean cross-team C-grade match has no warning')
    // editing a match into a late round is refused too
    const editHref = await page.$$eval('a', (as) => as.filter((a) => a.textContent?.trim() === 'Edit').map((a) => (a as HTMLAnchorElement).href).pop()!)
    await page.goto(editHref, { waitUntil: 'networkidle0' })
    await submit(page, [['id', null], ['comp', String(comp)], ['court', null]], { round: '22' }, 'Save')
    assert.match((await banner(page)) ?? '', /would end after the time limit/)
  })

  it('warns on a hand-made match with grades two apart or Philippines vs Philippines, and gives a mixed-vs-men line-up its starting score', async () => {
    /** A free court and round (nobody in the line-up playing, the court empty), so only the warnings under test can appear. */
    const handMade = async (lineup: Record<string, string>, event: string) => {
      const names = Object.values(lineup)
      const rows = await readSchedule(page, comp)
      for (let round = 1; round <= 19; round++) {
        const inRound = rows.filter((r) => r.round === round)
        if (inRound.some((r) => r.names.some((n) => names.includes(n)))) continue
        for (let court = 1; court <= COURTS; court++) {
          if (inRound.some((r) => r.court === court)) continue
          await addMatchByHand(lineup, String(round), String(court), event)
          assert.match((await banner(page)) ?? '', /Created/)
          return (await readSchedule(page, comp)).find((r) => r.round === round && r.court === court)!
        }
      }
      throw new Error('no free court and round for the hand-made match')
    }
    // B and D together: more than one grade apart
    const far = await handMade({ a1: pick('B', 'F', 'M', 0), a2: pick('C', 'F', 'M', 3), b1: pick('D', 'R', 'M', 0), b2: pick('C', 'R', 'M', 3) }, 'MD')
    assert(far.warnings.some((w) => /more than one grade apart/.test(w)), `grade warning, got ${JSON.stringify(far.warnings)}`)
    // Philippines vs Philippines: the rest is the larger team, so this is not an allowed filler
    const same = await handMade({ a1: pick('C', 'F', 'M', 4), a2: pick('C', 'F', 'M', 5), b1: pick('C', 'F', 'M', 6), b2: pick('B', 'F', 'M', 1) }, 'MD')
    assert(same.warnings.some((w) => /Philippines/.test(w)), `team warning, got ${JSON.stringify(same.warnings)}`)
    // one woman + one man against two men (all C): 8 vs 12, so the mixed side starts 2 : 0, no warnings
    const half = await handMade({ a1: pick('C', 'F', 'F', 0), a2: pick('C', 'F', 'M', 6), b1: pick('C', 'R', 'M', 4), b2: pick('C', 'R', 'M', 5) }, 'XD')
    assert.equal(half.kind, 'Cross doubles')
    assert.equal(half.headStart, 'Start 2 : 0')
    assert.equal(half.warnings.length, 0, 'a women-vs-men line-up is not flagged')
  })

  it('records when the schedule was generated, shows it in New Zealand time, and the PDF downloads', async () => {
    await go(page, `/admin/c/${comp}/schedule`)
    const first = await page.$eval('[data-testid=generated-at]', (e) => e.textContent ?? '')
    assert.match(first, /^Schedule generated: \d{1,2} \w{3} \d{4}, \d\d:\d\d NZ(DT|ST)$/)
    const pdf = await fetch(`${BASE}/schedule/pdf?c=${comp}`)
    assert.equal(pdf.status, 200)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    assert((await pdf.arrayBuffer()).byteLength > 5000)
  })

  it('the Copy text tab gives a plain-text schedule grouped by court or by time, sorted by time', async () => {
    const total = (await readSchedule(page, comp)).length // includes the hand-made matches from the tests above
    await go(page, `/admin/c/${comp}/text`)
    const byCourt = await page.$eval('[data-testid=schedule-text]', (e) => (e as HTMLTextAreaElement).value)
    assert.match(byCourt, /^Rules Test · /)
    assert.equal(byCourt.split('\n').filter((l) => / vs /.test(l)).length, total, 'every match appears once')
    assert.equal(byCourt.split('\n').filter((l) => /^Court \d+ \(\d+ matches\)$/.test(l)).length, COURTS, 'one group per court')
    for (const group of byCourt.split('\n\n').slice(1)) {
      const times = group.split('\n').slice(1).map((l) => l.slice(0, 11))
      assert.deepEqual([...times].sort(), times, 'each court is sorted by time')
    }
    assert.match(byCourt, /Cross doubles: .* \[Start \d+ : \d+\]/)
    await go(page, `/admin/c/${comp}/text?by=time`)
    const byTime = await page.$eval('[data-testid=schedule-text]', (e) => (e as HTMLTextAreaElement).value)
    assert.equal(byTime.split('\n').filter((l) => / vs /.test(l)).length, total)
    const heads = byTime.split('\n').filter((l) => /^\d\d:\d\d–\d\d:\d\d · Round/.test(l)).map((l) => l.slice(0, 11))
    assert.deepEqual([...heads].sort(), heads, 'groups are in time order')
    assert.match(byTime, /^09:00–09:15 · Warm-up \(all courts, no matches\)/m)
    assert.match(byTime, /^09:15–09:30 · Round 1 \(5 matches\)/m)
    assert.equal(byCourt.split('\n').filter((l) => /^09:00–09:15  Warm-up$/.test(l)).length, COURTS, 'every court starts with the warm-up')
    if (process.env.E2E_DUMP_TEXT) writeFileSync(process.env.E2E_DUMP_TEXT, `${byCourt}\n\n=====\n\n${byTime}`)
  })

  it('the Print schedule button opens a PDF: valid, one court per page, small, in both languages; the old printout link redirects to it', async () => {
    const sched = (await fetchHtml(`/schedule?c=${comp}`)).html
    assert.match(sched, new RegExp(`href="/schedule/pdf\\?c=${comp}"`), 'public schedule has the Print schedule (PDF) button')

    const res = await fetch(`${BASE}/schedule/pdf?c=${comp}`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/pdf')
    assert.match(res.headers.get('content-disposition') ?? '', /^inline; filename="GBF-schedule-\d{4}-\d\d-\d\d\.pdf"; filename\*=UTF-8''/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const bytes = new Uint8Array(await res.arrayBuffer())
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
    assert(bytes.length > 5_000 && bytes.length < 400_000, `${bytes.length} bytes: a schedule PDF is small, not a whole font`)
    const pdf = await PDFDocument.load(bytes)
    assert(pdf.getPageCount() >= COURTS, `at least one page per court, got ${pdf.getPageCount()}`)
    assert.match(pdf.getTitle() ?? '', /^Rules Test · /)
    if (process.env.E2E_DUMP_PDF) writeFileSync(process.env.E2E_DUMP_PDF, bytes)

    const byTime = await fetch(`${BASE}/schedule/pdf?c=${comp}&by=time`)
    assert.equal(byTime.status, 200)
    assert((await PDFDocument.load(new Uint8Array(await byTime.arrayBuffer()))).getPageCount() >= 1, 'the by-time PDF loads')

    // the old plain-HTML printout address now redirects to the PDF
    const old = await fetchHtml(`/schedule/print?c=${comp}&by=court`)
    assert([307, 308].includes(old.status), `redirect, got ${old.status}`)
    assert.match(old.location ?? '', new RegExp(`/schedule/pdf\\?c=${comp}&by=court`))

    // Hong Kong Chinese version: still a valid PDF
    const zh = await fetch(`${BASE}/schedule/pdf?c=${comp}`, { headers: { cookie: 'lang=zh' } })
    assert.equal(zh.status, 200)
    assert.equal(Buffer.from(new Uint8Array(await zh.arrayBuffer()).slice(0, 5)).toString(), '%PDF-')

    // an unknown competition is a 404, not an error page
    assert.equal((await fetch(`${BASE}/schedule/pdf?c=999999`)).status, 404)

    // the admin Copy text page keeps the "nickname - (G)" pattern, and links to the PDF
    await go(page, `/admin/c/${comp}/text`)
    const text = await page.$eval('[data-testid=schedule-text]', (e) => (e as HTMLTextAreaElement).value)
    assert.match(text, /[PR][MW]\d\d(-F)? - \([A-D]\) \/ [PR][MW]\d\d(-F)? - \([A-D]\) vs /)
    assert.match(await page.$eval('a[href^="/schedule/pdf"]', (a) => a.getAttribute('href') ?? ''), new RegExp(`^/schedule/pdf\\?c=${comp}&by=court$`))
  })

  it('the Print team list (image) button sits next to Print schedule and saves a PNG with the New Zealand print time; a draft is not public', async () => {
    for (const path of [`/?c=${comp}`, `/schedule?c=${comp}`]) {
      await go(page, path)
      const order = await page.$$eval('[data-testid=print-link], [data-testid=teams-link]', (els) => els.map((e) => e.getAttribute('data-testid')))
      assert.deepEqual(order, ['print-link', 'teams-link'], `both buttons together on ${path}`)
      const same = await page.$eval('[data-testid=teams-link]', (e) => e.parentElement === document.querySelector('[data-testid=print-link]')!.parentElement)
      assert(same, 'in the same row as Print schedule')
    }

    await go(page, `/?c=${comp}`)
    // the drawing itself: 1600 px wide, a real PNG, with both teams on it
    const info = await page.evaluate(async () => {
      const btn = document.querySelector('[data-testid=teams-link]') as HTMLButtonElement
      let saved: Blob | null = null // the page's CSP blocks fetch() of blob: URLs, so keep the Blob itself
      const orig = URL.createObjectURL
      URL.createObjectURL = (o: Blob | MediaSource) => { saved = o as Blob; return orig(o) }
      HTMLAnchorElement.prototype.click = function () { (window as unknown as { __dl: { name: string; href: string } }).__dl = { name: this.download, href: this.href } }
      btn.click()
      for (let i = 0; i < 50 && !(window as unknown as { __dl?: unknown }).__dl; i++) await new Promise((r) => setTimeout(r, 100))
      const dl = (window as unknown as { __dl?: { name: string; href: string } }).__dl
      if (!dl) return null
      const blob = saved as Blob | null
      if (!blob) return null
      const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer())
      const all = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < all.length; i += 8192) bin += String.fromCharCode(...all.subarray(i, i + 8192))
      const b64 = btoa(bin)
      return { name: dl.name, type: blob.type, size: blob.size, head: [...head], b64 }
    })
    assert(info, 'clicking the button saves a file')
    assert.match(info.name, /^GBF-teams-\d{4}-\d\d-\d\d\.png$/)
    assert.equal(info.type, 'image/png')
    assert.equal(String.fromCharCode(...info.head.slice(1, 4)), 'PNG')
    const dv = new DataView(new Uint8Array(info.head).buffer)
    assert.equal(dv.getUint32(16), 1600, 'width')
    assert(dv.getUint32(20) > 700 && dv.getUint32(20) < 3000, `height ${dv.getUint32(20)}`)
    assert(info.size > 20_000, `${info.size} bytes`)
    if (process.env.E2E_DUMP_TEAMS) writeFileSync(process.env.E2E_DUMP_TEAMS, Buffer.from(info.b64, 'base64'))

    // a draft competition's pages (and so its button) are for admins only
    await setStatus(page, comp, 'draft')
    assert.doesNotMatch((await fetchHtml(`/?c=${comp}`)).html, /data-testid="teams-link"/, 'logged out, a draft shows nothing')
    await setStatus(page, comp, 'finished')
  })

  it('the public Live page has a Print schedule (PDF) button whatever the competition status; a draft PDF is for admins only', async () => {
    for (const status of ['live', 'finished', 'draft'] as const) {
      await setStatus(page, comp, status)
      await go(page, `/?c=${comp}`) // signed in as admin, so a draft is visible too
      const href = await page.$eval('[data-testid=print-link]', (a) => (a as HTMLAnchorElement).getAttribute('href'))
      assert.equal(href, `/schedule/pdf?c=${comp}`, `Print button on the Live page while ${status}`)
      const loggedOut = await fetch(`${BASE}/schedule/pdf?c=${comp}`)
      assert.equal(loggedOut.status, status === 'draft' ? 404 : 200, `the PDF for a ${status} competition, logged out`)
      await loggedOut.arrayBuffer()
    }
    await setStatus(page, comp, 'finished')
    const html = (await fetchHtml(`/?c=${comp}`)).html
    assert.match(html, /data-testid="print-link"/, 'a logged-out visitor sees it on a finished competition')
  })

  it('the New competition form has an end time, and a tight end time gives fewer games instead of a late finish', async () => {
    await go(page, '/admin')
    assert.equal(await page.$eval('#end_time', (e) => (e as HTMLInputElement).value), '14:00', 'End time field on the new-competition form')
    const small = await createCompetition(page, 'End Time Test')
    await go(page, `/admin/c/${small}`)
    assert.equal(await page.$eval('#end_time', (e) => (e as HTMLInputElement).value), '14:00', 'saved with the default')
    await addPlayers(page, small, roster(12, 8))
    const setEnd = async (end: string) => {
      await go(page, `/admin/c/${small}`)
      await submit(page, [['id', String(small)], ['courts', null]], { end_time: end }, 'Save')
    }
    // end time 10:00 = 15 minutes warm-up + 3 rounds of 15 minutes: the draw stops there and some players get fewer games
    await setEnd('10:00')
    assert.match((await banner(page)) ?? '', /Saved/)
    await generate(page, small, { hours: 5, seed: 1 })
    assert.match((await banner(page)) ?? '', /fewer games than planned/)
    const tight = await readSchedule(page, small)
    assert(tight.length > 0 && Math.max(...tight.map((r) => r.round)) <= 3, 'no round ends after 10:00')
    // an end time before the start time is rejected
    await setEnd('08:00')
    assert.match((await banner(page)) ?? '', /invalid/i)
    // later end time: more rounds, still inside it
    await setEnd('12:00')
    await generate(page, small, { hours: 5, seed: 1 })
    const made = await readSchedule(page, small)
    assert(made.length > tight.length, 'a later end time allows more matches')
    assert(Math.max(...made.map((r) => r.round)) <= 11, 'no round ends after 12:00 (11 rounds after the warm-up)')
  })
  it('pairing rules: saved per competition, bad lines are reported, the draw obeys them, hand-made matches are warned', async () => {
    const c = await createCompetition(page, 'Pairing Rules Test')
    await addPlayers(page, c, lines.join('\n'))
    const saveRules = async (text: string) => {
      await go(page, `/admin/c/${c}`)
      await submit(page, [['id', String(c)], ['courts', null]], { pairing_rules: text }, 'Save')
    }

    // bad lines are saved but reported with their line numbers, and generating is refused
    await saveRules('avoid: PW01-F\nnonsense here')
    assert.match((await banner(page)) ?? '', /Saved/)
    await go(page, `/admin/c/${c}`)
    const problems = await page.$eval('[data-testid=rule-problems]', (e) => e.textContent ?? '')
    assert.match(problems, /line 1: Write avoid: <who> \| <who>/)
    assert.match(problems, /line 2: A rule starts with "avoid:", "pair:", "upper:", "available:" or "prefer:"/)
    await generate(page, c, { hours: HOURS, seed: 5 })
    assert.match((await banner(page)) ?? '', /pairing rules have problems/)
    assert.match(await page.evaluate(() => document.body.innerText), /No matches yet/)

    // a name that matches nobody is only a warning
    await saveRules('avoid: Nobody-Here | grade:B & team:F')
    await go(page, `/admin/c/${c}`)
    assert.match(await page.$eval('[data-testid=rule-warnings]', (e) => e.textContent ?? ''), /No player matches "Nobody-Here"/)

    // real rules, written with made-up names like the real ones
    const RULES = [
      '# the Philippines D woman does not partner Philippines B players',
      'avoid: grade:D & team:F | grade:B & team:F',
      'avoid: grade:D & team:F | PM04, PM05',
      'avoid: PW03, PM06 | grade:B & team:F',
      'pair: PW05 & team:F + PM01 & team:F',
    ].join('\n')
    await saveRules(RULES)
    await go(page, `/admin/c/${c}`)
    assert.equal(await page.$eval('#pairing_rules', (e) => (e as HTMLTextAreaElement).value), RULES, 'rules are saved as typed')
    assert.equal(await page.$('[data-testid=rule-problems]'), null)
    await generate(page, c, { hours: HOURS, seed: 5 })
    const made = await readSchedule(page, c)
    assert(made.length >= 66 && made.length <= 69, `${made.length} matches`)

    const grade = (n: string) => p(n).grade
    const philippines = (n: string) => p(n).team === 'F'
    const isB = (n: string) => philippines(n) && grade(n) === 2
    const isD = (n: string) => philippines(n) && grade(n) === 4
    const named = (n: string, ...list: string[]) => list.includes(n.replace(/-F$/, ''))
    for (const m of made) {
      for (const [x, y] of [[m.names[0], m.names[1]], [m.names[2], m.names[3]]]) {
        const bad =
          (isD(x) && isB(y)) || (isB(x) && isD(y)) ||
          (isD(x) && named(y, 'PM04', 'PM05')) || (isD(y) && named(x, 'PM04', 'PM05')) ||
          (named(x, 'PW03', 'PM06') && isB(y)) || (named(y, 'PW03', 'PM06') && isB(x))
        assert(!bad, `round ${m.round}: ${x} and ${y} partner each other, against a rule`)
      }
    }
    const together = made.filter((m) => [[m.names[0], m.names[1]], [m.names[2], m.names[3]]].some(([x, y]) => [x, y].sort().join() === ['PM01-F', 'PW05-F'].sort().join()))
    assert(together.length >= 1, 'PW05 and PM01 partner at least once')
    assert(together.every((m) => m.kind === 'Mixed doubles'), 'a man and a woman partnering play mixed doubles')
    assert.equal(made.reduce((n, r) => n + r.warnings.length, 0), 0, 'a draw that follows the rules has no warnings')
    const games = gamesOf(made)
    assert([...games.values()].filter((g) => g >= 5).length >= N - 2 && Math.max(...games.values()) <= CAP, 'nearly everyone still has their games')

    // the Schedule tab shows the rules and whether the required pair is scheduled, from the saved matches
    await go(page, `/admin/c/${c}/schedule`)
    const status = await page.$eval('[data-testid=rules-status]', (e) => e.textContent ?? '')
    assert.match(status, /Pairing rules: \d+ avoid rules covering pairs/)
    assert.match(status, /✓ PW05-F - \(C\) \+ PM01-F - \(B\)/)

    // a hand-made match that breaks a rule gets an amber warning (PW03 partnering a B player)
    await go(page, `/admin/c/${c}/schedule`)
    await page.evaluate((lineup) => {
      const f = [...document.forms].find((x) => x.querySelector('[name=comp]') && !x.querySelector('[name=id]') && x.querySelector('[name=a1]')) as HTMLFormElement
      for (const [field, nick] of Object.entries(lineup)) {
        const sel = f.querySelector(`[name=${field}]`) as HTMLSelectElement
        sel.value = [...sel.options].find((o) => o.text.startsWith(nick + ' '))!.value
      }
      ;(f.querySelector('[name=event]') as HTMLSelectElement).value = 'XD'
      ;(f.querySelector('[name=round]') as HTMLInputElement).value = '18'
      ;(f.querySelector('[name=court]') as HTMLInputElement).value = '1'
      f.requestSubmit()
    }, { a1: 'PW03-F', a2: 'PM01-F', b1: 'RM05', b2: 'RW01' })
    await page.waitForNavigation({ waitUntil: 'networkidle0' })
    assert.match((await banner(page)) ?? '', /Created/)
    const hand = (await readSchedule(page, c)).find((r) => r.round === 18)!
    assert(hand.warnings.some((w) => /Breaks a pairing rule/.test(w)), `rule warning, got ${JSON.stringify(hand.warnings)}`)
  })
})
