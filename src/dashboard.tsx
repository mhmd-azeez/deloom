import { Hono } from "hono";
import { raw } from "hono/html";
import type { Bindings, Video, Transcript } from "./types";
import { generateId, slugify, relativeTime, formatBytes } from "./utils";
import { hashPassword, verifyPassword, createSession, validateSession, deleteSession, getSessionToken, sessionCookie } from "./auth";

type DashVars = { Variables: { userEmail: string } };
const app = new Hono<{ Bindings: Bindings } & DashVars>();

const DashLayout = ({ title, children, email }: { title: string; children: any; email?: string }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        :root { --bg:#fff; --bg-page:#f9f9f8; --text:#171717; --text-2:#525252; --text-3:#a3a3a3; --border:#e5e5e5; --border-light:#f0f0f0; --accent:#5e6ad2; --accent-light:#eef0ff; --red:#e5484d; --red-light:#fff0f0; --radius:8px; --sans:'Geist',-apple-system,system-ui,sans-serif; --mono:'Geist Mono','SF Mono',monospace; }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{background:var(--bg-page)}
        body{font-family:var(--sans);color:var(--text);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
        a{color:var(--text);text-decoration:none}a:hover{text-decoration:underline}

        .topnav{background:var(--bg);border-bottom:1px solid var(--border);padding:0 2rem;height:48px;display:flex;align-items:center;justify-content:space-between}
        .topnav-brand{font-weight:600;font-size:0.875rem;letter-spacing:-0.01em}
        .topnav-right{display:flex;align-items:center;gap:0.75rem;font-size:0.8125rem}
        .topnav-email{color:var(--text-3)}
        .topnav-logout{color:var(--text-3);font-size:0.8125rem;background:none;border:none;cursor:pointer;font-family:var(--sans);text-decoration:underline;text-underline-offset:2px}
        .topnav-logout:hover{color:var(--text)}
        .page{max-width:960px;margin:0 auto;padding:2rem 2rem 4rem}

        /* Auth pages */
        .auth-page{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
        .auth-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;width:100%;max-width:380px}
        .auth-card h1{font-size:1.25rem;font-weight:600;margin-bottom:0.25rem}
        .auth-card .subtitle{color:var(--text-3);font-size:0.8125rem;margin-bottom:1.5rem}
        .auth-card .field{margin-bottom:0.875rem}
        .auth-card .field-label{display:block;font-size:0.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);margin-bottom:0.375rem}
        .auth-card .btn-primary{width:100%;justify-content:center;margin-top:0.25rem}
        .auth-error{padding:0.5rem 0.75rem;margin-bottom:1rem;background:var(--red-light);color:var(--red);border-left:3px solid var(--red);font-size:0.8125rem;border-radius:0 6px 6px 0}

        .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
        .page-header h1{font-size:1.25rem;font-weight:600;letter-spacing:-0.01em}

        .btn{display:inline-flex;align-items:center;gap:0.375rem;padding:0.4375rem 0.875rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:0.8125rem;font-weight:500;cursor:pointer;transition:background 0.1s,border-color 0.1s}
        .btn:hover{background:var(--bg-page);border-color:var(--text-3)}
        .btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}.btn-primary:hover{opacity:0.9;background:var(--accent)}
        .btn-danger{color:var(--red);border-color:var(--red);background:var(--bg)}.btn-danger:hover{background:var(--red-light)}
        .btn-sm{font-size:0.75rem;padding:0.25rem 0.625rem;font-family:var(--mono)}

        .flash{padding:0.625rem 0.875rem;margin-bottom:1.5rem;background:#ecfdf5;color:#065f46;border-left:3px solid #2a7e3b;font-size:0.875rem;border-radius:0 6px 6px 0}

        input,textarea{width:100%;padding:0.5rem 0.625rem;border:1px solid var(--border);border-radius:6px;font-size:0.875rem;font-family:var(--sans);background:var(--bg);color:var(--text);outline:none;transition:border-color 0.15s}
        input:focus,textarea:focus{border-color:var(--accent)}
        textarea{resize:vertical;min-height:80px}
        input::placeholder,textarea::placeholder{color:var(--text-3)}

        /* Table */
        .vtable{width:100%;border-collapse:collapse;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
        .vtable th,.vtable td{padding:0.625rem 0.875rem;text-align:left}
        .vtable th{font-size:0.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--bg-page)}
        .vtable td{font-size:0.8125rem;border-bottom:1px solid var(--border-light)}
        .vtable tr:last-child td{border-bottom:none}
        .vtable tr:hover td{background:var(--bg-page)}
        .vtable td a{font-weight:500}
        .vtable td a:hover{color:var(--accent);text-decoration:none}
        .num{font-family:var(--mono);font-size:0.8125rem;color:var(--text-2)}
        .muted{color:var(--text-3);font-size:0.8125rem}

        .empty-state{text-align:center;padding:4rem 1rem;color:var(--text-3)}
        .empty-state h2{font-size:1rem;font-weight:500;color:var(--text-2);margin-bottom:0.25rem}

        /* Detail page */
        .back-link{font-size:0.8125rem;color:var(--text-3);display:inline-flex;align-items:center;gap:0.25rem}
        .back-link:hover{color:var(--text);text-decoration:none}
        .card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-top:1rem}
        .card h2{font-size:1rem;font-weight:600;margin-bottom:1rem}
        .field{margin-bottom:0.875rem}
        .field-label{display:block;font-size:0.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);margin-bottom:0.375rem}
        .info-row{display:flex;align-items:center;gap:0.375rem;font-size:0.8125rem;color:var(--text-2);padding:0.25rem 0}
        .info-row code{font-family:var(--mono);font-size:0.75rem;background:var(--bg-page);padding:0.125rem 0.375rem;border:1px solid var(--border);border-radius:4px}
        .info-row a{color:var(--accent)}
        .comment-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:0.75rem 0;border-bottom:1px solid var(--border-light)}
        .comment-row:last-child{border-bottom:none}
        .comment-author{font-weight:500;font-size:0.8125rem}
        .comment-email{color:var(--text-3);font-size:0.75rem}
        .comment-body{font-size:0.8125rem;color:var(--text-2);margin-top:0.125rem;line-height:1.5}
        .danger-zone{margin-top:1.5rem;padding:1rem 1.25rem;border:1px solid var(--red);border-radius:var(--radius);background:var(--red-light)}
        .danger-zone p{font-size:0.8125rem;color:var(--red);margin-bottom:0.75rem;font-weight:500}

        @media(max-width:640px){.topnav,.page{padding-left:1rem;padding-right:1rem}}
      `}</style>
    </head>
    <body>
      <nav class="topnav">
        <a href="/dashboard" class="topnav-brand">Dashboard</a>
        {email && (
          <div class="topnav-right">
            <span class="topnav-email">{email}</span>
            <form method="post" action="/dashboard/logout" style="margin:0">
              <button type="submit" class="topnav-logout">Log out</button>
            </form>
          </div>
        )}
      </nav>
      {children}
    </body>
  </html>
);

// ── Auth: Setup page (only when no users exist) ──
app.get("/setup", async (c) => {
  const db = c.env.DB;
  const userCount = await db.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  if (userCount && userCount.cnt > 0) return c.redirect("/dashboard/login");

  return c.html(
    <DashLayout title="Setup">
      <div class="auth-page">
        <div class="auth-card">
          <h1>Create admin account</h1>
          <p class="subtitle">Set up your login to access the dashboard.</p>
          <form method="post" action="/dashboard/setup">
            <div class="field">
              <label class="field-label">Email</label>
              <input type="email" name="email" required placeholder="you@example.com" />
            </div>
            <div class="field">
              <label class="field-label">Password</label>
              <input type="password" name="password" required minlength={8} placeholder="At least 8 characters" />
            </div>
            <button type="submit" class="btn btn-primary">Create account</button>
          </form>
        </div>
      </div>
    </DashLayout>
  );
});

app.post("/setup", async (c) => {
  const db = c.env.DB;
  const userCount = await db.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  if (userCount && userCount.cnt > 0) return c.redirect("/dashboard/login");

  const form = await c.req.parseBody();
  const email = (form["email"] as string || "").trim();
  const password = form["password"] as string || "";

  if (!email || password.length < 8) return c.redirect("/dashboard/setup");

  const userId = generateId();
  const hash = await hashPassword(password);
  await db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").bind(userId, email, hash).run();

  const token = await createSession(db, userId);
  return new Response(null, {
    status: 302,
    headers: { Location: "/dashboard", "Set-Cookie": sessionCookie(token) },
  });
});

// ── Auth: Login ──
app.get("/login", async (c) => {
  const error = c.req.query("error");
  return c.html(
    <DashLayout title="Login">
      <div class="auth-page">
        <div class="auth-card">
          <h1>Log in</h1>
          <p class="subtitle">Enter your credentials to access the dashboard.</p>
          {error && <div class="auth-error">Invalid email or password.</div>}
          <form method="post" action="/dashboard/login">
            <div class="field">
              <label class="field-label">Email</label>
              <input type="email" name="email" required placeholder="you@example.com" />
            </div>
            <div class="field">
              <label class="field-label">Password</label>
              <input type="password" name="password" required placeholder="Password" />
            </div>
            <button type="submit" class="btn btn-primary">Log in</button>
          </form>
        </div>
      </div>
    </DashLayout>
  );
});

app.post("/login", async (c) => {
  const db = c.env.DB;
  const form = await c.req.parseBody();
  const email = (form["email"] as string || "").trim();
  const password = form["password"] as string || "";

  const user = await db.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(email).first<{ id: string; password_hash: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.redirect("/dashboard/login?error=1");
  }

  const token = await createSession(db, user.id);
  return new Response(null, {
    status: 302,
    headers: { Location: "/dashboard", "Set-Cookie": sessionCookie(token) },
  });
});

// ── Auth: Logout ──
app.post("/logout", async (c) => {
  const token = getSessionToken(c.req.header("cookie"));
  if (token) await deleteSession(c.env.DB, token);
  const res = new Response(null, {
    status: 302,
    headers: { Location: "/dashboard/login" },
  });
  // Clear cookie on both paths (old Path=/dashboard and new Path=/)
  res.headers.append("Set-Cookie", sessionCookie("", 0));
  res.headers.append("Set-Cookie", "session=; Path=/dashboard; HttpOnly; SameSite=Lax; Max-Age=0");
  return res;
});

// ── Auth middleware: protect all routes below ──
app.use("/*", async (c, next) => {
  const path = c.req.path;
  // Skip auth for setup/login routes
  if (path === "/dashboard/setup" || path === "/dashboard/login" || path === "/dashboard/logout") {
    return next();
  }

  const db = c.env.DB;

  // If no users exist, redirect to setup
  const userCount = await db.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  if (!userCount || userCount.cnt === 0) return c.redirect("/dashboard/setup");

  // Check session
  const token = getSessionToken(c.req.header("cookie"));
  const session = await validateSession(db, token);
  if (!session) return c.redirect("/dashboard/login");

  // Stash user info for routes to use
  c.set("userEmail", session.email);
  return next();
});

// Video list
app.get("/", async (c) => {
  const db = c.env.DB;
  const siteName = c.env.SITE_NAME || "Videos";
  const synced = c.req.query("synced");

  const videos = (
    await db.prepare(
      `SELECT v.*,
        COALESCE(vw.count, 0) as view_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted = 0) as comment_count
      FROM videos v
      LEFT JOIN views vw ON vw.video_id = v.id
      ORDER BY v.created_at DESC`
    ).all<Video & { view_count: number; comment_count: number }>()
  ).results;

  return c.html(
    <DashLayout title={`Dashboard — ${siteName}`} email={c.get("userEmail")}>
      <div class="page">
        <div class="page-header">
          <h1>Videos</h1>
          <form method="post" action="/dashboard/sync">
            <button type="submit" class="btn btn-primary">Sync from R2</button>
          </form>
        </div>

        {synced && (
          <div class="flash">
            Synced {synced} new video{synced === "1" ? "" : "s"} from R2.
          </div>
        )}

        {videos.length === 0 ? (
          <div class="empty-state">
            <h2>No videos yet</h2>
            <p>Click <strong>Sync from R2</strong> to discover videos in your bucket.</p>
          </div>
        ) : (
          <table class="vtable">
            <thead>
              <tr>
                <th>Title</th>
                <th style="width:4.5rem">Views</th>
                <th style="width:5.5rem">Comments</th>
                <th style="width:5rem">Size</th>
                <th style="width:6rem">Uploaded</th>
                <th style="width:11rem"></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr>
                  <td><a href={`/dashboard/videos/${v.id}`}>{v.title || "Untitled"}</a></td>
                  <td class="num">{(v as any).view_count}</td>
                  <td class="num">{(v as any).comment_count}</td>
                  <td class="muted">{v.size_bytes ? formatBytes(v.size_bytes) : "—"}</td>
                  <td class="muted">{v.uploaded_at ? relativeTime(v.uploaded_at) : "—"}</td>
                  <td style="display:flex;gap:0.25rem">
                    <a href={`/v/${v.id}`} class="btn btn-sm" style="text-decoration:none" target="_blank">view</a>
                    <a href={`/dashboard/videos/${v.id}`} class="btn btn-sm" style="text-decoration:none">edit</a>
                    <button class="btn btn-sm" onclick={`navigator.clipboard.writeText(location.origin+'/v/${v.id}');this.textContent='copied';setTimeout(()=>this.textContent='copy link',1500)`}>
                      copy link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashLayout>
  );
});

// Video detail
app.get("/videos/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const siteName = c.env.SITE_NAME || "Videos";
  const saved = c.req.query("saved");

  const video = await db.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<Video>();
  if (!video) return c.notFound();

  const [commentsResult, transcript] = await Promise.all([
    db.prepare("SELECT * FROM comments WHERE video_id = ? AND deleted = 0 ORDER BY created_at DESC").bind(id).all(),
    db.prepare("SELECT * FROM transcripts WHERE video_id = ?").bind(id).first<Transcript>(),
  ]);
  const comments = commentsResult.results;

  return c.html(
    <DashLayout title={`Edit: ${video.title || "Untitled"} — ${siteName}`} email={c.get("userEmail")}>
      <div class="page">
        <a href="/dashboard" class="back-link">{"\u2190"} Back</a>

        {saved && <div class="flash" style="margin-top:1rem">Changes saved.</div>}

        <div class="card">
          <h2>Edit Video</h2>
          <form method="post">
            <div class="field">
              <label class="field-label">Title</label>
              <input type="text" name="title" value={video.title || ""} />
            </div>
            <div class="field">
              <label class="field-label">Description</label>
              <textarea name="description">{video.description || ""}</textarea>
            </div>
            <button type="submit" class="btn btn-primary">Save changes</button>
          </form>
        </div>

        <div class="card">
          <h2>Links</h2>
          <div class="info-row">
            <span class="muted">R2 Key:</span>
            <code>{video.r2_key}</code>
          </div>
          {video.size_bytes && (
            <div class="info-row">
              <span class="muted">Size:</span>
              <span>{formatBytes(video.size_bytes)}</span>
            </div>
          )}
          <div class="info-row">
            <span class="muted">Watch:</span>
            <a href={`/v/${video.id}`} target="_blank">/v/{video.id}</a>
          </div>
          <div class="info-row">
            <span class="muted">Embed:</span>
            <a href={`/embed/${video.id}`} target="_blank">/embed/{video.id}</a>
          </div>
          <div style="margin-top:0.75rem">
            <label class="field-label">Embed code</label>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem">
              <input
                type="text"
                readonly
                id="embed-code"
                value={`<iframe src="/embed/${video.id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`}
                style="font-family:var(--mono);font-size:0.75rem;cursor:text"
                onclick="this.select()"
              />
              <button class="btn btn-sm" onclick="document.getElementById('embed-code').select();navigator.clipboard.writeText(document.getElementById('embed-code').value);this.textContent='copied';setTimeout(()=>this.textContent='copy',1500)">
                copy
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Transcript</h2>
          {transcript?.status === 'done' && (
            <div id="transcript-display">
              <div style="background:var(--bg-page);border:1px solid var(--border);border-radius:6px;padding:0.75rem;font-size:0.8125rem;color:var(--text-2);line-height:1.6;max-height:300px;overflow-y:auto;white-space:pre-wrap">{transcript.full_text}</div>
            </div>
          )}
          <div id="transcribe-progress" style="display:none">
            <div style="margin-bottom:0.5rem">
              <span id="transcribe-stage" style="font-size:0.8125rem;font-weight:500"></span>
            </div>
            <div style="width:100%;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
              <div id="transcribe-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.3s"></div>
            </div>
            <p id="transcribe-detail" class="muted" style="margin-top:0.375rem"></p>
            <div id="transcribe-live" style="display:none;margin-top:0.75rem;background:var(--bg-page);border:1px solid var(--border);border-radius:6px;padding:0.75rem;font-size:0.8125rem;color:var(--text-2);line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap"></div>
          </div>
          <div id="transcribe-error" style="display:none;padding:0.5rem 0.75rem;margin-bottom:0.75rem;background:var(--red-light);color:var(--red);border-left:3px solid var(--red);font-size:0.8125rem;border-radius:0 6px 6px 0"></div>
          <div style="margin-top:0.75rem">
            <button id="transcribe-btn" class="btn btn-primary" onclick="startTranscription()">
              {transcript?.status === 'done' ? 'Re-transcribe' : 'Transcribe'}
            </button>
          </div>
          <p class="muted" style="margin-top:0.5rem">Runs Moonshine locally in your browser. First run downloads a ~60MB model.</p>
        </div>

        {raw(`<script>
        (function() {
          var VIDEO_ID = ${JSON.stringify(video.id)};
          var VIDEO_R2_KEY = ${JSON.stringify(video.r2_key)};

          function updateProgress(stage, pct, detail) {
            document.getElementById('transcribe-stage').textContent = stage;
            if (pct >= 0) document.getElementById('transcribe-bar').style.width = pct + '%';
            document.getElementById('transcribe-detail').textContent = detail || '';
          }

          function fmtVttTime(s) {
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            var sec = (s % 60).toFixed(3);
            return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + sec.padStart(6, '0');
          }

          function generateVTT(segments) {
            var vtt = 'WEBVTT\\n\\n';
            for (var i = 0; i < segments.length; i++) {
              var seg = segments[i];
              vtt += (i + 1) + '\\n' + fmtVttTime(seg.start) + ' --> ' + fmtVttTime(seg.end) + '\\n' + seg.text + '\\n\\n';
            }
            return vtt;
          }

          window.startTranscription = async function() {
            var btn = document.getElementById('transcribe-btn');
            var prog = document.getElementById('transcribe-progress');
            var errDiv = document.getElementById('transcribe-error');
            var display = document.getElementById('transcript-display');
            var liveDiv = document.getElementById('transcribe-live');

            btn.disabled = true;
            btn.textContent = 'Transcribing...';
            prog.style.display = '';
            errDiv.style.display = 'none';
            if (display) display.style.display = 'none';

            try {
              // Download video
              updateProgress('Downloading video...', 0);
              var resp = await fetch('/media/' + encodeURIComponent(VIDEO_R2_KEY));
              if (!resp.ok) throw new Error('Failed to fetch video: ' + resp.status);
              var buf = await resp.arrayBuffer();
              updateProgress('Downloading video...', 100);

              // Decode and resample audio to 16kHz mono
              updateProgress('Decoding audio...', 0);
              var actx = new AudioContext();
              var audioBuf = await actx.decodeAudioData(buf);
              actx.close();
              var audioDuration = audioBuf.duration;

              var targetRate = 16000;
              var offCtx = new OfflineAudioContext(1, Math.ceil(audioDuration * targetRate), targetRate);
              var src = offCtx.createBufferSource();
              src.buffer = audioBuf;
              src.connect(offCtx.destination);
              src.start(0);
              var rendered = await offCtx.startRendering();
              var audioData = rendered.getChannelData(0);
              updateProgress('Decoding audio...', 100);

              // Transcribe in Web Worker
              var worker = new Worker('/dashboard/transcribe-worker.js', { type: 'module' });
              liveDiv.style.display = '';
              liveDiv.textContent = '';

              var result = await new Promise(function(resolve, reject) {
                worker.onmessage = function(ev) {
                  var msg = ev.data;
                  if (msg.type === 'progress') updateProgress(msg.stage, msg.pct, msg.detail);
                  else if (msg.type === 'chunk') { liveDiv.textContent += msg.text + ' '; liveDiv.scrollTop = liveDiv.scrollHeight; }
                  else if (msg.type === 'result') resolve(msg);
                  else if (msg.type === 'error') reject(new Error(msg.error));
                };
                worker.onerror = function(ev) { reject(new Error(ev.message || 'Worker error')); };
                worker.postMessage({ type: 'transcribe', audioData: audioData, sampleRate: targetRate }, [audioData.buffer]);
              });
              worker.terminate();

              // Build VTT and save
              updateProgress('Saving...', 100);
              var segments = result.segments || [];
              var fullText = result.fullText || '';
              if (segments.length === 0 && fullText) {
                segments = [{ start: 0, end: audioDuration, text: fullText }];
              }
              var vtt = generateVTT(segments);

              var saveResp = await fetch('/dashboard/videos/' + VIDEO_ID + '/transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_text: fullText, segments: segments, vtt: vtt })
              });
              if (!saveResp.ok) {
                var errData = await saveResp.json().catch(function() { return {}; });
                throw new Error(errData.error || 'Save failed');
              }
              location.reload();
            } catch (e) {
              errDiv.style.display = '';
              errDiv.textContent = e.message;
              prog.style.display = 'none';
              btn.disabled = false;
              btn.textContent = 'Retry transcription';
            }
          };
        })();
        </script>`)}

        <div class="card">
          <h2>Comments <span class="muted" style="font-family:var(--mono)">{comments.length}</span></h2>
          {comments.length === 0 ? (
            <p class="muted" style="padding:0.5rem 0">No comments yet.</p>
          ) : (
            comments.map((comment: any) => (
              <div class="comment-row">
                <div>
                  <div style="display:flex;gap:0.5rem;align-items:baseline;flex-wrap:wrap">
                    <span class="comment-author">{comment.name}</span>
                    <span class="comment-email">{comment.email}</span>
                    <span class="muted">{relativeTime(comment.created_at)}</span>
                  </div>
                  <p class="comment-body">{comment.body}</p>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  onclick={`if(confirm('Delete this comment?'))fetch('/dashboard/comments/${comment.id}',{method:'DELETE'}).then(()=>location.reload())`}
                >
                  delete
                </button>
              </div>
            ))
          )}
        </div>

        <div class="danger-zone">
          <p>Danger zone</p>
          <button
            class="btn btn-danger"
            onclick={`if(confirm('Delete this video record? The R2 file will not be deleted.'))fetch('/dashboard/videos/${video.id}',{method:'DELETE'}).then(()=>location.href='/dashboard')`}
          >
            Delete video record
          </button>
        </div>
      </div>
    </DashLayout>
  );
});

