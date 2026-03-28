-- Migration: add timestamps to reactions/comments, make reactions individual records
-- Run: npx wrangler d1 execute hosaka-proxy-db --file=migrate-001-timestamps.sql

-- Add timestamp to comments
ALTER TABLE comments ADD COLUMN timestamp_sec REAL;

-- Add size to videos
ALTER TABLE videos ADD COLUMN size_bytes INTEGER;

-- Recreate reactions as individual records
DROP TABLE IF EXISTS reactions;
CREATE TABLE reactions (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  timestamp_sec REAL NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Users and sessions
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Unique view tracking
CREATE TABLE IF NOT EXISTS view_logs (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_view_logs_unique ON view_logs(video_id, visitor_id);

-- Transcripts
CREATE TABLE IF NOT EXISTS transcripts (
  video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  full_text     TEXT,
  segments_json TEXT,
  vtt           TEXT,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
