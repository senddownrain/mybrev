-- D1 staging adapter (R02). Applied after 0001 by `wrangler d1 migrations apply` (staging DB only).
-- daily_budget gets a per-day cap column so the guard is a CHECK: an upsert that would exceed the cap fails and the whole
-- D1 batch() is rolled back (batch cannot branch on a previous statement's result). Staging data are synthetic, so the
-- table is rebuilt instead of altered; the offline SQLite prototype keeps using 0001 only.
DROP TABLE IF EXISTS daily_budget;
CREATE TABLE daily_budget (
  day          TEXT PRIMARY KEY,
  rows_written INTEGER NOT NULL,
  cap          INTEGER NOT NULL,
  CONSTRAINT budget_cap CHECK (rows_written >= 0 AND rows_written <= cap)
) WITHOUT ROWID;

-- Runtime kill switch: a row ('ingest', 'off') stops intake with no redeploy. Absent row = no extra restriction
-- (the INGEST_ENABLED variable stays the master switch and defaults to false).
CREATE TABLE IF NOT EXISTS control (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
