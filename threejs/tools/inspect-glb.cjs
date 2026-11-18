/**
 * Decodes a Draco-compressed GLB in Node and renders orthographic previews to
 * PNG, so model geometry can be checked without a browser.
 *
 *   node tools/inspect-glb.cjs <file.glb> <meshIndex> <outPrefix> [--points]
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

/**
 * The decoder ships as CommonJS, but this package is `"type": "module"`, so
 * Node would parse it as ESM and its export would disappear. Evaluate it as
 * CommonJS by hand instead.
 */
function loadDracoDecoder()
{
    const file = path.join(__dirname, '..', 'static', 'draco', 'draco_decoder.js')
    const source = fs.readFileSync(file, 'utf8')
    const shim = { exports: {} }

    new Function('module', 'exports', 'require', '__filename', '__dirname', source)(
        shim, shim.exports, require, file, path.dirname(file))

    if (typeof shim.exports !== 'function') throw new Error('could not load the Draco decoder')
    return shim.exports
}

const DracoDecoderModule = loadDracoDecoder()

// ------------------------------------------------------------------ png out

const CRC_TABLE = (() =>
{
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n++)
    {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c
    }
    return table
})()

function crc32(buffer)
{
    let c = -1
    for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
}

function chunk(type, data)
{
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
}

function writePNG(file, width, height, rgb)
{
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8   // bit depth
    header[9] = 2   // truecolour
    const raw = Buffer.alloc(height * (width * 3 + 1))

    for (let y = 0; y < height; y++)
    {
        raw[y * (width * 3 + 1)] = 0 // filter: none
        rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
    }

    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]))
}

// ------------------------------------------------------------------ glb read

function readGLB(file)
{
    const buffer = fs.readFileSync(file)
    let offset = 12
    let json = null
    let bin = null

    while (offset < buffer.length)
    {
        const length = buffer.readUInt32LE(offset)
        const type = buffer.toString('ascii', offset + 4, offset + 8)
        const body = buffer.subarray(offset + 8, offset + 8 + length)

        if (type === 'JSON') json = JSON.parse(body.toString('utf8'))
        else bin = body

        offset += 8 + length + ((4 - (length % 4)) % 4)
    }

    return { json, bin }
}

// ---------------------------------------------------------------- transforms

/** Local transform of the node that draws a given mesh, as a 3x4. */
function nodeTransform(json, meshIndex)
{
    const node = json.nodes.find((n) => n.mesh === meshIndex)
    const scale = node?.scale ?? [1, 1, 1]
    const q = node?.rotation ?? [0, 0, 0, 1]
    const t = node?.translation ?? [0, 0, 0]

    const [x, y, z, w] = q
    const rotation = [
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
    ]

    return (px, py, pz) =>
    {
        const sx = px * scale[0]
        const sy = py * scale[1]
        const sz = pz * scale[2]
        return [
            rotation[0] * sx + rotation[1] * sy + rotation[2] * sz + t[0],
            rotation[3] * sx + rotation[4] * sy + rotation[5] * sz + t[1],
            rotation[6] * sx + rotation[7] * sy + rotation[8] * sz + t[2]
        ]
    }
}

// -------------------------------------------------------------------- render

const VIEWS = [
    { name: 'side', horizontal: 2, vertical: 1, depth: 0, flipH: false },
    { name: 'front', horizontal: 0, vertical: 1, depth: 2, flipH: false },
    { name: 'top', horizontal: 2, vertical: 0, depth: 1, flipH: false }
]

const SIZE = 420
const MARGIN = 14

/** Integer-unit grid, drawn behind the geometry so coordinates can be read off. */
function drawGrid(rgb, zBuffer, view, bounds, toPixel)
{
    const put = (x, y, colour) =>
    {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
        const i = y * SIZE + x
        if (zBuffer[i] < 1e9) return
        zBuffer[i] = 1e9
        rgb[i * 3] = colour[0]; rgb[i * 3 + 1] = colour[1]; rgb[i * 3 + 2] = colour[2]
    }

    const axes = [
        { index: view.horizontal, vertical: false },
        { index: view.vertical, vertical: true }
    ]

    for (const axis of axes)
    {
        const from = Math.ceil(bounds.min[axis.index])
        const to = Math.floor(bounds.max[axis.index])

        for (let value = from; value <= to; value++)
        {
            const probe = [0, 0, 0]
            probe[view.horizontal] = bounds.min[view.horizontal]
            probe[view.vertical] = bounds.min[view.vertical]
            probe[axis.index] = value

            const [px, py] = toPixel(probe)
            const major = value === 0
            const minor = value % 5 === 0
            const colour = major ? [120, 80, 70] : minor ? [52, 60, 70] : [32, 38, 46]

            for (let t = 0; t < SIZE; t++)
            {
                if (axis.vertical) put(t, Math.round(py), colour)
                else put(Math.round(px), t, colour)
            }
        }
    }
}

