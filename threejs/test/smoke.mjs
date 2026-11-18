/**
 * Headless checks for the parts of the game that are pure maths: wave
 * sampling, the island profile, the castles, the elephant and the player.
 * Run with `npm test`.
 */

import * as THREE from 'three'
import { Elephant, ELEPHANT } from '../src/entities/Elephant.js'
import { Castle, CASTLE, CASTLE_RING, MAIN_YAW, DECK_Y, measureFlightVoxels, voxelSphereHits, voxelSweepSphere } from '../src/world/Castle.js'
import { HOOP_COUNT, HOOP_Z_JITTER, Racetrack, hoopPoint, paintFlag } from '../src/world/Racetrack.js'
import { Confetti } from '../src/world/Confetti.js'
import { BrickWall, brickSlots, BRICK } from '../src/world/BrickWall.js'
import { DockBeacons } from '../src/world/DockBeacons.js'
import { fitToEnvelope, solidifyTusks } from '../src/entities/elephantModel.js'
import { EyeFire, PURPLE_FLAME } from '../src/entities/EyeFire.js'
import { Player } from '../src/player/Player.js'

let failures = 0
let checks = 0

function check(label, condition, detail = '')
{
    checks++
    if (condition)
    {
        console.log(`  ok   ${label}`)
    }
    else
    {
        failures++
        console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

function group(name, body)
{
    console.log(`\n${name}`)
    body()
}

function stubInput(held = [])
{
    const keys = new Set(held)
    return {
        isHeld: (code) => keys.has(code),
        wasPressed: () => false,
        axis: (positive, negative) => (keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0),
        mouseDeltaX: 0,
        mouseDeltaY: 0
    }
}

function allFinite(geometry)
{
    for (const attribute of Object.values(geometry.attributes))
    {
        for (const value of attribute.array)
        {
            if (!Number.isFinite(value)) return false
        }
    }
    return true
}

// ------------------------------------------------------------- model fitting

group('model fitting', () =>
{
    /** The old boat's envelope. The fake export below is built to its proportions. */
    const ENVELOPE = { length: 6.4, beam: 3.5 }
    const fit = (object) => fitToEnvelope(object, { length: ENVELOPE.length, submergedFraction: 0.667 })

    /**
     * Stands in for boat2.glb: a box of her dimensions under the same
     * quarter-turn the real export carries. The geometry is deliberately
     * off-origin to match her real bounds (y from -8.16 to 4.06), because the
     * model's origin sits around her waterline rather than her centre — a
     * symmetric box would hide any mistake in the vertical shift.
     */
    function fakeExport(width = 11.11, height = 20.51, depth = 12.22)
    {
        const scene = new THREE.Group()
        const geometry = new THREE.BoxGeometry(width, height, depth)
        geometry.translate(0, -0.455, 2.05)
        const node = new THREE.Mesh(geometry)
        node.quaternion.set(Math.SQRT1_2, 0, 0, Math.SQRT1_2)
        scene.add(node)
        return scene
    }

    function fittedBounds(result)
    {
        const root = new THREE.Scene()
        root.add(result.wrapper)
        root.updateMatrixWorld(true)
        return new THREE.Box3().setFromObject(result.wrapper)
    }

    const result = fit(fakeExport())
    const bounds = fittedBounds(result)
    const size = bounds.getSize(new THREE.Vector3())

    check('scales to the authored length', Math.abs(size.z - ENVELOPE.length) < 1e-4,
        `${size.z.toFixed(3)} vs ${ENVELOPE.length}`)
    check('reports the fitted size', Math.abs(result.size.z - ENVELOPE.length) < 1e-4)

    // The real export is 11.11 wide over 20.52 long; scaled to 6.4 that is 3.47.
    check('beam lands near the authored beam', Math.abs(size.x - ENVELOPE.beam) < 0.1,
        `${size.x.toFixed(2)} vs ${ENVELOPE.beam}`)

    check('aspect ratio is preserved', Math.abs((size.x / size.z) - (11.11 / 20.52)) < 1e-3,
        `${(size.x / size.z).toFixed(4)}`)

    check('centred fore-and-aft', Math.abs(bounds.getCenter(new THREE.Vector3()).z) < 1e-4)
    check('centred athwartships', Math.abs(bounds.getCenter(new THREE.Vector3()).x) < 1e-4)

    // Two thirds of her depth should sit under the waterline at y = 0.
    check('floats at the intended depth', Math.abs(bounds.min.y / size.y + 0.667) < 1e-3,
        `${(bounds.min.y / size.y).toFixed(4)} of height submerged`)
    check('her back clears the water', bounds.max.y > 0.8, `${bounds.max.y.toFixed(2)}m proud`)

    // An export that is off-origin must still come back centred.
    const offset = fakeExport()
    offset.children[0].position.set(37, -12, 400)
    const offsetBounds = fittedBounds(fit(offset))
    const offsetCenter = offsetBounds.getCenter(new THREE.Vector3())
    check('recentres an off-origin export',
        Math.abs(offsetCenter.x) < 1e-4 && Math.abs(offsetCenter.z) < 1e-4,
        `centre ${offsetCenter.x.toFixed(3)}, ${offsetCenter.z.toFixed(3)}`)

    check('rejects a model with no length', (() =>
    {
        try { fitToEnvelope(new THREE.Group()); return false }
        catch { return true }
    })())

    // Attachment points are authored in model units, so the converter has to
    // land them in the same frame as the fitted mesh.
    const fitted = fit(fakeExport())
    const eye = fitted.toLocal(new THREE.Vector3(1.85, 2.08, 6.35))

    check('converts model-space points into the fitted frame',
        eye.x > 0.4 && eye.x < 0.75 && eye.y > 0.45 && eye.y < 0.85 && eye.z > 1.8 && eye.z < 2.4,
        `eye at ${eye.toArray().map((v) => v.toFixed(3)).join(', ')}`)

    const centre = fitted.toLocal(new THREE.Vector3(0, 0, 0))
    check('the model origin maps near the waterline centre',
        Math.abs(centre.x) < 0.01 && Math.abs(centre.y) < 0.01 && Math.abs(centre.z) < 0.2,
        `${centre.toArray().map((v) => v.toFixed(3)).join(', ')}`)

    check('conversion is consistent with the mesh scale',
        Math.abs(fitted.toLocal(new THREE.Vector3(2, 0, 0)).x - fitted.toLocal(new THREE.Vector3(1, 0, 0)).x - fitted.scale) < 1e-6)
})

// --------------------------------------------------------------------- fire

group('eye fire', () =>
{
    const fire = new EyeFire()
    fire.setViewport(1080, 66)

    const emitters = [new THREE.Vector3(-0.58, 0.64, 2.12), new THREE.Vector3(0.58, 0.64, 2.12)]
    const drift = new THREE.Vector3(0, 0, 6)

    const progress = fire.points.geometry.attributes.aProgress
    check('starts with every particle dead', progress.array.every((v) => v >= 1))

    for (let i = 0; i < 120; i++) fire.update(1 / 60, emitters, drift, 1)

    const live = fire.particles.filter((p) => p.alive)
    check('blazing spawns particles', live.length > 20, `${live.length} alive`)
    check('particles stay finite', live.every((p) =>
        Number.isFinite(p.position.x) && Number.isFinite(p.position.y) && Number.isFinite(p.position.z)))
    check('never exceeds its budget', fire.particles.length === 240)

    const mean = live.reduce((sum, p) => sum.add(p.position), new THREE.Vector3()).divideScalar(live.length)
    check('flames rise above the sockets', mean.y > emitters[0].y, `mean y ${mean.y.toFixed(2)}`)

    const falling = new EyeFire({ direction: new THREE.Vector3(0, -1, 0), palette: PURPLE_FLAME })
    for (let i = 0; i < 120; i++) falling.update(1 / 60, emitters, new THREE.Vector3(), 1)
    const dropped = falling.particles.filter((particle) => particle.alive)
    const droppedMean = dropped.reduce((sum, particle) => sum.add(particle.position), new THREE.Vector3()).divideScalar(dropped.length)
    check('flames can be driven downward', droppedMean.y < emitters[0].y, `mean y ${droppedMean.y.toFixed(2)}`)
    check('the downward flame is purple at the core',
        falling.glowMaterial.uniforms.uCore.value.b > falling.glowMaterial.uniforms.uCore.value.r)
    check('the boat flame stays additive', fire.glowMaterial.blending === THREE.AdditiveBlending)

    const veiled = new EyeFire({
        direction: new THREE.Vector3(0, -1, 0),
        palette: PURPLE_FLAME,
        cover: true,
        coverLift: 0.11
    })
    veiled.update(1 / 60, emitters, new THREE.Vector3(), 0.4)
    const veil = veiled.glow.geometry.attributes.position
    check('a cover sits on the orb rather than the flame mouth',
        Math.abs(veil.getY(0) - (emitters[0].y + 0.11)) < 1e-6)
    check('the cover blends over the orb', veiled.glowMaterial.blending === THREE.NormalBlending)
    check('the cover flame holds a solid body', veiled.material.uniforms.uCover.value === 1)

    // Under way the sockets move with her, so the flames should stream aft.
    check('flames stream aft when she runs', (() =>
    {
        const running = new EyeFire()
        running.setViewport(1080, 66)
        const sockets = emitters.map((e) => e.clone())
        const speed = new THREE.Vector3(0, 0, 6)

        for (let i = 0; i < 180; i++)
        {
            for (const socket of sockets) socket.addScaledVector(speed, 1 / 60)
            running.update(1 / 60, sockets, speed, 1)
        }

        const alive = running.particles.filter((p) => p.alive)
        const trail = alive.reduce((sum, p) => sum.add(p.position), new THREE.Vector3()).divideScalar(alive.length)
        return trail.z < sockets[0].z - 0.3
    })())

    const glow = fire.glow.geometry.attributes.position
    check('glow cores sit in the sockets',
        Math.abs(glow.getX(0) - emitters[0].x) < 1e-6 && Math.abs(glow.getX(1) - emitters[1].x) < 1e-6)
    check('glow tracks intensity', fire.glowMaterial.uniforms.uIntensity.value === 1)

    // Idle should settle to embers rather than keep throwing flame.
    const idle = new EyeFire()
    for (let i = 0; i < 600; i++) idle.update(1 / 60, emitters, new THREE.Vector3(), 0)
    check('no flame when cold', idle.particles.every((p) => !p.alive))

    check('point size scale responds to the viewport', (() =>
    {
        const probe = new EyeFire()
        probe.setViewport(1080, 66)
        const tall = probe.material.uniforms.uSizeScale.value
        probe.setViewport(2160, 66)
        return probe.material.uniforms.uSizeScale.value > tall * 1.9
    })())
})

// ------------------------------------------------------------------ player

function walk(player, keys, seconds)
{
    const input = stubInput(keys)
    const step = 1 / 60
    let respawned = false

    for (let i = 0; i < seconds / step; i++)
    {
        if (player.update(step, input)) respawned = true
    }

    return respawned
}

group('player', () =>
{
    /** A plain deck over the void. */
    const PIER = { deckY: 1.6, halfWidth: 6.92, seaZ: -6, landZ: 46, spawn: new THREE.Vector3(0, 1.6, 40) }
    const world = {
        platforms: [new THREE.Box3(
            new THREE.Vector3(-PIER.halfWidth, PIER.deckY - 4, PIER.seaZ),
            new THREE.Vector3(PIER.halfWidth, PIER.deckY, PIER.landZ)
        )],
        walls: [],
        voidY: PIER.deckY - 10
    }

    const standing = new Player(world, PIER.spawn)
    walk(standing, [], 1)
    check('stands on the deck', Math.abs(standing.position.y - PIER.deckY) < 1e-6,
        `y ${standing.position.y.toFixed(3)}`)
    check('is grounded', standing.onGround)

    // No railings, so the deck holds you and the edges do not.
    const walking = new Player(world, PIER.spawn)
    walking.yaw = 0 // looking down the pier, toward the sea
    walk(walking, ['KeyW', 'ShiftLeft'], 4)
    check('walks seaward along the pier', walking.position.z < PIER.spawn.z - 20,
        `z ${walking.position.z.toFixed(2)}`)
    check('stays on the deck', Math.abs(walking.position.y - PIER.deckY) < 1e-6)

    const overboard = new Player(world, new THREE.Vector3(0, PIER.deckY, PIER.seaZ + 2))
    overboard.yaw = 0
    const offTheEnd = walk(overboard, ['KeyW', 'ShiftLeft'], 4)
    check('walking off the end is a fall', offTheEnd)

    const pushing = new Player(world, new THREE.Vector3(0, PIER.deckY, 25))
    pushing.yaw = 0
    const offTheSide = walk(pushing, ['KeyA'], 6)
    check('walking off the side is a fall', offTheSide)

    const recovered = new Player(world, PIER.spawn)
    recovered.position.set(0, -20, -30)
    recovered.respawn()
    check('respawn restores the spawn point', recovered.position.equals(PIER.spawn))

    // Jumping should leave the deck and come back to it.
    const jumper = new Player(world, PIER.spawn)
    const input = stubInput([])
    input.wasPressed = (code) => code === 'Space'
    jumper.update(1 / 60, input)
    check('jump leaves the deck', jumper.position.y > PIER.deckY && !jumper.onGround,
        `y ${jumper.position.y.toFixed(3)}`)
    walk(jumper, [], 2)
    check('lands back on the deck', Math.abs(jumper.position.y - PIER.deckY) < 1e-6)

    const camera = new THREE.PerspectiveCamera()
    standing.applyToCamera(camera)
    check('camera sits at eye height above the deck',
        camera.position.y > PIER.deckY + 1.4 && camera.position.y < PIER.deckY + 1.8,
        `y ${camera.position.y.toFixed(2)}`)
})

// ------------------------------------------------------- elephant behaviour

function ride(elephant, controls, seconds)
{
    const step = 1 / 60
    const flight = { pitch: 0, steer: 0, boost: false, ...controls }
    for (let i = 0; i < seconds / step; i++)
    {
        elephant.update(step, i * step, flight)
    }
}

group('elephant behaviour', () =>
{
    /** Level ground at y = 0, for the checks that need something to stand on. */
    const flat = () => 0
    const beach = new THREE.Vector3(15, 0, 48.5)
    const sky = new THREE.Vector3(0, 25, -80)

    const standing = new Elephant(beach, { loadModel: false, yaw: 0, floor: flat })
    check('starts on the ground when placed there',
        Math.abs(standing.position.y) < 0.2,
        `y ${standing.position.y.toFixed(2)}`)

    const level = new Elephant(sky, { loadModel: false, yaw: 0 })
    ride(level, { throttle: 1 }, 3)
    check('space carries her forward', level.speed > 16 && level.speed < 21, `${level.speed.toFixed(2)} m/s`)
    check('level flight follows her nose', level.position.z > sky.z + 15, `z ${level.position.z.toFixed(2)}`)
    check('level flight leaves her altitude alone', Math.abs(level.position.y - sky.y) < 0.05,
        `y ${level.position.y.toFixed(2)}`)

    const boosted = new Elephant(sky, { loadModel: false, yaw: 0 })
    ride(boosted, { throttle: 1, boost: true }, 3)
    check('shift flies faster', boosted.speed > level.speed + 5, `${boosted.speed.toFixed(2)} m/s`)

    const climber = new Elephant(sky.clone(), { loadModel: false, yaw: 0 })
    climber.pitch = -0.7
    ride(climber, { throttle: 1 }, 2)
    check('a raised nose climbs', climber.position.y > sky.y + 4, `y ${climber.position.y.toFixed(2)}`)
    check('climbing still carries her forward', climber.position.z > sky.z + 4)

    const aimer = new Elephant(sky, { loadModel: false, yaw: 0 })
    ride(aimer, { throttle: 0, pitch: 1 }, 1.2)
    check('forward aims her down', aimer.pitch > 0.6, `${aimer.pitch.toFixed(2)}`)
    const lifter = new Elephant(sky, { loadModel: false, yaw: 0 })
    ride(lifter, { throttle: 0, pitch: -1 }, 1.2)
    check('back aims her up', lifter.pitch < -0.6, `${lifter.pitch.toFixed(2)}`)

    const coaster = new Elephant(sky, { loadModel: false, yaw: 0 })
    ride(coaster, { throttle: 1 }, 2)
    ride(coaster, { throttle: 0 }, 3)
    check('she glides to a stop without space', Math.abs(coaster.speed) < 0.4, `${coaster.speed.toFixed(2)}`)

    const turning = new Elephant(sky.clone(), { loadModel: false, yaw: 0 })
    const turnStart = turning.position.clone()
    ride(turning, { throttle: 0, steer: 1 }, 2)
    const slide = turnStart.distanceTo(turning.position)
    check('steering while stopped does not slide', slide < 1e-6, `${slide.toFixed(4)}m`)
    check('steering while stopped turns her', Math.abs(turning.yaw) > 0.5)

    const diver = new Elephant(new THREE.Vector3(0, 40, 70), { loadModel: false, yaw: 0, floor: flat })
    diver.pitch = 1.1
    ride(diver, { throttle: 1, boost: true }, 5)
    check('a dive stops at the ground', diver.position.y >= -1e-6 && diver.position.y < 40,
        `y ${diver.position.y.toFixed(2)}`)

    const high = new Elephant(new THREE.Vector3(0, 30, -80), { loadModel: false, yaw: 0 })
    check('no dismount while airborne', high.dismountSpot() === null)

    const parked = new Elephant(beach, { loadModel: false, yaw: Math.atan2(-12, -2), floor: flat })
    const flank = parked.boardingPoint()
    check('boarding point sits off her side',
        Math.hypot(flank.x - parked.position.x, flank.z - parked.position.z) > 1.5)

    parked.forwardSpeed = 4
    check('no dismount while she is moving', parked.dismountSpot() === null)
    parked.halt()
    const landing = parked.dismountSpot()
    check('dismount lands on the ground beside her',
        landing !== null && Math.abs(landing.y) < 1e-6 && Math.hypot(landing.x - parked.position.x, landing.z - parked.position.z) > 1,
        landing ? `${landing.toArray().map((value) => value.toFixed(2)).join(', ')}` : 'none')

    const ivory = new THREE.MeshStandardMaterial({ name: 'Polished Ivory Wood', transparent: true, depthWrite: false })
    solidifyTusks(ivory)
    check('tusks draw solid so the water can sort behind them', ivory.transparent === false && ivory.depthWrite === true)

    const body = new THREE.MeshStandardMaterial({ name: 'Gray Sandstone Rock', transparent: true, depthWrite: false })
    solidifyTusks(body)
    check('other elephant materials are left alone', body.transparent === true && body.depthWrite === false)

    const mainCastle = new Castle({ loadModel: false })
    const outerCastles = CASTLE_RING.map((placement) => new Castle({ ...placement, loadModel: false }))
    const deckAt = (x, z, ceiling) =>
    {
        let height = mainCastle.surfaceAt(x, z, ceiling)
        for (const castle of outerCastles)
        {
            const top = castle.surfaceAt(x, z, ceiling)
            if (top > height) height = top
        }
        return height
    }
    const castles = [mainCastle, ...outerCastles]

    let decks = 0
    let stillAirborne = 0
    for (const castle of [mainCastle, ...outerCastles])
    {
        const walkway = castle.localToWorld(0, 4.2 * 5)
        const hovering = new Elephant(
            new THREE.Vector3(walkway.x, DECK_Y + 8, walkway.z),
            { loadModel: false, yaw: castle.yaw + Math.PI, floor: deckAt }
        )
        const spot = hovering.dismountSpot()
        const onDeck = spot && Math.abs(spot.y - DECK_Y) < 0.05
            && Math.abs(deckAt(spot.x, spot.z) - DECK_Y) < 0.05
        if (onDeck) decks++

        const high = new Elephant(
            new THREE.Vector3(walkway.x, DECK_Y + 30, walkway.z),
            { loadModel: false, yaw: castle.yaw, floor: deckAt }
        )
        if (high.dismountSpot() === null) stillAirborne++
    }

    const castleCount = [mainCastle, ...outerCastles].length
    const doorOf = (castle) =>
    {
        const outward = castle.localToWorld(0, 1)
        return { x: outward.x - castle.x, z: outward.z - castle.z }
    }
    const northDoor = doorOf(outerCastles[0])
    const southDoor = doorOf(outerCastles[1])
    check('the triple castles face each other',
        outerCastles.length === 2
            && outerCastles[0].x === -151 && outerCastles[0].z === -100
            && outerCastles[1].x === -151 && outerCastles[1].z === 100
            && northDoor.z > 0.9 && Math.abs(northDoor.x) < 1e-6
            && southDoor.z < -0.9 && Math.abs(southDoor.x) < 1e-6)
    check('can step onto every castle deck', decks === castleCount, `${decks}/${castleCount}`)
    check('too high over a castle is still airborne', stillAirborne === castleCount, `${stillAirborne}/${castleCount}`)

    const homeDeck = mainCastle.localToWorld(0, 4.2 * 5)
    const underHome = new Elephant(
        new THREE.Vector3(homeDeck.x, DECK_Y - 30, homeDeck.z),
        { loadModel: false, floor: deckAt, castles }
    )
    underHome.update(1 / 60, 0, { throttle: 0, pitch: 0, steer: 0, boost: false })
    check('flying through the cloud under a castle stays there', underHome.position.y < DECK_Y - 20,
        underHome.position.y.toFixed(2))

    const outerDeck = outerCastles[0].localToWorld(0, 4.2 * 5)
    const underOuter = new Elephant(
        new THREE.Vector3(outerDeck.x, DECK_Y - 30, outerDeck.z),
        { loadModel: false, floor: deckAt, castles }
    )
    underOuter.update(1 / 60, 0, { throttle: 0, pitch: 0, steer: 0, boost: false })
    check('flying through the cloud under an outer castle stays there', underOuter.position.y < DECK_Y - 20,
        underOuter.position.y.toFixed(2))

    const caught = new Elephant(
        new THREE.Vector3(homeDeck.x, DECK_Y - 0.4, homeDeck.z),
        { loadModel: false, floor: deckAt, castles }
    )
    check('a deck still catches her when she meets it', Math.abs(caught.position.y - DECK_Y) < 0.05,
        caught.position.y.toFixed(2))

    const outer = outerCastles[0]
    const clear = outer.localToWorld(-3.45 * 5 - 2, 0)
    const origin = outer.localToWorld(0, 0)
    const east = outer.localToWorld(1, 0)
    const intoWall = new Elephant(
        new THREE.Vector3(clear.x, DECK_Y + 2, clear.z),
        {
            loadModel: false,
            yaw: Math.atan2(east.x - origin.x, east.z - origin.z),
            floor: deckAt,
            castles
        }
    )
    intoWall.forwardSpeed = 12
    intoWall.update(0.5, 0, { throttle: 1, pitch: 0, steer: 0, boost: false })
    const stopped = outer.worldToLocal(intoWall.position.x, intoWall.position.z)
    check('castle stone stops the elephant', stopped.x < -3.45 * 5, stopped.x.toFixed(2))

    const flightRoot = new THREE.Group()
    const towerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4, 22, 4),
        new THREE.MeshBasicMaterial({ name: 'Strone wall' })
    )
    towerMesh.position.set(0, 11, 0)
    const baseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(16, 8, 16),
        new THREE.MeshBasicMaterial({ name: 'Stylized Metal Base' })
    )
    baseMesh.position.set(0, -5, 0)
    const cloudMesh = new THREE.Mesh(
        new THREE.BoxGeometry(40, 30, 40),
        new THREE.MeshBasicMaterial({ name: 'Ivory Cloud Marble' })
    )
    cloudMesh.position.set(0, -20, 0)
    // A plank no thicker than the main castle's door: the old column grid
    // dropped anything this thin, so she flew straight through it.
    const plankMesh = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.3, 14),
        new THREE.MeshBasicMaterial({ name: 'Stylized Weathered Wood Bark' })
    )
    plankMesh.position.set(0, 0, 40)
    flightRoot.add(towerMesh, baseMesh, cloudMesh, plankMesh)
    const flightVoxels = measureFlightVoxels(flightRoot, flightRoot)
    const shell = {
        walls: [],
        flightVoxels,
        worldToLocal(x, z) { return { x, z } },
        localToWorld(x, z) { return { x, z } }
    }
    const openSky = () => Number.NEGATIVE_INFINITY
    const flyAt = (x, y) =>
    {
        const elephant = new Elephant(new THREE.Vector3(x, y, 0), {
            loadModel: false,
            yaw: Math.PI / 2,
            floor: openSky,
            castles: [shell]
        })
        elephant.forwardSpeed = 16
        elephant.update(0.8, 0, { throttle: 1, pitch: 0, steer: 0, boost: false })
        return elephant
    }

    const intoTower = flyAt(-14, 14)
    check('a tower stops the elephant', intoTower.position.x < -1.5, intoTower.position.x.toFixed(2))
    const intoBase = flyAt(-16, -5)
    check('the dark base stops the elephant', intoBase.position.x < -7, intoBase.position.x.toFixed(2))
    const throughCloud = flyAt(-16, -28)
    check('she flies through the cloud under the base', throughCloud.position.x > -7, throughCloud.position.x.toFixed(2))
    check('the air above the dark base stays open', voxelSphereHits(flightVoxels, 6, 5, 0, 0.1) === 0)

    const plankAt = (x, y, z, yaw, pitch, seconds) =>
    {
        const elephant = new Elephant(new THREE.Vector3(x, y, z), {
            loadModel: false,
            yaw,
            floor: openSky,
            castles: [shell]
        })
        elephant.pitch = pitch
        elephant.forwardSpeed = 32
        for (let frame = 0; frame < seconds * 60; frame++)
        {
            elephant.update(1 / 60, frame / 60, { throttle: 1, pitch: 0, steer: 0, boost: true })
        }
        return elephant
    }
    const sideOn = plankAt(-14, -1.6, 40, Math.PI / 2, 0, 1)
    check('a thin plank stops her side-on', sideOn.position.x < -3, sideOn.position.x.toFixed(2))
    const fromBelow = plankAt(0, -14, 36, 0, -1.15, 0.6)
    check('a thin plank stops her flying up from below', fromBelow.position.y + 1.6 + 1.2 < 0.2,
        fromBelow.position.y.toFixed(2))
    const fromAbove = plankAt(0, 14, 34, 0, 1.15, 0.8)
    check('a thin plank stops a dive from above', fromAbove.position.y > 0, fromAbove.position.y.toFixed(2))

    const clipped = plankAt(-14, -1.6, 40, Math.PI / 2, 0, 1)
    let swung = false
    for (let frame = 0; frame < 120; frame++)
    {
        clipped.update(1 / 60, frame / 60, { throttle: 0, pitch: 0, steer: 1, boost: false })
        const nose = clipped.position.x + Math.sin(clipped.yaw) * 2.85
        if (Math.abs(clipped.position.z - 40) < 7 && nose > -3 + 0.6) swung = true
    }
    check('turning against the plank does not swing her trunk into it', !swung)

    // The chase camera's sweep: from above the plank, straight down through it.
    const lens = voxelSweepSphere(flightVoxels, 0, 10, 40, 0, -1, 0, 20, 0.3)
    check('the camera sweep stops short of a thin plank', lens > 9 && lens < 10, lens.toFixed(2))
    check('the camera sweep goes the full way through open air',
        voxelSweepSphere(flightVoxels, 30, 10, 40, 0, -1, 0, 20, 0.3) === 20)
    check('the camera sweep passes through the cloud', voxelSweepSphere(flightVoxels, 0, -12, 0, 0, -1, 0, 15, 0.3) === 15)

    const track = new Racetrack({ loadModel: false })
    const gate = track.hoops.find((hoop) => hoop.y > 12 && hoop.y < 70)
    const ring = track.colliders[gate.index]
    const along = (elephant) => elephant.position.clone().sub(gate.center).dot(gate.normal)
    const openAir = () => Number.NEGATIVE_INFINITY
    const flyRing = (fileX, fileY, fileZ, centerBody) =>
    {
        const start = hoopPoint(gate, fileX, fileY, fileZ)
        if (centerBody) start.y -= ELEPHANT.back * 0.5
        const elephant = new Elephant(start, {
            loadModel: false,
            yaw: Math.atan2(gate.normal.x, gate.normal.z),
            floor: openAir,
            castles: [ring]
        })
        elephant.forwardSpeed = 12
        for (let frame = 0; frame < 40; frame++)
        {
            elephant.update(1 / 60, frame / 60, { throttle: 1, pitch: 0, steer: 0, boost: false })
        }
        return elephant
    }

    const clothPoint = hoopPoint(gate, 0, -40, 0.4)
    const clothLocal = ring.worldToLocal(clothPoint.x, clothPoint.z)
    const has = (x, z) => track.hoops.some((hoop) => hoop.x === x && hoop.z === z)
    const yawNear = (x, z, yaw) =>
    {
        const hoop = track.hoops.find((item) => item.x === x && item.z === z)
        if (!hoop) return false
        const delta = Math.atan2(Math.sin(hoop.yaw - yaw), Math.cos(hoop.yaw - yaw))
        return Math.abs(delta) < 1e-6
    }
    const plan = [
        [-345, -50], [-345, 50],
        [-267, -90], [-267, 90],
        [-191, -50], [-191, 50],
        [-151, 0],
        [-105, -50], [-105, 50],
        [-28, -90], [-28, 90],
        [50, -50], [50, 50]
    ]
    let onPlan = plan.length === track.hoops.length
    let lifted = true
    let turned = true
    let clearOfCastles = true
    let separated = true
    for (const [x, z] of plan)
    {
        const hoop = track.hoops.find((item) => item.x === x && item.z === z)
        if (!hoop) onPlan = false
        else
        {
            const rise = Math.abs(hoop.y - 11)
            if (rise < 2 || rise > HOOP_Z_JITTER) lifted = false
        }
        if (z > 0)
        {
            const mirror = track.hoops.find((item) => item.x === x && item.z === -z)
            const delta = hoop && mirror
                ? Math.atan2(Math.sin(mirror.yaw + hoop.yaw), Math.cos(mirror.yaw + hoop.yaw))
                : 1
            if (Math.abs(delta) > 1e-6) turned = false
        }
    }
    for (const hoop of track.hoops)
    {
        if (Math.hypot(hoop.x, hoop.z) < 65) clearOfCastles = false
        for (const castle of outerCastles)
        {
            if (Math.hypot(hoop.x - castle.x, hoop.z - castle.z) < 50) clearOfCastles = false
        }
        for (const other of track.hoops)
        {
            if (other === hoop) continue
            if (Math.hypot(hoop.x - other.x, hoop.z - other.z) < 30) separated = false
        }
    }

    check('thirteen rings follow the floor plan',
        track.hoops.length === HOOP_COUNT && HOOP_COUNT === 13 && onPlan && separated)
    check('each ring sits at its own height', lifted)
    check('the rings turn with the ovals on the plan',
        turned
            && yawNear(-345, -50, -Math.PI / 4)
            && yawNear(-191, -50, Math.PI / 4)
            && yawNear(-105, -50, -Math.PI / 4)
            && yawNear(50, -50, Math.PI / 4)
            && yawNear(-267, -90, -Math.PI / 2)
            && yawNear(-28, 90, Math.PI / 2)
            && yawNear(-151, 0, -Math.PI / 2))
    check('the rings stay clear of every castle', clearOfCastles)
    check('a ring stands between the triple castles', has(-151, 0))
    check('rings stand north and south of the main castle', has(-28, -90) && has(-28, 90))
    check('rings stand east of the main castle', has(50, -50) && has(50, 50))
    check('the cloth is solid', ring.walls.some((box) =>
        clothLocal.x >= box.min.x && clothLocal.x <= box.max.x
        && clothPoint.y >= box.min.y && clothPoint.y <= box.max.y
        && clothLocal.z >= box.min.z && clothLocal.z <= box.max.z))
    check('the gold band is solid', 18 * gate.scale > ring.hoop.inner && 18 * gate.scale < ring.hoop.outer)
    check('the middle of the hoop is open', 0 < ring.hoop.inner)
    check('most of the visible hole stays open', 15.5 * gate.scale < ring.hoop.inner)
    const throughHoop = flyRing(0, 0, -12, true)
    check('the elephant flies through the hoop', along(throughHoop) > 1, along(throughHoop).toFixed(2))
    const throughTop = flyRing(0, 15, -12, true)
    check('the top of the hoop is open', along(throughTop) > 1, along(throughTop).toFixed(2))
    const throughWide = flyRing(9, 0, -12, true)
    check('she can pass well off the centre of the hoop', along(throughWide) > 1, along(throughWide).toFixed(2))
    const intoCloth = flyRing(0, -40, -12, false)
    check('the cloth stops the elephant', along(intoCloth) < 0.4, along(intoCloth).toFixed(2))
    const intoBand = flyRing(0, 17.8, -12, true)
    check('the gold band stops the elephant', along(intoBand) < 0.4, along(intoBand).toFixed(2))

    const pass = (track, index, forward = true) =>
    {
        const hoop = track.hoops[index]
        const behind = hoop.center.clone().addScaledVector(hoop.normal, forward ? -4 : 4)
        const ahead = hoop.center.clone().addScaledVector(hoop.normal, forward ? 4 : -4)
        track.resetApproach()
        track.sample(behind)
        return track.sample(ahead)
    }

    const course = new Racetrack({ loadModel: false })
    let cleared = 0
    let finished = null
    for (let index = 0; index < HOOP_COUNT; index++)
    {
        const hit = pass(course, index)
        if (hit?.index === index) cleared++
        finished = hit
    }
    check('flying every ring clears the lap and resets the course',
        cleared === HOOP_COUNT && finished?.lap === true && course.laps === 1
            && course.found === 0 && course.ignited === false && course.red.size === 0,
        `${cleared}/${HOOP_COUNT}`)

    const shuffled = new Racetrack({ loadModel: false })
    const order = [5, 12, 1, 0, 8, 3, 10, 6, 2, 11, 4, 9, 7]
    let anyOrder = true
    for (let step = 0; step < order.length; step++)
    {
        const hit = pass(shuffled, order[step], step % 2 === 0)
        if (hit?.index !== order[step] || hit.found !== step + 1) anyOrder = false
        if (step === 0 && !hit?.started) anyOrder = false
        if (step === order.length - 1 && !hit?.lap) anyOrder = false
    }
    const again = pass(shuffled, order[0])
    check('the rings count in any order, from either side',
        anyOrder && again?.found === 1 && again.started === true && shuffled.laps === 1)

    const repeat = new Racetrack({ loadModel: false })
    pass(repeat, 2)
    const second = pass(repeat, 2)
    check('a ring counts once per lap', second === null && repeat.found === 1)

    const abandoned = new Racetrack({ loadModel: false })
    pass(abandoned, 2)
    pass(abandoned, 4)
    abandoned.update(0.05, 1)
    abandoned.abandon()
    const resumed = pass(abandoned, 4)
    check('dismounting voids the lap',
        abandoned.laps === 0 && abandoned.found === 1 && abandoned.cleared.size === 1
            && resumed?.started === true && resumed.found === 1
            && abandoned.fires.every((fire) => fire.aliveCount() === 0))

    const missed = new Racetrack({ loadModel: false })
    const wide = new THREE.Vector3(-missed.hoops[0].normal.z, 0, missed.hoops[0].normal.x)
    missed.sample(missed.hoops[0].center.clone().addScaledVector(missed.hoops[0].normal, -4).addScaledVector(wide, 30))
    const skim = missed.sample(missed.hoops[0].center.clone().addScaledVector(missed.hoops[0].normal, 4).addScaledVector(wide, 30))
    check('missing the hole does not count', skim === null && missed.found === 0)

    const flames = new Racetrack({ loadModel: false })
    flames.update(0.2, 0)
    const dark = !flames.ignited && flames.fires.every((fire) => fire.aliveCount() === 0)
    pass(flames, 4)
    flames.update(0.05, 1)
    const first = flames.ignited
        && flames.red.size === 1
        && flames.fires[4].red === true
        && flames.fires[0].red === false
        && flames.fires.every((fire) => fire.aliveCount() > 0)
    const onTheMetal = flames.fires[0].particles.every((particle) =>
    {
        if (!particle.alive) return true
        const radius = Math.hypot(particle.position.x - (-0.271), particle.position.y - (-4.571))
        return radius > 11.72
    })
    pass(flames, 1, false)
    flames.update(0.05, 1)
    check('the rings stay dark until the first pass', dark)
    check('the first ring turns red and the rest catch green', first && onTheMetal)
    check('the next ring turns red', flames.red.has(1) && flames.fires[1].red === true && flames.fires[4].red === true)

    const clearedLap = new Racetrack({ loadModel: false })
    for (let index = 0; index < HOOP_COUNT; index++)
    {
        pass(clearedLap, index)
        clearedLap.update(0.05, index)
    }
    check('a finished lap puts the rings out',
        clearedLap.laps === 1 && clearedLap.found === 0 && clearedLap.ignited === false
            && clearedLap.fires.every((fire) => fire.aliveCount() === 0))

    const confetti = new Confetti()
    confetti.burst(new THREE.Vector3(2, 5, -3))
    const born = confetti.aliveCount() === 220
        && confetti.pieces.every((piece) => piece.position.distanceTo(new THREE.Vector3(2, 5, -3)) < 0.001)
    confetti.update(0.35)
    let spread = 0
    for (const piece of confetti.pieces)
    {
        if (piece.position.distanceTo(new THREE.Vector3(2, 5, -3)) > 1.5) spread++
    }
    for (let step = 0; step < 40; step++) confetti.update(0.1)
    check('confetti bursts from the elephant and then falls away',
        born && spread > 180 && confetti.aliveCount() === 0, `${spread} still ${confetti.aliveCount()}`)

    const berth = new THREE.Vector3()
    let returned = 0
    for (const castle of [mainCastle, ...outerCastles])
    {
        const yaw = castle.elephantBerth(berth)
        const target = berth.clone()
        const away = new Elephant(
            new THREE.Vector3(target.x + 12, DECK_Y + 6, target.z - 8),
            { loadModel: false, yaw: yaw + 1.4, floor: deckAt }
        )
        away.pitch = 0.6
        away.forwardSpeed = 0.4
        away.park(target.clone(), yaw)
        away.update(1 / 60, 0, { throttle: 0, pitch: 0, steer: 0, boost: false })

        const home = away.position.distanceTo(target) < 0.05
            && Math.abs(away.yaw - yaw) < 1e-6
            && away.pitch === 0
            && away.speed === 0
            && away.group.position.distanceTo(away.position) < 1e-6
        if (home) returned++
    }

    check('dismount returns her beside that walkway, facing out', returned === castleCount, `${returned}/${castleCount}`)

    // Parked the way she sits at an outer door: sunk beside the walkway.
    const door = new THREE.Vector3()
    const doorYaw = mainCastle.elephantBerth(door)
    const parkedAtDoor = new Elephant(door.clone(), { loadModel: false, yaw: doorYaw, floor: deckAt })
    const doorStep = parkedAtDoor.dismountSpot()
    check('the outer door still has a step off',
        doorStep !== null && Math.abs(doorStep.y - DECK_Y) < 0.05
            && Math.hypot(doorStep.x - parkedAtDoor.position.x, doorStep.z - parkedAtDoor.position.z) > ELEPHANT.beam * 0.4)

    const court = new Castle({ variant: 'main', loadModel: false })
    const underMain = new Elephant(
        new THREE.Vector3(0, CASTLE.spawn.y - 30, 20),
        { loadModel: false, floor: (x, z, ceiling) => court.surfaceAt(x, z, ceiling), castles: [court] }
    )
    underMain.update(1 / 60, 0, { throttle: 0, pitch: 0, steer: 0, boost: false })
    check('flying through the cloud under the main castle stays there',
        underMain.position.y < CASTLE.spawn.y - 20, underMain.position.y.toFixed(2))
    check('spawn is in front of the steps',
        Math.abs(CASTLE.spawn.x) < 1e-6
            && CASTLE.spawn.z > 5
            && Math.abs(court.surfaceAt(CASTLE.spawn.x, CASTLE.spawn.z) - CASTLE.spawn.y) < 1e-4)
    check('spawn faces the steps', Math.abs(CASTLE.spawnYaw) < 1e-6)
    const facing = new Castle({ variant: 'main', yaw: MAIN_YAW, loadModel: false })
    const facingDoor = doorOf(facing)
    const facingSpawn = facing.localToWorld(CASTLE.spawn.x, CASTLE.spawn.z)
    check('the main door points west, and the spawn stays on the court',
        facingDoor.x < -0.9 && Math.abs(facingDoor.z) < 1e-6
            && facingSpawn.x < -5 && Math.abs(facingSpawn.z) < 1e-6
            && Math.abs(facing.surfaceAt(facingSpawn.x, facingSpawn.z) - CASTLE.spawn.y) < 1e-4)
    const platform = court.surfaceAt(0, -5)
    check('the platform above the stairs holds',
        platform > CASTLE.deckY + 4 && Math.abs(court.surfaceAt(0, 0) - platform) < 0.05)
    let tread = CASTLE.deckY
    let stairClimbs = true
    for (const z of [5.2, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.2])
    {
        const height = court.surfaceAt(0, z)
        if (!Number.isFinite(height) || height + 0.02 < tread) stairClimbs = false
        tread = height
    }
    check('the stair treads step up to the platform',
        stairClimbs && tread <= platform + 0.02 && platform > tread,
        `top tread ${Number.isFinite(tread) ? tread.toFixed(2) : tread}`)
    const ringOpen = [[6, 2], [8, -11], [0, -11], [0, -20]]
        .every(([x, z]) => !Number.isFinite(court.surfaceAt(x, z)))
    check('the ring beside the platform has no floor', ringOpen)
    const courtHolds = [[20, 0], [0, 20], [-20, -20]]
        .every(([x, z]) => Math.abs(court.surfaceAt(x, z) - CASTLE.deckY) < 1e-4)
    check('the court around the ring still holds', courtHolds)

    const outside = new THREE.Vector3()
    const outsideYaw = court.elephantBerth(outside)
    check('she waits outside the starting door, facing out',
        !Number.isFinite(court.surfaceAt(outside.x, outside.z)) && Math.abs(outsideYaw) < 1e-6)

    const looker = new Player({
        platforms: court.platforms,
        walls: court.walls,
        spawnYaw: CASTLE.spawnYaw
    }, CASTLE.spawn)
    looker.yaw = 0.4
    looker.respawn()
    check('respawn puts you back in front of the steps, facing them',
        looker.position.distanceTo(CASTLE.spawn) < 1e-6 && Math.abs(looker.yaw - CASTLE.spawnYaw) < 1e-6)

    const stairClimber = new Player({
        platforms: court.platforms,
        walls: court.walls,
        spawnYaw: CASTLE.spawnYaw
    }, CASTLE.spawn)
    walk(stairClimber, ['KeyW'], 4)
    check('walking up the stairs lands on the platform',
        stairClimber.onGround && stairClimber.position.y > CASTLE.deckY + 4 && stairClimber.position.z < 0,
        `y ${stairClimber.position.y.toFixed(2)} z ${stairClimber.position.z.toFixed(2)}`)

    const railWorld = {
        platforms: court.platforms,
        walls: court.walls,
        spawnYaw: CASTLE.spawnYaw,
        voidY: CASTLE.deckY - 40
    }
    const sider = new Player(railWorld, new THREE.Vector3(0, platform, -5))
    const steppedOff = walk(sider, ['KeyD'], 3)
    const ender = new Player(railWorld, new THREE.Vector3(0, platform, -5))
    const walkedOff = walk(ender, ['KeyW'], 3)
    check('the platform rails stop a fall into the ring',
        !steppedOff && !walkedOff
            && sider.position.x < 3.4 && sider.position.y > platform - 0.2
            && ender.position.z > -11 && ender.position.y > platform - 0.2,
        `side (${sider.position.x.toFixed(2)}, ${sider.position.y.toFixed(2)}) end z ${ender.position.z.toFixed(2)}`)

    const jumper = new Player(railWorld, new THREE.Vector3(0, platform, -5))
    let space = true
    let jumpedOff = false
    const jumpInput = {
        isHeld: (code) => code === 'KeyD',
        wasPressed: (code) =>
        {
            if (code !== 'Space' || !space) return false
            space = false
            return true
        },
        axis: (positive) => positive === 'KeyD' ? 1 : 0,
        mouseDeltaX: 0,
        mouseDeltaY: 0
    }
    for (let i = 0; i < 90; i++)
    {
        if (jumper.update(1 / 60, jumpInput)) jumpedOff = true
    }
    check('a jump does not clear the platform rail',
        !jumpedOff && jumper.position.x < 3.6 && jumper.position.y > platform - 0.5,
        `x ${jumper.position.x.toFixed(2)} y ${jumper.position.y.toFixed(2)}`)

    const lipWorld = {
        platforms: court.platforms,
        walls: court.walls,
        spawnYaw: 0
    }
    const fromSide = new Player(lipWorld, new THREE.Vector3(24, CASTLE.deckY, -11.5))
    fromSide.yaw = Math.PI / 2
    walk(fromSide, ['KeyW'], 3)
    const fromBack = new Player(lipWorld, new THREE.Vector3(0, CASTLE.deckY, -36))
    fromBack.yaw = Math.PI
    walk(fromBack, ['KeyW'], 3)
    check('the lip around the ring stops you',
        fromSide.position.x > 16 && fromSide.position.y > CASTLE.deckY - 1
            && fromBack.position.z < -27 && fromBack.position.y > CASTLE.deckY - 1,
        `side (${fromSide.position.x.toFixed(1)}, ${fromSide.position.y.toFixed(1)}) back z ${fromBack.position.z.toFixed(1)}`)

    const hatchAt = new THREE.Vector3(0, 2.76, -11.57)
    court.hatch = {
        updateWorldMatrix() {},
        getWorldPosition: (target) => target.copy(hatchAt)
    }
    court.hatchState = 'closed'
    court.submarineMixer = { update() {} }
    court.hatchAction = { timeScale: 1, paused: true }
    const lamp = new THREE.PointLight()
    lamp.userData.hue = 0
    court.discoLights = [lamp]
    court.discoTime = 0
    court.update(0.016, new THREE.Vector3(0, CASTLE.deckY, 8))
    court.update(0.016, new THREE.Vector3(0, CASTLE.deckY, hatchAt.z))
    check('the hatch stays shut until you are beside it',
        court.hatchState === 'closed' && court.hatchAction.paused && court.hatchAction.timeScale === 1)
    check('the chamber stays dark while the hatch is shut', lamp.intensity === 0)
    court.update(0.016, new THREE.Vector3(0, platform, -10.2))
    check('the hatch starts opening when you reach it',
        court.hatchState === 'opening' && court.hatchAction.paused === false && court.hatchAction.timeScale === -1)
    check('the chamber lights when the hatch starts to open', lamp.intensity > 0)
    court.hatchAction.paused = true
    court.update(0.016, new THREE.Vector3(0, platform, -10.2))
    check('the hatch holds open after it finishes', court.hatchState === 'open')
    court.update(0.016, new THREE.Vector3(20, CASTLE.deckY, 20))
    check('the hatch starts closing when you leave',
        court.hatchState === 'closing' && court.hatchAction.paused === false && court.hatchAction.timeScale === 1)
    check('the chamber stays lit until the hatch has shut', lamp.intensity > 0)
    court.update(0.016, new THREE.Vector3(0, platform, -10.2))
    check('coming back while it closes opens it again',
        court.hatchState === 'opening' && court.hatchAction.paused === false && court.hatchAction.timeScale === -1)
    court.update(0.016, new THREE.Vector3(20, CASTLE.deckY, 20))
    court.hatchAction.paused = true
    court.update(0.016, new THREE.Vector3(20, CASTLE.deckY, 20))
    check('the hatch holds shut after it closes',
        court.hatchState === 'closed' && court.hatchAction.paused && court.hatchAction.timeScale === 1)
    check('the chamber goes dark once the hatch has shut', lamp.intensity === 0)

    const atHatch = new THREE.Vector3(0, platform, -10.2)
    check('standing at the hatch offers a way in', court.canBoard(atHatch))
    check('the court is too far to board', !court.canBoard(new THREE.Vector3(0, CASTLE.deckY, 8)))
    court.hatchState = 'open'
    court.hatchAction.paused = true
    court.submarine = { position: new THREE.Vector3(), rotation: { z: 0 } }
    court.depart()
    court.update(0.05, atHatch)
    check('boarding seals the hatch and the boat starts down',
        court.departing && court.hatchState === 'closing' && court.hatchAction.timeScale === 1
            && court.hatchAction.paused === false && court.submarine.position.y < 0
            && !court.canBoard(atHatch))
    court.update(0.05, atHatch)
    check('standing on the hatch does not open it again once you have boarded',
        court.hatchState === 'closing' && court.submarine.position.y < -0.0001)
    check('the opening shot holds for the first three seconds', court.plunging === false)
    court.descentTime = 4
    const yBeforePlunge = court.submarine.position.y
    court.update(0.016, atHatch)
    check('after three seconds the boat pitches nose-down and keeps falling',
        court.plunging && court.submarine.rotation.z === -Math.PI / 2
            && court.submarine.position.y < yBeforePlunge)
    court.descentSpeed = 8
    court.submarine.position.y = 0
    court.update(0.1, atHatch)
    check('above the cloud the dive holds its pace', court.descentSpeed === 8)
    court.descentSpeed = 8
    court.submarine.position.y = -3
    court.update(0.1, atHatch)
    check('the dive accelerates while it falls through the cloud', court.descentSpeed > 8)
    court.submarine.position.y = -12
    court.update(0.05, atHatch)
    check('just clear of the cloud, the nose is still dark',
        court.clearedCloudAt !== null && court.reentryHeat === 0)
    court.descentTime = court.clearedCloudAt + 1.6
    court.update(0.05, atHatch)
    check('a moment after the cloud, the nose catches fire', court.reentryHeat > 0)
})

