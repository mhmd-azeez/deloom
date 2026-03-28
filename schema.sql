CREATE TABLE videos (
  id          TEXT PRIMARY KEY,
  r2_key      TEXT NOT NULL UNIQUE,
  title       TEXT,
  description TEXT,
  size_bytes  INTEGER,
  uploaded_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE comments (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  body          TEXT NOT NULL,
  timestamp_sec REAL,
  deleted       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE reactions (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  timestamp_sec REAL NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE views (
  video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE view_logs (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_view_logs_unique ON view_logs(video_id, visitor_id);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE transcripts (
  video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  full_text     TEXT,
  segments_json TEXT,
  vtt           TEXT,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
