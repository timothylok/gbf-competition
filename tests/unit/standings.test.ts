import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { standings } from '../../lib/standings'
import { roundTime } from '../../lib/time'
import type { Match, Player } from '../../lib/types'

const P = (id: number, nickname: string): Player => ({ id, competition_id: 1, nickname, gender: 'M', grade: null })
const players = [P(1, 'a'), P(2, 'b'), P(3, 'c'), P(4, 'd')]
const M = (o: Partial<Match>): Match => ({
  id: 1, competition_id: 1, event: 'MD', round: 1, court: 1, a1: 1, a2: 2, b1: 3, b2: 4,
  score_a: 10, score_b: 5, status: 'done', version: 1, ...o,
})

describe('standings', () => {
  it('gives win 2, draw 1, loss 0 and ranks by points then difference', () => {
    const rows = standings(players, [M({}), M({ id: 2, score_a: 7, score_b: 7 })], 'MD')
    assert.deepEqual(rows.map((r) => [r.player.nickname, r.pts, r.diff, r.won, r.drawn, r.lost]), [
      ['a', 3, 5, 1, 1, 0], ['b', 3, 5, 1, 1, 0], ['c', 1, -5, 0, 1, 1], ['d', 1, -5, 0, 1, 1],
    ])
  })
  it('only counts finished matches', () => {
    const rows = standings(players, [M({ status: 'live' }), M({ id: 2, status: 'scheduled', score_a: null, score_b: null }), M({ id: 3, status: 'cancelled' })], 'MD')
    assert.equal(rows.length, 0)
  })
  it('breaks ties on points difference, then points scored', () => {
    // a/b win 15-14 (+1), then c/d win 21-9 elsewhere (+12): c,d outrank a,b only by difference
    const rows = standings(players, [M({ score_a: 15, score_b: 14 }), M({ id: 2, a1: 3, a2: 4, b1: 1, b2: 2, score_a: 21, score_b: 9 })], 'MD')
    // each player has 1 win and 1 loss -> 2 pts; difference decides
    const byName = Object.fromEntries(rows.map((r) => [r.player.nickname, r]))
    assert.equal(byName.a.pts, 2)
    assert(byName.c.diff > byName.a.diff)
    assert.equal(rows[0].player.nickname === 'c' || rows[0].player.nickname === 'd', true)
  })
  it('separates events', () => {
    const rows = standings(players, [M({ event: 'MD' }), M({ id: 2, event: 'XD', score_a: 1, score_b: 9 })], 'XD')
    assert.deepEqual(rows.map((r) => r.player.nickname).sort(), ['a', 'b', 'c', 'd'])
    assert.equal(rows.find((r) => r.player.nickname === 'c')!.pts, 2)
    assert.equal(standings(players, [M({ event: 'MD' })], 'XD').length, 0)
    assert.equal(standings(players, [M({ event: 'MD' }), M({ id: 2, event: 'XD' })], 'ALL')[0].played, 2)
  })
  it('shares ranks between players level on points, difference and points scored (1,1,3,3)', () => {
    const rows = standings(players, [M({}), M({ id: 2, score_a: 7, score_b: 7 })], 'MD')
    assert.deepEqual(rows.map((r) => [r.rank, r.tied]), [[1, true], [1, true], [3, true], [3, true]])
  })
  it('does not flag a clear leader as tied', () => {
    const rows = standings(players, [M({}), M({ id: 2, a1: 1, a2: 3, b1: 2, b2: 4, score_a: 9, score_b: 8 })], 'MD')
    assert.equal(rows[0].player.nickname, 'a')
    assert.deepEqual([rows[0].rank, rows[0].tied], [1, false])
  })
  it('orders players with equal records alphabetically so the list is stable', () => {
    const rows = standings([P(1, 'zed'), P(2, 'amy'), P(3, 'x'), P(4, 'y')], [M({})], 'MD')
    assert.deepEqual(rows.slice(0, 2).map((r) => r.player.nickname), ['amy', 'zed'])
  })
})

describe('roundTime', () => {
  it('adds the slot length per round', () => {
    assert.equal(roundTime('09:00', 15, 1), '09:00')
    assert.equal(roundTime('09:00', 15, 3), '09:30')
    assert.equal(roundTime('09:00', 15, 17), '13:00')
  })
  it('rolls over midnight', () => assert.equal(roundTime('23:45', 15, 2), '00:00'))
})
