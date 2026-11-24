# TODO — thebertgordon.com

Things deferred during the three.js merge (2026-11-18). Not urgent; do later.

## Deployment / infrastructure
- [x] Containerize the site — `compose.yaml`: `web` (nginx: game at `/`, portfolio at `/portfolio/`, `/api/` proxied) + `api` (Node + SQLite on the `game-data` volume)
- [ ] First real build on the Jetson: `docker compose up -d --build` (needs sudo or the `docker` group; never built yet)
- [ ] Automate startup on boot: `sudo systemctl enable docker` (containers use `restart: unless-stopped`), then retire `bert/workflow.sh`
- [ ] Fix `/etc/systemd/system/reverse-tunnel.service`: the second `[Unit]` header must be `[Install]`, otherwise `systemctl enable` does nothing and the tunnel never starts on boot
- [ ] Re-enable the reverse tunnel (currently inactive — site is down)
- [ ] Back up the `game-data` volume (player names + best laps) somewhere off the Jetson

## Assets
- [x] Draco decoder stays local on purpose (must match the three version): `tools/copy-draco.mjs` copies it from `node_modules/three` before every dev run and build
- [ ] Move unused 3D models into a git-ignored `unused/` folder (confirm which models are unused)

## Features
- [x] Database: first-come-first-served player names + best lap (`api/`, `threejs/src/game/PlayerName.js`)
- [x] Show the leaderboard in the game: top 6 on `leaderboard.glb`, fetched once on page load (`threejs/src/world/LeaderboardText.js`)
- [ ] Live leaderboard updates (Server-Sent Events from the API; nginx needs `proxy_buffering off` on that route, here and on EC2)
- [ ] Secret base placement (new table keyed on `players.id`, new entry in `api/src/db.js` MIGRATIONS)
- [ ] Name recovery: a cleared browser loses its token and the name with it
- [ ] Lap times are trusted from the browser — anyone can post a fake lap with their own token. Laps under 20 s are refused (and blow the elephant up in game); anything slower is still taken on trust
- [ ] Mobile / touch compatibility for the three.js game (currently needs keyboard + pointer lock)
- [x] Link from the three.js game to the portfolio ("portfolio" button on the name and paused screens, with the loading animation)
- [ ] (Maybe) portfolio project card linking to the game
