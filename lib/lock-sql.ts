// SQL for the single-admin lock. Kept separate (no server-only import) so tests can run it directly.
// Table admin_lock holds at most one row: who is signed in, and when they were last active.

/**
 * Take the lock. Succeeds (returns a row) only if nobody holds it, the holder has been idle
 * longer than the limit, or the password has changed since the holder signed in.
 * $1 sid, $2 name, $3 password fingerprint, $4 idle minutes. Atomic: two simultaneous logins cannot both win.
 */
export const ACQUIRE_SQL = `
  INSERT INTO admin_lock (id, sid, name, pv, last_seen) VALUES (1, $1, $2, $3, now())
  ON CONFLICT (id) DO UPDATE
    SET sid = EXCLUDED.sid, name = EXCLUDED.name, pv = EXCLUDED.pv, last_seen = now()
    WHERE admin_lock.last_seen < now() - ($4 || ' minutes')::interval OR admin_lock.pv <> EXCLUDED.pv
  RETURNING sid`

/** Who holds it, and about how many minutes until it frees up. $1 idle minutes. */
export const HOLDER_SQL = `
  SELECT name, GREATEST(1, ceil(extract(epoch FROM (last_seen + ($1 || ' minutes')::interval - now())) / 60))::int AS mins
  FROM admin_lock WHERE id = 1`

/**
 * Validate the caller still holds the lock and count the request as activity
 * (refreshed at most every 30 seconds). Returns a row only if they do.
 * $1 sid, $2 idle minutes, $3 password fingerprint.
 */
export const TOUCH_SQL = `
  UPDATE admin_lock
  SET last_seen = CASE WHEN last_seen < now() - interval '30 seconds' THEN now() ELSE last_seen END
  WHERE id = 1 AND sid = $1 AND pv = $3 AND last_seen > now() - ($2 || ' minutes')::interval
  RETURNING name`

/** Release on sign-out. $1 sid. */
export const RELEASE_SQL = `DELETE FROM admin_lock WHERE sid = $1`
