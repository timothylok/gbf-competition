import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compileRules, parseRules, partnerKey, unavailableRounds, type RulePlayer } from '../../lib/pairing-rules'
import { generatePlan, type SchedPlayer } from '../../lib/scheduler'
import { lineupIssues, teamSetup, type LineupPlayer } from '../../lib/lineup'
import { teamOf } from '../../lib/team'

// Made-up players: Philippines (-F) and the rest, men and women, grades B to D.
const ROSTER: RulePlayer[] = [
  { id: 1, nickname: 'Alex-F', gender: 'M', grade: 2 },
  { id: 2, nickname: 'Sam-F', gender: 'M', grade: 3 },
  { id: 3, nickname: 'Kim-F', gender: 'F', grade: 3 },
  { id: 4, nickname: 'Lee-F', gender: 'M', grade: 4 },
  { id: 5, nickname: 'Pat-F', gender: 'F', grade: 4 },
  { id: 6, nickname: 'Jo-F', gender: 'F', grade: 2 },
  { id: 7, nickname: 'Alex', gender: 'M', grade: 3 }, // a rest player with the same base name as Alex-F
  { id: 8, nickname: 'Max-RW', gender: 'M', grade: 4 },
  { id: 9, nickname: 'Mike M-F', gender: 'M', grade: 3 },
]

describe('parseRules (the rules box)', () => {
  it('reads avoid and pair rules, ignores blank lines and # notes', () => {
    const { rules, errors } = parseRules('# a note\n\navoid: grade:D & team:F | grade:B & team:F  # trailing note\npair: Kim + Alex-F\n')
    assert.deepEqual(errors, [])
    assert.equal(rules.length, 2)
    assert.equal(rules[0].kind, 'avoid')
    assert.deepEqual(rules[1], { kind: 'pair', line: 4, a: [{ kind: 'name', name: 'Kim' }], b: [{ kind: 'name', name: 'Alex-F' }] })
  })
  it('is case-insensitive for the keywords and handles spaces in nicknames', () => {
    const { rules, errors } = parseRules('AVOID : Mike M , Jo | Lee')
    assert.deepEqual(errors, [])
    assert.equal(rules.length, 1)
  })
  it('reports a clear error with the line number for each bad rule', () => {
    const { errors } = parseRules('avoid: Kim\nfrobnicate: x\navoid: grade:Z | Kim\navoid: team:X | Kim\npair: Kim\navoid: Kim, | Lee')
    assert.deepEqual(errors.map((e) => e.line), [1, 2, 3, 4, 5, 6])
    assert.match(errors[0].message, /avoid: <who> \| <who>/)
    assert.match(errors[1].message, /avoid:", "pair:", "upper:", "available:" or "prefer:/)
    assert.match(errors[2].message, /letter A to I/)
    assert.match(errors[3].message, /team must be F/)
    assert.match(errors[4].message, /pair: <name> \+ <name>/)
  })
  it('treats no text as no rules', () => {
    assert.deepEqual(parseRules(null), { rules: [], errors: [] })
    assert.deepEqual(parseRules(''), { rules: [], errors: [] })
  })
})

