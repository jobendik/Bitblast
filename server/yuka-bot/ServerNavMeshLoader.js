/**
 * ServerNavMeshLoader.js - Load NavMesh for server-side YUKA
 * 
 * YUKA's NavMeshLoader expects a GLTFLoader, which we provide using
 * the 'node-gltf' or raw file parsing approach.
 * 
 * For the server, we'll parse the navmesh data directly from the glb file.
 */

const fs = require('fs');
const path = require('path');
const YUKA = require('yuka');

function identityMat4() {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
}

function multiplyMat4(a, b) {
    // Column-major 4x4 multiplication: out = a * b
    const out = new Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            out[col * 4 + row] =
                a[0 * 4 + row] * b[col * 4 + 0] +
                a[1 * 4 + row] * b[col * 4 + 1] +
                a[2 * 4 + row] * b[col * 4 + 2] +
                a[3 * 4 + row] * b[col * 4 + 3];
        }
    }
    return out;
}

function composeTRS(translation, rotation, scale) {
    const t = translation || [0, 0, 0];
    const r = rotation || [0, 0, 0, 1];
    const s = scale || [1, 1, 1];

    const x = r[0], y = r[1], z = r[2], w = r[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    // 3x3 rotation (column-major)
    const m00 = 1 - (yy + zz);
    const m01 = xy + wz;
    const m02 = xz - wy;
    const m10 = xy - wz;
    const m11 = 1 - (xx + zz);
    const m12 = yz + wx;
    const m20 = xz + wy;
    const m21 = yz - wx;
    const m22 = 1 - (xx + yy);

    // Column-major 4x4 with scale + translation (glTF layout)
    return [
        m00 * s[0], m10 * s[0], m20 * s[0], 0,
        m01 * s[1], m11 * s[1], m21 * s[1], 0,
        m02 * s[2], m12 * s[2], m22 * s[2], 0,
        t[0], t[1], t[2], 1
    ];
}

function nodeLocalMatrix(node) {
    if (node.matrix && node.matrix.length === 16) {
        // glTF node.matrix is already column-major
        return node.matrix;
    }

    return composeTRS(node.translation, node.rotation, node.scale);
}

function transformPoint(m, x, y, z) {
    // Column-major: v' = M * [x, y, z, 1]
    const nx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const ny = m[1] * x + m[5] * y + m[9] * z + m[13];
    const nz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (nw !== 0 && nw !== 1) {
        return [nx / nw, ny / nw, nz / nw];
    }
    return [nx, ny, nz];
}

function componentSize(componentType) {
    switch (componentType) {
        case 5120: // BYTE
        case 5121: // UNSIGNED_BYTE
            return 1;
        case 5122: // SHORT
        case 5123: // UNSIGNED_SHORT
            return 2;
        case 5125: // UNSIGNED_INT
        case 5126: // FLOAT
            return 4;
        default:
            throw new Error(`Unsupported componentType: ${componentType}`);
    }
}

function readIndex(binData, byteOffset, componentType) {
    if (componentType === 5123) return binData.readUInt16LE(byteOffset);
    if (componentType === 5125) return binData.readUInt32LE(byteOffset);
    if (componentType === 5121) return binData.readUInt8(byteOffset);
    throw new Error(`Unsupported index componentType: ${componentType}`);
}

function buildWorldMatrices(json) {
    const nodes = json.nodes || [];
    const world = new Array(nodes.length);
    const visiting = new Array(nodes.length).fill(false);

    const compute = (idx, parentWorld) => {
        if (world[idx]) return world[idx];
        if (visiting[idx]) return identityMat4();
        visiting[idx] = true;
        const local = nodeLocalMatrix(nodes[idx] || {});
        const wm = parentWorld ? multiplyMat4(parentWorld, local) : local;
        world[idx] = wm;
        visiting[idx] = false;
        return wm;
    };

    const sceneIndex = typeof json.scene === 'number' ? json.scene : 0;
    const scene = (json.scenes && json.scenes[sceneIndex]) ? json.scenes[sceneIndex] : null;
    const roots = scene?.nodes || [];

    const stack = roots.map(n => ({ idx: n, parent: null }));
    while (stack.length) {
        const { idx, parent } = stack.pop();
        const wm = compute(idx, parent);
        const children = nodes[idx]?.children || [];
        for (const childIdx of children) {
            stack.push({ idx: childIdx, parent: wm });
        }
    }

    return world;
}

/**
 * Parse a GLB file and extract mesh geometry for NavMesh
 * GLB format: https://github.com/KhronosGroup/glTF/tree/main/specification/2.0
 */
function parseGLB(buffer) {
    const view = new DataView(buffer.buffer);
    
    // GLB header: magic (4 bytes) + version (4 bytes) + length (4 bytes)
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546C67) { // 'glTF' in little-endian
        throw new Error('Invalid GLB magic number');
    }
    
    const version = view.getUint32(4, true);
    // const length = view.getUint32(8, true);
    
    // Chunk 0: JSON
    const chunk0Length = view.getUint32(12, true);
    const chunk0Type = view.getUint32(16, true);
    
    if (chunk0Type !== 0x4E4F534A) { // 'JSON' in little-endian
        throw new Error('Expected JSON chunk');
    }
    
    const jsonData = buffer.slice(20, 20 + chunk0Length);
    const json = JSON.parse(jsonData.toString('utf8'));
    
    // Chunk 1: Binary buffer
    const chunk1Offset = 20 + chunk0Length;
    const chunk1Length = view.getUint32(chunk1Offset, true);
    // const chunk1Type = view.getUint32(chunk1Offset + 4, true);
    
    const binData = buffer.slice(chunk1Offset + 8, chunk1Offset + 8 + chunk1Length);
    
    return { json, binData };
}

