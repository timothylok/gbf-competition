import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import subsetFont from 'subset-font'
import type { T } from './i18n'
import type { ScheduleGroup, ScheduleRow } from './schedule-groups'
import { warmupRange } from './time'
import type { Competition } from './types'

/**
 * The schedule as a PDF: A4, one section per court (or per round), coloured event chips, grade badges,
 * a shaded warm-up row, and the rights footer on every page. Text uses Noto Sans SC (SIL OFL, see
 * assets/fonts/OFL.txt) so Chinese nicknames and the Hong Kong Chinese labels print correctly.
 *
 * pdf-lib's own subsetter garbles this font, so each PDF gets its own tiny subset (only the characters it draws)
 * made with subset-font, and that subset is embedded whole. A PDF is a few tens of KB, not the 2.3 MB font.
 */

// Palette colours only (see tailwind.config.ts).
const INK = '#101820'
const STONE = '#53565A'
const MIST = '#D9D9D6'
const CLOUD = '#F0EEE9'
const CHIP: Record<string, string> = { MD: '#00A9E0', XD: '#FF5FA2', WD: '#B79FCF', HD: '#FF6F61' }

const rgbOf = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)

// A4 in points, margins, and the space kept for the footer on every page.
const W = 595.28
const H = 841.89
const M = 34
const TOP = 34
const FOOT = 52
const CW = W - 2 * M

// Table columns: time (or court), event, side A, "vs", side B.
const COLS = { time: 66, event: 84, a: 179, vs: 18, b: 179 }
const ROW_H = 30
const HEAD_H = 16

const FONT_DIR = join(process.cwd(), 'assets', 'fonts')
let fontFiles: { regular: Uint8Array; bold: Uint8Array } | null = null
/** Read once per server process. */
function loadFontFiles() {
  return (fontFiles ??= {
    regular: readFileSync(join(FONT_DIR, 'NotoSansSC-Regular-subset.ttf')),
    bold: readFileSync(join(FONT_DIR, 'NotoSansSC-Bold-subset.ttf')),
  })
}

export interface PdfInput {
  comp: Competition
  groups: ScheduleGroup[]
  by: 'court' | 'time'
  t: T
  year: number
  /** e.g. "Printed 27 Nov 2026, 14:05 NZDT (New Zealand time)", shown in the footer of every page. */
  printedAt?: string
}

/** Every character the PDF can draw: all the text from the schedule and the labels, plus plain ASCII. */
function textToDraw(input: PdfInput): string {
  const { comp, groups, t } = input
  const keys = ['MD', 'XD', 'WD', 'HD', 'courtsShort', 'planMatches', 'warmup', 'allCourts', 'pdfGrades', 'pdfCont', 'event', 'sideA', 'sideB', 'textTime', 'court', 'footerRights', 'footerClause', 'footerCredit', 'noMatches'] as const
  const ascii = String.fromCharCode(...Array.from({ length: 95 }, (_, k) => 32 + k)) // plain ASCII, always available
  const parts: string[] = [comp.name, comp.event_date, ...keys.map((k) => t(k)), input.printedAt ?? '', ascii, '·–…©']
  for (const g of groups) {
    parts.push(g.title)
    for (const r of g.rows) parts.push(r.when, r.courtLabel, r.kind, r.note, r.sideA, r.sideB, ...(r.a ?? []).flatMap((p) => [p.name, p.grade]), ...(r.b ?? []).flatMap((p) => [p.name, p.grade]))
  }
  return [...new Set(parts.join(''))].join('')
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  has: Set<number>
}

/** Drop characters the font has no glyph for, so an unusual nickname prints blank instead of failing. */
function safe(text: string, fonts: Fonts): string {
  let out = ''
  for (const ch of text) if (fonts.has.has(ch.codePointAt(0)!)) out += ch
  return out
}

/** Shorten with an ellipsis until it fits. */
function fit(text: string, font: PDFFont, size: number, max: number, fonts: Fonts): string {
  let s = safe(text, fonts)
  if (font.widthOfTextAtSize(s, size) <= max) return s
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > max) s = s.slice(0, -1)
  return s + '…'
}

function roundedPath(w: number, h: number, r: number) {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
}

class Writer {
  doc!: PDFDocument
  fonts!: Fonts
  pages: PDFPage[] = []
  page!: PDFPage
  y = 0

  constructor(private input: PdfInput) {}

