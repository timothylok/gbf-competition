import type { EventType, Gender } from './types'

export interface SchedPlayer {
  id: number
  gender: Gender
  grade: number | null
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
  /** Men's doubles games each man should play. */
  mdGames: number
  /** Mixed doubles games each woman should play. */
  xdGames: number
}
export interface Plan {
  matches: PlannedMatch[]
  rounds: number
  mdCount: number
  xdCount: number
  gamesPerPlayer: Map<number, number>
  mdGamesPerPlayer: Map<number, number>
  warnings: string[]
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

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Men's doubles come first: every man plays `mdGames` men's doubles games.
 * Mixed doubles come second: every woman plays `xdGames` mixed games, and men
 * fill the other two places in each mixed match as extra games (no cap).
 */
export function planCounts(men: number, women: number, t: Targets) {
  const md = men >= 4 ? Math.floor((men * t.mdGames) / 4) : 0
  const xd = men >= 2 && women >= 2 ? Math.floor((women * t.xdGames) / 2) : 0
  return { md, xd }
}

/** Rounds needed: each round uses every court at most once. */
export function roundsNeeded(matches: number, courts: number) {
  return Math.ceil(matches / courts)
}

interface History {
  partner: Map<string, number>
  opponent: Map<string, number>
}
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

type Pair = [SchedPlayer, SchedPlayer]

/** Cheapest way to split four players into two pairs; XD forces one man + one woman per side. */
function bestPairing(p: SchedPlayer[], event: EventType, h: History): { cost: number; a: Pair; b: Pair } {
  const options: [number, number, number, number][] = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ]
  let best: { cost: number; a: Pair; b: Pair } | null = null
  for (const [i, j, k, l] of options) {
    const A: Pair = [p[i], p[j]]
    const B: Pair = [p[k], p[l]]
    if (event === 'XD' && (A[0].gender === A[1].gender || B[0].gender === B[1].gender)) continue
    let cost = (h.partner.get(key(A[0].id, A[1].id)) ?? 0) * 10 + (h.partner.get(key(B[0].id, B[1].id)) ?? 0) * 10
    for (const x of A) for (const y of B) cost += (h.opponent.get(key(x.id, y.id)) ?? 0) * 2
    const sa = (A[0].grade ?? 0) + (A[1].grade ?? 0)
    const sb = (B[0].grade ?? 0) + (B[1].grade ?? 0)
    cost += Math.abs(sa - sb) * 3
    if (!best || cost < best.cost) best = { cost, a: A, b: B }
  }
  return best ?? { cost: 1e9, a: [p[0], p[1]], b: [p[2], p[3]] }
}

