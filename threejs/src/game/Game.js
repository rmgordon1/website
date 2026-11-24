import * as THREE from 'three'
import { Input } from './Input.js'
import { HUD } from './HUD.js'
import { Environment } from '../world/Environment.js'
import { Castle, CASTLE, CASTLE_RING, MAIN_YAW, voxelSweepSphere } from '../world/Castle.js'
import { Interior } from '../world/Interior.js'
import { HOOP_COUNT, Racetrack } from '../world/Racetrack.js'
import { Confetti } from '../world/Confetti.js'
import { BrickWall, cubeSlots } from '../world/BrickWall.js'
import { DockBeacons } from '../world/DockBeacons.js'
import { Elephant, ELEPHANT } from '../entities/Elephant.js'
import { Player } from '../player/Player.js'
import { claimName, nameProblem, rememberName, rememberedName, submitLap, tidyName } from './PlayerName.js'
import { preloadPortfolio, goToPortfolio } from './Portfolio.js'

const LOOK_SENSITIVITY = 0.0025

/** Close enough to the elephant's flank to climb on. */
const MOUNT_RANGE = ELEPHANT.length * 0.5 + 1.8

const ELEPHANT_CHASE = { distance: 12.5, height: 5.4, lookHeight: 2.5, speedScale: 8 }

/**
 * The chase camera is a small sphere, a little wider than the near plane,
 * so the lens never pokes into stone. It snaps in front of a wall at once
 * and eases back out at this rate once the wall is gone (about half a second).
 */
const CAMERA_RADIUS = 0.3
const CAMERA_EASE_OUT = 6
/** Squeezed this close, the elephant fades out so she does not fill the view. */
const FADE_START = 3.5
const FADE_END = 2

/** World offset from amidships. Far enough to hold the whole hull, above and off the bow quarter. */
const SUB_VIEW_OFFSET = new THREE.Vector3(18, 11, 22)
/**
 * Under the cloud deck. The shell along the drop bottoms out near y -44,
 * so this sits below it, off to the side, looking up the column.
 */
const PLUNGE_CAMERA_Y = -50
const PLUNGE_SIDE = new THREE.Vector3(22, 0, 10)

/**
 * The opening: a black screen with the elephant turning on the spot, seen
 * front on, until everything has loaded. She then finishes her turn and
 * stops facing the camera, the world appears, and the camera swings round
 * to where the riding camera starts.
 */
const INTRO = {
    /** Radians a second while she turns. About one turn every 3.5 s. */
    spinSpeed: 1.8,
    /** Radians she takes to slow from spinSpeed to a stop. */
    brakeAngle: 1.4,
    /** Metres from her middle to the camera, and the camera's height above her feet. */
    distance: 10,
    height: 1.6,
    /** Seconds the camera takes to swing round behind her. */
    orbitTime: 2.6,
    /** Seconds with nothing left downloading before loading counts as done. */
    quietTime: 0.4
}
const INTRO_BLACK = new THREE.Color('#000000')

/**
 * Centre to brick, in metres, of the box she starts in. The chase camera
 * rests 12.5 behind her and about 6 up, so this keeps it inside.
 */
const START_CUBE_HALF = 14.5

/**
 * TEMPORARY perf experiment: the sun's shadow map is redrawn this often, in
 * seconds, instead of every frame. Drawing it means drawing every
 * shadow-casting mesh again into a 4096² map. The castles never move, so
 * their shadows do not need it; moving things (the elephant, loose bricks)
 * have shadows that step at this rate instead of following smoothly.
 * ?shadowevery=<seconds> overrides it; ?shadowevery=0 is every frame (the old way).
 */
const SHADOW_EVERY = (() =>
{
    const value = Number(new URLSearchParams(location.search).get('shadowevery'))
    return new URLSearchParams(location.search).has('shadowevery') && Number.isFinite(value) ? value : 1
})()

/** How far below the deck a fall has to go before she is put back at the door. */
const VOID_DROP = 40