  async init() {
    this.doc = await PDFDocument.create()
    this.doc.registerFontkit(fontkit)
    const files = loadFontFiles()
    const text = textToDraw(this.input)
    const [smallRegular, smallBold] = await Promise.all([
      subsetFont(Buffer.from(files.regular), text, { targetFormat: 'truetype' }),
      subsetFont(Buffer.from(files.bold), text, { targetFormat: 'truetype' }),
    ])
    const regular = await this.doc.embedFont(smallRegular, { subset: false })
    const bold = await this.doc.embedFont(smallBold, { subset: false })
    this.fonts = { regular, bold, has: new Set(regular.getCharacterSet()) }
    const { comp } = this.input
    this.doc.setTitle(`${comp.name} · ${comp.event_date}`)
    this.doc.setSubject('Schedule')
    this.doc.setAuthor('Grand Badminton Family')
    this.doc.setCreator('GBF Competition')
    this.doc.setProducer('GBF Competition')
    this.doc.setCreationDate(new Date())
    this.doc.setModificationDate(new Date())
  }

  text(s: string, x: number, yTop: number, size: number, opts: { bold?: boolean; color?: string; maxWidth?: number; align?: 'right' } = {}) {
    const font = opts.bold ? this.fonts.bold : this.fonts.regular
    const str = opts.maxWidth ? fit(s, font, size, opts.maxWidth, this.fonts) : safe(s, this.fonts)
    const width = font.widthOfTextAtSize(str, size)
    this.page.drawText(str, { x: opts.align === 'right' ? x - width : x, y: yTop - size, size, font, color: rgbOf(opts.color ?? INK) })
    return width
  }

  rect(x: number, yTop: number, w: number, h: number, fill: string) {
    this.page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: rgbOf(fill) })
  }

  line(x1: number, y: number, x2: number, color: string, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rgbOf(color) })
  }

  rounded(x: number, yTop: number, w: number, h: number, r: number, fill?: string, border?: string) {
    this.page.drawSvgPath(roundedPath(w, h, r), {
      x,
      y: yTop,
      color: fill ? rgbOf(fill) : undefined,
      borderColor: border ? rgbOf(border) : undefined,
      borderWidth: border ? 0.7 : 0,
    })
  }

  chip(label: string, kind: string, x: number, yTop: number, maxWidth: number) {
    const size = 7
    const text = fit(label, this.fonts.bold, size, maxWidth - 10, this.fonts)
    const w = this.fonts.bold.widthOfTextAtSize(text, size) + 10
    this.rounded(x, yTop, w, 12, 3, CHIP[kind] ?? CLOUD)
    this.text(text, x + 5, yTop - 2.5, size, { bold: true })
    return w
  }

  badge(letter: string, x: number, yTop: number) {
    this.rounded(x, yTop, 11, 10, 2.5, undefined, INK)
    const w = this.fonts.bold.widthOfTextAtSize(letter, 6.5)
    this.text(letter, x + 5.5 - w / 2, yTop - 1.8, 6.5, { bold: true })
  }

  newPage() {
    this.page = this.doc.addPage([W, H])
    this.pages.push(this.page)
    this.y = H - TOP
  }

  /** Space left on this page above the footer. */
  room() {
    return this.y - FOOT
  }

  runningHeader() {
    const { comp } = this.input
    this.text(`${comp.name} · ${comp.event_date}`, M, this.y, 9, { bold: true, color: STONE, maxWidth: CW })
    this.y -= 14
    this.line(M, this.y, W - M, INK, 1)
    this.y -= 8
  }

  firstHeader(matches: number) {
    const { comp, t } = this.input
    this.text(`${comp.name} · ${comp.event_date}`, M, this.y, 17, { bold: true, maxWidth: CW })
    this.y -= 24
    const sub = `${comp.courts} ${t('courtsShort')} · ${matches} ${t('planMatches')} · ${comp.slot_minutes} min · ${t('warmup')} ${warmupRange(comp.start_time)} · ${t('pdfGrades')}`
    this.text(sub, M, this.y, 8.5, { color: STONE, maxWidth: CW })
    this.y -= 16
    let x = M
    for (const k of ['MD', 'XD', 'WD', 'HD'] as const) x += this.chip(t(k), k, x, this.y, 150) + 6
    this.y -= 18
    this.line(M, this.y, W - M, INK, 2.5)
    this.y -= 12
  }

  groupHeading(title: string, cont: boolean) {
    const { t } = this.input
    this.text(cont ? `${title} ${t('pdfCont')}` : title, M, this.y, 12, { bold: true, maxWidth: CW })
    this.y -= 17
  }

  tableHeader(firstCol: string) {
    const { t } = this.input
    const cols: [string, number][] = [[firstCol, M], [t('event'), M + COLS.time], [t('sideA'), M + COLS.time + COLS.event], [t('sideB'), M + COLS.time + COLS.event + COLS.a + COLS.vs]]
    for (const [label, x] of cols) this.text(label.toUpperCase(), x + 3, this.y, 6.8, { bold: true, color: STONE, maxWidth: 160 })
    this.y -= 10
    this.line(M, this.y, W - M, INK, 1.1)
    this.y -= 2
  }

  player(p: { name: string; grade: string }, x: number, yTop: number, colWidth: number) {
    const reserve = p.grade ? 15 : 0
    const name = fit(p.name, this.fonts.regular, 8.8, colWidth - 6 - reserve, this.fonts)
    const w = this.text(name, x + 3, yTop, 8.8)
    if (p.grade) this.badge(p.grade, x + 3 + w + 3, yTop - 0.4)
  }

  row(r: ScheduleRow, by: 'court' | 'time') {
    const { t } = this.input
    const top = this.y
    if (r.warmup) {
      this.rect(M, top, CW, 20, CLOUD)
      this.text(by === 'court' ? r.when : r.courtLabel, M + 3, top - 6, 8.5, { bold: true, color: STONE })
      this.text(`${t('warmup')} (${t('allCourts')})`, M + COLS.time + 3, top - 6, 8.5, { bold: true, color: STONE, maxWidth: CW - COLS.time - 6 })
      this.y -= 20
      return
    }
    this.text(by === 'court' ? r.when : r.courtLabel, M + 3, top - 5, 8.5, { maxWidth: COLS.time - 6 })
    if (r.kindKey) this.chip(r.kind, r.kindKey, M + COLS.time + 3, top - 4, COLS.event - 6)
    if (r.note) this.text(r.note, M + COLS.time + 3, top - 19, 6.8, { bold: true, maxWidth: COLS.event - 4 })
    const ax = M + COLS.time + COLS.event
    const bx = ax + COLS.a + COLS.vs
    const [a1, a2] = r.a ?? []
    const [b1, b2] = r.b ?? []
    if (a1) this.player(a1, ax, top - 4, COLS.a)
    if (a2) this.player(a2, ax, top - 16, COLS.a)
    this.text('vs', ax + COLS.a, top - 10, 7.5, { color: STONE })
    if (b1) this.player(b1, bx, top - 4, COLS.b)
    if (b2) this.player(b2, bx, top - 16, COLS.b)
    this.y -= ROW_H
    this.line(M, this.y, W - M, MIST, 0.5)
  }

  footers() {
    const { t, year, printedAt } = this.input
    const n = this.pages.length
    this.pages.forEach((page, i) => {
      this.page = page
      const top = FOOT - 10
      this.line(M, top + 4, W - M, MIST, 0.6)
      this.text(`© ${year} ${t('footerRights')}`, M, top, 7.2, { bold: true, color: STONE, maxWidth: CW })
      this.text(t('footerClause'), M, top - 10, 6.8, { color: STONE, maxWidth: CW })
      this.text(printedAt ? `${t('footerCredit')} · ${printedAt}` : t('footerCredit'), M, top - 20, 6.8, { color: STONE, maxWidth: CW - 60 })
      this.text(`${i + 1} / ${n}`, W - M, top - 20, 6.8, { color: STONE, align: 'right' })
    })
  }
}

