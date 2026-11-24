import * as THREE from 'three'
import { createGLTFLoader } from './gltfLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { ReentryFire } from './ReentryFire.js'
import { assetUrl } from '../config.js'
import { loadCloud } from './Cloud.js'
import { simplifyByClustering } from './simplifyByClustering.js'

/** The outer castles. Served out of static/. */
const RING_URL = assetUrl('/models/triple_castle.glb')

/** The castle you start in. Same export units as the ring, so it takes the same scale. */
const MAIN_URL = assetUrl('/models/main_castle.glb')
const LEADERBOARD_URL = assetUrl('/models/leaderboard.glb')

/**
 * Hung in the main courtyard's ring. The file is already in that castle's
 * units: the hull runs through the opening, and the crown of the hull meets
 * the two chains that drop from `sub_stand` on either side of the sail.
 */
const SUBMARINE_URL = assetUrl('/models/submarine.glb')
/** Horizontal metres from the hatch before it starts to open. */
const HATCH_REACH = 2.8
/** Closer than the open radius: standing at the lip, able to step in. */
const BOARD_REACH = 1.8
/** Vertical metres. The court below the hole is farther than this. */
const HATCH_REACH_Y = 2.5
/** Dive picks up speed, in world metres per second. */
const DESCENT_ACCEL = 2.4
const DESCENT_MAX = 8
/** The ivory shell under the court, along the drop. World metres. */
const CLOUD_TOP = -4
const CLOUD_BOTTOM = -46
/** A harder push while the hull is inside that shell. */
const CLOUD_ACCEL = 16
const CLOUD_MAX = 40
/** Seconds of the overhead view before the cut to the cloud. */
const PLUNGE_AFTER = 3
/** Bow along the hull's length, pitched onto world down. */
const NOSE_DOWN = -Math.PI / 2
/** Seconds after she clears the underside before the nose catches. */
const REENTRY_AFTER = 1.5
/** How long the catch takes to reach a full burn. */
const REENTRY_RAMP = 0.8

/**
 * Lamps along the empty hull, in the export's units. The castle's scale
 * carries the positions into the world. `distance` stays in world metres.
 * The paint is dark, so each lamp is strong enough to read from the hatch.
 */
const DISCO_X = [-1.6, -0.75, 0.09, 0.95, 1.7]
const DISCO_Y = -0.08
const DISCO_Z = -2.314
const DISCO_INTENSITY = 48
const DISCO_DISTANCE = 8
/** Hue turns per second. The lamps stay a rainbow apart. */
const DISCO_SPEED = 0.18

/**
 * Measured off triple_castle.glb in the export's own units, then multiplied
 * by SCALE. The arched door is on the +Z face, and the metal base runs out
 * past it as a walkway (about x ±0.6, z 3 to 5.6 before scaling).
 */
export const SCALE = 5

/** Walkable top of the ring castle's metal base, in model units. */
const MODEL_DECK_Y = -0.308

export const DECK_Y = MODEL_DECK_Y * SCALE

/**
 * The starting castle, in the export's units. The metal court is the floor.
 * The wooden door is a plank running out from the +Z face.
 */
const MAIN_MODEL_DECK_Y = -0.534034
const MAIN_DECK_Y = MAIN_MODEL_DECK_Y * SCALE
const MAIN_COURT = { minX: -8.088937, maxX: 8.088937, minZ: -8.073280, maxZ: 8.073280 }
const MAIN_DOOR = {
    minX: -1.202637,
    maxX: 1.247376,
    minZ: 7.281567,
    maxZ: 10.513672,
    /** Top of the plank, a little above the metal court. */
    y: -0.513393
}

/**
 * The round opening in the court, in model units. A stair on the +Z side
 * climbs to a narrow platform; the rest of the disc is empty. Measured
 * collision inside `clear` (risers, the ring floor) is left out. Rails keep
 * the stair and landing from being a drop, and the stone lip is a wall.
 */
const MAIN_RING = { z: -2.3, radius: 3.4, clear: 4.05 }

/** Top of the stone lip that rings the opening. */
const MAIN_LIP_Y = -0.295625

/** Tread tops, in model units. Each run is about a tenth deep and a tenth tall. */
const MAIN_TREADS = [
    [-0.436495, 0.9579, 1.0589],
    [-0.341502, 0.8579, 0.9534],
    [-0.241502, 0.7579, 0.8534],
    [-0.141502, 0.6579, 0.7534],
    [-0.048261, 0.5516, 0.6557],
    [0.049278, 0.4490, 0.5499],
    [0.144271, 0.3490, 0.4445],
    [0.244271, 0.2490, 0.3445],
    [0.344271, 0.1490, 0.2445]
]

/** The landing the stair reaches. Same width as the treads. */
const MAIN_PLATFORM = { y: 0.437512, minX: -0.648, maxX: 0.648, minZ: -2.1492, maxZ: 0.1467 }

/** On the court, a short way in front of that stair. */
const MAIN_SPAWN_Z = 1.55

/** Beside each outer walkway, where she waits after a dismount there. */
const RING_ELEPHANT = new THREE.Vector3(4.725, DECK_Y - 2.9, 4.275 * SCALE)

export const CASTLE = {
    deckY: MAIN_DECK_Y,
    /** Just in front of the steps, on the court, facing them. */
    spawn: new THREE.Vector3(0, MAIN_DECK_Y, MAIN_SPAWN_Z * SCALE),
    /**
     * Yaw 0 looks down -Z, toward the steps and the ring.
     */
    spawnYaw: 0,
    /**
     * Off the door's +X edge, about halfway along it, trunk pointing out.
     * Clear of both the plank and the court, so she stays sunk beside them.
     */
    elephant: new THREE.Vector3(
        MAIN_DOOR.maxX * SCALE + 2.2,
        MAIN_DECK_Y - 2.9,
        (MAIN_DOOR.minZ + MAIN_DOOR.maxZ) * 0.5 * SCALE
    ),
    elephantYaw: 0
}

/**
 * The leaderboard, in the main castle's export units (same as the sign over
 * the ring, which it is styled after). It hangs on the inside of the gate
 * wall, left of the drawbridge as seen from the courtyard (local +X), facing
 * in. That stretch of wall is flat from the gate jamb (x 1.25) to where it
 * turns into the corner (x 6); the board is scaled to sit inside it and
 * under the windows (y 2.5). Its back is 0.086 behind its origin.
 */
const LEADERBOARD = {
    x: 3.75,
    y: 0.73,
    z: 6.512 - 0.086 * 0.8 - 0.01,
    /** Face the courtyard (the model's front is +Z). */
    yaw: Math.PI,
    scale: 0.8,
    /** Half extents of the board itself before scaling. */
    halfWidth: 2.572,
    halfHeight: 1.384,
    depth: 0.293
}

/**
 * Door bearing of the starting castle. Local +Z is the door, and this turns
 * it to world -X, west, toward the rings. Image-left on the floor plan.
 */
export const MAIN_YAW = -Math.PI / 2

/**
 * The two triple castles on the floor plan, north and south of the open
 * court to the west. The main castle stays at the origin. Each door
 * (local +Z) points at the other castle. The same half-metre-per-pixel
 * scale as the rings.
 */
export const CASTLE_RING = [
    { x: -151, z: -100, yaw: 0 },
    { x: -151, z: 100, yaw: Math.PI }
]

/**
 * [minX, maxX, minZ, maxZ] of the metal deck, in model units. Slices follow
 * the top, including the rim beside the elephant. The old straight inset
 * ended inside that rim, so a step toward her fell through the mesh.
 */
const DECK_FOOTPRINT = [
    [-2.65, 2.65, -1.15, -0.96],
    [-3.01, 3.01, -1.04, -0.76],
    [-3.16, 3.16, -0.84, -0.56],
    [-3.26, 3.26, -0.64, -0.36],
    [-3.34, 3.34, -0.44, 0.24],
    [-3.26, 3.26, 0.16, 0.64],
    [-3.16, 3.16, 0.56, 0.84],
    [-3.01, 3.01, 0.76, 1.04],
    [-2.65, 2.65, 0.96, 1.24],
    [-2.41, 2.41, 1.16, 1.44],
    [-2.34, 2.34, 1.36, 1.64],
    [-2.22, 2.22, 1.56, 1.84],
    [-2.10, 2.10, 1.76, 2.04],
    [-1.94, 1.94, 1.96, 2.24],
    [-1.78, 1.78, 2.16, 2.44],
    [-1.62, 1.62, 2.36, 2.52],
    [-1.50, 1.50, 2.48, 2.64],
    [-1.36, 1.36, 2.60, 2.74],
    [-1.16, 1.16, 2.70, 2.84],
    [-1.02, 1.02, 2.80, 2.92],
    [-0.86, 0.86, 2.88, 2.94],
    [-0.74, 0.74, 2.92, 2.98],
    [-0.66, 0.66, 2.96, 3.04],
    [-0.62, 0.62, 3.02, 5.58]
]