// Serve transcription worker script
app.get("/transcribe-worker.js", async (c) => {
  const js = `import{pipeline}from"https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";
let transcriber=null;
self.onmessage=async function(e){
  if(e.data.type!=="transcribe")return;
  const sr=e.data.sampleRate||16000,chunkSamples=30*sr,strideSamples=5*sr;
  const audio=e.data.audioData,total=audio.length;
  try{
    self.postMessage({type:"progress",stage:"Loading model...",pct:0});
    if(!transcriber){
      transcriber=await pipeline("automatic-speech-recognition","onnx-community/moonshine-base-ONNX",{
        dtype:"q4",device:"wasm",
        progress_callback:function(p){if(p.status==="progress")self.postMessage({type:"progress",stage:"Loading model...",pct:Math.round(p.progress||0),detail:p.file||""});}
      });
    }
    self.postMessage({type:"progress",stage:"Transcribing...",pct:0});
    const segments=[];let offset=0;
    while(offset<total){
      const end=Math.min(offset+chunkSamples,total);
      const result=await transcriber(audio.slice(offset,end));
      const text=(result.text||"").trim();
      if(text){
        segments.push({start:offset/sr,end:end/sr,text});
        self.postMessage({type:"chunk",text});
      }
      offset+=chunkSamples-strideSamples;
      self.postMessage({type:"progress",stage:"Transcribing...",pct:Math.round(Math.min(offset,total)/total*100)});
    }
    self.postMessage({type:"result",segments,fullText:segments.map(s=>s.text).join(" ")});
  }catch(err){self.postMessage({type:"error",error:err.message||String(err)});}
};`;
  return new Response(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
});

// Save transcript (from browser-side transcription)
app.post("/videos/:id/transcript", async (c) => {
  const id = c.req.param("id");
  const video = await c.env.DB.prepare("SELECT id FROM videos WHERE id = ?").bind(id).first();
  if (!video) return c.json({ ok: false, error: "Video not found" }, 404);

  const { full_text, segments, vtt } = await c.req.json<{
    full_text: string;
    segments: Array<{ start: number; end: number; text: string }>;
    vtt: string;
  }>();
  if (segments === undefined || segments === null) return c.json({ ok: false, error: "Missing fields" }, 400);

  await c.env.DB.prepare(
    `INSERT INTO transcripts (video_id, status, full_text, segments_json, vtt)
     VALUES (?, 'done', ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       status = 'done', full_text = ?, segments_json = ?, vtt = ?,
       error_message = NULL, updated_at = datetime('now')`
  ).bind(id, full_text, JSON.stringify(segments), vtt, full_text, JSON.stringify(segments), vtt).run();

  return c.json({ ok: true });
});

// Update video
app.post("/videos/:id", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.parseBody();
  const title = (form["title"] as string) || "";
  const description = (form["description"] as string) || "";
  await c.env.DB.prepare("UPDATE videos SET title = ?, description = ? WHERE id = ?").bind(title, description, id).run();
  return c.redirect(`/dashboard/videos/${id}?saved=1`);
});

