# Hosting BRETWALDA so ANYONE can join from a group chat

The sandbox preview URL (where YOU built it) is private — the platform only lets you open it. To let friends join, host the game at any public Node.js host. Here are the three easiest paths — they all take under 3 minutes.

> The game is fully self-contained: Next.js + WebSocket + HTTP/SSE fallback run in ONE process on ONE port. No database, no external services, no env vars required for the game to work.

## Option A — Fly.io (recommended: it does not expire)

**Read this first if you are here because Render's free Postgres is running
out.** Moving to a different host's FREE TIER restarts the same clock. What
removes the deadline is a machine that costs a few pounds a month and keeps
running. `fly.toml` in the repo root is written for this game and carries the
one setting that must not be changed to save money — see the note at the top of
it, and `docs/PLATFORM-PATH.md` §3.

1. Install the CLI: `curl -L https://fly.io/install.sh | sh`, then `fly auth signup`.
2. From the repo root: `fly launch --copy-config --no-deploy`
   — `--copy-config` makes it use the `fly.toml` already here instead of writing
   its own, which is the whole point of that file existing.
3. Give it the database, once: `fly secrets set DATABASE_URL="postgresql://..."`
   (the POOLED Neon string, the one whose hostname contains `-pooler`).
4. `fly deploy`
5. `fly open` — that URL is your group-chat link.

**Do not turn on auto-stop to save money.** Every match in this game is process
memory; a machine that sleeps drops every live room mid-round. `fly.toml` says
so at length.

## Option B — Railway (fast, but its free tier is a clock)

1. Push this repo to GitHub (or use this zip).
2. Go to https://railway.app → New Project → Deploy from GitHub → select repo.
3. Railway auto-detects Node 20 and runs:
   - build: `npm ci && npm run build`
   - start: `npm start` (this starts `custom-server.mjs` which serves HTTP+WS on the PORT Railway gives it)
4. After deploy, Railway shows a public URL like `https://bretwalda-production.up.railway.app` — **drop THAT link in your group chat**. No config needed.

## Option C — Render

1. Push to GitHub, then on https://render.com → New → Web Service → connect repo.
2. Settings:
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
   - Node version: 20
3. Hit Deploy — you get a `.onrender.com` URL → that's your group-chat link.

## Option D — Docker (DigitalOcean, Hetzner, your own VPS)

The included `Dockerfile` builds and runs the full game in one container:

```
docker build -t bretwalda .
docker run -p 3000:3000 bretwalda
# Then open http://YOUR_SERVER_IP_OR_DOMAIN:3000 — done.
```

For Fly.io: `fly launch` (it detects the Dockerfile), `fly deploy`, then `fly open`.

## After deploying — the group-chat flow (verified end-to-end)

1. Open YOUR deployed URL — type name → CREATE BATTLE → you land in a lobby.
2. The URL in your address bar **already contains `?code=YOURCODE`** (the game writes it on join).
   - Copy that, or tap LOBBY → **COPY INVITE LINK** / **SHARE**.
3. Paste into Snapchat/WhatsApp/Discord.
   - A big campfire key-art card unfurls automatically (Open Graph is host-aware).
4. Friend taps the link → "YOU ARE SUMMONED" banner → types a name → hits JOIN → **they're in your lobby, on any phone**, no downloads, no accounts.
5. Tap READY UP → host taps START — countdown → you're fighting.

## Notes

- If your chosen URL dies or you move hosts later: nothing is stored server-side (progress is each player's localStorage), so redeploy the same code to a new host and keep playing from scratch.
- `PORT` env is already respected by `custom-server.mjs`.
- Health check endpoint for deployers: `GET /api/health`.
```
