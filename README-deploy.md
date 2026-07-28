# Hosting BRETWALDA so ANYONE can join from a group chat

The sandbox preview URL (where YOU built it) is private — the platform only lets you open it. To let friends join, host the game at any public Node.js host. Here are the three easiest paths — they all take under 3 minutes.

> The game is fully self-contained: Next.js + WebSocket + HTTP/SSE fallback run in ONE process on ONE port. No database, no external services, no env vars required for the game to work.

## Option A — Railway (recommended, free tier is enough)

1. Push this repo to GitHub (or use this zip).
2. Go to https://railway.app → New Project → Deploy from GitHub → select repo.
3. Railway auto-detects Node 20 and runs:
   - build: `npm ci && npm run build`
   - start: `npm start` (this starts `custom-server.mjs` which serves HTTP+WS on the PORT Railway gives it)
4. After deploy, Railway shows a public URL like `https://bretwalda-production.up.railway.app` — **drop THAT link in your group chat**. No config needed.

## Option B — Render

1. Push to GitHub, then on https://render.com → New → Web Service → connect repo.
2. Settings:
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
   - Node version: 20
3. Hit Deploy — you get a `.onrender.com` URL → that's your group-chat link.

## Option C — Docker (Fly.io, DigitalOcean, your own VPS)

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
