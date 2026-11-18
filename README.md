# thebertgordon.com

| Folder | What | Served at |
| --- | --- | --- |
| `threejs/` | The three.js game (Vite). Visitors land here. | `/` |
| `bert/` | The art portfolio (Astro, static, `base: '/portfolio'`). | `/portfolio/` |
| `api/` | Player names and best laps (Node, built-in SQLite, no dependencies). | `/api/` |
| `web/` | nginx config and the Dockerfile that builds the game and portfolio into one image. | |

Models, textures and media come from CloudFront (`dx09qkoz6th2f.cloudfront.net`).

## Running it (production, on the Jetson)

```bash
docker compose up -d --build   # build and start, or update after a git pull
docker compose logs -f
docker compose down            # stop; the database volume (game-data) is kept
```

The web container listens on `localhost:3000`, where `reverse-tunnel.service`
already forwards EC2's port 8080. Nothing changes on EC2.

## Running it locally

### What you need

- **Node 22.13 or newer** (`node --version`). The API uses Node's built-in SQLite.
- **Docker** only for the production-style run below. If `docker` says
  "permission denied", run `sudo usermod -aG docker $USER`, then log out and back in.

### First time only: install dependencies

```bash
cd ~/website/threejs && npm install
cd ~/website/bert && npm install
```

The API has no dependencies, so there's nothing to install for it.

### Option A: development (live reload)

Use this while editing code. Open three terminals:

```bash
# 1. API — names and best laps, on http://localhost:8787
cd ~/website/api && npm run dev

# 2. Game — Vite, on http://localhost:5173 (sends /api to the API above)
cd ~/website/threejs && npm run dev

# 3. Portfolio — Astro, on http://localhost:3000/portfolio/
cd ~/website/bert && npm run dev
```

Then open **http://localhost:5173** (Vite also prints a network address you can open from other devices).

- The game reloads on save, and so does the portfolio.
- In dev, the game's "portfolio" button goes to the Astro server on port 3000,
  so terminal 3 must be running for the button to work.
- The game works without the API (terminal 1). Names just aren't checked and laps aren't saved.
- The dev database is `api/data/game.db` (git-ignored). Delete it to start fresh.
- `npm run dev` and `npm run build` in `threejs/` copy the Draco decoder from
  `node_modules/three` into `static/draco/` first, so it always matches the three version.

### Option B: the real thing, locally (Docker)

Use this to check exactly what the live site will serve: nginx with the game at `/`,
the portfolio at `/portfolio/`, and the API at `/api/`.

```bash
cd ~/website
docker compose up -d --build
```

Open **http://localhost:3000**. Stop it with `docker compose down`.

Port 3000 is shared with the portfolio's dev server (Option A, terminal 3).
Stop one before starting the other.

### Tests

```bash
cd ~/website/threejs && npm test   # game maths and controllers
cd ~/website/api && npm test       # names and best laps
```
