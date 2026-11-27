/**
 * Head start (handicap) for matches where women play against men, in whole points.
 *  - two women vs two men: full head start
 *  - one woman + one man vs two men: half (rounded down)
 *  - any other line-up: none
 * Skill order: B > Upper C > C > D. Upper C sits half a grade above C. A side's strength is the average of its two
 * players. Full head start for the women's side by how much stronger the men's side is (in grades):
 *    men one grade stronger +6, half a grade +5, level +4, women half a grade stronger +3, women one grade stronger +2.
 * Gaps in between (a quarter grade, from mixed-grade pairs) round to a whole point in favour of the weaker side.
 * Anything outside +2..+6 is not covered by the rules (0 points, shown as "to be confirmed").
 */
export interface Lineup {
  gender: 'M' | 'F'
  grade: number | null
  /** Upper C: a C player ranked half a grade above the other C players. */
  upper?: boolean
}
export interface HeadStart {
  /** The side that starts ahead (the side with the women). */
  side: 'a' | 'b'
  /** Points that side starts with; 0 when the rules don't cover the grade gap. */
  points: number
  /** True when only one woman is on the side (half head start). */
  half: boolean
  /** False when the grade gap isn't covered by the rules, or a grade is missing. */
  covered: boolean
}

/**
 * On-screen kind of a match: women-vs-men line-ups are handicap (HD), four women is women's doubles (WD),
 * otherwise the stored event (MD or XD). HD and WD are stored as XD, so the database needs no change.
 */
export function matchKind(m: { event: 'MD' | 'XD'; a1: number; a2: number; b1: number; b2: number }, info: Record<number, Lineup>) {
  if (headStartOf(m, info)) return 'HD' as const
  if ([m.a1, m.a2, m.b1, m.b2].every((i) => info[i]?.gender === 'F')) return 'WD' as const
  return m.event
}

export function headStartOf(m: { a1: number; a2: number; b1: number; b2: number }, info: Record<number, Lineup>): HeadStart | null {
  const [a1, a2, b1, b2] = [m.a1, m.a2, m.b1, m.b2].map((i) => info[i])
  if (!a1 || !a2 || !b1 || !b2) return null
  return headStart([a1, a2], [b1, b2])
}

export const FULL_SAME_GRADE = 4
export const FULL_ONE_LOWER = 6
export const FULL_WOMEN_ONE_STRONGER = 2

/** Skill as a number, lower = stronger: the grade, with Upper C half a grade above C. */
const skill = (p: Lineup): number | null => (p.grade == null ? null : p.grade === 3 && p.upper ? 2.5 : p.grade)
const avgSkill = (p: [Lineup, Lineup]): number | null => {
  const x = skill(p[0])
  const y = skill(p[1])
  return x == null || y == null ? null : (x + y) / 2
}

export function headStart(a: [Lineup, Lineup], b: [Lineup, Lineup]): HeadStart | null {
  const wa = a.filter((p) => p.gender === 'F').length
  const wb = b.filter((p) => p.gender === 'F').length
  let side: 'a' | 'b'
  let women: number
  if (wa > 0 && wb === 0) [side, women] = ['a', wa]
  else if (wb > 0 && wa === 0) [side, women] = ['b', wb]
  else return null
  const half = women === 1
  const sa = avgSkill(side === 'a' ? a : b)
  const sb = avgSkill(side === 'a' ? b : a)
  // gap > 0: the men are stronger. Each grade is 2 points; a half point goes to the weaker side.
  const raw = sa == null || sb == null ? null : 4 + 2 * (sa - sb)
  const full = raw == null ? 0 : raw >= 4 ? Math.ceil(raw) : Math.floor(raw)
  const covered = raw != null && full >= FULL_WOMEN_ONE_STRONGER && full <= FULL_ONE_LOWER
  return { side, points: covered ? (half ? Math.floor(full / 2) : full) : 0, half, covered }
}
