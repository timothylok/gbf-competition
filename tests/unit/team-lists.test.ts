import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasTeams, shortName, teamLists } from '../../lib/team-lists'

const P = (nickname: string, gender: 'M' | 'F', grade: number | null) => ({ nickname, gender, grade })
const players = [
  P('Zed-F', 'M', 3), P('Amy-F', 'F', 3), P('Bo-F', 'M', 2), P('Cy-F', 'M', 3),
  P('Dan', 'M', 3), P('Eve-RW', 'F', 4), P('Fay', 'F', 3), P('Gus', 'M', null),
]

describe('team lists', () => {
  it('splits Philippines (-F) from the rest and counts men and women', () => {
    const [f, r] = teamLists(players)
    assert.equal(f.key, 'F'); assert.equal(r.key, 'R')
    assert.deepEqual([f.count, f.men, f.women], [4, 3, 1])
    assert.deepEqual([r.count, r.men, r.women], [4, 2, 2])
  })
  it('groups by grade letter then sex, names sorted, team suffix dropped', () => {
    const [f, r] = teamLists(players)
    assert.deepEqual(f.grades, [{ letter: 'B', men: ['Bo'], women: [] }, { letter: 'C', men: ['Cy', 'Zed'], women: ['Amy'] }])
    assert.deepEqual(r.grades.map((g) => g.letter), ['C', 'D', '?'], 'ungraded players are listed, last')
    assert.deepEqual(r.grades[1], { letter: 'D', men: [], women: ['Eve'] }, '-RW is dropped too')
  })
  it('every player appears exactly once', () => {
    const all = teamLists(players).flatMap((l) => l.grades.flatMap((g) => [...g.men, ...g.women]))
    assert.equal(all.length, players.length)
  })
  it('only offers team lists when there is a Philippines team', () => {
    assert(hasTeams(players))
    assert(!hasTeams([P('Dan', 'M', 3), P('Eve-RW', 'F', 4)]))
    assert.equal(shortName('  Mike M-F '), 'Mike M')
  })
})
