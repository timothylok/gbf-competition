import type { EventType, Gender } from './types'
import { startScore } from './handicap'

/**
 * The draw. Rules (see docs/game-rules.md):
 *  - Teams: when some nicknames end in "-F" (Philippines) and others do not, every match is Philippines vs the rest,
 *    each side made of two players from one team. The team with spare game-slots may play same-team "filler" matches
 *    once the cross-team matches run out.
 *  - Same type on both sides: men vs men, women vs women, or one man + one woman vs the same. When that is not
 *    possible, two women may play two men (cross doubles). Every match gets a starting score from lib/handicap.ts.
 *  - Grades: all four players within one grade of each other (A to B, B to C, ...). Same grade is preferred.
 *  - Every player plays at most `maxGames` games; one match per player per round; at most `courts` matches per round;
 *    never past `maxRounds` (the time limit).
 */

export interface SchedPlayer {
  id: number
  gender: Gender
  grade: number | null
  /** 'F' = Philippines team, 'R' = the rest. Omitted = 'R'. */
  team?: 'F' | 'R'
  /** Happy to partner a D-grade player; the draw prefers these partners for D grades. */
  dFriendly?: boolean
}
export interface PlannedMatch {
  event: EventType
  round: number
  court: number
  a1: number
  a2: number
  b1: number
  b2: number
}
export interface Targets {
  /** Most games any player may play. */
  maxGames: number
  /** Last round that fits the time limit. */
  maxRounds: number
}
/** Pairing rules for this roster, as player ids (see lib/pairing-rules.ts). */
export interface SchedRules {
  /** Partners who must never be on the same side: "idA-idB" with the smaller id first. */
  forbidden: Set<string>
  /** One man + one woman of the same team who must partner at least once. */
  required: [number, number][]
  /** Upper C players: in a B+C partnership the draw prefers these over other C players (a preference only). */
  upperC?: Set<number>
  /** Women who should get more women's doubles than mixed doubles (a preference only). */
  preferWD?: Set<number>
  /** Rounds a player cannot play in (player id -> round numbers), from their available: windows. */
  unavailable?: Map<number, Set<number>>
}
export interface Plan {
  matches: PlannedMatch[]
  rounds: number
  /** Men vs men. */
  mdCount: number
  /** One man + one woman per side. */
  xdCount: number
  /** Women vs women. */
  wdCount: number
  /** Women vs men with a head start. */
  hdCount: number
  /** Same-team matches played to give the larger team its games. */
  fillerCount: number
  /** Matches whose four players are not all the same grade (one grade apart). */
  closeCount: number
  gamesPerPlayer: Map<number, number>
  /** Players with fewer games than the maximum. */
  underCap: number[]
  /** Required pairs the draw could not schedule. */
  unmetPairs: [number, number][]
  warnings: string[]
}

const GRADE_B = 2
const GRADE_C = 3
const GRADE_D = 4
/** Cost of pairing a B player with a lower C player when an Upper C player could do it (tuned against the 25 of a mixed-grade match). */
const UPPER_COST = 40
/** How much cheaper women's doubles is (and how much dearer mixed is) for a woman who prefers women's doubles. */
const WD_BONUS = 25

/** True when all known grades are within one grade of each other (unknown grades never block). */
export function gradeSpreadOk(grades: (number | null | undefined)[]): boolean {
  const known = grades.filter((g): g is number => g != null)
  return known.length === 0 || Math.max(...known) - Math.min(...known) <= 1
}

/** Rounds needed: each round uses every court at most once. */
export function roundsNeeded(matches: number, courts: number) {
  return Math.ceil(matches / courts)
}

/** Quick upper bound for the plan preview; the real draw can be a little lower. */
export function estimatePlan(players: Pick<SchedPlayer, 'team'>[], maxGames: number, courts: number) {
  const nF = players.filter((p) => p.team === 'F').length
  const nR = players.length - nF
  let cross = 0
  let filler = 0
  if (nF > 0 && nR > 0) {
    cross = Math.floor((Math.min(nF, nR) * maxGames) / 2)
    filler = Math.floor((Math.abs(nF - nR) * maxGames) / 4)
  } else {
    cross = Math.floor((players.length * maxGames) / 4)
  }
  const matches = cross + filler
  return { matches, cross, filler, rounds: roundsNeeded(matches, courts) }
}

