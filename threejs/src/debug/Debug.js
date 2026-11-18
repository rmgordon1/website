import GUI from 'lil-gui'
import { Game } from '../game/Game.js'

/** Shows and hides the panel. It sits under Esc on most keyboards. */
const TOGGLE_KEY = 'Backquote'

/**
 * Testing panel. Loaded only when the page URL ends in #debug, so normal
 * visitors never download it. Press ` to open it; that frees the mouse so
 * the buttons can be clicked, and "resume" goes back to the game.
 */
export class Debug
{
    constructor(game)
    {
        this.game = game
        this.gui = new GUI({ title: 'Debug  ( ` to hide )' })
        this.gui.hide()

        const teleport = this.gui.addFolder('Teleport')
        for (const place of Game.DEBUG_PLACES)
            teleport.add({ go: () => this.#run(() => game.debugTeleport(place)) }, 'go').name(place)

        const race = this.gui.addFolder('Race')
        race.add({ finish: () => this.#run(() => game.debugFinishLap()) }, 'finish').name('Finish lap')

        // Nothing is saved between visits, so a reload puts every brick, ring,
        // lap time, the elephant and the submarine back as they were.
        // Reloading keeps #debug on the URL, so this panel comes back too.
        this.gui.add({ reset: () => location.reload() }, 'reset').name('Reset everything')

        window.addEventListener('keydown', (event) =>
        {
            if (event.code !== TOGGLE_KEY || event.repeat) return
            event.preventDefault()

            if (this.gui._hidden)
            {
                this.gui.show()
                document.exitPointerLock()
            }
            else this.gui.hide()
        })
    }

    /** Runs an action and shows its refusal, if any, in the game's notice line. */
    #run(action)
    {
        const problem = action()
        this.game.hud.setNotice(problem ?? 'Done. Press resume to play.')
    }
}
