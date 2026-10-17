-- Offline prototype schema (SQLite / D1-compatible). Applied only to a local in-memory database.
-- One row = one summed counter of one cell of one UTC day. No packet, header, IP, UA, cookie or timestamp is stored.
-- cell_key is a JSON array [day, platform, app_version, region, e, section, content_id, metric, bucket, feature_id, catalog_id, error_id]
-- and starts with the UTC day, so retention cleanup is a primary-key range delete (no extra index = no extra row writes).
CREATE TABLE IF NOT EXISTS cell_counts (
  cell_key TEXT PRIMARY KEY,
  n        INTEGER NOT NULL CHECK (n >= 0)
) WITHOUT ROWID;

-- Daily write budget guard (counts rows written by this service, UTC day of the server clock).
CREATE TABLE IF NOT EXISTS daily_budget (
  day          TEXT PRIMARY KEY,
  rows_written INTEGER NOT NULL CHECK (rows_written >= 0)
) WITHOUT ROWID;
