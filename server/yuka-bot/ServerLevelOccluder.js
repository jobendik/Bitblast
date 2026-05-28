/**
 * ServerLevelOccluder.js - Server-side LOS blocking using level.glb mesh geometry
 * 
 * Loads the actual level mesh from level.glb and builds a YUKA BVH for fast
 * ray intersection testing. This provides accurate LOS blocking matching the
 * visual geometry players see.
 * 
 * The class implements lineOfSightTest(ray, intersectionPoint) which YUKA's Vision
 * system calls on obstacles added via vision.addObstacle().
 */

const fs = require('fs');
const path = require('path');
const YUKA = require('yuka');

// Debug flag - set via environment variable
const DEBUG_LOS = process.env.DEBUG_LOS === 'true' || process.env.DEBUG_LOS === '1';
const DEBUG_LOS_RATE_LIMIT_MS = 5000; // Only log once per 5 seconds

// ============================================
// GLB PARSING UTILITIES
// (Extracted from ServerNavMeshLoader.js pattern)
// ============================================

function identityMat4() {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
}

function multiplyMat4(a, b) {
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

    const m00 = 1 - (yy + zz);
    const m01 = xy + wz;
    const m02 = xz - wy;
    const m10 = xy - wz;
    const m11 = 1 - (xx + zz);
    const m12 = yz + wx;
    const m20 = xz + wy;
    const m21 = yz - wx;
    const m22 = 1 - (xx + yy);

    return [
        m00 * s[0], m10 * s[0], m20 * s[0], 0,
        m01 * s[1], m11 * s[1], m21 * s[1], 0,
        m02 * s[2], m12 * s[2], m22 * s[2], 0,
        t[0], t[1], t[2], 1
    ];
}

function nodeLocalMatrix(node) {
    if (node.matrix && node.matrix.length === 16) {
        return node.matrix;
    }
    return composeTRS(node.translation, node.rotation, node.scale);
}

function transformPoint(m, x, y, z) {
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
        case 5120: case 5121: return 1;
        case 5122: case 5123: return 2;
        case 5125: case 5126: return 4;
        default: throw new Error(`Unsupported componentType: ${componentType}`);
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

function parseGLB(buffer) {
    const view = new DataView(buffer.buffer);
    
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546C67) {
        throw new Error('Invalid GLB magic number');
    }
    
    const chunk0Length = view.getUint32(12, true);
    const chunk0Type = view.getUint32(16, true);
    
    if (chunk0Type !== 0x4E4F534A) {
        throw new Error('Expected JSON chunk');
    }
    
    const jsonData = buffer.slice(20, 20 + chunk0Length);
    const json = JSON.parse(jsonData.toString('utf8'));
    
    const chunk1Offset = 20 + chunk0Length;
    const chunk1Length = view.getUint32(chunk1Offset, true);
    const binData = buffer.slice(chunk1Offset + 8, chunk1Offset + 8 + chunk1Length);
    
    return { json, binData };
}

/**
 * Extract geometry from GLB, optionally filtering by mesh/node name
 * @param {Object} json - Parsed GLTF JSON
 * @param {Buffer} binData - Binary buffer data
 * @param {string|null} targetMeshName - If set, only include meshes with this name
 * @returns {{vertices: number[], indices: number[], meshName: string|null}}
 */
function extractLevelGeometry(json, binData, targetMeshName = 'level') {
    const vertices = [];
    const indices = [];
    let foundMeshName = null;

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

    // First pass: look for a node/mesh with the target name
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        if (!node || node.mesh === undefined) continue;

        const mesh = json.meshes[node.mesh];
        if (!mesh || !mesh.primitives) continue;

        // Check if this mesh matches our target name
        const meshName = mesh.name || node.name || null;
        
        if (targetMeshName && meshName !== targetMeshName) {
            continue; // Skip non-matching meshes
        }

        foundMeshName = meshName;
        const wm = worldMatrices[nodeIndex] || identityMat4();
        
        for (const primitive of mesh.primitives) {
            processPrimitive(primitive, wm);
        }
    }

    // Fallback: if no matching mesh found, use all geometry
    if (vertices.length === 0) {
        console.warn(`[ServerLevelOccluder] Mesh "${targetMeshName}" not found, using all geometry`);
        
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
        foundMeshName = 'all';
    }

    return { vertices, indices, meshName: foundMeshName };
}

