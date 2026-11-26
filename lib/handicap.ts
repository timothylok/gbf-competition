/**
 * Head start (handicap) for matches where women play against men.
 *  - two women vs two men: full head start
 *  - one woman + one man vs two men: half
 *  - any other line-up: none
 * Full head start is 4 points when the sides have the same average grade, 6 when the women's side is
 * one grade lower. Grades are rounded to the nearest whole grade; halves go to the weaker grade.
 * Other grade gaps are not covered by the rules yet, so they give 0 points (shown as "to be confirmed").
 */
export interface Lineup {
  gender: 'M' | 'F'
  grade: number | null
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

const avgGrade = (p: [Lineup, Lineup]) =>
  p[0].grade == null || p[1].grade == null ? null : Math.round((p[0].grade + p[1].grade) / 2)

export function headStart(a: [Lineup, Lineup], b: [Lineup, Lineup]): HeadStart | null {
  const wa = a.filter((p) => p.gender === 'F').length
  const wb = b.filter((p) => p.gender === 'F').length
  let side: 'a' | 'b'
  let women: number
  if (wa > 0 && wb === 0) [side, women] = ['a', wa]
  else if (wb > 0 && wa === 0) [side, women] = ['b', wb]
  else return null
  const half = women === 1
  const ga = avgGrade(side === 'a' ? a : b)
  const gb = avgGrade(side === 'a' ? b : a)
  const gap = ga == null || gb == null ? null : ga - gb
  const full = gap === 0 ? FULL_SAME_GRADE : gap === 1 ? FULL_ONE_LOWER : 0
  return { side, points: half ? Math.floor(full / 2) : full, half, covered: full > 0 }
}
