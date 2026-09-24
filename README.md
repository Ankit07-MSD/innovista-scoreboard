# Innovista Live Scoreboard

Real-time esports match overlay + admin control panel, matching the Innovista tech-fest theme.

## What's inside
- `server.js` — Node.js backend (Express + Socket.io). Holds match state in memory and persists it to `state.json` on disk, and pushes live updates to every connected browser.
- `public/index.html` + `app.js` — the **public display** (put this on stream / big screen).
- `public/admin.html` + `admin.js` — the **admin panel** (control everything from here).
- `public/style.css` — shared Innovista theme (dark cyber grid, cyan glow, matches the fest branding).

## Setup

1. Install [Node.js](https://nodejs.org) (v18+).
2. In this folder, run:
   ```
   npm install
   npm start
   ```
3. Open:
   - Public display: `http://localhost:3000/`
   - Admin panel: `http://localhost:3000/admin`

The admin panel will ask for an **admin key** the first time (default: `admin123`). Change it before your real event:
```
ADMIN_KEY=yourSecretKey npm start
```
(or set `ADMIN_KEY` as an environment variable on whatever server/host you deploy to).

## How it works

- Every team has: name, alive count (0–4), kills, eliminated flag, finishing position, total points.
- **Total points = kills + placement points.** Placement points are only added once a team is eliminated or wins.
- Clicking **Eliminate** in the admin panel automatically assigns that team's finishing position (in reverse order — first team out gets the lowest placement) and shows the orange "ELIMINATED" banner + dims that row on the public display.
- **Undo** reverses an accidental elimination.
- When only one team is left standing, it's automatically crowned **BOOYAH** (position #1) — no button needed.
- **Placement Points** table (how many points each finishing position is worth) is editable live from the admin panel.
- **Reset Match** clears kills/alive/eliminations for a new match while keeping your team list — handy for a multi-match tournament day.
- Everything is pushed instantly to every open browser tab (admin and public) via Socket.io — no manual refresh needed.

## Deploying for a real event

For a live event you'll want this running on a proper server (not your laptop) so it doesn't drop when your Wi-Fi hiccups. Any Node.js host works (Render, Railway, a VPS, etc.). Just:
1. Upload this folder.
2. Set the `ADMIN_KEY` environment variable to something private.
3. Run `npm install && npm start`.
4. Use the hosted public URL as your stream browser-source, and `/admin` (kept private) to run the match.

## Notes / things you may want to extend
- There's currently one shared admin key for everyone with access to `/admin` — good enough for a small trusted crew running the show. If you need per-person logins later, that can be added.
- Team logos were intentionally left out, per your request — only team names are shown.
- "Knocked" state isn't tracked, only alive count and eliminated/kills, as requested.