// Delete video
app.delete("/videos/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// Delete comment
app.delete("/comments/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE comments SET deleted = 1 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// Sync from R2
app.post("/sync", async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const prefix = c.env.R2_PREFIX || "";

  let cursor: string | undefined;
  const keys: { key: string; uploaded: string; size: number }[] = [];

  do {
    const list = await bucket.list({ prefix: prefix || undefined, cursor });
    for (const obj of list.objects) {
      if (/\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(obj.key)) {
        keys.push({ key: obj.key, uploaded: obj.uploaded.toISOString().replace("T", " ").slice(0, 19), size: obj.size });
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  const existing = new Set(
    (await db.prepare("SELECT r2_key FROM videos").all<{ r2_key: string }>()).results.map((r) => r.r2_key)
  );

  let added = 0;
  for (const { key, uploaded, size } of keys) {
    if (existing.has(key)) continue;
    const id = slugify(key) || generateId();
    const existingId = await db.prepare("SELECT id FROM videos WHERE id = ?").bind(id).first();
    const finalId = existingId ? `${id}-${generateId().slice(0, 6)}` : id;
    const filename = key.split("/").pop()?.replace(/\.[^.]+$/, "") ?? key;
    await db.prepare("INSERT INTO videos (id, r2_key, title, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?)").bind(finalId, key, filename, size, uploaded).run();
    await db.prepare("INSERT INTO views (video_id, count) VALUES (?, 0)").bind(finalId).run();
    added++;
  }

  return c.redirect(`/dashboard?synced=${added}`);
});

export default app;
