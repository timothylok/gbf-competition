export type Gender = 'M' | 'F'
export type EventType = 'MD' | 'XD'
/** What a match looks like on screen: sides of different types (e.g. men vs women) show as cross doubles (HD), stored as XD. */
export type MatchKind = EventType | 'HD' | 'WD'
export type MatchStatus = 'scheduled' | 'live' | 'done' | 'cancelled'

export interface Competition {
  id: number
  name: string
  event_date: string
  start_time: string
  courts: number
  slot_minutes: number
  /** Latest finish time (HH:MM). Null = start time + 5 hours. */
  end_time: string | null
  /** Pairing rules, one per line (see lib/pairing-rules.ts). Null = none. */
  pairing_rules: string | null
  status: 'draft' | 'live' | 'finished'
}
export interface Player {
  id: number
  competition_id: number
  nickname: string
  gender: Gender
  grade: number | null
  /** Happy to partner a D-grade player. */
  d_friendly: boolean
  /** Upper C (set from the pairing rules): a C player ranked half a grade above the other C players. */
  upper_c: boolean
}
export interface Match {
  id: number
  competition_id: number
  event: EventType
  round: number
  court: number
  a1: number
  a2: number
  b1: number
  b2: number
  score_a: number | null
  score_b: number | null
  status: MatchStatus
  version: number
}
