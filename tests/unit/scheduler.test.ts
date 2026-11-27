import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estimatePlan, generatePlan, gradeSpreadOk, roundsNeeded, type Plan, type SchedPlayer } from '../../lib/scheduler'
import { startScore } from '../../lib/handicap'
import { lineupIssues, teamSetup, type LineupPlayer } from '../../lib/lineup'
import { teamOf } from '../../lib/team'

type Spec = [team: 'F' | 'R', gender: 'M' | 'F', grade: number | null, count: number][]

function roster(spec: Spec): SchedPlayer[] {
  const ps: SchedPlayer[] = []
  for (const [team, gender, grade, count] of spec) for (let i = 0; i < count; i++) ps.push({ id: ps.length + 1, gender, grade, team })
  return ps
}

// The real mix of team, sex and grade (synthetic names): Philippines 21, Rest 25.
const REST: Spec = [['R', 'M', 2, 4], ['R', 'M', 3, 10], ['R', 'M', 4, 3], ['R', 'F', 3, 5], ['R', 'F', 4, 3]]
const F21: Spec = [['F', 'M', 2, 3], ['F', 'M', 3, 7], ['F', 'F', 2, 2], ['F', 'F', 3, 8], ['F', 'F', 4, 1]]
const F26: Spec = [['F', 'M', 2, 3], ['F', 'M', 3, 9], ['F', 'F', 2, 2], ['F', 'F', 3, 11], ['F', 'F', 4, 1]]
const NO_TEAMS: Spec = [['R', 'M', 3, 22], ['R', 'M', 2, 11], ['R', 'M', 4, 11], ['R', 'F', 3, 12], ['R', 'F', 2, 4], ['R', 'F', 4, 4]]

const COURTS = 5
const CAP = 6
const T = { maxGames: CAP, maxRounds: 20 }

/** Every rule of the draw, checked on a finished plan. */
function checkRules(plan: Plan, players: SchedPlayer[], courts: number, cap: number, maxRounds: number) {
  const by = new Map(players.map((p) => [p.id, p]))
  const nF = players.filter((p) => p.team === 'F').length
  const teamsActive = nF > 0 && nF < players.length
  const spare = !teamsActive || nF * 2 === players.length ? null : nF * 2 > players.length ? 'F' : 'R'
  assert(plan.rounds <= maxRounds, `${plan.rounds} rounds is past the limit of ${maxRounds}`)
  const games = new Map<number, number>()
  for (let r = 1; r <= plan.rounds; r++) {
    const inRound = plan.matches.filter((m) => m.round === r).sort((a, b) => a.court - b.court)
    assert(inRound.length <= courts, `round ${r}: more matches than courts`)
    assert.deepEqual(inRound.map((m) => m.court), inRound.map((_, i) => i + 1), `round ${r}: courts are 1..n`)
    const ids = inRound.flatMap((m) => [m.a1, m.a2, m.b1, m.b2])
    assert.equal(new Set(ids).size, ids.length, `round ${r}: a player appears twice`)
    // men's doubles on the lower courts
    const firstOther = inRound.findIndex((m) => m.event !== 'MD')
    if (firstOther >= 0) assert(inRound.slice(firstOther).every((m) => m.event !== 'MD'), `round ${r}: men's doubles after another match`)
  }
  for (const m of plan.matches) {
    const a = [by.get(m.a1)!, by.get(m.a2)!]
    const b = [by.get(m.b1)!, by.get(m.b2)!]
    for (const id of [m.a1, m.a2, m.b1, m.b2]) games.set(id, (games.get(id) ?? 0) + 1)
    assert(gradeSpreadOk([...a, ...b].map((p) => p.grade)), `round ${m.round}: grades more than one apart`)
    const wa = a.filter((p) => p.gender === 'F').length
    const wb = b.filter((p) => p.gender === 'F').length
    if (wa !== wb) {
      assert(wa === 2 && wb === 0, `round ${m.round}: only two women vs two men (women on side A) may differ in type`)
      const hs = startScore(
        [{ gender: 'F', grade: a[0].grade }, { gender: 'F', grade: a[1].grade }],
        [{ gender: 'M', grade: b[0].grade }, { gender: 'M', grade: b[1].grade }],
      )
      assert(hs.covered, `round ${m.round}: cross line-up has no starting score`)
    }
    assert.equal(m.event, wa === 0 && wb === 0 ? 'MD' : 'XD', 'event is MD for all-men matches, otherwise XD')
    if (teamsActive) {
      assert(a[0].team === a[1].team && b[0].team === b[1].team, `round ${m.round}: a side mixes teams`)
      if (a[0].team === b[0].team) assert.equal(a[0].team, spare, `round ${m.round}: same-team match by the team without spare games`)
    }
  }
  for (const [id, g] of games) assert(g <= cap, `player ${id} plays ${g} games, more than ${cap}`)
}

