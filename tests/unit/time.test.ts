import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_HOURS, endTimeOf, limitMinutes, maxRounds, maxRoundsFor, roundRange, roundTime } from '../../lib/time'

describe('round times and the time limit', () => {
  it('shows the start and end of a round', () => {
    assert.equal(roundTime('09:00', 15, 1), '09:00')
    assert.equal(roundRange('09:00', 15, 1), '09:00–09:15')
    assert.equal(roundRange('09:00', 15, 4), '09:45–10:00')
  })
  it('fits 20 fifteen-minute rounds in the default 5 hours, so the last match ends at 14:00', () => {
    assert.equal(DEFAULT_HOURS, 5)
    assert.equal(maxRounds(15), 20)
    assert.equal(roundRange('09:00', 15, 20), '13:45–14:00')
    assert.equal(roundTime('09:00', 15, 21), '14:00', 'round 21 would start after the limit')
  })
  it('no round up to the limit ends after start + hours', () => {
    for (const [start, slot, hours] of [['09:00', 15, 5], ['18:30', 20, 3], ['08:00', 10, 4]] as const) {
      const [h, m] = start.split(':').map(Number)
      const limit = h * 60 + m + hours * 60
      for (let r = 1; r <= maxRounds(slot, hours); r++) {
        const end = roundRange(start, slot, r).split('–')[1].split(':').map(Number)
        assert(end[0] * 60 + end[1] <= limit, `${start} +${slot}min round ${r} ends after ${hours}h`)
      }
      const past = roundRange(start, slot, maxRounds(slot, hours) + 1).split('–')[1].split(':').map(Number)
      assert(past[0] * 60 + past[1] > limit, 'the next round does end after the limit')
    }
  })
  it('uses the competition end time when set, and start + 5 hours when not', () => {
    const base = { start_time: '09:00', slot_minutes: 15 }
    assert.equal(endTimeOf({ ...base, end_time: null }), '14:00')
    assert.equal(endTimeOf({ ...base, end_time: '12:30' }), '12:30')
    assert.equal(limitMinutes({ ...base, end_time: '12:30' }), 210)
    assert.equal(maxRoundsFor({ ...base, end_time: null }), 20)
    assert.equal(maxRoundsFor({ ...base, end_time: '10:00' }), 4)
    assert.equal(maxRoundsFor({ ...base, end_time: '10:05' }), 4, 'a part round does not fit')
    assert.equal(roundRange('09:00', 15, 4).split('–')[1], '10:00', 'round 4 ends exactly at a 10:00 end time')
  })
})
