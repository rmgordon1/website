import * as THREE from 'three'
import { createGLTFLoader } from './gltfLoader.js'
import { assetUrl } from '../config.js'

/** One low-poly puff. Every cloud is built from copies of it. */
const CLOUD_URL = assetUrl('/models/cloud.glb')

/**
 * How many other puffs a triangle may be buried in and still be drawn.
 * 0 keeps only the outer skin. 1 also keeps the layer just under it, which
 * keeps the old look: the material is translucent, and the old cloud read as
 * dense because its layers showed through each other.
 */
export const CLOUD_CULL_DEPTH = 1

/** Slow drift of each whole cloud, in export units and radians per second. */
const BOB_HEIGHT = 0.06
const BOB_RATE = 0.41
const SWAY = 0.05
const SWAY_RATE_X = 0.23
const SWAY_RATE_Z = 0.17

/** Seeded, so the same layout gives the same cloud on every load. */
function mulberry32(seed)
{
    let state = seed >>> 0
    return () =>
    {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function insideFootprint(footprint, x, z)
{
    for (const [minX, maxX, minZ, maxZ] of footprint)
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true
    return false
}

/** Distance in from the footprint's edge, up to `limit`. Probed on rings of eight. */
const EDGE_STEPS = 6
const EDGE_DIRECTIONS = Array.from({ length: 8 }, (_, index) => [Math.cos(index * Math.PI / 4), Math.sin(index * Math.PI / 4)])

function edgeDistance(footprint, x, z, limit)
{
    for (let step = 1; step <= EDGE_STEPS; step++)
    {
        const reach = limit * step / EDGE_STEPS
        for (const [dx, dz] of EDGE_DIRECTIONS)
            if (!insideFootprint(footprint, x + dx * reach, z + dz * reach)) return limit * (step - 1) / EDGE_STEPS
    }
    return limit
}

/**
 * Centre, rotation and three radii for every puff in a layout. A layout
 * says where a cloud's puffs go, in the castle export's units (the
 * castle root scales them by SCALE). Castle.js holds the two layouts, since
 * they follow its floors. Fields:
 *
 * - `seed`: the same seed gives the same cloud on every load.
 * - `count` puffs, centred inside `footprint` (rectangles [minX, maxX, minZ,
 *   maxZ] whose union is the plan) and between `bottom` and `top`.
 * - `puff`: radius range along each of a puff's three axes, so puffs are
 *   lumpy ellipsoids rather than balls.
 * - `rise` packs more puffs toward the top (weight 1 + rise there). `taper`
 *   thins out that fraction of the height at either end.
 * - `rim`, `lift`: within `rim` of the footprint's edge the lowest puffs are
 *   raised by up to `lift` of the height, so the underside is domed rather
 *   than a flat-bottomed wall.
 */
export function placePuffs(layout)
{
    const random = mulberry32(layout.seed)
    const span = layout.top - layout.bottom
    const minX = Math.min(...layout.footprint.map((box) => box[0]))
    const maxX = Math.max(...layout.footprint.map((box) => box[1]))
    const minZ = Math.min(...layout.footprint.map((box) => box[2]))
    const maxZ = Math.max(...layout.footprint.map((box) => box[3]))
    const puffs = []

    while (puffs.length < layout.count)
    {
        const x = minX + (maxX - minX) * random()
        const z = minZ + (maxZ - minZ) * random()
        if (!insideFootprint(layout.footprint, x, z)) continue

        // More puffs near the top, fewer at the very ends.
        const height = random()
        let weight = (1 + layout.rise * height) / (1 + Math.max(0, layout.rise))
        if (layout.taper > 0)
            weight *= THREE.MathUtils.smoothstep(height, 0, layout.taper) * THREE.MathUtils.smoothstep(1 - height, 0, layout.taper)
        if (random() > weight) continue

        const rim = layout.rim > 0 ? 1 - edgeDistance(layout.footprint, x, z, layout.rim) / layout.rim : 0
        const floor = layout.bottom + span * layout.lift * rim
        const [low, high] = layout.puff

        puffs.push({
            center: new THREE.Vector3(x, floor + (layout.top - floor) * height, z),
            quaternion: randomQuaternion(random),
            radii: new THREE.Vector3(
                low + (high - low) * random(),
                low + (high - low) * random(),
                low + (high - low) * random()
            )
        })
    }

    return puffs
}

/** Uniformly random orientation, so the facets of neighbouring puffs never line up. */
function randomQuaternion(random)
{
    const u = random()
    const v = random() * Math.PI * 2
    const w = random() * Math.PI * 2
    const a = Math.sqrt(1 - u)
    const b = Math.sqrt(u)
    return new THREE.Quaternion(a * Math.sin(v), a * Math.cos(v), b * Math.sin(w), b * Math.cos(w))
}

/**
 * The puff's triangles as corners into a welded list of positions. The
 * export is flat-shaded, so 240 vertices share 42 positions. Insideness is
 * tested once per position, not once per vertex.
 */
function weldCorners(geometry)
{
    const position = geometry.attributes.position
    const index = geometry.index
    const cornerCount = index ? index.count : position.count
    const keys = new Map()
    const points = []
    const welded = new Uint32Array(position.count)

    for (let vertex = 0; vertex < position.count; vertex++)
    {
        const x = position.getX(vertex)
        const y = position.getY(vertex)
        const z = position.getZ(vertex)
        const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
        if (!keys.has(key))
        {
            keys.set(key, points.length)
            points.push(new THREE.Vector3(x, y, z))
        }
        welded[vertex] = keys.get(key)
    }

    const corners = new Uint32Array(cornerCount)
    for (let corner = 0; corner < cornerCount; corner++)
        corners[corner] = index ? index.getX(corner) : corner

    return { points, welded, corners }
}

/** Puffs bucketed by centre, so each one only tests the puffs that can touch it. */
function cellKey(x, y, z)
{
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512)
}

/** For each puff, the puffs close enough to overlap it. `centres` is flat xyz. */
function puffNeighbours(centres, reaches)
{
    const count = reaches.length
    let largest = 0
    for (let index = 0; index < count; index++) largest = Math.max(largest, reaches[index])
    const cell = largest * 2
    const grid = new Map()
    const cells = new Int32Array(count * 3)

    for (let index = 0; index < count; index++)
    {
        for (let axis = 0; axis < 3; axis++) cells[index * 3 + axis] = Math.floor(centres[index * 3 + axis] / cell)
        const key = cellKey(cells[index * 3], cells[index * 3 + 1], cells[index * 3 + 2])
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(index)
    }

    const neighbours = []
    for (let index = 0; index < count; index++)
    {
        const near = []
        const x = centres[index * 3]
        const y = centres[index * 3 + 1]
        const z = centres[index * 3 + 2]

        for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
        {
            const bucket = grid.get(cellKey(cells[index * 3] + dx, cells[index * 3 + 1] + dy, cells[index * 3 + 2] + dz))
            if (!bucket) continue

            for (let k = 0; k < bucket.length; k++)
            {
                const other = bucket[k]
                if (other === index) continue
                const ox = centres[other * 3] - x
                const oy = centres[other * 3 + 1] - y
                const oz = centres[other * 3 + 2] - z
                const reach = reaches[index] + reaches[other]
                if (ox * ox + oy * oy + oz * oz < reach * reach) near.push(other)
            }
        }
        neighbours.push(near)
    }

    return neighbours
}

const _point = new THREE.Vector3()
const _normal = new THREE.Vector3()
const _matrix = new THREE.Matrix3()
const _rotation = new THREE.Matrix4()

/**
 * Every puff merged into one mesh, minus the triangles buried in more than
 * `depth` other puffs. A triangle counts as inside another puff only when
 * all three corners are, so the triangles that cross a seam stay and the
 * outer skin never opens up.
 */
export function buildCloudGeometry(base, layout, depth = CLOUD_CULL_DEPTH)
{
    const puffs = placePuffs(layout)
    const { points, welded, corners } = weldCorners(base)
    const triangleCount = corners.length / 3
    const pointCount = points.length
    const words = Math.ceil(pointCount / 32)
    const count = puffs.length

    // Flat arrays: the test below runs millions of times.
    const surface = new Float64Array(count * pointCount * 3)
    const centres = new Float64Array(count * 3)
    /** World offset into a unit ball: diag(1 / radii) times the inverse rotation. */
    const intoUnit = new Float64Array(count * 9)
    const reaches = new Float64Array(count)
    const nearest = new Float64Array(count)

    puffs.forEach((puff, index) =>
    {
        const { center, radii, quaternion } = puff
        centres.set([center.x, center.y, center.z], index * 3)
        reaches[index] = Math.max(radii.x, radii.y, radii.z)
        nearest[index] = Math.min(radii.x, radii.y, radii.z)

        _matrix.setFromMatrix4(_rotation.makeRotationFromQuaternion(quaternion)).transpose()
        const e = _matrix.elements // column-major
        for (let row = 0; row < 3; row++)
        {
            const scale = 1 / radii.getComponent(row)
            intoUnit[index * 9 + row * 3] = e[row] * scale
            intoUnit[index * 9 + row * 3 + 1] = e[row + 3] * scale
            intoUnit[index * 9 + row * 3 + 2] = e[row + 6] * scale
        }

        points.forEach((point, slot) =>
        {
            _point.copy(point).multiply(radii).applyQuaternion(quaternion).add(center)
            surface.set([_point.x, _point.y, _point.z], (index * pointCount + slot) * 3)
        })
    })

    const neighbours = puffNeighbours(centres, reaches)
    const slots = new Uint32Array(corners.length)
    for (let corner = 0; corner < corners.length; corner++) slots[corner] = welded[corners[corner]]

    const keep = puffs.map(() => new Uint8Array(triangleCount))
    const mask = new Uint32Array(words)
    const buried = new Uint8Array(triangleCount)
    let kept = 0

    for (let index = 0; index < count; index++)
    {
        buried.fill(0)
        let hidden = 0

        for (const other of neighbours[index])
        {
            if (hidden === triangleCount) break

            const ox = centres[other * 3]
            const oy = centres[other * 3 + 1]
            const oz = centres[other * 3 + 2]
            const outer = reaches[other] * reaches[other]
            const inner = nearest[other] * nearest[other]
            const m = other * 9

            // Which of this puff's surface positions sit inside the neighbour.
            mask.fill(0)
            let inside = 0
            for (let slot = 0; slot < pointCount; slot++)
            {
                const at = (index * pointCount + slot) * 3
                const dx = surface[at] - ox
                const dy = surface[at + 1] - oy
                const dz = surface[at + 2] - oz
                const distance = dx * dx + dy * dy + dz * dz
                if (distance >= outer) continue

                let within = distance < inner
                if (!within)
                {
                    const ux = intoUnit[m] * dx + intoUnit[m + 1] * dy + intoUnit[m + 2] * dz
                    const uy = intoUnit[m + 3] * dx + intoUnit[m + 4] * dy + intoUnit[m + 5] * dz
                    const uz = intoUnit[m + 6] * dx + intoUnit[m + 7] * dy + intoUnit[m + 8] * dz
                    within = ux * ux + uy * uy + uz * uz < 1 - 1e-6
                }
                if (!within) continue

                mask[slot >> 5] |= 1 << (slot & 31)
                inside++
            }
            // A buried triangle needs all three corners inside.
            if (inside < 3) continue

            for (let triangle = 0; triangle < triangleCount; triangle++)
            {
                if (buried[triangle] > depth) continue
                const a = slots[triangle * 3]
                const b = slots[triangle * 3 + 1]
                const c = slots[triangle * 3 + 2]
                if ((mask[a >> 5] & (1 << (a & 31))) && (mask[b >> 5] & (1 << (b & 31))) && (mask[c >> 5] & (1 << (c & 31))))
                {
                    buried[triangle]++
                    if (buried[triangle] > depth) hidden++
                }
            }
        }

        for (let triangle = 0; triangle < triangleCount; triangle++)
        {
            if (buried[triangle] > depth) continue
            keep[index][triangle] = 1
            kept++
        }
    }

    return mergePuffs(base, puffs, corners, keep, kept)
}

/** The kept triangles of every puff, each puff's copy moved, turned and stretched into place. */
function mergePuffs(base, puffs, corners, keep, kept)
{
    const source = base.attributes
    const extra = Object.keys(source).filter((name) => name !== 'position' && name !== 'normal')
    const vertexCount = kept * 3
    const positions = new Float32Array(vertexCount * 3)
    const normals = source.normal ? new Float32Array(vertexCount * 3) : null
    const extras = extra.map((name) => new Float32Array(vertexCount * source[name].itemSize))
    const triangleCount = corners.length / 3
    let vertex = 0

    puffs.forEach((puff, index) =>
    {
        for (let triangle = 0; triangle < triangleCount; triangle++)
        {
            if (!keep[index][triangle]) continue

            for (let k = 0; k < 3; k++)
            {
                const from = corners[triangle * 3 + k]

                _point.fromBufferAttribute(source.position, from).multiply(puff.radii).applyQuaternion(puff.quaternion).add(puff.center)
                _point.toArray(positions, vertex * 3)

                // Stretching a sphere into an ellipsoid bends its normals the other way.
                if (normals)
                {
                    _normal.fromBufferAttribute(source.normal, from).divide(puff.radii).applyQuaternion(puff.quaternion).normalize()
                    _normal.toArray(normals, vertex * 3)
                }

                extra.forEach((name, slot) =>
                {
                    const attribute = source[name]
                    for (let item = 0; item < attribute.itemSize; item++)
                        extras[slot][vertex * attribute.itemSize + item] = attribute.getComponent(from, item)
                })

                vertex++
            }
        }
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    extra.forEach((name, slot) => geometry.setAttribute(name, new THREE.BufferAttribute(extras[slot], source[name].itemSize)))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometry.userData.puffs = puffs.length
    geometry.userData.triangles = kept
    geometry.userData.trianglesBeforeCull = puffs.length * triangleCount
    return geometry
}

let puffPromise = null
const cloudPromises = new Map()

/** The puff's geometry and material, downloaded once. */
function loadPuff()
{
    if (!puffPromise)
    {
        puffPromise = createGLTFLoader().loadAsync(CLOUD_URL).then((gltf) =>
        {
            let found = null
            gltf.scene.traverse((child) =>
            {
                if (!found && child.isMesh) found = child
            })
            if (!found) throw new Error('cloud.glb has no mesh')
            return { geometry: found.geometry, material: found.material }
        })
    }

    return puffPromise
}

/** One merged mesh per layout. Castles with the same layout share its geometry. */
function loadCloudGeometry(layout)
{
    if (!cloudPromises.has(layout))
    {
        cloudPromises.set(layout, loadPuff().then(({ geometry, material }) =>
        {
            const started = globalThis.performance?.now() ?? 0
            const merged = buildCloudGeometry(geometry, layout)
            const elapsed = (globalThis.performance?.now() ?? 0) - started
            const { puffs, triangles, trianglesBeforeCull } = merged.userData
            console.info(`cloud (${layout.name}): ${puffs} puffs, kept ${triangles} of ${trianglesBeforeCull} triangles in ${elapsed.toFixed(0)} ms`)
            return { geometry: merged, material }
        }))
    }

    return cloudPromises.get(layout)
}

/** A castle's cloud: the merged puffs, bobbing slowly as one piece. */
export class Cloud
{
    constructor(geometry, material, phase = 0)
    {
        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.name = 'cloud'
        // Translucent: a solid shadow from it would stamp hard shapes on the bricks.
        this.mesh.castShadow = false
        this.mesh.receiveShadow = true

        /** Moves the whole cloud. Child of the castle root, so it is in export units. */
        this.group = new THREE.Group()
        this.group.add(this.mesh)
        this.time = phase
    }

    update(delta)
    {
        this.time += delta
        const time = this.time
        this.group.position.set(
            Math.sin(time * SWAY_RATE_X) * SWAY,
            Math.sin(time * BOB_RATE) * BOB_HEIGHT,
            Math.cos(time * SWAY_RATE_Z) * SWAY
        )
    }
}

/** A cloud for `layout`. `phase` keeps neighbouring clouds out of step. */
export async function loadCloud(layout, phase = 0)
{
    const { geometry, material } = await loadCloudGeometry(layout)
    return new Cloud(geometry, material, phase)
}
