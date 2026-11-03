export type Gender = 'M' | 'F'
export type EventType = 'MD' | 'XD'
export type MatchStatus = 'scheduled' | 'live' | 'done' | 'cancelled'

export interface Competition {
  id: number
  name: string
  event_date: string
  start_time: string
  courts: number
  slot_minutes: number
  status: 'draft' | 'live' | 'finished'
}
export interface Player {
  id: number
  competition_id: number
  nickname: string
  gender: Gender
  grade: number | null
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