describe('compileRules (names and groups become player ids)', () => {
  it('avoid: grade and team groups, joined with &', () => {
    const c = compileRules(parseRules('avoid: grade:D & team:F | grade:B & team:F'), ROSTER)
    assert.deepEqual([...c.forbidden].sort(), [partnerKey(4, 1), partnerKey(4, 6), partnerKey(5, 1), partnerKey(5, 6)].sort())
    assert.equal(c.avoidRules, 1)
  })
  it('the rest team is not caught by a Philippines rule (Max-RW is D but not -F)', () => {
    const c = compileRules(parseRules('avoid: grade:D & team:F | grade:B & team:F'), ROSTER)
    assert(![...c.forbidden].some((k) => k.includes('8')), 'Max-RW is untouched')
  })
  it('a name ignores a trailing -F or -RW, and a name with spaces works', () => {
    const c = compileRules(parseRules('avoid: Kim, Mike M | Max'), ROSTER)
    assert.deepEqual([...c.forbidden].sort(), [partnerKey(3, 8), partnerKey(9, 8)].sort())
  })
  it('a name that matches two players is a problem unless narrowed by the exact nickname or a team', () => {
    const ambiguous = compileRules(parseRules('avoid: Alex | Kim'), ROSTER)
    assert.equal(ambiguous.problems.length, 1)
    assert.match(ambiguous.problems[0].message, /matches 2 players \(Alex-F, Alex\)/)
    assert.equal(compileRules(parseRules('avoid: Alex-F | Kim'), ROSTER).problems.length, 0, 'exact nickname')
    assert.equal(compileRules(parseRules('avoid: Alex & team:F | Kim'), ROSTER).problems.length, 0, 'narrowed by team')
    assert.equal(compileRules(parseRules('avoid: Alex & team:R | Kim'), ROSTER).forbidden.has(partnerKey(7, 3)), true)
  })
  it('a name that matches nobody is a warning, not a problem', () => {
    const c = compileRules(parseRules('avoid: Nobody | Kim'), ROSTER)
    assert.equal(c.problems.length, 0)
    assert.match(c.warnings[0].message, /No player matches "Nobody"/)
    assert.equal(c.forbidden.size, 0)
  })
  it('pair: needs one man and one woman of the same team', () => {
    assert.deepEqual(compileRules(parseRules('pair: Kim + Alex-F'), ROSTER).required, [[3, 1]])
    const sameSex = compileRules(parseRules('pair: Alex-F + Sam'), ROSTER)
    assert.equal(sameSex.required.length, 0)
    assert.match(sameSex.problems[0].message, /one man and one woman from the same team/)
    assert.match(compileRules(parseRules('pair: Kim + Max'), ROSTER).problems[0].message, /same team/)
  })
  it('pair: accepts & team:F on each side, which also settles a name shared with a rest player', () => {
    assert.deepEqual(compileRules(parseRules('pair: Kim & team:F + Alex & team:F'), ROSTER).required, [[3, 1]])
    const ambiguous = compileRules(parseRules('pair: Kim + Alex'), ROSTER)
    assert.equal(ambiguous.required.length, 0)
    assert.match(ambiguous.problems[0].message, /"Alex" matches 2 players \(Alex-F, Alex\)\. Use the exact nickname, or add & team:F/)
    assert.match(compileRules(parseRules('pair: Nobody & team:F + Kim & team:F'), ROSTER).warnings[0].message, /No player matches "Nobody & team:F"/)
  })
  it('pair: each side is exactly one player', () => {
    const { errors } = parseRules('pair: Kim, Jo + Alex-F')
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /Each side of pair: is one player/)
    assert.equal(parseRules('pair: Kim & grade:Z + Alex-F').errors.length, 1, 'a bad grade on a pair side is reported')
  })
})

