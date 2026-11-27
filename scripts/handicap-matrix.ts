// Writes docs/handicap-matrix.md: npx tsx scripts/handicap-matrix.ts
import { writeFileSync } from 'node:fs'
import { handicapMatrixMarkdown } from '../lib/handicap-matrix'

writeFileSync('docs/handicap-matrix.md', handicapMatrixMarkdown())
console.log('wrote docs/handicap-matrix.md')