describe('estimatePlan (quick upper bound for the preview)', () => {
  it('uses the smaller team for cross-team matches and the spare slots of the larger team for filler', () => {
    const f21 = estimatePlan(roster([...F21, ...REST]), 6, 5)
    assert.deepEqual([f21.cross, f21.filler, f21.matches, f21.rounds], [63, 6, 69, 14])
    const f26 = estimatePlan(roster([...F26, ...REST]), 6, 5)
    assert.deepEqual([f26.cross, f26.filler, f26.matches, f26.rounds], [75, 1, 76, 16])
  })
  it('without teams everyone plays everyone', () => {
    const e = estimatePlan(roster(NO_TEAMS), 6, 5)
    assert.deepEqual([e.matches, e.rounds], [96, 20])
  })
  it('computes the rounds needed for the courts', () => {
    assert.equal(roundsNeeded(84, 5), 17)
    assert.equal(roundsNeeded(1, 5), 1)
  })
})

describe('draw: Philippines (-F) vs the rest, 5 courts, 5 hours, at most 6 games', () => {
  it('21 vs 25: everyone plays 6 games, in 14 rounds, every rule holds', () => {
    const ps = roster([...F21, ...REST])
    const plan = generatePlan(ps, COURTS, T, 7)
    checkRules(plan, ps, COURTS, CAP, 20)
    assert.equal(plan.underCap.length, 0)
    assert([...plan.gamesPerPlayer.values()].every((g) => g === CAP), 'everyone has 6 games')
    assert.equal(plan.rounds, 14)
    assert(plan.fillerCount > 0, 'the larger team plays some same-team filler matches to reach 6')
    assert.equal(plan.matches.length, plan.mdCount + plan.xdCount + plan.wdCount + plan.hdCount)
  })

  it('26 vs 25: the larger team is the one with spare games, and at most 2 players end on 5', () => {
    const ps = roster([...F26, ...REST])
    const plan = generatePlan(ps, COURTS, T, 3)
    checkRules(plan, ps, COURTS, CAP, 20)
    assert(plan.underCap.length <= 2, `${plan.underCap.length} players under 6 (the most that can be short is 2)`)
    assert([...plan.gamesPerPlayer.values()].every((g) => g >= 5))
    assert(plan.fillerCount >= 1, 'the larger team plays a same-team filler match')
  })

  it('women play women\'s doubles and handicap (women vs men) only when needed; handicap always has a head start', () => {
    const ps = roster([...F21, ...REST])
    const plan = generatePlan(ps, COURTS, T, 11)
    assert(plan.wdCount > 0, 'women play women vs women')
    assert(plan.hdCount > 0, 'the Philippines women are 11 against 8, so some play the rest\'s men')
    assert(plan.hdCount < plan.matches.length / 2, 'handicap is the exception')
  })

  it('same grade is preferred: a roster of one grade has no "one grade apart" matches', () => {
    const ps = roster([['F', 'M', 3, 6], ['F', 'F', 3, 6], ['R', 'M', 3, 6], ['R', 'F', 3, 6]])
    const plan = generatePlan(ps, COURTS, T, 1)
    checkRules(plan, ps, COURTS, CAP, 20)
    assert.equal(plan.closeCount, 0)
  })

  it('never puts B and D players in the same match (more than one grade apart)', () => {
    for (const seed of [1, 2, 3]) {
      const ps = roster([...F21, ...REST])
      const grade = new Map(ps.map((p) => [p.id, p.grade]))
      const plan = generatePlan(ps, COURTS, T, seed)
      for (const m of plan.matches) {
        const g = [m.a1, m.a2, m.b1, m.b2].map((i) => grade.get(i)!)
        assert(Math.max(...g) - Math.min(...g) <= 1, `seed ${seed}: grades ${g} in round ${m.round}`)
      }
    }
  })

  it('stops at the time limit instead of running over, and gives fewer games', () => {
    const ps = roster([...F21, ...REST])
    const plan = generatePlan(ps, COURTS, { maxGames: CAP, maxRounds: 8 }, 5)
    checkRules(plan, ps, COURTS, CAP, 8)
    assert(plan.rounds <= 8)
    assert(plan.underCap.length > 0, 'not everyone can reach 6 games in 8 rounds')
    assert.match(plan.warnings.join(' '), /fewer than 6 games/)
  })

  it('is reproducible from its seed, and a different seed gives a different draw', () => {
    const ps = roster([...F21, ...REST])
    const a = JSON.stringify(generatePlan(ps, COURTS, T, 21).matches)
    assert.equal(JSON.stringify(generatePlan(ps, COURTS, T, 21).matches), a)
    assert.notEqual(JSON.stringify(generatePlan(ps, COURTS, T, 22).matches), a)
  })
})

