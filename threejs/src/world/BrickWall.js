import * as THREE from 'three'
import { createGLTFLoader } from './gltfLoader.js'
import { ELEPHANT } from '../entities/Elephant.js'
import { withMatrixInside, driveMatrixClock } from './matrixBricks.js'
import { assetUrl } from '../config.js'

/** One brick from static/brick.glb. The wall in that file is this brick, repeated. */
const BRICK_URL = assetUrl('/models/brick.glb')

/** Thickness, height, and length of the authored brick, in metres. */
export const BRICK = { width: 0.75, height: 0.75, length: 2 }

/**
 * Centres of the wall in brick.glb. Ten courses of five, in a running bond:
 * every other course sits half a brick along, with a finger of mortar between.
 */
const COURSE_Y = [0, 0.85, 1.648, 2.498, 3.296, 4.146, 4.944, 5.794, 6.592, 7.442]
const EVEN_Z = -8.28
const ODD_Z = -9.28
const PITCH_Z = 2.07
const PER_COURSE = 5

/** How fast a loose brick sheds its speed. No gravity: friction is the only pull. */
const FRICTION = 0.9

/** A loose brick is gone once it has drifted this long, or once it has nearly stopped. */
const DRIFT_LIFE = 2.8
const REST_SPEED = 0.3

/** She has to be moving. Parked against the wall, the bricks stay put. */
const STRIKE_SPEED = 2

const _matrix = new THREE.Matrix4()
const _inverse = new THREE.Matrix4()
const _relative = new THREE.Quaternion()
const _point = new THREE.Vector3()
const _body = new THREE.Vector3()
const _away = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _half = new THREE.Vector3()
const _dummy = new THREE.Object3D()
const _halfTurned = new THREE.Vector3()
const _turnedMatrix = new THREE.Matrix4()

/** A brick laid along X instead of Z: a quarter turn about Y. */
const QUARTER_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)

/**
 * A brick as a plain box, textured like brick.glb's: the material reads its
 * second UV set, and each flat face of the file's brick spans the texture's
 * full width along the brick's length and a 0.3-high strip across it.
 */
function plainBrick()
{
    const geometry = new THREE.BoxGeometry(BRICK.width, BRICK.height, BRICK.length)
    const uv = geometry.attributes.uv
    const uv1 = new Float32Array(uv.count * 2)

    for (let index = 0; index < uv.count; index++)
    {
        // Box faces come in pairs of four corners: ±X, ±Y, ±Z. On ±Y the
        // box runs its U across the brick; turn it to run along the length.
        const face = Math.floor(index / 4) >> 1
        let u = uv.getX(index)
        let v = uv.getY(index)
        if (face === 1) [u, v] = [v, u]
        uv1[index * 2] = u
        uv1[index * 2 + 1] = v * 0.3
    }

    geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2))
    return geometry
}

/** Half-size, along each axis, of a hx × hy × hz box turned by `matrix`. */
function halfExtents(matrix, hx, hy, hz, target)
{
    const e = matrix.elements
    return target.set(
        Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz,
        Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz,
        Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz
    )
}

/** One slot per brick in the authored wall. */
export function brickSlots()
{
    const slots = []

    for (let course = 0; course < COURSE_Y.length; course++)
    {
        const z0 = course % 2 === 0 ? EVEN_Z : ODD_Z

        for (let index = 0; index < PER_COURSE; index++)
        {
            slots.push(new THREE.Vector3(0, COURSE_Y[course], z0 + index * PITCH_Z))
        }
    }

    return slots
}

/**
 * A running-bond panel filling -halfAlong..halfAlong by -halfAcross..halfAcross
 * exactly, with the bricks touching: no mortar. Courses are `size` deep,
 * stacked across, and stretched by the hair it takes for a whole number of
 * them to fill the panel. Along each course the bricks are laid end to end;
 * every other course starts with a half brick, and the last brick in a
 * course is cut to finish flush. `place` gets the brick's centre, its
 * length, and how much its depth across the panel is stretched.
 */