function render(view, positions, indices, bounds, usePoints, grid, marks)
{
    const spanH = bounds.max[view.horizontal] - bounds.min[view.horizontal]
    const spanV = bounds.max[view.vertical] - bounds.min[view.vertical]
    const scale = (SIZE - MARGIN * 2) / Math.max(spanH, spanV)

    const toPixel = (p) => [
        MARGIN + (p[view.horizontal] - bounds.min[view.horizontal]) * scale,
        SIZE - MARGIN - (p[view.vertical] - bounds.min[view.vertical]) * scale
    ]

    const rgb = Buffer.alloc(SIZE * SIZE * 3)
    for (let i = 0; i < rgb.length; i += 3)
    {
        rgb[i] = 18; rgb[i + 1] = 22; rgb[i + 2] = 28
    }

    const zBuffer = new Float32Array(SIZE * SIZE).fill(Infinity)
    const light = [0.45, 0.75, 0.5]

    if (grid) drawGrid(rgb, zBuffer, view, bounds, toPixel)

    function put(px, py, shade)
    {
        const x = px | 0
        const y = py | 0
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
        const i = (y * SIZE + x) * 3
        rgb[i] = shade[0]; rgb[i + 1] = shade[1]; rgb[i + 2] = shade[2]
    }

    function plot(px, py, depth, shade)
    {
        const x = px | 0
        const y = py | 0
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
        const i = y * SIZE + x
        if (depth >= zBuffer[i]) return
        zBuffer[i] = depth
        rgb[i * 3] = Math.min(255, shade[0])
        rgb[i * 3 + 1] = Math.min(255, shade[1])
        rgb[i * 3 + 2] = Math.min(255, shade[2])
    }

    if (usePoints)
    {
        // Depth-shaded point cloud: enough to read a silhouette.
        for (let i = 0; i < positions.length; i += 3)
        {
            const p = [positions[i], positions[i + 1], positions[i + 2]]
            const [px, py] = toPixel(p)
            const depth = -p[view.depth]
            const t = 1 - (depth - -bounds.max[view.depth]) / Math.max(1e-6, bounds.max[view.depth] - bounds.min[view.depth])
            const v = 70 + 170 * Math.max(0, Math.min(1, t))
            plot(px, py, depth, [v * 0.8, v * 0.9, v])
        }
        return rgb
    }

    // Flat-shaded triangles with a z-buffer.
    const a = [0, 0, 0]
    const b = [0, 0, 0]
    const c = [0, 0, 0]

    for (let f = 0; f < indices.length; f += 3)
    {
        for (let k = 0; k < 3; k++)
        {
            a[k] = positions[indices[f] * 3 + k]
            b[k] = positions[indices[f + 1] * 3 + k]
            c[k] = positions[indices[f + 2] * 3 + k]
        }

        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        let nx = e1[1] * e2[2] - e1[2] * e2[1]
        let ny = e1[2] * e2[0] - e1[0] * e2[2]
        let nz = e1[0] * e2[1] - e1[1] * e2[0]
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len; ny /= len; nz /= len

        const lambert = Math.abs(nx * light[0] + ny * light[1] + nz * light[2])
        const shade = 45 + 200 * lambert
        const colour = [shade * 0.82, shade * 0.9, shade]

        const pa = toPixel(a)
        const pb = toPixel(b)
        const pc = toPixel(c)
        const depth = -(a[view.depth] + b[view.depth] + c[view.depth]) / 3

        const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])))
        const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])))
        const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])))
        const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])))

        const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if (Math.abs(area) < 1e-9)
        {
            plot(pa[0], pa[1], depth, colour)
            continue
        }

        for (let y = minY; y <= maxY; y++)
        {
            for (let x = minX; x <= maxX; x++)
            {
                const w0 = ((pb[0] - pa[0]) * (y + 0.5 - pa[1]) - (x + 0.5 - pa[0]) * (pb[1] - pa[1])) / area
                const w1 = ((x + 0.5 - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (y + 0.5 - pa[1])) / area
                if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue
                plot(x, y, depth, colour)
            }
        }
    }

    // Markers last and unconditionally, so an attachment point tucked inside
    // the mesh is still visible against it.
    for (const mark of marks)
    {
        const [px, py] = toPixel(mark)
        for (let dy = -7; dy <= 7; dy++)
        {
            for (let dx = -7; dx <= 7; dx++)
            {
                const r = Math.hypot(dx, dy)
                if (r > 7) continue
                // Hollow ring with a centre dot, so it does not hide the surface.
                if (r > 4.2 || r < 1.6) put((px | 0) + dx, (py | 0) + dy, [255, 90, 40])
            }
        }
    }

    return rgb
}

// ---------------------------------------------------------------------- main

