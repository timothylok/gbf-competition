import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { ACQUIRE_SQL, HOLDER_SQL, RELEASE_SQL, TOUCH_SQL } from '../../lib/lock-sql'
import { SCHEMA_SQL } from '../../lib/schema'

// The single-admin lock, exercised against a real (in-memory) Postgres.
const IDLE = '20'
let db: PGlite
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[]
const acquire = (sid: string, name: string, pv = 'pv1') => q(ACQUIRE_SQL, [sid, name, pv, IDLE])
const touch = (sid: string, pv = 'pv1') => q(TOUCH_SQL, [sid, IDLE, pv])
const age = (minutes: number) => db.exec(`UPDATE admin_lock SET last_seen = now() - interval '${minutes} minutes' WHERE id = 1`)
const reset = () => db.exec('DELETE FROM admin_lock')

describe('single-admin lock', () => {
  before(async () => {
    db = new PGlite()
    for (const s of SCHEMA_SQL) await db.exec(s)
  })

  it('lets the first admin in and blocks the second, reporting who holds it', async () => {
    await reset()
    assert.equal((await acquire('A', 'Alice')).length, 1)
    assert.equal((await acquire('B', 'Bob')).length, 0)
    const [h] = await q(HOLDER_SQL, [IDLE])
    assert.equal(h.name, 'Alice')
    assert(h.mins >= 1 && h.mins <= 20)
  })

  it('blocks the same name from another device', async () => {
    assert.equal((await acquire('C', 'Alice')).length, 0)
  })

  it('only the holder\'s session is valid', async () => {
    assert.equal((await touch('A')).length, 1)
    assert.equal((await touch('B')).length, 0)
    assert.equal((await touch('A', 'other-password-fingerprint')).length, 0)
  })

  it('frees the lock on sign-out', async () => {
    await q(RELEASE_SQL, ['A'])
    assert.equal((await touch('A')).length, 0)
    assert.equal((await acquire('B', 'Bob')).length, 1)
  })

  it('frees the lock after the idle limit and kills the old session', async () => {
    await age(19)
    assert.equal((await acquire('D', 'Dan')).length, 0, 'still blocked at 19 minutes')
    await age(21)
    assert.equal((await touch('B')).length, 0, 'idle holder is out')
    assert.equal((await acquire('D', 'Dan')).length, 1, 'free after 21 minutes')
    assert.equal((await touch('B')).length, 0, 'old session stays dead')
  })

  it('keeps the lock alive while the holder is active, and loses it when they stop', async () => {
    await age(10)
    assert.equal((await touch('D')).length, 1)
    await age(25)
    assert.equal((await touch('D')).length, 0)
  })

  it('frees the lock immediately when the password changes', async () => {
    await reset()
    await acquire('E', 'Eve', 'pvOLD')
    assert.equal((await acquire('F', 'Fay', 'pvOLD')).length, 0)
    assert.equal((await acquire('F', 'Fay', 'pvNEW')).length, 1)
    assert.equal((await touch('E', 'pvOLD')).length, 0)
  })

  it('lets exactly one of several simultaneous logins win', async () => {
    await reset()
    const results = await Promise.all(['X1', 'X2', 'X3', 'X4'].map((sid, i) => acquire(sid, `P${i}`)))
    assert.equal(results.filter((r) => r.length === 1).length, 1)
  })

  it('never holds more than one row', async () => {
    await assert.rejects(() => db.exec(`INSERT INTO admin_lock (id, sid, name, pv) VALUES (2, 'z', 'z', 'z')`))
  })
})