/** Small seeded RNG (mulberry32) so a draw can be reproduced from its seed. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const key = (a: number, b: number) => (a < b ? a * 100000 + b : b * 100000 + a)

type Mode = 'cross' | 'filler'
interface Cand {
  a: [number, number]
  b: [number, number]
  cost: number
  tier: 'ideal' | 'close' | 'handicap' | 'filler'
  kind: 'MD' | 'XD' | 'WD' | 'HD'
}
interface RoundState {
  used: Set<number>
  matches: Cand[]
}

const KIND_ORDER = { MD: 0, XD: 1, WD: 2, HD: 3 } as const

function generateOnce(players: SchedPlayer[], courts: number, targets: Targets, seed: number, rules?: SchedRules): Plan & { rank: number[] } {
  const rand = rng(seed)
  const n = players.length
  const cap = targets.maxGames
  const P = players.map((p) => ({ ...p, team: p.team ?? ('R' as const) }))
  const nF = P.filter((p) => p.team === 'F').length
  const teamsActive = nF > 0 && nF < n
  // The team with more game-slots has spare games to play among themselves (filler).
  const spareTeam: 'F' | 'R' | null = teamsActive ? (nF > n - nF ? 'F' : nF < n - nF ? 'R' : null) : null

  const games = new Array<number>(n).fill(0)
  const partnerHist = new Map<number, number>()
  const oppHist = new Map<number, number>()
  const rounds: RoundState[] = []

  // Pairing rules by player index: partners who must never be on one side, and pairs who must partner at least once.
  const idxOf = new Map(P.map((p, i) => [p.id, i]))
  const forbiddenIdx = new Set<number>()
  rules?.forbidden.forEach((k) => {
    const [a, b] = k.split('-').map(Number)
    const i = idxOf.get(a)
    const j = idxOf.get(b)
    if (i !== undefined && j !== undefined) forbiddenIdx.add(key(i, j))
  })
  const bad = (i: number, j: number) => forbiddenIdx.has(key(i, j))
  const required: [number, number][] = []
  for (const [a, b] of rules?.required ?? []) {
    const i = idxOf.get(a)
    const j = idxOf.get(b)
    if (i !== undefined && j !== undefined) required.push([i, j])
  }
  const met = required.map(() => false)
  const offRounds = new Map<number, Set<number>>()
  rules?.unavailable?.forEach((rs, id) => {
    const i = idxOf.get(id)
    if (i !== undefined) offRounds.set(i, rs)
  })
  const canPlay = (i: number, r: number) => !offRounds.get(i)?.has(r)
  const wdIdx = new Set<number>()
  rules?.preferWD?.forEach((id) => {
    const i = idxOf.get(id)
    if (i !== undefined) wdIdx.add(i)
  })
  const upperIdx = new Set<number>()
  rules?.upperC?.forEach((id) => {
    const i = idxOf.get(id)
    if (i !== undefined) upperIdx.add(i)
  })

  const isW = (i: number) => P[i].gender === 'F'
  const grade = (i: number) => P[i].grade
  const near = (i: number, j: number) => {
    const a = grade(i)
    const b = grade(j)
    return a == null || b == null || Math.abs(a - b) <= 1
  }
  const adjacent = (i: number, r: number) => (rounds[r - 2]?.used.has(i) ? 1 : 0) + (rounds[r]?.used.has(i) ? 1 : 0)

  const bothD = (u: number, v: number) => grade(u) === GRADE_D && grade(v) === GRADE_D
  const strongC = (u: number, v: number) => grade(u) === GRADE_C && grade(v) === GRADE_C && (upperIdx.has(u) || upperIdx.has(v))

  /** B + C partnership with a lower C player, when some Upper C players are named: a mild cost, so Upper C goes first. */
  function upperPenalty(x: number, y: number) {
    if (upperIdx.size === 0) return 0
    const gx = grade(x)
    const gy = grade(y)
    const c = gx === GRADE_B && gy === GRADE_C ? y : gy === GRADE_B && gx === GRADE_C ? x : -1
    return c >= 0 && !upperIdx.has(c) ? UPPER_COST : 0
  }

  function partnerPenalty(x: number, y: number) {
    const d = grade(x) === GRADE_D ? y : grade(y) === GRADE_D ? x : -1
    return d >= 0 && grade(d) !== GRADE_D && !P[d].dFriendly ? 2 : 0
  }

  /** Best legal match containing `anchor` among the free players, or null. */
  function findBest(anchor: number, free: number[], mode: Mode, r: number, forced?: number): Cand | null {
    const at = P[anchor].team
    if (mode === 'filler' && at !== spareTeam) return null
    const partners: number[] = []
    const opps: number[] = []
    for (const j of free) {
      if (j === anchor || !near(anchor, j)) continue
      const jt = P[j].team
      if (!teamsActive) {
        partners.push(j)
        opps.push(j)
      } else if (mode === 'cross') {
        if (jt === at) partners.push(j)
        else opps.push(j)
      } else if (jt === at) {
        partners.push(j)
        opps.push(j)
      }
    }
    // Big pools (a roster with no teams) would be slow to search, so look at the players with the fewest games.
    const trim = (list: number[]) =>
      list.length <= POOL_LIMIT
        ? list
        : list
            .map((i) => ({ i, k: games[i] + rand() * 0.9 }))
            .sort((u, v) => u.k - v.k)
            .slice(0, POOL_LIMIT)
            .map((x) => x.i)
    // Forbidden partners are removed before trimming, so the trimmed pool is never full of illegal choices.
    let allowed = partners.filter((j) => !bad(anchor, j))
    if (forced !== undefined) allowed = allowed.filter((j) => j === forced)
    const partnerPool = forced !== undefined ? allowed : trim(allowed)
    const oppPool = trim(opps)
    let best: Cand | null = null
    for (const p of partnerPool) {
      const gs = [grade(anchor), grade(p)]
      if (!near(anchor, p)) continue
      for (let xi = 0; xi < oppPool.length; xi++) {
        const x = oppPool[xi]
        if (x === p || !near(p, x)) continue
        for (let yi = xi + 1; yi < oppPool.length; yi++) {
          const y = oppPool[yi]
          if (y === p || !near(p, y) || !near(x, y) || bad(x, y)) continue
          if (!gradeSpreadOk([...gs, grade(x), grade(y)])) continue
          // With Upper C named: two C players (one of them Upper C) never play against two D players.
          if (upperIdx.size > 0 && (strongC(anchor, p) && bothD(x, y) || bothD(anchor, p) && strongC(x, y))) continue
          const wa = (isW(anchor) ? 1 : 0) + (isW(p) ? 1 : 0)
          const wb = (isW(x) ? 1 : 0) + (isW(y) ? 1 : 0)
          let A: [number, number] = [anchor, p]
          let B: [number, number] = [x, y]
          let tier: Cand['tier'] = 'ideal'
          let kind: Cand['kind']
          if (wa === wb) {
            kind = wa === 0 ? 'MD' : wa === 1 ? 'XD' : 'WD'
          } else if ((wa === 2 && wb === 0) || (wa === 0 && wb === 2)) {
            if (wa === 0) [A, B] = [B, A] // the women's side is side A
            const hs = startScore(
              [{ gender: 'F', grade: grade(A[0]), upper: upperIdx.has(A[0]) }, { gender: 'F', grade: grade(A[1]), upper: upperIdx.has(A[1]) }],
              [{ gender: 'M', grade: grade(B[0]), upper: upperIdx.has(B[0]) }, { gender: 'M', grade: grade(B[1]), upper: upperIdx.has(B[1]) }],
            )
            if (!hs.covered) continue
            kind = 'HD'
            tier = 'handicap'
          } else continue
          const ids = [anchor, p, x, y]
          const known = ids.map(grade).filter((g): g is number => g != null)
          const same = known.every((g) => g === known[0])
          let cost = 0
          if (tier === 'handicap') cost += 30
          else if (!same) {
            cost += 25
            tier = 'close'
          }
          if (mode === 'filler') {
            cost += 40
            tier = 'filler'
          }
          cost += (partnerHist.get(key(anchor, p)) ?? 0) * 10 + (partnerHist.get(key(x, y)) ?? 0) * 10
          for (const u of [anchor, p]) for (const v of [x, y]) cost += (oppHist.get(key(u, v)) ?? 0) * 2
          cost += partnerPenalty(anchor, p) + partnerPenalty(x, y) + upperPenalty(anchor, p) + upperPenalty(x, y)
          cost += 0.6 * (games[p] + games[x] + games[y]) + 0.9 * (adjacent(p, r) + adjacent(x, r) + adjacent(y, r))
          // Preferred women: women's doubles is cheaper and mixed doubles dearer.
          if (wdIdx.size > 0 && (kind === 'WD' || kind === 'XD')) for (const i of ids) if (wdIdx.has(i)) cost += kind === 'WD' ? -WD_BONUS : WD_BONUS
          cost += rand() * 0.05
          if (!best || cost < best.cost) best = { a: A, b: B, cost, tier, kind }
        }
      }
    }
    return best
  }

  /** Record a chosen match in its round. */
  function place(rs: RoundState, found: Cand) {
    rs.matches.push(found)
    for (const i of [...found.a, ...found.b]) {
      rs.used.add(i)
      games[i]++
    }
    partnerHist.set(key(found.a[0], found.a[1]), (partnerHist.get(key(found.a[0], found.a[1])) ?? 0) + 1)
    partnerHist.set(key(found.b[0], found.b[1]), (partnerHist.get(key(found.b[0], found.b[1])) ?? 0) + 1)
    for (const u of found.a) for (const v of found.b) oppHist.set(key(u, v), (oppHist.get(key(u, v)) ?? 0) + 1)
  }

  /** Give the pairs that must partner their match in round r, if both are free. Returns how many were placed. */
  function placeRequired(r: number): number {
    const rs = rounds[r - 1]
    let placed = 0
    required.forEach(([a, b], k) => {
      if (met[k] || rs.matches.length >= courts) return
      if (rs.used.has(a) || rs.used.has(b) || games[a] >= cap || games[b] >= cap || !canPlay(a, r) || !canPlay(b, r)) return
      const free: number[] = []
      for (let i = 0; i < n; i++) if (!rs.used.has(i) && games[i] < cap && canPlay(i, r)) free.push(i)
      const c = findBest(a, free, 'cross', r, b)
      if (c) {
        place(rs, c)
        met[k] = true
        placed++
      }
    })
    return placed
  }

  /** Put as many matches as possible into round r. Returns how many were added. */
  function fillRound(r: number, mode: Mode): number {
    const rs = rounds[r - 1]
    const failed = new Set<number>()
    let placed = 0
    while (rs.matches.length < courts) {
      const free: number[] = []
      for (let i = 0; i < n; i++) if (!rs.used.has(i) && games[i] < cap && canPlay(i, r)) free.push(i)
      if (free.length < 4) break
      // Scarce players (few compatible opponents) and players with few games go first.
      const ranked = free
        .filter((i) => !failed.has(i))
        .map((i) => {
          let compat = 0
          for (const j of free) if (j !== i && near(i, j) && (!teamsActive || P[j].team !== P[i].team || mode === 'filler')) compat++
          // With Upper C named, B players pick their partner first, so they get the choice of Upper C players.
          const wdFirst = wdIdx.has(i) ? 1.2 : 0
          const bFirst = upperIdx.size > 0 && grade(i) === GRADE_B ? 1.2 : 0
          return { i, pri: games[i] + 0.9 * adjacent(i, r) + compat * 0.08 + rand() * 0.2 - bFirst - wdFirst }
        })
        .sort((u, v) => u.pri - v.pri)
      let found: Cand | null = null
      for (const { i } of ranked) {
        const c = findBest(i, free, mode, r)
        if (c) {
          found = c
          break
        }
        failed.add(i)
      }
      if (!found) break
      place(rs, found)
      placed++
    }
    return placed
  }

  const addRound = () => rounds.push({ used: new Set(), matches: [] })
  const maxRounds = Math.max(0, targets.maxRounds)

  // Phase 1: cross-team matches, round by round.
  while (rounds.length < maxRounds) {
    addRound()
    const req = placeRequired(rounds.length)
    if (fillRound(rounds.length, 'cross') + req === 0) {
      rounds.pop()
      break
    }
  }
  // Phase 2: top up earlier rounds that have free courts, then filler matches for the larger team, then extra rounds.
  for (let r = 1; r <= rounds.length; r++) {
    placeRequired(r)
    fillRound(r, 'cross')
  }
  if (spareTeam) for (let r = 1; r <= rounds.length; r++) fillRound(r, 'filler')
  while (rounds.length < maxRounds && games.some((g) => g < cap)) {
    addRound()
    const placed = placeRequired(rounds.length) + fillRound(rounds.length, 'cross') + (spareTeam ? fillRound(rounds.length, 'filler') : 0)
    if (placed === 0) {
      rounds.pop()
      break
    }
  }
  // Drop empty trailing rounds.
  while (rounds.length && rounds[rounds.length - 1].matches.length === 0) rounds.pop()

  const matches: PlannedMatch[] = []
  const counts = { MD: 0, XD: 0, WD: 0, HD: 0, filler: 0, close: 0 }
  rounds.forEach((rs, idx) => {
    // Men's doubles take the lower court numbers, then mixed, women's, handicap.
    const sorted = [...rs.matches].sort((u, v) => KIND_ORDER[u.kind] - KIND_ORDER[v.kind])
    sorted.forEach((m, c) => {
      counts[m.kind]++
      if (m.tier === 'filler') counts.filler++
      if (m.tier === 'close') counts.close++
      matches.push({ event: m.kind === 'MD' ? 'MD' : 'XD', round: idx + 1, court: c + 1, a1: P[m.a[0]].id, a2: P[m.a[1]].id, b1: P[m.b[0]].id, b2: P[m.b[1]].id })
    })
  })
  const underCap = P.filter((_, i) => games[i] < cap).map((p) => p.id)
  const total = games.reduce((s, g) => s + g, 0)
  let repeats = 0
  partnerHist.forEach((v) => (repeats += (v - 1) * 10))
  oppHist.forEach((v) => (repeats += v - 1))
  const warnings: string[] = []
  if (underCap.length) warnings.push(`${underCap.length} player(s) have fewer than ${cap} games.`)
  return {
    matches,
    rounds: rounds.length,
    mdCount: counts.MD,
    xdCount: counts.XD,
    wdCount: counts.WD,
    hdCount: counts.HD,
    fillerCount: counts.filler,
    closeCount: counts.close,
    gamesPerPlayer: new Map(P.map((p, i) => [p.id, games[i]])),
    underCap,
    unmetPairs: required.filter((_, k) => !met[k]).map(([a, b]) => [P[a].id, P[b].id] as [number, number]),
    warnings,
    // Lower is better, compared left to right: players short of the cap, then fewest games, then total games.
    rank: [met.filter((m) => !m).length, underCap.length, cap - Math.min(...games), -total, counts.HD + counts.filler, counts.close, repeats, rounds.length],
  }
}

const ATTEMPTS = 14
const POOL_LIMIT = 14

/**
 * Build a draw. Tries several seeds and keeps the best: first the one that meets every required pair, then the one that
 * gives the most players their full games. Pairing rules are never broken; a player may get fewer games instead.
 */
export function generatePlan(players: SchedPlayer[], courts: number, targets: Targets, seed: number, rules?: SchedRules): Plan {
  let best: (Plan & { rank: number[] }) | null = null
  for (let i = 0; i < ATTEMPTS; i++) {
    const p = generateOnce(players, courts, targets, seed * 101 + i, rules)
    if (!best) best = p
    else {
      for (let k = 0; k < p.rank.length; k++) {
        if (p.rank[k] !== best.rank[k]) {
          if (p.rank[k] < best.rank[k]) best = p
          break
        }
      }
    }
  }
  const { rank: _rank, ...plan } = best!
  return plan
}
