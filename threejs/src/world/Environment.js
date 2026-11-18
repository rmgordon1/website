import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { assetUrl } from '../config.js'

/**
 * Served out of static/. A 2K copy of the above-the-clouds panorama.
 * The source frame is 14K and about a gigabyte; decoding that stalls the page.
 */
const SKY_URL = assetUrl('/environment/above-the-clouds-2k.hdr')

/**
 * Bearing of the sun in the panorama. The disk itself sits just under the
 * cloud horizon, about 8° below horizontal. A light from there skims the
 * court: the shadow map stretches into streaks on the walls, and the open
 * ring leaves a hard wedge of light on the floor. Same compass direction,
 * lifted so the light falls down onto the court.
 */
const SUN_AZIMUTH = new THREE.Vector3(0.8646, 0, 0.4806).normalize()
const SUN_ELEVATION = THREE.MathUtils.degToRad(32)
const SUN_DIRECTION = new THREE.Vector3(
    SUN_AZIMUTH.x * Math.cos(SUN_ELEVATION),
    Math.sin(SUN_ELEVATION),
    SUN_AZIMUTH.z * Math.cos(SUN_ELEVATION)
)

export const FOG_NEAR = 110
export const FOG_FAR = 330

export const PALETTE = {
    horizon: new THREE.Color('#c4b6a2'),
    zenith: new THREE.Color('#c2b5a4'),
    sun: new THREE.Color('#ffe7c2')
}

export class Environment
{
    constructor(renderer, scene)
    {
        this.sunDirection = SUN_DIRECTION.clone()

        // Holds the night colour until the panorama arrives. No fog: the
        // panorama is the whole backdrop, and a haze would grey it out.
        scene.background = PALETTE.zenith.clone()

        this.sunLight = new THREE.DirectionalLight(PALETTE.sun, 2.4)
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(4096, 4096)
        // Small offsets. Larger ones pull the shadow off the wall and leave a
        // bright seam on the floor; the sun is high enough now that acne does
        // not need them.
        this.sunLight.shadow.bias = -0.00015
        this.sunLight.shadow.normalBias = 0.02

        const shadowCamera = this.sunLight.shadow.camera
        // The court, and the triple castles a short flight to the west.
        shadowCamera.left = -220
        shadowCamera.right = 220
        shadowCamera.top = 220
        shadowCamera.bottom = -220
        shadowCamera.near = 1
        shadowCamera.far = 420
        shadowCamera.updateProjectionMatrix()

        scene.add(this.sunLight, this.sunLight.target)

        // Fill taken from the bright cloud deck, so the side away from the sun still reads.
        scene.add(new THREE.AmbientLight(new THREE.Color('#c4b8a4'), 0.55))

        this.#loadSky(renderer, scene)
    }

    #loadSky(renderer, scene)
    {
        new RGBELoader().load(SKY_URL, (texture) =>
        {
            texture.mapping = THREE.EquirectangularReflectionMapping
            scene.background = texture

            const pmrem = new THREE.PMREMGenerator(renderer)
            scene.environment = pmrem.fromEquirectangular(texture).texture
            scene.environmentIntensity = 3.6
            pmrem.dispose()
        }, undefined, (error) =>
        {
            console.warn('Sky failed to load.', error)
        })
    }

    /** Keeps the shadow volume centred on whoever the player is controlling. */
    update(focus)
    {
        this.sunLight.target.position.copy(focus)
        this.sunLight.position.copy(focus).addScaledVector(this.sunDirection, 120)
    }
}
