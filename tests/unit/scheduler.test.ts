import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generatePlan, planCounts, roundsNeeded, type SchedPlayer } from '../../lib/scheduler'

function roster(men: number, women: number, graded = false): SchedPlayer[] {
  const ps: SchedPlayer[] = []
  for (let i = 0; i < men; i++) ps.push({ id: i + 1, gender: 'M', grade: graded ? (i % 3) + 1 : null })
  for (let i = 0; i < women; i++) ps.push({ id: men + i + 1, gender: 'F', grade: graded ? (i % 3) + 1 : null })
  return ps
}

const T = { mdGames: 4, xdGames: 4 }
const COURTS = 5
const WINDOW_ROUNDS = 20 // 5 hours of 15-minute rounds

describe('planCounts: men\'s doubles first, mixed second', () => {
  it('gives every man his men\'s doubles games and every woman her mixed games', () => {
    assert.deepEqual(planCounts(44, 20, T), { md: 44, xd: 40 })
    assert.deepEqual(planCounts(50, 14, T), { md: 50, xd: 28 })
    assert.deepEqual(planCounts(40, 24, T), { md: 40, xd: 48 })
    assert.deepEqual(planCounts(32, 32, T), { md: 32, xd: 64 })
  })
  it('handles one-sided and tiny pools', () => {
    assert.deepEqual(planCounts(64, 0, T), { md: 64, xd: 0 }, 'no women: men\'s doubles only')
    assert.deepEqual(planCounts(3, 10, T), { md: 0, xd: 20 }, 'fewer than 4 men: no men\'s doubles')
    assert.deepEqual(planCounts(10, 1, T), { md: 10, xd: 0 }, 'one woman cannot make a mixed match')
    assert.deepEqual(planCounts(0, 0, T), { md: 0, xd: 0 })
  })
  it('honours different targets per event', () => {
    assert.deepEqual(planCounts(40, 20, { mdGames: 3, xdGames: 2 }), { md: 30, xd: 20 })
  })
  it('computes the rounds needed for the courts', () => {
    assert.equal(roundsNeeded(84, 5), 17)
    assert.equal(roundsNeeded(80, 5), 16)
    assert.equal(roundsNeeded(1, 5), 1)
  })
})

const CASES: [number, number, boolean][] = [
  [50, 14, false], [44, 20, true], [40, 24, false], [32, 32, false], [60, 10, true],
  [45, 17, false], [64, 0, false], [30, 3, false], [8, 6, false], [6, 0, false],
]

describe('generatePlan invariants', () => {
  for (const [men, women, graded] of CASES) {
    it(`${men} men / ${women} women${graded ? ' (graded)' : ''}`, () => {
      const players = roster(men, women, graded)
      const gender = new Map(players.map((p) => [p.id, p.gender]))
      const plan = generatePlan(players, COURTS, T, 1)
      const expected = planCounts(men, women, T)

      assert.equal(plan.matches.length, expected.md + expected.xd, 'every planned match is placed')
      assert.equal(plan.matches.filter((m) => m.event === 'MD').length, expected.md)

      const inRound = new Map<number, Set<number>>()
      const courts = new Set<string>()
      for (const m of plan.matches) {
        const ids = [m.a1, m.a2, m.b1, m.b2]
        assert.equal(new Set(ids).size, 4, 'four different players in a match')
        const seen = inRound.get(m.round) ?? new Set<number>()
        for (const id of ids) {
          assert(!seen.has(id), `player ${id} plays twice in round ${m.round}`)
          seen.add(id)
        }
        inRound.set(m.round, seen)
        assert(m.court >= 1 && m.court <= COURTS, 'court within range')
        assert(!courts.has(`${m.round}-${m.court}`), 'no two matches on one court in a round')
        courts.add(`${m.round}-${m.court}`)
        if (m.event === 'MD') assert(ids.every((i) => gender.get(i) === 'M'), 'men\'s doubles is all men')
        else {
          assert.notEqual(gender.get(m.a1), gender.get(m.a2), 'mixed side A has one of each')
          assert.notEqual(gender.get(m.b1), gender.get(m.b2), 'mixed side B has one of each')
        }
      }

      const menIds = players.filter((p) => p.gender === 'M').map((p) => p.id)
      const womenIds = players.filter((p) => p.gender === 'F').map((p) => p.id)
      if (men >= 4) {
        const minMD = Math.min(...menIds.map((i) => plan.mdGamesPerPlayer.get(i)!))
        assert(minMD >= Math.floor((expected.md * 4) / men), 'every man gets his men\'s doubles games')
      }
      if (women >= 2 && men >= 2) {
        const minW = Math.min(...womenIds.map((i) => plan.gamesPerPlayer.get(i)!))
        assert(minW >= Math.floor((expected.xd * 2) / women), 'every woman gets her mixed games')
      }
      if (men > 0 && expected.xd > 0) {
        const g = menIds.map((i) => plan.gamesPerPlayer.get(i)!)
        assert(Math.max(...g) - Math.min(...g) <= 2, 'extra mixed games are spread within 2 games across men')
      }
      if (players.length >= 24) assert.equal(plan.rounds, roundsNeeded(plan.matches.length, COURTS), 'courts are filled each round')
    })
  }
})

