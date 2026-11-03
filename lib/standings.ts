import type { EventType, Match, Player } from './types'

export interface Row {
  player: Player
  played: number
  won: number
  drawn: number
  lost: number
  pf: number
  pa: number
  diff: number
  pts: number
}

/** Win 2 / Draw 1 / Loss 0; tiebreak: points difference, then points scored. */
export function standings(players: Player[], matches: Match[], event: EventType | 'ALL'): Row[] {
  const rows = new Map<number, Row>(
    players.map((p) => [p.id, { player: p, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, diff: 0, pts: 0 }]),
  )
  for (const m of matches) {
    if (m.status !== 'done' || m.score_a == null || m.score_b == null) continue
    if (event !== 'ALL' && m.event !== event) continue
    const sides: [number[], number, number][] = [
      [[m.a1, m.a2], m.score_a, m.score_b],
      [[m.b1, m.b2], m.score_b, m.score_a],
    ]
    for (const [ids, f, a] of sides) {
      for (const id of ids) {
        const r = rows.get(id)
        if (!r) continue
        r.played++
        r.pf += f
        r.pa += a
        if (f > a) {
          r.won++
          r.pts += 2
        } else if (f === a) {
          r.drawn++
          r.pts += 1
        } else {
          r.lost++
        }
      }
    }
  }
  return [...rows.values()]
    .filter((r) => r.played > 0)
    .map((r) => ({ ...r, diff: r.pf - r.pa }))
    .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.pf - x.pf || x.player.nickname.localeCompare(y.player.nickname))
}
