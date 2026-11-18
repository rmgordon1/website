import * as THREE from 'three'
import { createGLTFLoader } from './gltfLoader.js'
import { RingFire } from './RingFire.js'
import { assetUrl } from '../config.js'

/** The gold hoop and its flag. Served out of static/. */
const RING_URL = assetUrl('/models/ring.glb')

/**
 * The floor plan, in metres, with the main castle at the origin.
 * Image-right is +X and image-down is +Z, at half a metre per pixel.
 * `yaw` turns local +Z, the hole, so the ring's long axis in plan matches
 * the oval. 0 lies east-west, ±π/2 lies north-south, and ±π/4 are the
 * diagonals. Each one can be flown from either side. The ring between the
 * triple castles shares their x = -151.
 */
const HOOP_SPOTS = [
    { x: -345, z: -50, yaw: -Math.PI / 4 },
    { x: -345, z: 50, yaw: Math.PI / 4 },
    { x: -267, z: -90, yaw: -Math.PI / 2 },
    { x: -267, z: 90, yaw: Math.PI / 2 },
    { x: -191, z: -50, yaw: Math.PI / 4 },
    { x: -191, z: 50, yaw: -Math.PI / 4 },
    { x: -151, z: 0, yaw: -Math.PI / 2 },
    { x: -105, z: -50, yaw: -Math.PI / 4 },
    { x: -105, z: 50, yaw: Math.PI / 4 },
    { x: -28, z: -90, yaw: -Math.PI / 2 },
    { x: -28, z: 90, yaw: Math.PI / 2 },
    { x: 50, z: -50, yaw: Math.PI / 4 },
    { x: 50, z: 50, yaw: -Math.PI / 4 }
]

export const HOOP_COUNT = HOOP_SPOTS.length

/**
 * How far a hoop may rise or drop from the course altitude, in metres.
 * World Z is north-south on the plan. Up is Y.
 */
export const HOOP_Z_JITTER = 20

/**
 * A stable change in height, from 2.5m out to the full jitter. The same
 * hoop always sits at the same height.
 */
function heightShift(index)
{
    const wave = Math.sin(index * 2.399963 + 0.9)
    const sign = wave < 0 ? -1 : 1
    return sign * (2.5 + Math.abs(wave) * (HOOP_Z_JITTER - 2.5))
}

/**
 * The file's hoop is about 38 across. The hole is a circle of radius 16.3
 * about the origin, so this scale makes the opening about 15m across.
 */
const HOOP_SCALE = 0.45

/** World height of the opening's centre. A short climb off the court. */
const HOOP_ALTITUDE = 11

/**
 * The gold is a ring in the file's XY plane, centred on the origin.
 * The inner edge of the mesh sits at 16.29; the collision hole stops just
 * inside that, and the outer edge just past the rim.
 */
const HOOP_CENTER_X = 0
const HOOP_CENTER_Y = 0
const HOOP_INNER = 16.15
const HOOP_OUTER = 19.25

const _cross = new THREE.Vector3()

/** One gate per oval on the floor plan. Local +Z is the hole. */
export function hoopPlacements()
{
    return HOOP_SPOTS.map((spot, index) =>
    {
        const yaw = spot.yaw
        const placed = {
            index,
            x: spot.x,
            y: HOOP_ALTITUDE - HOOP_CENTER_Y * HOOP_SCALE + heightShift(index),
            z: spot.z,
            yaw,
            scale: HOOP_SCALE
        }

        return {
            ...placed,
            center: hoopPoint(placed, HOOP_CENTER_X, HOOP_CENTER_Y, 0),
            normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
            passRadius: HOOP_INNER * HOOP_SCALE * 0.98
        }
    })
}

/** A file-space point on a hoop, in world metres. */
export function hoopPoint(hoop, fileX, fileY, fileZ, target = new THREE.Vector3())
{
    const x = fileX * hoop.scale
    const y = fileY * hoop.scale
    const z = fileZ * hoop.scale
    const cos = Math.cos(hoop.yaw)
    const sin = Math.sin(hoop.yaw)

    return target.set(
        hoop.x + x * cos + z * sin,
        hoop.y + y,
        hoop.z - x * sin + z * cos
    )
}

/**
 * One collider per gate, in that hoop's own plan. The hole runs along local
 * Z. The circle is the gold band; the box is the cloth hanging under it.
 */
