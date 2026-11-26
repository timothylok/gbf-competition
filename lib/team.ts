/** Team of a player: nicknames ending in "-F" are the Philippines team, everyone else is "the rest". */
export type Team = 'F' | 'R'

export function teamOf(nickname: string): Team {
  return /-f$/i.test(nickname.trim()) ? 'F' : 'R'
}
