import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'

async function start()
{
    const server = createServer(createApp(openDatabase(':memory:')))
    await new Promise((resolve) => server.listen(0, resolve))
    const base = `http://localhost:${server.address().port}`
    const call = async (method, path, body) =>
    {
        const response = await fetch(base + path, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json() }
    }
    return { server, call }
}

test('names are first come, first served', async (t) =>
{
    const { server, call } = await start()
    t.after(() => server.close())

    const first = await call('POST', '/api/names', { name: '  Rob   G ' })
    assert.equal(first.status, 201)
    assert.equal(first.body.name, 'Rob G')
    assert.ok(first.body.token)

    // Same name, other case, no token: taken.
    const other = await call('POST', '/api/names', { name: 'rob g' })
    assert.equal(other.status, 409)

    // Same browser coming back with its token: fine, and no new token.
    const back = await call('POST', '/api/names', { name: 'ROB G', token: first.body.token })
    assert.equal(back.status, 200)
    assert.equal(back.body.token, undefined)

    const bad = await call('POST', '/api/names', { name: '<script>' })
    assert.equal(bad.status, 400)
})

test('best laps only improve, and need the token', async (t) =>
{
    const { server, call } = await start()
    t.after(() => server.close())

    const { body: { token } } = await call('POST', '/api/names', { name: 'Ann' })
    await call('POST', '/api/names', { name: 'Bo' }).then(async ({ body }) =>
        call('POST', '/api/laps', { name: 'Bo', token: body.token, seconds: 50 }))

    assert.equal((await call('POST', '/api/laps', { name: 'Ann', token: 'nope', seconds: 40 })).status, 403)
    assert.equal((await call('POST', '/api/laps', { name: 'Ann', token, seconds: -3 })).status, 400)

    let lap = await call('POST', '/api/laps', { name: 'Ann', token, seconds: 42.5 })
    assert.deepEqual(lap.body, { best: 42.5, improved: true })
    lap = await call('POST', '/api/laps', { name: 'ann', token, seconds: 45 })
    assert.deepEqual(lap.body, { best: 42.5, improved: false })
    lap = await call('POST', '/api/laps', { name: 'Ann', token, seconds: 41 })
    assert.deepEqual(lap.body, { best: 41, improved: true })

    const board = await call('GET', '/api/leaderboard?limit=5')
    assert.deepEqual(board.body.laps, [{ name: 'Ann', seconds: 41 }, { name: 'Bo', seconds: 50 }])
})

test('laps under 20 seconds are refused and never reach the board', async (t) =>
{
    const { server, call } = await start()
    t.after(() => server.close())

    const { body: { token } } = await call('POST', '/api/names', { name: 'Cy' })

    const fast = await call('POST', '/api/laps', { name: 'Cy', token, seconds: 19.99 })
    assert.equal(fast.status, 400)
    assert.equal(fast.body.error, 'Too fast to be real.')
    assert.deepEqual((await call('GET', '/api/leaderboard')).body.laps, [])

    const edge = await call('POST', '/api/laps', { name: 'Cy', token, seconds: 20 })
    assert.deepEqual(edge.body, { best: 20, improved: true })
})
