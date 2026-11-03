import assert from 'node:assert'
import { PGlite } from '@electric-sql/pglite'
import { ACQUIRE_SQL, HOLDER_SQL, RELEASE_SQL, TOUCH_SQL } from '../lib/lock-sql'
import { SCHEMA_SQL } from '../lib/schema'

const IDLE = '20'

async function main() {
  const db = new PGlite() // in-memory
  for (const s of SCHEMA_SQL) await db.exec(s)
  const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[]
  const acquire = (sid: string, name: string, pv = 'pv1') => q(ACQUIRE_SQL, [sid, name, pv, IDLE])
  const touch = (sid: string, pv = 'pv1') => q(TOUCH_SQL, [sid, IDLE, pv])
  const age = (minutes: number) =>
    db.exec(`UPDATE admin_lock SET last_seen = now() - interval '${minutes} minutes' WHERE id = 1`)
  let checks = 0
  const ok = (cond: unknown, msg: string) => (assert(cond, msg), checks++)

  // 1. First admin gets in; second is blocked and sees who holds it
  ok((await acquire('A', 'Alice')).length === 1, 'first admin acquires')
  ok((await acquire('B', 'Bob')).length === 0, 'second admin is blocked')
  const [holder] = await q(HOLDER_SQL, [IDLE])
  ok(holder.name === 'Alice' && holder.mins >= 1 && holder.mins <= 20, 'holder and minutes reported')
  ok((await acquire('C', 'Alice')).length === 0, 'same name from another device is also blocked')

  // 2. Only the holder's session is valid
  ok((await touch('A')).length === 1, 'holder session valid')
  ok((await touch('B')).length === 0, 'blocked session is not valid')
  ok((await touch('A', 'otherpv')).length === 0, 'wrong password fingerprint is not valid')

  // 3. Sign-out releases the lock immediately
  await q(RELEASE_SQL, ['A'])
  ok((await touch('A')).length === 0, 'released session is dead')
  ok((await acquire('B', 'Bob')).length === 1, 'next admin can sign in after sign-out')

  // 4. Idle expiry: inside the limit still blocked, past it frees up, old session dies
  await age(19)
  ok((await acquire('D', 'Dan')).length === 0, 'still blocked at 19 minutes idle')
  await age(21)
  ok((await touch('B')).length === 0, 'idle holder session expires')
  ok((await acquire('D', 'Dan')).length === 1, 'lock frees after idle limit')
  ok((await touch('B')).length === 0, 'old session stays dead after takeover')

  // 5. Activity keeps the lock alive (refresh throttled to every 30s)
  await age(10)
  ok((await touch('D')).length === 1, 'activity within limit is accepted')
  await age(25)
  ok((await touch('D')).length === 0, 'no activity for 25 minutes loses the lock')

  // 6. Changing the password frees the lock for a new login right away
  await acquire('E', 'Eve', 'pvOLD')
  ok((await acquire('F', 'Fay', 'pvOLD')).length === 0, 'blocked with unchanged password')
  ok((await acquire('F', 'Fay', 'pvNEW')).length === 1, 'new password fingerprint takes over immediately')
  ok((await touch('E', 'pvOLD')).length === 0, 'session from old password is dead')

  // 7. Two logins at the same instant: exactly one wins
  await q(RELEASE_SQL, ['F'])
  const results = await Promise.all(['X1', 'X2', 'X3', 'X4'].map((sid, i) => acquire(sid, `P${i}`)))
  ok(results.filter((r) => r.length === 1).length === 1, 'exactly one simultaneous login wins')

  console.log(`lock tests passed (${checks} checks)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