async function main()
{
    const [file, meshArg, outPrefix] = process.argv.slice(2)
    const usePoints = process.argv.includes('--points')
    const grid = process.argv.includes('--grid')
    const meshIndex = Number(meshArg)

    // --region x0,y0,z0,x1,y1,z1 crops both the view and the geometry, which
    // gives a clean cross-section of one part of the model.
    // --mark x,y,z;x,y,z overlays attachment points on the render.
    const markArg = process.argv.find((a) => a.startsWith('--mark='))
    const marks = markArg
        ? markArg.slice('--mark='.length).split(';').map((m) => m.split(',').map(Number))
        : []

    const regionArg = process.argv.find((a) => a.startsWith('--region='))
    const region = regionArg
        ? regionArg.slice('--region='.length).split(',').map(Number)
        : null

    const { json, bin } = readGLB(file)
    const primitive = json.meshes[meshIndex].primitives[0]
    const draco = primitive.extensions?.KHR_draco_mesh_compression
    if (!draco) throw new Error('primitive is not Draco compressed')

    const view = json.bufferViews[draco.bufferView]
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)

    console.log(`mesh ${meshIndex} "${json.meshes[meshIndex].name}" — decoding ${(bytes.length / 1048576).toFixed(2)} MB`)

    const module = await DracoDecoderModule()
    const decoder = new module.Decoder()
    const buffer = new module.DecoderBuffer()
    buffer.Init(new Int8Array(bytes), bytes.length)

    const mesh = new module.Mesh()
    const status = decoder.DecodeBufferToMesh(buffer, mesh)
    if (!status.ok()) throw new Error(`draco decode failed: ${status.error_msg()}`)

    const pointCount = mesh.num_points()
    const faceCount = mesh.num_faces()
    console.log(`decoded ${pointCount.toLocaleString()} points, ${faceCount.toLocaleString()} faces`)

    const attribute = decoder.GetAttributeByUniqueId(mesh, draco.attributes.POSITION)
    const components = attribute.num_components()
    const valueCount = pointCount * components
    const positionPtr = module._malloc(valueCount * 4)
    decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, module.DT_FLOAT32, valueCount * 4, positionPtr)
    let positions = new Float32Array(module.HEAPF32.buffer, positionPtr, valueCount).slice()
    module._free(positionPtr)

    // Bake the node's local transform so the preview matches the scene.
    const transform = nodeTransform(json, meshIndex)
    for (let i = 0; i < positions.length; i += 3)
    {
        const [x, y, z] = transform(positions[i], positions[i + 1], positions[i + 2])
        positions[i] = x; positions[i + 1] = y; positions[i + 2] = z
    }

    let indices = new Uint32Array(0)
    if (!usePoints)
    {
        const indexCount = faceCount * 3
        const indexPtr = module._malloc(indexCount * 4)
        decoder.GetTrianglesUInt32Array(mesh, indexCount * 4, indexPtr)
        indices = new Uint32Array(module.HEAPU32.buffer, indexPtr, indexCount).slice()
        module._free(indexPtr)
    }

    let bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    for (let i = 0; i < positions.length; i += 3)
    {
        for (let k = 0; k < 3; k++)
        {
            bounds.min[k] = Math.min(bounds.min[k], positions[i + k])
            bounds.max[k] = Math.max(bounds.max[k], positions[i + k])
        }
    }

    if (region)
    {
        bounds = { min: region.slice(0, 3), max: region.slice(3, 6) }

        const kept = []
        for (let f = 0; f < indices.length; f += 3)
        {
            let inside = true
            for (let v = 0; v < 3 && inside; v++)
            {
                for (let k = 0; k < 3; k++)
                {
                    const value = positions[indices[f + v] * 3 + k]
                    if (value < bounds.min[k] || value > bounds.max[k]) { inside = false; break }
                }
            }
            if (inside) kept.push(indices[f], indices[f + 1], indices[f + 2])
        }
        indices = new Uint32Array(kept)
        console.log(`region keeps ${(kept.length / 3).toLocaleString()} triangles`)
    }

    console.log('world bounds min', bounds.min.map((v) => +v.toFixed(2)))
    console.log('world bounds max', bounds.max.map((v) => +v.toFixed(2)))
    console.log('size            ', bounds.max.map((v, k) => +(v - bounds.min[k]).toFixed(2)), '(x, y, z)')

    for (const v of VIEWS)
    {
        const rgb = render(v, positions, indices, bounds, usePoints, grid, marks)
        const out = `${outPrefix}-${v.name}.png`
        writePNG(out, SIZE, SIZE, rgb)
        console.log(`wrote ${out}`)
    }

    module.destroy(mesh)
    module.destroy(buffer)
    module.destroy(decoder)
}

main().catch((error) =>
{
    console.error(error)
    process.exit(1)
})
