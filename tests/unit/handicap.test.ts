import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchKind, opponentsAllowed, startLabel, startScore, startScoreOf, strength, type Lineup } from '../../lib/handicap'
import { handicapMatrix, handicapMatrixMarkdown } from '../../lib/handicap-matrix'

/** "M-B", "F-U", "M-C", "F-D" -> a player. */
const P = (code: string): Lineup => {
  const [g, l] = code.split('-')
  return { gender: g as 'M' | 'F', grade: l === 'B' ? 2 : l === 'D' ? 4 : 3, upper: l === 'U' }
}
const S = (a: string, b: string) => {
  const [a1, a2] = a.split(' + ').map(P)
  const [b1, b2] = b.split(' + ').map(P)
  return [[a1, a2], [b1, b2]] as [[Lineup, Lineup], [Lineup, Lineup]]
}

// The examples given with the rule (Team A, Team B, starting score A:B, or null when prohibited).
const EXAMPLES: [string, string, string | null][] = [
  ['M-B + M-B', 'M-C + M-C', '0:8'],
  ['M-B + M-C', 'M-C + M-C', '0:4'],
  ['F-B + F-C', 'F-C + F-C', '0:2'],
  ['M-B + F-C', 'M-C + F-C', '0:4'],
  ['M-C + F-B', 'M-C + F-C', '0:2'],
  ['M-B + F-C', 'M-C + F-B', '0:2'],
  ['M-U + M-U', 'M-C + M-C', '0:2'],
  ['M-C + M-C', 'M-D + M-D', '0:2'],
  ['F-C + F-C', 'F-D + F-D', '0:1'],
  ['M-C + F-C', 'M-D + F-D', '0:2'],
  ['M-C + F-D', 'M-D + F-C', '0:1'],
  ['M-C + M-C', 'F-C + F-C', '0:4'],
  ['M-C + M-C', 'F-D + F-D', '0:5'],
  ['M-D + M-D', 'F-C + F-C', '0:2'],
  ['M-D + M-D', 'F-D + F-D', '0:3'],
  ['M-C + M-C', 'M-C + F-C', '0:2'],
  ['M-C + F-C', 'F-C + F-C', '0:2'],
  ['M-C + M-C', 'M-B + F-C', '2:0'],
  ['M-C + M-C', 'M-C + F-B', '0:0'],
  ['M-B + M-B', 'F-B + F-B', '0:8'],
  ['M-U + M-C', 'F-D + F-D', null],
  ['M-U + M-U', 'F-D + F-D', null],
]

