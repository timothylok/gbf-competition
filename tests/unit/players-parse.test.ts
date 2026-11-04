import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlayerLines } from '../../lib/action-utils'

describe('parsePlayerLines (bulk player entry)', () => {
  it('parses nickname, gender and optional grade', () => {
    const { players, skipped } = parsePlayerLines('Kevin, M, 2\nMei, F\nAlex,m,1')
    assert.deepEqual(players, [
      { nickname: 'Kevin', gender: 'M', grade: 2 },
      { nickname: 'Mei', gender: 'F', grade: null },
      { nickname: 'Alex', gender: 'M', grade: 1 },
    ])
    assert.equal(skipped, 0)
  })
  it('accepts Chinese genders and Chinese commas / tabs / semicolons', () => {
    const { players } = parsePlayerLines('小明，男，1\n小美\t女\t2\nJoe;male;3\nAnn；female')
    assert.deepEqual(players.map((p) => [p.nickname, p.gender, p.grade]), [
      ['小明', 'M', 1], ['小美', 'F', 2], ['Joe', 'M', 3], ['Ann', 'F', null],
    ])
  })
  it('skips and counts bad lines: missing gender, bad gender, bad grade, empty nickname', () => {
    const { players, skipped } = parsePlayerLines('NoGender\nBob, X, 1\nCy, M, 0\nDee, F, 10\nEd, M, abc\n , M, 1')
    assert.equal(players.length, 0)
    assert.equal(skipped, 6)
  })
  it('ignores blank lines and Windows line endings', () => {
    const { players, skipped } = parsePlayerLines('A, M\r\n\r\nB, F\r\n')
    assert.equal(players.length, 2)
    assert.equal(skipped, 0)
  })
  it('drops duplicate nicknames case-insensitively (keeps the first)', () => {
    const { players, skipped } = parsePlayerLines('Sam, M, 1\nsam, F, 2\nSAM, M')
    assert.deepEqual(players.map((p) => p.nickname), ['Sam'])
    assert.equal(skipped, 2)
  })
  it('truncates very long nicknames to 30 characters and strips control characters', () => {
    const { players } = parsePlayerLines(`${'x'.repeat(50)}, M\nBad\u0007Name, F`)
    assert.equal(players[0].nickname.length, 30)
    assert.equal(players[1].nickname, 'BadName')
  })
  it('handles a full 64-player paste', () => {
    const text = Array.from({ length: 64 }, (_, i) => `P${i}, ${i % 2 ? 'F' : 'M'}, ${(i % 3) + 1}`).join('\n')
    assert.equal(parsePlayerLines(text).players.length, 64)
  })
})
