import * as THREE from 'three'

/**
 * A column of purple light standing on the tip of every dock the elephant
 * can land on, shooting straight up into the sky and straight down through
 * the cloud. Faint while walking; it brightens once she is ridden, so the
 * landing spots read from across the course.
 */

/** Metres the beam reaches above and below the dock. */
const REACH = 160
/** Bright inner column and the soft glow around it. */
const CORE_RADIUS = 0.45
const HALO_RADIUS = 1.6
/** Overall strength on foot and in the saddle, and how fast it moves between them. */
const IDLE_INTENSITY = .3
const RIDING_INTENSITY = 1
const INTENSITY_RESPONSE = 3

const beamVertexShader = /* glsl */`
uniform float uReach;

varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;

void main()
{
    // Signed: -1 at the bottom, +1 at the top. The tube only has vertices at
    // its two ends, so the distance from the dock (abs) has to be taken per
    // pixel; taken here, both ends read 1 and the whole beam would fade out.
    vHeight = position.y / uReach;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = mat3(modelMatrix) * normal;
    vView = cameraPosition - worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const beamFragmentShader = /* glsl */`
uniform float uTime;
uniform float uIntensity;
uniform float uSharpness;
uniform float uStrength;
uniform float uReach;

varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;

void main()
{
    // 0 at the dock, 1 at either far end.
    float vAlong = abs(vHeight);

    // The middle of the column faces the eye; the silhouette edges do not.
    // That falloff is what makes a hollow tube read as a soft solid beam.
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float body = pow(facing, uSharpness);

    // Fades toward the far ends, and flares where it leaves the dock.
    float fade = 1.0 - smoothstep(0.08, 1.0, vAlong);
    float flare = exp(-vAlong * uReach * 0.35);

    // Pulses travel outward from the dock, up and down at once.
    float wave = fract(vAlong * uReach / 14.0 - uTime * 0.9);
    float pulse = smoothstep(0.0, 0.12, wave) * (1.0 - smoothstep(0.12, 0.55, wave));
    float breathe = 0.85 + 0.15 * sin(uTime * 2.1);

    vec3 soul = vec3(0.42, 0.10, 0.95);
    vec3 heat = vec3(0.90, 0.94, 1.0);
    vec3 colour = mix(soul, heat, clamp(body * 0.55 + flare * 0.6 + pulse * 0.25, 0.0, 1.0));

    float alpha = body * (fade * (0.6 + 0.4 * pulse) * breathe + flare) * uStrength * uIntensity;
    gl_FragColor = vec4(colour, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

function beamMaterial(sharpness, strength, uniforms)
{
    return new THREE.ShaderMaterial({
        vertexShader: beamVertexShader,
        fragmentShader: beamFragmentShader,
        uniforms: {
            uTime: uniforms.uTime,
            uIntensity: uniforms.uIntensity,
            uReach: { value: REACH },
            uSharpness: { value: sharpness },
            uStrength: { value: strength }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    })
}

export class DockBeacons
{
    /**
     * @param {THREE.Vector3[]} spots World positions on the dock surfaces.
     */
    constructor(spots)
    {
        this.group = new THREE.Group()
        this.intensity = IDLE_INTENSITY
        this.uniforms = {
            uTime: { value: 0 },
            uIntensity: { value: this.intensity }
        }

        const coreGeometry = new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS, REACH * 2, 20, 1, true)
        const haloGeometry = new THREE.CylinderGeometry(HALO_RADIUS, HALO_RADIUS, REACH * 2, 28, 1, true)
        const core = beamMaterial(1.6, 1.4, this.uniforms)
        const halo = beamMaterial(3.0, 0.45, this.uniforms)

        this.beams = spots.map((spot) =>
        {
            const beam = new THREE.Group()
            beam.position.copy(spot)

            const haloMesh = new THREE.Mesh(haloGeometry, halo)
            const coreMesh = new THREE.Mesh(coreGeometry, core)
            // Drawn after the water and the castles, halo behind the core.
            haloMesh.renderOrder = 3
            coreMesh.renderOrder = 4
            beam.add(haloMesh, coreMesh)

            this.group.add(beam)
            return beam
        })
    }

    /** `riding` brightens every beacon; on foot they settle back to a faint glow. */
    update(delta, riding)
    {
        const target = riding ? RIDING_INTENSITY : IDLE_INTENSITY
        this.intensity += (target - this.intensity) * (1 - Math.exp(-INTENSITY_RESPONSE * delta))
        this.uniforms.uIntensity.value = this.intensity
        this.uniforms.uTime.value += delta
    }
}
