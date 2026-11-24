import * as THREE from 'three'

/**
 * A burst of paper from the elephant when a lap is finished. Pieces live in
 * world space, so they fall away from her instead of riding along.
 */

const GRAVITY = 11

const COLOURS = [
    new THREE.Color('#ffe08a'),
    new THREE.Color('#ff5d73'),
    new THREE.Color('#7ad7ff'),
    new THREE.Color('#b6f27a'),
    new THREE.Color('#fff6d8'),
    new THREE.Color('#d09bff'),
    new THREE.Color('#ff9a4a')
]

/** A finished lap. */
const LAP_BURST = { count: 220, colours: COLOURS, speed: [7, 15], life: [2.2, 3.3] }

/** What is left of the elephant after a cheated lap: thicker, faster, longer, all red. */
export const CHEATER_BURST = {
    count: 1100,
    colours: ['#ff1a0d', '#e10600', '#b30000', '#ff4d3d', '#7a0000'].map((hex) => new THREE.Color(hex)),
    speed: [9, 26],
    life: [3, 5]
}

export class Confetti
{
    constructor({ count, colours, speed, life } = LAP_BURST)
    {
        this.count = count
        this.colours = colours
        this.speed = speed
        this.life = life
        this.group = new THREE.Group()

        const material = new THREE.MeshBasicMaterial({
            side: THREE.DoubleSide,
            toneMapped: false
        })
        this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.3), material, count)
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 3
        this.group.add(this.mesh)

        this.pieces = Array.from({ length: count }, () => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            axis: new THREE.Vector3(0, 1, 0),
            spin: 0,
            angle: 0,
            life: 1,
            age: 1,
            alive: false
        }))

        this.dummy = new THREE.Object3D()
        this.colour = new THREE.Color()
        this.#hideAll()
    }

    /** Throw a fresh burst out from `origin`, or from anywhere within `radius` of it. */
    burst(origin, radius = 0)
    {
        for (let index = 0; index < this.count; index++)
        {
            const piece = this.pieces[index]
            const theta = Math.random() * Math.PI * 2
            const lift = Math.random()
            const spread = Math.sqrt(1 - lift * lift)

            piece.position.copy(origin)
            if (radius > 0)
            {
                // Uniform through the ball: the cube root keeps the middle from crowding.
                const reach = radius * Math.cbrt(Math.random())
                const up = Math.random() * 2 - 1
                const around = Math.random() * Math.PI * 2
                const flat = Math.sqrt(1 - up * up)
                piece.position.x += Math.cos(around) * flat * reach
                piece.position.y += up * reach
                piece.position.z += Math.sin(around) * flat * reach
            }
            piece.velocity.set(
                Math.cos(theta) * spread,
                0.45 + lift * 0.7,
                Math.sin(theta) * spread
            ).normalize().multiplyScalar(this.speed[0] + Math.random() * (this.speed[1] - this.speed[0]))

            piece.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            if (piece.axis.lengthSq() < 1e-8) piece.axis.set(0, 1, 0)
            else piece.axis.normalize()
            piece.spin = (Math.random() - 0.5) * 16
            piece.angle = Math.random() * Math.PI * 2
            piece.life = this.life[0] + Math.random() * (this.life[1] - this.life[0])
            piece.age = 0
            piece.alive = true

            this.mesh.setColorAt(index, this.colours[index % this.colours.length])
        }

        this.mesh.instanceColor.needsUpdate = true
        this.#write()
    }

    aliveCount()
    {
        let count = 0
        for (const piece of this.pieces)
        {
            if (piece.alive) count++
        }
        return count
    }

    update(delta)
    {
        let moving = false

        for (const piece of this.pieces)
        {
            if (!piece.alive) continue

            piece.age += delta
            if (piece.age >= piece.life)
            {
                piece.alive = false
                continue
            }

            moving = true
            piece.velocity.y -= GRAVITY * delta
            piece.velocity.multiplyScalar(Math.exp(-0.55 * delta))
            piece.position.addScaledVector(piece.velocity, delta)
            piece.angle += piece.spin * delta
        }

        if (moving || this.#settled === false) this.#write()
    }

    #settled = true

    #hideAll()
    {
        this.dummy.scale.setScalar(0)
        this.dummy.updateMatrix()
        for (let index = 0; index < this.count; index++) this.mesh.setMatrixAt(index, this.dummy.matrix)
        this.mesh.instanceMatrix.needsUpdate = true
        this.#settled = true
    }

    #write()
    {
        let alive = 0

        for (let index = 0; index < this.count; index++)
        {
            const piece = this.pieces[index]

            if (!piece.alive)
            {
                this.dummy.scale.setScalar(0)
                this.dummy.position.set(0, 0, 0)
                this.dummy.quaternion.identity()
            }
            else
            {
                alive++
                const fade = 1 - piece.age / piece.life
                this.dummy.position.copy(piece.position)
                this.dummy.quaternion.setFromAxisAngle(piece.axis, piece.angle)
                this.dummy.scale.set(0.85, 0.35 + 0.9 * fade, 1)
            }

            this.dummy.updateMatrix()
            this.mesh.setMatrixAt(index, this.dummy.matrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true
        this.#settled = alive === 0
    }
}
