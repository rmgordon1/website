import { API_BASE } from '../config.js'

/**
 * The name a player goes by, first come first served.
 *
 * The first browser to play as a name claims it on the server (api/) and is
 * handed a secret token, kept here in localStorage. Anything saved under the
 * name later (best laps, and more to come) sends that token, so only that
 * browser can write to it. Clearing site data loses the token, and the name
 * with it, until there is some way to recover one.
 */

export const NAME_MAX = 16
const STORAGE_KEY = 'playerName'
/** { [nameKey]: token } for every name this browser has claimed. */
const TOKENS_KEY = 'playerTokens'

/** Letters (any alphabet), digits, spaces, and - _ . */
const ALLOWED = /^[\p{L}\p{N} ._-]+$/u

/** Trims and collapses runs of spaces, so "  Rob   G " and "Rob G" are the same name. */
export function tidyName(raw)
{
    return String(raw ?? '').trim().replace(/\s+/g, ' ')
}

/** Null when the name is fine, otherwise what is wrong with it. */
export function nameProblem(name)
{
    if (!name) return 'Type a name first.'
    if ([...name].length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`
    if (!ALLOWED.test(name)) return 'Letters, numbers, spaces, and - _ . only.'
    return null
}

/**
 * Two spellings that should count as one name on the server: case and
 * accents ignored, so "rob" cannot sit next to "Rob" on the leaderboard.
 */
export function nameKey(name)
{
    return tidyName(name).normalize('NFKC').toLocaleLowerCase()
}

/** The name used last time on this browser, or ''. */
export function rememberedName()
{
    try
    {
        return localStorage.getItem(STORAGE_KEY) ?? ''
    }
    catch
    {
        return ''
    }
}

export function rememberName(name)
{
    try
    {
        localStorage.setItem(STORAGE_KEY, name)
    }
    catch
    {
        // Private windows and blocked storage: they just type it again next time.
    }
}

function readTokens()
{
    try
    {
        return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}') ?? {}
    }
    catch
    {
        return {}
    }
}

function tokenFor(name)
{
    return readTokens()[nameKey(name)] ?? null
}

function saveToken(name, token)
{
    try
    {
        const tokens = readTokens()
        tokens[nameKey(name)] = token
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
    }
    catch
    {
        // Blocked storage: the claim holds on the server, but this browser cannot prove it later.
    }
}

async function post(path, body)
{
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => ({}))
    return { status: response.status, data }
}

/**
 * Asks whether this browser may play as `name`. A free name is claimed and
 * its token kept; a name this browser already holds is fine; a name someone
 * else holds comes back with a reason. If the server cannot be reached the
 * answer is yes, so the game still plays offline (nothing is saved).
 *
 * @returns {Promise<{ ok: true, offline?: boolean } | { ok: false, reason: string }>}
 */
export async function claimName(name)
{
    try
    {
        const { status, data } = await post('/names', { name, token: tokenFor(name) })
        if (status === 409) return { ok: false, reason: data.error ?? 'That name is taken. Try another.' }
        if (status === 400) return { ok: false, reason: data.error ?? 'That name cannot be used.' }
        if (status !== 200 && status !== 201) return { ok: true, offline: true }

        if (data.token) saveToken(name, data.token)
        return { ok: true }
    }
    catch
    {
        return { ok: true, offline: true }
    }
}

/**
 * Sends a finished lap. Returns the name's best time and whether this lap
 * beat it, or null when there is nothing to send with (no token) or the
 * server cannot be reached.
 *
 * @returns {Promise<{ best: number, improved: boolean } | null>}
 */
export async function submitLap(name, seconds)
{
    const token = name && tokenFor(name)
    if (!token) return null

    try
    {
        const { status, data } = await post('/laps', { name, token, seconds })
        return status === 200 ? data : null
    }
    catch
    {
        return null
    }
}
