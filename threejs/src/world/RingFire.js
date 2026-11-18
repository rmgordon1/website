import * as THREE from 'three'

/**
 * A sheath of flame on one gold hoop. Particles live in the hoop's own
 * space, on the metal, and drift outward so the hole stays open.
 */

const PARTICLE_COUNT = 360
const GLOW_COUNT = 72
const SPAWN_RATE = 240

const GREEN_FLAME = {
    hot: new THREE.Color(0.82, 1.00, 0.72),
    mid: new THREE.Color(0.20, 0.95, 0.32),
    body: new THREE.Color(0.04, 0.48, 0.10),
    tail: new THREE.Color(0.01, 0.14, 0.03),
    ember: new THREE.Color(0.12, 0.82, 0.22),
    core: new THREE.Color(0.70, 1.00, 0.62)
}

const RED_FLAME = {
    hot: new THREE.Color(1.00, 0.90, 0.70),
    mid: new THREE.Color(1.00, 0.24, 0.06),
    body: new THREE.Color(0.72, 0.04, 0.02),
    tail: new THREE.Color(0.22, 0.01, 0.01),
    ember: new THREE.Color(0.95, 0.16, 0.04),
    core: new THREE.Color(1.00, 0.78, 0.45)
}

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

    float swell = 1.0 + aProgress * 0.15;
    float alive = step(aProgress, 0.999);
    gl_PointSize = alive * aSize * swell * uSizeScale / max(0.1, -viewPosition.z);
}
`

const particleFragmentShader = /* glsl */`
varying float vProgress;

${flameGLSL}

