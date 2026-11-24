import * as THREE from 'three'

/**
 * Matrix rain on the inside of a brick box. The brick material is patched so
 * any face that looks in toward the box's centre, on the inner shell, draws
 * green glyphs falling down a black screen instead of brick. The outside is
 * untouched. The rain is laid out in the box's own space, so the columns run
 * across brick joints, and a brick knocked loose takes its piece with it.
 */

/** Metres per glyph cell. About half a brick. */
const CELL = 0.36

/**
 * The screen ignores lighting, but still goes through the renderer's tone
 * mapping (ACES at 0.62 exposure), which dims it. This lifts it back to a glow.
 */
const GLOW = 3

/** Half-width katakana, digits, and a few symbols: 64 glyphs on an 8 × 8 sheet. */
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:."=*+-<>|'

let glyphSheet = null

/**
 * The message on the wall she faces (the cube's +Z wall, since the cube is
 * turned to her). Metres wide, and the height of its centre above the
 * cube's centre: above her back as seen from the riding camera behind her.
 */
const MESSAGE_WIDTH = 24
const MESSAGE_HEIGHT = 4.5

/** Neon 80s, as declared in style.css. The loading message and start screen use it too. */
const MESSAGE_FONT = '"Neon", sans-serif'

/**
 * One line of glowing white text on black. The canvas keeps one size, since
 * a texture cannot change size once it is on the GPU; the text is scaled to
 * fit it. A canvas only draws a web font once it has loaded, so this draws
 * at once in whatever is ready, then again when Neon 80s arrives.
 */
function messageTexture(text)
{
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 300
    const context = canvas.getContext('2d')
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter

    const draw = () =>
    {
        let size = 220
        context.font = `${size}px ${MESSAGE_FONT}`
        const room = canvas.width - 160
        const width = context.measureText(text).width
        if (width > room)
        {
            size = Math.floor(size * (room / width))
            context.font = `${size}px ${MESSAGE_FONT}`
        }

        context.fillStyle = '#000'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#fff'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.shadowColor = '#fff'
        context.shadowBlur = 20
        context.fillText(text, canvas.width / 2, canvas.height / 2)
        texture.needsUpdate = true
    }

    draw()
    document.fonts?.load(`220px ${MESSAGE_FONT}`, text).then(draw, () => {})

    return { texture, aspect: canvas.width / canvas.height }
}

