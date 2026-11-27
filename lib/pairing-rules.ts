import { gradeToLetter, parseGrade } from './grade'
import { teamOf, type Team } from './team'
import { roundSpan } from './time'

/**
 * Pairing rules, written per competition (one rule per line, `#` starts a comment):
 *
 *   avoid: <who> | <who>      the two groups never partner each other (same side of the net)
 *   pair:  <name> + <name>    the two play on the same side in mixed doubles at least once
 *                             (each side is one player: a nickname, optionally `& team:F`)
 *   available: <who> | <from>-<to>, <from>-end   these players only play matches that start and finish inside
 *                             the windows (24-hour times like 13:30, or 1:30pm; `end` = to the end of the day)
 *   prefer: <who> | wd        these women are given women's doubles ahead of mixed doubles where possible
 *                             (a preference, never a restriction)
 *   upper: <who>              these C-grade players are "Upper C": when a B player is paired with a C player,
 *                             the draw prefers an Upper C partner (a preference, never a restriction)
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
  | { kind: 'pair'; line: number; a: Term[]; b: Term[] }
  | { kind: 'upper'; line: number; who: Selector }
  | { kind: 'preferWD'; line: number; who: Selector }
  | { kind: 'available'; line: number; who: Selector; windows: [number, number][] }

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
  /** Players marked Upper C (a soft preference for B+C partnerships). */
  upperC: Set<number>
  /** Women who should get more women's doubles than mixed doubles (a preference). */
  preferWD: Set<number>
  /** Time windows (minutes of the day) when a player can play; players not listed can play any time. */
  availability: Map<number, [number, number][]>
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
    const m = content.match(/^(avoid|pair|upper|available|prefer)\s*:\s*(.*)$/i)
    if (!m) {
      errors.push({ line, message: 'A rule starts with "avoid:", "pair:", "upper:", "available:" or "prefer:".' })
      return
    }
    const body = m[2]
    if (m[1].toLowerCase() === 'prefer') {
      const parts = body.split('|')
      if (parts.length !== 2 || !parts[0].trim() || parts[1].trim().toLowerCase() !== 'wd') {
        errors.push({ line, message: 'Write prefer: <who> | wd (women-only doubles ahead of mixed).' })
        return
      }
      const before = errors.length
      const who = parseSelector(parts[0], line, errors)
      if (errors.length === before && who.length) rules.push({ kind: 'preferWD', line, who })
    } else if (m[1].toLowerCase() === 'available') {
      const parts = body.split('|')
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        errors.push({ line, message: 'Write available: <who> | 13:30-14:30, 15:30-end (one "|", then the time windows).' })
        return
      }
      const before = errors.length
      const who = parseSelector(parts[0], line, errors)
      const windows: [number, number][] = []
      for (const w of parts[1].split(',')) {
        const [from, to, ...extra] = w.split('-').map((x) => x.trim())
        const f = from === undefined ? undefined : parseClock(from)
        const t = to === undefined ? undefined : parseClock(to)
        if (extra.length || f === undefined || t === undefined || t <= f) {
          errors.push({ line, message: `"${w.trim()}": write a window as 13:30-14:30 (24-hour clock; the end can be the word end).` })
        } else windows.push([f, t])
      }
      if (errors.length === before && who.length) rules.push({ kind: 'available', line, who, windows })
    } else if (m[1].toLowerCase() === 'upper') {
      if (!body.trim()) {
        errors.push({ line, message: 'Write upper: <who>, <who> (the Upper C players).' })
        return
      }
      const before = errors.length
      const who = parseSelector(body, line, errors)
      if (errors.length === before && who.length) rules.push({ kind: 'upper', line, who })
    } else if (m[1].toLowerCase() === 'avoid') {
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
      const before = errors.length
      const a = parseSelector(parts[0], line, errors)
      const b = parseSelector(parts[1], line, errors)
      if (errors.length > before) return
      if (a.length !== 1 || b.length !== 1) {
        errors.push({ line, message: 'Each side of pair: is one player: a nickname, optionally with & team:F (no commas).' })
        return
      }
      rules.push({ kind: 'pair', line, a: a[0], b: b[0] })
    }
  })
  return { rules, errors }
}

/** "13:30", "1:30pm", "9am" -> minutes of the day; "end" -> the end of the day. Undefined when it is not a time. */
function parseClock(raw: string): number | undefined {
  const s = raw.trim().toLowerCase()
  if (s === 'end') return 24 * 60
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!m) return undefined
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (min > 59) return undefined
  if (m[3]) {
    if (h < 1 || h > 12) return undefined
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0)
  } else if (h > 23) return undefined
  return h * 60 + min
}

/** Rounds in which these players are not available: the round must start and finish inside one of their windows. */
export function unavailableRounds(
  availability: Map<number, [number, number][]>,
  start: string,
  slotMinutes: number,
  maxRounds: number,
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>()
  availability.forEach((windows, id) => {
    const off = new Set<number>()
    for (let r = 1; r <= maxRounds; r++) {
      const [s, e] = roundSpan(start, slotMinutes, r)
      if (!windows.some(([w0, w1]) => s >= w0 && e <= w1)) off.add(r)
    }
    out.set(id, off)
  })
  return out
}

/** How a group reads in a message, e.g. "Alex & team:F". */
function describe(group: Term[]): string {
  return group.map((t) => (t.kind === 'name' ? t.name : t.kind === 'grade' ? `grade:${gradeToLetter(t.grade)}` : `team:${t.team}`)).join(' & ')
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
  const upperC = new Set<number>()
  const preferWD = new Set<number>()
  const availability = new Map<number, [number, number][]>()

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
    if (rule.kind === 'preferWD') {
      for (const p of resolveSelector(rule.who, rule.line)) {
        if (p.gender !== 'F') warnings.push({ line: rule.line, message: `${p.nickname} is a man, so women's doubles does not apply.` })
        else preferWD.add(p.id)
      }
    } else if (rule.kind === 'available') {
      for (const p of resolveSelector(rule.who, rule.line)) availability.set(p.id, [...(availability.get(p.id) ?? []), ...rule.windows])
    } else if (rule.kind === 'upper') {
      for (const p of resolveSelector(rule.who, rule.line)) {
        if (p.grade !== 3) warnings.push({ line: rule.line, message: `${p.nickname} is not a C-grade player, so Upper C has no effect for them.` })
        else upperC.add(p.id)
      }
    } else if (rule.kind === 'avoid') {
      avoidRules++
      const A = resolveSelector(rule.a, rule.line)
      const B = resolveSelector(rule.b, rule.line)
      for (const x of A) for (const y of B) if (x.id !== y.id) forbidden.add(partnerKey(x.id, y.id))
    } else {
      const one = (group: Term[]) => {
        const label = describe(group)
        const found = matchGroup(group, players)
        if (found.length === 0) warnings.push({ line: rule.line, message: `No player matches "${label}".` })
        else if (found.length > 1) problems.push({ line: rule.line, message: `"${label}" matches ${found.length} players (${found.map((p) => p.nickname).join(', ')}). Use the exact nickname, or add & team:F.` })
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
  return { forbidden, required, problems, warnings, avoidRules, upperC, preferWD, availability }
}
