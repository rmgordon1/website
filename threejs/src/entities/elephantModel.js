import * as THREE from 'three'
import { createGLTFLoader } from '../world/gltfLoader.js'
import { assetUrl } from '../config.js'
/** Served out of static/. Idle and run clips on a skinned elephant. */
const MODEL_URL = assetUrl('/models/elephant.002.glb')

/**
 * Gameplay envelope. The mesh is scaled to this length; beam is the
 * clearance used for boarding and for keeping her off the pier.
 * She already faces +Z, trunk forward, which matches the boat.
 */
export const ELEPHANT = {
    /** Three quarters of the original 7.6 × 3.4 envelope. */
    length: 5.7,
    beam: 2.55,
    /**
     * Back above the feet. She is parked sunk beside the walkway so this
     * lines up with the platform; mounting and dismounting use it instead
     * of the soles.
     */
    back: 2.9,
    /**
     * Rider's eye in the fitted frame, until the carpet is measured.
     * Roughly on the back, above the shoulder.
     */
    seat: new THREE.Vector3(0, 2.1, -0.45)
}

/** Seated eye height above the carpet floor, in fitted metres. */
const SEAT_LIFT = 2
const SEAT_BACK = -.5

/**
 * The ivory export is alpha-blended, but every texel is opaque. Left as a
 * transparent material, the tusks share the water's queue, and the water
 * sheet — recentered under the camera — always sorts in front of them.
 * Drawing them solid lets the depth test put the surface behind the tusks.
 */
export function solidifyTusks(material)
{
    if (material?.name !== 'Polished Ivory Wood') return

    material.transparent = false
    material.depthWrite = true
    material.needsUpdate = true
}

function disposeTree(object)
{
    object.traverse((child) =>
    {
        child.geometry?.dispose()

        const material = child.material
        if (!material) return
        for (const entry of Array.isArray(material) ? material : [material]) entry.dispose()
    })
}

export { disposeTree }

/**
 * @param {import('three').Object3D} root
 * @returns {THREE.Vector3 | null} carpet top, in the same space fitToEnvelope measures
 */
function carpetTop(root)
{
    let carpet = null

    root.traverse((child) =>
    {
        if (!child.isMesh) return
        const name = Array.isArray(child.material)
            ? child.material.map((entry) => entry?.name).join(' ')
            : child.material?.name
        if (name === 'carpet') carpet = child
    })

    if (!carpet) return null

    root.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(carpet)
    if (box.isEmpty()) return null

    // The carpet is a howdah: its floor is the seat, the top is the roof.
    return new THREE.Vector3(
        (box.min.x + box.max.x) * 0.5,
        box.min.y,
        (box.min.z + box.max.z) * 0.5
    )
}

function materialName(mesh)
{
    const material = mesh.material
    if (Array.isArray(material)) return material.map((entry) => entry?.name).join(' ')
    return material?.name ?? ''
}

/**
 * One tracker per purple sphere. The vertices stay with the skin, so the
 * flame can be resampled after each animation update instead of being glued
 * to the rest pose.
 *
 * @param {number} scale  Fitted metres per model unit, for the underside offset.
 */
function magicOrbSockets(root, scale)
{
    const samples = []

    root.traverse((child) =>
    {
        if (!child.isMesh || materialName(child) !== 'magic') return

        const attribute = child.geometry.attributes.position
        for (let i = 0; i < attribute.count; i++)
        {
            samples.push({
                mesh: child,
                index: i,
                position: new THREE.Vector3().fromBufferAttribute(attribute, i)
            })
        }
    })

    // Wide enough to gather one sphere, narrow enough to leave the next alone.
    const joinRadius = 0.85
    const groups = []

    for (const sample of samples)
    {
        let nearest = null
        let nearestDistance = joinRadius

        for (const group of groups)
        {
            const distance = group.center.distanceTo(sample.position)
            if (distance < nearestDistance)
            {
                nearest = group
                nearestDistance = distance
            }
        }

        if (!nearest)
        {
            groups.push({ center: sample.position.clone(), mesh: sample.mesh, samples: [sample] })
            continue
        }

        nearest.samples.push(sample)
        nearest.center.lerp(sample.position, 1 / nearest.samples.length)
    }

    const orbs = []

    for (const group of groups)
    {
        if (group.samples.length < 40) continue

        const center = new THREE.Vector3()
        for (const sample of group.samples) center.add(sample.position)
        center.multiplyScalar(1 / group.samples.length)

        let radius = 0
        for (const sample of group.samples) radius = Math.max(radius, center.distanceTo(sample.position))

        // The same purple material also covers the tusks. Those clusters are
        // long, not spherical, so they do not get a flame.
        if (radius > 0.4) continue

        orbs.push({
            mesh: group.mesh,
            indices: group.samples.map((sample) => sample.index),
            /** How far below the skinned centre the flame should start, in metres. */
            drop: radius * 0.85 * scale
        })
    }

    return orbs
}

