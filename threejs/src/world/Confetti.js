import * as THREE from 'three'

/**
 * A burst of paper from the elephant when a lap is finished. Pieces live in
 * world space, so they fall away from her instead of riding along.
 */

const COUNT = 220
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

export class Confetti
{
    constructor()
    {
        this.group = new THREE.Group()

        const material = new THREE.MeshBasicMaterial({
            side: THREE.DoubleSide,
            toneMapped: false
        })
        this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.3), material, COUNT)
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 3
        this.group.add(this.mesh)

        this.pieces = Array.from({ length: COUNT }, () => ({
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

    /** Throw a fresh burst out from `origin`. */
    burst(origin)
    {
        for (let index = 0; index < COUNT; index++)
        {
            const piece = this.pieces[index]
            const theta = Math.random() * Math.PI * 2
            const lift = Math.random()
            const spread = Math.sqrt(1 - lift * lift)

            piece.position.copy(origin)
            piece.velocity.set(
                Math.cos(theta) * spread,
                0.45 + lift * 0.7,
                Math.sin(theta) * spread
            ).normalize().multiplyScalar(7 + Math.random() * 8)

            piece.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            if (piece.axis.lengthSq() < 1e-8) piece.axis.set(0, 1, 0)
            else piece.axis.normalize()
            piece.spin = (Math.random() - 0.5) * 16
            piece.angle = Math.random() * Math.PI * 2
            piece.life = 2.2 + Math.random() * 1.1
            piece.age = 0
            piece.alive = true

            this.mesh.setColorAt(index, COLOURS[index % COLOURS.length])
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
        for (let index = 0; index < COUNT; index++) this.mesh.setMatrixAt(index, this.dummy.matrix)
        this.mesh.instanceMatrix.needsUpdate = true
        this.#settled = true
    }

    #write()
    {
        let alive = 0

        for (let index = 0; index < COUNT; index++)
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
