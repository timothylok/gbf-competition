import { gradeToLetter } from './grade'
import { teamOf, type Team } from './team'

export interface TeamGrade { letter: string; men: string[]; women: string[] }
export interface TeamList { key: Team; count: number; men: number; women: number; grades: TeamGrade[] }

/** Nickname as shown on the team list: without the -F / -RW team suffix. */
export const shortName = (nickname: string) => nickname.trim().replace(/-(f|rw)$/i, '')

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/** The two team lists (Philippines, then the rest), each grouped by grade and sex, names sorted. A player without a grade goes under "?". */
export function teamLists(players: { nickname: string; gender: 'M' | 'F'; grade: number | null }[]): TeamList[] {
  const letters = [...new Set(players.map((p) => gradeToLetter(p.grade) || '?'))].sort((a, b) => (a === '?' ? 1 : b === '?' ? -1 : a.localeCompare(b)))
  return (['F', 'R'] as const).map((key) => {
    const mine = players.filter((p) => teamOf(p.nickname) === key)
    const pick = (letter: string, g: 'M' | 'F') =>
      mine.filter((p) => (gradeToLetter(p.grade) || '?') === letter && p.gender === g).map((p) => shortName(p.nickname)).sort(byName)
    return {
      key,
      count: mine.length,
      men: mine.filter((p) => p.gender === 'M').length,
      women: mine.filter((p) => p.gender === 'F').length,
      grades: letters.map((letter) => ({ letter, men: pick(letter, 'M'), women: pick(letter, 'F') })).filter((g) => g.men.length + g.women.length > 0),
    }
  })
}

/** Team lists only make sense when there is a Philippines team to set against the rest. */
export const hasTeams = (players: { nickname: string }[]) => players.some((p) => teamOf(p.nickname) === 'F')
