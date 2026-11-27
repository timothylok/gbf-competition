'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { audit, query } from './db'
import { attemptLogin, endSession, requireAdmin } from './auth'
import { back, parsePlayerLines } from './action-utils'
import { parseGrade } from './grade'
import { isForeignKeyViolation, isUniqueViolation } from './db-errors'
import { generatePlan } from './scheduler'
import { compileRules, parseRules } from './pairing-rules'
import { teamOf } from './team'
import { maxRoundsFor, roundsIn } from './time'
import type { Key } from './i18n'

const int = z.coerce.number().int()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const compSchema = z.object({
  name: z.string().trim().min(1).max(80),
  event_date: date,
  start_time: time,
  courts: int.min(1).max(20),
  slot_minutes: int.min(5).max(60),
  /** Latest finish; blank = start time + 5 hours. */
  end_time: z.union([z.literal(''), time]).optional(),
  /** Pairing rules, one per line. Saved as typed; problems are shown on the Overview tab and block generating. */
  pairing_rules: z.string().max(4000).optional(),
}).refine((c) => !c.end_time || c.end_time > c.start_time)

function fields(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {}
  fd.forEach((v, k) => {
    if (typeof v === 'string') o[k] = v
  })
  return o
}

// ---------- session ----------

export async function login(
  _prev: { error?: Key } | undefined,
  fd: FormData,
): Promise<{ error?: Key }> {
  const name = String(fd.get('name') ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40)
  const password = String(fd.get('password') ?? '').slice(0, 200)
  if (!name) return { error: 'errName' }
  const result = await attemptLogin(name, password)
  if (result.status === 'invalid') return { error: 'errInvalid' }
  if (result.status === 'locked') return { error: 'errLocked' }
  if (result.status !== 'ok') return { error: 'errConfig' }
  await audit(name, 'login', result.tookOverFrom ? `signed out ${result.tookOverFrom}` : '')
  redirect('/admin')
}

export async function logout() {
  const s = await requireAdmin()
  await audit(s.name, 'logout')
  await endSession(s.sid)
  redirect('/admin/login')
}

/** Public: remember the language choice and return to the page the visitor was on. */
export async function setLang(fd: FormData) {
  const lang = fd.get('lang') === 'zh' ? 'zh' : 'en'
  cookies().set('lang', lang, { path: '/', maxAge: 31536000, sameSite: 'lax' })
  let dest = '/'
  try {
    const ref = headers().get('referer')
    const host = headers().get('host')
    if (ref) {
      const u = new URL(ref)
      if (u.host === host) dest = u.pathname + u.search
    }
  } catch {
    /* fall back to / */
  }
  redirect(dest)
}

// ---------- competitions ----------

export async function createCompetition(fd: FormData) {
  const s = await requireAdmin()
  const r = compSchema.safeParse(fields(fd))
  if (!r.success) back('/admin', 'err', 'invalid')
  const c = r.data
  const [row] = await query<{ id: number }>(
    'INSERT INTO competitions (name, event_date, start_time, courts, slot_minutes, end_time) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [c.name, c.event_date, c.start_time, c.courts, c.slot_minutes, c.end_time || null],
  )
  await audit(s.name, 'competition.create', `${c.name} (#${row.id})`)
  redirect(`/admin/c/${row.id}`)
}

export async function updateCompetition(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const id = int.parse(f.id)
  const path = `/admin/c/${id}`
  const r = compSchema.and(z.object({ status: z.enum(['draft', 'live', 'finished']) })).safeParse(f)
  if (!r.success) back(path, 'err', 'invalid')
  const c = r.data
  await query(
    'UPDATE competitions SET name=$2, event_date=$3, start_time=$4, courts=$5, slot_minutes=$6, status=$7, end_time=$8, pairing_rules=$9 WHERE id=$1',
    [id, c.name, c.event_date, c.start_time, c.courts, c.slot_minutes, c.status, c.end_time || null, (c.pairing_rules ?? '').trim() || null],
  )
  await audit(s.name, 'competition.update', `#${id} status=${c.status}`)
  back(path, 'ok', 'saved')
}

