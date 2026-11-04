import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dictionaries } from '../../lib/i18n'

const { en, zh } = dictionaries as { en: Record<string, string>; zh: Record<string, string> }
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

describe('translations (English + Traditional Chinese for Hong Kong)', () => {
  it('has exactly the same keys in both languages', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  })
  it('has no empty strings', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(zh)]) assert(v.trim().length > 0, `empty: ${k}`)
  })
  it('keeps the same {placeholders} in both languages', () => {
    for (const k of Object.keys(en)) assert.equal(placeholders(zh[k]), placeholders(en[k]), `placeholder mismatch in "${k}"`)
  })
  it('actually translates the long messages', () => {
    const cjk = /[一-鿿]/
    const mustTranslate = Object.keys(en).filter((k) => en[k].length > 12)
    for (const k of mustTranslate) assert(cjk.test(zh[k]), `"${k}" is not translated`)
  })
  it('uses Hong Kong wording, not Taiwan wording, where they differ', () => {
    const all = Object.values(zh).join('')
    for (const taiwan of ['紀錄', '公布', '伺服器端', '軟體', '網路', '預設']) assert(!all.includes(taiwan), `Taiwan-style term "${taiwan}" found`)
  })
  it('uses the exact terms a visitor needs for scoring', () => {
    assert.match(zh.scoringNote, /勝 2 分/)
    assert.match(zh.scoringNote, /和 1 分/)
    assert.match(en.scoringNote, /Win 2, draw 1, loss 0/)
  })
  it('reads "5 個場地" in the competition header, not the form label "場地數"', () => {
    assert.equal(zh.courtsShort, '個場地')
    assert.equal(en.courtsShort, 'courts')
    assert.notEqual(zh.courtsShort, zh.courts)
  })
  it('mentions the single-admin rule with who and minutes', () => {
    for (const d of [en, zh]) {
      assert(d.errBusy.includes('{who}') && d.errBusy.includes('{mins}'))
    }
  })
})
