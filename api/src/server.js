import { createServer } from 'node:http'
import { openDatabase } from './db.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT ?? 8787)
const DB_PATH = process.env.DB_PATH ?? new URL('../data/game.db', import.meta.url).pathname

const db = openDatabase(DB_PATH)
const server = createServer(createApp(db))

server.listen(PORT, () => console.log(`api listening on :${PORT}, database ${DB_PATH}`))

// docker stop sends SIGTERM: finish in-flight requests, then close the database cleanly.
for (const signal of ['SIGTERM', 'SIGINT'])
{
    process.on(signal, () =>
    {
        server.close(() =>
        {
            db.close()
            process.exit(0)
        })
    })
}
