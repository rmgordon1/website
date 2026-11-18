/**
 * Prints the vertex spread inside a box of a Draco GLB, for pinning down the
 * coordinates of a feature (an eye socket, a mounting point) numerically
 * rather than by eye.
 *
 *   node tools/probe-region.cjs <file.glb> <meshIndex> x0,y0,z0 x1,y1,z1
 */

const fs = require('fs')
const path = require('path')

function loadDracoDecoder()
{
    const file = path.join(__dirname, '..', 'static', 'draco', 'draco_decoder.js')
    const source = fs.readFileSync(file, 'utf8')
    const shim = { exports: {} }
    new Function('module', 'exports', 'require', '__filename', '__dirname', source)(
        shim, shim.exports, require, file, path.dirname(file))
    return shim.exports
}

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

async function main()
{
    const [file, meshArg, minArg, maxArg] = process.argv.slice(2)
    const meshIndex = Number(meshArg)
    const lower = minArg.split(',').map(Number)
    const upper = maxArg.split(',').map(Number)

    const { json, bin } = readGLB(file)
    const primitive = json.meshes[meshIndex].primitives[0]
    const draco = primitive.extensions.KHR_draco_mesh_compression
    const view = json.bufferViews[draco.bufferView]
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)

    const module = await loadDracoDecoder()()
    const decoder = new module.Decoder()
    const buffer = new module.DecoderBuffer()
    buffer.Init(new Int8Array(bytes), bytes.length)
    const mesh = new module.Mesh()
    decoder.DecodeBufferToMesh(buffer, mesh)

    const attribute = decoder.GetAttributeByUniqueId(mesh, draco.attributes.POSITION)
    const count = mesh.num_points() * 3
    const ptr = module._malloc(count * 4)
    decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, module.DT_FLOAT32, count * 4, ptr)
    const raw = new Float32Array(module.HEAPF32.buffer, ptr, count).slice()
    module._free(ptr)

    // Bake the node transform, same as the preview tool.
    const node = json.nodes.find((n) => n.mesh === meshIndex)
    const [qx, qy, qz, qw] = node?.rotation ?? [0, 0, 0, 1]
    const r = [
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
        2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
        2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)
    ]

    const inside = []
    for (let i = 0; i < raw.length; i += 3)
    {
        const x = r[0] * raw[i] + r[1] * raw[i + 1] + r[2] * raw[i + 2]
        const y = r[3] * raw[i] + r[4] * raw[i + 1] + r[5] * raw[i + 2]
        const z = r[6] * raw[i] + r[7] * raw[i + 1] + r[8] * raw[i + 2]

        if (x < lower[0] || x > upper[0]) continue
        if (y < lower[1] || y > upper[1]) continue
        if (z < lower[2] || z > upper[2]) continue
        inside.push([x, y, z])
    }

    console.log(`${inside.length} vertices inside the box`)
    if (inside.length === 0) return

    const labels = ['x', 'y', 'z']
    for (let k = 0; k < 3; k++)
    {
        const values = inside.map((p) => p[k]).sort((a, b) => a - b)
        const mean = values.reduce((s, v) => s + v, 0) / values.length
        console.log(`  ${labels[k]}: min ${values[0].toFixed(2)}  median ${values[values.length >> 1].toFixed(2)}  mean ${mean.toFixed(2)}  max ${values[values.length - 1].toFixed(2)}`)
    }

    // Split by side, since paired features sit either side of the centreline.
    for (const [name, filter] of [['port (x<0)', (p) => p[0] < 0], ['starboard (x>0)', (p) => p[0] > 0]])
    {
        const side = inside.filter(filter)
        if (side.length === 0) continue
        const centroid = [0, 1, 2].map((k) => side.reduce((s, p) => s + p[k], 0) / side.length)
        const extreme = side.reduce((best, p) => (Math.abs(p[0]) > Math.abs(best[0]) ? p : best), side[0])
        console.log(`  ${name}: ${side.length} verts, centroid ${centroid.map((v) => v.toFixed(2)).join(', ')}, widest ${extreme.map((v) => v.toFixed(2)).join(', ')}`)
    }
}

main().catch((error) => { console.error(error); process.exit(1) })
