import * as THREE from 'three'

/**
 * Fire streaming from the creature's eyes, hotter the harder she is driven.
 *
 * Particles live in world space rather than parented to her, so they get left
 * behind as she moves and the flames trail instead of sitting rigidly on the
 * sockets.
 */

const PARTICLE_COUNT = 240
const SPAWN_RATE = 150        // particles per second at full intensity
const IDLE_INTENSITY = 0.15

const BUOYANCY = 3.0          // m/s², flames rise
const DRAG = 2.2              // per second
const CARRY = 0.25            // fraction of her motion the flame is dragged along by

const flameGLSL = /* glsl */`
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uBody;
uniform vec3 uTail;

vec3 flameColour(float progress)
{
    vec3 colour = mix(uHot, uMid, smoothstep(0.0, 0.28, progress));
    colour = mix(colour, uBody, smoothstep(0.22, 0.62, progress));
    colour = mix(colour, uTail, smoothstep(0.58, 1.0, progress));
    return colour;
}
`

const particleVertexShader = /* glsl */`
attribute float aProgress;
attribute float aSize;

uniform float uSizeScale;

varying float vProgress;

void main()
{
    vProgress = aProgress;

    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Flames swell as they climb before guttering out. Spent particles
    // collapse to nothing rather than rasterising a large discarded sprite.
    float swell = 1.0 + aProgress * 1.1;
    float alive = step(aProgress, 0.999);
    gl_PointSize = alive * aSize * swell * uSizeScale / max(0.1, -viewPosition.z);
}
`

const particleFragmentShader = /* glsl */`
varying float vProgress;

uniform float uCover;

${flameGLSL}

void main()
{
    if (vProgress >= 1.0) discard;

    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.1, radius);
    // A covering flame holds its body longer, so the plume reads solid.
    float fade = mix(1.5, 0.7, uCover);
    float alpha = falloff * pow(1.0 - vProgress, fade);
    alpha = mix(alpha, min(1.0, alpha * 1.6), uCover);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(flameColour(vProgress), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

const glowVertexShader = /* glsl */`
uniform float uSizeScale;
uniform float uIntensity;
uniform float uCover;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // A cold eye draws nothing. The ramp reaches full presence by the idle ember.
    // A cover is sized to blanket the orb at any throttle.
    float lit = smoothstep(0.0, 0.12, uIntensity);
    float span = mix(0.35 + 0.45 * uIntensity, 0.95, uCover);
    gl_PointSize = lit * span * uSizeScale / max(0.1, -viewPosition.z);
}
`

const glowFragmentShader = /* glsl */`
uniform float uIntensity;
uniform float uCover;
uniform vec3 uEmber;
uniform vec3 uCore;