/**
 * The reins are the clear mesh: alpha-masked away to nothing until a rider
 * boards and the strap is drawn as a ghost.
 */
function reinMesh(root)
{
    let mesh = null

    root.traverse((child) =>
    {
        if (child.isMesh && materialName(child) === 'clear') mesh = child
    })

    if (!mesh) return null

    mesh.castShadow = false
    mesh.receiveShadow = false
    return mesh
}

/**
 * World-space mouth of one sphere: the centre of its skinned vertices, then
 * down by the stored drop. The mesh's world matrix has to be current.
 */
export function sampleOrb(orb, target, scratch = new THREE.Vector3())
{
    const { mesh, indices, drop } = orb
    target.set(0, 0, 0)

    for (let i = 0; i < indices.length; i++)
    {
        mesh.getVertexPosition(indices[i], scratch)
        scratch.applyMatrix4(mesh.matrixWorld)
        target.add(scratch)
    }

    target.multiplyScalar(1 / indices.length)
    target.y -= drop
    return target
}

/**
 * Scales a loaded model to `length` along Z. Uniform scale keyed to the long
 * axis, so nothing gets stretched.
 *
 * Returns a wrapper centred in X and Z, with `submergedFraction` of the
 * model's height below y = 0. At the default of 0 it stands on y = 0.
 */
export function fitToEnvelope(object, { length = ELEPHANT.length, submergedFraction = 0, yaw = 0 } = {})
{
    // Yaw first: the long axis has to be along Z before we measure it.
    object.rotation.y += yaw
    object.updateWorldMatrix(false, true)

    const bounds = new THREE.Box3().setFromObject(object)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    if (!(size.z > 0)) throw new Error('model has no measurable length along Z')

    const scale = length / size.z

    object.position.x -= center.x
    object.position.z -= center.z
    object.position.y -= bounds.min.y + size.y * submergedFraction

    const wrapper = new THREE.Group()
    wrapper.scale.setScalar(scale)
    wrapper.add(object)

    const shift = object.position.clone()

    return {
        wrapper,
        scale,
        /** Fitted size in world units, handy for sanity checks. */
        size: size.clone().multiplyScalar(scale),
        /**
         * Converts a point in the model's own units into the fitted local
         * frame, so attachment points can be authored in model space.
         */
        toLocal: (point, target = new THREE.Vector3()) =>
            target.copy(point).add(shift).multiplyScalar(scale)
    }
}

/**
 * Scales the elephant onto the ground plane and pulls out the two gait clips.
 * The wrapper's origin is on the ground, centred, facing +Z.
 */
export function prepareElephant(gltf)
{
    const seatPoint = carpetTop(gltf.scene)
    const { wrapper, scale, size, toLocal } = fitToEnvelope(gltf.scene)

    gltf.scene.traverse((child) =>
    {
        if (!child.isMesh) return
        child.castShadow = true
        child.receiveShadow = true
        // Bind-pose bounds would cull her once a foot lifts past that box.
        if (child.isSkinnedMesh) child.frustumCulled = false

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) solidifyTusks(material)
    })

    let seat = null
    if (seatPoint)
    {
        seat = toLocal(seatPoint)
        seat.y += SEAT_LIFT
        seat.z += SEAT_BACK
    }

    const mixer = new THREE.AnimationMixer(gltf.scene)
    const gait = {}

    for (const name of ['idle', 'run'])
    {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name)
        if (!clip) continue

        const action = mixer.clipAction(clip)
        action.loop = THREE.LoopRepeat
        action.play()
        action.setEffectiveWeight(name === 'idle' ? 1 : 0)
        gait[name] = action
    }

    if (gait.idle && gait.run)
    {
        mixer.update(0)
    }

    const orbs = magicOrbSockets(gltf.scene, scale)
    const reins = reinMesh(gltf.scene)

    console.info(`elephant fitted: scale ${scale.toFixed(4)}, size ${size.toArray().map((value) => value.toFixed(2)).join(' x ')}, orbs ${orbs.length}, reins ${reins ? 'yes' : 'no'}`)

    return {
        visual: wrapper,
        seat,
        orbs,
        reins,
        gait: gait.idle && gait.run ? { mixer, idle: gait.idle, run: gait.run } : null
    }
}

export async function loadElephantModel()
{
    const loader = createGLTFLoader()
    const gltf = await loader.loadAsync(MODEL_URL)
    return prepareElephant(gltf)
}
