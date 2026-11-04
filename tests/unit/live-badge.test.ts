import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8')
const keyframes = css.match(/@keyframes live-colors \{([\s\S]*?)\n\}/)?.[1] ?? ''

describe('animated Live badge', () => {
  it('cycles through exactly four palette colours, taken from the theme (no raw colours)', () => {
    const used = [...keyframes.matchAll(/theme\('colors\.(\w+)'\)/g)].map((m) => m[1])
    assert.deepEqual(used, ['pink', 'blue', 'sun', 'leaf'])
    assert.doesNotMatch(keyframes, /#[0-9a-f]{3,6}|rgb/i, 'only theme() colours')
  })
  it('changes colour in hard steps, so no non-Pantone in-between colours appear', () => {
    assert.match(css, /animation: live-colors [\d.]+s step-end infinite/)
  })
  it('changes at most twice a second (far below the 3 flashes a second safety limit)', () => {
    const seconds = Number(css.match(/animation: live-colors ([\d.]+)s/)?.[1])
    assert(4 / seconds <= 2, `${(4 / seconds).toFixed(2)} colour changes per second`)
  })
  it('stops animating for visitors who ask for reduced motion', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.live-badge \{\s*animation: none;/)
  })
  it('is used by every Live status in the interface', () => {
    for (const f of ['components/MatchCard.tsx', 'components/CompTabs.tsx', 'app/admin/c/[id]/scores/page.tsx']) {
      assert.match(readFileSync(join(ROOT, f), 'utf8'), /live-badge/, f)
    }
  })
})
