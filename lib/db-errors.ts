/**
 * Recognise a Postgres error however the driver wraps it (embedded PGlite, Neon over HTTP, or an error with a `cause`):
 * by its SQLSTATE code when there is one, otherwise by its message. Server actions use these to show a friendly
 * message ("this player is in a match") instead of crashing with "Application error".
 */
type Maybe = { code?: unknown; message?: unknown; cause?: Maybe; sourceError?: Maybe } | null | undefined

function codeOf(e: unknown): string | undefined {
  const x = e as Maybe
  const c = x?.code ?? x?.cause?.code ?? x?.sourceError?.code
  return typeof c === 'string' ? c : undefined
}
function messageOf(e: unknown): string {
  const x = e as Maybe
  return String(x?.message ?? x?.cause?.message ?? '')
}

/** A row is still referenced by another table (23503 foreign_key_violation, or 23001 restrict_violation). */
export function isForeignKeyViolation(e: unknown): boolean {
  const c = codeOf(e)
  return c === '23503' || c === '23001' || /violates foreign key constraint|violates restrict constraint/i.test(messageOf(e))
}

/** A unique constraint was broken (23505 unique_violation), for example a duplicate nickname. */
export function isUniqueViolation(e: unknown): boolean {
  return codeOf(e) === '23505' || /duplicate key value violates unique constraint/i.test(messageOf(e))
}
