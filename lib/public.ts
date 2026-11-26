import 'server-only'
import { getSession } from './auth'
import { withGrade } from './grade'
import { getMatches, getPlayers, resolveCompetition } from './queries'
import type { Names } from '@/components/MatchCard'
import type { Lineup } from './handicap'

export type Info = Record<number, Lineup>

/** Shared loader for public pages: competition from ?c=, its players, matches and a name lookup. */
export async function loadPublic(c: string | undefined) {
  const isAdmin = !!(await getSession())
  const comp = await resolveCompetition(c, isAdmin)
  if (!comp) return null
  const [players, matches] = await Promise.all([getPlayers(comp.id), getMatches(comp.id)])
  const names: Names = Object.fromEntries(players.map((p) => [p.id, withGrade(p.nickname, p.grade)]))
  const info: Info = Object.fromEntries(players.map((p) => [p.id, { gender: p.gender, grade: p.grade }]))
  return { comp, players, matches, names, info }
}
