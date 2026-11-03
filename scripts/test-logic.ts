import assert from 'node:assert'
import { generatePlan, planCounts, type SchedPlayer } from '../lib/scheduler'
import { standings } from '../lib/standings'
import { roundTime } from '../lib/time'
import type { Match, Player } from '../lib/types'

function mk(men: number, women: number, graded = false): SchedPlayer[] {
  const ps: SchedPlayer[] = []
  for (let i = 0; i < men; i++) ps.push({ id: i + 1, gender: 'M', grade: graded ? (i % 3) + 1 : null })
  for (let i = 0; i < women; i++) ps.push({ id: men + i + 1, gender: 'F', grade: graded ? (i % 3) + 1 : null })
  return ps
}

for (const [men, women, graded] of [[32, 32, false], [40, 24, false], [44, 20, true], [50, 14, false], [30, 30, true]] as const) {
  const players = mk(men, women, graded)
  const plan = generatePlan(players, 5, 4, 1)
  const byId = new Map(players.map((p) => [p.id, p]))
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
      assert.strictEqual(byId.get(m.a1)!.gender === byId.get(m.a2)!.gender, false, 'XD side A mixed')
      assert.strictEqual(byId.get(m.b1)!.gender === byId.get(m.b2)!.gender, false, 'XD side B mixed')
    }
    for (const k of [[m.a1, m.a2], [m.b1, m.b2]].map(([x, y]) => `${Math.min(x, y)}-${Math.max(x, y)}`)) partners.set(k, (partners.get(k) ?? 0) + 1)
  }
  const games = [...plan.gamesPerPlayer.values()]
  const repeatPartners = [...partners.values()].filter((v) => v > 1).length
  console.log(
    `${men}M/${women}F${graded ? ' graded' : ''}: ${plan.matches.length} matches (MD ${plan.mdCount}, XD ${plan.xdCount}), ${plan.rounds} rounds, ` +
      `games ${Math.min(...games)}-${Math.max(...games)}, repeat partners ${repeatPartners}, back-to-back ${backToBack}, warnings: ${plan.warnings.join('|') || 'none'}`,
  )
}

// Reproducible from seed
const a = generatePlan(mk(32, 32), 5, 4, 7)
const b = generatePlan(mk(32, 32), 5, 4, 7)
assert.deepStrictEqual(a.matches, b.matches, 'same seed => same draw')
assert.deepStrictEqual(planCounts(32, 32, 4), { xd: 64, md: 0 })

// Standings: win 2 / draw 1 / loss 0, tiebreak by diff
const P = (id: number, n: string): Player => ({ id, competition_id: 1, nickname: n, gender: 'M', grade: null })
const ps = [P(1, 'a'), P(2, 'b'), P(3, 'c'), P(4, 'd')]
const M = (o: Partial<Match>): Match => ({ id: 1, competition_id: 1, event: 'MD', round: 1, court: 1, a1: 1, a2: 2, b1: 3, b2: 4, score_a: 10, score_b: 5, status: 'done', version: 1, ...o })
const rows = standings(ps, [M({}), M({ id: 2, score_a: 7, score_b: 7 }), M({ id: 3, status: 'live', score_a: 1, score_b: 0 })], 'MD')
assert.deepStrictEqual(rows.map((r) => [r.player.nickname, r.pts, r.diff]), [['a', 3, 5], ['b', 3, 5], ['c', 1, -5], ['d', 1, -5]])
assert.strictEqual(roundTime('09:00', 15, 3), '09:30')
assert.strictEqual(roundTime('23:45', 15, 2), '00:00')
console.log('logic tests passed')