export class Game
{
    constructor(canvas)
    {
        this.canvas = canvas
        this.clock = new THREE.Clock()
        this.elapsed = 0
        this.state = 'walking'
        this.helmView = false
        /** While riding, W raises the nose and S lowers it. */
        this.invertPitch = false

        // Every loader reports to three's default manager. Busy from its
        // first file until the last one in flight has finished.
        this.loadingBusy = false
        THREE.DefaultLoadingManager.onStart = () => { this.loadingBusy = true }
        THREE.DefaultLoadingManager.onLoad = () => { this.loadingBusy = false }

        this.#setupRenderer()
        this.#setupScene()
        this.#setupWorld()

        this.input = new Input(canvas)
        this.hud = new HUD()
        this.hud.onStart(() =>
        {
            this.hud.setStartHint('')
            this.input.requestLock()
        })
        this.input.onLockError = () =>
        {
            // Straight from the name screen, the paused screen carries the message.
            this.hud.showStart()
            this.hud.setStartHint('The browser blocked mouse lock. Close the console and any open menu, click the page, then press resume.')
        }

        /** Who is playing. Null until the name screen has been passed. */
        this.playerName = null
        this.hud.onNameSubmit((typed) => this.#submitName(typed))
        this.input.onLockChange = (locked) =>
        {
            if (this.leaving) return
            // Sent back to the name screen (the name was taken): that screen stays, not "paused".
            if (!locked && this.playerName === null) return
            locked ? this.hud.hideStart() : this.hud.showStart()
        }

        /** Set once a "portfolio" button is pressed. The game is over from then on. */
        this.leaving = null
        this.hud.onPortfolio(() => this.#leaveForPortfolio())

        this.chaseYaw = 0
        this.chasePitch = 0.1
        this.helmYaw = 0
        this.helmPitch = -0.05
        this.chasePosition = new THREE.Vector3()
        this.chaseTarget = new THREE.Vector3()
        this.chaseInitialised = false
        /** Metres a wall has pushed the chase camera in from where it wants to be. Eases back to 0. */
        this.chasePull = 0
        this.chaseDir = new THREE.Vector3()
        this.subViewPosition = new THREE.Vector3()
        this.subViewTarget = new THREE.Vector3()
        this.subViewReady = false
        this.plungeReady = false

        this.scratch = new THREE.Vector3()
        this.scratchB = new THREE.Vector3()
        this.focusPoint = new THREE.Vector3()

        window.addEventListener('resize', () => this.#resize())
        this.#resize()

        this.#startOnElephant()
        this.#beginIntro()
    }

    /** Black screen, the elephant alone, the HUD and start screen out of the way. */
    #beginIntro()
    {
        this.intro = {
            phase: 'loading',
            spin: 0,
            yaw: this.elephant.yaw,
            spot: this.elephant.position.clone(),
            modelsReady: false,
            elephantShown: false,
            quiet: 0,
            compiled: false,
            brakeFrom: 0,
            brakeTo: 0,
            brakeTime: 0,
            time: 0,
            background: this.scene.background,
            hidden: new Set()
        }

        document.body.classList.add('is-intro')
        this.hud.hideStart()
        this.#hideWorld()

        this.elephant.group.visible = false
        this.elephant.ready.then(() =>
        {
            this.elephant.group.visible = true
            this.intro.elephantShown = true
        })

        Promise.all([
            this.elephant.ready,
            this.castle.ready,
            ...this.outerCastles.map((castle) => castle.ready),
            this.interior.ready
        ]).finally(() => { this.intro.modelsReady = true })
    }

    /** Everything in the scene but her, her fire, and the lights. */
    #hideWorld()
    {
        for (const child of this.scene.children)
        {
            if (child === this.elephant.group || child === this.elephant.effects || child.isLight) continue
            if (!child.visible) continue
            child.visible = false
            this.intro.hidden.add(child)
        }
    }

    #showWorld()
    {
        for (const child of this.intro.hidden) child.visible = true
        this.intro.hidden.clear()
        // The last shadow map was drawn with the world hidden.
        this.renderer.shadowMap.needsUpdate = true
    }

    #updateIntro(delta)
    {
        const intro = this.intro
        intro.time += delta

        // The sky arrives on its own time. Keep it for the reveal, and the screen black until then.
        if (intro.phase !== 'orbit' && this.scene.background !== INTRO_BLACK)
        {
            intro.background = this.scene.background
            this.scene.background = INTRO_BLACK
        }
        if (intro.phase !== 'orbit') this.#hideWorld()

        if (intro.phase === 'loading')
        {
            intro.spin += INTRO.spinSpeed * delta

            const settled = intro.modelsReady && intro.elephantShown && !this.loadingBusy
            intro.quiet = settled ? intro.quiet + delta : 0

            if (intro.quiet >= INTRO.quietTime)
            {
                intro.phase = 'compiling'
                // Build every shader now, while the screen is still black,
                // so the world does not stutter in when it appears.
                this.#showWorld()
                const compiling = this.renderer.compileAsync(this.scene, this.camera)
                this.#hideWorld()
                compiling.catch(() => {}).finally(() => { intro.compiled = true })
            }
        }
        else if (intro.phase === 'compiling')
        {
            intro.spin += INTRO.spinSpeed * delta

            if (intro.compiled)
            {
                // Finish the turn: brake so she stops facing the camera, at
                // the next full turn that leaves room to slow down.
                const turn = Math.PI * 2
                intro.brakeFrom = intro.spin
                intro.brakeTo = Math.ceil((intro.spin + INTRO.brakeAngle) / turn) * turn
                intro.phase = 'turning'
                // Everything is in. The loading message fades while she finishes her turn.
                document.body.classList.add('is-loaded')
            }
        }
        else if (intro.phase === 'turning')
        {
            // Full speed until the brake point, then a steady slow-down to a stop.
            const brakeStart = intro.brakeTo - INTRO.brakeAngle
            if (intro.spin < brakeStart)
            {
                intro.spin = Math.min(brakeStart, intro.spin + INTRO.spinSpeed * delta)
            }
            else
            {
                const brakeDuration = (2 * INTRO.brakeAngle) / INTRO.spinSpeed
                intro.brakeTime = Math.min(brakeDuration, intro.brakeTime + delta)
                const t = intro.brakeTime
                const slowing = (INTRO.spinSpeed * INTRO.spinSpeed) / (2 * INTRO.brakeAngle)
                intro.spin = brakeStart + INTRO.spinSpeed * t - 0.5 * slowing * t * t

                if (intro.brakeTime >= brakeDuration)
                {
                    intro.spin = intro.brakeTo
                    intro.phase = 'orbit'
                    intro.time = 0
                    this.#showWorld()
                    this.scene.background = intro.background
                }
            }
        }

        this.elephant.yaw = intro.yaw + (intro.phase === 'orbit' ? 0 : intro.spin)
        this.elephant.update(delta, this.elapsed, this.idleControls)
        this.elephant.setFade(1)

        if (intro.phase === 'orbit') this.#orbitIntroCamera(Math.min(1, intro.time / INTRO.orbitTime))
        else this.#placeIntroCamera(0)

        if (intro.phase === 'orbit' && intro.time >= INTRO.orbitTime) this.#endIntro()

        this.environment.update(this.elephant.position)
    }

    /**
     * The camera on a path round her, from in front (0) to the riding
     * camera's resting spot behind her (1). Radius, height, and aim all
     * blend, so the last frame is exactly where the chase camera starts.
     */
    #orbitIntroCamera(progress)
    {
        const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10)
        this.#placeIntroCamera(eased)
    }

    #placeIntroCamera(amount)
    {
        const spot = this.intro.spot
        const yaw = this.intro.yaw
        // Same formula as #updateChaseCamera at rest, with the pitch #mountElephant sets.
        const chaseHeight = ELEPHANT_CHASE.height + this.chasePitch * 7

        // Swing round her right-hand side: 0 is dead ahead, π dead behind.
        const around = yaw + Math.PI * (1 - amount)
        const distance = THREE.MathUtils.lerp(INTRO.distance, ELEPHANT_CHASE.distance, amount)
        const height = THREE.MathUtils.lerp(INTRO.height, chaseHeight, amount)
        const look = THREE.MathUtils.lerp(ELEPHANT.back * 0.5, ELEPHANT_CHASE.lookHeight, amount)

        this.camera.position.set(
            spot.x - Math.sin(around) * distance,
            spot.y + height,
            spot.z - Math.cos(around) * distance
        )
        this.camera.lookAt(spot.x, spot.y + look, spot.z)
    }

    /** Hand over: her pose as the game set it, the HUD back, the start screen up. */
    #endIntro()
    {
        this.elephant.park(this.intro.spot, this.intro.yaw)
        this.#placeIntroCamera(1)
        this.chaseInitialised = false
        this.intro.phase = 'done'
        document.body.classList.remove('is-intro')
        // First visit of the page: who is playing, instead of "paused".
        this.hud.showNameScreen(rememberedName())
    }

    /**
     * The opening again, as the way out: black, the world hidden, the
     * elephant turning where she is, "loading..." over her. The portfolio
     * loads in a hidden frame meanwhile, and the page goes there once it has.
     */
    #leaveForPortfolio()
    {
        if (this.leaving) return

        // The buttons only show after the intro, but make sure it never resumes.
        this.intro.phase = 'done'
        this.leaving = { spin: 0, yaw: this.elephant.yaw }

        if (document.pointerLockElement) document.exitPointerLock()
        this.hud.hideStart()
        this.hud.hideNameScreen()
        document.body.classList.remove('is-intro', 'is-loaded')
        document.body.classList.add('is-leaving')

        this.elephant.group.visible = true
        this.scene.background = INTRO_BLACK
        this.#hideWorld()

        preloadPortfolio().then(goToPortfolio)
    }

    #updateLeaving(delta)
    {
        const leaving = this.leaving
        leaving.spin += INTRO.spinSpeed * delta

        // The sky may still arrive late; keep the screen black regardless.
        if (this.scene.background !== INTRO_BLACK) this.scene.background = INTRO_BLACK
        this.#hideWorld()

        this.elephant.yaw = leaving.yaw + leaving.spin
        this.elephant.update(delta, this.elapsed, this.idleControls)
        this.elephant.setFade(1)

        // Front on, the same framing as the opening, wherever she is now.
        this.intro.spot.copy(this.elephant.position)
        this.intro.yaw = leaving.yaw
        this.#placeIntroCamera(0)

        this.environment.update(this.elephant.position)
    }

    /** From the name screen. A good name starts the game; a bad one says why. */
    #submitName(typed)
    {
        const name = tidyName(typed)
        const problem = nameProblem(name)
        if (problem)
        {
            this.hud.setNameHint(problem)
            return
        }

        this.playerName = name
        rememberName(name)
        this.hud.hideNameScreen()
        // Still inside the click or Enter press, which the browser needs before
        // it will lock the mouse. So play starts now and the server is asked
        // meanwhile: a name someone else holds brings the name screen back.
        this.input.requestLock()

        claimName(name).then((claim) =>
        {
            if (claim.ok || this.playerName !== name || this.leaving) return

            this.playerName = null
            if (document.pointerLockElement) document.exitPointerLock()
            this.hud.hideStart()
            this.hud.showNameScreen(name)
            this.hud.setNameHint(claim.reason)
        })
    }

    /**
     * The page opens mounted, hovering in the middle of the figure 8's far
     * loop: the one across the crossing ring from the main castle. She
     * faces the main castle, so the course is laid out in front of her.
     */
    #startOnElephant()
    {
        const hoops = this.racetrack.hoops
        // The crossing is the ring both loops share, on the centre line.
        const crossing = hoops.reduce((a, b) => Math.abs(b.z) < Math.abs(a.z) ? b : a)
        const castleSide = Math.sign(this.castle.x - crossing.x) || 1
        const farLoop = hoops.filter((hoop) => Math.sign(hoop.x - crossing.x) === -castleSide)
        if (!farLoop.length) return

        const spot = this.scratch.set(0, 0, 0)
        for (const hoop of farLoop) spot.add(hoop.center)
        spot.divideScalar(farLoop.length)
        spot.y -= ELEPHANT.back * 0.5

        const yaw = Math.atan2(this.castle.x - spot.x, this.castle.z - spot.z)
        this.elephant.park(spot, yaw)
        this.#mountElephant()

        // TEMPORARY perf experiment: ?nocube skips the brick box and its Matrix rain
        // entirely (no bricks, no rain shader, no brick.glb download).
        if (new URLSearchParams(location.search).has('nocube'))
        {
            console.info('[perf] start cube skipped (?nocube)')
            return
        }

        // A brick box round her, wide enough that the chase camera starts
        // inside it too. She breaks out the same way she breaks the wall.
        this.startCube = new BrickWall({
            slots: cubeSlots(START_CUBE_HALF),
            matrixInside: START_CUBE_HALF,
            // Thousands of bricks: plain boxes, and no shadow. The inside is
            // lit by the rain, so a shadow from the shell adds nothing.
            detailed: false,
            castShadow: false,
            // On the wall she faces: the cube is turned to her yaw, so that is its +Z wall.
            matrixMessage: 'welcome to thebertgordon.com'
        })
        const middle = this.scratchB.copy(spot)
        middle.y += ELEPHANT.back * 0.5
        this.startCube.placeAround(middle, yaw)
        this.scene.add(this.startCube.group)
    }

    #setupRenderer()
    {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        // Redrawn on a timer in #tick (see SHADOW_EVERY), and whenever the world reappears.
        this.renderer.shadowMap.autoUpdate = SHADOW_EVERY <= 0
        this.renderer.shadowMap.needsUpdate = true
        this.shadowClock = 0
        console.info(`[perf] shadow map redrawn ${SHADOW_EVERY <= 0 ? 'every frame' : `every ${SHADOW_EVERY} s`}`)
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 0.62
    }

    #setupScene()
    {
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(66, 2, 0.15, 4000)
        this.camera.rotation.order = 'YXZ'
        this.scene.add(this.camera)

        this.environment = new Environment(this.renderer, this.scene)
    }

    #setupWorld()
    {
        this.castle = new Castle({ variant: 'main', yaw: MAIN_YAW })
        this.scene.add(this.castle.group)

        this.outerCastles = CASTLE_RING.map((placement) =>
        {
            const castle = new Castle(placement)
            this.scene.add(castle.group)
            return castle
        })

        // TEMPORARY perf experiment: ?nocastles hides every castle (no draw, no shadow).
        // They still load and keep their collision, so the game runs the same otherwise.
        if (new URLSearchParams(location.search).has('nocastles'))
        {
            for (const castle of [this.castle, ...this.outerCastles]) castle.group.visible = false
            console.info('[perf] castles hidden (?nocastles)')
        }

        this.interior = new Interior()
        this.scene.add(this.interior.group)
        /** The castle whose door was used, while the player is in the room. */
        this.returnCastle = null
        /** Seconds to hide the door prompt after a crossing, so the far side does not ask immediately. */
        this.portalHold = 0

        this.racetrack = new Racetrack()
        this.scene.add(this.racetrack.group)

        this.confetti = new Confetti()
        this.scene.add(this.confetti.group)

        /** A column of light on every dock she can land on. */
        this.dockBeacons = new DockBeacons([this.castle, ...this.outerCastles].map((castle) => castle.dockTip(new THREE.Vector3())))
        this.scene.add(this.dockBeacons.group)

        const berth = new THREE.Vector3()
        const elephantYaw = this.castle.elephantBerth(berth)
        this.elephant = new Elephant(berth, {
            yaw: elephantYaw,
            floor: (x, z, ceiling) => this.#surfaceAt(x, z, ceiling),
            castles: [this.castle, ...this.outerCastles, ...this.racetrack.colliders]
        })
        this.scene.add(this.elephant.group, this.elephant.effects)

        /** Fed to the elephant while the player is on foot, so she still idles. */
        this.idleControls = { throttle: 0, pitch: 0, steer: 0, boost: false }

        const spawnAt = this.castle.localToWorld(CASTLE.spawn.x, CASTLE.spawn.z)
        this.outsideCastles = [this.castle, ...this.outerCastles]
        this.homeSpawn = new THREE.Vector3(spawnAt.x, CASTLE.spawn.y, spawnAt.z)
        this.homeYaw = this.castle.yaw + CASTLE.spawnYaw
        this.homeVoid = CASTLE.deckY - VOID_DROP
        this.player = new Player({
            platforms: [],
            walls: [],
            castles: this.outsideCastles,
            spawnYaw: this.homeYaw,
            voidY: this.homeVoid
        }, this.homeSpawn.clone())
    }

    start()
    {
        this.renderer.setAnimationLoop(() => this.#tick())
    }

    /** Places the debug menu can jump to. */
    static DEBUG_PLACES = ['Courtyard', 'Elephant', 'Submarine hatch', 'North castle door', 'South castle door', 'Castle interior', 'Race start']

    /**
     * Debug menu: drop the player at one of DEBUG_PLACES. Returns a message
     * when the jump cannot happen (models still loading, or mid-dive).
     */
    debugTeleport(place)
    {
        if (this.state === 'diving') return 'The submarine has left. Reload the page.'

        // Off the elephant and out of the room first, so her berth and the deck lists are current.
        this.#debugLeaveCurrent()

        const target = this.scratch
        let yaw = this.homeYaw

        switch (place)
        {
            case 'Courtyard':
                target.copy(this.homeSpawn)
                break

            case 'Elephant':
            {
                this.elephant.boardingPoint(target)
                const toHer = this.scratchB.copy(this.elephant.position).sub(target)
                yaw = Math.atan2(-toHer.x, -toHer.z)
                break
            }

            case 'Submarine hatch':
            {
                if (!this.castle.hatch) return 'The submarine is still loading.'
                this.castle.hatch.updateWorldMatrix(true, false)
                const hatch = this.castle.hatch.getWorldPosition(this.scratchB)
                const floor = this.#surfaceAt(hatch.x, hatch.z, hatch.y + 1)
                target.set(hatch.x, Number.isFinite(floor) ? floor : hatch.y, hatch.z)
                break
            }

            case 'North castle door':
            case 'South castle door':
            {
                const castle = this.outerCastles.reduce((a, b) =>
                    (place.startsWith('North') ? b.z < a.z : b.z > a.z) ? b : a)
                yaw = castle.doorExit(target) + Math.PI
                break
            }

            case 'Castle interior':
                if (!this.interior.loaded) return 'The interior is still loading.'
                this.#enterInterior(this.outerCastles[0])
                return null

            case 'Race start':
                this.#debugToRaceStart()
                return null

            default:
                return `Unknown place: ${place}`
        }

        this.#debugPlaceWalker(target, yaw)
        return null
    }

    /** Debug menu: end a running lap as if the last ring had just been flown. */
    debugFinishLap()
    {
        if (!this.hud.lapRunning) return 'No lap is running. Fly through a ring to start the timer.'

        this.racetrack.completeLap()
        this.hud.stopLap()
        const origin = this.scratchB.copy(this.elephant.position)
        origin.y += ELEPHANT.back * 0.65
        this.confetti.burst(origin)
        return null
    }

    /** Off the elephant (abandoning any lap) and back outside, without moving the player yet. */
    #debugLeaveCurrent()
    {
        if (this.state === 'riding')
        {
            this.state = 'walking'
            this.helmView = false
            const berth = this.scratchB
            const yaw = this.castle.elephantBerth(berth)
            this.elephant.park(berth, yaw)
            if (this.hud.disqualify()) this.racetrack.abandon()
        }

        if (this.returnCastle)
        {
            this.returnCastle = null
            this.player.world.castles = this.outsideCastles
            this.player.spawn.copy(this.homeSpawn)
            this.player.spawnYaw = this.homeYaw
            this.player.voidY = this.homeVoid
        }
    }

    #debugPlaceWalker(position, yaw)
    {
        this.player.position.copy(position)
        this.player.velocityY = 0
        this.player.onGround = true
        this.player.yaw = yaw
        this.player.pitch = 0
        this.portalHold = 0.45
        this.player.applyToCamera(this.camera)
    }

    /** Mounted, hovering a short run-up in front of the ring nearest the main castle. */
    #debugToRaceStart()
    {
        const hoop = this.racetrack.hoops.reduce((a, b) =>
            Math.hypot(b.x, b.z) < Math.hypot(a.x, a.z) ? b : a)

        // A hoop's hole runs along its local +Z; the elephant faces her local +Z too.
        const along = this.scratch.set(Math.sin(hoop.yaw), 0, Math.cos(hoop.yaw))
        const spot = this.scratchB.copy(hoop.center).addScaledVector(along, -45)
        spot.y -= ELEPHANT.back * 0.5

        this.elephant.park(spot, hoop.yaw)
        this.#mountElephant()
        this.hud.setNotice('Fly through any ring to start the clock.')
    }

    #resize()
    {
        const width = window.innerWidth
        const height = window.innerHeight

        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(width, height)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

        // Particle point sizes are in device pixels, so they depend on both.
        const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2())
        this.elephant.setViewport(buffer.y, this.camera.fov)
        this.castle.setViewport(buffer.y, this.camera.fov)
        this.racetrack.setViewport(buffer.y, this.camera.fov)
    }

    #tick()
    {
        const delta = Math.min(this.clock.getDelta(), 0.05)

        if (SHADOW_EVERY > 0)
        {
            this.shadowClock += delta
            if (this.shadowClock >= SHADOW_EVERY)
            {
                this.shadowClock = 0
                this.renderer.shadowMap.needsUpdate = true
            }
        }

        if (this.leaving)
        {
            this.#updateLeaving(delta)
            this.renderer.render(this.scene, this.camera)
            this.input.endFrame()
            return
        }

        if (this.intro.phase !== 'done')
        {
            this.#updateIntro(delta)
            this.renderer.render(this.scene, this.camera)
            this.input.endFrame()
            return
        }

        // Esc releases the pointer and raises the pause screen. Hold the world there.
        if (!this.input.locked)
        {
            if (this.state === 'walking') this.player.applyToCamera(this.camera)
            this.environment.update(this.#focusPosition())
            this.renderer.render(this.scene, this.camera)
            this.input.endFrame()
            return
        }

        this.elapsed += delta
        this.hud.advanceLap(delta)

        if (this.input.wasPressed('KeyH')) this.hud.toggleControls()
        if (this.input.wasPressed('KeyV') && this.state === 'riding') this.helmView = !this.helmView
        if (this.input.wasPressed('KeyI') && this.state === 'riding') this.invertPitch = !this.invertPitch

        if (this.state === 'walking') this.#updateWalking(delta)
        else if (this.state === 'diving') this.#updateDiving(delta)
        else this.#updateRiding(delta)
        if (this.state !== 'riding') this.elephant.setFade(1)

        this.hud.setControlMode(this.state === 'diving' ? null : this.state)
        this.hud.setPitchInverted(this.invertPitch)

        this.castle.update(delta, this.player.position)
        for (const castle of this.outerCastles) castle.update(delta)
        this.racetrack.update(delta, this.elapsed)
        this.confetti.update(delta)
        this.dockBeacons.update(delta, this.state === 'riding')
        this.startCube?.update(delta, this.elephant)

        if (this.state === 'diving') this.#updateSubCamera(delta)

        this.environment.update(this.#focusPosition())
        this.hud.update(delta)

        this.renderer.render(this.scene, this.camera)
        this.input.endFrame()
    }

    #updateWalking(delta)
    {
        this.elephant.update(delta, this.elapsed, this.idleControls)

        this.player.look(this.input.mouseDeltaX, this.input.mouseDeltaY)

        const shouldRespawn = this.player.update(delta, this.input)
        if (shouldRespawn)
        {
            this.player.respawn()
            this.hud.setNotice(this.returnCastle ? 'Back by the door.' : 'Back in the courtyard.')
        }

        // A crossing puts the player down beside the far door. Hold the prompt
        // until they have had a moment to step clear of it.
        let door = null
        if (this.portalHold > 0)
            this.portalHold = Math.max(0, this.portalHold - delta)
        else
            door = this.#nearbyCastleDoor()

        this.player.applyToCamera(this.camera)

        const canBoard = !door && this.castle.canBoard(this.player.position)
        const canMount = !door && !canBoard && this.#canMountElephant()

        if (door && this.input.wasPressed('KeyE'))
        {
            if (door === 'exit') this.#leaveInterior()
            else this.#enterInterior(door)
        }
        else if (canBoard && this.input.wasPressed('KeyE'))
        {
            this.#enterSubmarine()
            return
        }
        else if (canMount && this.input.wasPressed('KeyE')) this.#mountElephant()

        const doorPrompt = door && this.portalHold <= 0
            ? (door === 'exit' ? 'Press E to leave' : 'Press E to enter')
            : null
        this.hud.setPrompt(doorPrompt ?? (canBoard ? 'Press E to enter' : canMount ? 'Press E to mount' : null))
        this.hud.setCourse(null)
        this.hud.hideBoatReadout()
        this.hud.setCrosshairVisible(true)
    }

    #updateRiding(delta)
    {
        const aim = this.input.axis('KeyW', 'KeyS')
        const controls = {
            throttle: this.input.isHeld('Space') ? 1 : 0,
            pitch: this.invertPitch ? -aim : aim,
            steer: this.input.axis('KeyA', 'KeyD'),
            boost: this.input.isHeld('ShiftLeft') || this.input.isHeld('ShiftRight')
        }

        this.elephant.update(delta, this.elapsed, controls)
        this.#sampleGates()

        if (this.helmView)
        {
            this.#updateSeatCamera(this.elephant.group, this.elephant.seat)
            this.elephant.setFade(1)
        }
        else
        {
            const distance = this.#updateChaseCamera(delta, this.elephant, ELEPHANT_CHASE)
            this.elephant.setFade(THREE.MathUtils.clamp((distance - FADE_END) / (FADE_START - FADE_END), 0, 1))
        }

        const canDismount = this.elephant.dismountSpot() !== null
        if (canDismount && this.input.wasPressed('KeyE')) this.#dismountElephant()

        if (this.state === 'riding')
            this.hud.setCourse(this.hud.lapRunning
                ? `${this.racetrack.found} of ${HOOP_COUNT} rings`
                : null)
        const aimHint = this.invertPitch ? 'W / S aim up / down' : 'W / S aim down / up'
        this.hud.setPrompt(canDismount
            ? 'Press E to dismount'
            : `Space to fly · ${aimHint} · A / D turn · any ring counts`)
        this.hud.hideBoatReadout()
        this.hud.setCrosshairVisible(this.helmView)
    }

    /** The boat has been boarded. She seals and sinks; the view stays on her. */
    #updateDiving(delta)
    {
        this.elephant.update(delta, this.elapsed, this.idleControls)

        this.hud.setPrompt(null)
        this.hud.setCourse(null)
        this.hud.hideBoatReadout()
        this.hud.setCrosshairVisible(false)
    }

    /** The chest clears a ring from either side. Each ring counts once. */
    #sampleGates()
    {
        const chest = this.scratch.copy(this.elephant.position)
        chest.y += ELEPHANT.back * 0.5

        const gate = this.racetrack.sample(chest)
        if (!gate) return

        if (gate.started) this.hud.startLap()
        if (gate.lap)
        {
            this.hud.stopLap()
            this.#recordLap(this.hud.lapTime)
            const origin = this.scratchB.copy(this.elephant.position)
            origin.y += ELEPHANT.back * 0.65
            this.confetti.burst(origin)
        }
    }

    /** Saves a finished lap under the player's name, and says so when it is a new best. */
    #recordLap(seconds)
    {
        submitLap(this.playerName, seconds).then((result) =>
        {
            if (result?.improved) this.hud.setNotice('new best lap')
        })
    }

    /**
     * Highest deck under (x, z), across the main castle and the two beside it.
     * `ceiling` leaves out a court the flyer is already underneath.
     */
    #surfaceAt(x, z, ceiling = Infinity)
    {
        let height = this.castle.surfaceAt(x, z, ceiling)

        for (const castle of this.outerCastles)
        {
            const top = castle.surfaceAt(x, z, ceiling)
            if (top > height) height = top
        }

        return height
    }

    #focusPosition()
    {
        if (this.state === 'riding') return this.elephant.position
        if (this.state === 'diving') return this.castle.submarinePoint(this.focusPoint)
        return this.player.position
    }

    #updateChaseCamera(delta, subject, tuning)
    {
        this.chaseYaw -= this.input.mouseDeltaX * LOOK_SENSITIVITY
        this.chasePitch = THREE.MathUtils.clamp(this.chasePitch + this.input.mouseDeltaY * LOOK_SENSITIVITY, -0.35, 0.9)

        // Pull back a touch as she picks up speed.
        const speedFactor = THREE.MathUtils.clamp(Math.abs(subject.speed) / tuning.speedScale, 0, 1)
        const distance = tuning.distance + speedFactor * 2.4
        const yaw = subject.yaw + this.chaseYaw

        const desired = this.scratch.set(
            subject.position.x - Math.sin(yaw) * distance,
            subject.position.y + tuning.height + this.chasePitch * 7,
            subject.position.z - Math.cos(yaw) * distance
        )

        const floor = this.#surfaceAt(desired.x, desired.z, desired.y)
        if (Number.isFinite(floor)) desired.y = Math.max(desired.y, floor + 0.8)

        const target = this.scratchB.copy(subject.position)
        target.y += tuning.lookHeight

        if (!this.chaseInitialised)
        {
            this.chasePosition.copy(desired)
            this.chaseTarget.copy(target)
            this.chasePull = 0
            this.chaseInitialised = true
        }

        const smoothing = 1 - Math.exp(-7 * delta)
        this.chasePosition.lerp(desired, smoothing)
        // Look straight at her. Easing the look point toward a moving target
        // leaves a lag that changes with frame time, so she surges on screen.
        this.chaseTarget.copy(target)

        // chasePosition is where the camera would like to be. The lens goes
        // along the line from her to there, and stops short of any stone.
        const toCamera = this.chaseDir.subVectors(this.chasePosition, this.chaseTarget)
        const full = toCamera.length()
        if (full > 1e-6) toCamera.divideScalar(full)
        const allowed = full > 1e-6 ? this.#cameraClearance(this.chaseTarget, toCamera, full) : 0

        // Only the push from a wall eases back out. In open sky this stays 0
        // and the camera is exactly where it would be without collision.
        const need = full - allowed
        if (need > this.chasePull) this.chasePull = need
        else this.chasePull += (need - this.chasePull) * (1 - Math.exp(-CAMERA_EASE_OUT * delta))
        const reach = Math.max(0, full - this.chasePull)

        this.camera.position.copy(this.chaseTarget).addScaledVector(toCamera, reach)
        this.camera.lookAt(this.chaseTarget)

        return reach
    }

    /** How far the camera sphere can go from `origin` along `direction` before a castle stops it. */
    #cameraClearance(origin, direction, max)
    {
        let reach = max

        for (const castle of [this.castle, ...this.outerCastles])
        {
            const grid = castle.flightVoxels
            if (!grid?.count) continue

            const start = castle.worldToLocal(origin.x, origin.z)
            const ahead = castle.worldToLocal(origin.x + direction.x, origin.z + direction.z)
            reach = voxelSweepSphere(
                grid,
                start.x, origin.y, start.z,
                ahead.x - start.x, direction.y, ahead.z - start.z,
                reach,
                CAMERA_RADIUS
            )
        }

        return reach
    }

    /** Overhead for the first three seconds, then a cut under the cloud that tracks the fall. */
    #updateSubCamera(delta)
    {
        const focus = this.castle.submarinePoint(this.scratchB)

        if (this.castle.plunging)
        {
            this.#updatePlungeCamera(delta, focus)
            return
        }

        const desired = this.scratch.copy(SUB_VIEW_OFFSET).add(focus)

        if (!this.subViewReady)
        {
            this.subViewPosition.copy(this.camera.position)
            this.subViewTarget.copy(focus)
            this.subViewReady = true
        }

        this.subViewPosition.lerp(desired, 1 - Math.exp(-2.4 * delta))
        this.subViewTarget.lerp(focus, 1 - Math.exp(-5 * delta))

        this.camera.position.copy(this.subViewPosition)
        this.camera.lookAt(this.subViewTarget)
    }

    /**
     * Snaps under the castle, looking up the cloud column. Stays there while
     * the hull comes down, then follows once she has passed.
     */
    #updatePlungeCamera(delta, focus)
    {
        const x = focus.x + PLUNGE_SIDE.x
        const z = focus.z + PLUNGE_SIDE.z

        if (!this.plungeReady)
        {
            this.subViewPosition.set(x, PLUNGE_CAMERA_Y, z)
            this.plungeReady = true
        }
        else
        {
            this.subViewPosition.x = x
            this.subViewPosition.z = z

            if (focus.y < this.subViewPosition.y)
            {
                const follow = 1 - Math.exp(-3.5 * delta)
                this.subViewPosition.y += (focus.y - this.subViewPosition.y) * follow
            }
        }

        this.camera.position.copy(this.subViewPosition)
        this.camera.lookAt(focus)
    }

    /** First-person from a point on the mount. The body faces +Z; the camera looks down -Z. */
    #updateSeatCamera(group, seat)
    {
        this.helmYaw = THREE.MathUtils.clamp(this.helmYaw - this.input.mouseDeltaX * LOOK_SENSITIVITY, -2.2, 2.2)
        this.helmPitch = THREE.MathUtils.clamp(this.helmPitch - this.input.mouseDeltaY * LOOK_SENSITIVITY, -0.7, 0.7)

        group.updateMatrixWorld()
        this.camera.position.copy(group.localToWorld(this.scratch.copy(seat)))

        this.camera.quaternion.copy(group.quaternion)
        this.camera.rotateY(Math.PI + this.helmYaw)
        this.camera.rotateX(this.helmPitch)
    }

    #canMountElephant()
    {
        const dx = this.elephant.position.x - this.player.position.x
        const dy = this.elephant.position.y + ELEPHANT.back - this.player.position.y
        const dz = this.elephant.position.z - this.player.position.z

        return Math.hypot(dx, dy, dz) < MOUNT_RANGE
    }

    #mountElephant()
    {
        this.state = 'riding'
        this.elephant.occupied = true
        this.helmView = false
        this.chaseInitialised = false
        this.chaseYaw = 0
        this.chasePitch = 0.12
        this.helmYaw = 0
        this.helmPitch = -0.05
        this.racetrack.resetApproach()
    }

    #enterSubmarine()
    {
        if (!this.castle.depart()) return

        this.state = 'diving'
        this.subViewReady = false
        this.plungeReady = false
        this.hud.setPrompt(null)
        this.hud.setCrosshairVisible(false)
        this.hud.setNotice('The hatch seals.')
    }

    #dismountElephant()
    {
        const spot = this.elephant.dismountSpot()
        if (!spot) return

        this.state = 'walking'
        this.helmView = false
        this.player.position.copy(spot)
        this.player.velocityY = 0

        const castle = this.#castleAt(spot.x, spot.z)
        if (castle)
        {
            const yaw = castle.elephantBerth(this.scratchB)
            this.elephant.park(this.scratchB, yaw)
        }
        else this.elephant.halt()

        const toMount = this.scratch.copy(this.elephant.position).sub(this.player.position)
        this.player.yaw = Math.atan2(-toMount.x, -toMount.z)
        this.player.pitch = 0

        if (this.hud.disqualify()) this.racetrack.abandon()
        else this.hud.setNotice('Back on the platform.')
    }

    /**
     * The triple-castle door in reach, or 'exit' at the room's door.
     * Pressing E there is what crosses. Standing in the doorway does not.
     */
    #nearbyCastleDoor()
    {
        if (this.returnCastle)
            return this.interior.atExit(this.player.position) ? 'exit' : null

        if (!this.interior.loaded) return null

        for (const castle of this.outerCastles)
        {
            if (castle.atDoor(this.player.position)) return castle
        }

        return null
    }

    #enterInterior(castle)
    {
        const spot = this.scratch
        const yaw = this.interior.entrancePoint(spot)

        this.returnCastle = castle
        this.player.world.castles = [this.interior]
        this.player.position.copy(spot)
        this.player.velocityY = 0
        this.player.onGround = true
        this.player.yaw = yaw
        this.player.pitch = 0
        this.player.spawn.copy(spot)
        this.player.spawnYaw = yaw
        this.player.voidY = -30
        this.portalHold = 0.45
        this.hud.setNotice('Inside the castle.')
    }

    #leaveInterior()
    {
        const castle = this.returnCastle
        const spot = this.scratch
        const yaw = castle.doorExit(spot)

        this.returnCastle = null
        this.player.world.castles = this.outsideCastles
        this.player.position.copy(spot)
        this.player.velocityY = 0
        this.player.onGround = true
        this.player.yaw = yaw
        this.player.pitch = 0
        this.player.spawn.copy(this.homeSpawn)
        this.player.spawnYaw = this.homeYaw
        this.player.voidY = this.homeVoid
        this.portalHold = 0.45
        this.hud.setNotice('Back outside.')
    }

    /** The castle whose deck is under (x, z), if any. */
    #castleAt(x, z)
    {
        let chosen = null
        let height = Number.NEGATIVE_INFINITY

        for (const castle of [this.castle, ...this.outerCastles])
        {
            const top = castle.surfaceAt(x, z)
            if (top > height)
            {
                height = top
                chosen = castle
            }
        }

        return chosen
    }
}