export async function buildSchedulePdf(input: PdfInput): Promise<Uint8Array> {
  const { groups, by, t } = input
  const w = new Writer(input)
  await w.init()
  const matches = groups.reduce((n, g) => n + g.rows.filter((r) => !r.warmup).length, 0)
  w.newPage()
  w.firstHeader(matches)
  const firstCol = by === 'court' ? t('textTime') : t('court')

  let fresh = true // the first group follows the title block on page 1
  for (const g of groups) {
    const rowsH = g.rows.reduce((h, r) => h + (r.warmup ? 20 : ROW_H), 0)
    const needed = 17 + (g.rows.length ? 12 : 0) + rowsH + 10
    // A court starts on its own page; a round stays together when it fits.
    if (!fresh && (by === 'court' || w.room() < needed)) {
      w.newPage()
      w.runningHeader()
    }
    fresh = false
    if (g.rows.length === 0) {
      // A heading with no rows (the warm-up in the by-time view) sits in a shaded bar.
      w.rect(M, w.y + 3, CW, 18, CLOUD)
      w.text(g.title, M + 4, w.y, 10, { bold: true, color: STONE, maxWidth: CW - 8 })
      w.y -= 26
      continue
    }
    w.groupHeading(g.title, false)
    w.tableHeader(firstCol)
    for (const r of g.rows) {
      const h = r.warmup ? 20 : ROW_H
      if (w.room() < h) {
        w.newPage()
        w.runningHeader()
        w.groupHeading(g.title, true)
        w.tableHeader(firstCol)
      }
      w.row(r, by)
    }
    w.y -= 12
  }
  if (groups.every((g) => g.rows.every((r) => r.warmup))) w.text(t('noMatches'), M, w.y, 9, { color: STONE })
  w.footers()
  return w.doc.save()
}