/**
 * The clouds under the courts, built at load from copies of one puff (see
 * Cloud.js). Fitted to the clouds that used to be baked into the castle
 * exports: the same number of puffs, filling the court's plan, over the same
 * heights and with the same puff sizes, in model units. The main cloud's
 * band is what CLOUD_TOP and CLOUD_BOTTOM are set against.
 */
export const CLOUD_LAYOUT = {
    main: {
        name: 'main',
        seed: 0x5eed01,
        count: 1577,
        footprint: [[MAIN_COURT.minX, MAIN_COURT.maxX, MAIN_COURT.minZ, MAIN_COURT.maxZ]],
        bottom: -7.22,
        top: -2.3,
        puff: [1.2, 1.8],
        rise: 0.3,
        taper: 0.1,
        rim: 1,
        lift: 0.4
    },
    ring: {
        name: 'ring',
        seed: 0x5eed02,
        count: 454,
        // The deck, without the walkway out of the arch.
        footprint: DECK_FOOTPRINT.filter((box) => box[3] <= 3.04),
        bottom: -2.38,
        top: -0.8,
        puff: [0.4, 0.6],
        rise: 1.4,
        taper: 0,
        rim: 0.5,
        lift: 0.5
    }
}

/**
 * Four treads in the middle of the front face, model units. Each one
 * overlaps the next so there is no crack to fall through. The top tread
 * meets the courtyard, which is a step higher again.
 */
const STAIR_TREADS = [
    [-0.22, -0.74, 0.74, 2.80, 3.04],
    [-0.12, -0.74, 0.74, 2.70, 2.94],
    [-0.02, -0.74, 0.74, 2.60, 2.84],
    [0.08, -0.74, 0.74, 2.42, 2.74]
]

/** Stone masses until the mesh arrives and the real walls are measured. */
const WALL_FOOTPRINT = [
    [-3.45, -0.72, -1.2, 2.95],
    [0.72, 3.45, -1.2, 2.95],
    [-1.02, 1.02, 1.24, 1.37]
]

/** World metres. Small enough that a single stair tread still owns a cell. */
const FLOOR_CELL = 0.42

/** Courtyard and steps sit in this band above the metal deck. Parapet caps are higher. */
const RAISED_MIN = 0.3
const RAISED_MAX = 3.15

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _hatchPoint = new THREE.Vector3()

function raisedBox(modelY, minX, maxX, minZ, maxZ)
{
    const y = modelY * SCALE
    return new THREE.Box3(
        new THREE.Vector3(minX * SCALE, y - 1.2, minZ * SCALE),
        new THREE.Vector3(maxX * SCALE, y, maxZ * SCALE)
    )
}

/**
 * Barycentric height of an xz point on a triangle, or null if it misses.
 * A small margin keeps cells that only graze an edge.
 */
function triangleHeight(px, pz, a, b, c)
{
    const v0x = b.x - a.x
    const v0z = b.z - a.z
    const v1x = c.x - a.x
    const v1z = c.z - a.z
    const v2x = px - a.x
    const v2z = pz - a.z
    const dot00 = v0x * v0x + v0z * v0z
    const dot01 = v0x * v1x + v0z * v1z
    const dot02 = v0x * v2x + v0z * v2z
    const dot11 = v1x * v1x + v1z * v1z
    const dot12 = v1x * v2x + v1z * v2z
    const denom = dot00 * dot11 - dot01 * dot01
    if (Math.abs(denom) < 1e-8) return null

    const inverse = 1 / denom
    const u = (dot11 * dot02 - dot01 * dot12) * inverse
    const v = (dot00 * dot12 - dot01 * dot02) * inverse
    if (u < -0.04 || v < -0.04 || u + v > 1.04) return null

    const w = 1 - u - v
    return a.y * w + b.y * u + c.y * v
}

/**
 * The cheek walls sit just beside the treads. Cells here stay empty so a
 * riser cannot shove the player back off the step they are climbing.
 */
function stairSlot(x, z)
{
    return Math.abs(x) < 0.9 * SCALE && z > 2.30 * SCALE && z < 3.28 * SCALE
}

/**
 * Courtyard floor and the walls around it, in the castle group's own space.
 * The metal deck stays as the authored platforms; this only adds the surfaces
 * above it. `space` is that group, so a rotated copy still measures upright.
 */
export function measureCastleCollision(root, space = null, options = {})
{
    const deckY = options.deckY ?? DECK_Y
    const stairs = options.stairs !== false
    const sealDoor = options.sealDoor !== false
    const floors = new Map()
    const walls = new Map()
    const intoLocal = new THREE.Matrix4()

    root.updateWorldMatrix(true, true)
    if (space)
    {
        space.updateWorldMatrix(true, false)
        intoLocal.copy(space.matrixWorld).invert()
    }

    root.traverse((child) =>
    {
        if (!child.isMesh) return

        const materialName = child.material?.name ?? ''
        if (materialName.includes('Ivory') || materialName.includes('Metal Base')) return

        const position = child.geometry.attributes.position
        const index = child.geometry.index
        if (!position) return

        const triangleCount = index ? index.count / 3 : position.count / 3

        for (let triangle = 0; triangle < triangleCount; triangle++)
        {
            const ia = index ? index.getX(triangle * 3) : triangle * 3
            const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
            const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2

            _a.fromBufferAttribute(position, ia).applyMatrix4(child.matrixWorld)
            _b.fromBufferAttribute(position, ib).applyMatrix4(child.matrixWorld)
            _c.fromBufferAttribute(position, ic).applyMatrix4(child.matrixWorld)
            if (space)
            {
                _a.applyMatrix4(intoLocal)
                _b.applyMatrix4(intoLocal)
                _c.applyMatrix4(intoLocal)
            }

            _ab.subVectors(_b, _a)
            _ac.subVectors(_c, _a)
            const normal = _ab.cross(_ac)
            const length = normal.length()
            if (length < 1e-8) continue

            const ny = normal.y / length
            const minX = Math.min(_a.x, _b.x, _c.x)
            const maxX = Math.max(_a.x, _b.x, _c.x)
            const minY = Math.min(_a.y, _b.y, _c.y)
            const maxY = Math.max(_a.y, _b.y, _c.y)
            const minZ = Math.min(_a.z, _b.z, _c.z)
            const maxZ = Math.max(_a.z, _b.z, _c.z)

            if (ny > 0.72)
            {
                const aboveDeck = maxY - deckY
                if (aboveDeck < RAISED_MIN || aboveDeck > RAISED_MAX) continue

                const xStart = Math.floor(minX / FLOOR_CELL) * FLOOR_CELL + FLOOR_CELL * 0.5
                const zStart = Math.floor(minZ / FLOOR_CELL) * FLOOR_CELL + FLOOR_CELL * 0.5

                for (let x = xStart; x <= maxX; x += FLOOR_CELL)
                {
                    for (let z = zStart; z <= maxZ; z += FLOOR_CELL)
                    {
                        const height = triangleHeight(x, z, _a, _b, _c)
                        if (height === null) continue
                        if (height - deckY < RAISED_MIN || height - deckY > RAISED_MAX) continue

                        const key = `${Math.round(x / FLOOR_CELL)},${Math.round(z / FLOOR_CELL)}`
                        const previous = floors.get(key)
                        if (previous === undefined || height > previous) floors.set(key, height)
                    }
                }
            }
            else if (Math.abs(ny) < 0.65 && maxY > deckY + 0.15)
            {
                // Fill the triangle, not just its edges. A door leaf is a few
                // large faces, and walking the outline left the middle open.
                const mark = (x, z) =>
                {
                    if (stairs && stairSlot(x, z)) return

                    const key = `${Math.round(x / FLOOR_CELL)},${Math.round(z / FLOOR_CELL)}`
                    const previous = walls.get(key)
                    if (!previous) walls.set(key, { minY, maxY, minX: x, maxX: x, minZ: z, maxZ: z })
                    else
                    {
                        previous.minY = Math.min(previous.minY, minY)
                        previous.maxY = Math.max(previous.maxY, maxY)
                        previous.minX = Math.min(previous.minX, x)
                        previous.maxX = Math.max(previous.maxX, x)
                        previous.minZ = Math.min(previous.minZ, z)
                        previous.maxZ = Math.max(previous.maxZ, z)
                    }
                }

                const spanX = Math.max(
                    Math.hypot(_b.x - _a.x, _b.z - _a.z),
                    Math.hypot(_c.x - _b.x, _c.z - _b.z),
                    Math.hypot(_a.x - _c.x, _a.z - _c.z)
                )
                const steps = Math.max(1, Math.ceil(spanX / (FLOOR_CELL * 0.5)))
                for (let iu = 0; iu <= steps; iu++)
                {
                    for (let iv = 0; iv <= steps - iu; iv++)
                    {
                        const u = iu / steps
                        const v = iv / steps
                        const w = 1 - u - v
                        mark(
                            _a.x * w + _b.x * u + _c.x * v,
                            _a.z * w + _b.z * u + _c.z * v
                        )
                    }
                }
            }
        }
    })

    const half = FLOOR_CELL * 0.5
    // Wider than half a cell, so a seam between two floor pieces cannot open
    // a crack under the player's feet.
    const floorPad = 0.32
    const floorBoxes = []

    for (const [key, height] of floors)
    {
        const [ix, iz] = key.split(',').map(Number)
        const x = ix * FLOOR_CELL
        const z = iz * FLOOR_CELL
        floorBoxes.push(new THREE.Box3(
            new THREE.Vector3(x - half - floorPad, height - 1.2, z - half - floorPad),
            new THREE.Vector3(x + half + floorPad, height, z + half + floorPad)
        ))
    }

    const wallBoxes = []
    // Just enough that neighbouring samples overlap. The player radius already
    // stops the body short of the box, so a fatter pad reads as a gap.
    const wallPad = 0.04
    const bodyLow = deckY + 0.05
    const bodyHigh = deckY + 4.3

    for (const span of walls.values())
    {
        const overlap = Math.min(span.maxY, bodyHigh) - Math.max(span.minY, bodyLow)
        if (overlap < 0.22) continue

        const low = Math.max(span.minY, deckY - 0.4)
        // Keep the barrier above a jump, or a short railing can be hopped.
        const high = Math.max(Math.min(span.maxY, bodyHigh), deckY + 3.7)
        wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(span.minX - wallPad, low, span.minZ - wallPad),
            new THREE.Vector3(span.maxX + wallPad, high, span.maxZ + wallPad)
        ))
    }

    // The leaf and the stone frame around it. The outer face sits at about
    // model z 1.36; the volume stays on that face instead of out in the courtyard.
    if (sealDoor) wallBoxes.push(wallBox(-1.02, 1.02, 1.24, 1.37))

    return { floors: floorBoxes, walls: wallBoxes }
}

