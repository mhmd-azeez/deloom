# deloom

A Loom-style video watch page with reactions and comments for videos stored in Cloudflare R2.

Runs entirely on Cloudflare's free tier. No external services. Clone, configure, deploy.

## What You Get

- **Public watch pages** — shareable links with a video player, emoji reactions, and comments
- **Embeddable player** — drop an `<iframe>` into any site
- **Dashboard** — manage videos, edit titles/descriptions, moderate comments
- **Auto-sync** — discovers new videos from your R2 bucket with one click
- **Video streaming** — serves video directly from R2 with range-request support

## Setup (Step by Step)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and [Node.js](https://nodejs.org/) installed on your machine. No prior Cloudflare experience required.

### 1. Install the Cloudflare CLI

```sh
npm install -g wrangler
```

Then log in to your Cloudflare account:

```sh
wrangler login
```

This opens a browser window — click "Allow" to authorize.

### 2. Clone this repo and install dependencies

```sh
git clone https://github.com/you/deloom
cd deloom
npm install
```

### 3. Create the storage bucket (R2)

This is where your videos live. Pick a name (lowercase, hyphens only):

```sh
npx wrangler r2 bucket create my-videos
```

If you already have a bucket with videos in it, skip this — just note the bucket name.

### 4. Create the database (D1)

This stores comments, reactions, and view counts:

```sh
npx wrangler d1 create deloom-db
```

This prints a database ID — copy it, you'll need it in the next step. It looks something like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

Now create the tables:

```sh
npx wrangler d1 execute deloom-db --file=schema.sql
```

### 5. Configure

```sh
cp wrangler.toml.example wrangler.toml
```

Open `wrangler.toml` in a text editor and fill in the two values from the previous steps:

```toml
[[d1_databases]]
database_id = "paste-your-d1-id-here"    # from step 4

[[r2_buckets]]
bucket_name = "my-videos"                # from step 3
```

Optionally set a site name and a key prefix (if your videos are in a subfolder like `uploads/`):

```toml
[vars]
R2_PREFIX = ""
SITE_NAME = "My Videos"
```

### 6. Deploy

```sh
npm run deploy
```

That's it. Wrangler prints the URL of your worker (something like `https://deloom.your-account.workers.dev`).

### 7. Import your videos

Visit `https://your-worker-url/dashboard` and click **Sync from R2**. Every video file in your bucket will appear in the list. From there you can add titles, descriptions, and copy shareable links.

### 8. (Optional) Protect the dashboard

Without this step, anyone with the URL can access your dashboard. Cloudflare Access (Zero Trust) locks it down — it can't be configured in `wrangler.toml`, it's set up in the Cloudflare dashboard.

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com/)
2. If prompted, create a free Zero Trust team (any name works)
3. Navigate to **Access > Applications > Add an application**
4. Choose **Self-hosted**
5. Set the application domain to your worker URL (e.g. `screen.mazeez.dev` or `deloom.your-account.workers.dev`)
6. Set the path to `/dashboard*` — this protects all dashboard routes while leaving watch pages public
7. Click **Next** and create a policy:
   - Policy name: anything (e.g. "Allow me")
   - Action: **Allow**
   - Include rule: **Emails** — enter your email address
8. Save

Now when you visit `/dashboard`, Cloudflare will prompt for authentication before the request ever reaches your worker. No code changes needed — Access works at the network level.

## Uploading Videos

This app doesn't handle uploads — it reads from an R2 bucket that you populate separately. Some options:

- [hosaka.studio](https://hosaka.studio/) — drag-and-drop upload to S3/R2
- [rclone](https://rclone.org/) — `rclone copy ./my-video.mp4 r2:my-videos/`
- Any S3-compatible tool (Cyberduck, aws cli with `--endpoint-url`, etc.)

After uploading, hit **Sync from R2** in the dashboard to pick up new files.

## Embedding

Every video has an embeddable player at `/embed/<video-id>`. On the dashboard video detail page, you'll find a ready-to-copy `<iframe>` snippet:

```html
<iframe src="https://your-worker-url/embed/my-video" width="640" height="360" frameborder="0" allowfullscreen></iframe>
```

## Configuration Reference

All settings live in `wrangler.toml` — you never need to edit source code.

| Setting | Required | What it does |
|---------|----------|--------------|
| `database_id` | Yes | Your D1 database ID (from `wrangler d1 create`) |
| `bucket_name` | Yes | Your R2 bucket name |
| `R2_PREFIX` | No | Only sync videos under this key prefix (e.g. `uploads/`) |
| `SITE_NAME` | No | Name shown in the browser tab (default: "Videos") |

## Local Development

```sh
npm run dev
```

This starts a local server with your R2 and D1 bindings. You'll need a `wrangler.toml` configured (see above).

## Stack

- [Hono](https://hono.dev/) — web framework with server-rendered JSX
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — SQLite database
- [Cloudflare R2](https://developers.cloudflare.com/r2/) — object storage
