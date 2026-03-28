# hosaka-proxy — Spec

A Loom-style video watch + comment layer for videos stored in Cloudflare R2.
Designed to be minimal, self-hostable, and easy to deploy on Cloudflare's free/cheap tier.

---

## Overview

[hosaka.studio](https://hosaka.studio/) and similar tools handle uploading videos directly to S3-compatible storage (Cloudflare R2). This project is the missing piece: a nice public watch page with reactions and comments, plus a private dashboard to manage your videos.

**Goals:**
- Simple to deploy (one `wrangler deploy`)
- **Zero code changes required** — clone, fill in `wrangler.toml`, deploy
- No external services beyond Cloudflare (Workers + D1 + R2)
- Open source — easy for others to fork and self-host

---

## Architecture

```
┌─────────────────────┐
│   hosaka.studio /   │  uploads video files
│   any S3 tool       │──────────────────────────► Cloudflare R2
└─────────────────────┘                                   │
                                                          │ bucket.list() / bucket.get()
                                                          ▼
                                               Cloudflare Worker (Hono)
                                                    │           │
                                             D1 (SQLite)    R2 binding
                                          comments, reactions,
                                          view counts, metadata
```

**Stack:**
- **Runtime:** Cloudflare Workers
- **Framework:** [Hono](https://hono.dev/) with JSX templates (server-rendered HTML)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (read-only from this app's perspective)
- **Auth:** Cloudflare Access (protects dashboard routes)

---

## User Flows

### Viewer (public)

1. Receives a link: `https://your-worker.workers.dev/v/<video-id>`
2. Sees a clean watch page with the video player, title, description, upload date, view count
3. Can react with an emoji (👍 ❤️ 😂 😮) — stored server-side, deduplicated client-side via localStorage
4. Can leave a comment by entering name + email (pre-filled from localStorage on return visits)
5. Sees all existing comments in chronological order

### Owner (dashboard — protected by Cloudflare Access)

1. Visits `/dashboard`
2. Sees a list of all registered videos (title, view count, comment count, upload date)
3. Can click "Sync from R2" to discover new videos uploaded since last sync
4. Can open a video detail page to:
   - Edit title and description
   - View all comments and delete individual ones
   - Delete the video record (does not delete from R2)
5. Can copy the shareable watch link for any video

---

## Data Model

### D1 Schema

```sql
-- Videos: metadata about R2 objects
CREATE TABLE videos (
  id          TEXT PRIMARY KEY,          -- URL-safe slug (generated from R2 key)
  r2_key      TEXT NOT NULL UNIQUE,      -- full R2 object key (e.g. "uploads/demo.mp4")
  title       TEXT,                      -- editable; defaults to filename
  description TEXT,                      -- optional
  uploaded_at TEXT,                      -- from R2 object LastModified
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Comments
CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  body       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Reactions: one row per emoji per video, stores aggregate count
CREATE TABLE reactions (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  emoji    TEXT NOT NULL,               -- one of: 👍 ❤️ 😂 😮
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, emoji)
);

-- View counts
CREATE TABLE views (
  video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 0
);
```

---

## API Routes

All routes are handled by a single Cloudflare Worker.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v/:id` | Watch page (HTML) |
| `POST` | `/v/:id/view` | Increment view count |
| `POST` | `/v/:id/react` | Add a reaction (`{ emoji }`) |
| `POST` | `/v/:id/comments` | Post a comment (`{ name, email, body }`) |

### Dashboard (protected by Cloudflare Access)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard` | Video list page (HTML) |
| `GET` | `/dashboard/videos/:id` | Video detail + comment moderation (HTML) |
| `POST` | `/dashboard/videos/:id` | Update title / description |
| `DELETE` | `/dashboard/videos/:id` | Remove video record |
| `DELETE` | `/dashboard/comments/:id` | Delete a comment |
| `POST` | `/dashboard/sync` | Sync new videos from R2 bucket |

### Media

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/media/:key` | Stream video from R2 (supports `Range` header) |

---

## UI Pages

### Watch page (`/v/:id`)

- Clean white background, max-width container
- Video player (native `<video>` element with controls, full width)
- Title, description, upload date below the player
- View count displayed subtly (e.g. "142 views")
- Emoji reaction bar: 4 buttons (👍 ❤️ 😂 😮) with counts; selected state persisted in localStorage
- Comments section below reactions:
  - Name + email form (pre-filled from localStorage)
  - Submit button
  - List of comments with name, relative time (e.g. "2 days ago"), and body
- No login required

### Dashboard — Video list (`/dashboard`)

- Table of videos: thumbnail (if feasible), title, views, comments, upload date, copy link button
- "Sync from R2" button at the top
- Each row links to the video detail page

### Dashboard — Video detail (`/dashboard/videos/:id`)

- Edit title and description (inline form, auto-save or explicit save button)
- Preview watch link
- Comment list with a "Delete" button per comment
- Delete video button (with confirmation)

---

## Configuration Principles

All behaviour is controlled via `wrangler.toml` vars — **no source code edits required**. The repo ships a `wrangler.toml.example` with every available option documented. Deployers copy it, fill in their values, and run `wrangler deploy`.

| Variable | Required | Description |
|----------|----------|-------------|
| D1 binding (`DB`) | Yes | D1 database ID |
| R2 binding (`BUCKET`) | Yes | R2 bucket name |
| `R2_PREFIX` | No | Key prefix to scope video discovery (e.g. `uploads/`) |
| `SITE_NAME` | No | Display name shown in the UI (default: "Videos") |

`wrangler.toml` is listed in `.gitignore`. Only `wrangler.toml.example` is committed.

---

## Deployment Guide

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- A Cloudflare account with R2 enabled
- Videos already in an R2 bucket (via hosaka.studio or any S3-compatible uploader)

### Steps

1. **Clone the repo and install dependencies**
   ```sh
   git clone https://github.com/you/hosaka-proxy
   cd hosaka-proxy
   npm install
   ```

2. **Create the D1 database**
   ```sh
   wrangler d1 create hosaka-proxy-db
   wrangler d1 execute hosaka-proxy-db --file=schema.sql
   ```

3. **Configure `wrangler.toml`**

   Copy the provided `wrangler.toml.example` and fill in your values — no code changes needed:
   ```sh
   cp wrangler.toml.example wrangler.toml
   ```
   ```toml
   name = "hosaka-proxy"
   main = "src/index.ts"
   compatibility_date = "2024-01-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "hosaka-proxy-db"
   database_id = "<your-d1-id>"         # from step 2 output

   [[r2_buckets]]
   binding = "BUCKET"
   bucket_name = "<your-r2-bucket-name>"

   [vars]
   # Optional: restrict sync to a key prefix (e.g. "uploads/")
   R2_PREFIX = ""
   # Optional: site name shown in the UI
   SITE_NAME = "My Videos"
   ```

   `wrangler.toml` is gitignored — only `wrangler.toml.example` is committed, so no user touches source files.

4. **Deploy**
   ```sh
   wrangler deploy
   ```

5. **Protect the dashboard with Cloudflare Access**
   - In the Cloudflare dashboard → Zero Trust → Access → Applications
   - Add an application for `https://your-worker.workers.dev/dashboard*`
   - Set the policy to allow your email address
   - No code changes needed — Access injects auth at the network layer

6. **Sync your first videos**
   - Visit `https://your-worker.workers.dev/dashboard`
   - Click "Sync from R2"
   - Your uploaded videos will appear — add titles and descriptions as needed

---

## Out of Scope (Future Ideas)

- **Thumbnails** — auto-generate from video using a Cloudflare Image Resizing Worker or pre-upload
- **Timestamped comments** — comments anchored to a specific time in the video (like Loom)
- **Notifications** — email the owner when a new comment is posted
- **R2 event notifications** — real-time sync via Cloudflare Queues instead of polling
- **Multiple uploaders** — invite-based multi-user support
- **Password-protected videos** — per-video access control
- **Analytics** — detailed viewer analytics beyond simple view counts
- **Custom domain** — instructions for routing a custom domain to the Worker