function bondPanel(halfAlong, halfAcross, size, place)
{
    const slots = []
    const courses = Math.max(1, Math.round((halfAcross * 2) / size))
    const depth = (halfAcross * 2) / courses
    const stretch = depth / size

    for (let course = 0; course < courses; course++)
    {
        const across = -halfAcross + depth * (course + 0.5)
        let start = -halfAlong
        let first = course % 2 === 0 ? BRICK.length : BRICK.length * 0.5

        while (start < halfAlong - 0.05)
        {
            const length = Math.min(first, halfAlong - start)
            if (length > 0.15) slots.push(place(start + length * 0.5, across, length, stretch))
            start += length
            first = BRICK.length
        }
    }

    return slots
}

/**
 * A hollow cube of bricks, `half` metres from its centre to the middle of
 * each face. The ±X walls are the full outer size; the ±Z walls, floor and
 * roof fit between them, so the corners close with no gaps. The ±Z walls
 * are laid with turned bricks, so every face reads as running bond.
 */
export function cubeSlots(half)
{
    const slots = []
    const outer = half + BRICK.width * 0.5
    const inner = half - BRICK.width * 0.5
    // `scale` is in the brick's own frame: x its width, y its height, z its length.
    const brick = (x, y, z, turned, scale) => ({ position: new THREE.Vector3(x, y, z), turned, scale })
    const cut = (length) => length / BRICK.length

    for (const side of [-1, 1])
    {
        // Walls at ±X: bricks run along Z, courses climb Y.
        slots.push(...bondPanel(outer, outer, BRICK.height,
            (along, across, length, stretch) => brick(side * half, across, along, false,
                new THREE.Vector3(1, stretch, cut(length)))))
        // Walls at ±Z: bricks run along X, between the ±X walls.
        slots.push(...bondPanel(inner, outer, BRICK.height,
            (along, across, length, stretch) => brick(along, across, side * half, true,
                new THREE.Vector3(1, stretch, cut(length)))))
        // Floor and roof: bricks run along Z, rows step across X, inside all four walls.
        slots.push(...bondPanel(inner, inner, BRICK.width,
            (along, across, length, stretch) => brick(across, side * half, along, false,
                new THREE.Vector3(stretch, 1, cut(length)))))
    }

    return slots
}

/**
 * The running-bond wall, one instanced brick. She flies through it. A brick
 * she hits takes her speed along the line from her chest through that brick,
 * spins a little, and drifts. Friction bleeds the speed off, and then the
 * brick is gone. There is no gravity.
 */
export class BrickWall
{
    /**
     * `slots` defaults to the authored wall. A slot is either a position, or
     * `{ position, turned, length }` / `{ position, turned, scale }`: turned
     * lays it along X, length cuts it short, and scale sizes it in its own
     * frame (see cubeSlots). `matrixInside`, for a cube, is the half size
     * given to cubeSlots: the faces looking into the cube show Matrix rain.
     * `matrixMessage` is written in it across the inside of the +Z wall.
     */
    constructor({
        loadModel = true,
        slots = brickSlots(),
        matrixInside = null,
        matrixMessage = null,
        detailed = true,
        castShadow = true
    } = {})
    {
        /**
         * False keeps a plain 12-triangle box for every brick instead of the
         * file's bevelled one (638 triangles), with the same texture. For a
         * few thousand bricks that is millions of triangles a frame saved.
         */
        this.detailed = detailed
        this.group = new THREE.Group()
        this.matrixInside = matrixInside
        this.matrixMessage = matrixMessage
        const laid = slots.map((slot) => slot.isVector3 ? { position: slot } : slot)
        this.slots = laid.map((slot) => slot.position)
        this.bricks = laid.map(({ position, turned = false, length = BRICK.length, scale = null }) => ({
            position: position.clone(),
            turned,
            /** Along its own length, 1 for a whole brick. Cut bricks finish a course. */
            scale: scale ? scale.clone() : new THREE.Vector3(1, 1, length / BRICK.length),
            base: turned ? QUARTER_TURN.clone() : new THREE.Quaternion(),
            quaternion: turned ? QUARTER_TURN.clone() : new THREE.Quaternion(),
            velocity: new THREE.Vector3(),
            axis: new THREE.Vector3(0, 1, 0),
            spin: 0,
            angle: 0,
            loose: false,
            struck: false,
            age: 0,
            alive: true
        }))

        this.mesh = new THREE.InstancedMesh(
            plainBrick(),
            new THREE.MeshStandardMaterial({ color: '#8a4b3c', roughness: 0.92 }),
            this.bricks.length
        )
        if (matrixInside !== null)
        {
            const plain = this.mesh.material
            this.mesh.material = withMatrixInside(plain, matrixInside, matrixMessage)
            plain.dispose()
            driveMatrixClock(this.mesh)
        }
        this.mesh.castShadow = castShadow
        this.mesh.receiveShadow = true
        // Loose bricks leave the wall. A fixed bound would hide them.
        this.mesh.frustumCulled = false
        this.group.add(this.mesh)
        this.#write()

        if (loadModel) this.#load()
    }

