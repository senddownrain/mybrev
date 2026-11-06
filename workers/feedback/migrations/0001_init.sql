-- Feedback D1 (SEPARATE from analytics). Roles are NOT stored here: single source is Firestore admins/{uid}.
CREATE TABLE feedback (
  id            TEXT PRIMARY KEY,                 -- random UUID, assigned by the server
  created_at    INTEGER NOT NULL,                 -- unix ms
  updated_at    INTEGER NOT NULL,
  source_app    TEXT NOT NULL CHECK (source_app IN ('mybrev_web','ibreviary_flutter')),
  platform      TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
  app_version   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('text_error','content_suggestion','technical_bug','feature_suggestion','other')),
  body          TEXT NOT NULL,
  context_json  TEXT,                             -- normalised whitelist only (see src/validate.mjs)
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','resolved','closed')),
  contact_email TEXT,                             -- superadmin only
  closed_at     INTEGER,
  version       INTEGER NOT NULL DEFAULT 1,       -- optimistic concurrency
  dedup_key     TEXT UNIQUE                       -- hash of the client request id: double tap = one row
);
CREATE INDEX idx_feedback_cat_status_created ON feedback (category, status, created_at DESC, id);
CREATE INDEX idx_feedback_status_created ON feedback (status, created_at DESC, id);
CREATE INDEX idx_feedback_created ON feedback (created_at DESC, id);

CREATE TABLE feedback_notes (
  id          TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  author_uid  TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('shared','superadmin_private')),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_notes_feedback ON feedback_notes (feedback_id, created_at);

-- Audit trail: who changed what. Never holds message text or e-mail.
CREATE TABLE feedback_events (
  id          TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  actor_uid   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('status','category','note')),
  from_value  TEXT,
  to_value    TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_events_feedback ON feedback_events (feedback_id, created_at);

-- Abuse limits without raw IPs: key = truncated HMAC(ip, daily salt); rows are purged by the daily cron.
CREATE TABLE rate_limit (
  bucket TEXT NOT NULL,                           -- 'ip:<hmac>:<minute>' or 'day:<yyyy-mm-dd>'
  count  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket)
);