void main()
{
    if (vProgress >= 1.0) discard;

    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.15, radius);
    float alpha = falloff * pow(1.0 - vProgress, 0.9);
    if (alpha < 0.02) discard;

    gl_FragColor = vec4(flameColour(vProgress), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

const glowVertexShader = /* glsl */`
uniform float uSizeScale;
uniform float uIntensity;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float lit = smoothstep(0.0, 0.15, uIntensity);
    gl_PointSize = lit * 3.1 * uSizeScale / max(0.1, -viewPosition.z);
}
`

const glowFragmentShader = /* glsl */`
uniform float uIntensity;
uniform vec3 uEmber;
uniform vec3 uCore;

void main()
{
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.05, radius);
    float lit = smoothstep(0.0, 0.15, uIntensity);
    float alpha = lit * falloff * 0.72;
    if (alpha < 0.02) discard;

    gl_FragColor = vec4(mix(uEmber, uCore, 0.55), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

/** A point on the gold band, in the hoop file's units. Stays outside the hole. */
function bandPoint(centerX, centerY, radius, angle, target)
{
    return target.set(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        (Math.random() - 0.5) * 1.6
    )
}

export class RingFire
{
    /**
     * @param {{ centerX: number, centerY: number, inner: number, outer: number }} band
     *   The gold annulus in file units. Flames spawn between inner and outer.
     */
    constructor({ centerX, centerY, inner, outer })
    {
        this.centerX = centerX
        this.centerY = centerY
        this.inner = inner
        this.outer = outer
        this.group = new THREE.Group()
        this.red = false

        this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            age: 0,
            life: 1,
            size: 2.4,
            alive: false
        }))

        this.cursor = 0
        this.spawnDebt = 0
        this.burning = false

        this.#buildParticles()
        this.#buildGlow()
        this.#apply(GREEN_FLAME)
    }

    #buildParticles()
    {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
        geometry.setAttribute('aProgress', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT).fill(1), 1))
        geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT).fill(2.4), 1))

        for (const name of ['position', 'aProgress', 'aSize'])
        {
            geometry.attributes[name].setUsage(THREE.DynamicDrawUsage)
        }

        this.material = new THREE.ShaderMaterial({
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uHot: { value: new THREE.Color() },
                uMid: { value: new THREE.Color() },
                uBody: { value: new THREE.Color() },
                uTail: { value: new THREE.Color() }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.points = new THREE.Points(geometry, this.material)
        this.points.frustumCulled = false
        this.points.renderOrder = 2
        this.group.add(this.points)
    }

    /** A fixed ring of light on the metal, so the hoop reads as covered. */
    #buildGlow()
    {
        const geometry = new THREE.BufferGeometry()
        const positions = new Float32Array(GLOW_COUNT * 3)
        const point = new THREE.Vector3()
        const radius = (this.inner + this.outer) * 0.5

        for (let index = 0; index < GLOW_COUNT; index++)
        {
            const angle = (index / GLOW_COUNT) * Math.PI * 2
            bandPoint(this.centerX, this.centerY, radius, angle, point)
            point.z = 0
            positions[index * 3] = point.x
            positions[index * 3 + 1] = point.y
            positions[index * 3 + 2] = point.z
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

        this.glowMaterial = new THREE.ShaderMaterial({
            vertexShader: glowVertexShader,
            fragmentShader: glowFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uIntensity: { value: 0 },
                uEmber: { value: new THREE.Color() },
                uCore: { value: new THREE.Color() }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.glow = new THREE.Points(geometry, this.glowMaterial)
        this.glow.frustumCulled = false
        this.glow.renderOrder = 2
        this.group.add(this.glow)
    }

    #apply(palette)
    {
        this.material.uniforms.uHot.value.copy(palette.hot)
        this.material.uniforms.uMid.value.copy(palette.mid)
        this.material.uniforms.uBody.value.copy(palette.body)
        this.material.uniforms.uTail.value.copy(palette.tail)
        this.glowMaterial.uniforms.uEmber.value.copy(palette.ember)
        this.glowMaterial.uniforms.uCore.value.copy(palette.core)
    }

    /** Red once this hoop has been flown through. Otherwise the lap's green. */
    setRed(red)
    {
        if (red === this.red) return

        this.red = red
        this.#apply(red ? RED_FLAME : GREEN_FLAME)
    }

    setViewport(drawingBufferHeight, fovDegrees)
    {
        const scale = (drawingBufferHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5)
        this.material.uniforms.uSizeScale.value = scale
        this.glowMaterial.uniforms.uSizeScale.value = scale
    }

    aliveCount()
    {
        let count = 0
        for (const particle of this.particles)
        {
            if (particle.alive) count++
        }
        return count
    }

    /** Drop the sheath at once, so a finished lap can be flown again. */
    extinguish()
    {
        this.burning = false
        this.glowMaterial.uniforms.uIntensity.value = 0

        const progress = this.points.geometry.attributes.aProgress
        for (let index = 0; index < this.particles.length; index++)
        {
            this.particles[index].alive = false
            progress.array[index] = 1
        }
        progress.needsUpdate = true
    }

    /** `burning` is the whole lap. A cold hoop draws nothing. */
    update(delta, burning)
    {
        this.glowMaterial.uniforms.uIntensity.value = burning ? 1 : 0

        if (!burning)
        {
            this.burning = false
            this.#integrate(delta)
            return
        }

        if (!this.burning)
        {
            this.burning = true
            this.#seed()
        }

        this.#spawn(delta)
        this.#integrate(delta)
    }

    #place(particle)
    {
        const angle = Math.random() * Math.PI * 2
        const radius = THREE.MathUtils.lerp(this.inner, this.outer, Math.random())
        bandPoint(this.centerX, this.centerY, radius, angle, particle.position)

        const outwardX = Math.cos(angle)
        const outwardY = Math.sin(angle)
        const speed = 0.8 + Math.random() * 1.4
        particle.velocity.set(
            outwardX * speed + (Math.random() - 0.5) * 0.6,
            outwardY * speed + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 0.8
        )
        particle.age = 0
        particle.life = 0.45 + Math.random() * 0.35
        particle.size = 2.6 + Math.random() * 1.1
        particle.alive = true
    }

    #seed()
    {
        for (const particle of this.particles) this.#place(particle)
    }

    #spawn(delta)
    {
        this.spawnDebt += SPAWN_RATE * delta

        while (this.spawnDebt >= 1)
        {
            this.spawnDebt -= 1
            const particle = this.particles[this.cursor]
            this.cursor = (this.cursor + 1) % PARTICLE_COUNT
            this.#place(particle)
        }
    }

    #integrate(delta)
    {
        const position = this.points.geometry.attributes.position
        const progress = this.points.geometry.attributes.aProgress
        const size = this.points.geometry.attributes.aSize
        const damping = Math.exp(-1.6 * delta)

        for (let index = 0; index < PARTICLE_COUNT; index++)
        {
            const particle = this.particles[index]

            if (!particle.alive)
            {
                progress.array[index] = 1
                continue
            }

            particle.age += delta
            const t = particle.age / particle.life

            if (t >= 1)
            {
                particle.alive = false
                progress.array[index] = 1
                continue
            }

            particle.velocity.multiplyScalar(damping)
            particle.position.addScaledVector(particle.velocity, delta)

            position.setXYZ(index, particle.position.x, particle.position.y, particle.position.z)
            progress.array[index] = t
            size.array[index] = particle.size
        }

        position.needsUpdate = true
        progress.needsUpdate = true
        size.needsUpdate = true
    }
}