void main()
{
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.0, radius);
    float lit = smoothstep(0.0, 0.12, uIntensity);

    // The boat's ember stays a soft additive glow. A cover is a solid disc,
    // so the mesh behind it does not show through.
    float soft = pow(falloff, 1.8) * (0.35 + 0.65 * uIntensity);
    float solid = smoothstep(1.0, 0.45, radius);
    float alpha = lit * mix(soft, solid, uCover);
    float heat = mix(uIntensity, max(uIntensity, 0.85), uCover);

    gl_FragColor = vec4(mix(uEmber, uCore, heat), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

/** The boat's eye fire: white-hot, through amber, into a dark cinder. */
const BOAT_FLAME = {
    hot: new THREE.Color(1.00, 0.96, 0.84),
    mid: new THREE.Color(1.00, 0.68, 0.20),
    body: new THREE.Color(0.96, 0.30, 0.07),
    tail: new THREE.Color(0.34, 0.05, 0.02),
    ember: new THREE.Color(1.00, 0.55, 0.14),
    core: new THREE.Color(1.00, 0.92, 0.72)
}

/** Same ramp, in the elephant's violet. */
export const PURPLE_FLAME = {
    hot: new THREE.Color(0.96, 0.86, 1.00),
    mid: new THREE.Color(0.72, 0.28, 1.00),
    body: new THREE.Color(0.42, 0.05, 0.92),
    tail: new THREE.Color(0.14, 0.02, 0.28),
    ember: new THREE.Color(0.40, 0.08, 0.95),
    core: new THREE.Color(0.88, 0.70, 1.00)
}

function flameUniforms(palette)
{
    return {
        uHot: { value: palette.hot.clone() },
        uMid: { value: palette.mid.clone() },
        uBody: { value: palette.body.clone() },
        uTail: { value: palette.tail.clone() }
    }
}

export class EyeFire
{
    /**
     * @param {{ direction?: THREE.Vector3, sockets?: number, palette?: typeof BOAT_FLAME, cover?: boolean, coverLift?: number }} options
     *   direction is the way the flame is driven. The boat rises; the elephant falls.
     *   cover lays an opaque disc over each socket. coverLift is how far above the
     *   flame mouth that disc sits, so it lands on the orb rather than under it.
     */
    constructor({
        direction = new THREE.Vector3(0, 1, 0),
        sockets = 2,
        palette = BOAT_FLAME,
        cover = false,
        coverLift = 0
    } = {})
    {
        this.group = new THREE.Group()
        this.direction = direction.clone().normalize()
        this.socketCount = sockets
        this.cover = cover
        this.coverLift = coverLift
        this.particleCount = Math.round(PARTICLE_COUNT * sockets / 2)
        this.spawnRate = SPAWN_RATE * sockets / 2

        this.particles = Array.from({ length: this.particleCount }, () => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            age: 0,
            life: 1,
            size: 0.25,
            alive: false
        }))

        this.cursor = 0
        this.spawnDebt = 0
        this.intensity = IDLE_INTENSITY

        this.#buildParticles(palette)
        this.#buildGlow(palette)
    }

    #buildParticles(palette)
    {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.particleCount * 3), 3))
        geometry.setAttribute('aProgress', new THREE.BufferAttribute(new Float32Array(this.particleCount).fill(1), 1))
        geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.particleCount).fill(0.25), 1))

        for (const name of ['position', 'aProgress', 'aSize'])
        {
            geometry.attributes[name].setUsage(THREE.DynamicDrawUsage)
        }

        this.material = new THREE.ShaderMaterial({
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uCover: { value: this.cover ? 1 : 0 },
                ...flameUniforms(palette)
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.points = new THREE.Points(geometry, this.material)
        this.points.frustumCulled = false
        this.points.renderOrder = 2 // over the water and its foam
        this.group.add(this.points)
    }

    /** A hot core sitting in each socket, so the eyes read as lit even at rest. */
    #buildGlow(palette)
    {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.socketCount * 3), 3))
        geometry.attributes.position.setUsage(THREE.DynamicDrawUsage)

        this.glowMaterial = new THREE.ShaderMaterial({
            vertexShader: glowVertexShader,
            fragmentShader: glowFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uIntensity: { value: IDLE_INTENSITY },
                uCover: { value: this.cover ? 1 : 0 },
                uEmber: { value: palette.ember.clone() },
                uCore: { value: palette.core.clone() }
            },
            transparent: true,
            depthWrite: false,
            // Additive light cannot hide the mesh. A cover replaces it.
            blending: this.cover ? THREE.NormalBlending : THREE.AdditiveBlending
        })

        this.glow = new THREE.Points(geometry, this.glowMaterial)
        this.glow.frustumCulled = false
        this.glow.renderOrder = 2
        this.group.add(this.glow)
    }

    /**
     * Point sizes are in device pixels, so they have to be rescaled whenever
     * the drawing buffer or the field of view changes.
     */
    setViewport(drawingBufferHeight, fovDegrees)
    {
        const scale = (drawingBufferHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5)
        this.material.uniforms.uSizeScale.value = scale
        this.glowMaterial.uniforms.uSizeScale.value = scale
    }

    /**
     * @param {THREE.Vector3[]} emitters  Socket positions in world space.
     * @param {THREE.Vector3} drift       Her world velocity.
     * @param {number} intensity          0 = embers, 1 = blazing.
     */
    update(delta, emitters, drift, intensity)
    {
        if (!emitters?.length) return

        this.intensity = intensity
        this.glowMaterial.uniforms.uIntensity.value = intensity

        const glowPosition = this.glow.geometry.attributes.position
        for (let i = 0; i < this.socketCount; i++)
        {
            const emitter = emitters[Math.min(i, emitters.length - 1)]
            glowPosition.setXYZ(i, emitter.x, emitter.y + this.coverLift, emitter.z)
        }
        glowPosition.needsUpdate = true

        this.#spawn(delta, emitters, drift, intensity)
        this.#integrate(delta)
    }

    #spawn(delta, emitters, drift, intensity)
    {
        this.spawnDebt += this.spawnRate * intensity * delta

        while (this.spawnDebt >= 1)
        {
            this.spawnDebt -= 1

            const particle = this.particles[this.cursor]
            this.cursor = (this.cursor + 1) % this.particleCount

            const emitter = emitters[this.cursor % emitters.length]
            particle.position.copy(emitter)
            particle.position.x += (Math.random() - 0.5) * 0.1
            particle.position.y += (Math.random() - 0.5) * 0.1
            particle.position.z += (Math.random() - 0.5) * 0.1

            const along = 1.5 + Math.random() * 1.5
            particle.velocity.copy(this.direction).multiplyScalar(along)
            particle.velocity.x += (Math.random() - 0.5) * 0.55
            particle.velocity.y += (Math.random() - 0.5) * 0.55
            particle.velocity.z += (Math.random() - 0.5) * 0.55
            // Partially carried along, so the trail leans back without detaching.
            particle.velocity.addScaledVector(drift, CARRY)

            particle.age = 0
            particle.life = 0.4 + Math.random() * 0.35
            particle.size = 0.4 + Math.random() * 0.35
            particle.alive = true
        }
    }

    #integrate(delta)
    {
        const position = this.points.geometry.attributes.position
        const progress = this.points.geometry.attributes.aProgress
        const size = this.points.geometry.attributes.aSize
        const damping = Math.exp(-DRAG * delta)

        for (let i = 0; i < this.particleCount; i++)
        {
            const particle = this.particles[i]

            if (!particle.alive)
            {
                progress.array[i] = 1
                continue
            }

            particle.age += delta
            const t = particle.age / particle.life

            if (t >= 1)
            {
                particle.alive = false
                progress.array[i] = 1
                continue
            }

            particle.velocity.addScaledVector(this.direction, BUOYANCY * delta)
            particle.velocity.multiplyScalar(damping)
            particle.position.addScaledVector(particle.velocity, delta)

            position.setXYZ(i, particle.position.x, particle.position.y, particle.position.z)
            progress.array[i] = t
            size.array[i] = particle.size
        }

        position.needsUpdate = true
        progress.needsUpdate = true
        size.needsUpdate = true
    }
}
