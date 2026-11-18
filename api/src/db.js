import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Opens (and if needed creates) the SQLite database.
 *
 * Tables:
 *   players    one row per claimed name. name_key is the name folded for
 *              comparison (case and accents), so "Rob" and "rob" are one name.
 *              token_hash is a SHA-256 of the secret the claiming browser holds.
 *   best_laps  each player's best lap, in seconds.
 *
 * New features (secret base placement, settings, ...) get their own tables
 * keyed on players.id, added as a new entry in MIGRATIONS.
 */
const MIGRATIONS = [
    `CREATE TABLE players (
        id          INTEGER PRIMARY KEY,
        name_key    TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        token_hash  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE best_laps (
        player_id   INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        seconds     REAL NOT NULL,
        set_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX best_laps_seconds ON best_laps(seconds);`
]

export function openDatabase(path)
{
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

    const db = new DatabaseSync(path)
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')

    // user_version counts the migrations already applied.
    const applied = db.prepare('PRAGMA user_version').get().user_version
    for (let i = applied; i < MIGRATIONS.length; i++)
    {
        db.exec('BEGIN')
        try
        {
            db.exec(MIGRATIONS[i])
            db.exec(`PRAGMA user_version = ${i + 1}`)
            db.exec('COMMIT')
        }
        catch (error)
        {
            db.exec('ROLLBACK')
            throw error
        }
    }

    return db
}
