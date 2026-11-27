import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { headStart, headStartOf, matchKind, type Lineup } from '../../lib/handicap'

const W = (grade: number | null): Lineup => ({ gender: 'F', grade })
const M = (grade: number | null): Lineup => ({ gender: 'M', grade })

const UC = (g: 'M' | 'F'): Lineup => ({ gender: g, grade: 3, upper: true })

describe('headStart', () => {
  it('two women vs two men: 4 points at the same level; women side gets it whichever side it is', () => {
    assert.deepEqual(headStart([W(3), W(3)], [M(3), M(3)]), { side: 'a', points: 4, half: false, covered: true })
    assert.equal(headStart([M(3), M(3)], [W(3), W(3)])!.side, 'b')
  })
  it('men stronger: +5 for half a grade (Upper C vs C), +6 for a full grade', () => {
    assert.equal(headStart([W(3), W(3)], [UC('M'), UC('M')])!.points, 5, 'C women vs Upper C men')
    assert.equal(headStart([W(4), W(4)], [M(3), M(3)])!.points, 6, 'D women vs C men')
    assert.equal(headStart([W(3), W(3)], [M(2), M(2)])!.points, 6, 'C women vs B men')
    assert.equal(headStart([W(4), W(4)], [UC('M'), UC('M')])!.covered, false, 'D women vs Upper C men: 1.5 grades, not covered')
  })
  it('women stronger: +3 for half a grade, +2 for a full grade', () => {
    assert.equal(headStart([UC('F'), UC('F')], [M(3), M(3)])!.points, 3, 'Upper C women vs C men')
    assert.equal(headStart([W(3), W(3)], [M(4), M(4)])!.points, 2, 'C women vs D men')
    assert.equal(headStart([W(2), W(2)], [UC('M'), UC('M')])!.points, 3, 'B women vs Upper C men')
    assert.equal(headStart([W(2), W(2)], [M(4), M(4)])!.covered, false, 'two grades stronger: not covered')
  })
  it('mixed-grade pairs: sides are averaged and a quarter gap rounds to the weaker side, always a whole number', () => {
    assert.equal(headStart([W(2), W(3)], [M(3), M(3)])!.points, 3, 'B+C women (2.5) vs C men: half a grade stronger')
    assert.equal(headStart([W(3), W(4)], [M(3), M(3)])!.points, 5, 'C+D women (3.5) vs C men')
    assert.equal(headStart([W(3), W(3)], [UC('M'), M(3)])!.points, 5, 'C women vs Upper C+C men: gap 0.25 -> 4.5, men stronger so the women get 5')
    assert.equal(headStart([UC('F'), W(3)], [M(3), M(3)])!.points, 3, 'Upper C+C women vs C men: gap -0.25 -> 3.5, women stronger so the half point goes to the men: 3')
  })
  it('one woman + one man vs two men gets half, rounded down', () => {
    assert.deepEqual(headStart([W(3), M(3)], [M(3), M(3)]), { side: 'a', points: 2, half: true, covered: true })
    assert.equal(headStart([W(4), M(4)], [M(3), M(3)])!.points, 3)
  })
  it('every result is a whole number', () => {
    for (const ga of [2, 3, 4]) for (const gb of [2, 3, 4]) for (const ua of [false, true]) for (const ub of [false, true]) {
      const w = (g: number, u: boolean): Lineup => ({ gender: 'F', grade: g, upper: u })
      const m = (g: number, u: boolean): Lineup => ({ gender: 'M', grade: g, upper: u })
      const h = headStart([w(ga, ua), w(gb, ub)], [m(ga, ub), m(gb, ua)])!
      assert(Number.isInteger(h.points))
    }
  })
  it('no head start for mixed pairs on both sides, all-men or all-women line-ups', () => {
    assert.equal(headStart([W(3), M(3)], [W(3), M(3)]), null)
    assert.equal(headStart([M(3), M(3)], [M(3), M(3)]), null)
    assert.equal(headStart([W(3), W(3)], [W(3), W(3)]), null)
  })
  it('a missing grade is flagged', () => {
    assert.deepEqual(headStart([W(null), W(3)], [M(3), M(3)]), { side: 'a', points: 0, half: false, covered: false })
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
