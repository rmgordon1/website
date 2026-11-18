# Player names and best laps for the game. No npm dependencies: node:http and
# the built-in node:sqlite. The database lives on the game-data volume.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/game.db
COPY package.json ./
COPY src/ ./src/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
