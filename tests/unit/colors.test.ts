import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import config from '../../tailwind.config'
import { TONE } from '../../lib/event-tone'

const ROOT = join(__dirname, '..', '..')
const PALETTE = config.theme!.colors as Record<string, string>

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : []
  })
}
const sources = ['app', 'components', 'lib'].flatMap((d) => files(join(ROOT, d)))

// Tailwind's default colours are replaced, so numbered shades and white/black render nothing.
const FORBIDDEN =
  /\b(?:text|bg|border|ring|divide|from|to|via|fill|stroke|outline|placeholder)-(?:slate|gray|zinc|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|navy|accent|stone)-\d+|\b(?:text|bg|border|ring)-(?:white|black)\b/g
const HEX = /#[0-9a-fA-F]{6}\b/g

function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const mix = (fg: string, bg: string, a: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('')

describe('Pantone-only palette', () => {
  it('defines exactly the Pantone colours (plus transparent/current)', () => {
    assert.deepEqual(Object.keys(PALETTE).sort(), ['berry', 'blue', 'cloud', 'current', 'ink', 'leaf', 'mist', 'paper', 'pink', 'stone', 'sun', 'sky', 'transparent'].sort())
  })
  it('uses the intended Pantone references for men\'s doubles and mixed doubles', () => {
    assert.equal(PALETTE.blue.toLowerCase(), '#00a9e0', 'PANTONE 2995 C')
    assert.equal(PALETTE.pink.toLowerCase(), '#ff5fa2', 'PANTONE 812 C')
    assert.match(TONE.MD.band, /bg-blue/)
    assert.match(TONE.XD.band, /bg-pink/)
  })
  it('contains no non-Pantone colour classes or hex values in the source', () => {
    const allowed = new Set(Object.values(PALETTE).filter((v) => v.startsWith('#')).map((v) => v.toLowerCase()))
    const problems: string[] = []
    for (const f of sources) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(FORBIDDEN)) problems.push(`${f}: ${m[0]}`)
      if (!f.endsWith('i18n.ts') && !f.endsWith('event-tone.ts')) for (const m of src.matchAll(HEX)) if (!allowed.has(m[0].toLowerCase())) problems.push(`${f}: ${m[0]}`)
    }
    assert.deepEqual(problems, [])
  })
})

describe('text contrast (WCAG AA, 4.5:1)', () => {
  const P = PALETTE
  const pairs: [string, string, string][] = [
    ['men\'s doubles header (dark text on 2995 C)', P.ink, P.blue],
    ['mixed doubles header (dark text on 812 C)', P.ink, P.pink],
    ['men\'s doubles score box tint', P.ink, mix(P.blue, P.paper, 0.15)],
    ['mixed doubles score box tint', P.ink, mix(P.pink, P.paper, 0.25)],
    ['Live badge colour 1: PANTONE 812 C text on Black 6 C', P.pink, P.ink],
    ['Live badge colour 2: PANTONE 2995 C text on Black 6 C', P.blue, P.ink],
    ['Live badge colour 3: yellow text on Black 6 C', P.sun, P.ink],
    ['Live badge colour 4: green text on Black 6 C', P.leaf, P.ink],
    ['login error text', P.ink, mix(P.berry, P.cloud, 0.1)],
    ['final chip', P.ink, P.leaf],
    ['scheduled chip', P.stone, P.mist],
    ['body text', P.ink, P.paper],
    ['secondary text (ink 75%) on glass over the blue colour field', mix(P.ink, mix(P.blue, P.cloud, 0.25), 0.75), mix(P.blue, P.cloud, 0.25)],
    ['secondary text (ink 75%) on glass over the 812 C pink field', mix(P.ink, mix(P.pink, P.cloud, 0.35), 0.75), mix(P.pink, P.cloud, 0.35)],
    ['secondary text (ink 75%) on glass over the yellow field', mix(P.ink, mix(P.sun, P.cloud, 0.35), 0.75), mix(P.sun, P.cloud, 0.35)],
    ['secondary text (ink 75%) on glass over the Serenity field', mix(P.ink, mix(P.sky, P.cloud, 0.5), 0.75), mix(P.sky, P.cloud, 0.5)],
    ['body text on the MD panel wash', P.ink, mix(P.blue, P.cloud, 0.10)],
    ['body text on the XD panel wash over the pink field', P.ink, mix(P.pink, mix(P.pink, P.cloud, 0.35), 0.15)],
    ['headings', P.ink, P.cloud],
    ['site header', P.paper, P.ink],
    ['site nav links', P.mist, P.ink],
    ['table head', P.sun, P.ink],
    ['error banner text', P.ink, mix(P.berry, P.cloud, 0.1)],
    ['primary button (dark text on 2995 C)', P.ink, P.blue],
    ['primary button on hover', P.paper, P.ink],
    ['danger button', P.paper, P.berry],
    ['empty score box', mix(P.ink, P.paper, 0.7), P.paper],
  ]
  for (const [name, fg, bg] of pairs) {
    it(name, () => assert(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}:1`))
  }
})
