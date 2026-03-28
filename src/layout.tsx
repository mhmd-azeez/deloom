import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        :root {
          --fg: #0a0a0a;
          --fg-2: #555;
          --fg-3: #888;
          --bg: #fafaf8;
          --bg-2: #f0efec;
          --border: #d4d2cc;
          --border-heavy: #0a0a0a;
          --accent: #c53d13;
          --accent-hover: #a83210;
          --accent-bg: #fdf0ec;
          --green: #2a7e3b;
          --green-bg: #edf7ef;
          --serif: 'Instrument Serif', Georgia, serif;
          --sans: 'DM Sans', system-ui, sans-serif;
          --mono: 'DM Mono', 'SF Mono', monospace;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: var(--sans);
          background: var(--bg);
          color: var(--fg);
          line-height: 1.55;
          font-size: 15px;
          -webkit-font-smoothing: antialiased;
        }
        .container { max-width: 780px; margin: 0 auto; padding: 3rem 1.5rem; }
        .container-wide { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem; }
        a { color: var(--fg); text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 2px; transition: text-decoration-color 0.15s; }
        a:hover { text-decoration-color: var(--fg); }
        h1 { font-family: var(--serif); font-size: 2rem; font-weight: 400; letter-spacing: -0.01em; line-height: 1.2; margin-bottom: 0; }
        h2 { font-family: var(--serif); font-size: 1.375rem; font-weight: 400; letter-spacing: -0.01em; line-height: 1.3; margin-bottom: 0; }
        .text-muted { color: var(--fg-3); font-size: 0.8125rem; letter-spacing: 0.01em; }
        .label { font-size: 0.6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-3); }

        /* Buttons */
        .btn {
          display: inline-flex; align-items: center; gap: 0.375rem;
          padding: 0.4375rem 0.875rem;
          border: 1px solid var(--border);
          border-radius: 0;
          background: var(--bg);
          color: var(--fg);
          font-family: var(--sans);
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.1s, border-color 0.1s;
          letter-spacing: 0.01em;
        }
        .btn:hover { background: var(--bg-2); border-color: var(--fg-3); }
        .btn:active { background: var(--border); }
        .btn-primary {
          background: var(--fg);
          color: var(--bg);
          border-color: var(--fg);
        }
        .btn-primary:hover { background: #222; }
        .btn-danger {
          background: var(--bg);
          color: var(--accent);
          border-color: var(--accent);
        }
        .btn-danger:hover { background: var(--accent-bg); }

        /* Forms */
        input, textarea {
          width: 100%;
          padding: 0.5rem 0.625rem;
          border: 1px solid var(--border);
          border-radius: 0;
          font-size: 0.875rem;
          font-family: var(--sans);
          background: #fff;
          color: var(--fg);
          transition: border-color 0.15s;
        }
        textarea { resize: vertical; min-height: 80px; }
        input:focus, textarea:focus {
          outline: none;
          border-color: var(--fg);
        }
        input::placeholder, textarea::placeholder {
          color: var(--fg-3);
        }

        /* Tables */
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 0.625rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
        th { font-size: 0.6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-3); border-bottom-color: var(--fg); }
        tr:hover td { background: var(--bg-2); }
        td { font-size: 0.875rem; }

        /* Flash */
        .flash {
          padding: 0.625rem 0.875rem;
          margin-bottom: 1.5rem;
          background: var(--green-bg);
          color: var(--green);
          border-left: 3px solid var(--green);
          font-size: 0.875rem;
        }

        /* Mono numbers */
        .num { font-family: var(--mono); font-size: 0.8125rem; }

        /* Divider */
        .divider { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

        /* Animation */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.3s ease-out both; }
      `}</style>
    </head>
    <body>{children}</body>
  </html>
);