function deckBox(minX, maxX, minZ, maxZ)
{
    return new THREE.Box3(
        new THREE.Vector3(minX * SCALE, DECK_Y - 4 * SCALE, minZ * SCALE),
        new THREE.Vector3(maxX * SCALE, DECK_Y, maxZ * SCALE)
    )
}

function wallBox(minX, maxX, minZ, maxZ)
{
    return new THREE.Box3(
        new THREE.Vector3(minX * SCALE, DECK_Y - SCALE, minZ * SCALE),
        new THREE.Vector3(maxX * SCALE, DECK_Y + 2.6 * SCALE, maxZ * SCALE)
    )
}

/**
 * "Cool glass" left the exporter with no colour and no transmission, so the
 * loader builds a rough white metal and the bulbs on the sign read as solid
 * spheres. They are about a tenth across in model units. Thickness is that
 * diameter, in the mesh's own space, and the castle scale carries it out
 * to the world size.
 *
 * Each globe is a handful of loose shells. Shells of one globe sit well
 * inside this radius; the next globe along the frame is further out.
 */
const GLASS_DIAMETER = 0.1
const BULB_REACH = 0.09

/**
 * Shared by every program the glass compiles. Eight lit globes walk the
 * frame, and a lap of the border takes about six and a half seconds.
 */
const marqueeClock = { value: 0 }

let glassMaterial = null

function coolGlassMaterial()
{
    if (glassMaterial) return glassMaterial

    glassMaterial = new THREE.MeshPhysicalMaterial({
        name: 'Cool glass',
        color: '#fff4e4',
        metalness: 0,
        roughness: 0.2,
        ior: 1.5,
        transmission: 1,
        thickness: GLASS_DIAMETER,
        specularIntensity: 1,
        attenuationColor: '#ffc48a',
        attenuationDistance: 0.8
    })

    glassMaterial.customProgramCacheKey = () => 'sign-marquee'
    glassMaterial.onBeforeCompile = (shader) =>
    {
        shader.uniforms.uTime = marqueeClock

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
attribute float aPhase;
varying float vPhase;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vPhase = aPhase;`)

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uTime;
varying float vPhase;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float travel = fract(vPhase * 8.0 - uTime * 1.25);
float rise = smoothstep(0.08, 0.48, travel);
float fall = 1.0 - smoothstep(0.48, 0.60, travel);
float glow = rise * fall;
vec3 idle = vec3(0.42, 0.16, 0.04);
vec3 hot = vec3(1.0, 0.82, 0.46);
totalEmissiveRadiance += mix(idle, hot, glow) * mix(0.45, 7.0, glow);`)
    }

    return glassMaterial
}

const _bulb = new THREE.Vector3()

function findRoot(parent, index)
{
    while (parent[index] !== index)
    {
        parent[index] = parent[parent[index]]
        index = parent[index]
    }

    return index
}

/** One entry per globe, in the sign's own space, plus the shells that form it. */
function collectBulbs(meshes)
{
    const pieces = []

    for (const mesh of meshes)
    {
        const geometry = mesh.geometry
        const position = geometry.attributes.position
        const index = geometry.index
        const parent = new Int32Array(position.count)
        for (let vertex = 0; vertex < position.count; vertex++) parent[vertex] = vertex

        const unite = (a, b) =>
        {
            a = findRoot(parent, a)
            b = findRoot(parent, b)
            if (a !== b) parent[b] = a
        }

        if (index)
        {
            for (let triangle = 0; triangle < index.count; triangle += 3)
            {
                const a = index.getX(triangle)
                unite(a, index.getX(triangle + 1))
                unite(a, index.getX(triangle + 2))
            }
        }
        else
        {
            for (let vertex = 0; vertex < position.count; vertex += 3)
            {
                unite(vertex, vertex + 1)
                unite(vertex, vertex + 2)
            }
        }

        const shells = new Map()
        for (let vertex = 0; vertex < position.count; vertex++)
        {
            const root = findRoot(parent, vertex)
            let shell = shells.get(root)
            if (!shell)
            {
                shell = { geometry, vertices: [], x: 0, y: 0, z: 0 }
                shells.set(root, shell)
            }

            shell.vertices.push(vertex)
            shell.x += position.getX(vertex)
            shell.y += position.getY(vertex)
            shell.z += position.getZ(vertex)
        }

        for (const shell of shells.values())
        {
            const count = shell.vertices.length
            _bulb.set(shell.x / count, shell.y / count, shell.z / count)
            _bulb.applyMatrix4(mesh.matrixWorld)
            shell.x = _bulb.x
            shell.y = _bulb.y
            shell.z = _bulb.z
            pieces.push(shell)
        }
    }

    const bulbs = []
    const reach = BULB_REACH * BULB_REACH

    for (const piece of pieces)
    {
        let bulb = null
        let nearest = reach

        for (const candidate of bulbs)
        {
            const dx = candidate.x - piece.x
            const dy = candidate.y - piece.y
            const dz = candidate.z - piece.z
            const distance = dx * dx + dy * dy + dz * dz
            if (distance < nearest)
            {
                nearest = distance
                bulb = candidate
            }
        }

        if (!bulb)
        {
            bulbs.push({ x: piece.x, y: piece.y, z: piece.z, weight: piece.vertices.length, pieces: [piece] })
            continue
        }

        const weight = bulb.weight + piece.vertices.length
        bulb.x = (bulb.x * bulb.weight + piece.x * piece.vertices.length) / weight
        bulb.y = (bulb.y * bulb.weight + piece.y * piece.vertices.length) / weight
        bulb.z = (bulb.z * bulb.weight + piece.z * piece.vertices.length) / weight
        bulb.weight = weight
        bulb.pieces.push(piece)
    }

    return bulbs
}

