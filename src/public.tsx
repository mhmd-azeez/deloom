import { Hono } from "hono";
import { raw } from "hono/html";
import type { Bindings, Video, Comment, Reaction, ViewCount, Transcript } from "./types";
import { generateId, relativeTime, isValidEmoji } from "./utils";
import { getSessionToken, validateSession } from "./auth";

const app = new Hono<{ Bindings: Bindings }>();

function fmtTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

app.get("/v/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const video = await db.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<Video>();
  if (!video) return c.notFound();

  // Check if current user is admin
  const token = getSessionToken(c.req.header("cookie"));
  const session = token ? await validateSession(db, token) : null;
  const isAdmin = !!session;

  const [commentsResult, reactionsResult, viewResult, transcript] = await Promise.all([
    db.prepare("SELECT * FROM comments WHERE video_id = ? AND deleted = 0 ORDER BY created_at ASC").bind(id).all<Comment>(),
    db.prepare("SELECT * FROM reactions WHERE video_id = ? ORDER BY created_at ASC").bind(id).all<Reaction>(),
    db.prepare("SELECT * FROM views WHERE video_id = ?").bind(id).first<ViewCount>(),
    db.prepare("SELECT status, full_text, segments_json FROM transcripts WHERE video_id = ? AND status = 'done'").bind(id).first<Transcript>(),
  ]);

  const comments = commentsResult.results;
  const reactions = reactionsResult.results;
  const viewCount = viewResult?.count ?? 0;
  const segments: Array<{ start: number; end: number; text: string }> = transcript?.segments_json ? JSON.parse(transcript.segments_json) : [];

  // Compute suggested playback speed from WPM
  let suggestedSpeed = 0;
  if (segments.length > 0) {
    const lastEnd = Math.max(...segments.map((s) => s.end));
    if (lastEnd > 0) {
      const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
      const wpm = wordCount / (lastEnd / 60);
      // Target ~160 WPM listening speed, clamp between 1.25x and 2x
      const raw = 160 / wpm;
      if (raw >= 1.25) suggestedSpeed = Math.min(2, Math.round(raw * 4) / 4); // round to nearest 0.25
    }
  }

  // Unified activity feed
  type ActivityItem = { type: "comment"; data: Comment } | { type: "reaction"; data: Reaction };
  const activity: ActivityItem[] = [
    ...comments.map((c) => ({ type: "comment" as const, data: c })),
    ...reactions.map((r) => ({ type: "reaction" as const, data: r })),
  ].sort((a, b) => a.data.created_at.localeCompare(b.data.created_at));

  // Aggregate emoji counts
  const emojiCounts: Record<string, number> = {};
  for (const r of reactions) emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1;

  // Reaction markers JSON for progress bar
  const reactionMarkers = JSON.stringify(reactions.map((r) => ({ emoji: r.emoji, ts: r.timestamp_sec, name: r.name })));

  const siteName = c.env.SITE_NAME || "Videos";
  const title = video.title || "Untitled";
  const mediaDomain = c.env.MEDIA_DOMAIN;
  const mediaUrl = mediaDomain ? `https://${mediaDomain}/${video.r2_key}` : `/media/${encodeURIComponent(video.r2_key)}`;
  const emojis = ["👍", "❤️", "😂", "😮"];
  const safeId = id.replace(/[^a-z0-9-]/g, "");

  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} — ${siteName}`}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=Manrope:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <style>{raw(`
          :root { --bg:#fff; --bg-page:#f9f9f8; --text:#171717; --text-2:#525252; --text-3:#a3a3a3; --border:#e5e5e5; --border-light:#f0f0f0; --accent:#5e6ad2; --accent-light:#eef0ff; --player-accent:#f97316; --radius:8px; --sans:'Manrope',system-ui,sans-serif; --mono:'JetBrains Mono','SF Mono',monospace; --display:'Fraunces',Georgia,serif; }
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          html{background:var(--bg-page)}body{font-family:var(--sans);color:var(--text);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
          .page{max-width:1440px;margin:0 auto;padding:1.5rem 2rem 4rem}
          .header{margin-bottom:1.25rem}.header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
          .header h1{font-family:var(--display);font-size:1.625rem;font-weight:300;line-height:1.2;letter-spacing:-0.01em;font-style:italic}
          .header-meta{margin-top:0.25rem;font-size:0.8125rem;color:var(--text-3)}
          .header-desc{margin-top:0.5rem;font-size:0.875rem;color:var(--text-2);max-width:640px;min-height:1.5em}
          [contenteditable]{outline:none;border-radius:4px;padding:2px 6px;margin:-2px -6px;transition:background 0.15s}
          [contenteditable]:hover{background:rgba(0,0,0,0.04)}
          [contenteditable]:focus{background:rgba(94,106,210,0.08);box-shadow:0 0 0 2px var(--accent)}
          [contenteditable]:empty::before{content:attr(data-placeholder);color:var(--text-3)}
          .admin-bar{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 2rem;background:var(--bg);border-bottom:1px solid var(--border);font-size:0.8125rem}
          .admin-bar a{color:var(--accent);text-decoration:none;font-weight:500}.admin-bar a:hover{text-decoration:underline}
          .admin-bar-right{display:flex;align-items:center;gap:1rem;color:var(--text-3)}
          .admin-bar-right form{margin:0}
          .admin-bar-logout{color:var(--text-3);font-size:0.8125rem;background:none;border:none;cursor:pointer;font-family:var(--sans);text-decoration:underline;text-underline-offset:2px}.admin-bar-logout:hover{color:var(--text)}
          body.theatre .admin-bar{background:#141414;border-color:#333}
          body.theatre .admin-bar-right{color:#737373}
          body.theatre .admin-bar-logout{color:#737373}
          .transcribe-btn{margin-left:0.75rem;padding:0.2rem 0.625rem;font-family:var(--sans);font-size:0.6875rem;font-weight:600;color:var(--accent);background:var(--accent-light);border:1px solid transparent;border-radius:4px;cursor:pointer;transition:background 0.15s,border-color 0.15s}
          .transcribe-btn:hover{border-color:var(--accent)}
          .transcribe-btn.retranscribe{color:var(--text-3);background:var(--bg-page)}
          .transcribe-btn:disabled{opacity:0.5;cursor:default}
          .save-toast{position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:var(--text);color:#fff;font-family:var(--sans);font-size:0.8125rem;font-weight:500;padding:0.5rem 1.25rem;border-radius:8px;z-index:100;opacity:0;transition:opacity 0.2s;pointer-events:none}
          .save-toast.visible{opacity:1}
          .views-pill{flex-shrink:0;font-size:0.75rem;font-family:var(--mono);color:var(--text-2);background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:0.25rem 0.75rem;white-space:nowrap}
          .content{display:grid;grid-template-columns:1fr 340px;gap:0;align-items:start}.video-col{min-width:0}
          .player{position:relative;background:#000;border-radius:var(--radius) var(--radius) 0 0;overflow:hidden;line-height:0;cursor:pointer;user-select:none}
          .player video{width:100%;display:block;aspect-ratio:16/9;object-fit:contain}
          .big-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:64px;height:64px;background:rgba(255,255,255,0.95);border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,0.3);transition:transform 0.15s;z-index:3}
          .big-play:hover{transform:translate(-50%,-50%) scale(1.06)}.big-play svg{width:24px;height:24px;fill:#171717;margin-left:2px}
          .player.playing .big-play{opacity:0;pointer-events:none;transition:opacity 0.15s}
          .speed-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:2;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s;pointer-events:none}
          .player.playing .speed-overlay{opacity:0;pointer-events:none}
          .speed-badge{position:absolute;top:50%;left:50%;transform:translate(-50%,48px);z-index:3;display:flex;align-items:center;gap:0.5rem;font-family:var(--mono);padding:0.375rem 0.875rem;border-radius:20px;pointer-events:none;transition:opacity 0.15s}
          .speed-badge-label{font-size:0.875rem;font-weight:600;color:#fff}
          .speed-badge-time{font-size:0.75rem;color:rgba(255,255,255,0.7)}
          .speed-badge-time s{text-decoration:line-through;color:rgba(255,255,255,0.5)}
          .player.playing .speed-badge{opacity:0;pointer-events:none}
          /* Thin bar always visible at very bottom when controls hidden */
          .seek-mini{position:absolute;bottom:0;left:0;right:0;height:3px;z-index:3;background:rgba(255,255,255,0.12);pointer-events:none}
          .seek-mini-fill{height:100%;width:0%;background:var(--player-accent);pointer-events:none;transition:width 0.1s linear}
          /* Full controls - ctrl-row above, progress bar at bottom; covers seek-mini when visible */
          .controls{position:absolute;bottom:0;left:0;right:0;padding:4rem 0.875rem 0.625rem;background:linear-gradient(transparent 0%,rgba(0,0,0,0.82) 100%);opacity:0;transition:opacity 0.22s;z-index:5;display:flex;flex-direction:column;gap:0.5rem}
          .player:hover .controls,.player.show-ctrl .controls{opacity:1}
          .progress-track{width:100%;height:4px;background:rgba(255,255,255,0.2);cursor:pointer;border-radius:2px;transition:height 0.15s ease;position:relative}
          .progress-track:hover{height:6px}
          .progress-fill{height:100%;width:0%;background:var(--player-accent);border-radius:2px;pointer-events:none;position:relative}
          .progress-fill::after{content:'';position:absolute;right:-7px;top:50%;transform:translateY(-50%) scale(0);width:14px;height:14px;background:var(--player-accent);border-radius:50%;box-shadow:0 0 10px rgba(249,115,22,0.6);transition:transform 0.15s ease}
          .progress-track:hover .progress-fill::after{transform:translateY(-50%) scale(1)}
          .progress-marker{position:absolute;bottom:calc(100% + 8px);transform:translateX(-50%) translateY(6px);pointer-events:auto;font-size:1.25rem;line-height:1;z-index:6;display:flex;flex-direction:column;align-items:center;opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;cursor:default;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))}
          .progress-track:hover .progress-marker{opacity:1;transform:translateX(-50%) translateY(0)}
          .marker-name{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);white-space:nowrap;font-family:var(--sans);font-size:0.625rem;font-weight:500;color:#fff;background:rgba(0,0,0,0.85);padding:2px 8px;border-radius:4px;opacity:0;transition:opacity 0.15s;pointer-events:none}
          .progress-marker:hover .marker-name{opacity:1}
          /* Control buttons row */
          .ctrl-row{display:flex;align-items:center;gap:0.125rem}
          .ctrl-btn{background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;padding:0.5rem;display:flex;align-items:center;border-radius:8px;transition:color 0.15s,background 0.15s}.ctrl-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}.ctrl-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
          .ctrl-time{font-family:var(--mono);font-size:0.6875rem;color:rgba(255,255,255,0.6);white-space:nowrap;margin:0 0.375rem}.ctrl-spacer{flex:1}
          .speed-btn{background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.9);font-family:var(--sans);font-size:0.6875rem;font-weight:600;padding:0.25rem 0.625rem;cursor:pointer;border-radius:20px;letter-spacing:0.02em;transition:background 0.15s,color 0.15s}.speed-btn:hover{background:rgba(255,255,255,0.2);color:#fff}
          .vol-group{display:flex;align-items:center;gap:0.375rem}.vol-track{width:60px;height:3px;background:rgba(255,255,255,0.2);cursor:pointer;border-radius:2px;transition:height 0.1s;flex-shrink:0}.vol-track:hover{height:5px}.vol-fill{height:100%;width:100%;background:#fff;border-radius:2px;pointer-events:none}
          .reactions-bar{display:flex;align-items:center;justify-content:center;gap:0.25rem;padding:0.75rem 1rem;background:var(--bg);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius) var(--radius)}
          .react-btn{display:flex;align-items:center;gap:0.25rem;padding:0.375rem 0.625rem;border:none;background:none;font-size:1.125rem;cursor:pointer;border-radius:6px;transition:background 0.1s;line-height:1}.react-btn:hover{background:var(--border-light)}.react-btn.reacted{background:var(--accent-light)}
          .react-count{font-family:var(--mono);font-size:0.6875rem;color:var(--text-3)}.react-btn.reacted .react-count{color:var(--accent)}
          .comment-trigger{display:inline-flex;align-items:center;gap:0.375rem;margin-left:0.5rem;padding:0.4375rem 0.875rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-family:var(--sans);font-size:0.8125rem;font-weight:500;color:var(--text);cursor:pointer;transition:background 0.1s,border-color 0.1s}
          .comment-trigger:hover{background:var(--bg-page);border-color:var(--text-3)}.comment-trigger svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
          .sidebar{background:var(--bg);border:1px solid var(--border);border-left:none;border-radius:0 var(--radius) var(--radius) 0;display:flex;flex-direction:column;align-self:stretch}
          .sidebar-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 1rem}
          .sidebar-tab{padding:0.75rem 0;margin-right:1.25rem;font-size:0.8125rem;font-weight:500;color:var(--text-3);border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;transition:color 0.15s}.sidebar-tab:hover{color:var(--text-2)}.sidebar-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
          .comment-input-area{padding:0.75rem 1rem;border-bottom:1px solid var(--border-light);flex-shrink:0}
          .comment-input-row{display:flex;gap:0.375rem;margin-bottom:0.375rem}.comment-input-row input{flex:1}
          .comment-input-area input,.comment-input-area textarea{width:100%;background:var(--bg-page);border:1px solid var(--border);color:var(--text);font-family:var(--sans);font-size:0.8125rem;padding:0.4375rem 0.625rem;border-radius:6px;outline:none;transition:border-color 0.15s}
          .comment-input-area input:focus,.comment-input-area textarea:focus{border-color:var(--accent)}
          .comment-input-area input::placeholder,.comment-input-area textarea::placeholder{color:var(--text-3)}
          .comment-input-area textarea{resize:none;min-height:48px}
          .comment-submit-row{display:flex;justify-content:space-between;align-items:center;margin-top:0.375rem}
          .timestamp-badge{font-family:var(--mono);font-size:0.6875rem;color:var(--accent);background:var(--accent-light);padding:0.125rem 0.5rem;border-radius:4px}
          .post-btn{background:var(--accent);color:#fff;border:none;font-family:var(--sans);font-size:0.75rem;font-weight:600;padding:0.375rem 1rem;border-radius:6px;cursor:pointer;transition:opacity 0.1s}.post-btn:hover{opacity:0.9}
          .activity-feed{flex:1;overflow-y:auto;padding:0}
          .activity-feed::-webkit-scrollbar{width:4px}.activity-feed::-webkit-scrollbar-track{background:transparent}.activity-feed::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
          .activity-item{padding:0.625rem 1rem;cursor:default}.activity-item+.activity-item{border-top:1px solid var(--border-light)}
          .activity-item[data-ts]{cursor:pointer}.activity-item[data-ts]:hover{background:var(--bg-page)}
          .activity-item.now-playing{background:var(--accent-light);border-left:3px solid var(--accent);padding-left:calc(1rem - 3px)}
          .activity-item.now-playing .activity-emoji{animation:pulse-emoji 0.5s ease-out}
          @keyframes pulse-emoji{0%{transform:scale(1)}50%{transform:scale(1.4)}100%{transform:scale(1)}}
          .activity-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.125rem}
          .activity-author{font-weight:500;font-size:0.8125rem}
          .activity-right{display:flex;align-items:center;gap:0.5rem}
          .activity-when{font-size:0.6875rem;color:var(--text-3)}
          .ts-link{font-family:var(--mono);font-size:0.6875rem;color:var(--accent);cursor:pointer}.ts-link:hover{text-decoration:underline}
          .activity-body{font-size:0.8125rem;color:var(--text-2);line-height:1.5;word-break:break-word}
          .activity-emoji{font-size:1.25rem;margin-top:0.125rem;display:block}
          .empty-activity{padding:3rem 1rem;text-align:center;color:var(--text-3);font-size:0.8125rem}
          .empty-activity strong{display:block;color:var(--text-2);margin-bottom:0.25rem;font-size:0.875rem}
          .transcript-panel{flex:1;overflow-y:auto;padding:0;display:none}
          .transcript-segment{padding:0.5rem 1rem;display:flex;gap:0.75rem;cursor:pointer;transition:background 0.1s}
          .transcript-segment:hover{background:var(--bg-page)}
          .transcript-segment.active{background:var(--accent-light)}
          .transcript-time{font-family:var(--mono);font-size:0.6875rem;color:var(--accent);flex-shrink:0;padding-top:0.0625rem;cursor:pointer}
          .transcript-time:hover{text-decoration:underline}
          .transcript-text{font-size:0.8125rem;color:var(--text-2);line-height:1.5}
          /* Player-level emoji popup — not affected by controls opacity */
          .marker-popup{position:absolute;bottom:4.5rem;transform:translateX(-50%);font-size:1.75rem;z-index:10;pointer-events:none;animation:markerPopAnim 2.5s ease forwards;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5))}
          .player:hover .marker-popup,.player.show-ctrl .marker-popup{bottom:7.5rem}
          .popup-name{position:absolute;bottom:calc(100% + 20px);left:50%;transform:translateX(-50%);white-space:nowrap;font-family:var(--sans);font-size:0.625rem;font-weight:500;color:#fff;background:rgba(0,0,0,0.8);padding:2px 8px;border-radius:4px;pointer-events:none}
          @keyframes markerPopAnim{0%{transform:translateX(-50%) scale(0);opacity:0}15%{transform:translateX(-50%) scale(1.8);opacity:1}35%{transform:translateX(-50%) scale(1.4);opacity:1}85%{transform:translateX(-50%) scale(1.3);opacity:1}100%{transform:translateX(-50%) scale(0.8);opacity:0}}
          video::cue{font-size:0;line-height:0}
          .subtitle-overlay{position:absolute;bottom:1.25rem;left:50%;transform:translateX(-50%);z-index:7;pointer-events:none;text-align:center;max-width:78%;opacity:0;transition:opacity 0.2s,bottom 0.22s ease;white-space:pre-wrap}
          .subtitle-overlay.visible{opacity:1}
          .player:hover .subtitle-overlay,.player.show-ctrl .subtitle-overlay{bottom:7rem}
          .subtitle-overlay span{font-family:var(--sans);font-size:0.9375rem;font-weight:500;color:#fff;background:rgba(0,0,0,0.72);padding:5px 14px;border-radius:6px;line-height:1.65;display:inline;box-decoration-break:clone;-webkit-box-decoration-break:clone}
          .subtitle-toggle{position:relative}.subtitle-toggle.active svg{color:#fff}
          .subtitle-toggle .cc-dot{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:0;transition:opacity 0.15s}.subtitle-toggle.active .cc-dot{opacity:1}
          .theatre-btn.active svg{color:#fff}
          body.theatre{background:#0a0a0a;color:#e5e5e5}
          body.theatre .page{max-width:100%;padding:0}
          body.theatre .header{padding:1rem 2rem;margin-bottom:0}
          body.theatre .header h1{color:#f5f5f5}
          body.theatre .header-meta{color:#737373}
          body.theatre .header-desc{color:#a3a3a3}
          body.theatre .views-pill{color:#a3a3a3;background:#1a1a1a;border-color:#333}
          body.theatre .content{grid-template-columns:1fr;gap:0}
          body.theatre .sidebar{display:none}
          body.theatre .player{border-radius:0}
          body.theatre .reactions-bar{background:#141414;border-color:#333;border-radius:0;border-left:none;border-right:none}
          body.theatre .react-btn:hover{background:#262626}
          body.theatre .react-count{color:#737373}
          body.theatre .comment-trigger{background:#1a1a1a;border-color:#333;color:#e5e5e5}
          body.theatre .comment-trigger:hover{background:#262626;border-color:#525252}
          body.theatre .video-col{min-width:0}
          body.theatre [contenteditable]:hover{background:rgba(255,255,255,0.06)}
          body.theatre [contenteditable]:focus{background:rgba(94,106,210,0.15)}
          body.theatre .transcribe-btn{background:#1a1a1a;color:var(--accent)}
          .watermark{display:flex;align-items:center;justify-content:center;gap:0.375rem;padding:1.5rem 0 0;font-size:0.6875rem;color:var(--text-3)}
          .watermark a{color:var(--text-3);text-decoration:none;font-weight:500;transition:color 0.15s}.watermark a:hover{color:var(--text-2)}
          .watermark svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:0.5}
          body.theatre .watermark{color:#525252}body.theatre .watermark a{color:#525252}body.theatre .watermark a:hover{color:#a3a3a3}
          @media(max-width:860px){.page{padding:1rem}.content{grid-template-columns:1fr}.sidebar{border-left:1px solid var(--border);border-radius:var(--radius);margin-top:1rem;max-height:none}.player{border-radius:var(--radius) var(--radius) 0 0}.reactions-bar{border-radius:0 0 var(--radius) var(--radius)}}
        `)}</style>
      </head>
      <body>
        {isAdmin && (
          <div class="admin-bar">
            <a href="/dashboard">Dashboard</a>
            <div class="admin-bar-right">
              <span>{session!.email}</span>
              <form method="post" action="/dashboard/logout">
                <button type="submit" class="admin-bar-logout">Log out</button>
              </form>
            </div>
          </div>
        )}
        <div class="page">
          <div class="header">
            <div class="header-row">
              <div style="flex:1;min-width:0">
                {isAdmin ? (
                  <h1 contenteditable="plaintext-only" id="edit-title" spellcheck={false} data-placeholder="Untitled">{title}</h1>
                ) : (
                  <h1>{title}</h1>
                )}
                <div class="header-meta">
                  {video.uploaded_at && <>{relativeTime(video.uploaded_at)}</>}
                  {isAdmin && !transcript && <button class="transcribe-btn" id="transcribe-btn">{"\u00A0"}Transcribe</button>}
                  {isAdmin && transcript && <button class="transcribe-btn retranscribe" id="transcribe-btn">{"\u00A0"}Re-transcribe</button>}
                </div>
              </div>
              <span class="views-pill">{viewCount.toLocaleString()} views</span>
            </div>
            {isAdmin ? (
              <p contenteditable="plaintext-only" id="edit-desc" class="header-desc" spellcheck={false} data-placeholder="Add a description...">{video.description || ""}</p>
            ) : (
              video.description && <p class="header-desc">{video.description}</p>
            )}
          </div>

          <div class="content">
            <div class="video-col">
              <div class="player show-ctrl" id="player">
                <video playsinline preload="metadata" src={mediaUrl} id="vid">
                  {transcript && <track kind="captions" src={`/v/${safeId}/captions.vtt`} srclang="en" label="English" />}
                </video>
                {suggestedSpeed > 0 && <div class="speed-overlay"></div>}
                <button class="big-play" id="big-play"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" /></svg></button>
                {suggestedSpeed > 0 && (
                  <div class="speed-badge" id="speed-badge">
                    <span class="speed-badge-label">{"\u26A1"} {suggestedSpeed}x</span>
                    <span class="speed-badge-time" id="speed-badge-time"></span>
                  </div>
                )}
                {transcript && <div class="subtitle-overlay" id="subtitle-overlay"><span></span></div>}
                <div class="seek-mini" id="seek-mini"><div class="seek-mini-fill" id="seek-mini-fill"></div></div>
                <div class="controls">
                  <div class="progress-track" id="progress-track">
                    <div class="progress-fill" id="progress-fill"></div>
                  </div>
                  <div class="ctrl-row">
                    <button class="ctrl-btn" id="play-btn">
                      <svg viewBox="0 0 24 24" id="icon-play" fill="none"><polygon points="5,3 21,12 5,21" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                      <svg viewBox="0 0 24 24" id="icon-pause" style="display:none" fill="none"><rect x="4" y="3" width="4" height="18" rx="1.5" fill="currentColor"/><rect x="16" y="3" width="4" height="18" rx="1.5" fill="currentColor"/></svg>
                    </button>
                    <button class="ctrl-btn" id="skip-back-btn" title="Skip back 5s">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M12.5 4C8.36 4 5 7.36 5 11.5S8.36 19 12.5 19c2.28 0 4.3-1.01 5.68-2.61" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 4L5 4L5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="12.5" y="13" text-anchor="middle" font-size="8" font-weight="800" font-family="'Manrope',system-ui,sans-serif" fill="currentColor" stroke="none">5</text></svg>
                    </button>
                    <button class="ctrl-btn" id="skip-fwd-btn" title="Skip forward 5s">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M11.5 4C15.64 4 19 7.36 19 11.5S15.64 19 11.5 19c-2.28 0-4.3-1.01-5.68-2.61" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M15 4L19 4L19 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="11.5" y="13" text-anchor="middle" font-size="8" font-weight="800" font-family="'Manrope',system-ui,sans-serif" fill="currentColor" stroke="none">5</text></svg>
                    </button>
                    <div class="vol-group">
                      <button class="ctrl-btn" id="vol-btn">
                        <svg viewBox="0 0 24 24" id="icon-vol-on" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
                        <svg viewBox="0 0 24 24" id="icon-vol-off" style="display:none" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
                      </button>
                      <div class="vol-track" id="vol-track"><div class="vol-fill" id="vol-fill"></div></div>
                    </div>
                    <span class="ctrl-time" id="time-display">0:00 / 0:00</span>
                    <div class="ctrl-spacer"></div>
                    {transcript && <button class="ctrl-btn subtitle-toggle" id="cc-btn" title="Subtitles">
                      <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" stroke-width="1.75"/><text x="12" y="15.5" text-anchor="middle" font-size="7" font-weight="700" font-family="'Manrope',system-ui,sans-serif" fill="currentColor" letter-spacing="0.8">CC</text></svg>
                      <span class="cc-dot"></span>
                    </button>}
                    <button class="speed-btn" id="speed-btn">1x</button>
                    <button class="ctrl-btn theatre-btn" id="theatre-btn" title="Theatre mode (T)">
                      <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.75"/><line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                    <button class="ctrl-btn" id="pip-btn" title="Picture in picture">
                      <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.75"/><rect x="13" y="13" width="7" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                    </button>
                    <button class="ctrl-btn" id="fs-btn" title="Fullscreen (F)">
                      <svg viewBox="0 0 24 24" fill="none"><polyline points="15,3 21,3 21,9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9,21 3,21 3,15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="3" x2="14" y2="10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><line x1="3" y1="21" x2="10" y2="14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              <div class="reactions-bar" id="reactions">
                {emojis.map((emoji) => (
                  <button class="react-btn" data-emoji={emoji} onclick={`handleReact('${emoji}', this)`}>
                    <span>{emoji}</span>
                    <span class="react-count">{emojiCounts[emoji] || 0}</span>
                  </button>
                ))}
                <button class="comment-trigger" id="focus-comment">
                  <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Comment
                </button>
              </div>
            </div>

            <div class="sidebar">
              <div class="sidebar-tabs">
                <button class="sidebar-tab active" onclick="switchTab('activity')">Activity</button>
                {segments.length > 0 && <button class="sidebar-tab" onclick="switchTab('transcript')">Transcript</button>}
              </div>
              <div class="comment-input-area">
                <form id="comment-form" onsubmit="return submitComment(event)">
                  {!isAdmin && (
                    <div class="comment-input-row">
                      <input type="text" placeholder="Name" required id="comment-name" />
                      <input type="email" placeholder="Email" required id="comment-email" />
                    </div>
                  )}
                  {isAdmin && (
                    <>
                      <input type="hidden" id="comment-name" value={session!.email.split("@")[0]} />
                      <input type="hidden" id="comment-email" value={session!.email} />
                    </>
                  )}
                  <textarea placeholder="Leave a comment..." required id="comment-body"></textarea>
                  <div class="comment-submit-row">
                    <span class="timestamp-badge" id="comment-ts-badge">0:00</span>
                    <button type="submit" class="post-btn">Post</button>
                  </div>
                </form>
              </div>
              <div class="activity-feed" id="activity-feed">
                {activity.length === 0 ? (
                  <div class="empty-activity">
                    <strong>{"No activity yet"}</strong>
                    {"React or comment to get started."}
                  </div>
                ) : (
                  activity.map((item) => {
                    if (item.type === "comment") {
                      const c = item.data;
                      const ts = c.timestamp_sec;
                      return (
                        <div class="activity-item" data-ts={ts != null ? String(ts) : undefined} onclick={ts != null ? `seekTo(${ts})` : undefined}>
                          <div class="activity-head">
                            <span class="activity-author">{c.name}</span>
                            <div class="activity-right">
                              {ts != null && <span class="ts-link">{fmtTimestamp(ts)}</span>}
                              <span class="activity-when">{relativeTime(c.created_at)}</span>
                            </div>
                          </div>
                          <p class="activity-body">{c.body}</p>
                        </div>
                      );
                    } else {
                      const r = item.data;
                      return (
                        <div class="activity-item" data-ts={String(r.timestamp_sec)} onclick={`seekTo(${r.timestamp_sec})`}>
                          <div class="activity-head">
                            <span class="activity-author">{r.name}</span>
                            <div class="activity-right">
                              <span class="ts-link">{fmtTimestamp(r.timestamp_sec)}</span>
                              <span class="activity-when">{relativeTime(r.created_at)}</span>
                            </div>
                          </div>
                          <span class="activity-emoji">{r.emoji}</span>
                        </div>
                      );
                    }
                  })
                )}
              </div>
              {segments.length > 0 && (
                <div class="transcript-panel" id="transcript-panel">
                  {segments.map((seg) => (
                    <div class="transcript-segment" data-start={String(seg.start)} data-end={String(seg.end)} onclick={`seekTo(${seg.start})`}>
                      <span class="transcript-time">{fmtTimestamp(seg.start)}</span>
                      <span class="transcript-text">{seg.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div class="watermark">
            Powered by <a href="https://github.com/mhmd-azeez/deloom" target="_blank">deloom</a>
            <svg viewBox="0 0 24 24"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
          </div>
        </div>

        {raw(`<script>
        (function(){
          var videoId=${JSON.stringify(safeId)};
          var vid=document.getElementById('vid'),player=document.getElementById('player'),bigPlay=document.getElementById('big-play');
          var playBtn=document.getElementById('play-btn'),iconPlay=document.getElementById('icon-play'),iconPause=document.getElementById('icon-pause');
          var progressTrack=document.getElementById('progress-track'),progressFill=document.getElementById('progress-fill');
          var seekMini=document.getElementById('seek-mini'),seekMiniFill=document.getElementById('seek-mini-fill');
          var timeDisplay=document.getElementById('time-display'),speedBtn=document.getElementById('speed-btn');
          var volBtn=document.getElementById('vol-btn'),volTrack=document.getElementById('vol-track'),volFill=document.getElementById('vol-fill');
          var iconVolOn=document.getElementById('icon-vol-on'),iconVolOff=document.getElementById('icon-vol-off');
          var pipBtn=document.getElementById('pip-btn'),fsBtn=document.getElementById('fs-btn');
          var tsBadge=document.getElementById('comment-ts-badge');
          var markers=${reactionMarkers};
          var suggestedSpeed=${suggestedSpeed};

          fetch('/v/'+videoId+'/view',{method:'POST'});

          // Speed suggestion: auto-apply on first play, show time savings
          if(suggestedSpeed>0){
            vid.addEventListener('loadedmetadata',function(){
              var dur=vid.duration;var newDur=dur/suggestedSpeed;
              var badge=document.getElementById('speed-badge-time');
              if(badge){
                var s=document.createElement('s');s.textContent=fmt(dur);
                badge.textContent='';badge.appendChild(s);
                badge.appendChild(document.createTextNode(' '+fmt(newDur)));
              }
            });
            // Auto-apply suggested speed on first play
            var firstPlay=true;
            vid.addEventListener('play',function(){
              if(firstPlay){firstPlay=false;vid.playbackRate=suggestedSpeed;speedBtn.textContent=suggestedSpeed+'x';var si=speeds.indexOf(suggestedSpeed);if(si>=0)speedIdx=si;}
            });
          }

          function fmt(s){if(isNaN(s))return'0:00';var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);if(h>0)return h+':'+(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;return m+':'+(sec<10?'0':'')+sec;}

          window.seekTo=function(ts){vid.currentTime=ts;if(vid.paused)vid.play();};

          function renderMarkers(){
            if(!vid.duration)return;
            progressTrack.querySelectorAll('.progress-marker').forEach(function(el){el.remove();});
            markers.forEach(function(m){
              var el=document.createElement('span');
              el.className='progress-marker';
              el.setAttribute('data-ts',m.ts);
              el.style.left=(m.ts/vid.duration*100)+'%';
              el.textContent=m.emoji;
              if(m.name){var tip=document.createElement('span');tip.className='marker-name';tip.textContent=m.name;el.appendChild(tip);}
              progressTrack.appendChild(el);
            });
          }

          function syncState(){
            if(vid.paused){player.classList.add('show-ctrl');player.classList.remove('playing');iconPlay.style.display='';iconPause.style.display='none';}
            else{player.classList.remove('show-ctrl');player.classList.add('playing');iconPlay.style.display='none';iconPause.style.display='';}
          }
          function togglePlay(){vid.paused?vid.play():vid.pause();}

          vid.addEventListener('play',syncState);
          vid.addEventListener('pause',syncState);
          vid.addEventListener('ended',function(){syncState();progressFill.style.width='100%';if(seekMiniFill)seekMiniFill.style.width='100%';});
          vid.addEventListener('loadedmetadata',function(){timeDisplay.textContent='0:00 / '+fmt(vid.duration);renderMarkers();});

          playBtn.addEventListener('click',function(e){e.stopPropagation();togglePlay();});
          bigPlay.addEventListener('click',function(e){e.stopPropagation();togglePlay();});
          player.addEventListener('click',function(e){if(e.target.closest('.controls'))return;togglePlay();});

          vid.addEventListener('timeupdate',function(){
            if(vid.duration){var pct=(vid.currentTime/vid.duration*100)+'%';progressFill.style.width=pct;if(seekMiniFill)seekMiniFill.style.width=pct;timeDisplay.textContent=fmt(vid.currentTime)+' / '+fmt(vid.duration);tsBadge.textContent=fmt(vid.currentTime);}
            var ct=vid.currentTime;
            // Highlight active transcript segment
            var segs=document.querySelectorAll('.transcript-segment');
            segs.forEach(function(seg){
              var st=parseFloat(seg.dataset.start),en=parseFloat(seg.dataset.end);
              var active=ct>=st&&ct<en;
              seg.classList.toggle('active',active);
              if(active&&document.getElementById('transcript-panel')&&document.getElementById('transcript-panel').style.display!=='none'){
                seg.scrollIntoView({block:'nearest',behavior:'smooth'});
              }
            });
            // Pop markers at current timestamp (Loom-style)
            // Spawn player-level popup only (not inside controls, avoids duplication)
            markers.forEach(function(m){
              var ts=m.ts;
              var key=ts+'_'+m.emoji;
              var hit=ct>=ts&&ct<ts+2;
              if(hit&&!document.querySelector('.marker-popup[data-key="'+key+'"]')){
                var pct=(ts/vid.duration*100)+'%';
                var popup=document.createElement('span');
                popup.className='marker-popup';
                popup.setAttribute('data-key',key);
                popup.textContent=m.emoji;
                popup.style.left=pct;
                if(m.name){var tip=document.createElement('span');tip.className='popup-name';tip.textContent=m.name;popup.appendChild(tip);}
                player.appendChild(popup);
                setTimeout(function(){popup.remove();},2600);
              }
            });
            // Highlight activity items at current timestamp
            var items=document.querySelectorAll('.activity-item[data-ts]');
            items.forEach(function(item){
              var ts=parseFloat(item.dataset.ts);
              var hit=ct>=ts&&ct<ts+3;
              if(hit&&!item.classList.contains('now-playing')){
                item.classList.add('now-playing');
                var em=item.querySelector('.activity-emoji');
                if(em){em.style.animation='none';em.offsetHeight;em.style.animation='';}
                if(document.getElementById('activity-feed').style.display!=='none'){item.scrollIntoView({block:'nearest',behavior:'smooth'});}
              }else if(!hit){item.classList.remove('now-playing');}
            });
          });

          progressTrack.addEventListener('click',function(e){e.stopPropagation();var r=progressTrack.getBoundingClientRect();vid.currentTime=((e.clientX-r.left)/r.width)*vid.duration;});
          var dragging=false;
          progressTrack.addEventListener('mousedown',function(e){dragging=true;var r=progressTrack.getBoundingClientRect();vid.currentTime=((e.clientX-r.left)/r.width)*vid.duration;});
          document.addEventListener('mousemove',function(e){if(!dragging)return;var r=progressTrack.getBoundingClientRect();vid.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*vid.duration;});
          document.addEventListener('mouseup',function(){dragging=false;});

          var speeds=[0.5,0.75,1,1.25,1.5,2],speedIdx=2;
          speedBtn.addEventListener('click',function(e){e.stopPropagation();speedIdx=(speedIdx+1)%speeds.length;vid.playbackRate=speeds[speedIdx];speedBtn.textContent=speeds[speedIdx]+'x';});

          // Skip buttons
          document.getElementById('skip-back-btn').addEventListener('click',function(e){e.stopPropagation();vid.currentTime=Math.max(0,vid.currentTime-5);});
          document.getElementById('skip-fwd-btn').addEventListener('click',function(e){e.stopPropagation();vid.currentTime=Math.min(vid.duration||0,vid.currentTime+5);});

          function syncVolIcon(){if(iconVolOn&&iconVolOff){var muted=vid.volume===0||vid.muted;iconVolOn.style.display=muted?'none':'';iconVolOff.style.display=muted?'':'none';}}
          var lastVol=1;
          volTrack.addEventListener('click',function(e){e.stopPropagation();var r=volTrack.getBoundingClientRect();var ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));vid.volume=ratio;volFill.style.width=(ratio*100)+'%';syncVolIcon();});
          volBtn.addEventListener('click',function(e){e.stopPropagation();if(vid.volume>0){lastVol=vid.volume;vid.volume=0;volFill.style.width='0%';}else{vid.volume=lastVol;volFill.style.width=(lastVol*100)+'%';}syncVolIcon();});

          // Subtitles toggle — custom overlay instead of native cues
          var ccBtn=document.getElementById('cc-btn');
          var subOverlay=document.getElementById('subtitle-overlay');
          var subSpan=subOverlay&&subOverlay.querySelector('span');
          var ccActive=true;
          if(ccBtn){
            var track=vid.textTracks&&vid.textTracks[0];
            if(track){
              track.mode='hidden';
              ccBtn.classList.add('active');
              track.addEventListener('cuechange',function(){
                if(!ccActive||!subOverlay)return;
                var cue=track.activeCues&&track.activeCues[0];
                if(cue){subSpan.textContent=cue.text;subOverlay.classList.add('visible');}
                else{subOverlay.classList.remove('visible');}
              });
            }
            ccBtn.addEventListener('click',function(e){
              e.stopPropagation();
              if(!track)return;
              ccActive=!ccActive;
              if(ccActive){track.mode='hidden';ccBtn.classList.add('active');}
              else{track.mode='disabled';ccBtn.classList.remove('active');if(subOverlay)subOverlay.classList.remove('visible');}
            });
          }

          pipBtn.addEventListener('click',function(e){e.stopPropagation();if(document.pictureInPictureElement)document.exitPictureInPicture();else if(vid.requestPictureInPicture)vid.requestPictureInPicture();});
          fsBtn.addEventListener('click',function(e){e.stopPropagation();if(document.fullscreenElement)document.exitFullscreen();else player.requestFullscreen();});

          // Theatre mode
          var theatreBtn=document.getElementById('theatre-btn');
          theatreBtn.addEventListener('click',function(e){
            e.stopPropagation();
            document.body.classList.toggle('theatre');
            theatreBtn.classList.toggle('active');
          });

          document.addEventListener('keydown',function(e){
            if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.isContentEditable)return;
            switch(e.key){case ' ':case 'k':e.preventDefault();togglePlay();break;case 'ArrowLeft':vid.currentTime=Math.max(0,vid.currentTime-5);break;case 'ArrowRight':vid.currentTime=Math.min(vid.duration||0,vid.currentTime+5);break;case 'j':vid.currentTime=Math.max(0,vid.currentTime-10);break;case 'l':vid.currentTime=Math.min(vid.duration||0,vid.currentTime+10);break;case 'm':volBtn.click();break;case 'f':fsBtn.click();break;case 't':theatreBtn.click();break;case 's':if(ccBtn)ccBtn.click();break;case 'c':document.getElementById('comment-body').focus();break;}
          });

          var hideTimer;
          player.addEventListener('mousemove',function(){player.classList.add('show-ctrl');clearTimeout(hideTimer);if(!vid.paused)hideTimer=setTimeout(function(){player.classList.remove('show-ctrl');},2500);});
          player.addEventListener('mouseleave',function(){if(!vid.paused)hideTimer=setTimeout(function(){player.classList.remove('show-ctrl');},800);});

          document.getElementById('focus-comment').addEventListener('click',function(){document.getElementById('comment-body').focus();});

          // Pre-fill user info from localStorage (not URL)
          var savedName=localStorage.getItem('comment_name');
          var savedEmail=localStorage.getItem('comment_email');
          if(savedName)document.getElementById('comment-name').value=savedName;
          if(savedEmail)document.getElementById('comment-email').value=savedEmail;

          // Reactions - requires name/email in localStorage
          window.handleReact=function(emoji,btn){
            var name=localStorage.getItem('comment_name');
            var email=localStorage.getItem('comment_email');
            if(!name||!email){document.getElementById('comment-name').focus();return;}
            var ts=Math.floor(vid.currentTime||0);
            fetch('/v/'+videoId+'/react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji:emoji,name:name,email:email,timestamp:ts})})
            .then(function(r){return r.json();}).then(function(data){
              if(data.ok){
                var cnt=btn.querySelector('.react-count');
                cnt.textContent=parseInt(cnt.textContent)+1;
                btn.classList.add('reacted');
                markers.push({emoji:emoji,ts:ts,name:name});
                renderMarkers();
                // Trigger popup for the new reaction
                var pct=(ts/vid.duration*100)+'%';
                var popup=document.createElement('span');
                popup.className='marker-popup';
                popup.setAttribute('data-key',ts+'_'+emoji);
                popup.textContent=emoji;
                if(name){var tip=document.createElement('span');tip.className='popup-name';tip.textContent=name;popup.appendChild(tip);}
                popup.style.left=pct;
                player.appendChild(popup);
                setTimeout(function(){popup.remove();},2600);
                // Add to activity feed via DOM
                var feed=document.getElementById('activity-feed');
                var empty=feed.querySelector('.empty-activity');
                if(empty)empty.remove();
                var item=document.createElement('div');
                item.className='activity-item';
                item.setAttribute('data-ts',ts);
                item.onclick=function(){seekTo(ts);};
                var head=document.createElement('div');head.className='activity-head';
                var auth=document.createElement('span');auth.className='activity-author';auth.textContent=name;
                var right=document.createElement('div');right.className='activity-right';
                var tsEl=document.createElement('span');tsEl.className='ts-link';tsEl.textContent=fmt(ts);
                var when=document.createElement('span');when.className='activity-when';when.textContent='just now';
                right.appendChild(tsEl);right.appendChild(when);head.appendChild(auth);head.appendChild(right);
                var em=document.createElement('span');em.className='activity-emoji';em.textContent=emoji;
                item.appendChild(head);item.appendChild(em);feed.appendChild(item);
                feed.scrollTop=feed.scrollHeight;
              }
            });
          };

          window.switchTab=function(tab){
            var tabs=document.querySelectorAll('.sidebar-tab');
            tabs.forEach(function(t,i){t.classList.toggle('active',i===(tab==='activity'?0:1));});
            var feed=document.getElementById('activity-feed');
            var commentArea=document.querySelector('.comment-input-area');
            var tp=document.getElementById('transcript-panel');
            if(tab==='activity'){
              if(feed)feed.style.display='';
              if(commentArea)commentArea.style.display='';
              if(tp)tp.style.display='none';
            }else{
              if(feed)feed.style.display='none';
              if(commentArea)commentArea.style.display='none';
              if(tp)tp.style.display='block';
            }
          };

          window.submitComment=function(e){
            e.preventDefault();
            var name=document.getElementById('comment-name').value.trim();
            var email=document.getElementById('comment-email').value.trim();
            var body=document.getElementById('comment-body').value.trim();
            if(!name||!email||!body)return false;
            localStorage.setItem('comment_name',name);
            localStorage.setItem('comment_email',email);
            var ts=Math.floor(vid.currentTime||0);
            var btn=document.querySelector('.post-btn');btn.textContent='Posting...';btn.disabled=true;
            fetch('/v/'+videoId+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,email:email,body:body,timestamp:ts})})
            .then(function(r){return r.json();}).then(function(data){if(data.ok)location.reload();});
            return false;
          };
        })();
        </script>`)}
        {isAdmin && raw(`<div class="save-toast" id="save-toast">Saved</div>
        <script>
        (function(){
          var videoId=${JSON.stringify(safeId)};
          var saveTimer,saving=false;
          function showToast(msg){var t=document.getElementById('save-toast');t.textContent=msg||'Saved';t.classList.add('visible');clearTimeout(saveTimer);saveTimer=setTimeout(function(){t.classList.remove('visible');},1500);}
          function saveMetadata(){
            if(saving)return;saving=true;
            var title=(document.getElementById('edit-title')||{}).textContent||'';
            var desc=(document.getElementById('edit-desc')||{}).textContent||'';
            fetch('/v/'+videoId+'/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim(),description:desc.trim()})})
            .then(function(r){return r.json();}).then(function(d){if(d.ok)showToast('Saved');}).finally(function(){saving=false;});
          }
          // Auto-save on blur
          var titleEl=document.getElementById('edit-title');
          var descEl=document.getElementById('edit-desc');
          if(titleEl)titleEl.addEventListener('blur',saveMetadata);
          if(descEl)descEl.addEventListener('blur',saveMetadata);

          // Transcribe button
          var transcribeBtn=document.getElementById('transcribe-btn');
          if(transcribeBtn){
            transcribeBtn.addEventListener('click',function(){
              transcribeBtn.disabled=true;transcribeBtn.textContent='Loading model...';
              var mediaUrl=${JSON.stringify(mediaUrl)};
              fetch(mediaUrl).then(function(r){return r.arrayBuffer();}).then(function(buf){
                transcribeBtn.textContent='Decoding audio...';
                var actx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
                return actx.decodeAudioData(buf);
              }).then(function(audio){
                var raw=audio.getChannelData(0);
                var samples=new Float32Array(raw.length);
                for(var i=0;i<raw.length;i++)samples[i]=raw[i];
                transcribeBtn.textContent='Transcribing...';
                var w=new Worker('/dashboard/transcribe-worker.js');
                w.postMessage({audio:samples});
                w.onmessage=function(e){
                  var d=e.data;
                  if(d.status==='progress'){transcribeBtn.textContent='Transcribing... '+Math.round((d.progress||0)*100)+'%';}
                  else if(d.status==='complete'){
                    var segs=d.segments||[];
                    var fullText=segs.map(function(s){return s.text;}).join(' ');
                    // Build VTT
                    var vtt='WEBVTT\\n\\n';
                    segs.forEach(function(s,i){
                      function vttTime(t){var h=Math.floor(t/3600),m=Math.floor((t%3600)/60),sc=t%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+sc.toFixed(3).padStart(6,'0');}
                      vtt+=(i+1)+'\\n'+vttTime(s.start)+' --> '+vttTime(s.end)+'\\n'+s.text+'\\n\\n';
                    });
                    fetch('/dashboard/videos/'+videoId+'/transcript',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({full_text:fullText,segments:segs,vtt:vtt})})
                    .then(function(){showToast('Transcription saved');setTimeout(function(){location.reload();},800);});
                  }
                  else if(d.status==='error'){transcribeBtn.textContent='Error';transcribeBtn.disabled=false;}
                };
              });
            });
          }
        })();
        </script>`)}
      </body>
    </html>
  );
});

// Edit video metadata (requires auth)
app.post("/v/:id/edit", async (c) => {
  const token = getSessionToken(c.req.header("cookie"));
  const session = token ? await validateSession(c.env.DB, token) : null;
  if (!session) return c.json({ ok: false, error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const { title, description } = await c.req.json<{ title: string; description: string }>();
  await c.env.DB.prepare("UPDATE videos SET title = ?, description = ? WHERE id = ?").bind(title || "", description || "", id).run();
  return c.json({ ok: true });
});

// Captions VTT
app.get("/v/:id/captions.vtt", async (c) => {
  const id = c.req.param("id");
  const transcript = await c.env.DB
    .prepare("SELECT vtt FROM transcripts WHERE video_id = ? AND status = 'done'")
    .bind(id)
    .first<{ vtt: string }>();
  if (!transcript?.vtt) return c.notFound();
  return new Response(transcript.vtt, {
    headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});

// Embed
app.get("/embed/:id", async (c) => {
  const id = c.req.param("id");
  const [video, hasTranscript] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<Video>(),
    c.env.DB.prepare("SELECT 1 FROM transcripts WHERE video_id = ? AND status = 'done'").bind(id).first(),
  ]);
  if (!video) return c.notFound();
  const mediaDomain = c.env.MEDIA_DOMAIN;
  const mediaUrl = mediaDomain ? `https://${mediaDomain}/${video.r2_key}` : `/media/${encodeURIComponent(video.r2_key)}`;
  const safeId = id.replace(/[^a-z0-9-]/g, "");
  return c.html(
    <html lang="en">
      <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{video.title || "Video"}</title>
        <style>{`*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#000}video{width:100%;height:100%;object-fit:contain}`}</style>
      </head>
      <body>
        <video controls playsinline preload="metadata" src={mediaUrl}>
          {hasTranscript && <track kind="captions" src={`/v/${safeId}/captions.vtt`} srclang="en" label="English" />}
        </video>
        {raw(`<script>fetch("/v/${safeId}/view",{method:"POST"})</script>`)}
      </body>
    </html>
  );
});

// View count — deduplicate by visitor fingerprint
app.post("/v/:id/view", async (c) => {
  const id = c.req.param("id");
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const ua = c.req.header("user-agent") || "unknown";
  // Simple hash for visitor dedup
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "|" + ua);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const visitorId = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

  const viewId = generateId();
  // Try to insert unique view — if already exists, skip
  const result = await c.env.DB.prepare(
    "INSERT INTO view_logs (id, video_id, visitor_id) VALUES (?, ?, ?) ON CONFLICT(video_id, visitor_id) DO NOTHING"
  ).bind(viewId, id, visitorId).run();

  if (result.meta.changes > 0) {
    // New unique visitor — increment count
    await c.env.DB.prepare(
      "INSERT INTO views (video_id, count) VALUES (?, 1) ON CONFLICT(video_id) DO UPDATE SET count = count + 1"
    ).bind(id).run();
  }

  return c.json({ ok: true });
});

// React with timestamp + user info
app.post("/v/:id/react", async (c) => {
  const id = c.req.param("id");
  const { emoji, name, email, timestamp } = await c.req.json<{ emoji: string; name: string; email: string; timestamp: number }>();
  if (!isValidEmoji(emoji)) return c.json({ ok: false, error: "invalid emoji" }, 400);
  if (!name?.trim() || !email?.trim()) return c.json({ ok: false, error: "name and email required" }, 400);
  const reactionId = generateId();
  await c.env.DB.prepare("INSERT INTO reactions (id, video_id, emoji, name, email, timestamp_sec) VALUES (?, ?, ?, ?, ?, ?)").bind(reactionId, id, emoji, name.trim(), email.trim(), timestamp || 0).run();
  return c.json({ ok: true, id: reactionId });
});

// Comment with timestamp
app.post("/v/:id/comments", async (c) => {
  const id = c.req.param("id");
  const { name, email, body, timestamp } = await c.req.json<{ name: string; email: string; body: string; timestamp?: number }>();
  if (!name?.trim() || !email?.trim() || !body?.trim()) return c.json({ ok: false, error: "missing fields" }, 400);
  const commentId = generateId();
  await c.env.DB.prepare("INSERT INTO comments (id, video_id, name, email, body, timestamp_sec) VALUES (?, ?, ?, ?, ?, ?)").bind(commentId, id, name.trim(), email.trim(), body.trim(), timestamp ?? null).run();
  return c.json({ ok: true, id: commentId });
});

export default app;
