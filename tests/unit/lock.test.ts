import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { ACQUIRE_SQL, HOLDER_SQL, RELEASE_SQL, TOUCH_SQL } from '../../lib/lock-sql'
import { SCHEMA_SQL } from '../../lib/schema'

// The single-admin lock, exercised against a real (in-memory) Postgres.
const IDLE = '20'
let db: PGlite
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[]
const acquire = (sid: string, name: string, pv = 'pv1') => q(ACQUIRE_SQL, [sid, name, pv])
const touch = (sid: string, pv = 'pv1') => q(TOUCH_SQL, [sid, IDLE, pv])
const age = (minutes: number) => db.exec(`UPDATE admin_lock SET last_seen = now() - interval '${minutes} minutes' WHERE id = 1`)
const reset = () => db.exec('DELETE FROM admin_lock')

describe('single-admin lock', () => {
  before(async () => {
    db = new PGlite()
    for (const s of SCHEMA_SQL) await db.exec(s)
  })

  it('lets the first admin in; a second sign-in takes over and signs the first out', async () => {
    await reset()
    assert.equal((await acquire('A', 'Alice')).length, 1)
    const [h] = await q(HOLDER_SQL, [IDLE])
    assert.equal(h.name, 'Alice', 'the takeover can record who was signed out')
    assert.equal((await acquire('B', 'Bob')).length, 1, 'the newest sign-in wins')
    assert.equal((await touch('A')).length, 0, 'Alice is out on her next click')
    assert.equal((await touch('B')).length, 1)
  })

  it('the same name on another device also takes over', async () => {
    assert.equal((await acquire('C', 'Bob')).length, 1)
    assert.equal((await touch('B')).length, 0)
    assert.equal((await touch('C')).length, 1)
  })

  it('a session is valid only with the current password', async () => {
    assert.equal((await touch('C', 'other-password-fingerprint')).length, 0)
  })

  it('frees the lock on sign-out', async () => {
    await q(RELEASE_SQL, ['C'])
    assert.equal((await touch('C')).length, 0)
    assert.equal((await q(HOLDER_SQL, [IDLE])).length, 0, 'nobody is signed in')
    assert.equal((await acquire('B', 'Bob')).length, 1)
  })

  it('an idle holder is signed out, and is not reported as signed in', async () => {
    await age(19)
    assert.equal((await touch('B')).length, 1)
    await age(21)
    assert.equal((await touch('B')).length, 0, 'idle holder is out')
    assert.equal((await q(HOLDER_SQL, [IDLE])).length, 0)
    assert.equal((await acquire('D', 'Dan')).length, 1)
    assert.equal((await touch('B')).length, 0, 'old session stays dead')
  })

  it('keeps the lock alive while the holder is active, and loses it when they stop', async () => {
    await age(10)
    assert.equal((await touch('D')).length, 1)
    await age(25)
    assert.equal((await touch('D')).length, 0)
  })

  it('signs everyone out when the password changes', async () => {
    await reset()
    await acquire('E', 'Eve', 'pvOLD')
    assert.equal((await touch('E', 'pvNEW')).length, 0)
  })

  it('leaves exactly one valid session after several simultaneous logins', async () => {
    await reset()
    const sids = ['X1', 'X2', 'X3', 'X4']
    await Promise.all(sids.map((sid, i) => acquire(sid, `P${i}`)))
    const valid = await Promise.all(sids.map((sid) => touch(sid)))
    assert.equal(valid.filter((r) => r.length === 1).length, 1)
  })

  it('never holds more than one row', async () => {
    await assert.rejects(() => db.exec(`INSERT INTO admin_lock (id, sid, name, pv) VALUES (2, 'z', 'z', 'z')`))
  })
})
