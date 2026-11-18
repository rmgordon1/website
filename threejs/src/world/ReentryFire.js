import * as THREE from 'three'

/**
 * Plasma on the bow. The group sits on the tip, local +X ahead of the metal
 * and local -X back along the hull, so once she is nose-down the fire stays
 * on the bottom and streams up the belly.
 */

const PARTICLE_COUNT = 260
const SPAWN_RATE = 320

const flameGLSL = /* glsl */`
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uBody;
uniform vec3 uTail;

vec3 flameColour(float progress)
{
    vec3 colour = mix(uHot, uMid, smoothstep(0.0, 0.22, progress));
    colour = mix(colour, uBody, smoothstep(0.18, 0.55, progress));
    colour = mix(colour, uTail, smoothstep(0.5, 1.0, progress));
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

    float swell = 1.0 + aProgress * 0.8;
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
    float falloff = smoothstep(1.0, 0.05, radius);
    float alpha = falloff * pow(1.0 - vProgress, 0.85);
    if (alpha < 0.02) discard;

    gl_FragColor = vec4(flameColour(vProgress), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

const glowVertexShader = /* glsl */`
uniform float uSizeScale;
uniform float uHeat;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float lit = smoothstep(0.0, 0.2, uHeat);
    gl_PointSize = lit * (5.5 + 3.5 * uHeat) * uSizeScale / max(0.1, -viewPosition.z);
}
`

const glowFragmentShader = /* glsl */`
uniform float uHeat;

void main()
{
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.0, radius);
    float alpha = smoothstep(0.0, 0.2, uHeat) * pow(falloff, 1.4);
    vec3 colour = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.95, 0.82), uHeat);
    gl_FragColor = vec4(colour, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

export class ReentryFire
{
    constructor()
    {
        this.group = new THREE.Group()
        this.group.position.set(2.87, -0.11, -2.314)

        this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            age: 0,
            life: 1,
            size: 2,
            alive: false
        }))

        this.cursor = 0
        this.spawnDebt = 0
        this.time = 0

        this.#buildParticles()
        this.#buildGlow()
    }

    #buildParticles()
    {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
        geometry.setAttribute('aProgress', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT).fill(1), 1))
        geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT).fill(2), 1))

        for (const name of ['position', 'aProgress', 'aSize'])
        {
            geometry.attributes[name].setUsage(THREE.DynamicDrawUsage)
        }

        this.material = new THREE.ShaderMaterial({
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uHot: { value: new THREE.Color(1.00, 0.98, 0.92) },
                uMid: { value: new THREE.Color(1.00, 0.78, 0.18) },
                uBody: { value: new THREE.Color(1.00, 0.32, 0.04) },
                uTail: { value: new THREE.Color(0.55, 0.06, 0.01) }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.points = new THREE.Points(geometry, this.material)
        this.points.frustumCulled = false
        this.points.renderOrder = 3
        this.group.add(this.points)
    }

    #buildGlow()
    {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.15, 0, 0]), 3))

        this.glowMaterial = new THREE.ShaderMaterial({
            vertexShader: glowVertexShader,
            fragmentShader: glowFragmentShader,
            uniforms: {
                uSizeScale: { value: 600 },
                uHeat: { value: 0 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.glow = new THREE.Points(geometry, this.glowMaterial)
        this.glow.frustumCulled = false
        this.glow.renderOrder = 3
        this.group.add(this.glow)
    }

    setViewport(drawingBufferHeight, fovDegrees)
    {
        const scale = (drawingBufferHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5)
        this.material.uniforms.uSizeScale.value = scale
        this.glowMaterial.uniforms.uSizeScale.value = scale
    }

    /** heat is 0 while she is dark, then climbs to 1 as the nose catches. */
    update(delta, heat)
    {
        this.time += delta
        const flicker = heat <= 0 ? 0 : heat * (0.82 + 0.18 * Math.sin(this.time * 17))
        this.glowMaterial.uniforms.uHeat.value = flicker

        this.#spawn(delta, flicker)
        this.#integrate(delta)
    }

    #spawn(delta, heat)
    {
        this.spawnDebt += SPAWN_RATE * heat * delta

        while (this.spawnDebt >= 1)
        {
            this.spawnDebt -= 1

            const particle = this.particles[this.cursor]
            this.cursor = (this.cursor + 1) % PARTICLE_COUNT

            const ring = Math.random() < 0.4 ? Math.random() * 0.35 : 0.4 + Math.random() * 0.5
            const angle = Math.random() * Math.PI * 2
            particle.position.set(
                0.06 + Math.random() * 0.22,
                Math.cos(angle) * ring,
                Math.sin(angle) * ring
            )

            particle.velocity.set(
                -(1.8 + Math.random() * 2.4),
                (Math.random() - 0.5) * 0.7,
                (Math.random() - 0.5) * 0.7
            )

            particle.age = 0
            particle.life = 0.45 + Math.random() * 0.4
            particle.size = 1.6 + Math.random() * 2.4
            particle.alive = true
        }
    }

    #integrate(delta)
    {
        const position = this.points.geometry.attributes.position
        const progress = this.points.geometry.attributes.aProgress
        const size = this.points.geometry.attributes.aSize
        const damping = Math.exp(-1.4 * delta)

        for (let i = 0; i < PARTICLE_COUNT; i++)
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

            particle.velocity.x -= 1.6 * delta
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
