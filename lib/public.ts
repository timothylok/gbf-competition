import 'server-only'
import { getSession } from './auth'
import { getMatches, getPlayers, resolveCompetition } from './queries'
import type { Names } from '@/components/MatchCard'

/** Shared loader for public pages: competition from ?c=, its players, matches and a name lookup. */
export async function loadPublic(c: string | undefined) {
  const isAdmin = !!(await getSession())
  const comp = await resolveCompetition(c, isAdmin)
  if (!comp) return null
  const [players, matches] = await Promise.all([getPlayers(comp.id), getMatches(comp.id)])
  const names: Names = Object.fromEntries(players.map((p) => [p.id, p.nickname]))
  return { comp, players, matches, names }
}