/** White glyphs with a soft halo on black, mirrored as in the films. Drawn once. */
function matrixGlyphs()
{
    if (glyphSheet) return glyphSheet

    const size = 512
    const cell = size / 8
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')

    context.fillStyle = '#000'
    context.fillRect(0, 0, size, size)
    context.fillStyle = '#fff'
    context.font = `bold ${Math.round(cell * 0.78)}px "MS Gothic", "Osaka", monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = '#fff'
    context.shadowBlur = cell * 0.12

    for (let index = 0; index < 64; index++)
    {
        const x = (index % 8) * cell + cell * 0.5
        const y = Math.floor(index / 8) * cell + cell * 0.5
        context.save()
        context.translate(x, y)
        context.scale(-1, 1)
        context.fillText(GLYPHS[index % GLYPHS.length], 0, 0)
        context.restore()
    }

    glyphSheet = new THREE.CanvasTexture(canvas)
    // No mipmaps: they would blur neighbouring glyphs into each other.
    glyphSheet.generateMipmaps = false
    glyphSheet.minFilter = THREE.LinearFilter
    glyphSheet.magFilter = THREE.LinearFilter
    return glyphSheet
}

/** Clock shared by every patched material. Advanced as the mesh is drawn. */
const matrixClock = { value: 0 }

const VERTEX_HEAD = /* glsl */`
varying vec3 vMatrixPosition;
varying vec3 vMatrixNormal;
`

const VERTEX_BODY = /* glsl */`
{
    // Brick space into box space. The instance matrix places the brick in the box.
    vec4 boxPosition = vec4(transformed, 1.0);
    vec3 boxNormal = objectNormal;
    #ifdef USE_INSTANCING
        boxPosition = instanceMatrix * boxPosition;
        boxNormal = mat3(instanceMatrix) * boxNormal;
    #endif
    vMatrixPosition = boxPosition.xyz;
    vMatrixNormal = boxNormal;
}
`

const FRAGMENT_HEAD = /* glsl */`
uniform float uMatrixTime;
uniform float uMatrixHalf;
uniform sampler2D uMatrixGlyphs;
uniform sampler2D uMatrixMessage;
uniform float uMatrixMessageOn;
uniform vec3 uMatrixMessageBox;
varying vec3 vMatrixPosition;
varying vec3 vMatrixNormal;

float matrixHash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 matrixRain(vec3 p, vec3 n)
{
    // Screen coordinates on this face, as seen from inside: x to the right, y up.
    vec3 a = abs(n);
    vec2 uv;
    float face;
    if (a.y > a.x && a.y > a.z)
    {
        uv = vec2(p.x, -p.z * sign(n.y));
        face = n.y > 0.0 ? 4.0 : 5.0;
    }
    else
    {
        vec3 right = normalize(cross(-n, vec3(0.0, 1.0, 0.0)));
        uv = vec2(dot(p, right), p.y);
        face = a.x > a.z ? (n.x > 0.0 ? 0.0 : 1.0) : (n.z > 0.0 ? 2.0 : 3.0);
    }

    float column = floor(uv.x / ${CELL.toFixed(3)});
    float down = -uv.y / ${CELL.toFixed(3)};
    float row = floor(down);
    vec2 inCell = vec2(fract(uv.x / ${CELL.toFixed(3)}), 1.0 - fract(down));

    // Each column has its own speed, start, and trail length.
    float seed = matrixHash(vec2(column, face * 37.0));
    float speed = mix(5.0, 14.0, matrixHash(vec2(column, face + 11.0)));
    float span = 110.0;
    float head = mod(uMatrixTime * speed + seed * span, span);
    float behind = mod(head - row, span);
    float trail = mix(12.0, 30.0, seed);
    float fade = behind < trail ? pow(1.0 - behind / trail, 1.6) : 0.0;

    // Glyphs change now and then, some faster than others.
    float flicker = floor(uMatrixTime * mix(0.5, 5.0, matrixHash(vec2(row, column))) + seed * 10.0);
    float glyph = floor(matrixHash(vec2(column * 13.0 + row, flicker + face)) * 64.0);
    vec2 sheet = (vec2(mod(glyph, 8.0), 7.0 - floor(glyph / 8.0)) + clamp(inCell, 0.04, 0.96)) / 8.0;
    float ink = texture2D(uMatrixGlyphs, sheet).r;

    vec3 green = vec3(0.1, 1.0, 0.35);
    vec3 colour = green * ink * (fade * 1.4 + 0.05);
    // The leading glyph of each stream is nearly white.
    if (behind < 1.0) colour = vec3(0.75, 1.0, 0.8) * ink * 1.8;

    // The message, on the inside of the +Z wall: the one ahead of her.
    // uMatrixMessageBox is (centre height, half width, half height).
    if (uMatrixMessageOn > 0.5 && face == 3.0)
    {
        vec2 box = vec2(uv.x / uMatrixMessageBox.y, (uv.y - uMatrixMessageBox.x) / uMatrixMessageBox.z);
        vec2 edge = abs(box);
        // A darker band behind the words, feathered at its ends, so the rain does not cross them.
        float band = (1.0 - smoothstep(0.92, 1.08, edge.x)) * (1.0 - smoothstep(0.85, 1.25, edge.y));
        colour *= 1.0 - band * 0.8;
        if (edge.x < 1.0 && edge.y < 1.0)
        {
            float letter = texture2D(uMatrixMessage, box * 0.5 + 0.5).r;
            colour += mix(green, vec3(0.7, 1.0, 0.75), letter * letter) * letter * 1.6;
        }
    }

    return colour * ${GLOW.toFixed(1)};
}
`

/**
 * TEMPORARY perf experiment: ?oldrain keeps the old path, where the rain
 * faces run the full lit, shadowed brick shader first and then throw that
 * colour away. By default they skip all of it (see FRAGMENT_EARLY).
 */
const LIT_RAIN = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldrain')

/** Facing the centre, and on the inner shell rather than the outer one. */
const IS_RAIN_FACE = 'dot(n, -p) > 0.0 && abs(dot(p, n)) < uMatrixHalf'

/**
 * At the very top of main(): a rain face writes its colour and stops, before
 * any texture reads, lighting or shadow lookups. It still goes through the
 * same tone mapping, colour space and fog as the rest of the scene, so it
 * looks the same as before.
 */
const FRAGMENT_EARLY = /* glsl */`
{
    vec3 n = normalize(vMatrixNormal);
    vec3 p = vMatrixPosition;
    if (${IS_RAIN_FACE})
    {
        gl_FragColor = vec4(matrixRain(p, n), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        return;
    }
}
`

/** The old way: light the brick, then replace the result on rain faces. */
const FRAGMENT_LATE = /* glsl */`
{
    vec3 n = normalize(vMatrixNormal);
    vec3 p = vMatrixPosition;
    if (${IS_RAIN_FACE})
        outgoingLight = matrixRain(p, n);
}
#include <opaque_fragment>
`

/**
 * A copy of `material` that shows the rain on a box's inner faces. `half` is
 * the box's centre-to-brick-centre distance, as given to cubeSlots. A
 * `message` is written across the inside of the +Z wall.
 */
export function withMatrixInside(material, half, message = null)
{
    const patched = material.clone()
    const glyphs = matrixGlyphs()
    const words = message ? messageTexture(message) : null
    const messageBox = words
        ? new THREE.Vector3(MESSAGE_HEIGHT, MESSAGE_WIDTH * 0.5, (MESSAGE_WIDTH / words.aspect) * 0.5)
        : new THREE.Vector3(0, 1, 1)

    patched.onBeforeCompile = (shader) =>
    {
        shader.uniforms.uMatrixTime = matrixClock
        shader.uniforms.uMatrixHalf = { value: half }
        shader.uniforms.uMatrixGlyphs = { value: glyphs }
        shader.uniforms.uMatrixMessage = { value: words ? words.texture : glyphs }
        shader.uniforms.uMatrixMessageOn = { value: words ? 1 : 0 }
        shader.uniforms.uMatrixMessageBox = { value: messageBox }

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
            .replace('#include <project_vertex>', `${VERTEX_BODY}\n#include <project_vertex>`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
        shader.fragmentShader = LIT_RAIN
            ? shader.fragmentShader.replace('#include <opaque_fragment>', FRAGMENT_LATE)
            : shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT_EARLY}`)
    }
    patched.customProgramCacheKey = () => (LIT_RAIN ? 'matrix-inside-lit' : 'matrix-inside')
    patched.userData.matrixMessage = words

    return patched
}

/** Keep the rain moving whenever the mesh is drawn, paused screen and intro included. */
export function driveMatrixClock(mesh)
{
    mesh.onBeforeRender = () =>
    {
        matrixClock.value = performance.now() / 1000
    }
}
