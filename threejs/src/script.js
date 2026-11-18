import { Game } from './game/Game.js'

// Never run the game inside a frame of itself (for example if /portfolio/ ever
// falls back to this page while it is being preloaded).
if (window.self === window.top)
{
    const canvas = document.querySelector('canvas.webgl')
    const game = new Game(canvas)

    // Testing panel: open the site with #debug on the end of the URL, then press `.
    if (location.hash === '#debug')
        import('./debug/Debug.js').then(({ Debug }) => new Debug(game))

    game.start()
}