/**
 * Extract vertex positions from GLTF/GLB
 */
function extractVertices(json, binData) {
    const vertices = [];
    const indices = [];

    if (!json.meshes || json.meshes.length === 0) {
        throw new Error('No meshes found in GLB');
    }

    const worldMatrices = buildWorldMatrices(json);
    const nodes = json.nodes || [];

    const processPrimitive = (primitive, worldMatrix) => {
        const positionAccessorIndex = primitive.attributes?.POSITION;
        if (positionAccessorIndex === undefined) return;

        const positionAccessor = json.accessors[positionAccessorIndex];
        const positionBufferView = json.bufferViews[positionAccessor.bufferView];
        const posBaseOffset = (positionBufferView.byteOffset || 0) + (positionAccessor.byteOffset || 0);
        const posCount = positionAccessor.count;
        const stride = positionBufferView.byteStride || 12;

        const vertexOffset = vertices.length / 3;

        for (let i = 0; i < posCount; i++) {
            const byteOffset = posBaseOffset + i * stride;
            const x = binData.readFloatLE(byteOffset);
            const y = binData.readFloatLE(byteOffset + 4);
            const z = binData.readFloatLE(byteOffset + 8);
            const [tx, ty, tz] = worldMatrix ? transformPoint(worldMatrix, x, y, z) : [x, y, z];
            vertices.push(tx, ty, tz);
        }

        if (primitive.indices !== undefined) {
            const indexAccessor = json.accessors[primitive.indices];
            const indexBufferView = json.bufferViews[indexAccessor.bufferView];
            const indexBaseOffset = (indexBufferView.byteOffset || 0) + (indexAccessor.byteOffset || 0);
            const indexCount = indexAccessor.count;
            const componentType = indexAccessor.componentType;
            const step = componentSize(componentType);

            for (let i = 0; i < indexCount; i++) {
                const idx = readIndex(binData, indexBaseOffset + i * step, componentType);
                indices.push(vertexOffset + idx);
            }
        } else {
            for (let i = 0; i < posCount; i++) {
                indices.push(vertexOffset + i);
            }
        }
    };

    // Traverse all nodes that reference meshes
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        if (!node || node.mesh === undefined) continue;

        const mesh = json.meshes[node.mesh];
        if (!mesh || !mesh.primitives) continue;

        const wm = worldMatrices[nodeIndex] || identityMat4();
        for (const primitive of mesh.primitives) {
            processPrimitive(primitive, wm);
        }
    }

    // Fallback if scene/nodes were empty: process first mesh primitive without transforms
    if (vertices.length === 0) {
        const mesh = json.meshes[0];
        const primitive = mesh.primitives[0];
        processPrimitive(primitive, null);
    }

    return { vertices, indices };
}

/**
 * Load NavMesh from GLB file for server-side use
 * @param {string} glbPath - Path to the navmesh.glb file
 * @returns {Promise<NavMesh>} YUKA NavMesh instance
 */
async function loadNavMesh(glbPath) {
    return new Promise((resolve, reject) => {
        try {
            // Read the file
            const absolutePath = path.resolve(glbPath);
            console.log(`[ServerNavMeshLoader] Loading NavMesh from: ${absolutePath}`);
            
            const buffer = fs.readFileSync(absolutePath);
            
            // Parse GLB
            const { json, binData } = parseGLB(buffer);
            
            // Extract geometry
            const { vertices, indices } = extractVertices(json, binData);
            
            console.log(`[ServerNavMeshLoader] Extracted ${vertices.length / 3} vertices, ${indices.length / 3} triangles`);
            
            // Create YUKA NavMesh
            const navMesh = new YUKA.NavMesh();
            
            // YUKA NavMesh.fromPolygons expects an array of YUKA Polygon objects
            // Each Polygon is created from a contour (array of Vector3 points) using Polygon.fromContour()
            const polygons = [];
            
            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i];
                const i1 = indices[i + 1];
                const i2 = indices[i + 2];
                
                // Create the contour points (CCW order expected by YUKA)
                const contour = [
                    new YUKA.Vector3(vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]),
                    new YUKA.Vector3(vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]),
                    new YUKA.Vector3(vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2])
                ];
                
                // Create a YUKA Polygon from the contour
                const polygon = new YUKA.Polygon().fromContour(contour);
                polygons.push(polygon);
            }
            
            navMesh.fromPolygons(polygons);
            
            console.log(`[ServerNavMeshLoader] NavMesh created with ${navMesh.regions.length} regions`);
            
            resolve(navMesh);
            
        } catch (error) {
            console.error('[ServerNavMeshLoader] Error loading NavMesh:', error);
            reject(error);
        }
    });
}

/**
 * Load cost table from JSON file
 * @param {string} jsonPath - Path to costTable.json
 * @returns {Promise<CostTable>} YUKA CostTable instance
 */
async function loadCostTable(jsonPath) {
    return new Promise((resolve, reject) => {
        try {
            const absolutePath = path.resolve(jsonPath);
            const jsonData = fs.readFileSync(absolutePath, 'utf8');
            const json = JSON.parse(jsonData);
            
            const costTable = new YUKA.CostTable().fromJSON(json);
            
            console.log(`[ServerNavMeshLoader] CostTable loaded`);
            
            resolve(costTable);
        } catch (error) {
            console.error('[ServerNavMeshLoader] Error loading CostTable:', error);
            reject(error);
        }
    });
}

module.exports = {
    loadNavMesh,
    loadCostTable
};
