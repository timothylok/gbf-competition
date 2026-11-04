import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Pantone-only rule: tailwind.config.ts replaces the default colours, so any numbered Tailwind
// shade (slate-500, red-700, ...) or white/black utility renders nothing. Fail the build loudly instead.
const FORBIDDEN =
  /\b(?:text|bg|border|ring|divide|from|to|via|fill|stroke|outline|placeholder)-(?:slate|gray|zinc|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|navy|accent|stone)-\d+|\b(?:text|bg|border|ring)-(?:white|black)\b/g
const HEX = /#[0-9a-fA-F]{6}\b/g
const ALLOWED_HEX = new Set(['#101820', '#53565a', '#d9d9d6', '#f0eee9', '#f4f5f0', '#0f4c81', '#91a8d0', '#d94f70', '#f7cac9', '#f5df4d', '#88b04b', '#bb2649'])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : []
  })
}

const problems: string[] = []
for (const f of ['app', 'components', 'lib'].flatMap(files)) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(FORBIDDEN)) problems.push(`${f}: non-Pantone class "${m[0]}"`)
  if (!f.endsWith('i18n.ts')) for (const m of src.matchAll(HEX)) if (!ALLOWED_HEX.has(m[0].toLowerCase())) problems.push(`${f}: non-Pantone colour ${m[0]}`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('colour check passed (Pantone palette only)')
