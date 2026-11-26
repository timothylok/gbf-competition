import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { headStart, headStartOf, matchKind, type Lineup } from '../../lib/handicap'

const W = (grade: number | null): Lineup => ({ gender: 'F', grade })
const M = (grade: number | null): Lineup => ({ gender: 'M', grade })

describe('headStart', () => {
  it('two women vs two men: 4 points at the same grade, 6 when the women are one grade lower', () => {
    assert.deepEqual(headStart([W(3), W(3)], [M(3), M(3)]), { side: 'a', points: 4, half: false, covered: true })
    assert.equal(headStart([W(4), W(4)], [M(3), M(3)])!.points, 6)
    assert.equal(headStart([M(3), M(3)], [W(3), W(3)])!.side, 'b', 'the women\'s side gets it, whichever side that is')
  })
  it('averages each side and rounds halves to the weaker grade', () => {
    assert.equal(headStart([W(2), W(3)], [M(3), M(3)])!.points, 4, 'avg 2.5 rounds to 3, level with C')
    assert.equal(headStart([W(3), W(4)], [M(3), M(3)])!.points, 6, 'avg 3.5 rounds to 4, one lower')
  })
  it('one woman + one man vs two men gets half', () => {
    assert.deepEqual(headStart([W(3), M(3)], [M(3), M(3)]), { side: 'a', points: 2, half: true, covered: true })
    assert.equal(headStart([W(4), M(4)], [M(3), M(3)])!.points, 3)
  })
  it('no head start for mixed pairs on both sides, all-men or all-women line-ups', () => {
    assert.equal(headStart([W(3), M(3)], [W(3), M(3)]), null)
    assert.equal(headStart([M(3), M(3)], [M(3), M(3)]), null)
    assert.equal(headStart([W(3), W(3)], [W(3), W(3)]), null)
  })
  it('grade gaps the rules do not cover give 0 points and are flagged', () => {
    assert.deepEqual(headStart([W(3), W(3)], [M(4), M(4)]), { side: 'a', points: 0, half: false, covered: false }, 'women stronger')
    assert.equal(headStart([W(4), W(4)], [M(2), M(2)])!.covered, false, 'two or more grades lower')
    assert.equal(headStart([W(null), W(3)], [M(3), M(3)])!.covered, false, 'missing grade')
  })
})

describe('matchKind / headStartOf', () => {
  const info = { 1: W(3), 2: W(3), 3: M(3), 4: M(3), 5: W(3), 6: M(3) }
  it('women vs men shows as handicap; everything else keeps its stored event', () => {
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 2, b1: 3, b2: 4 }, info), 'HD')
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 3, b1: 5, b2: 6 }, info), 'XD')
    assert.equal(matchKind({ event: 'MD', a1: 3, a2: 4, b1: 3, b2: 4 }, info), 'MD')
  })
  it("four women is women's doubles (WD), still stored as XD", () => {
    const w = { 1: W(3), 2: W(3), 3: W(3), 4: W(3) }
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 2, b1: 3, b2: 4 }, w), 'WD')
  })
  it('returns null when a player is unknown', () => {
    assert.equal(headStartOf({ a1: 1, a2: 2, b1: 3, b2: 99 }, info), null)
  })
})