group('flag stripes', () =>
{
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 0, 2, 0, 0], 3))
    geometry.morphAttributes.position = [
        new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 3)
    ]
    const white = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#e7e7e7' }))
    white.name = 'Cube_002'
    const red = new THREE.Mesh(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
        new THREE.MeshStandardMaterial({ color: '#e73129' })
    )
    red.name = 'Cube_002_1'
    const source = new THREE.Group()
    source.add(white, red)

    const painted = []
    for (let index = 0; index < HOOP_COUNT; index++)
    {
        const ring = source.clone(true)
        paintFlag(ring, index)
        painted.push(ring)
    }

    const fileRed = new THREE.Color('#e73129')
    check('painting a flag leaves the shared file colours alone',
        !geometry.attributes.color && red.material.color.equals(fileRed))

    let distinctSides = true
    let distinctCenter = true
    let clothStillWaves = true
    const seen = new Set()
    for (const ring of painted)
    {
        const cloth = ring.getObjectByName('Cube_002')
        const band = ring.getObjectByName('Cube_002_1')
        const colors = cloth.geometry.attributes.color
        const left = new THREE.Color(colors.getX(0), colors.getY(0), colors.getZ(0))
        const right = new THREE.Color(colors.getX(1), colors.getY(1), colors.getZ(1))
        if (left.equals(right)) distinctSides = false
        if (left.equals(band.material.color) || right.equals(band.material.color)) distinctCenter = false
        if (!cloth.geometry.morphAttributes.position?.length) clothStillWaves = false
        if (cloth.geometry === geometry) clothStillWaves = false
        seen.add(`${left.getHexString()}-${right.getHexString()}-${band.material.color.getHexString()}`)
    }

    check('the two outer stripes take different colours', distinctSides)
    check('the centre stripe is a third colour', distinctCenter)
    check('each hoop keeps its own copy of the waving cloth', clothStillWaves)
    check('the hoops do not all fly the same flag', seen.size > 1)
})

