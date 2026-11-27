import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { dictionaries } from '../../lib/i18n'
import type { ScheduleGroup, ScheduleRow, SidePlayer } from '../../lib/schedule-groups'
import { buildSchedulePdf } from '../../lib/schedule-pdf'
import type { Competition, MatchKind } from '../../lib/types'

const comp = { id: 1, name: 'Test Cup', event_date: '2026-11-28', start_time: '09:00', courts: 5, slot_minutes: 15 } as Competition
const en = (k: keyof typeof dictionaries.en) => dictionaries.en[k]
const zh = (k: keyof typeof dictionaries.en) => dictionaries.zh[k]

const P = (name: string, grade = 'C'): SidePlayer => ({ name, grade })
const row = (court: number, round: number, kindKey: MatchKind, kind: string, a: SidePlayer[], b: SidePlayer[], note = ''): ScheduleRow => ({
  when: `09:${String(15 + round).padStart(2, '0')}–09:30`, round, court, courtLabel: `Court ${court}`, kind, kindKey,
  a, b, sideA: a.map((p) => p.name).join(' / '), sideB: b.map((p) => p.name).join(' / '), note,
})
const warm = (): ScheduleRow => ({ when: '09:00–09:15', round: 0, court: 0, courtLabel: '', kind: '', sideA: '', sideB: '', note: '', warmup: true })

const court = (n: number, rows: number): ScheduleGroup => ({
  title: `Court ${n} (${rows} matches)`,
  rows: [warm(), ...Array.from({ length: rows }, (_, i) => row(n, i + 1, 'MD', "Men's doubles", [P(`A${i}`), P(`B${i}`)], [P(`C${i}`), P(`D${i}`)]))],
})

describe('the fonts', () => {
  it('cover every character in the Hong Kong Chinese strings and typical Chinese nicknames', () => {
    const font = fontkit.create(readFileSync('assets/fonts/NotoSansSC-Regular-subset.ttf'))
    const bold = fontkit.create(readFileSync('assets/fonts/NotoSansSC-Bold-subset.ttf'))
    const have = new Set((font as { characterSet: number[] }).characterSet)
    const haveBold = new Set((bold as { characterSet: number[] }).characterSet)
    const wanted = new Set<string>()
    for (const text of Object.values(dictionaries.zh)) for (const ch of text) wanted.add(ch)
    for (const ch of '小明雙打讓分熱身權鳴謝版權所有芳玲偉強麗華陳黃張李王林吳劉蔡楊') wanted.add(ch)
    const missing = [...wanted].filter((ch) => !have.has(ch.codePointAt(0)!) || !haveBold.has(ch.codePointAt(0)!))
    assert.deepEqual(missing, [], 'characters the PDF could not print')
  })
})

describe('buildSchedulePdf', () => {
  it('makes a valid PDF with one page per court and the right metadata', async () => {
    const t0 = Date.now()
    const bytes = await buildSchedulePdf({ comp, groups: [1, 2, 3, 4, 5].map((n) => court(n, 17)), by: 'court', t: en, year: 2026 })
    assert(Date.now() - t0 < 2000, 'a five-court PDF takes well under two seconds')
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
    assert(bytes.length < 200_000, `${bytes.length} bytes: only the characters used are embedded`)
    const pdf = await PDFDocument.load(bytes)
    assert.equal(pdf.getPageCount(), 5, 'each court has its own page')
    assert.equal(pdf.getTitle(), 'Test Cup · 2026-11-28')
    assert.equal(pdf.getAuthor(), 'Grand Badminton Family')
  })

  it('prints the New Zealand print time in the footer without breaking anything', async () => {
    const printedAt = 'Printed 27 Nov 2026, 14:05 NZDT (New Zealand time)'
    const bytes = await buildSchedulePdf({ comp, groups: [court(1, 5)], by: 'court', t: en, year: 2026, printedAt })
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
    const zhBytes = await buildSchedulePdf({ comp, groups: [court(1, 5)], by: 'court', t: zh, year: 2026, printedAt: '列印時間： 27 Nov 2026, 14:05 NZDT (紐西蘭時間)' })
    assert(zhBytes.length < 200_000)
  })

  it('flows a long court onto more pages instead of running off the bottom', async () => {
    const bytes = await buildSchedulePdf({ comp, groups: [court(1, 60)], by: 'court', t: en, year: 2026 })
    assert((await PDFDocument.load(bytes)).getPageCount() >= 3, '60 rows need several pages')
  })

  it('by time: warm-up bar, rounds kept together, page breaks between them', async () => {
    const groups: ScheduleGroup[] = [{ title: '09:00–09:15 · Warm-up (all courts, no matches)', rows: [] }]
    for (let r = 1; r <= 14; r++) groups.push({ title: `Round ${r} (5 matches)`, rows: [1, 2, 3, 4, 5].map((c) => row(c, r, 'XD', 'Mixed doubles', [P('Kim'), P('Alex')], [P('Sam'), P('Jo')])) })
    const pdf = await PDFDocument.load(await buildSchedulePdf({ comp, groups, by: 'time', t: en, year: 2026 }))
    assert(pdf.getPageCount() >= 2 && pdf.getPageCount() <= 5)
  })

  it('handles handicap notes, every event colour, and an empty schedule', async () => {
    const rows = [
      row(1, 1, 'HD', 'Cross doubles', [P('Kim'), P('Jo')], [P('Alex'), P('Sam')], 'Start 4 : 0'),
      row(1, 2, 'WD', "Women's doubles", [P('Kim'), P('Jo')], [P('Pat'), P('Lee')]),
      row(1, 3, 'XD', 'Mixed doubles', [P('Kim'), P('Alex')], [P('Pat'), P('Sam')]),
    ]
    const pdf = await PDFDocument.load(await buildSchedulePdf({ comp, groups: [{ title: 'Court 1 (3 matches)', rows: [warm(), ...rows] }], by: 'court', t: en, year: 2026 }))
    assert.equal(pdf.getPageCount(), 1)
    const empty = await PDFDocument.load(await buildSchedulePdf({ comp, groups: [], by: 'court', t: en, year: 2026 }))
    assert.equal(empty.getPageCount(), 1, 'no matches still gives a one-page PDF')
  })

  it('prints Chinese nicknames and the Hong Kong Chinese labels', async () => {
    const g = { title: '場地 1（1 場）', rows: [warm(), row(1, 1, 'MD', '男子雙打', [P('小明', 'B'), P('Rex', 'B')], [P('雙打手', 'B'), P('Tim', 'C')])] }
    const bytes = await buildSchedulePdf({ comp: { ...comp, name: '羽毛球友誼賽' }, groups: [g], by: 'court', t: zh, year: 2026 })
    const pdf = await PDFDocument.load(bytes)
    assert.equal(pdf.getTitle(), '羽毛球友誼賽 · 2026-11-28')
    assert(bytes.length < 200_000)
  })

  it('never fails on a character the font does not have, or a very long name', async () => {
    const odd = '😀𠀀\u0000ñ'
    const long = 'Name'.repeat(40)
    const g: ScheduleGroup = { title: `Court 1 ${long}`, rows: [warm(), row(1, 1, 'MD', "Men's doubles", [P(odd), P(long)], [P(`${odd}${long}`), P('Ok')], long)] }
    const bytes = await buildSchedulePdf({ comp: { ...comp, name: `${odd} ${long}` }, groups: [g], by: 'court', t: en, year: 2026 })
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
  })
})
