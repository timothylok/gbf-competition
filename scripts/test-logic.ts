import assert from 'node:assert'
import { generatePlan, planCounts, roundsNeeded, type SchedPlayer } from '../lib/scheduler'
import { standings } from '../lib/standings'
import { roundTime } from '../lib/time'
import type { Match, Player } from '../lib/types'

function mk(men: number, women: number, graded = false): SchedPlayer[] {
  const ps: SchedPlayer[] = []
  for (let i = 0; i < men; i++) ps.push({ id: i + 1, gender: 'M', grade: graded ? (i % 3) + 1 : null })
  for (let i = 0; i < women; i++) ps.push({ id: men + i + 1, gender: 'F', grade: graded ? (i % 3) + 1 : null })
  return ps
}

const T = { mdGames: 4, xdGames: 4 }
const WINDOW_ROUNDS = 20 // 5 hours at 15 minutes

const cases: [number, number, boolean][] = [
  [50, 14, false], [44, 20, true], [40, 24, false], [32, 32, false], [60, 10, true],
  [45, 17, false], [64, 0, false], [30, 3, false], [8, 6, false], [6, 0, false],
]
for (const [men, women, graded] of cases) {
  const players = mk(men, women, graded)
  const plan = generatePlan(players, 5, T, 1)
  const byId = new Map(players.map((p) => [p.id, p]))
  const expected = planCounts(men, women, T)
  assert.strictEqual(plan.matches.length, expected.md + expected.xd, 'all planned matches placed')
  assert.strictEqual(plan.matches.filter((m) => m.event === 'MD').length, expected.md)

  const roundSeen = new Map<number, Set<number>>()
  const courtSeen = new Set<string>()
  const partners = new Map<string, number>()
  let backToBack = 0
  const lastRound = new Map<number, number>()

  for (const m of plan.matches) {
    const ids = [m.a1, m.a2, m.b1, m.b2]
    assert.strictEqual(new Set(ids).size, 4, 'distinct players in match')
    const seen = roundSeen.get(m.round) ?? new Set()
    for (const id of ids) {
      assert(!seen.has(id), `player ${id} twice in round ${m.round}`)
      seen.add(id)
      if (lastRound.get(id) === m.round - 1) backToBack++
      lastRound.set(id, m.round)
    }
    roundSeen.set(m.round, seen)
    assert(m.court >= 1 && m.court <= 5, 'court range')
    const ck = `${m.round}-${m.court}`
    assert(!courtSeen.has(ck), 'court clash')
    courtSeen.add(ck)
    if (m.event === 'MD') assert(ids.every((i) => byId.get(i)!.gender === 'M'), 'MD all men')
    else {
      assert.notStrictEqual(byId.get(m.a1)!.gender, byId.get(m.a2)!.gender, 'XD side A mixed')
      assert.notStrictEqual(byId.get(m.b1)!.gender, byId.get(m.b2)!.gender, 'XD side B mixed')
    }
    for (const k of [[m.a1, m.a2], [m.b1, m.b2]].map(([x, y]) => `${Math.min(x, y)}-${Math.max(x, y)}`)) partners.set(k, (partners.get(k) ?? 0) + 1)
  }

  const menIds = players.filter((p) => p.gender === 'M').map((p) => p.id)
  const womenIds = players.filter((p) => p.gender === 'F').map((p) => p.id)
  const menGames = menIds.map((i) => plan.gamesPerPlayer.get(i)!)
  const womenGames = womenIds.map((i) => plan.gamesPerPlayer.get(i)!)
  const menMD = menIds.map((i) => plan.mdGamesPerPlayer.get(i)!)
  const range = (a: number[]) => (a.length ? `${Math.min(...a)}-${Math.max(...a)}` : '-')
  const repeatPartners = [...partners.values()].filter((v) => v > 1).length

  // Men's doubles first: everyone gets the full men's doubles quota (or one fewer if 4 doesn't divide evenly).
  if (men >= 4) assert(Math.min(...menMD) >= Math.floor((expected.md * 4) / men), "every man gets his men's doubles games")
  // Extra mixed games are spread evenly across men.
  if (men > 0 && expected.xd > 0) assert(Math.max(...menGames) - Math.min(...menGames) <= 2, 'men totals within 2 games')
  if (women >= 2 && men >= 2) assert(Math.min(...womenGames) >= Math.floor((expected.xd * 2) / women), 'every woman gets her mixed games')
  if (players.length >= 24) assert.strictEqual(plan.rounds, roundsNeeded(plan.matches.length, 5), 'rounds fill courts')

  console.log(
    `${men}M/${women}F${graded ? ' graded' : ''}: MD ${expected.md} + XD ${expected.xd} = ${plan.matches.length}, ${plan.rounds} rounds` +
      `${plan.rounds > WINDOW_ROUNDS ? ' (OVER 5h)' : ''}, men ${range(menGames)} games (MD ${range(menMD)}), women ${range(womenGames)}, ` +
      `repeat partners ${repeatPartners}, back-to-back ${backToBack}, warnings: ${plan.warnings.join('|') || 'none'}`,
  )
}

// Reproducible from seed
const a = generatePlan(mk(44, 20), 5, T, 7)
const b = generatePlan(mk(44, 20), 5, T, 7)
assert.deepStrictEqual(a.matches, b.matches, 'same seed => same draw')

// Counts: men's doubles first, mixed second, no cap on men's extra games
assert.deepStrictEqual(planCounts(44, 20, T), { md: 44, xd: 40 })
assert.deepStrictEqual(planCounts(32, 32, T), { md: 32, xd: 64 })
assert.deepStrictEqual(planCounts(3, 10, T), { md: 0, xd: 20 })
assert.deepStrictEqual(planCounts(10, 1, T), { md: 10, xd: 0 })

// Standings: win 2 / draw 1 / loss 0, tiebreak by diff
const P = (id: number, n: string): Player => ({ id, competition_id: 1, nickname: n, gender: 'M', grade: null })
const ps = [P(1, 'a'), P(2, 'b'), P(3, 'c'), P(4, 'd')]
const M = (o: Partial<Match>): Match => ({ id: 1, competition_id: 1, event: 'MD', round: 1, court: 1, a1: 1, a2: 2, b1: 3, b2: 4, score_a: 10, score_b: 5, status: 'done', version: 1, ...o })
const rows = standings(ps, [M({}), M({ id: 2, score_a: 7, score_b: 7 }), M({ id: 3, status: 'live', score_a: 1, score_b: 0 })], 'MD')
assert.deepStrictEqual(rows.map((r) => [r.player.nickname, r.pts, r.diff]), [['a', 3, 5], ['b', 3, 5], ['c', 1, -5], ['d', 1, -5]])
// Shared ranks: a and b level (T-1); c and d level (T-3, not 2)
assert.deepStrictEqual(rows.map((r) => [r.rank, r.tied]), [[1, true], [1, true], [3, true], [3, true]])
const mixed = standings(ps, [M({}), M({ id: 2, a1: 1, a2: 3, b1: 2, b2: 4, score_a: 9, score_b: 8 })], 'MD')
assert(mixed.some((r) => !r.tied), 'a clear leader has no tie flag')
assert.strictEqual(roundTime('09:00', 15, 3), '09:30')
assert.strictEqual(roundTime('23:45', 15, 2), '00:00')
console.log('logic tests passed')
