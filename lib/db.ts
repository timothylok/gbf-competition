import 'server-only'
import { neon } from '@neondatabase/serverless'
import { SCHEMA_SQL } from './schema'

type Row = Record<string, any>
type Runner = (text: string, params?: unknown[]) => Promise<Row[]>

// Cached on globalThis (as promises) so hot-reloads and parallel first requests
// never open a second embedded DB on the same folder.
const g = globalThis as unknown as { __gbfRunner?: Promise<Runner>; __gbfReady?: Promise<void> }

function getRunner(): Promise<Runner> {
  return (g.__gbfRunner ??= createRunner())
}

async function createRunner(): Promise<Runner> {
  let runner: Runner
  const url = process.env.DATABASE_URL
  if (url) {
    const sql = neon(url)
    runner = async (text, params = []) => (await sql.query(text, params as any[])) as Row[]
  } else if (process.env.NODE_ENV !== 'production') {
    // Local dev only: embedded Postgres so no account is needed.
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite('./.pglite')
    runner = async (text, params = []) => (await db.query(text, params as any[])).rows as Row[]
  } else {
    throw new Error('DATABASE_URL is not set')
  }
  return runner
}

/** Run a parameterised query. The schema is created on first use (idempotent). */
export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const run = await getRunner()
  await (g.__gbfReady ??= (async () => {
    for (const stmt of SCHEMA_SQL) await run(stmt)
  })())
  return (await run(text, params)) as T[]
}

export async function audit(actor: string, action: string, detail = '') {
  await query('INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)', [actor, action, detail.slice(0, 500)])
}
