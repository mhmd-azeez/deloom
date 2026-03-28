-- Migration: add transcripts table for video transcription
-- Run: npx wrangler d1 execute hosaka-proxy-db --file=migrate-002-transcripts.sql

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
