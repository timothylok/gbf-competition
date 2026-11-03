import 'server-only'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { query } from './db'
import { ACQUIRE_SQL, HOLDER_SQL, RELEASE_SQL, TOUCH_SQL } from './lock-sql'

export const SESSION_COOKIE = 'gbf_admin'
const SESSION_HOURS = 12
const MAX_FAILS_PER_IP = 5
const MAX_FAILS_GLOBAL = 40
const WINDOW_MINUTES = 15
// Only one admin may be signed in at a time; the lock frees after this much inactivity.
const IDLE_MINUTES = Number(process.env.ADMIN_IDLE_MINUTES) > 0 ? Number(process.env.ADMIN_IDLE_MINUTES) : 20

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return new TextEncoder().encode(s)
}

/**
 * The admin password comes from a Vercel environment variable:
 *  - ADMIN_PASSWORD            plain text (simplest; change it in Vercel, then redeploy)
 *  - ADMIN_PASSWORD_HASH_B64   optional bcrypt hash instead, if you prefer not to store plain text
 */
function credential(): { kind: 'plain' | 'hash'; value: string } | null {
  const plain = process.env.ADMIN_PASSWORD
  if (plain && plain.length >= 8) return { kind: 'plain', value: plain }
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64
  if (b64) return { kind: 'hash', value: Buffer.from(b64, 'base64').toString('utf8') }
  return null
}

async function passwordMatches(cred: { kind: 'plain' | 'hash'; value: string }, attempt: string) {
  if (cred.kind === 'hash') return bcrypt.compare(attempt, cred.value)
  // Compare fixed-length digests in constant time.
  const a = createHash('sha256').update(attempt).digest()
  const b = createHash('sha256').update(cred.value).digest()
  return timingSafeEqual(a, b)
}

/**
 * Keyed fingerprint of the current password. Changing the password changes it, which
 * invalidates every existing session. It is an HMAC so the token reveals nothing guessable.
 */
function fingerprint(cred: { value: string }) {
  return createHmac('sha256', secret()).update(cred.value).digest('hex').slice(0, 24)
}

export interface Session {
  name: string
  sid: string
}

/** Valid only while this session still holds the single-admin lock. Memoised per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value
  const cred = credential()
  if (!token || !cred) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    const pv = fingerprint(cred)
    if (payload.pv !== pv || typeof payload.name !== 'string' || typeof payload.sid !== 'string') return null
    const held = await query(TOUCH_SQL, [payload.sid, String(IDLE_MINUTES), pv])
    return held.length ? { name: payload.name, sid: payload.sid } : null
  } catch {
    return null
  }
})

/** Call at the top of every admin page and every admin server action. */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession()
  if (!s) redirect('/admin/login')
  return s
}

export function clientIp(): string {
  const h = headers()
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim().slice(0, 64)
}

export type LoginResult =
  | { status: 'ok' | 'invalid' | 'locked' | 'config' }
  | { status: 'busy'; who: string; mins: number }

export async function attemptLogin(name: string, password: string): Promise<LoginResult> {
  const cred = credential()
  if (!cred || !process.env.SESSION_SECRET) return { status: 'config' }
  const ip = clientIp()

  const [ipFails] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts WHERE ip = $1 AND ok = false AND at > now() - ($2 || ' minutes')::interval`,
    [ip, String(WINDOW_MINUTES)],
  )
  const [allFails] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts WHERE ok = false AND at > now() - ($1 || ' minutes')::interval`,
    [String(WINDOW_MINUTES)],
  )
  if (ipFails.n >= MAX_FAILS_PER_IP || allFails.n >= MAX_FAILS_GLOBAL) return { status: 'locked' }

  const ok = await passwordMatches(cred, password)
  await query('INSERT INTO login_attempts (ip, ok) VALUES ($1, $2)', [ip, ok])
  await query(`DELETE FROM login_attempts WHERE at < now() - interval '2 days'`)
  if (!ok) return { status: 'invalid' }

  // Password is right. Now try to take the single-admin lock (after the password check, so
  // nobody can learn who is signed in without knowing it).
  const sid = randomUUID()
  const pv = fingerprint(cred)
  const got = await query(ACQUIRE_SQL, [sid, name, pv, String(IDLE_MINUTES)])
  if (got.length === 0) {
    const [holder] = await query<{ name: string; mins: number }>(HOLDER_SQL, [String(IDLE_MINUTES)])
    return { status: 'busy', who: holder?.name ?? '?', mins: holder?.mins ?? IDLE_MINUTES }
  }

  const token = await new SignJWT({ name, sid, pv })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret())
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  })
  return { status: 'ok' }
}

/** Sign out: free the lock so the next admin can sign in straight away. */
export async function endSession(sid: string) {
  await query(RELEASE_SQL, [sid])
  cookies().delete(SESSION_COOKIE)
}