// ============================================
// SERVER LEVEL OCCLUDER
// ============================================

/**
 * ServerLevelOccluder - Loads level.glb and provides BVH-based LOS blocking
 * 
 * Implements the lineOfSightTest interface expected by YUKA's Vision system.
 * Uses YUKA's built-in BVH for fast ray-mesh intersection, matching client behavior.
 */
class ServerLevelOccluder {
    constructor() {
        /** @type {YUKA.BVH|null} */
        this.bvh = null;
        
        /** @type {boolean} */
        this.isLoaded = false;
        
        /** @type {string|null} */
        this.meshName = null;
        
        /** @type {number} */
        this.triangleCount = 0;
        
        // Reusable intersection point for lineOfSightTest
        this._intersectionPoint = new YUKA.Vector3();
        
        // Debug: Rate limit tracking
        this._lastLogTime = 0;
        this._blockedCount = 0;
    }

    /**
     * Load level geometry from GLB file and build BVH
     * @param {string} glbPath - Path to level.glb
     * @param {string} meshName - Name of the mesh to extract (default: 'level')
     * @returns {Promise<boolean>} True if loaded successfully
     */
    async load(glbPath, meshName = 'level') {
        return new Promise((resolve, reject) => {
            try {
                const absolutePath = path.resolve(glbPath);
                console.log(`[ServerLevelOccluder] Loading level mesh from: ${absolutePath}`);
                
                if (!fs.existsSync(absolutePath)) {
                    console.error(`[ServerLevelOccluder] Level file not found: ${absolutePath}`);
                    resolve(false);
                    return;
                }
                
                const buffer = fs.readFileSync(absolutePath);
                const { json, binData } = parseGLB(buffer);
                
                // Extract geometry, preferring the named mesh
                const { vertices, indices, meshName: foundName } = extractLevelGeometry(json, binData, meshName);
                
                console.log(`[ServerLevelOccluder] Extracted mesh "${foundName}": ${vertices.length / 3} vertices, ${indices.length / 3} triangles`);
                
                if (vertices.length === 0 || indices.length === 0) {
                    console.error('[ServerLevelOccluder] No geometry extracted from level.glb');
                    resolve(false);
                    return;
                }
                
                // Create YUKA MeshGeometry (same as client does)
                const geometry = new YUKA.MeshGeometry(
                    new Float32Array(vertices),
                    new Uint32Array(indices)
                );
                
                // Build BVH for fast ray intersection (same as client Level.ts)
                this.bvh = new YUKA.BVH();
                this.bvh.fromMeshGeometry(geometry);
                
                this.meshName = foundName;
                this.triangleCount = indices.length / 3;
                this.isLoaded = true;
                
                console.log(`[ServerLevelOccluder] BVH built successfully for LOS blocking`);
                
                resolve(true);
            } catch (error) {
                console.error('[ServerLevelOccluder] Error loading level mesh:', error);
                reject(error);
            }
        });
    }

    /**
     * lineOfSightTest - Called by YUKA's Vision system
     * 
     * This is the interface method that YUKA expects on obstacles.
     * The Vision system creates a ray from the observer to the target
     * and calls this method on each obstacle.
     * 
     * YUKA's Vision.visible() creates a Ray with:
     * - origin: observer position (head)
     * - direction: normalized direction to target
     * 
     * It then tests ray.intersectBVH() or calls obstacle.lineOfSightTest()
     * to check if the ray hits an obstacle before reaching the target.
     * 
     * @param {YUKA.Ray} ray - The ray representing line of sight
     * @param {YUKA.Vector3} intersectionPoint - Output: will be set to hit point if blocked
     * @returns {YUKA.Vector3|null} The intersection point if blocked, null if clear LOS
     */
    lineOfSightTest(ray, intersectionPoint) {
        if (!this.isLoaded || !this.bvh) {
            return null;
        }
        
        // Use YUKA's built-in ray-BVH intersection
        // This is the same method the client uses in Level.lineOfSightTest()
        const result = ray.intersectBVH(this.bvh, intersectionPoint);
        
        if (result !== null) {
            // Debug logging (rate-limited)
            if (DEBUG_LOS) {
                this._logLOSBlock(ray);
            }
            return result;
        }
        
        return null;
    }

