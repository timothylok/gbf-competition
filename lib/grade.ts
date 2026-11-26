/** Player grades are shown to people as letters (A = strongest) and stored as numbers 1-9. */
export const MAX_GRADE = 9

/** 1 -> "A", 2 -> "B" ... Null or out-of-range gives "". */
export function gradeToLetter(grade: number | null | undefined): string {
  return grade && Number.isInteger(grade) && grade >= 1 && grade <= MAX_GRADE ? String.fromCharCode(64 + grade) : ''
}

/** "Alex - (C)": the nickname with the grade letter after it. No grade gives just the nickname. */
export function withGrade(nickname: string, grade: number | null | undefined): string {
  const letter = gradeToLetter(grade)
  return letter ? `${nickname} - (${letter})` : nickname
}

/** "B" or "b" -> 2. Digits 1-9 are still accepted. Blank gives null; anything else gives undefined. */
export function parseGrade(raw: string | undefined): number | null | undefined {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (/^[a-i]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 64
  if (/^[1-9]$/.test(s)) return Number(s)
  return undefined
}
