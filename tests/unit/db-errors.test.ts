import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isForeignKeyViolation, isUniqueViolation } from '../../lib/db-errors'

describe('database error classification', () => {
  it('foreign key violations: by code, by wrapped cause, or by message alone', () => {
    assert(isForeignKeyViolation({ code: '23503', message: 'x' }), 'Neon / PGlite shape')
    assert(isForeignKeyViolation({ code: '23001' }), 'restrict_violation')
    assert(isForeignKeyViolation({ cause: { code: '23503' } }), 'wrapped in a cause')
    assert(isForeignKeyViolation(new Error('update or delete on table "players" violates foreign key constraint "matches_a1_fkey" on table "matches"')), 'message only, no code')
    assert(isForeignKeyViolation({ sourceError: { code: '23503' } }))
  })
  it('unique violations: by code or by message', () => {
    assert(isUniqueViolation({ code: '23505' }))
    assert(isUniqueViolation(new Error('duplicate key value violates unique constraint "players_competition_id_nickname_key"')))
  })
  it('anything else is neither', () => {
    for (const e of [new Error('connection reset'), { code: '08006' }, { code: '42P01', message: 'relation does not exist' }, null, undefined, 'text', 42]) {
      assert(!isForeignKeyViolation(e), `not an FK error: ${JSON.stringify(e)}`)
      assert(!isUniqueViolation(e), `not a unique error: ${JSON.stringify(e)}`)
    }
    assert(!isUniqueViolation({ code: '23503' }) && !isForeignKeyViolation({ code: '23505' }), 'the two never overlap')
  })
})