    /**
     * Direct raycast for other code paths (e.g., ServerWorld.raycast)
     * 
     * @param {YUKA.Vector3} from - Start position
     * @param {YUKA.Vector3} to - End position
     * @returns {{point: YUKA.Vector3, distance: number}|null} Hit info or null
     */
    raycast(from, to) {
        if (!this.isLoaded || !this.bvh) {
            return null;
        }
        
        // Create a ray from 'from' to 'to'
        const direction = new YUKA.Vector3().subVectors(to, from);
        const distance = direction.length();
        direction.normalize();
        
        const ray = new YUKA.Ray(from, direction);
        const hitPoint = new YUKA.Vector3();
        
        const result = ray.intersectBVH(this.bvh, hitPoint);
        
        if (result !== null) {
            // Check if hit is between from and to
            const hitDistance = hitPoint.distanceTo(from);
            if (hitDistance <= distance) {
                return {
                    point: hitPoint.clone(),
                    distance: hitDistance
                };
            }
        }
        
        return null;
    }

    /**
     * Rate-limited debug logging for LOS blocks
     * @private
     */
    _logLOSBlock(ray) {
        this._blockedCount++;
        const now = Date.now();
        
        if (now - this._lastLogTime > DEBUG_LOS_RATE_LIMIT_MS) {
            console.log(`[LOS] Blocked ${this._blockedCount} rays in last ${DEBUG_LOS_RATE_LIMIT_MS}ms (mesh: ${this.meshName})`);
            this._lastLogTime = now;
            this._blockedCount = 0;
        }
    }

    /**
     * Get triangle count for debugging
     * @returns {number}
     */
    getTriangleCount() {
        return this.triangleCount;
    }
}

// ============================================
// SELF-TEST (run with: node ServerLevelOccluder.js <path-to-level.glb>)
// ============================================

async function selfTest() {
    const glbPath = process.argv[2] || './public/assets/models/environment/level.glb';
    
    console.log('\n=== ServerLevelOccluder Self-Test ===\n');
    
    const occluder = new ServerLevelOccluder();
    
    try {
        const success = await occluder.load(glbPath);
        
        if (!success) {
            console.log('❌ Failed to load level mesh');
            process.exit(1);
        }
        
        console.log(`✓ Loaded: ${occluder.triangleCount} triangles`);
        
        // Test 1: Create a ray that should hit (from far outside the level toward center)
        const ray1 = new YUKA.Ray(
            new YUKA.Vector3(100, 0, 0),
            new YUKA.Vector3(-1, 0, 0) // pointing toward origin
        );
        const hitPoint1 = new YUKA.Vector3();
        const result1 = occluder.lineOfSightTest(ray1, hitPoint1);
        console.log(`Test 1 (ray toward level):`, result1 !== null ? `✓ HIT at ${hitPoint1.x.toFixed(1)}, ${hitPoint1.y.toFixed(1)}, ${hitPoint1.z.toFixed(1)}` : '✗ MISS');
        
        // Test 2: Create a ray pointing away (should miss)
        const ray2 = new YUKA.Ray(
            new YUKA.Vector3(100, 0, 0),
            new YUKA.Vector3(1, 0, 0) // pointing away from level
        );
        const hitPoint2 = new YUKA.Vector3();
        const result2 = occluder.lineOfSightTest(ray2, hitPoint2);
        console.log(`Test 2 (ray away from level):`, result2 === null ? '✓ MISS (correct)' : '✗ HIT (unexpected)');
        
        // Test 3: Raycast helper
        const hit3 = occluder.raycast(
            new YUKA.Vector3(-100, 0, 0),
            new YUKA.Vector3(100, 0, 0)
        );
        console.log(`Test 3 (raycast through level):`, hit3 !== null ? `✓ HIT at distance ${hit3.distance.toFixed(1)}` : '✗ MISS');
        
        console.log('\n=== Self-Test Complete ===\n');
        
    } catch (error) {
        console.error('Self-test error:', error);
        process.exit(1);
    }
}

// Run self-test if executed directly
if (require.main === module) {
    selfTest();
}

module.exports = {
    ServerLevelOccluder,
    DEBUG_LOS
};