export function hoopColliders(hoops = hoopPlacements())
{
    return hoops.map((hoop) =>
    {
        const { scale } = hoop
        const cos = Math.cos(hoop.yaw)
        const sin = Math.sin(hoop.yaw)

        return {
            hoop: {
                x: HOOP_CENTER_X * scale,
                y: hoop.center.y,
                z: 0,
                inner: HOOP_INNER * scale,
                outer: HOOP_OUTER * scale,
                halfDepth: 1.4
            },
            walls: [new THREE.Box3(
                new THREE.Vector3(-7.1 * scale, hoop.y - 62.7 * scale, -3.2 * scale),
                new THREE.Vector3(7.1 * scale, hoop.y - 20.7 * scale, 4.4 * scale)
            )],
            worldToLocal(x, z)
            {
                const dx = x - hoop.x
                const dz = z - hoop.z
                return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
            },
            localToWorld(x, z)
            {
                return {
                    x: hoop.x + x * cos + z * sin,
                    z: hoop.z - x * sin + z * cos
                }
            }
        }
    })
}

/**
 * Cloth colours that still read as stripes against the gold hoop.
 * Spread far enough apart that a flag never gets two stripes of one hue.
 */
const STRIPE_PALETTE = [
    '#f4f1ea',
    '#d7263d',
    '#1f4e9a',
    '#f2c14e',
    '#2f7d4a',
    '#6b3fa0',
    '#e07a3d',
    '#14919b',
    '#f2a2c0',
    '#243447'
]

/** Three different stripe colours. Neighbouring hoops start at different slots. */
function stripeColors(index)
{
    const count = STRIPE_PALETTE.length
    const first = index % count
    const second = (first + 3) % count
    let third = (second + 4) % count
    while (third === first || third === second) third = (third + 1) % count

    return [first, second, third].map((slot) => new THREE.Color(STRIPE_PALETTE[slot]))
}

/**
 * Gives this hoop its own three stripe colours.
 * Both pale stripes live on one mesh, one on each side of local X, and the
 * centre stripe is the other mesh. The file shares that geometry and those
 * materials across every hoop, so each hoop gets its own copy.
 */
export function paintFlag(root, index)
{
    const white = root.getObjectByName('Cube_002')
    const red = root.getObjectByName('Cube_002_1')
    if (!white?.isMesh || !red?.isMesh) return

    const [left, right, center] = stripeColors(index)
    const geometry = white.geometry.clone()
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)

    for (let vertex = 0; vertex < position.count; vertex++)
    {
        const color = position.getX(vertex) < 0 ? left : right
        colors[vertex * 3] = color.r
        colors[vertex * 3 + 1] = color.g
        colors[vertex * 3 + 2] = color.b
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    white.geometry = geometry

    const cloth = white.material.clone()
    cloth.vertexColors = true
    cloth.color.set('#ffffff')
    white.material = cloth

    const band = red.material.clone()
    band.color.copy(center)
    red.material = band
}

/** The gold material, copied so one gate can glow without lighting the rest. */
function goldMaterials(root)
{
    const materials = []

    root.traverse((child) =>
    {
        if (!child.isMesh) return

        child.castShadow = true
        child.receiveShadow = true

        const list = Array.isArray(child.material) ? child.material : [child.material]
        const next = list.map((material) =>
        {
            if (!material?.name?.includes('Gold')) return material

            const copy = material.clone()
            copy.emissive = new THREE.Color('#ffb84a')
            copy.emissiveIntensity = 0
            materials.push(copy)
            return copy
        })

        child.material = Array.isArray(child.material) ? next : next[0]
    })

    return materials
}

/** The ring of gates around the main castle. */
export class Racetrack
{
    constructor({ loadModel = true } = {})
    {
        this.group = new THREE.Group()
        this.hoops = hoopPlacements()
        /** Same shape as a castle: local walls, and a round opening along local Z. */
        this.colliders = hoopColliders(this.hoops)
        /** Rings cleared on the current lap. Any order, each one once. */
        this.cleared = new Set()
        /** How many of this lap are done. Stays full until the next ring. */
        this.found = 0
        this.laps = 0
        /** Set once the first ring of a lap is flown. Every hoop then burns. */
        this.ignited = false
        /** Hoops already flown this lap. Their fire is red; the rest stay green. */
        this.red = new Set()
        this.mixers = []
        this.gold = []
        this.pivots = []
        this.fires = []
        this.#previous = null

        for (const hoop of this.hoops)
        {
            const pivot = new THREE.Group()
            pivot.position.set(hoop.x, hoop.y, hoop.z)
            pivot.rotation.y = hoop.yaw
            pivot.scale.setScalar(hoop.scale)

            const fire = new RingFire({
                centerX: HOOP_CENTER_X,
                centerY: HOOP_CENTER_Y,
                inner: HOOP_INNER + 3.4,
                outer: HOOP_OUTER - 1.4
            })
            pivot.add(fire.group)
            this.group.add(pivot)
            this.pivots.push(pivot)
            this.fires.push(fire)
        }

        if (loadModel) this.#load()
    }