export async function deleteCompetition(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const id = int.parse(f.id)
  const rows = await query<{ name: string }>('SELECT name FROM competitions WHERE id=$1', [id])
  if (!rows[0]) back('/admin', 'err', 'notfound')
  if ((f.confirm ?? '').trim() !== rows[0].name) back(`/admin/c/${id}`, 'err', 'confirm')
  await query('DELETE FROM matches WHERE competition_id=$1', [id])
  await query('DELETE FROM competitions WHERE id=$1', [id])
  await audit(s.name, 'competition.delete', `${rows[0].name} (#${id})`)
  back('/admin', 'ok', 'deleted')
}

// ---------- players ----------

export async function addPlayers(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const id = int.parse(f.id)
  const path = `/admin/c/${id}/players`
  const { players } = parsePlayerLines((f.text ?? '').slice(0, 20000))
  if (players.length === 0) back(path, 'err', 'invalid')
  const params: unknown[] = [id]
  const values = players.map((p) => {
    params.push(p.nickname, p.gender, p.grade)
    const n = params.length
    return `($1, $${n - 2}, $${n - 1}, $${n})`
  })
  await query(
    `INSERT INTO players (competition_id, nickname, gender, grade) VALUES ${values.join(',')}
     ON CONFLICT (competition_id, nickname) DO NOTHING`,
    params,
  )
  await audit(s.name, 'players.add', `#${id}: ${players.length} lines`)
  back(path, 'ok', 'created')
}

export async function updatePlayer(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const path = `/admin/c/${comp}/players`
  const r = z
    .object({
      id: int,
      nickname: z.string().trim().min(1).max(30),
      gender: z.enum(['M', 'F']),
      grade: z.string().trim().max(1).refine((g) => parseGrade(g) !== undefined),
      d_friendly: z.string().optional(),
    })
    .safeParse(f)
  if (!r.success) back(path, 'err', 'invalid')
  const p = r.data
  try {
    await query('UPDATE players SET nickname=$3, gender=$4, grade=$5, d_friendly=$6 WHERE id=$1 AND competition_id=$2', [
      p.id, comp, p.nickname, p.gender, parseGrade(p.grade), p.d_friendly === 'on',
    ])
  } catch (e: any) {
    if (isUniqueViolation(e)) back(path, 'err', 'duplicate')
    throw e
  }
  await audit(s.name, 'player.update', `#${p.id} ${p.nickname}`)
  back(path, 'ok', 'saved')
}

export async function deletePlayer(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const id = int.parse(f.id)
  const path = `/admin/c/${comp}/players`
  // A player in a match cannot be deleted. Check first, so the friendly message never depends on how the driver reports the error.
  const [used] = await query<{ n: number }>('SELECT count(*)::int AS n FROM matches WHERE competition_id=$1 AND $2 IN (a1, a2, b1, b2)', [comp, id])
  if (used.n > 0) back(path, 'err', 'inuse')
  try {
    await query('DELETE FROM players WHERE id=$1 AND competition_id=$2', [id, comp])
  } catch (e: unknown) {
    if (isForeignKeyViolation(e)) back(path, 'err', 'inuse')
    throw e
  }
  await audit(s.name, 'player.delete', `#${id}`)
  back(path, 'ok', 'deleted')
}

// ---------- schedule ----------

