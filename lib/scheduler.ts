import type { EventType, Gender } from './types'
import { headStart } from './handicap'

/**
 * The draw. Rules (see docs/game-rules.md):
 *  - Teams: when some nicknames end in "-F" (Philippines) and others do not, every match is Philippines vs the rest,
 *    each side made of two players from one team. The team with spare game-slots may play same-team "filler" matches
 *    once the cross-team matches run out.
 *  - Same type on both sides: men vs men, women vs women, or one man + one woman vs the same. When that is not
 *    possible, two women may play two men with a head start (handicap).
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
  warnings: string[]
}

const GRADE_D = 4

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

function generateOnce(players: SchedPlayer[], courts: number, targets: Targets, seed: number): Plan & { rank: number[] } {
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

  const isW = (i: number) => P[i].gender === 'F'
  const grade = (i: number) => P[i].grade
  const near = (i: number, j: number) => {
    const a = grade(i)
    const b = grade(j)
    return a == null || b == null || Math.abs(a - b) <= 1
  }
  const adjacent = (i: number, r: number) => (rounds[r - 2]?.used.has(i) ? 1 : 0) + (rounds[r]?.used.has(i) ? 1 : 0)

  function partnerPenalty(x: number, y: number) {
    const d = grade(x) === GRADE_D ? y : grade(y) === GRADE_D ? x : -1
    return d >= 0 && grade(d) !== GRADE_D && !P[d].dFriendly ? 2 : 0
  }

  /** Best legal match containing `anchor` among the free players, or null. */
  function findBest(anchor: number, free: number[], mode: Mode, r: number): Cand | null {
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
    const partnerPool = trim(partners)
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
          if (y === p || !near(p, y) || !near(x, y)) continue
          if (!gradeSpreadOk([...gs, grade(x), grade(y)])) continue
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
            const hs = headStart(
              [{ gender: 'F', grade: grade(A[0]) }, { gender: 'F', grade: grade(A[1]) }],
              [{ gender: 'M', grade: grade(B[0]) }, { gender: 'M', grade: grade(B[1]) }],
            )
            if (!hs || !hs.covered || hs.half) continue
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
          cost += partnerPenalty(anchor, p) + partnerPenalty(x, y)
          cost += 0.6 * (games[p] + games[x] + games[y]) + 0.9 * (adjacent(p, r) + adjacent(x, r) + adjacent(y, r))
          cost += rand() * 0.05
          if (!best || cost < best.cost) best = { a: A, b: B, cost, tier, kind }
        }
      }
    }
    return best
  }

  /** Put as many matches as possible into round r. Returns how many were added. */
  function fillRound(r: number, mode: Mode): number {
    const rs = rounds[r - 1]
    const failed = new Set<number>()
    let placed = 0
    while (rs.matches.length < courts) {
      const free: number[] = []
      for (let i = 0; i < n; i++) if (!rs.used.has(i) && games[i] < cap) free.push(i)
      if (free.length < 4) break
      // Scarce players (few compatible opponents) and players with few games go first.
      const ranked = free
        .filter((i) => !failed.has(i))
        .map((i) => {
          let compat = 0
          for (const j of free) if (j !== i && near(i, j) && (!teamsActive || P[j].team !== P[i].team || mode === 'filler')) compat++
          return { i, pri: games[i] + 0.9 * adjacent(i, r) + compat * 0.08 + rand() * 0.2 }
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
      rs.matches.push(found)
      for (const i of [...found.a, ...found.b]) {
        rs.used.add(i)
        games[i]++
      }
      partnerHist.set(key(found.a[0], found.a[1]), (partnerHist.get(key(found.a[0], found.a[1])) ?? 0) + 1)
      partnerHist.set(key(found.b[0], found.b[1]), (partnerHist.get(key(found.b[0], found.b[1])) ?? 0) + 1)
      for (const u of found.a) for (const v of found.b) oppHist.set(key(u, v), (oppHist.get(key(u, v)) ?? 0) + 1)
      placed++
    }
    return placed
  }

  const addRound = () => rounds.push({ used: new Set(), matches: [] })
  const maxRounds = Math.max(0, targets.maxRounds)

  // Phase 1: cross-team matches, round by round.
  while (rounds.length < maxRounds) {
    addRound()
    if (fillRound(rounds.length, 'cross') === 0) {
      rounds.pop()
      break
    }
  }
  // Phase 2: top up earlier rounds that have free courts, then filler matches for the larger team, then extra rounds.
  for (let r = 1; r <= rounds.length; r++) fillRound(r, 'cross')
  if (spareTeam) for (let r = 1; r <= rounds.length; r++) fillRound(r, 'filler')
  while (rounds.length < maxRounds && games.some((g) => g < cap)) {
    addRound()
    const placed = fillRound(rounds.length, 'cross') + (spareTeam ? fillRound(rounds.length, 'filler') : 0)
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
    warnings,
    // Lower is better, compared left to right: players short of the cap, then fewest games, then total games.
    rank: [underCap.length, cap - Math.min(...games), -total, counts.HD + counts.filler, counts.close, repeats, rounds.length],
  }
}

const ATTEMPTS = 14
const POOL_LIMIT = 14

/** Build a draw. Tries several seeds and keeps the one that gives the most players their full games. */
export function generatePlan(players: SchedPlayer[], courts: number, targets: Targets, seed: number): Plan {
  let best: (Plan & { rank: number[] }) | null = null
  for (let i = 0; i < ATTEMPTS; i++) {
    const p = generateOnce(players, courts, targets, seed * 101 + i)
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