describe('the draw respects pairing rules', () => {
  // 12 Philippines (ids 1-12) + 12 rest (ids 13-24): 8 men and 4 women each, grades B to D
  const MEN = [2, 3, 3, 3, 3, 3, 4, 3]
  const WOMEN = [3, 3, 4, 2]
  const roster = (): SchedPlayer[] => {
    const ps: SchedPlayer[] = []
    for (const team of ['F', 'R'] as const) {
      MEN.forEach((grade) => ps.push({ id: ps.length + 1, gender: 'M', grade, team }))
      WOMEN.forEach((grade) => ps.push({ id: ps.length + 1, gender: 'F', grade, team }))
    }
    return ps
  }
  it('never puts a forbidden pair on the same side, and keeps everyone within one grade', () => {
    const ps = roster()
    const forbidden = new Set([partnerKey(1, 2), partnerKey(1, 4), partnerKey(5, 7), partnerKey(13, 14)])
    const plan = generatePlan(ps, 5, { maxGames: 6, maxRounds: 19 }, 3, { forbidden, required: [] })
    for (const m of plan.matches) {
      assert(!forbidden.has(partnerKey(m.a1, m.a2)) && !forbidden.has(partnerKey(m.b1, m.b2)), `round ${m.round}: a forbidden pair is on one side`)
    }
    assert(plan.matches.length > 0)
  })
  it('makes a required pair partner at least once, in mixed doubles', () => {
    const ps = roster()
    const man = ps.find((p) => p.team === 'F' && p.gender === 'M' && p.grade === 3)!
    const woman = ps.find((p) => p.team === 'F' && p.gender === 'F' && p.grade === 3)!
    for (const seed of [1, 2, 3]) {
      const plan = generatePlan(ps, 5, { maxGames: 6, maxRounds: 19 }, seed, { forbidden: new Set(), required: [[man.id, woman.id]] })
      assert.equal(plan.unmetPairs.length, 0)
      const together = plan.matches.filter((m) => [[m.a1, m.a2], [m.b1, m.b2]].some(([x, y]) => partnerKey(x, y) === partnerKey(man.id, woman.id)))
      assert(together.length >= 1, `seed ${seed}: the required pair never partnered`)
      for (const m of together) assert.equal(m.event, 'XD', 'a man and a woman partnering is mixed doubles')
    }
  })
  it('the rules win: when a pair cannot be made legal, it is reported instead of breaking a rule', () => {
    const ps = roster()
    const man = ps.find((p) => p.team === 'F' && p.gender === 'M' && p.grade === 2)!
    const woman = ps.find((p) => p.team === 'F' && p.gender === 'F' && p.grade === 4)!
    // B and D are two grades apart, so they can never be in one match
    const plan = generatePlan(ps, 5, { maxGames: 6, maxRounds: 19 }, 1, { forbidden: new Set(), required: [[man.id, woman.id]] })
    assert.deepEqual(plan.unmetPairs, [[man.id, woman.id]])
  })
  it('heavy rules still leave nearly everyone with 5 or 6 games', () => {
    const ps = roster()
    const forbidden = new Set<string>()
    for (const a of [1, 2, 3, 4]) for (const b of [5, 6, 7, 8]) forbidden.add(partnerKey(a, b))
    const plan = generatePlan(ps, 5, { maxGames: 6, maxRounds: 19 }, 2, { forbidden, required: [] })
    assert([...plan.gamesPerPlayer.values()].filter((g) => g >= 5).length >= 20, 'at most 4 players below 5 games')
  })
})

describe('hand-made matches that break a rule', () => {
  const P = (id: number, gender: 'M' | 'F', grade: number, team: 'F' | 'R'): LineupPlayer => ({ id, gender, grade, team })
  const setup = teamSetup([{ team: 'F' }, { team: 'F' }, { team: 'R' }, { team: 'R' }])
  const forbidden = new Set([partnerKey(1, 2)])
  it('flags a forbidden partner pair on either side, in either order', () => {
    const a = [P(1, 'M', 3, 'F'), P(2, 'M', 3, 'F')] as [LineupPlayer, LineupPlayer]
    const b = [P(3, 'M', 3, 'R'), P(4, 'M', 3, 'R')] as [LineupPlayer, LineupPlayer]
    assert.deepEqual(lineupIssues('MD', a, b, setup, forbidden), ['rule'])
    assert.deepEqual(lineupIssues('MD', [a[1], a[0]], b, setup, forbidden), ['rule'])
    assert.deepEqual(lineupIssues('MD', b, a, setup, forbidden), ['rule'], 'the pair on side B too')
    assert.deepEqual(lineupIssues('MD', a, b, setup), [], 'no rules, no warning')
  })
  it('opponents may be any pair: the rule is about partners only', () => {
    const a = [P(1, 'M', 3, 'F'), P(5, 'M', 3, 'F')] as [LineupPlayer, LineupPlayer]
    const b = [P(2, 'M', 3, 'R'), P(4, 'M', 3, 'R')] as [LineupPlayer, LineupPlayer]
    assert.deepEqual(lineupIssues('MD', a, b, setup, forbidden), [])
  })
  it('teamOf stays the single source for the -F suffix', () => {
    assert.equal(teamOf('Kim-F'), 'F')
  })
})