describe('universal handicap (starting score)', () => {
  it('matches every example in the rule', () => {
    for (const [a, b, exp] of EXAMPLES) {
      const [A, B] = S(a, b)
      if (exp == null) {
        assert.equal(opponentsAllowed(A, B), false, `${a} vs ${b} is prohibited`)
        continue
      }
      assert(opponentsAllowed(A, B), `${a} vs ${b} is allowed`)
      const s = startScore(A, B)
      assert.equal(`${s.a}:${s.b}`, exp, `${a} vs ${b}`)
    }
  })
  it('recognises all four levels for both genders; men carry the extra 2 points once', () => {
    assert.deepEqual(['M-B', 'M-U', 'M-C', 'M-D'].map((c) => strength(P(c))), [14, 8, 6, 4])
    assert.deepEqual(['F-B', 'F-U', 'F-C', 'F-D'].map((c) => strength(P(c))), [6, 3, 2, 1])
    for (const l of ['B', 'U', 'C', 'D']) assert.equal(strength(P(`M-${l}`))! - 2, strength(P(`F-${l}`))! * 2)
  })
  it('a stronger man and a stronger woman are not treated as equal', () => {
    const [A, B] = S('M-B + F-C', 'M-C + F-B')
    assert.deepEqual(startScore(A, B), { a: 0, b: 2, covered: true })
  })
  it('swapping the sides gives the same players the same points', () => {
    for (const r of handicapMatrix()) {
      const a = r.a.map((p) => P(`${p.gender}-${p.level}`)) as [Lineup, Lineup]
      const b = r.b.map((p) => P(`${p.gender}-${p.level}`)) as [Lineup, Lineup]
      const x = startScore(a, b)
      const y = startScore(b, a)
      assert.deepEqual([x.a, x.b], [y.b, y.a])
      assert.equal(opponentsAllowed(a, b), opponentsAllowed(b, a))
    }
  })
  it('every result is a whole number and only the weaker team (or nobody) gets points', () => {
    for (const r of handicapMatrix()) {
      if (!r.start) continue
      assert(Number.isInteger(r.start.a) && Number.isInteger(r.start.b))
      assert(r.start.a === 0 || r.start.b === 0)
    }
  })
  it('the matrix covers all six match categories, and B never meets D', () => {
    const rows = handicapMatrix()
    assert.equal(rows.length, 666)
    const cats = new Set(rows.filter((r) => r.start).map((r) => r.category.split(' vs ').sort().join(' vs ')))
    assert.deepEqual([...cats].sort(), ['MD vs MD', 'MD vs WD', 'MD vs XD', 'WD vs WD', 'WD vs XD', 'XD vs XD'])
    for (const r of rows) {
      const levels = [...r.a, ...r.b].map((p) => p.level)
      if (levels.includes('B') && levels.includes('D')) assert.equal(r.start, null)
    }
  })
  it('docs/handicap-matrix.md is up to date', () => {
    assert.equal(readFileSync('docs/handicap-matrix.md', 'utf8'), handicapMatrixMarkdown(), 'run: npx tsx scripts/handicap-matrix.ts')
  })
  it('grades outside B, C and D, or a missing grade, are flagged "to be confirmed"', () => {
    const t = (k: 'startScore' | 'startTbc') => (k === 'startScore' ? 'Start' : 'Start: to be confirmed')
    const s = startScore([{ gender: 'M', grade: 1 }, P('M-B')], [P('M-B'), P('M-B')])
    assert.equal(s.covered, false)
    assert.equal(startLabel(s, t), 'Start: to be confirmed')
    assert.equal(startLabel(startScore(...S('M-B + M-B', 'M-C + M-C')), t), 'Start 0 : 8')
    assert.equal(startScore([{ gender: 'M', grade: null }, P('M-C')], [P('M-C'), P('M-C')]).covered, false)
  })
})

describe('matchKind / startScoreOf', () => {
  const info: Record<number, Lineup> = { 1: P('F-C'), 2: P('F-C'), 3: P('M-C'), 4: P('M-C'), 5: P('F-C'), 6: P('M-C'), 7: P('F-C'), 8: P('F-C') }
  it('same type on both sides is MD / XD / WD; different types are cross doubles (HD)', () => {
    assert.equal(matchKind({ event: 'MD', a1: 3, a2: 4, b1: 3, b2: 4 }, info), 'MD')
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 3, b1: 5, b2: 6 }, info), 'XD')
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 2, b1: 7, b2: 8 }, info), 'WD')
    assert.equal(matchKind({ event: 'XD', a1: 1, a2: 2, b1: 3, b2: 4 }, info), 'HD', 'women vs men')
    assert.equal(matchKind({ event: 'XD', a1: 5, a2: 6, b1: 3, b2: 4 }, info), 'HD', 'mixed vs men')
    assert.equal(matchKind({ event: 'XD', a1: 5, a2: 6, b1: 1, b2: 2 }, info), 'HD', 'mixed vs women')
  })
  it('every match type gets a starting score; null only when a player is unknown', () => {
    assert.deepEqual(startScoreOf({ a1: 3, a2: 4, b1: 3, b2: 4 }, info), { a: 0, b: 0, covered: true })
    assert.deepEqual(startScoreOf({ a1: 1, a2: 2, b1: 3, b2: 4 }, info), { a: 4, b: 0, covered: true })
    assert.equal(startScoreOf({ a1: 1, a2: 2, b1: 3, b2: 99 }, info), null)
  })
})