group('dock beacons', () =>
{
    const castles = [
        new Castle({ variant: 'main', yaw: MAIN_YAW, loadModel: false }),
        ...CASTLE_RING.map((placement) => new Castle({ ...placement, loadModel: false }))
    ]
    const tips = castles.map((castle) => castle.dockTip(new THREE.Vector3()))
    check('every dock tip sits on that dock\'s surface',
        tips.every((tip, index) => Math.abs(castles[index].surfaceAt(tip.x, tip.z) - tip.y) < 0.05),
        tips.map((tip, index) => `${castles[index].surfaceAt(tip.x, tip.z).toFixed(2)} vs ${tip.y.toFixed(2)}`).join(', '))
    check('each tip is out past the castle wall, toward the dock end',
        tips.every((tip, index) => castles[index].worldToLocal(tip.x, tip.z).z > (index === 0 ? 45 : 22)))

    const beacons = new DockBeacons(tips)
    check('one beacon per dock', beacons.beams.length === 3)
    check('beacons stand on the dock tips', beacons.beams.every((beam, index) => beam.position.distanceTo(tips[index]) < 1e-6))
    for (let frame = 0; frame < 120; frame++) beacons.update(1 / 60, true)
    const lit = beacons.intensity
    for (let frame = 0; frame < 180; frame++) beacons.update(1 / 60, false)
    check('beacons brighten while riding and settle back on foot', lit > 0.9 && beacons.intensity < 0.35 && beacons.intensity > 0.25,
        `${lit.toFixed(2)} -> ${beacons.intensity.toFixed(2)}`)
})

