import 'server-only'
import { query } from './db'
import type { Competition, Match, Player } from './types'

const COMP_COLS = 'id, name, event_date, start_time, courts, slot_minutes, status'

export async function listCompetitions(includeDrafts: boolean): Promise<Competition[]> {
  return query<Competition>(
    `SELECT ${COMP_COLS} FROM competitions ${includeDrafts ? '' : "WHERE status <> 'draft'"} ORDER BY event_date DESC, id DESC`,
  )
}

export async function getCompetition(id: number): Promise<Competition | null> {
  const rows = await query<Competition>(`SELECT ${COMP_COLS} FROM competitions WHERE id = $1`, [id])
  return rows[0] ?? null
}

/** Public default: the live competition, else the most recent finished one. Drafts are admin-only. */
export async function resolveCompetition(param: string | undefined, isAdmin: boolean): Promise<Competition | null> {
  const id = Number(param)
  if (param && Number.isInteger(id) && id > 0) {
    const c = await getCompetition(id)
    if (c && (isAdmin || c.status !== 'draft')) return c
    return null
  }
  const rows = await query<Competition>(
    `SELECT ${COMP_COLS} FROM competitions WHERE status <> 'draft'
     ORDER BY (status = 'live') DESC, event_date DESC, id DESC LIMIT 1`,
  )
  return rows[0] ?? null
}

export async function getPlayers(competitionId: number): Promise<Player[]> {
  return query<Player>(
    'SELECT id, competition_id, nickname, gender, grade FROM players WHERE competition_id = $1 ORDER BY lower(nickname)',
    [competitionId],
  )
}

export async function getMatches(competitionId: number): Promise<Match[]> {
  return query<Match>(
    `SELECT id, competition_id, event, round, court, a1, a2, b1, b2, score_a, score_b, status, version
     FROM matches WHERE competition_id = $1 ORDER BY round, court`,
    [competitionId],
  )
}