export async function generateSchedule(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const id = int.parse(f.id)
  const path = `/admin/c/${id}/schedule`
  const r = z
    .object({ maxGames: int.min(1).max(10), hours: z.coerce.number().min(0.5).max(24), seed: int.min(0).max(1_000_000) })
    .safeParse(f)
  if (!r.success) back(path, 'err', 'invalid')

  const comps = await query<{ courts: number; slot_minutes: number; start_time: string; end_time: string | null; pairing_rules: string | null }>(
    'SELECT courts, slot_minutes, start_time, end_time, pairing_rules FROM competitions WHERE id=$1',
    [id],
  )
  if (!comps[0]) back('/admin', 'err', 'notfound')
  const [started] = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM matches WHERE competition_id=$1 AND status <> 'scheduled'",
    [id],
  )
  if (started.n > 0) back(path, 'err', 'locked')
  const rows = await query<{ id: number; nickname: string; gender: 'M' | 'F'; grade: number | null; d_friendly: boolean }>(
    'SELECT id, nickname, gender, grade, d_friendly FROM players WHERE competition_id=$1',
    [id],
  )
  const players = rows.map((p) => ({ id: p.id, gender: p.gender, grade: p.grade, dFriendly: p.d_friendly, team: teamOf(p.nickname) }))
  if (players.length < 4) back(path, 'err', 'players')

  // The draw stops at the last round that fits: both the hours typed in the form and the competition's end time apply.
  const maxRounds = Math.min(roundsIn(r.data.hours * 60, comps[0].slot_minutes), maxRoundsFor(comps[0]))
  if (maxRounds < 1) back(path, 'err', 'toolong')
  // Pairing rules: syntax errors and ambiguous names stop the draw, so nobody gets a schedule that ignores a rule.
  const parsedRules = parseRules(comps[0].pairing_rules)
  const compiledRules = compileRules(parsedRules, rows.map((p) => ({ id: p.id, nickname: p.nickname, gender: p.gender, grade: p.grade })))
  if (parsedRules.errors.length || compiledRules.problems.length) back(path, 'err', 'badrules')
  const plan = generatePlan(players, comps[0].courts, { maxGames: r.data.maxGames, maxRounds }, r.data.seed, { forbidden: compiledRules.forbidden, required: compiledRules.required, upperC: compiledRules.upperC })
  if (plan.matches.length === 0) back(path, 'err', 'players')

  // One statement: delete the old draw and insert the new one atomically.
  const params: unknown[] = [id]
  const values = plan.matches.map((m) => {
    params.push(m.event, m.round, m.court, m.a1, m.a2, m.b1, m.b2)
    const n = params.length
    return `($1,$${n - 6},$${n - 5},$${n - 4},$${n - 3},$${n - 2},$${n - 1},$${n})`
  })
  await query(
    `WITH d AS (DELETE FROM matches WHERE competition_id=$1)
     INSERT INTO matches (competition_id, event, round, court, a1, a2, b1, b2) VALUES ${values.join(',')}`,
    params,
  )
  await audit(
    s.name,
    'schedule.generate',
    `#${id}: ${plan.matches.length} matches in ${plan.rounds} rounds, seed ${r.data.seed}, max ${r.data.maxGames} games (handicap ${plan.hdCount}, filler ${plan.fillerCount}, under cap ${plan.underCap.length}, rules: ${compiledRules.forbidden.size} avoid pairs, ${compiledRules.required.length - plan.unmetPairs.length}/${compiledRules.required.length} required pairs met)`,
  )
  back(path, 'ok', plan.warnings.length || plan.unmetPairs.length ? 'generated_warn' : 'generated')
}

const matchSchema = z.object({
  event: z.enum(['MD', 'XD']),
  round: int.min(1).max(99),
  court: int.min(1).max(50),
  a1: int, a2: int, b1: int, b2: int,
})

async function checkLineup(comp: number, ids: number[]) {
  if (new Set(ids).size !== 4) return false
  const [row] = await query<{ n: number }>(
    'SELECT count(*)::int AS n FROM players WHERE competition_id=$1 AND id = ANY($2::int[])',
    [comp, ids],
  )
  return row.n === 4
}

/** Refuse a round that would end after the competition's end time. */
async function roundFits(comp: number, round: number) {
  const [c] = await query<{ slot_minutes: number; start_time: string; end_time: string | null }>(
    'SELECT slot_minutes, start_time, end_time FROM competitions WHERE id=$1',
    [comp],
  )
  return !!c && round <= maxRoundsFor(c)
}