/**
 * Phase runs 0 to 1 once around the border, by distance along the frame
 * rather than by angle, so the chase keeps an even pace on the long sides.
 */
function orderBulbs(bulbs)
{
    let cx = 0
    let cy = 0
    for (const bulb of bulbs)
    {
        cx += bulb.x
        cy += bulb.y
    }
    cx /= bulbs.length
    cy /= bulbs.length

    bulbs.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))

    const spans = []
    let total = 0
    for (let index = 0; index < bulbs.length; index++)
    {
        const next = bulbs[(index + 1) % bulbs.length]
        const span = Math.hypot(next.x - bulbs[index].x, next.y - bulbs[index].y)
        spans.push(span)
        total += span
    }

    let walked = 0
    for (let index = 0; index < bulbs.length; index++)
    {
        bulbs[index].phase = total > 0 ? walked / total : 0
        walked += spans[index]
    }
}

function stampMarquee(meshes)
{
    const bulbs = collectBulbs(meshes)
    if (bulbs.length === 0) return

    orderBulbs(bulbs)

    const phases = new Map()
    for (const mesh of meshes)
    {
        phases.set(mesh.geometry, new Float32Array(mesh.geometry.attributes.position.count))
    }

    for (const bulb of bulbs)
    {
        for (const piece of bulb.pieces)
        {
            const phase = phases.get(piece.geometry)
            for (const vertex of piece.vertices) phase[vertex] = bulb.phase
        }
    }

    for (const [geometry, phase] of phases)
    {
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    }
}

function prepareSignLights(root)
{
    const meshes = []
    root.traverse((child) =>
    {
        if (!child.isMesh || child.material?.name !== 'Cool glass') return
        meshes.push(child)
    })
    if (meshes.length === 0) return

    root.updateWorldMatrix(true, true)

    const material = coolGlassMaterial()
    const retired = new Set()
    for (const mesh of meshes)
    {
        if (mesh.material !== material) retired.add(mesh.material)
        mesh.material = material
        // A hard shadow from a clear bulb still reads as a painted ball.
        mesh.castShadow = false
    }
    for (const entry of retired) entry.dispose()

    stampMarquee(meshes)
}

function advanceMarquee(delta)
{
    marqueeClock.value += delta
}

/**
 * The castle exports are shaded smooth everywhere, so each vertex carries one
 * normal averaged across every face that meets there, square corners
 * included. Interpolated down the long wall triangles, that streaks the
 * stone. Rebuilt here: faces meeting at more than this angle get a hard
 * crease, flatter ones (the round towers) stay smooth.
 *
 * Temporary, to check the fix before it goes into the Blender export.
 * Add ?normals=original to the URL to see the exported normals instead.
 */
const CREASE_ANGLE = THREE.MathUtils.degToRad(30)

function keepExportedNormals()
{
    try
    {
        return new URLSearchParams(globalThis.location?.search ?? '').get('normals') === 'original'
    }
    catch
    {
        return false
    }
}

/**
 * Hard-edged meshes only. The cloud is soft by design, and the sign's glass
 * keeps its own indexed shells for the marquee.
 */
function creaseNormals(root)
{
    if (keepExportedNormals()) return

    let meshes = 0
    root.traverse((child) =>
    {
        if (!child.isMesh || !child.geometry?.attributes.position) return

        const names = (Array.isArray(child.material) ? child.material : [child.material]).map((entry) => entry?.name ?? '')
        if (names.some((name) => name.includes('Ivory') || name === 'Cool glass')) return

        const creased = toCreasedNormals(child.geometry, CREASE_ANGLE)
        if (creased !== child.geometry) child.geometry.dispose()
        child.geometry = creased
        meshes++
    })

    console.info(`castle normals: creased ${meshes} meshes at ${THREE.MathUtils.radToDeg(CREASE_ANGLE)}°`)
}

/**
 * The cloud shells under the castles are most of their triangles (1.5M of
 * the main castle's 1.64M, 436k of a triple castle's 450k), see-through and
 * double-sided, so drawn twice. Past a distance, swap each for a clustered
 * copy with about a tenth of the triangles. The cloud is soft, so at range
 * the difference does not read.
 *
 * TEMPORARY perf experiment flag: ?nolod keeps the full clouds at every distance.
 */
/** Clustering grid, in the export's units (SCALE = 5, so 1.25 m). */
const CLOUD_LOD_CELL = 0.25
/** Metres beyond the cloud's farthest point from its origin before the swap. */
const CLOUD_LOD_MARGIN = 60

function cloudLodDisabled()
{
    try
    {
        return new URLSearchParams(globalThis.location?.search ?? '').has('nolod')
    }
    catch
    {
        return false
    }
}

function addCloudLods(root)
{
    if (cloudLodDisabled()) return

    const clouds = []
    root.traverse((child) =>
    {
        if (!child.isMesh || Array.isArray(child.material)) return
        if (child.material?.name?.includes('Ivory')) clouds.push(child)
    })

    for (const mesh of clouds)
    {
        const started = performance.now()
        const far = new THREE.Mesh(simplifyByClustering(mesh.geometry, CLOUD_LOD_CELL), mesh.material)
        far.name = `${mesh.name} (far)`
        far.castShadow = mesh.castShadow
        far.receiveShadow = mesh.receiveShadow
        far.renderOrder = mesh.renderOrder

        // The LOD takes the mesh's place and transform; the mesh sits in it untransformed.
        const lod = new THREE.LOD()
        lod.name = `${mesh.name} (lod)`
        lod.position.copy(mesh.position)
        lod.quaternion.copy(mesh.quaternion)
        lod.scale.copy(mesh.scale)
        mesh.parent.add(lod)
        mesh.parent.remove(mesh)
        mesh.position.set(0, 0, 0)
        mesh.quaternion.identity()
        mesh.scale.set(1, 1, 1)

        // Farthest point of the cloud from the LOD's origin, in world metres.
        mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox
        const corner = new THREE.Vector3()
        let reach = 0
        for (let index = 0; index < 8; index++)
        {
            corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z)
            reach = Math.max(reach, corner.multiply(lod.scale).length())
        }
        const swapAt = reach * SCALE + CLOUD_LOD_MARGIN

        lod.addLevel(mesh, 0)
        lod.addLevel(far, swapAt, 0.05)

        const before = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3
        console.info(`[perf] cloud LOD: ${before} -> ${far.geometry.index.count / 3} triangles past ${Math.round(swapAt)} m (${Math.round(performance.now() - started)} ms)`)
    }
}

const templatePromises = new Map()
let submarinePromise = null

/**
 * The export swings the hatch from shut, through the hull, to +135°.
 * This mirror starts at the open pose and ends shut over the hole.
 * The boat rests on that shut frame. Reaching the hatch runs the clip
 * backward to the open pose; leaving runs it forward until it is shut.
 */
function closingHatchClip(clip)
{
    const mirrored = clip.clone()

    for (const track of mirrored.tracks)
    {
        if (!track.name.endsWith('.quaternion')) continue

        const values = track.values
        const copy = values.slice()
        const count = values.length / 4

        for (let index = 0; index < count; index++)
        {
            const source = (count - 1 - index) * 4
            values[index * 4] = -copy[source]
            values[index * 4 + 1] = -copy[source + 1]
            values[index * 4 + 2] = -copy[source + 2]
            values[index * 4 + 3] = copy[source + 3]
        }
    }

    return mirrored
}

/**
 * The lid the clip actually turns. glTF renames `sub.001` to `sub001`,
 * so the track name is the one that still matches the object.
 */
function hatchObject(root, clip)
{
    const track = clip.tracks.find((entry) => entry.name.endsWith('.quaternion'))
    if (!track) return null

    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name)
    return root.getObjectByName(nodeName)
}

/** Coloured lamps inside the hull. Each one sits a slice of the rainbow ahead of the next. */
function makeDiscoLamps(parent)
{
    const lamps = []

    for (let index = 0; index < DISCO_X.length; index++)
    {
        const hue = index / DISCO_X.length
        const light = new THREE.PointLight(0xffffff, 0, DISCO_DISTANCE, 2)
        light.position.set(DISCO_X[index], DISCO_Y, DISCO_Z)
        light.userData.hue = hue
        light.color.setHSL(hue, 1, 0.5)
        parent.add(light)
        lamps.push(light)
    }

    return lamps
}

