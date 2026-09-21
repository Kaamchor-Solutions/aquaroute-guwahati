-- Sign in with Google, added in v7.
--
-- Two columns rather than a new table. An account is the same account however
-- you prove you own it, and the thing that ties the two proofs together is the
-- email address, which Google tells us it has verified.
--
-- SQLite cannot drop a NOT NULL, so pw_hash stays required. A Google-only
-- account gets random bytes there that no password can ever produce, and
-- has_password = 0 records that fact honestly rather than leaving a hash
-- sitting around that looks real.

ALTER TABLE users ADD COLUMN google_sub    TEXT;
ALTER TABLE users ADD COLUMN has_password  INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users (google_sub)
  WHERE google_sub IS NOT NULL;
