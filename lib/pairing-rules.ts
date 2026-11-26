import { parseGrade } from './grade'
import { teamOf, type Team } from './team'

/**
 * Pairing rules, written per competition (one rule per line, `#` starts a comment):
 *
 *   avoid: <who> | <who>      the two groups never partner each other (same side of the net)
 *   pair:  <name> + <name>    the two play on the same side in mixed doubles at least once
 *
 * <who> is a comma-separated list; a player matches if any item matches. An item is a nickname
 * (a trailing -F or -RW is ignored, or give the exact nickname), `grade:B`, or `team:F` / `team:R`.
 * Join items with `&` to require all of them: `grade:D & team:F`.
 */

type Term = { kind: 'grade'; grade: number } | { kind: 'team'; team: Team } | { kind: 'name'; name: string }
/** A group is items joined by "&"; a selector is groups joined by ",". */
type Selector = Term[][]

export type Rule =
  | { kind: 'avoid'; line: number; a: Selector; b: Selector }
  | { kind: 'pair'; line: number; a: string; b: string }

export interface RuleProblem {
  line: number
  message: string
}
export interface ParsedRules {
  rules: Rule[]
  /** Syntax errors: generating is refused until these are fixed. */
  errors: RuleProblem[]
}

export interface RulePlayer {
  id: number
  nickname: string
  gender: 'M' | 'F'
  grade: number | null
}
export interface CompiledRules {
  /** Pairs of player ids who must not partner each other, as partnerKey(a, b). */
  forbidden: Set<string>
  /** Pairs (one man + one woman, same team) who must partner at least once. */
  required: [number, number][]
  /** Name problems that stop generation (a name that matches several players, or a pair that cannot play mixed). */
  problems: RuleProblem[]
  /** Things worth a look but not blocking (a name that matches nobody). */
  warnings: RuleProblem[]
  avoidRules: number
}

/** Order-free key for two player ids. */
export const partnerKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

const baseName = (n: string) => n.trim().toLowerCase().replace(/-(f|rw)$/, '')
const hasSuffix = (n: string) => /-(f|rw)$/i.test(n.trim())

function parseSelector(text: string, line: number, errors: RuleProblem[]): Selector {
  const groups: Selector = []
  for (const rawGroup of text.split(',')) {
    const terms: Term[] = []
    for (const raw of rawGroup.split('&')) {
      const item = raw.trim()
      if (!item) {
        errors.push({ line, message: 'An empty item (check the commas and &).' })
        continue
      }
      const grade = item.match(/^grade\s*:\s*(.+)$/i)
      const team = item.match(/^team\s*:\s*(.+)$/i)
      if (grade) {
        const g = parseGrade(grade[1].trim())
        if (g == null) errors.push({ line, message: `"${item}": the grade must be a letter A to I.` })
        else terms.push({ kind: 'grade', grade: g })
      } else if (team) {
        const v = team[1].trim().toUpperCase()
        if (v === 'F' || v === 'R') terms.push({ kind: 'team', team: v })
        else errors.push({ line, message: `"${item}": the team must be F (Philippines, nicknames ending -F) or R (the rest).` })
      } else {
        terms.push({ kind: 'name', name: item })
      }
    }
    if (terms.length) groups.push(terms)
  }
  return groups
}

export function parseRules(text: string | null | undefined): ParsedRules {
  const rules: Rule[] = []
  const errors: RuleProblem[] = []
  ;(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const content = raw.replace(/#.*$/, '').trim()
    if (!content) return
    const m = content.match(/^(avoid|pair)\s*:\s*(.*)$/i)
    if (!m) {
      errors.push({ line, message: 'A rule starts with "avoid:" or "pair:".' })
      return
    }
    const body = m[2]
    if (m[1].toLowerCase() === 'avoid') {
      const parts = body.split('|')
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        errors.push({ line, message: 'Write avoid: <who> | <who> (one "|" between two groups).' })
        return
      }
      const before = errors.length
      const a = parseSelector(parts[0], line, errors)
      const b = parseSelector(parts[1], line, errors)
      if (errors.length === before && a.length && b.length) rules.push({ kind: 'avoid', line, a, b })
    } else {
      const parts = body.split('+').map((s) => s.trim())
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        errors.push({ line, message: 'Write pair: <name> + <name> (two names with one "+").' })
        return
      }
      rules.push({ kind: 'pair', line, a: parts[0], b: parts[1] })
    }
  })
  return { rules, errors }
}

/** Players matching one group (all items must match). */
function matchGroup(group: Term[], players: RulePlayer[]): RulePlayer[] {
  return players.filter((p) =>
    group.every((t) => {
      if (t.kind === 'grade') return p.grade === t.grade
      if (t.kind === 'team') return teamOf(p.nickname) === t.team
      return hasSuffix(t.name) ? p.nickname.trim().toLowerCase() === t.name.trim().toLowerCase() : baseName(p.nickname) === baseName(t.name)
    }),
  )
}

/** Turn the parsed rules into player ids for this roster, and report names that do not fit. */
export function compileRules(parsed: ParsedRules, players: RulePlayer[]): CompiledRules {
  const forbidden = new Set<string>()
  const required: [number, number][] = []
  const problems: RuleProblem[] = []
  const warnings: RuleProblem[] = []
  let avoidRules = 0

  const resolveSelector = (sel: Selector, line: number): RulePlayer[] => {
    const out = new Map<number, RulePlayer>()
    for (const group of sel) {
      const found = matchGroup(group, players)
      const named = group.filter((t) => t.kind === 'name') as { kind: 'name'; name: string }[]
      if (named.length) {
        const label = named.map((t) => t.name).join(' & ')
        if (found.length === 0) warnings.push({ line, message: `No player matches "${label}".` })
        else if (found.length > 1) {
          problems.push({ line, message: `"${label}" matches ${found.length} players (${found.map((p) => p.nickname).join(', ')}). Use the exact nickname, for example "${found[0].nickname}".` })
        }
      }
      for (const p of found) out.set(p.id, p)
    }
    return [...out.values()]
  }

  for (const rule of parsed.rules) {
    if (rule.kind === 'avoid') {
      avoidRules++
      const A = resolveSelector(rule.a, rule.line)
      const B = resolveSelector(rule.b, rule.line)
      for (const x of A) for (const y of B) if (x.id !== y.id) forbidden.add(partnerKey(x.id, y.id))
    } else {
      const one = (name: string) => {
        const found = matchGroup([{ kind: 'name', name }], players)
        if (found.length === 0) warnings.push({ line: rule.line, message: `No player matches "${name}".` })
        else if (found.length > 1) problems.push({ line: rule.line, message: `"${name}" matches ${found.length} players (${found.map((p) => p.nickname).join(', ')}). Use the exact nickname.` })
        return found.length === 1 ? found[0] : null
      }
      const a = one(rule.a)
      const b = one(rule.b)
      if (!a || !b) continue
      if (a.gender === b.gender || teamOf(a.nickname) !== teamOf(b.nickname)) {
        problems.push({ line: rule.line, message: `${a.nickname} and ${b.nickname} cannot play mixed doubles together: a pair needs one man and one woman from the same team.` })
        continue
      }
      required.push([a.id, b.id])
    }
  }
  return { forbidden, required, problems, warnings, avoidRules }
}