function generateOnce(players: SchedPlayer[], courts: number, targets: Targets, seed: number): Plan & { cost: number } {
  const rand = rng(seed)
  const men = players.filter((p) => p.gender === 'M')
  const women = players.filter((p) => p.gender === 'F')
  const counts = planCounts(men.length, women.length, targets)
  const warnings: string[] = []
  let xdLeft = counts.xd
  let mdLeft = counts.md

  const played = new Map(players.map((p) => [p.id, 0]))
  const playedMD = new Map(players.map((p) => [p.id, 0]))
  const lastRound = new Map(players.map((p) => [p.id, -99]))
  const hist: History = { partner: new Map(), opponent: new Map() }
  const out: PlannedMatch[] = []
  let totalCost = 0

  // Lowest score goes first; players who sat out the previous round are preferred on ties.
  const pick = (pool: SchedPlayer[], score: (p: SchedPlayer) => number, round: number) =>
    shuffle(pool, rand).sort(
      (a, b) =>
        score(a) + (lastRound.get(a.id) === round - 1 ? 0.9 : 0) - (score(b) + (lastRound.get(b.id) === round - 1 ? 0.9 : 0)),
    )

  let round = 0
  while (xdLeft + mdLeft > 0 && round < 60) {
    round++
    const left = xdLeft + mdLeft
    const slots = Math.min(courts, left)
    // Spread men's and mixed matches proportionally across the rounds.
    let b = Math.round((slots * xdLeft) / left)
    let a = Math.min(slots - b, mdLeft)
    b = Math.min(b, xdLeft, Math.floor(women.length / 2), Math.floor(men.length / 2))
    while (a > 0 && 4 * a + 2 * b > men.length) a--
    // Use any spare courts for more men's doubles (they come first).
    while (a + b < slots && a < mdLeft && 4 * (a + 1) + 2 * b <= men.length) a++
    if (a + b === 0) break

    // Men's doubles first: choose men with the fewest men's doubles games so far.
    const mdMen = pick(men, (p) => playedMD.get(p.id)!, round).slice(0, 4 * a)
    const taken = new Set(mdMen.map((p) => p.id))
    // Mixed second: men with the fewest total games, women with the fewest total games.
    const xdMen = pick(men.filter((p) => !taken.has(p.id)), (p) => played.get(p.id)!, round).slice(0, 2 * b)
    const xdWomen = pick(women, (p) => played.get(p.id)!, round).slice(0, 2 * b)
    if (mdMen.length < 4 * a || xdMen.length < 2 * b || xdWomen.length < 2 * b) {
      warnings.push(`Round ${round}: not enough players to fill every court.`)
      break
    }

    // Try several random groupings of the chosen players; keep the lowest-cost one.
    let bestRound: { cost: number; ms: PlannedMatch[] } | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const dm = shuffle(mdMen, rand)
      const xm = shuffle(xdMen, rand)
      const xw = shuffle(xdWomen, rand)
      const ms: PlannedMatch[] = []
      let cost = 0
      for (let i = 0; i < a; i++) {
        const r = bestPairing(dm.slice(4 * i, 4 * i + 4), 'MD', hist)
        cost += r.cost
        ms.push({ event: 'MD', round, court: 0, a1: r.a[0].id, a2: r.a[1].id, b1: r.b[0].id, b2: r.b[1].id })
      }
      for (let i = 0; i < b; i++) {
        const r = bestPairing([xm[2 * i], xm[2 * i + 1], xw[2 * i], xw[2 * i + 1]], 'XD', hist)
        cost += r.cost
        ms.push({ event: 'XD', round, court: 0, a1: r.a[0].id, a2: r.a[1].id, b1: r.b[0].id, b2: r.b[1].id })
      }
      if (!bestRound || cost < bestRound.cost) bestRound = { cost, ms }
      if (cost === 0) break
    }
    totalCost += bestRound!.cost
    // Men's doubles take the lower court numbers.
    bestRound!.ms.forEach((mt, idx) => {
      mt.court = idx + 1
      out.push(mt)
      for (const id of [mt.a1, mt.a2, mt.b1, mt.b2]) {
        played.set(id, played.get(id)! + 1)
        if (mt.event === 'MD') playedMD.set(id, playedMD.get(id)! + 1)
        lastRound.set(id, round)
      }
      hist.partner.set(key(mt.a1, mt.a2), (hist.partner.get(key(mt.a1, mt.a2)) ?? 0) + 1)
      hist.partner.set(key(mt.b1, mt.b2), (hist.partner.get(key(mt.b1, mt.b2)) ?? 0) + 1)
      for (const x of [mt.a1, mt.a2]) for (const y of [mt.b1, mt.b2]) hist.opponent.set(key(x, y), (hist.opponent.get(key(x, y)) ?? 0) + 1)
    })
    xdLeft -= b
    mdLeft -= a
  }

  const unplaced = xdLeft + mdLeft
  if (unplaced > 0) warnings.push(`${unplaced} planned match(es) could not be placed.`)
  return { matches: out, rounds: round, mdCount: counts.md, xdCount: counts.xd, gamesPerPlayer: played, mdGamesPerPlayer: playedMD, warnings, cost: totalCost }
}

/** Build a draw. Tries several seeds and keeps the one with the fewest repeat partners/opponents. */
export function generatePlan(players: SchedPlayer[], courts: number, targets: Targets, seed: number): Plan {
  let best: (Plan & { cost: number }) | null = null
  for (let i = 0; i < 12; i++) {
    const p = generateOnce(players, courts, targets, seed * 101 + i)
    if (!best || p.warnings.length < best.warnings.length || (p.warnings.length === best.warnings.length && p.cost < best.cost)) best = p
  }
  const { cost: _cost, ...plan } = best!

  const men = players.filter((p) => p.gender === 'M')
  const women = players.filter((p) => p.gender === 'F')
  if (men.length > 0 && plan.mdCount > 0) {
    const want = Math.floor((plan.mdCount * 4) / men.length)
    const got = Math.min(...men.map((p) => plan.mdGamesPerPlayer.get(p.id) ?? 0))
    if (got < want) warnings(plan, `Some men get fewer men's doubles games than planned (minimum ${got}).`)
  }
  if (women.length > 0) {
    const want = Math.floor((plan.xdCount * 2) / women.length)
    const got = Math.min(...women.map((p) => plan.gamesPerPlayer.get(p.id) ?? 0))
    if (got < want) warnings(plan, `Some women get fewer mixed games than planned (minimum ${got}).`)
  }
  if (women.length === 1 || (women.length > 0 && men.length < 2)) {
    warnings(plan, 'Mixed doubles needs at least 2 women and 2 men.')
  }
  return plan
}

function warnings(plan: Plan, msg: string) {
  plan.warnings.push(msg)
}