    /**
     * Stand the wall across her path, bottom at her feet, centred on her,
     * a short flight out in front.
     */
    placeInFront(berth, yaw, distance = 22)
    {
        const forwardX = Math.sin(yaw)
        const forwardZ = Math.cos(yaw)
        const theta = yaw - Math.PI / 2
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        let midZ = 0

        for (const slot of this.slots) midZ += slot.z
        midZ /= this.slots.length

        const offsetX = midZ * sin
        const offsetZ = midZ * cos

        this.group.rotation.y = theta
        this.group.position.set(
            berth.x + forwardX * distance - offsetX,
            berth.y + BRICK.height * 0.5,
            berth.z + forwardZ * distance - offsetZ
        )
    }

    /** Centre the cube on `center`, turned to `yaw` so she faces a wall square on. */
    placeAround(center, yaw = 0)
    {
        this.group.rotation.y = yaw
        this.group.position.copy(center)
    }

    looseCount()
    {
        let count = 0
        for (const brick of this.bricks)
        {
            if (brick.loose) count++
        }
        return count
    }

    update(delta, elephant)
    {
        let dirty = false

        if (elephant && elephant.forwardSpeed > STRIKE_SPEED) dirty = this.#strike(elephant)

        for (const brick of this.bricks)
        {
            if (!brick.loose || !brick.alive) continue

            dirty = true
            brick.age += delta
            const drag = Math.exp(-FRICTION * delta)
            brick.velocity.multiplyScalar(drag)
            brick.spin *= drag
            brick.position.addScaledVector(brick.velocity, delta)
            brick.angle += brick.spin * delta
            brick.quaternion.setFromAxisAngle(brick.axis, brick.angle).multiply(brick.base)

            const settled = brick.age > 0.6 && brick.velocity.length() < REST_SPEED
            if (brick.age >= DRIFT_LIFE || settled) brick.alive = false
        }

        if (dirty) this.#nudge()
        if (dirty) this.#write()
    }

    #load()
    {
        createGLTFLoader().load(BRICK_URL, (gltf) =>
        {
            const source = gltf.scene.getObjectByName('brick')
            if (!source?.isMesh) return

            if (this.detailed)
            {
                const geometry = source.geometry.clone()
                geometry.computeBoundingBox()
                const center = geometry.boundingBox.getCenter(new THREE.Vector3())
                geometry.translate(-center.x, -center.y, -center.z)
                this.mesh.geometry.dispose()
                this.mesh.geometry = geometry
            }

            this.mesh.material.dispose()
            this.mesh.material = this.matrixInside === null
                ? source.material
                : withMatrixInside(source.material, this.matrixInside, this.matrixMessage)
        }, undefined, (error) =>
        {
            console.warn('Brick model failed to load; keeping the block.', error)
        })
    }