function advanceDisco(lamps, time, lit)
{
    for (const light of lamps)
    {
        const hue = light.userData.hue + time * DISCO_SPEED
        light.color.setHSL(hue - Math.floor(hue), 1, 0.5)
        if (!lit)
        {
            light.intensity = 0
            continue
        }

        const beat = 0.82 + 0.18 * Math.sin(time * 5 + light.userData.hue * Math.PI * 2)
        light.intensity = DISCO_INTENSITY * beat
    }
}

/** The hull stays still. The clip turns the hatch along the mirrored arc. */
function loadSubmarine()
{
    if (!submarinePromise)
    {
        submarinePromise = createGLTFLoader().loadAsync(SUBMARINE_URL).then((gltf) =>
        {
            gltf.scene.traverse((child) =>
            {
                if (!child.isMesh) return

                child.castShadow = true
                child.receiveShadow = true
            })

            return gltf
        })
    }

    return submarinePromise
}

let leaderboardPromise = null

/** The board, centred on its own origin and placed by LEADERBOARD. */
function loadLeaderboard()
{
    if (!leaderboardPromise)
    {
        leaderboardPromise = createGLTFLoader().loadAsync(LEADERBOARD_URL).then((gltf) =>
        {
            gltf.scene.traverse((child) =>
            {
                // Exported where it was modelled; LEADERBOARD places it instead.
                if (child.parent === gltf.scene) child.position.set(0, 0, 0)
                if (!child.isMesh) return
                child.castShadow = true
                child.receiveShadow = true
            })
            prepareSignLights(gltf.scene)

            const board = gltf.scene
            board.position.set(LEADERBOARD.x, LEADERBOARD.y, LEADERBOARD.z)
            board.rotation.y = LEADERBOARD.yaw
            board.scale.setScalar(LEADERBOARD.scale)
            return board
        })
    }

    return leaderboardPromise
}

/** Keeps the player from walking into the board, in the castle's local metres. */
function leaderboardWall()
{
    const halfX = LEADERBOARD.halfWidth * LEADERBOARD.scale * SCALE
    const backZ = (LEADERBOARD.z + 0.086 * LEADERBOARD.scale) * SCALE
    const frontZ = backZ - LEADERBOARD.depth * LEADERBOARD.scale * SCALE
    const top = (LEADERBOARD.y + LEADERBOARD.halfHeight * LEADERBOARD.scale) * SCALE
    return new THREE.Box3(
        new THREE.Vector3(LEADERBOARD.x * SCALE - halfX, MAIN_DECK_Y - 0.4, frontZ - 0.2),
        new THREE.Vector3(LEADERBOARD.x * SCALE + halfX, top, backZ)
    )
}

/** One download per file. Each castle clones the scene graph and shares the meshes. */
function loadTemplate(url)
{
    if (!templatePromises.has(url))
    {
        templatePromises.set(url, createGLTFLoader().loadAsync(url).then((gltf) =>
        {
            gltf.scene.traverse((child) =>
            {
                if (!child.isMesh) return

                // The cloud shell is transparent and pokes up through the floor.
                // It still writes a solid shadow, which stamps hard shapes on the bricks.
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                const cloudy = materials.some((entry) => entry?.name?.includes('Ivory'))
                child.castShadow = !cloudy
                child.receiveShadow = true
            })

            prepareSignLights(gltf.scene)
            creaseNormals(gltf.scene)
            addCloudLods(gltf.scene)

            return gltf.scene
        }))
    }

    return templatePromises.get(url)
}

export async function loadCastleModel(url = RING_URL)
{
    const template = await loadTemplate(url)
    const root = new THREE.Group()
    root.scale.setScalar(SCALE)
    root.add(template.clone(true))
    return root
}

/** Deck, stairs, and (once measured) courtyard, shared by the outer castles. */
let sharedCollision = null
let ringMeasured = false
/** Solid voxels for flight, shared by the outer castles. */
let ringFlightVoxels = null

/**
 * Flight collision is a 3D occupancy grid of the castle's real surfaces, in
 * metres. Cells are small next to the elephant's body spheres, so a thin
 * plank or walkway still fills a whole cell and cannot be skipped. They are
 * shorter than they are wide: a floor can only read as high as one cell
 * above the real surface, and that has to stay under the gap between her
 * feet and her lowest body sphere, or every landing would count as a hit.
 */
export const FLIGHT_VOXEL = 0.5
export const FLIGHT_VOXEL_Y = 0.25

/**
 * The cloud is passable. So are the neon bulbs and the glass on the sign.
 * Everything else — stone, the dark base, the towers, the planks, the
 * submarine stand — can stop the elephant.
 */
function keepsFlightMaterial(name)
{
    const label = name.toLowerCase()
    if (!label) return false
    if (label.includes('ivory') || label.includes('cool glass') || label.includes('sign_letter')) return false
    if (label === 'red' || label === 'yellow') return false
    return true
}

/** Every solid triangle, in `space`, as flat [ax, ay, az, bx, ...] runs. */
function flightTriangles(root, space)
{
    const intoLocal = new THREE.Matrix4()
    root.updateWorldMatrix(true, true)
    if (space)
    {
        space.updateWorldMatrix(true, false)
        intoLocal.copy(space.matrixWorld).invert()
    }

    const triangles = []
    root.traverse((child) =>
    {
        if (!child.isMesh) return

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        if (!materials.some((entry) => keepsFlightMaterial(entry?.name ?? ''))) return

        const position = child.geometry.attributes.position
        const index = child.geometry.index
        if (!position) return

        const count = index ? index.count : position.count
        for (let corner = 0; corner < count; corner++)
        {
            _a.fromBufferAttribute(position, index ? index.getX(corner) : corner).applyMatrix4(child.matrixWorld)
            if (space) _a.applyMatrix4(intoLocal)
            triangles.push(_a.x, _a.y, _a.z)
        }
    })

    return triangles
}

/**
 * Voxelise the solid surfaces of a castle into its own plan space (`space`
 * is the castle group, so a rotated copy still measures upright). Each
 * triangle is sampled finer than a cell, so a surface leaves no holes.
 */
export function measureFlightVoxels(root, space = null, cell = FLIGHT_VOXEL, cellY = FLIGHT_VOXEL_Y)
{
    const tri = flightTriangles(root, space)
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < tri.length; i += 3)
    {
        for (let k = 0; k < 3; k++)
        {
            if (tri[i + k] < min[k]) min[k] = tri[i + k]
            if (tri[i + k] > max[k]) max[k] = tri[i + k]
        }
    }

    if (tri.length === 0)
        return { cell, cellY, minX: 0, minY: 0, minZ: 0, nx: 0, ny: 0, nz: 0, data: new Uint8Array(0), count: 0 }

    const minX = min[0] - cell
    const minY = min[1] - cellY
    const minZ = min[2] - cell
    const nx = Math.ceil((max[0] - minX) / cell) + 2
    const ny = Math.ceil((max[1] - minY) / cellY) + 2
    const nz = Math.ceil((max[2] - minZ) / cell) + 2
    const data = new Uint8Array(nx * ny * nz)
    let count = 0

    const mark = (x, y, z) =>
    {
        const ix = Math.floor((x - minX) / cell)
        const iy = Math.floor((y - minY) / cellY)
        const iz = Math.floor((z - minZ) / cell)
        const slot = (iy * nz + iz) * nx + ix
        if (data[slot] === 0)
        {
            data[slot] = 1
            count++
        }
    }

    const sample = Math.min(cell, cellY) * 0.45
    for (let i = 0; i < tri.length; i += 9)
    {
        const ax = tri[i], ay = tri[i + 1], az = tri[i + 2]
        const bx = tri[i + 3], by = tri[i + 4], bz = tri[i + 5]
        const cx = tri[i + 6], cy = tri[i + 7], cz = tri[i + 8]
        const span = Math.max(
            Math.hypot(bx - ax, by - ay, bz - az),
            Math.hypot(cx - bx, cy - by, cz - bz),
            Math.hypot(ax - cx, ay - cy, az - cz)
        )
        const steps = Math.max(1, Math.ceil(span / sample))

        for (let iu = 0; iu <= steps; iu++)
        {
            for (let iv = 0; iv <= steps - iu; iv++)
            {
                const u = iu / steps
                const v = iv / steps
                const w = 1 - u - v
                mark(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v)
            }
        }
    }

    return { cell, cellY, minX, minY, minZ, nx, ny, nz, data, count }
}

