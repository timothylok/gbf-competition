import type { MatchKind } from './types'

/**
 * Starting score (handicap) for every match, from the gender and grade of all four players (docs/game-rules.md).
 *
 * Player strength (men's figures include the extra 2 points for gender, counted once):
 *            B   Upper C   C   D
 *   men     14      8      6   4
 *   women    6      3      2   1
 * Team strength = the two players added. Handicap = ceil(|A - B| / 2), given to the weaker team; equal teams start 0:0.
 * Any match type can have one (men's, women's, mixed, or sides of different types). Grades other than B, C and D
 * are not in the table, so a match with one of them shows "to be confirmed".
 */
export interface Lineup {
  gender: 'M' | 'F'
  grade: number | null
  /** Upper C: a C player ranked above the other C players. */
  upper?: boolean
}
export interface StartScore {
  /** Points side A starts with. */
  a: number
  /** Points side B starts with. */
  b: number
  /** False when a player's grade is missing or not B, C or D. */
  covered: boolean
}

const GRADE_B = 2
const GRADE_C = 3
const GRADE_D = 4
export const STRENGTH = {
  M: { B: 14, U: 8, C: 6, D: 4 },
  F: { B: 6, U: 3, C: 2, D: 1 },
} as const

/** A player's strength, or null when the grade is not B, Upper C, C or D. */
export function strength(p: Lineup): number | null {
  const w = STRENGTH[p.gender]
  if (p.grade === GRADE_B) return w.B
  if (p.grade === GRADE_C) return p.upper ? w.U : w.C
  if (p.grade === GRADE_D) return w.D
  return null
}

export function startScore(a: [Lineup, Lineup], b: [Lineup, Lineup]): StartScore {
  const s = [...a, ...b].map(strength)
  if (s.some((x) => x == null)) return { a: 0, b: 0, covered: false }
  const sa = s[0]! + s[1]!
  const sb = s[2]! + s[3]!
  const points = Math.ceil(Math.abs(sa - sb) / 2)
  return { a: sa < sb ? points : 0, b: sb < sa ? points : 0, covered: true }
}

export function startScoreOf(m: { a1: number; a2: number; b1: number; b2: number }, info: Record<number, Lineup>): StartScore | null {
  const [a1, a2, b1, b2] = [m.a1, m.a2, m.b1, m.b2].map((i) => info[i])
  if (!a1 || !a2 || !b1 || !b2) return null
  return startScore([a1, a2], [b1, b2])
}

/** "Start 0 : 8", or "Start: to be confirmed" when a grade is outside the table. */
export function startLabel(s: StartScore, t: (k: 'startScore' | 'startTbc') => string): string {
  return s.covered ? `${t('startScore')} ${s.a} : ${s.b}` : t('startTbc')
}

/**
 * On-screen kind of a match: men's (MD), women's (WD) and mixed (XD) doubles when both sides are the same type;
 * sides of different types (men vs women, men vs mixed, women vs mixed) are cross doubles (HD). WD and HD are
 * stored as XD, so the database needs no change.
 */
export function matchKind(m: { event: 'MD' | 'XD'; a1: number; a2: number; b1: number; b2: number }, info: Record<number, Lineup>): MatchKind {
  const men = (x: number, y: number) => (info[x]?.gender === 'M' ? 1 : 0) + (info[y]?.gender === 'M' ? 1 : 0)
  if ([m.a1, m.a2, m.b1, m.b2].some((i) => !info[i])) return m.event
  const ma = men(m.a1, m.a2)
  const mb = men(m.b1, m.b2)
  if (ma !== mb) return 'HD'
  return ma === 2 ? 'MD' : ma === 1 ? 'XD' : 'WD'
}

/**
 * Opponent rules that hold whatever the line-up: all four players within one grade (so B never meets D), and two
 * C players with at least one Upper C never play two D players. A handicap never makes a match allowed.
 */
export function opponentsAllowed(a: [Lineup, Lineup], b: [Lineup, Lineup]): boolean {
  const known = [...a, ...b].map((p) => p.grade).filter((g): g is number => g != null)
  if (known.length && Math.max(...known) - Math.min(...known) > 1) return false
  const strongC = (s: [Lineup, Lineup]) => s.every((p) => p.grade === GRADE_C) && s.some((p) => p.upper)
  const bothD = (s: [Lineup, Lineup]) => s.every((p) => p.grade === GRADE_D)
  return !((strongC(a) && bothD(b)) || (bothD(a) && strongC(b)))
}