    /** Give every mortared brick her chest overlaps an impulse, once. */
    #strike(elephant)
    {
        this.group.updateMatrixWorld(true)
        elephant.group.updateMatrixWorld(true)
        _inverse.copy(this.group.matrixWorld).invert()
        _relative.copy(elephant.group.quaternion).invert().multiply(this.group.quaternion)
        _matrix.makeRotationFromQuaternion(_relative)

        const hx = BRICK.width * 0.5
        const hy = BRICK.height * 0.5
        const hz = BRICK.length * 0.5
        halfExtents(_matrix, hx, hy, hz, _half)
        _turnedMatrix.copy(_matrix).multiply(new THREE.Matrix4().makeRotationFromQuaternion(QUARTER_TURN))
        halfExtents(_turnedMatrix, hx, hy, hz, _halfTurned)

        _body.set(0, ELEPHANT.back * 0.5, 0)
        elephant.group.localToWorld(_body)

        const speed = Math.max(elephant.forwardSpeed, 4)
        let hit = false

        for (const brick of this.bricks)
        {
            if (brick.loose || !brick.alive) continue

            _point.copy(brick.position)
            this.group.localToWorld(_point)
            const world = _point.clone()
            elephant.group.worldToLocal(_point)

            if (!this.#insideBody(_point, brick.turned ? _halfTurned : _half)) continue

            _away.copy(world).sub(_body)
            if (_away.lengthSq() < 1e-8) _away.copy(elephant.forward)
            else _away.normalize()

            brick.velocity.copy(_away).transformDirection(_inverse).multiplyScalar(speed * 0.9)
            _axis.crossVectors(elephant.forward, _away)
            if (_axis.lengthSq() < 1e-6) _axis.set(0, 1, 0)
            else _axis.normalize()
            brick.axis.copy(_axis).transformDirection(_inverse)
            brick.spin = speed * 0.8
            brick.angle = 0
            brick.age = 0
            brick.loose = true
            brick.struck = true
            hit = true
        }

        return hit
    }

    #insideBody(local, half)
    {
        return local.x >= -ELEPHANT.beam * 0.5 - half.x
            && local.x <= ELEPHANT.beam * 0.5 + half.x
            && local.y >= -half.y
            && local.y <= ELEPHANT.back + half.y
            && local.z >= -ELEPHANT.length * 0.5 - half.z
            && local.z <= ELEPHANT.length * 0.5 + half.z
    }

    /** A loose brick that has moved into a neighbour knocks that one free too. */
    #nudge()
    {
        for (const loose of this.bricks)
        {
            if (!loose.struck || !loose.alive) continue
            if (loose.velocity.lengthSq() < 0.25) continue

            for (const other of this.bricks)
            {
                if (other.loose || !other.alive) continue

                // A turned brick is long in X. Overlap is half of each one's span.
                const spanX = ((loose.turned ? BRICK.length : BRICK.width) + (other.turned ? BRICK.length : BRICK.width)) * 0.5
                const spanZ = ((loose.turned ? BRICK.width : BRICK.length) + (other.turned ? BRICK.width : BRICK.length)) * 0.5
                const dx = Math.abs(loose.position.x - other.position.x)
                const dy = Math.abs(loose.position.y - other.position.y)
                const dz = Math.abs(loose.position.z - other.position.z)
                if (dx >= spanX || dy >= BRICK.height || dz >= spanZ) continue

                other.velocity.copy(loose.velocity).multiplyScalar(0.4)
                other.axis.copy(loose.axis)
                other.spin = loose.spin * 0.4
                other.angle = 0
                other.age = 0
                other.loose = true
            }
        }
    }

    #write()
    {
        for (let index = 0; index < this.bricks.length; index++)
        {
            const brick = this.bricks[index]

            if (!brick.alive)
            {
                _dummy.position.set(0, 0, 0)
                _dummy.quaternion.identity()
                _dummy.scale.setScalar(0)
            }
            else
            {
                _dummy.position.copy(brick.position)
                _dummy.quaternion.copy(brick.quaternion)
                _dummy.scale.copy(brick.scale)
            }

            _dummy.updateMatrix()
            this.mesh.setMatrixAt(index, _dummy.matrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true
    }
}