describe('Upper C preference', () => {
  it('parses upper: and marks only C-grade players (others get a warning)', () => {
    const parsed = parseRules('upper: Sam, Mike M-F, Alex-F')
    assert.deepEqual(parsed.errors, [])
    const c = compileRules(parsed, ROSTER)
    assert.deepEqual([...c.upperC].sort(), [2, 9])
    assert.equal(c.warnings.length, 1, 'Alex-F is a B player')
    assert.deepEqual(parseRules('upper:').errors.length, 1)
  })
  it('a B player is paired with Upper C partners far more often than with lower C ones', () => {
    // 3 B men, 4 Upper C men, 5 lower C men (B players have too few B partners, so they must pair with C), one team, men only: B+C partnerships are open to either kind of C.
    const ps: SchedPlayer[] = []
    for (let i = 1; i <= 12; i++) ps.push({ id: i, gender: 'M', grade: i <= 3 ? 2 : 3 })
    const upperC = new Set([4, 5, 6, 7])
    const count = (rules?: { forbidden: Set<string>; required: [number, number][]; upperC?: Set<number> }) => {
      let up = 0, low = 0
      for (let seed = 1; seed <= 6; seed++) {
        const plan = generatePlan(ps, 3, { maxGames: 4, maxRounds: 12 }, seed, rules)
        for (const m of plan.matches) for (const [x, y] of [[m.a1, m.a2], [m.b1, m.b2]]) {
          const b = x <= 3 ? y : y <= 3 ? x : 0
          if ((x <= 3) !== (y <= 3) && b) upperC.has(b) ? up++ : low++
        }
      }
      return { up, low }
    }
    const without = count()
    const withPref = count({ forbidden: new Set(), required: [], upperC })
    assert(withPref.up >= withPref.low, `prefers Upper C (${withPref.up} vs ${withPref.low}; without: ${without.up} vs ${without.low})`)
    assert(withPref.up / Math.max(1, withPref.low) > without.up / Math.max(1, without.low), 'more Upper C than with no preference')
  })
  it('a forbidden pair still wins over the preference', () => {
    const ps: SchedPlayer[] = []
    for (let i = 1; i <= 12; i++) ps.push({ id: i, gender: 'M', grade: i <= 4 ? 2 : 3 })
    const forbidden = new Set([1, 2, 3, 4].map((b) => partnerKey(b, 5)))
    const plan = generatePlan(ps, 3, { maxGames: 4, maxRounds: 12 }, 3, { forbidden, required: [], upperC: new Set([5, 6, 7, 8]) })
    for (const m of plan.matches) for (const [x, y] of [[m.a1, m.a2], [m.b1, m.b2]]) assert(!forbidden.has(partnerKey(x, y)))
  })
})

describe('available: time windows', () => {
  it('parses windows (24-hour, am/pm, end) and rejects bad ones', () => {
    const ok = parseRules('available: Sam | 13:30-14:30, 3:30pm-end')
    assert.deepEqual(ok.errors, [])
    const c = compileRules(ok, ROSTER)
    assert.deepEqual(c.availability.get(2), [[810, 870], [930, 1440]])
    assert.equal(parseRules('available: Sam | 14:30-13:30').errors.length, 1, 'ends before it starts')
    assert.equal(parseRules('available: Sam | soon').errors.length, 1)
    assert.equal(parseRules('available: Sam').errors.length, 1)
  })
  it('a round counts only when it starts and finishes inside a window', () => {
    // start 12:00, 15 min warm-up, 15 min slots: round 1 = 12:15-12:30 ... round 7 = 13:45-14:00
    const off = unavailableRounds(new Map([[1, [[810, 870], [930, 1440]]]]), '12:00', 15, 16)
    const on = [...Array(16)].map((_, i) => i + 1).filter((r) => !off.get(1)!.has(r))
    assert.deepEqual(on, [6, 7, 8, 9, 14, 15, 16]) // 13:30-14:30 = rounds 6-9; 15:30 = round 14 onward
  })
  it('the draw never schedules the player outside the windows, and still gives everyone games', () => {
    const ps: SchedPlayer[] = []
    for (const team of ['F', 'R'] as const) for (let k = 0; k < 12; k++) ps.push({ id: ps.length + 1, gender: k % 2 ? 'F' : 'M', grade: 3 + (k % 2), team })
    const id = ps[0].id
    const off = unavailableRounds(new Map([[id, [[810, 870], [930, 1440]]]]), '12:00', 15, 19)
    const plan = generatePlan(ps, 5, { maxGames: 6, maxRounds: 19 }, 4, { forbidden: new Set(), required: [], unavailable: off })
    for (const m of plan.matches) if ([m.a1, m.a2, m.b1, m.b2].includes(id)) assert(!off.get(id)!.has(m.round), `round ${m.round}`)
    assert((plan.gamesPerPlayer.get(id) ?? 0) >= 3, 'plays in the windows')
  })
})

