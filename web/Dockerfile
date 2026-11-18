# The public site: the three.js game at /, the Astro portfolio at /portfolio/,
# and /api/ forwarded to the api container. Build from the repo root:
#   docker compose build web

# ---- the game (Vite) --------------------------------------------------------
FROM node:22-alpine AS game
WORKDIR /build/threejs
COPY threejs/package.json threejs/package-lock.json ./
RUN npm ci
COPY threejs/ ./
RUN npm run build

# ---- the portfolio (Astro, static, base /portfolio) -------------------------
FROM node:22-alpine AS portfolio
WORKDIR /build/bert
COPY bert/package.json bert/package-lock.json ./
RUN npm ci
COPY bert/ ./
RUN npm run build

# ---- nginx ------------------------------------------------------------------
FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=game /build/threejs/dist/ /usr/share/nginx/html/
COPY --from=portfolio /build/bert/dist/ /usr/share/nginx/html/portfolio/
