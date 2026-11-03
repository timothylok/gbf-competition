// Idempotent schema, run statement by statement on first query.
export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS competitions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00',
    courts INT NOT NULL DEFAULT 5,
    slot_minutes INT NOT NULL DEFAULT 15,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','finished')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('M','F')),
    grade INT,
    UNIQUE (competition_id, nickname)
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN ('MD','XD')),
    round INT NOT NULL,
    court INT NOT NULL,
    a1 INT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    a2 INT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    b1 INT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    b2 INT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    score_a INT,
    score_b INT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','done','cancelled')),
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS matches_comp_idx ON matches (competition_id, round, court)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ok BOOLEAN NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (ip, at)`,
]