describe('draw: roster with no -F players (no teams)', () => {
  it('64 players: everyone plays 6 games inside 20 rounds, same grade preferred', () => {
    const ps = roster(NO_TEAMS)
    const t0 = Date.now()
    const plan = generatePlan(ps, COURTS, T, 7)
    assert(Date.now() - t0 < 8000, 'a draw for 64 players takes a few seconds at most')
    checkRules(plan, ps, COURTS, CAP, 20)
    assert.equal(plan.underCap.length, 0)
    assert.equal(plan.fillerCount, 0, 'no teams, so no filler')
  })
  it('players without a grade can play anyone', () => {
    const ps = roster([['R', 'M', null, 8], ['R', 'F', null, 8]])
    const plan = generatePlan(ps, COURTS, { maxGames: 4, maxRounds: 20 }, 2)
    checkRules(plan, ps, COURTS, 4, 20)
    assert([...plan.gamesPerPlayer.values()].every((g) => g === 4))
  })
  it('handles tiny rosters', () => {
    assert.equal(generatePlan(roster([['R', 'M', 3, 3]]), COURTS, T, 1).matches.length, 0)
    const four = generatePlan(roster([['R', 'M', 3, 4]]), COURTS, { maxGames: 2, maxRounds: 20 }, 1)
    assert.equal(four.matches.length, 2)
  })
})

describe('gradeSpreadOk', () => {
  it('allows the same grade or one apart, never two', () => {
    assert(gradeSpreadOk([3, 3, 3, 3]))
    assert(gradeSpreadOk([2, 3, 3, 2]))
    assert(!gradeSpreadOk([2, 3, 4, 3]))
    assert(!gradeSpreadOk([2, 4]))
  })
  it('ignores players with no grade', () => {
    assert(gradeSpreadOk([null, 3, undefined, 4]))
    assert(gradeSpreadOk([null, null]))
  })
})