/**
 * Solid cells a sphere touches, in the grid's own space. Zero means clear.
 * The count lets a body that starts out wedged move only toward open air.
 */
export function voxelSphereHits(grid, x, y, z, radius)
{
    if (!grid || grid.count === 0) return 0

    const { cell, cellY, minX, minY, minZ, nx, ny, nz, data } = grid
    const x0 = Math.max(0, Math.floor((x - radius - minX) / cell))
    const x1 = Math.min(nx - 1, Math.floor((x + radius - minX) / cell))
    if (x0 > x1) return 0
    const y0 = Math.max(0, Math.floor((y - radius - minY) / cellY))
    const y1 = Math.min(ny - 1, Math.floor((y + radius - minY) / cellY))
    if (y0 > y1) return 0
    const z0 = Math.max(0, Math.floor((z - radius - minZ) / cell))
    const z1 = Math.min(nz - 1, Math.floor((z + radius - minZ) / cell))
    if (z0 > z1) return 0

    const reach = radius * radius
    let hits = 0

    for (let iy = y0; iy <= y1; iy++)
    {
        const low = minY + iy * cellY
        const dy = y < low ? low - y : (y > low + cellY ? y - low - cellY : 0)
        const dy2 = dy * dy
        if (dy2 > reach) continue

        for (let iz = z0; iz <= z1; iz++)
        {
            const lowZ = minZ + iz * cell
            const dz = z < lowZ ? lowZ - z : (z > lowZ + cell ? z - lowZ - cell : 0)
            const dyz = dy2 + dz * dz
            if (dyz > reach) continue

            const row = (iy * nz + iz) * nx
            for (let ix = x0; ix <= x1; ix++)
            {
                if (data[row + ix] === 0) continue
                const lowX = minX + ix * cell
                const dx = x < lowX ? lowX - x : (x > lowX + cell ? x - lowX - cell : 0)
                if (dyz + dx * dx <= reach) hits++
            }
        }
    }

    return hits
}

/**
 * How far a sphere can travel from (ox, oy, oz) along the unit direction
 * (dx, dy, dz) before it touches a solid voxel, up to `max`. Grid space.
 * Steps are a fraction of the radius, so it cannot hop over a thin plank.
 * Returns 0 when the sphere already starts inside stone.
 */
export function voxelSweepSphere(grid, ox, oy, oz, dx, dy, dz, max, radius)
{
    if (!grid?.count) return max

    // Quick out: the whole segment misses the grid's box.
    const pad = radius + 0.5
    const ex = ox + dx * max
    const ey = oy + dy * max
    const ez = oz + dz * max
    if (Math.max(ox, ex) < grid.minX - pad || Math.min(ox, ex) > grid.minX + grid.nx * grid.cell + pad) return max
    if (Math.max(oy, ey) < grid.minY - pad || Math.min(oy, ey) > grid.minY + grid.ny * grid.cellY + pad) return max
    if (Math.max(oz, ez) < grid.minZ - pad || Math.min(oz, ez) > grid.minZ + grid.nz * grid.cell + pad) return max

    const step = Math.max(0.05, radius * 0.4)
    let travelled = 0

    while (travelled < max)
    {
        const next = Math.min(max, travelled + step)
        if (voxelSphereHits(grid, ox + dx * next, oy + dy * next, oz + dz * next, radius) > 0) return travelled
        travelled = next
    }

    return max
}

function ringCollision()
{
    if (sharedCollision) return sharedCollision

    const platforms = DECK_FOOTPRINT.map((span) => deckBox(...span))
    for (const [modelY, minX, maxX, minZ, maxZ] of STAIR_TREADS)
    {
        platforms.push(raisedBox(modelY, minX, maxX, minZ, maxZ))
    }

    sharedCollision = {
        platforms,
        walls: WALL_FOOTPRINT.map((span) => wallBox(...span))
    }
    return sharedCollision
}

function scaledBox(span, top)
{
    return new THREE.Box3(
        new THREE.Vector3(span.minX * SCALE, top - 4 * SCALE, span.minZ * SCALE),
        new THREE.Vector3(span.maxX * SCALE, top, span.maxZ * SCALE)
    )
}

/** True when a measured box sits in the opening, where the player should fall. */
function overTheRing(box)
{
    const x = (box.min.x + box.max.x) * 0.5
    const z = (box.min.z + box.max.z) * 0.5
    const dz = z - MAIN_RING.z * SCALE
    const reach = MAIN_RING.clear * SCALE
    return x * x + dz * dz < reach * reach
}

/**
 * The court slab with the ring cut out. Bands follow the circle, each one
 * opened to the widest the hole gets inside that band, so no strip covers it.
 */
function mainCourtBoxes()
{
    const radius = MAIN_RING.radius
    const centerZ = MAIN_RING.z
    const holeMinZ = centerZ - radius
    const holeMaxZ = centerZ + radius
    const bands = 48
    const boxes = []

    if (MAIN_COURT.minZ < holeMinZ)
    {
        boxes.push(scaledBox({ ...MAIN_COURT, maxZ: holeMinZ }, MAIN_DECK_Y))
    }

    if (holeMaxZ < MAIN_COURT.maxZ)
    {
        boxes.push(scaledBox({ ...MAIN_COURT, minZ: holeMaxZ }, MAIN_DECK_Y))
    }

    for (let band = 0; band < bands; band++)
    {
        const minZ = holeMinZ + (holeMaxZ - holeMinZ) * band / bands
        const maxZ = holeMinZ + (holeMaxZ - holeMinZ) * (band + 1) / bands
        const nearCenter = Math.min(Math.abs(minZ - centerZ), Math.abs(maxZ - centerZ))
        const half = Math.sqrt(Math.max(0, radius * radius - nearCenter * nearCenter))
        const holeMinX = -half
        const holeMaxX = half

        if (MAIN_COURT.minX < holeMinX)
        {
            boxes.push(scaledBox({
                minX: MAIN_COURT.minX,
                maxX: holeMinX,
                minZ,
                maxZ
            }, MAIN_DECK_Y))
        }

        if (holeMaxX < MAIN_COURT.maxX)
        {
            boxes.push(scaledBox({
                minX: holeMaxX,
                maxX: MAIN_COURT.maxX,
                minZ,
                maxZ
            }, MAIN_DECK_Y))
        }
    }

    return boxes
}

function mainDoorBox()
{
    return scaledBox(MAIN_DOOR, MAIN_DOOR.y * SCALE)
}

/**
 * The nine treads and the platform above them. A little overlap closes the
 * seams, and the lowest tread reaches the court so the first step is walkable.
 */
function mainStairBoxes()
{
    const halfX = 0.648
    const pad = 0.03
    const boxes = MAIN_TREADS.map(([y, minZ, maxZ], index) => raisedBox(
        y,
        -halfX,
        halfX,
        minZ - pad,
        index === 0 ? 1.14 : maxZ + pad
    ))

    boxes.push(raisedBox(
        MAIN_PLATFORM.y,
        MAIN_PLATFORM.minX,
        MAIN_PLATFORM.maxX,
        MAIN_PLATFORM.minZ,
        MAIN_PLATFORM.maxZ + 0.08
    ))

    return boxes
}

/**
 * Invisible rails around the stair and the landing. The court end stays
 * open. The top is above a jump, so the drop into the ring is closed.
 */
function mainPlatformWalls()
{
    const halfX = 0.648 * SCALE
    const minZ = MAIN_PLATFORM.minZ * SCALE
    const courtZ = 1.14 * SCALE
    const thickness = 0.4
    const top = MAIN_PLATFORM.y * SCALE + 1.5
    const bottom = MAIN_DECK_Y - 0.4

    return [
        new THREE.Box3(
            new THREE.Vector3(-halfX - thickness, bottom, minZ),
            new THREE.Vector3(-halfX, top, courtZ)
        ),
        new THREE.Box3(
            new THREE.Vector3(halfX, bottom, minZ),
            new THREE.Vector3(halfX + thickness, top, courtZ)
        ),
        new THREE.Box3(
            new THREE.Vector3(-halfX, bottom, minZ - thickness),
            new THREE.Vector3(halfX, top, minZ)
        )
    ]
}

