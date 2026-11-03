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
  /** 1-based rank; players level on points, difference and points scored share it. */
  rank: number
  tied: boolean
}

/** Win 2 / Draw 1 / Loss 0; tiebreak: points difference, then points scored. */
export function standings(players: Player[], matches: Match[], event: EventType | 'ALL'): Row[] {
  const rows = new Map<number, Row>(
    players.map((p) => [p.id, { player: p, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, diff: 0, pts: 0, rank: 0, tied: false }]),
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
  const sorted = [...rows.values()]
    .filter((r) => r.played > 0)
    .map((r) => ({ ...r, diff: r.pf - r.pa }))
    .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.pf - x.pf || x.player.nickname.localeCompare(y.player.nickname))

  // Competition ranking ("1224"): equal rows share the rank of the first of them.
  const level = (a: Row, b: Row) => a.pts === b.pts && a.diff === b.diff && a.pf === b.pf
  sorted.forEach((r, i) => {
    const first = sorted.findIndex((o) => level(o, r))
    r.rank = first + 1
    r.tied = sorted.some((o) => o !== r && level(o, r))
  })
  return sorted
}