export async function saveMatch(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const path = `/admin/c/${comp}/schedule`
  const r = matchSchema.extend({ id: int }).safeParse(f)
  if (!r.success) back(path, 'err', 'invalid')
  const m = r.data
  if (!(await checkLineup(comp, [m.a1, m.a2, m.b1, m.b2]))) back(`${path}?m=${m.id}`, 'err', 'distinct')
  if (!(await roundFits(comp, m.round))) back(`${path}?m=${m.id}`, 'err', 'toolate')
  const rows = await query(
    `UPDATE matches SET event=$3, round=$4, court=$5, a1=$6, a2=$7, b1=$8, b2=$9, version=version+1, updated_at=now()
     WHERE id=$1 AND competition_id=$2 AND status <> 'done' RETURNING id`,
    [m.id, comp, m.event, m.round, m.court, m.a1, m.a2, m.b1, m.b2],
  )
  if (rows.length === 0) back(path, 'err', 'locked')
  await audit(s.name, 'match.update', `#${m.id} R${m.round} C${m.court}`)
  back(path, 'ok', 'saved')
}

export async function addMatch(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const path = `/admin/c/${comp}/schedule`
  const r = matchSchema.safeParse(f)
  if (!r.success) back(path, 'err', 'invalid')
  const m = r.data
  if (!(await checkLineup(comp, [m.a1, m.a2, m.b1, m.b2]))) back(path, 'err', 'distinct')
  if (!(await roundFits(comp, m.round))) back(path, 'err', 'toolate')
  const [row] = await query<{ id: number }>(
    'INSERT INTO matches (competition_id, event, round, court, a1, a2, b1, b2) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [comp, m.event, m.round, m.court, m.a1, m.a2, m.b1, m.b2],
  )
  await audit(s.name, 'match.add', `#${row.id} R${m.round} C${m.court}`)
  back(path, 'ok', 'created')
}

export async function deleteMatch(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const id = int.parse(f.id)
  const path = `/admin/c/${comp}/schedule`
  const rows = await query("DELETE FROM matches WHERE id=$1 AND competition_id=$2 AND status <> 'done' RETURNING id", [id, comp])
  if (rows.length === 0) back(path, 'err', 'locked')
  await audit(s.name, 'match.delete', `#${id}`)
  back(path, 'ok', 'deleted')
}

// ---------- scores ----------

export async function scoreMatch(fd: FormData) {
  const s = await requireAdmin()
  const f = fields(fd)
  const comp = int.parse(f.comp)
  const path = `/admin/c/${comp}/scores${f.r ? `?r=${encodeURIComponent(f.r)}` : ''}`
  const base = z.object({ id: int, version: int, intent: z.enum(['live', 'done', 'reset', 'cancel']) }).safeParse(f)
  if (!base.success) back(path, 'err', 'invalid')
  const { id, version, intent } = base.data

  const scoreField = z.union([z.literal(''), int.min(0).max(99)])
  const sa = scoreField.safeParse(f.score_a ?? '')
  const sb = scoreField.safeParse(f.score_b ?? '')
  if (!sa.success || !sb.success) back(path, 'err', 'invalid')
  const a = sa.data === '' ? null : sa.data
  const b = sb.data === '' ? null : sb.data

  let status: string
  let scoreA: number | null = a
  let scoreB: number | null = b
  if (intent === 'done') {
    if (a === null || b === null) back(path, 'err', 'invalid')
    status = 'done'
  } else if (intent === 'live') {
    status = 'live'
    if (a === null || b === null) scoreA = scoreB = null
  } else if (intent === 'cancel') {
    status = 'cancelled'
    scoreA = scoreB = null
  } else {
    status = 'scheduled'
    scoreA = scoreB = null
  }

  const rows = await query(
    `UPDATE matches SET status=$4, score_a=$5, score_b=$6, version=version+1, updated_at=now()
     WHERE id=$1 AND competition_id=$2 AND version=$3 RETURNING id`,
    [id, comp, version, status, scoreA, scoreB],
  )
  if (rows.length === 0) back(path, 'err', 'conflict')
  await audit(s.name, `match.${intent}`, `#${id} ${scoreA ?? '-'}:${scoreB ?? '-'}`)
  back(path, 'ok', 'saved')
}
