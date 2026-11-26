import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dictionaries } from '../../lib/i18n'
import { nzTimestamp, printedLine } from '../../lib/nz-time'

describe('New Zealand print timestamp', () => {
  it('uses NZDT in summer and NZST in winter, whatever the server zone is', () => {
    assert.equal(nzTimestamp(new Date('2026-11-27T01:05:00Z')), '27 Nov 2026, 14:05 NZDT')
    assert.equal(nzTimestamp(new Date('2026-07-01T01:05:00Z')), '1 Jul 2026, 13:05 NZST')
  })
  it('rolls the date over at New Zealand midnight', () => {
    assert.equal(nzTimestamp(new Date('2026-11-26T11:30:00Z')), '27 Nov 2026, 00:30 NZDT')
  })
  it('makes the printed line in both languages', () => {
    const d = new Date('2026-11-27T01:05:00Z')
    assert.equal(printedLine((k) => dictionaries.en[k], d), 'Printed 27 Nov 2026, 14:05 NZDT (New Zealand time)')
    assert.match(printedLine((k) => dictionaries.zh[k], d), /^列印時間：.*14:05 NZDT.*紐西蘭時間/)
  })
})
