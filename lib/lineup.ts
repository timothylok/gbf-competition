import { gradeSpreadOk } from './scheduler'
import { headStart } from './handicap'
import { partnerKey } from './pairing-rules'
import type { Team } from './team'

export interface LineupPlayer {
  id: number
  gender: 'M' | 'F'
  grade: number | null
  team: Team
}

/** Whether the roster has both teams, and which team (if any) has spare game-slots for same-team filler matches. */
export function teamSetup(players: { team: Team }[]): { active: boolean; spare: Team | null } {
  const nF = players.filter((p) => p.team === 'F').length
  const nR = players.length - nF
  const active = nF > 0 && nR > 0
  return { active, spare: !active || nF === nR ? null : nF > nR ? 'F' : 'R' }
}

/**
 * Problems with a line-up, for the amber warnings on hand-made or edited matches:
 *  - 'mismatch': not men vs men / women vs women / mixed vs mixed (or a women-vs-men handicap line-up)
 *  - 'grades': the four players are more than one grade apart
 *  - 'team': a side mixes teams, or both sides are from the same team when that is not allowed
 *  - 'rule': a side is a pair that a pairing rule says must not partner
 */
export function lineupIssues(
  event: 'MD' | 'XD',
  a: [LineupPlayer, LineupPlayer],
  b: [LineupPlayer, LineupPlayer],
  setup: { active: boolean; spare: Team | null },
  forbidden?: Set<string>,
): ('mismatch' | 'grades' | 'team' | 'rule')[] {
  const out: ('mismatch' | 'grades' | 'team' | 'rule')[] = []
  const women = (s: LineupPlayer[]) => s.filter((p) => p.gender === 'F').length
  const all = [...a, ...b]
  const sameType = women(a) === women(b)
  const allMen = all.every((p) => p.gender === 'M')
  // XD covers mixed, women's doubles and handicap, so it needs at least one woman; MD is men only.
  const typeOk = event === 'MD' ? allMen : !allMen && (sameType || headStart(a, b) !== null)
  if (!typeOk) out.push('mismatch')
  if (!gradeSpreadOk(all.map((p) => p.grade))) out.push('grades')
  if (forbidden && (forbidden.has(partnerKey(a[0].id, a[1].id)) || forbidden.has(partnerKey(b[0].id, b[1].id)))) out.push('rule')
  if (setup.active) {
    const uniform = a[0].team === a[1].team && b[0].team === b[1].team
    const cross = a[0].team !== b[0].team
    if (!uniform || (!cross && a[0].team !== setup.spare)) out.push('team')
  }
  return out
}
