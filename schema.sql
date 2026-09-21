-- Community water reports.
--
-- Two decisions worth understanding before you change anything here:
--
-- 1. Photos live in this table as a BLOB. R2 would be the textbook answer, but
--    it needs a separate signup and this does not. A report photo is capped at
--    220 KB by the browser before it is ever sent, so a busy monsoon day costs
--    a few tens of megabytes against a 5 GB free tier.
--
-- 2. Every report EXPIRES after twelve hours. Flood water is not a permanent
--    fact about a street, so a stale report is worse than no report. Expiry
--    also bounds storage and limits how long anything anyone uploads can sit
--    on the map.

DROP TABLE IF EXISTS reports;

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,          -- random, unguessable
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  severity    TEXT NOT NULL,             -- passable | slow | impassable
  note        TEXT,                      -- max 160 chars, optional
  photo       BLOB,                      -- JPEG, EXIF already stripped, <= 220 KB
  photo_type  TEXT,
  created_at  INTEGER NOT NULL,          -- epoch seconds
  expires_at  INTEGER NOT NULL,          -- created_at + 12 hours
  flags       INTEGER NOT NULL DEFAULT 0,-- community "this is wrong"
  hidden      INTEGER NOT NULL DEFAULT 0,-- auto-set at 3 flags
  reporter    TEXT,                      -- salted hash of IP, for rate limiting only
  del_token   TEXT                       -- secret returned once to whoever posted it,
                                         -- so they alone can delete it later. No accounts
                                         -- needed: the phone keeps the token, we keep the row.
);

CREATE INDEX idx_live    ON reports (hidden, expires_at);
CREATE INDEX idx_recent  ON reports (reporter, created_at);