    #previous = null

    /** A dismount mid-lap. Progress is wiped and the fires go out, with no lap counted. */
    abandon()
    {
        this.found = 0
        this.cleared.clear()
        this.red.clear()
        this.ignited = false
        for (const fire of this.fires) fire.extinguish()
        this.resetApproach()
    }

    /** Forget the last sample, so a remount does not draw a line across the sky. */
    resetApproach()
    {
        this.#previous = null
    }

    /**
     * A crossing of any ring not yet taken, from either side, when the point
     * stays inside the hole. A ring counts once per lap.
     */
    sample(point)
    {
        if (!this.#previous)
        {
            this.#previous = point.clone()
            return null
        }

        const hits = []
        for (const hoop of this.hoops)
        {
            if (this.cleared.has(hoop.index)) continue
            if (this.#passed(point, hoop)) hits.push(hoop.index)
        }

        this.#previous.copy(point)
        if (hits.length === 0) return null

        const started = this.cleared.size === 0
        if (started) this.red.clear()
        this.ignited = true
        for (const index of hits)
        {
            this.cleared.add(index)
            this.red.add(index)
        }

        const completed = this.cleared.size
        const lap = completed === HOOP_COUNT
        if (lap) this.completeLap()
        else this.found = completed

        return { index: hits[hits.length - 1], found: lap ? completed : this.found, started, lap, laps: this.laps }
    }

    /** Counts the lap and puts the course back to unlit. Also the debug menu's shortcut. */
    completeLap()
    {
        this.laps += 1
        this.found = 0
        this.cleared.clear()
        this.red.clear()
        this.ignited = false
        for (const fire of this.fires) fire.extinguish()
    }

    /** True when the segment passes through this hoop's hole. */
    #passed(point, hoop)
    {
        const before = this.#side(this.#previous, hoop)
        const after = this.#side(point, hoop)
        if (before === 0 || after === 0 || (before < 0) === (after < 0)) return false

        const t = before / (before - after)
        _cross.lerpVectors(this.#previous, point, t)
        return _cross.distanceTo(hoop.center) <= hoop.passRadius
    }

    /** Point sizes are in device pixels, so the flames track the drawing buffer. */
    setViewport(height, fov)
    {
        for (const fire of this.fires) fire.setViewport(height, fov)
    }

    /** Advances the flags. After the first ring, every hoop burns. */
    update(delta, time)
    {
        for (const mixer of this.mixers) mixer.update(delta)

        const pulse = this.ignited ? 0.12 : 0.55 + 0.4 * Math.sin(time * 3.5)

        for (let index = 0; index < this.gold.length; index++)
        {
            for (const material of this.gold[index]) material.emissiveIntensity = pulse
        }

        for (let index = 0; index < this.fires.length; index++)
        {
            this.fires[index].setRed(this.red.has(index))
            this.fires[index].update(delta, this.ignited)
        }
    }

    #side(point, hoop)
    {
        return hoop.normal.x * (point.x - hoop.center.x)
            + hoop.normal.y * (point.y - hoop.center.y)
            + hoop.normal.z * (point.z - hoop.center.z)
    }

    #load()
    {
        createGLTFLoader().loadAsync(RING_URL)
            .then((gltf) =>
            {
                const clip = gltf.animations[0] ?? null

                for (let index = 0; index < this.hoops.length; index++)
                {
                    const ring = gltf.scene.clone(true)
                    paintFlag(ring, index)
                    this.pivots[index].add(ring)
                    this.gold.push(goldMaterials(ring))

                    if (!clip) continue

                    const mixer = new THREE.AnimationMixer(ring)
                    mixer.clipAction(clip).play()
                    this.mixers.push(mixer)
                }
            })
            .catch((error) =>
            {
                console.warn('Racetrack hoops failed to load.', error)
            })
    }
}
