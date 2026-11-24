import * as THREE from 'three'

/**
 * A cheap, fast stand-in for a dense mesh: vertex clustering. A grid of
 * `cell`-sized cubes is laid over the geometry; every vertex in a cube is
 * merged into one (each attribute averaged), and triangles that collapse,
 * or repeat one already kept, are dropped.
 *
 * It does not keep sharp edges or UV seams. That suits soft, see-through
 * shapes seen from far off (the cloud shells under the castles), not
 * hard-edged stone up close.
 *
 * Linear in the triangle count, so it can run while the page loads.
 */
export function simplifyByClustering(geometry, cell)
{
    const position = geometry.attributes.position
    const vertexCount = position.count
    const index = geometry.index
    const cornerCount = index ? index.count : vertexCount

    geometry.computeBoundingBox()
    const min = geometry.boundingBox.min
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    const nx = Math.max(1, Math.ceil(size.x / cell) + 1)
    const ny = Math.max(1, Math.ceil(size.y / cell) + 1)

    // Vertex -> cluster.
    const clusterOf = new Int32Array(vertexCount)
    const clusterByCell = new Map()
    let clusterCount = 0
    for (let vertex = 0; vertex < vertexCount; vertex++)
    {
        const ix = Math.floor((position.getX(vertex) - min.x) / cell)
        const iy = Math.floor((position.getY(vertex) - min.y) / cell)
        const iz = Math.floor((position.getZ(vertex) - min.z) / cell)
        const key = ix + nx * (iy + ny * iz)
        let cluster = clusterByCell.get(key)
        if (cluster === undefined)
        {
            cluster = clusterCount++
            clusterByCell.set(key, cluster)
        }
        clusterOf[vertex] = cluster
    }

    // Average every attribute over its cluster.
    const members = new Uint32Array(clusterCount)
    for (let vertex = 0; vertex < vertexCount; vertex++) members[clusterOf[vertex]]++

    const simplified = new THREE.BufferGeometry()
    const getters = ['getX', 'getY', 'getZ', 'getW']
    for (const [name, attribute] of Object.entries(geometry.attributes))
    {
        const itemSize = attribute.itemSize
        const sums = new Float32Array(clusterCount * itemSize)
        for (let vertex = 0; vertex < vertexCount; vertex++)
        {
            const base = clusterOf[vertex] * itemSize
            for (let k = 0; k < itemSize; k++) sums[base + k] += attribute[getters[k]](vertex)
        }
        for (let cluster = 0; cluster < clusterCount; cluster++)
        {
            const base = cluster * itemSize
            for (let k = 0; k < itemSize; k++) sums[base + k] /= members[cluster]
        }
        simplified.setAttribute(name, new THREE.BufferAttribute(sums, itemSize))
    }
    if (simplified.attributes.normal) simplified.normalizeNormals()

    // Keep each triangle whose corners land in three different clusters, once.
    const kept = []
    const seen = new Set()
    // Order-free key; exact while clusterCount³ stays under 2^53.
    const dedupe = clusterCount < 200000
    for (let corner = 0; corner + 2 < cornerCount; corner += 3)
    {
        const a = clusterOf[index ? index.getX(corner) : corner]
        const b = clusterOf[index ? index.getX(corner + 1) : corner + 1]
        const c = clusterOf[index ? index.getX(corner + 2) : corner + 2]
        if (a === b || b === c || a === c) continue

        if (dedupe)
        {
            const lo = Math.min(a, b, c)
            const hi = Math.max(a, b, c)
            const mid = a + b + c - lo - hi
            const key = (lo * clusterCount + mid) * clusterCount + hi
            if (seen.has(key)) continue
            seen.add(key)
        }
        kept.push(a, b, c)
    }

    simplified.setIndex(kept)
    simplified.computeBoundingBox()
    simplified.computeBoundingSphere()
    return simplified
}
