import * as THREE from 'three'
import { formatLap } from '../game/HUD.js'

/**
 * The best laps, written on the six white strips of leaderboard.glb: rank,
 * name, time, one lap a strip, fastest at the top. Styled after the letters
 * on the sign over the ring, which are dark Neon 80s on a small texture drawn
 * with hard pixels (nearest filtering), so this is the same: a low-resolution
 * canvas, black text, no smoothing when it is magnified.
 */

/** How many laps the board has room for. */
export const LEADERBOARD_ROWS = 6

/**
 * The white panel (material sign_letters), in the board's own space: its
 * front face, and each strip's top and bottom edge, top strip first. The
 * grooves between strips are the gaps.
 */
const PANEL = {
    halfWidth: 2.369,
    front: 0.086,
    rows: [
        [1.181, 0.796],
        [0.769, 0.397],
        [0.371, 0.018],
        [-0.018, -0.371],
        [-0.397, -0.769],
        [-0.796, -1.181]
    ]
}
const PANEL_TOP = PANEL.rows[0][0]
const PANEL_BOTTOM = PANEL.rows[PANEL.rows.length - 1][1]

/** Just proud of the white, so the two never fight for the same depth. */
const LIFT = 0.002

/**
 * Canvas pixels across the panel. About the pixel size of the sign's
 * letters at this distance: coarse enough to read as pixels, fine enough
 * for a 16 character name and a time on one strip.
 */
const TEXTURE_WIDTH = 384
const TEXTURE_HEIGHT = Math.round(TEXTURE_WIDTH * (PANEL_TOP - PANEL_BOTTOM) / (PANEL.halfWidth * 2))

/** Of a strip's height. */
const TEXT_HEIGHT = 0.62
/** Canvas pixels in from each end of a strip. */
const MARGIN = 10
/** Room for "6." before the name. */
const RANK_WIDTH = 30

const FONT_FAMILY = '"Neon", sans-serif'
const INK = '#111111'

/** What each strip says, best lap first. Empty strips are left out. */
export function leaderboardLines(laps)
{
    return (laps ?? [])
        .filter((lap) => lap && typeof lap.name === 'string' && Number.isFinite(lap.seconds))
        .slice(0, LEADERBOARD_ROWS)
        .map((lap, index) => ({ rank: `${index + 1}.`, name: lap.name, time: formatLap(lap.seconds) }))
}

export class LeaderboardText
{
    constructor()
    {
        this.canvas = document.createElement('canvas')
        this.canvas.width = TEXTURE_WIDTH
        this.canvas.height = TEXTURE_HEIGHT
        this.context = this.canvas.getContext('2d')

        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.magFilter = THREE.NearestFilter
        this.texture.minFilter = THREE.LinearMipmapLinearFilter

        const width = PANEL.halfWidth * 2
        const height = PANEL_TOP - PANEL_BOTTOM
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshStandardMaterial({
                name: 'Leaderboard text',
                map: this.texture,
                // Hard-edged pixels, like the sign's letters: each one is ink or it is not.
                alphaTest: 0.5,
                // Matte ink. The white under it is glossy, and the sky's sheen
                // across it would wash out whichever end of the strip it lands on.
                roughness: 1,
                metalness: 0,
                envMapIntensity: 0
            })
        )
        this.mesh.name = 'leaderboard-text'
        this.mesh.position.set(0, (PANEL_TOP + PANEL_BOTTOM) / 2, PANEL.front + LIFT)
        this.mesh.receiveShadow = true

        this.lines = []
        this.#draw()

        // A canvas only draws a web font once it has loaded. Draw again when it has.
        document.fonts?.load(`20px ${FONT_FAMILY}`).then(() => this.#draw(), () => {})
    }

    /** Puts these laps on the board, replacing whatever was there. */
    show(laps)
    {
        this.lines = leaderboardLines(laps)
        this.#draw()
    }

    #draw()
    {
        const context = this.context
        context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
        context.fillStyle = INK
        context.textBaseline = 'middle'

        const toPixels = TEXTURE_HEIGHT / (PANEL_TOP - PANEL_BOTTOM)
        this.lines.forEach((line, index) =>
        {
            const [top, bottom] = PANEL.rows[index]
            const middle = (PANEL_TOP - (top + bottom) / 2) * toPixels
            let size = Math.floor((top - bottom) * toPixels * TEXT_HEIGHT)

            // A long name with a long time: shrink the whole strip until it fits.
            const room = TEXTURE_WIDTH - MARGIN * 2 - RANK_WIDTH
            const gap = size * 0.6
            context.font = `${size}px ${FONT_FAMILY}`
            const needed = context.measureText(line.name).width + gap + context.measureText(line.time).width
            if (needed > room)
            {
                size = Math.max(8, Math.floor(size * room / needed))
                context.font = `${size}px ${FONT_FAMILY}`
            }

            context.textAlign = 'left'
            context.fillText(line.rank, MARGIN, middle)
            context.fillText(line.name, MARGIN + RANK_WIDTH, middle)
            context.textAlign = 'right'
            context.fillText(line.time, TEXTURE_WIDTH - MARGIN, middle)
        })

        this.texture.needsUpdate = true
    }

    dispose()
    {
        this.mesh.geometry.dispose()
        this.mesh.material.dispose()
        this.texture.dispose()
    }
}
