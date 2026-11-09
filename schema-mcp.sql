-- Report history + the only thing the public MCP server is allowed to read.
-- Apply once:  npx wrangler d1 execute aquaroute --remote --file=schema-mcp.sql
--
-- `reports` is the live table: rows are DELETED 12 hours after posting, and it
-- holds a hashed IP, a delete token, the account id and the photo bytes.
-- `report_log` keeps what is safe to keep: where, how bad, when, the note.
-- It never holds the reporter, the token, the account or the photo.
--
-- A row is written when a report is created (see src/index.js) and survives the
-- live row's expiry, so no second write is needed "at expiry". `status` follows
-- community flags (hidden) and author deletion (deleted).

CREATE TABLE IF NOT EXISTS report_log (
  id         TEXT PRIMARY KEY,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  severity   TEXT NOT NULL,                -- passable | slow | impassable
  note       TEXT,
  created_at INTEGER NOT NULL,             -- epoch seconds
  expires_at INTEGER NOT NULL,
  flags      INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'ok'    -- ok | hidden | deleted
);

CREATE INDEX IF NOT EXISTS idx_log_time ON report_log (created_at);

-- Backfill whatever is live right now.
INSERT OR IGNORE INTO report_log (id, lat, lon, severity, note, created_at, expires_at, flags, status)
SELECT id, lat, lon, severity, note, created_at, expires_at, flags,
       CASE WHEN hidden = 1 THEN 'hidden' ELSE 'ok' END
  FROM reports;

-- The sanitized read layer. src/mcp.js queries this view and nothing else.
DROP VIEW IF EXISTS public_reports;
CREATE VIEW public_reports AS
SELECT id, lat, lon, severity, note, created_at, expires_at, flags
  FROM report_log
 WHERE status = 'ok';
