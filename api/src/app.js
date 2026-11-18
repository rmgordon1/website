import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The game's API. Same rules as threejs/src/game/PlayerName.js, so the
 * server and the name screen agree on what a name is.
 *
 *   GET  /api/health                   -> { ok: true }
 *   POST /api/names   { name, token? } -> 201 { name, token } claimed
 *                                         200 { name } already yours
 *                                         409 { error } someone else's
 *   POST /api/laps    { name, token, seconds } -> 200 { best, improved }
 *   GET  /api/leaderboard?limit=10     -> { laps: [{ name, seconds }] }
 */

export const NAME_MAX = 16
const ALLOWED = /^[\p{L}\p{N} ._-]+$/u
/** Anything outside this is not a real lap. */
const LAP_MIN_SECONDS = 1
const LAP_MAX_SECONDS = 60 * 60
const BODY_LIMIT = 4 * 1024

export function tidyName(raw)
{
    return String(raw ?? '').trim().replace(/\s+/g, ' ')
}

export function nameKey(name)
{
    return tidyName(name).normalize('NFKC').toLocaleLowerCase()
}

function nameProblem(name)
{
    if (!name) return 'Type a name first.'
    if ([...name].length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`
    if (!ALLOWED.test(name)) return 'Letters, numbers, spaces, and - _ . only.'
    return null
}

const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')

function tokenMatches(token, storedHash)
{
    if (typeof token !== 'string' || !token) return false
    const a = Buffer.from(hashToken(token), 'hex')
    const b = Buffer.from(storedHash, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
}

class HttpError extends Error
{
    constructor(status, message)
    {
        super(message)
        this.status = status
    }
}

/** Returns a (request, response) handler bound to `db`. */
export function createApp(db)
{
    const findPlayer = db.prepare('SELECT id, name, token_hash FROM players WHERE name_key = ?')
    const insertPlayer = db.prepare('INSERT INTO players (name_key, name, token_hash) VALUES (?, ?, ?)')
    const findBest = db.prepare('SELECT seconds FROM best_laps WHERE player_id = ?')
    const upsertBest = db.prepare(`
        INSERT INTO best_laps (player_id, seconds) VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE
            SET seconds = excluded.seconds, set_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE excluded.seconds < best_laps.seconds`)
    const leaderboard = db.prepare(`
        SELECT players.name AS name, best_laps.seconds AS seconds
        FROM best_laps JOIN players ON players.id = best_laps.player_id
        ORDER BY best_laps.seconds ASC, best_laps.set_at ASC
        LIMIT ?`)

    function claim({ name: raw, token })
    {
        const name = tidyName(raw)
        const problem = nameProblem(name)
        if (problem) throw new HttpError(400, problem)

        const key = nameKey(name)
        const existing = findPlayer.get(key)
        if (existing)
        {
            if (tokenMatches(token, existing.token_hash)) return [200, { name: existing.name }]
            throw new HttpError(409, 'That name is taken. Try another.')
        }

        const fresh = randomBytes(32).toString('base64url')
        try
        {
            insertPlayer.run(key, name, hashToken(fresh))
        }
        catch (error)
        {
            // Two browsers claiming the same name at the same moment: the second one loses.
            if (String(error?.message).includes('UNIQUE')) throw new HttpError(409, 'That name is taken. Try another.')
            throw error
        }
        return [201, { name, token: fresh }]
    }

    function lap({ name, token, seconds })
    {
        const player = findPlayer.get(nameKey(name))
        if (!player || !tokenMatches(token, player.token_hash)) throw new HttpError(403, 'Not your name.')

        const time = Number(seconds)
        if (!Number.isFinite(time) || time < LAP_MIN_SECONDS || time > LAP_MAX_SECONDS)
            throw new HttpError(400, 'Not a lap time.')

        const before = findBest.get(player.id)?.seconds ?? null
        upsertBest.run(player.id, time)
        const best = findBest.get(player.id).seconds
        return [200, { best, improved: before === null || best < before }]
    }

    function top(url)
    {
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '10', 10) || 10))
        return [200, { laps: leaderboard.all(limit) }]
    }

    return async function handle(request, response)
    {
        const url = new URL(request.url, 'http://localhost')
        const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`

        try
        {
            let result
            switch (route)
            {
                case 'GET /api/health': result = [200, { ok: true }]; break
                case 'GET /api/leaderboard': result = top(url); break
                case 'POST /api/names': result = claim(await readJson(request)); break
                case 'POST /api/laps': result = lap(await readJson(request)); break
                default: throw new HttpError(404, 'Not found.')
            }
            send(response, ...result)
        }
        catch (error)
        {
            if (error instanceof HttpError) return send(response, error.status, { error: error.message })
            console.error(error)
            send(response, 500, { error: 'Something went wrong.' })
        }
    }
}

async function readJson(request)
{
    if (!String(request.headers['content-type'] ?? '').includes('application/json'))
        throw new HttpError(415, 'Send JSON.')

    let size = 0
    const chunks = []
    for await (const chunk of request)
    {
        size += chunk.length
        if (size > BODY_LIMIT) throw new HttpError(413, 'Too big.')
        chunks.push(chunk)
    }

    try
    {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!body || typeof body !== 'object') throw new Error()
        return body
    }
    catch
    {
        throw new HttpError(400, 'Bad JSON.')
    }
}

function send(response, status, body)
{
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    })
    response.end(JSON.stringify(body))
}