/**
 * The lip is a low ring of stone. Boxes follow it, with a gap where the
 * stair comes through, so the curb stops a walk into the opening.
 */
function mainLipWalls()
{
    const inner = 3.08
    const outer = 3.42
    const segments = 72
    const top = MAIN_LIP_Y * SCALE
    const bottom = MAIN_DECK_Y - 0.4
    const boxes = []

    for (let index = 0; index < segments; index++)
    {
        const start = index / segments * Math.PI * 2
        const end = (index + 1) / segments * Math.PI * 2
        const mid = (start + end) * 0.5
        const midX = Math.sin(mid) * (inner + outer) * 0.5
        const midZ = MAIN_RING.z + Math.cos(mid) * (inner + outer) * 0.5
        if (Math.abs(midX) < 0.72 && midZ > 0.45) continue

        let minX = Infinity
        let maxX = -Infinity
        let minZ = Infinity
        let maxZ = -Infinity

        for (const angle of [start, end])
        {
            for (const radius of [inner, outer])
            {
                const x = Math.sin(angle) * radius
                const z = MAIN_RING.z + Math.cos(angle) * radius
                minX = Math.min(minX, x)
                maxX = Math.max(maxX, x)
                minZ = Math.min(minZ, z)
                maxZ = Math.max(maxZ, z)
            }
        }

        boxes.push(new THREE.Box3(
            new THREE.Vector3(minX * SCALE, bottom, minZ * SCALE),
            new THREE.Vector3(maxX * SCALE, top, maxZ * SCALE)
        ))
    }

    return boxes
}

