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
export interface Plan {
  matches: PlannedMatch[]
  rounds: number
  mdCount: number
  xdCount: number
  gamesPerPlayer: Map<number, number>
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
 * How many matches of each type give everyone about `target` games.
 * Women only play mixed doubles; men fill the remaining slots with men's doubles.
 */
export function planCounts(men: number, women: number, target: number) {
  const xd = Math.min(Math.floor((women * target) / 2), Math.floor((men * target) / 2))
  const menLeft = men * target - 2 * xd
  const md = menLeft >= 4 ? Math.floor(menLeft / 4) : 0
  return { xd, md }
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

function generateOnce(players: SchedPlayer[], courts: number, target: number, seed: number): Plan & { cost: number } {
  const rand = rng(seed)
  const men = players.filter((p) => p.gender === 'M')
  const women = players.filter((p) => p.gender === 'F')
  const counts = planCounts(men.length, women.length, target)
  const warnings: string[] = []
  let xdLeft = counts.xd
  let mdLeft = counts.md

  const played = new Map(players.map((p) => [p.id, 0]))
  const lastRound = new Map(players.map((p) => [p.id, -99]))
  const hist: History = { partner: new Map(), opponent: new Map() }
  const out: PlannedMatch[] = []
  let totalCost = 0

  // Fewest games first; among equals, prefer players who sat out the previous round.
  const priority = (pool: SchedPlayer[], round: number) =>
    shuffle(pool, rand).sort(
      (a, b) =>
        played.get(a.id)! + (lastRound.get(a.id) === round - 1 ? 0.9 : 0) -
        (played.get(b.id)! + (lastRound.get(b.id) === round - 1 ? 0.9 : 0)),
    )

  let round = 0
  while (xdLeft + mdLeft > 0 && round < 60) {
    round++
    const slots = Math.min(courts, xdLeft + mdLeft)
    // Spread mixed and men's matches proportionally across the rounds.
    let b = Math.round((slots * xdLeft) / (xdLeft + mdLeft))
    let a = slots - b
    a = Math.min(a, mdLeft)
    b = Math.min(b, xdLeft)
    while (b > 0 && (b * 2 > women.length || b * 2 + a * 4 > men.length)) {
      if (a > 0) a--
      else b--
    }
    while (a > 0 && b * 2 + a * 4 > men.length) a--
    if (a + b === 0) break

    const menOrder = priority(men, round).slice(0, 2 * b + 4 * a)
    const womenOrder = priority(women, round).slice(0, 2 * b)
    if (menOrder.length < 2 * b + 4 * a || womenOrder.length < 2 * b) {
      warnings.push(`Round ${round}: not enough players to fill every court.`)
      break
    }

    // Try several random groupings of the chosen players; keep the lowest-cost one.
    let bestRound: { cost: number; ms: PlannedMatch[] } | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const m = shuffle(menOrder, rand)
      const w = shuffle(womenOrder, rand)
      const ms: PlannedMatch[] = []
      let cost = 0
      for (let i = 0; i < b; i++) {
        const four = [m[2 * i], m[2 * i + 1], w[2 * i], w[2 * i + 1]]
        const r = bestPairing(four, 'XD', hist)
        cost += r.cost
        ms.push({ event: 'XD', round, court: 0, a1: r.a[0].id, a2: r.a[1].id, b1: r.b[0].id, b2: r.b[1].id })
      }
      for (let i = 0; i < a; i++) {
        const four = m.slice(2 * b + 4 * i, 2 * b + 4 * i + 4)
        const r = bestPairing(four, 'MD', hist)
        cost += r.cost
        ms.push({ event: 'MD', round, court: 0, a1: r.a[0].id, a2: r.a[1].id, b1: r.b[0].id, b2: r.b[1].id })
      }
      if (!bestRound || cost < bestRound.cost) bestRound = { cost, ms }
      if (cost === 0) break
    }
    totalCost += bestRound!.cost
    bestRound!.ms.forEach((mt, idx) => {
      mt.court = idx + 1
      out.push(mt)
      for (const id of [mt.a1, mt.a2, mt.b1, mt.b2]) {
        played.set(id, played.get(id)! + 1)
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
  return { matches: out, rounds: round, mdCount: counts.md, xdCount: counts.xd, gamesPerPlayer: played, warnings, cost: totalCost }
}

/** Build a draw. Tries several seeds and keeps the one with the fewest repeat partners/opponents. */
export function generatePlan(players: SchedPlayer[], courts: number, target: number, seed: number): Plan {
  let best: (Plan & { cost: number }) | null = null
  for (let i = 0; i < 12; i++) {
    const p = generateOnce(players, courts, target, seed * 101 + i)
    if (!best || p.warnings.length < best.warnings.length || (p.warnings.length === best.warnings.length && p.cost < best.cost)) best = p
  }
  const { cost: _cost, ...plan } = best!
  const lowest = Math.min(...players.map((p) => plan.gamesPerPlayer.get(p.id) ?? 0))
  if (lowest < target) plan.warnings.push(`Some players get fewer than ${target} games (minimum ${lowest}). Check the male/female balance.`)
  return plan
}
