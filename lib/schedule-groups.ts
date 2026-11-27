import { gradeToLetter, withGrade } from './grade'
import { headStartOf, matchKind } from './handicap'
import type { T } from './i18n'
import { roundRange, warmupRange } from './time'
import type { Competition, Match, MatchKind, Player } from './types'

/** One player on a side: the nickname and the grade letter ("" when there is none). */
export interface SidePlayer {
  name: string
  grade: string
}

export interface ScheduleRow {
  /** "09:00–09:15" */
  when: string
  round: number
  court: number
  /** "Court 3" */
  courtLabel: string
  /** Men's doubles / Mixed doubles / Handicap doubles */
  kind: string
  /** Which kind of match: used for colours. */
  kindKey?: MatchKind
  /** Each side as "Alex - (C) / Sam - (B)". */
  sideA: string
  sideB: string
  /** The same players as data, for the PDF. */
  a?: SidePlayer[]
  b?: SidePlayer[]
  /** "Women start +4" for handicap matches. */
  note: string
  /** The warm-up line: no match is played in the first 15 minutes. */
  warmup?: boolean
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
  const info = Object.fromEntries(players.map((p) => [p.id, { gender: p.gender, grade: p.grade, upper: p.upper_c }]))
  const label = (id: number) => {
    const p = byId.get(id)
    return p ? withGrade(p.nickname, p.grade) : '?'
  }
  const person = (id: number): SidePlayer => {
    const p = byId.get(id)
    return p ? { name: p.nickname, grade: gradeToLetter(p.grade) } : { name: '?', grade: '' }
  }
  const toRow = (m: Match): ScheduleRow => {
    const hs = headStartOf(m, info)
    return {
      when: roundRange(comp.start_time, comp.slot_minutes, m.round),
      round: m.round,
      court: m.court,
      courtLabel: `${t('court')} ${m.court}`,
      kind: t(matchKind(m, info)),
      kindKey: matchKind(m, info),
      a: [person(m.a1), person(m.a2)],
      b: [person(m.b1), person(m.b2)],
      sideA: `${label(m.a1)} / ${label(m.a2)}`,
      sideB: `${label(m.b1)} / ${label(m.b2)}`,
      note: hs ? (hs.covered ? `${t('headStart')}${hs.points}` : t('headStartTbc')) : '',
    }
  }
  const live = matches.filter((m) => m.status !== 'cancelled')
  const groups: ScheduleGroup[] = []
  const warm = warmupRange(comp.start_time)
  if (by === 'court') {
    for (const c of [...new Set(live.map((m) => m.court))].sort((a, b) => a - b)) {
      const ms = live.filter((m) => m.court === c).sort((a, b) => a.round - b.round)
      const warmRow: ScheduleRow = { when: warm, round: 0, court: c, courtLabel: `${t('court')} ${c}`, kind: t('warmup'), sideA: '', sideB: '', note: '', warmup: true }
      groups.push({ title: `${t('court')} ${c} (${ms.length} ${t('textMatches')})`, rows: [warmRow, ...ms.map(toRow)] })
    }
  } else {
    groups.push({ title: `${warm} · ${t('warmup')} (${t('allCourts')})`, rows: [] })
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
      if (r.warmup) {
        lines.push(`${r.when}  ${r.kind}`)
        continue
      }
      const lead = by === 'court' ? r.when : r.courtLabel
      lines.push(`${lead}  ${r.kind}: ${r.sideA} vs ${r.sideB}${r.note ? ` [${r.note}]` : ''}`)
    }
    lines.push('')
  }
  if (groups.every((g) => g.rows.every((r) => r.warmup))) lines.push(empty)
  return lines.join('\n').trimEnd()
}

