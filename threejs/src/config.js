/**
 * Where models, textures and the environment map are served from.
 *
 * They live in S3 behind the same CloudFront distribution as the portfolio's
 * media (bert/src/config/site.ts). They are no longer in static/; the
 * originals are in the three.js_demo repo's history (before commit 4cdb99e).
 * To load them locally, put those folders back into static/ and set
 * VITE_ASSET_BASE='' in a .env.local.
 */
export const ASSET_BASE = import.meta.env?.VITE_ASSET_BASE ?? 'https://dx09qkoz6th2f.cloudfront.net'

/** Absolute URL for an asset path such as '/models/brick.glb'. */
export function assetUrl(path)
{
    return `${ASSET_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * The Draco decoder (main_castle.glb and leaderboard.glb need it). Served
 * locally on purpose, not from CloudFront: it has to match the three
 * version, so tools/copy-draco.mjs copies it out of node_modules/three into
 * static/draco/ before every dev run and build.
 */
export const DRACO_PATH = import.meta.env?.VITE_DRACO_PATH ?? '/draco/'

/**
 * The portfolio. In production nginx serves it next to the game, at
 * /portfolio/. In `npm run dev` there is no portfolio on Vite's server, so
 * it points at the Astro dev server (`npm run dev` in bert/, port 3000).
 */
export const PORTFOLIO_URL = import.meta.env?.VITE_PORTFOLIO_URL
    ?? (import.meta.env?.DEV ? `http://${location.hostname}:3000/portfolio/` : '/portfolio/')

/**
 * The game's API (player names and best laps). nginx forwards /api/ to the
 * api container; vite.config.js does the same in dev.
 */
export const API_BASE = import.meta.env?.VITE_API_BASE ?? '/api'