export class Castle
{
    /**
     * @param {{ x?: number, z?: number, yaw?: number, loadModel?: boolean, variant?: 'ring' | 'main' }} [placement]
     *   `yaw` turns the door (local +Z) in the horizontal plane.
     *   `main` is the starting castle. `ring` is one of the triple castles.
     */
    constructor({ x = 0, z = 0, yaw = 0, loadModel = true, variant = 'ring' } = {})
    {
        this.x = x
        this.z = z
        this.yaw = yaw
        this.variant = variant
        this.cosYaw = Math.cos(yaw)
        this.sinYaw = Math.sin(yaw)

        this.group = new THREE.Group()
        this.group.position.set(x, 0, z)
        this.group.rotation.y = yaw

        if (variant === 'main')
        {
            this.platforms = [...mainCourtBoxes(), ...mainStairBoxes(), mainDoorBox()]
            this.walls = [...mainLipWalls(), ...mainPlatformWalls()]
            this.hoop = null
            /** The board inside the gate wall. Null until it has arrived. */
            this.leaderboard = null
            /** Solid voxels the elephant cannot fly through. Filled in when the mesh arrives. */
            this.flightVoxels = null
            this.berth = CASTLE.elephant
            this.berthYaw = CASTLE.elephantYaw
        }
        else
        {
            const collision = ringCollision()
            /** Standable tops, in this castle's local space. */
            this.platforms = collision.platforms
            /** AABBs that push the player back in XZ, in local space. */
            this.walls = collision.walls
            /** Solid voxels the elephant cannot fly through. Filled in when the mesh arrives. */
            this.flightVoxels = null
            this.hoop = null
            this.berth = RING_ELEPHANT
            this.berthYaw = 0
        }

        this.placeholder = new THREE.Group()
        const material = new THREE.MeshStandardMaterial({ color: '#8a8680', roughness: 0.9 })

        for (const box of this.platforms)
        {
            const size = box.getSize(new THREE.Vector3())
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, 0.12 * SCALE, size.z), material)
            mesh.position.set((box.min.x + box.max.x) * 0.5, box.max.y - 0.06 * SCALE, (box.min.z + box.max.z) * 0.5)
            mesh.receiveShadow = true
            this.placeholder.add(mesh)
        }

        this.group.add(this.placeholder)
        /** Plays the hatch. Null until that model has arrived. */
        this.submarineMixer = null
        /** `sub.001`, the lid. Null until the model has arrived. */
        this.hatch = null
        /** Played backward to open and forward to shut. */
        this.hatchAction = null
        /** closed, opening, open, or closing. */
        this.hatchState = 'closed'
        /** Lamps in the chamber. Null until the hull has arrived. */
        this.discoLights = null
        this.discoTime = 0
        /** The whole boat, hatch included. Null until the model has arrived. */
        this.submarine = null
        /** A point amidships the camera can follow. */
        this.submarineFocus = null
        /** Set once the player has chosen to enter. The hatch then seals and she dives. */
        this.departing = false
        this.descentSpeed = 0
        this.descentTime = 0
        /** After the opening shot, the hull is nose-down and still falling. */
        this.plunging = false
        /** Descent time when the hull cleared the cloud underside. Null until then. */
        this.clearedCloudAt = null
        /** 0 while the nose is dark, then up to 1 as it catches. */
        this.reentryHeat = 0
        this.reentry = null
        this.viewport = null
        /** The bobbing cloud under the court. Null until it has been built. */
        this.cloud = null

        const url = variant === 'main' ? MAIN_URL : RING_URL
        // Out of step with the other castles' clouds.
        const cloudPhase = x * 0.037 + z * 0.061
        this.ready = loadModel
            ? Promise.all([
                loadCastleModel(url),
                loadCloud(CLOUD_LAYOUT[variant], cloudPhase).catch((error) =>
                {
                    console.warn('Cloud model failed to load; the castle goes up without it.', error)
                    return null
                })
            ])
                .then(([model, cloud]) =>
                {
                    // Same parent as the castle mesh, so it shares SCALE.
                    if (cloud)
                    {
                        model.add(cloud.group)
                        this.cloud = cloud
                    }
                    this.#useModel(model)
                    if (this.variant !== 'main') return null

                    // Same parent as the castle mesh, so it shares SCALE.
                    loadLeaderboard()
                        .then((board) =>
                        {
                            model.add(board)
                            this.leaderboard = board
                            this.walls.push(leaderboardWall())
                        })
                        .catch((error) =>
                        {
                            console.warn('Leaderboard model failed to load.', error)
                        })

                    return loadSubmarine()
                        .then((gltf) =>
                        {
                            // Same parent as the castle mesh, so SCALE and the
                            // export's own placement land it in the ring.
                            const submarine = gltf.scene.clone(true)
                            model.add(submarine)
                            this.submarine = submarine
                            this.submarineFocus = new THREE.Object3D()
                            // Amidships, in the export's units, so the view stays on the hull as it drops.
                            this.submarineFocus.position.set(0.02, 0.35, -2.314)
                            submarine.add(this.submarineFocus)
                            this.discoLights = makeDiscoLamps(submarine)
                            this.reentry = new ReentryFire()
                            submarine.add(this.reentry.group)
                            if (this.viewport) this.reentry.setViewport(this.viewport.height, this.viewport.fov)

                            const source = gltf.animations[0]
                            if (!source) return

                            const clip = closingHatchClip(source)
                            this.submarineMixer = new THREE.AnimationMixer(submarine)
                            const action = this.submarineMixer.clipAction(clip)
                            action.setLoop(THREE.LoopOnce, 1)
                            action.clampWhenFinished = true
                            action.play()
                            action.time = clip.duration
                            action.paused = true
                            this.submarineMixer.update(0)
                            this.hatch = hatchObject(submarine, clip)
                            this.hatchAction = action
                        })
                        .catch((error) =>
                        {
                            console.warn('Submarine model failed to load.', error)
                        })
                })
                .catch((error) =>
                {
                    console.warn('Castle model failed to load; keeping the placeholder deck.', error)
                })
            : Promise.resolve()
    }

    /** Point sprites are sized in device pixels, so they track the drawing buffer. */
    setViewport(height, fov)
    {
        this.viewport = { height, fov }
        this.reentry?.setViewport(height, fov)
    }

    /** True when the visitor is at the lip and has not already boarded. */
    canBoard(visitor)
    {
        if (this.departing) return false
        return this.#hatchDistance(visitor) < BOARD_REACH
    }

    /** Seal the hatch and start the dive. The site change that follows is separate. */
    depart()
    {
        if (this.departing || !this.submarine) return false

        this.departing = true
        this.descentSpeed = 0
        return true
    }

    /** World position amidships. */
    submarinePoint(target)
    {
        if (!this.submarineFocus) return target.set(0, 0, 0)

        this.submarineFocus.updateWorldMatrix(true, false)
        return this.submarineFocus.getWorldPosition(target)
    }

    /** Advances the cloud, the hatch, the chamber lamps, and, on the starting castle, the sign. */
    update(delta, visitor = null)
    {
        this.cloud?.update(delta)

        if (this.departing)
        {
            if (this.hatchAction && (this.hatchState === 'open' || this.hatchState === 'opening'))
            {
                this.hatchAction.timeScale = 1
                this.hatchAction.paused = false
                this.hatchState = 'closing'
            }
        }
        else if (this.hatchAction && visitor)
        {
            const beside = this.#besideHatch(visitor)
            const shut = this.hatchState === 'closed' || this.hatchState === 'closing'

            if (beside && shut)
            {
                this.hatchAction.timeScale = -1
                this.hatchAction.paused = false
                this.hatchState = 'opening'
            }
            else if (!beside && !shut)
            {
                this.hatchAction.timeScale = 1
                this.hatchAction.paused = false
                this.hatchState = 'closing'
            }
        }

        this.submarineMixer?.update(delta)

        if (this.hatchState === 'opening' && this.hatchAction.paused)
            this.hatchState = 'open'
        else if (this.hatchState === 'closing' && this.hatchAction.paused)
            this.hatchState = 'closed'

        if (this.discoLights)
        {
            this.discoTime += delta
            advanceDisco(this.discoLights, this.discoTime, this.hatchState !== 'closed')
        }

        if (this.departing && this.submarine)
        {
            this.descentTime += delta
            const worldY = (this.submarine.position.y + (this.plunging ? -0.02 : 0.35)) * SCALE
            const inCloud = worldY <= CLOUD_TOP && worldY >= CLOUD_BOTTOM
            const accel = inCloud ? CLOUD_ACCEL : DESCENT_ACCEL
            const cap = inCloud || worldY < CLOUD_BOTTOM ? CLOUD_MAX : DESCENT_MAX
            this.descentSpeed = Math.min(cap, this.descentSpeed + accel * delta)
            // Position is in the scaled parent, so a local step is divided back into metres.
            // Rotation does not affect it: she keeps falling straight down after the pitch.
            this.submarine.position.y -= this.descentSpeed * delta / SCALE

            if (!this.plunging && this.descentTime >= PLUNGE_AFTER)
            {
                this.plunging = true
                this.submarine.rotation.z = NOSE_DOWN
            }

            if (worldY < CLOUD_BOTTOM && this.clearedCloudAt === null)
                this.clearedCloudAt = this.descentTime

            if (this.clearedCloudAt === null) this.reentryHeat = 0
            else
            {
                const since = this.descentTime - this.clearedCloudAt
                this.reentryHeat = since < REENTRY_AFTER
                    ? 0
                    : Math.min(1, (since - REENTRY_AFTER) / REENTRY_RAMP)
            }

            this.reentry?.update(delta, this.reentryHeat)
        }

        if (this.variant === 'main') advanceMarquee(delta)
    }

    /**
     * The last stretch of the landing, against the arched door.
     * Only the triple castles. Standing here and pressing E is the way in.
     */
    atDoor(position)
    {
        if (this.variant !== 'ring') return false

        const local = this.worldToLocal(position.x, position.z)
        return local.x >= -2.7 && local.x <= 2.7
            && local.z >= 7.05 && local.z <= 8.55
            && position.y >= 0.35 && position.y <= 2.15
    }

    /**
     * On the landing, a few metres out from the door, looking along the
     * walkway away from the castle. Writes the world position and returns the yaw.
     */
    doorExit(target)
    {
        const placed = this.localToWorld(0, 10.5)
        const y = this.surfaceAt(placed.x, placed.z)
        target.set(placed.x, Number.isFinite(y) ? y : DECK_Y, placed.z)
        return this.yaw + Math.PI
    }

    /** Horizontal metres to the lid, or Infinity when the visitor is on another deck. */
    #hatchDistance(visitor)
    {
        if (!this.hatch || !visitor) return Infinity

        this.hatch.updateWorldMatrix(true, false)
        const hatch = this.hatch.getWorldPosition(_hatchPoint)
        if (Math.abs(visitor.y - hatch.y) >= HATCH_REACH_Y) return Infinity

        const dx = visitor.x - hatch.x
        const dz = visitor.z - hatch.z
        return Math.hypot(dx, dz)
    }

    /** True when the visitor is on the platform beside the lid, not the court below it. */
    #besideHatch(visitor)
    {
        return this.#hatchDistance(visitor) < HATCH_REACH
    }

    /** World XZ into this castle's unrotated plan. */
    worldToLocal(x, z)
    {
        const dx = x - this.x
        const dz = z - this.z
        return {
            x: dx * this.cosYaw - dz * this.sinYaw,
            z: dx * this.sinYaw + dz * this.cosYaw
        }
    }

    /** Local plan point back into world XZ. */
    localToWorld(x, z)
    {
        return {
            x: this.x + x * this.cosYaw + z * this.sinYaw,
            z: this.z - x * this.sinYaw + z * this.cosYaw
        }
    }

    /**
     * Beside this walkway, trunk toward its outer end. Same pose as the
     * elephant at the main door. Writes the world position and returns the yaw.
     */
    elephantBerth(target)
    {
        const placed = this.localToWorld(this.berth.x, this.berth.z)
        target.set(placed.x, this.berth.y, placed.z)
        return this.yaw + this.berthYaw
    }

    /**
     * World position on the outer tip of this castle's dock, on its surface:
     * the wooden plank out of the main door, or the metal walkway out of a
     * triple castle's arch. The landing beacon stands here.
     */
    dockTip(target)
    {
        const local = this.variant === 'main'
            ? { x: (MAIN_DOOR.minX + MAIN_DOOR.maxX) * 0.5 * SCALE, y: MAIN_DOOR.y * SCALE, z: (MAIN_DOOR.maxZ - 0.35) * SCALE }
            : { x: 0, y: DECK_Y, z: (5.58 - 0.3) * SCALE }
        const placed = this.localToWorld(local.x, local.z)
        return target.set(placed.x, local.y, placed.z)
    }

    /**
     * Deck height where world (x, z) is over this castle, otherwise -Infinity
     * so the open sky has no floor. `ceiling` ignores a deck that is overhead,
     * which is how the elephant flies through the cloud beneath the court
     * without being lifted onto it.
     */
    surfaceAt(x, z, ceiling = Infinity)
    {
        const local = this.worldToLocal(x, z)
        let height = Number.NEGATIVE_INFINITY

        for (const box of this.platforms)
        {
            if (local.x < box.min.x || local.x > box.max.x || local.z < box.min.z || local.z > box.max.z) continue
            if (box.max.y > ceiling) continue
            if (box.max.y > height) height = box.max.y
        }

        return height
    }

    #useModel(model)
    {
        this.group.remove(this.placeholder)
        this.placeholder.traverse((child) =>
        {
            child.geometry?.dispose()
        })
        const material = this.placeholder.children[0]?.material
        material?.dispose()
        this.placeholder = null
        this.group.add(model)

        if (this.variant === 'main')
        {
            const { floors, walls } = measureCastleCollision(model, this.group, {
                deckY: MAIN_DECK_Y,
                stairs: false,
                sealDoor: false
            })
            const floorsOutside = floors.filter((box) => !overTheRing(box))
            const wallsOutside = walls.filter((box) => !overTheRing(box))
            this.platforms.push(...floorsOutside)
            this.walls.push(...wallsOutside)
            this.flightVoxels = measureFlightVoxels(model, this.group)
            console.info(`main castle collision: ${floorsOutside.length} raised cells, ${wallsOutside.length} wall cells, ${this.flightVoxels.count} flight voxels`)
            return
        }

        // The outer castles share one set of boxes. Measure whichever copy
        // arrives first, in that castle's own space.
        if (ringMeasured)
        {
            this.flightVoxels = ringFlightVoxels
            return
        }

        const { floors, walls } = measureCastleCollision(model, this.group)
        this.platforms.push(...floors)
        // The placeholder blocks were solid towers. The measured set follows
        // the stone, and leaves the stairs and the courtyard open.
        this.walls.splice(0, this.walls.length, ...walls)
        ringFlightVoxels = measureFlightVoxels(model, this.group)
        this.flightVoxels = ringFlightVoxels
        ringMeasured = true

        console.info(`castle collision: ${floors.length} courtyard cells, ${walls.length} wall cells, ${ringFlightVoxels.count} flight voxels`)
    }
}