describe('generatePlan quality', () => {
  it('never repeats a partner in realistic event sizes', () => {
    for (const [men, women] of [[50, 14], [44, 20], [40, 24]]) {
      const plan = generatePlan(roster(men, women), COURTS, T, 3)
      const seen = new Set<string>()
      for (const m of plan.matches) {
        for (const [x, y] of [[m.a1, m.a2], [m.b1, m.b2]]) {
          const k = `${Math.min(x, y)}-${Math.max(x, y)}`
          assert(!seen.has(k), `partners ${k} repeat (${men}M/${women}F)`)
          seen.add(k)
        }
      }
    }
  })
  it('fits the 5-hour window at 4 games each for typical sizes', () => {
    for (const [men, women] of [[50, 14], [44, 20], [40, 24], [32, 32]]) {
      assert(generatePlan(roster(men, women), COURTS, T, 1).rounds <= WINDOW_ROUNDS, `${men}M/${women}F exceeds 5 hours`)
    }
  })
  it('puts men\'s doubles on the lower court numbers in every round', () => {
    const plan = generatePlan(roster(44, 20), COURTS, T, 1)
    const rounds = [...new Set(plan.matches.map((m) => m.round))]
    for (const r of rounds) {
      const ms = plan.matches.filter((m) => m.round === r).sort((a, b) => a.court - b.court)
      const firstXD = ms.findIndex((m) => m.event === 'XD')
      if (firstXD >= 0) assert(ms.slice(firstXD).every((m) => m.event === 'XD'), `round ${r}: an MD match is after an XD match`)
    }
  })
  it('is reproducible from the seed and changes with a different seed', () => {
    const a = generatePlan(roster(44, 20), COURTS, T, 7)
    const b = generatePlan(roster(44, 20), COURTS, T, 7)
    const c = generatePlan(roster(44, 20), COURTS, T, 8)
    assert.deepEqual(a.matches, b.matches)
    assert.notDeepEqual(a.matches, c.matches)
  })
  it('balances sides by grade better than chance', () => {
    const players = roster(44, 20, true)
    const grade = new Map(players.map((p) => [p.id, p.grade ?? 0]))
    const plan = generatePlan(players, COURTS, T, 1)
    const diffs = plan.matches.map((m) => Math.abs(grade.get(m.a1)! + grade.get(m.a2)! - (grade.get(m.b1)! + grade.get(m.b2)!)))
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
    assert(avg < 1.5, `average grade gap between sides is ${avg.toFixed(2)}`)
  })
})