describe('teams and hand-made line-ups', () => {
  it('-F at the end of a nickname is the Philippines team', () => {
    assert.equal(teamOf('Sam-F'), 'F')
    assert.equal(teamOf('Mike M-F'), 'F')
    assert.equal(teamOf('Chloe-RW'), 'R')
    assert.equal(teamOf('Alex'), 'R')
    assert.equal(teamOf('Self'), 'R', 'an F in the name is not the suffix')
  })
  let nextId = 1
  const P = (gender: 'M' | 'F', grade: number, team: 'F' | 'R'): LineupPlayer => ({ id: nextId++, gender, grade, team })
  const setup = teamSetup([{ team: 'F' }, { team: 'F' }, { team: 'F' }, { team: 'R' }, { team: 'R' }])
  it('finds the team with spare games', () => {
    assert.deepEqual(setup, { active: true, spare: 'F' })
    assert.deepEqual(teamSetup([{ team: 'R' }, { team: 'R' }]), { active: false, spare: null })
    assert.deepEqual(teamSetup([{ team: 'F' }, { team: 'R' }]), { active: true, spare: null })
  })
  it('accepts a clean cross-team match and flags grades, teams and event type', () => {
    const ok = lineupIssues('MD', [P('M', 3, 'F'), P('M', 3, 'F')], [P('M', 3, 'R'), P('M', 2, 'R')], setup)
    assert.deepEqual(ok, [])
    assert.deepEqual(lineupIssues('MD', [P('M', 2, 'F'), P('M', 3, 'F')], [P('M', 4, 'R'), P('M', 3, 'R')], setup), ['grades'])
    assert.deepEqual(lineupIssues('MD', [P('M', 3, 'F'), P('M', 3, 'R')], [P('M', 3, 'R'), P('M', 3, 'F')], setup), ['team'])
    assert.deepEqual(lineupIssues('MD', [P('M', 3, 'R'), P('M', 3, 'R')], [P('M', 3, 'R'), P('M', 3, 'R')], setup), ['team'], 'same-team match by the team without spare games')
    assert.deepEqual(lineupIssues('MD', [P('M', 3, 'F'), P('M', 3, 'F')], [P('M', 3, 'F'), P('M', 3, 'F')], setup), [], 'filler by the larger team is fine')
    assert.deepEqual(lineupIssues('MD', [P('M', 3, 'F'), P('F', 3, 'F')], [P('M', 3, 'R'), P('M', 3, 'R')], setup), ['mismatch'])
  })
  it('women vs women, mixed vs mixed and women vs men are valid XD line-ups; all men is not', () => {
    const none = { active: false, spare: null } as const
    assert.deepEqual(lineupIssues('XD', [P('F', 3, 'R'), P('F', 3, 'R')], [P('F', 3, 'R'), P('F', 3, 'R')], none), [])
    assert.deepEqual(lineupIssues('XD', [P('M', 3, 'R'), P('F', 3, 'R')], [P('M', 3, 'R'), P('F', 3, 'R')], none), [])
    assert.deepEqual(lineupIssues('XD', [P('F', 3, 'R'), P('F', 3, 'R')], [P('M', 3, 'R'), P('M', 3, 'R')], none), [])
    assert.deepEqual(lineupIssues('XD', [P('M', 3, 'R'), P('F', 3, 'R')], [P('F', 3, 'R'), P('F', 3, 'R')], none), ['mismatch'])
    assert.deepEqual(lineupIssues('XD', [P('M', 3, 'R'), P('M', 3, 'R')], [P('M', 3, 'R'), P('M', 3, 'R')], none), ['mismatch'])
  })
})

describe('cross doubles limit: at most one per player', () => {
  const mk = (nW: number, nM: number, team: 'F' | 'R', start: number): SchedPlayer[] => [
    ...[...Array(nW)].map((_, i): SchedPlayer => ({ id: start + i, gender: 'F', grade: 3, team })),
    ...[...Array(nM)].map((_, i): SchedPlayer => ({ id: start + nW + i, gender: 'M', grade: 3, team })),
  ]
  const crossCounts = (ps: SchedPlayer[], plan: ReturnType<typeof generatePlan>) => {
    const g = new Map(ps.map((p) => [p.id, p.gender]))
    const counts = new Map<number, number>()
    for (const m of plan.matches) {
      const ids = [m.a1, m.a2, m.b1, m.b2]
      const wa = [m.a1, m.a2].filter((i) => g.get(i) === 'F').length
      const wb = [m.b1, m.b2].filter((i) => g.get(i) === 'F').length
      if (wa !== wb) for (const i of ids) counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    return counts
  }
  it('keeps every player to one cross doubles match when that is possible', () => {
    const ps = [...mk(8, 4, 'F', 1), ...mk(6, 6, 'R', 100)]
    const plan = generatePlan(ps, 4, { maxGames: 2, maxRounds: 19 }, 1)
    const counts = crossCounts(ps, plan)
    assert(counts.size > 0, 'the surplus of Philippines women forces some cross doubles')
    assert([...counts.values()].every((c) => c <= 1), 'nobody plays two')
    assert.deepEqual(plan.crossExceptions, [])
  })
  it('lists the exceptions when it cannot be kept, matching the matches actually drawn', () => {
    const ps = [...mk(6, 4, 'F', 1), ...mk(2, 8, 'R', 100)]
    const plan = generatePlan(ps, 4, { maxGames: 3, maxRounds: 19 }, 1)
    const counts = crossCounts(ps, plan)
    const over = [...counts.entries()].filter(([, c]) => c > 1).map(([id, count]) => ({ id, count })).sort((a, b) => a.id - b.id)
    assert(over.length > 0, 'twelve extra women-games cannot fit one each for six women')
    assert.deepEqual([...plan.crossExceptions].sort((a, b) => a.id - b.id), over)
  })
})
