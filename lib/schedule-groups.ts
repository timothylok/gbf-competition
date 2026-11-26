import { withGrade } from './grade'
import { headStartOf, matchKind } from './handicap'
import type { T } from './i18n'
import { roundRange } from './time'
import type { Competition, Match, Player } from './types'

export interface ScheduleRow {
  /** "09:00–09:15" */
  when: string
  round: number
  court: number
  /** "Court 3" */
  courtLabel: string
  /** Men's doubles / Mixed doubles / Handicap doubles */
  kind: string
  /** Each side as "Alex - (C) / Sam - (B)". */
  sideA: string
  sideB: string
  /** "Women start +4" for handicap matches. */
  note: string
}
export interface ScheduleGroup {
  title: string
  rows: ScheduleRow[]
}

/**
 * Schedule grouped by court (each court sorted by time) or by time (each round sorted by court).
 * Players are written as "nickname - (G)" with G the grade letter. Cancelled matches are left out.
 */
export function scheduleGroups(comp: Competition, players: Player[], matches: Match[], by: 'court' | 'time', t: T): ScheduleGroup[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const info = Object.fromEntries(players.map((p) => [p.id, { gender: p.gender, grade: p.grade }]))
  const label = (id: number) => {
    const p = byId.get(id)
    return p ? withGrade(p.nickname, p.grade) : '?'
  }
  const toRow = (m: Match): ScheduleRow => {
    const hs = headStartOf(m, info)
    return {
      when: roundRange(comp.start_time, comp.slot_minutes, m.round),
      round: m.round,
      court: m.court,
      courtLabel: `${t('court')} ${m.court}`,
      kind: t(matchKind(m, info)),
      sideA: `${label(m.a1)} / ${label(m.a2)}`,
      sideB: `${label(m.b1)} / ${label(m.b2)}`,
      note: hs ? (hs.covered ? `${t('headStart')}${hs.points}` : t('headStartTbc')) : '',
    }
  }
  const live = matches.filter((m) => m.status !== 'cancelled')
  const groups: ScheduleGroup[] = []
  if (by === 'court') {
    for (const c of [...new Set(live.map((m) => m.court))].sort((a, b) => a - b)) {
      const ms = live.filter((m) => m.court === c).sort((a, b) => a.round - b.round)
      groups.push({ title: `${t('court')} ${c} (${ms.length} ${t('textMatches')})`, rows: ms.map(toRow) })
    }
  } else {
    for (const r of [...new Set(live.map((m) => m.round))].sort((a, b) => a - b)) {
      const ms = live.filter((m) => m.round === r).sort((a, b) => a.court - b.court)
      groups.push({ title: `${roundRange(comp.start_time, comp.slot_minutes, r)} · ${t('round')} ${r} (${ms.length} ${t('textMatches')})`, rows: ms.map(toRow) })
    }
  }
  return groups
}

/** One line of plain text per match, for copying. */
export function groupsToText(comp: Competition, groups: ScheduleGroup[], by: 'court' | 'time', empty: string): string {
  const lines: string[] = [`${comp.name} · ${comp.event_date}`, '']
  for (const g of groups) {
    lines.push(g.title)
    for (const r of g.rows) {
      const lead = by === 'court' ? r.when : r.courtLabel
      lines.push(`${lead}  ${r.kind}: ${r.sideA} vs ${r.sideB}${r.note ? ` [${r.note}]` : ''}`)
    }
    lines.push('')
  }
  if (groups.length === 0) lines.push(empty)
  return lines.join('\n').trimEnd()
}