group('brick wall', () =>
{
    const slots = brickSlots()
    const even = slots.filter((slot) => Math.abs(slot.y) < 1e-6)
    const odd = slots.filter((slot) => Math.abs(slot.y - 0.85) < 1e-6)
    check('the wall is ten courses of five bricks', slots.length === 50 && even.length === 5 && odd.length === 5)
    check('every other course sits half a brick over',
        Math.abs((odd[0].z - even[0].z) - (-BRICK.length * 0.5)) < 1e-6)

    const wall = new BrickWall({ loadModel: false })
    const openSky = () => Number.NEGATIVE_INFINITY
    const elephant = new Elephant(new THREE.Vector3(-6, 0.55, -4.64), {
        loadModel: false,
        yaw: Math.PI / 2,
        floor: openSky,
        castles: []
    })
    elephant.forwardSpeed = 20
    const fly = { throttle: 1, pitch: 0, steer: 0, boost: false }
    for (let frame = 0; frame < 45; frame++)
    {
        elephant.update(1 / 60, frame / 60, fly)
        wall.update(1 / 60, elephant)
    }

    const corner = wall.bricks.find((brick) => brick.position.y > 7 && brick.position.z < -9)
    const rising = wall.bricks.find((brick) => brick.loose && brick.velocity.y > 1)
    check('she flies through the wall', elephant.position.x > 2, elephant.position.x.toFixed(2))
    check('bricks she hits come loose', wall.looseCount() > 4, String(wall.looseCount()))
    check('a brick she misses stays in the wall', corner && !corner.loose)
    check('a hit above her chest is thrown upward', Boolean(rising))

    elephant.forwardSpeed = 0
    const rise = rising.velocity.y
    const height = rising.position.y
    for (let frame = 0; frame < 60; frame++) wall.update(1 / 60, elephant)
    check('loose bricks drift without falling', rising.velocity.y > rise * 0.3 && rising.position.y > height,
        rising.velocity.y.toFixed(2))

    for (let frame = 0; frame < 180; frame++) wall.update(1 / 60, elephant)
    check('loose bricks disappear once they have drifted', rising.alive === false)
})

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
