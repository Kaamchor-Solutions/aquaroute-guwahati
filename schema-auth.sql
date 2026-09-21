-- Accounts for people who report water.
--
-- Two rules this file exists to enforce:
--
-- 1. We never store a password. We store the result of running it through
--    PBKDF2 many times with a random salt. Even with the whole database in
--    hand, an attacker cannot read anybody's password back out.
--
-- 2. We never store a usable session token either. The cookie holds the real
--    token; this table holds its SHA-256 hash. A leaked database therefore
--    does not let anybody log in as anyone.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT,
  pw_hash       TEXT NOT NULL,        -- PBKDF2 output, hex
  pw_salt       TEXT NOT NULL,        -- 16 random bytes, hex
  pw_iterations INTEGER NOT NULL,     -- stored so it can be raised later
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,        -- SHA-256 of the cookie value, never the value
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Failed sign-in attempts, so a password cannot be guessed at speed.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  who        TEXT NOT NULL,           -- salted hash of the IP
  at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_attempts     ON login_attempts (who, at);

-- One flag per account per report. Without this table a single person could
-- flag the same report three times and hide it on their own.
CREATE TABLE IF NOT EXISTS report_flags (
  report_id TEXT NOT NULL,
  user_id   TEXT NOT NULL REFERENCES users(id),
  at        INTEGER NOT NULL,
  PRIMARY KEY (report_id, user_id)
);
