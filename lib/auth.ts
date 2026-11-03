import 'server-only'
import { createHash } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { query } from './db'

export const SESSION_COOKIE = 'gbf_admin'
const SESSION_HOURS = 12
const MAX_FAILS_PER_IP = 5
const MAX_FAILS_GLOBAL = 40
const WINDOW_MINUTES = 15

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return new TextEncoder().encode(s)
}

function passwordHash(): string | null {
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : null
}

/** Changing the password changes this fingerprint, which invalidates every existing session. */
function fingerprint(hash: string) {
  return createHash('sha256').update(hash).digest('hex').slice(0, 16)
}

export interface Session {
  name: string
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  const hash = passwordHash()
  if (!token || !hash) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (payload.pv !== fingerprint(hash) || typeof payload.name !== 'string') return null
    return { name: payload.name }
  } catch {
    return null
  }
}

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

export type LoginResult = 'ok' | 'invalid' | 'locked' | 'config'

export async function attemptLogin(name: string, password: string): Promise<LoginResult> {
  const hash = passwordHash()
  if (!hash || !process.env.SESSION_SECRET) return 'config'
  const ip = clientIp()

  const [ipFails] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts WHERE ip = $1 AND ok = false AND at > now() - ($2 || ' minutes')::interval`,
    [ip, String(WINDOW_MINUTES)],
  )
  const [allFails] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts WHERE ok = false AND at > now() - ($1 || ' minutes')::interval`,
    [String(WINDOW_MINUTES)],
  )
  if (ipFails.n >= MAX_FAILS_PER_IP || allFails.n >= MAX_FAILS_GLOBAL) return 'locked'

  const ok = await bcrypt.compare(password, hash)
  await query('INSERT INTO login_attempts (ip, ok) VALUES ($1, $2)', [ip, ok])
  await query(`DELETE FROM login_attempts WHERE at < now() - interval '2 days'`)
  if (!ok) return 'invalid'

  const token = await new SignJWT({ name, pv: fingerprint(hash) })
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
  return 'ok'
}

export function destroySession() {
  cookies().delete(SESSION_COOKIE)
}