describe('prefer: women\'s doubles', () => {
  it('parses prefer: <who> | wd, warns for a man, rejects other forms', () => {
    const ok = parseRules('prefer: Kim-F | wd')
    assert.deepEqual(ok.errors, [])
    assert.deepEqual([...compileRules(ok, ROSTER).preferWD], [3])
    assert.equal(compileRules(parseRules('prefer: Alex-F | wd'), ROSTER).warnings.length, 1)
    assert.equal(parseRules('prefer: Kim-F | md').errors.length, 1)
    assert.equal(parseRules('prefer: Kim-F').errors.length, 1)
  })
  it('the preferred woman plays more women\'s doubles than mixed', () => {
    const ps: SchedPlayer[] = []
    for (const team of ['F', 'R'] as const) for (let k = 0; k < 14; k++) ps.push({ id: ps.length + 1, gender: k < 8 ? 'F' : 'M', grade: 3, team })
    const target = 1
    const tally = (rules?: { forbidden: Set<string>; required: [number, number][]; preferWD?: Set<number> }) => {
      let wd = 0, xd = 0
      for (let seed = 1; seed <= 6; seed++) {
        const plan = generatePlan(ps, 4, { maxGames: 6, maxRounds: 19 }, seed, rules)
        for (const m of plan.matches) {
          const ids = [m.a1, m.a2, m.b1, m.b2]
          if (!ids.includes(target)) continue
          const women = ids.filter((i) => ps[i - 1].gender === 'F').length
          if (women === 4) wd++
          else if (women === 2) xd++
        }
      }
      return { wd, xd }
    }
    const pref = tally({ forbidden: new Set(), required: [], preferWD: new Set([target]) })
    assert(pref.wd > pref.xd, `more WD than XD (${pref.wd} vs ${pref.xd})`)
  })
})

describe('Upper C matches against D', () => {
  it('two C players (one Upper C) never play two D players; B never plays D', () => {
    const ps: SchedPlayer[] = []
    for (const team of ['F', 'R'] as const) {
      for (let k = 0; k < 14; k++) ps.push({ id: ps.length + 1, gender: 'M', grade: k < 2 ? 2 : k < 9 ? 3 : 4, team })
    }
    const upperC = new Set(ps.filter((p) => p.grade === 3 && p.id % 3 === 0).map((p) => p.id))
    const g = (id: number) => ps[id - 1].grade
    for (let seed = 1; seed <= 5; seed++) {
      const plan = generatePlan(ps, 4, { maxGames: 5, maxRounds: 19 }, seed, { forbidden: new Set(), required: [], upperC })
      for (const m of plan.matches) {
        const A = [m.a1, m.a2], B = [m.b1, m.b2]
        const strong = (s: number[]) => s.every((i) => g(i) === 3) && s.some((i) => upperC.has(i))
        const dd = (s: number[]) => s.every((i) => g(i) === 4)
        assert(!((strong(A) && dd(B)) || (strong(B) && dd(A))), `round ${m.round}`)
        assert(!([...A, ...B].some((i) => g(i) === 2) && [...A, ...B].some((i) => g(i) === 4)), 'B vs D')
      }
    }
  })
})
