/**
 * Multi-format 3D model loader for Scratch:
 * Supports GLB, glTF (JSON), Wavefront OBJ, FBX (Binary & ASCII), STL (Binary & ASCII), DAE (COLLADA), and PLY.
 *
 * All models are normalized, centered, and scaled to standard Scratch 3D units (~60-80 units).
 */

const {meshFrom} = require('./primitives');
const {multiply, identity, create} = require('./math3d');

const COMPONENT_BYTES = {
    5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4
};
const TYPE_COUNT = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16
};

// ==========================================
// Math and Geometry Helpers
// ==========================================

const computeNormals = (positions, indices) => {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i] * 3;
        const ib = indices[i + 1] * 3;
        const ic = indices[i + 2] * 3;
        const ax = positions[ia]; const ay = positions[ia + 1]; const az = positions[ia + 2];
        const e1x = positions[ib] - ax; const e1y = positions[ib + 1] - ay; const e1z = positions[ib + 2] - az;
        const e2x = positions[ic] - ax; const e2y = positions[ic + 1] - ay; const e2z = positions[ic + 2] - az;
        const nx = (e1y * e2z) - (e1z * e2y);
        const ny = (e1z * e2x) - (e1x * e2z);
        const nz = (e1x * e2y) - (e1y * e2x);
        normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
        const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
        normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
    }
    return normals;
};

const normalizeAndCenterMesh = (mesh, targetSize = 70) => {
    const pos = mesh.positions;
    if (!pos || pos.length < 3) return mesh;

    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
        minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
        minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    }

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxDim = Math.max(sizeX, sizeY, sizeZ);

    const scale = (maxDim > 0.0001) ? (targetSize / maxDim) : 1;
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const baseY = minY; // Sit bottom on y=0

    for (let i = 0; i < pos.length; i += 3) {
        pos[i] = (pos[i] - centerX) * scale;
        pos[i + 1] = (pos[i + 1] - baseY) * scale;
        pos[i + 2] = (pos[i + 2] - centerZ) * scale;
    }

    return mesh;
};

const ensureBuffer = input => {
    if (input instanceof ArrayBuffer) return input;
    if (ArrayBuffer.isView(input)) {
        return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    }
    if (typeof input === 'string') {
        return new TextEncoder().encode(input).buffer;
    }
    throw new Error('Unsupported input type for 3D model buffer');
};

const ensureText = input => {
    if (typeof input === 'string') return input;
    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
        return new TextDecoder().decode(input);
    }
    return String(input || '');
};

// ==========================================
// GLB & glTF 2.0 Loader
// ==========================================

const readGLBHeader = buffer => {
    const v = new DataView(buffer);
    const magic = v.getUint32(0, true);
    if (magic !== 0x46546C67) {
        throw new Error('Not a GLB file (missing glTF magic)');
    }
    const version = v.getUint32(4, true);
    if (version !== 2) {
        throw new Error(`Unsupported glTF version ${version}`);
    }
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < buffer.byteLength) {
        const chunkLength = v.getUint32(offset, true);
        const chunkType = v.getUint32(offset + 4, true);
        const start = offset + 8;
        if (chunkType === 0x4E4F534A) {
            json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, chunkLength)));
        } else if (chunkType === 0x004E4942) {
            bin = buffer.slice(start, start + chunkLength);
        }
        offset = start + chunkLength;
    }
    if (!json) throw new Error('GLB missing JSON chunk');
    return {json, bin};
};

const accessorTyped = (gltf, bin, accessorIndex) => {
    if (accessorIndex === null || typeof accessorIndex === 'undefined') return null;
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor) return null;
    const bufferView = gltf.bufferViews[accessor.bufferView];
    if (!bufferView) return null;
    const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const comps = TYPE_COUNT[accessor.type] || 1;
    const bytes = COMPONENT_BYTES[accessor.componentType] || 4;
    const stride = bufferView.byteStride || (bytes * comps);
    let Typed;
    switch (accessor.componentType) {
    case 5120: Typed = Int8Array; break;
    case 5121: Typed = Uint8Array; break;
    case 5122: Typed = Int16Array; break;
    case 5123: Typed = Uint16Array; break;
    case 5125: Typed = Uint32Array; break;
    case 5126: Typed = Float32Array; break;
    default: Typed = Float32Array;
    }
    if (!bin) return null;
    if (stride === bytes * comps) {
        return new Typed(bin, offset, count * comps);
    }
    const out = new Typed(count * comps);
    const src = new DataView(bin);
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
            const o = offset + (i * stride) + (c * bytes);
            let val;
            switch (accessor.componentType) {
            case 5126: val = src.getFloat32(o, true); break;
            case 5123: val = src.getUint16(o, true); break;
            case 5125: val = src.getUint32(o, true); break;
            case 5121: val = src.getUint8(o); break;
            case 5120: val = src.getInt8(o); break;
            case 5122: val = src.getInt16(o, true); break;
            default: val = 0;
            }
            out[(i * comps) + c] = val;
        }
    }
    return out;
};

const nodeMatrix = node => {
    const m = create();
    if (node.matrix) {
        m.set(node.matrix);
        return m;
    }
    const t = node.translation || [0, 0, 0];
    const r = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    const x = r[0]; const y = r[1]; const z = r[2]; const w = r[3];
    const x2 = x + x; const y2 = y + y; const z2 = z + z;
    const xx = x * x2; const yx = y * x2; const yy = y * y2;
    const zx = z * x2; const zy = z * y2; const zz = z * z2;
    const wx = w * x2; const wy = w * y2; const wz = w * z2;
    identity(m);
    m[0] = (1 - (yy + zz)) * s[0];
    m[1] = (yx + wz) * s[0];
    m[2] = (zx - wy) * s[0];
    m[4] = (yx - wz) * s[1];
    m[5] = (1 - (xx + zz)) * s[1];
    m[6] = (zy + wx) * s[1];
    m[8] = (zx + wy) * s[2];
    m[9] = (zy - wx) * s[2];
    m[10] = (1 - (xx + yy)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
};

const transformPositions = (positions, matrix) => {
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]; const y = positions[i + 1]; const z = positions[i + 2];
        const w = (matrix[3] * x) + (matrix[7] * y) + (matrix[11] * z) + matrix[15] || 1;
        out[i] = ((matrix[0] * x) + (matrix[4] * y) + (matrix[8] * z) + matrix[12]) / w;
        out[i + 1] = ((matrix[1] * x) + (matrix[5] * y) + (matrix[9] * z) + matrix[13]) / w;
        out[i + 2] = ((matrix[2] * x) + (matrix[6] * y) + (matrix[10] * z) + matrix[14]) / w;
    }
    return out;
};

const parseGltfScene = (json, bin) => {
    const parts = [];
    const walk = (nodeIndex, parentMatrix) => {
        const node = json.nodes && json.nodes[nodeIndex];
        if (!node) return;
        const local = nodeMatrix(node);
        const world = create();
        multiply(world, parentMatrix, local);
        if (typeof node.mesh !== 'undefined' && json.meshes && json.meshes[node.mesh]) {
            const mesh = json.meshes[node.mesh];
            (mesh.primitives || []).forEach(prim => {
                const pos = accessorTyped(json, bin, prim.attributes.POSITION);
                if (!pos) return;
                let indices = accessorTyped(json, bin, prim.indices);
                if (!indices) {
                    indices = new Uint32Array(pos.length / 3);
                    for (let i = 0; i < indices.length; i++) indices[i] = i;
                }
                const idx = indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
                let normals = accessorTyped(json, bin, prim.attributes.NORMAL);
                const transformed = transformPositions(pos, world);
                if (!normals) normals = computeNormals(transformed, idx);
                let uvs = accessorTyped(json, bin, prim.attributes.TEXCOORD_0);
                if (!uvs) uvs = new Float32Array((transformed.length / 3) * 2);

                const material = {albedo: [0.75, 0.78, 0.88], metallic: 0.1, roughness: 0.5, emissive: 0, opacity: 1};
                if (typeof prim.material !== 'undefined' && json.materials && json.materials[prim.material]) {
                    const mat = json.materials[prim.material];
                    const pbr = mat.pbrMetallicRoughness || {};
                    if (pbr.baseColorFactor) {
                        material.albedo = pbr.baseColorFactor.slice(0, 3);
                        material.opacity = typeof pbr.baseColorFactor[3] === 'number' ? pbr.baseColorFactor[3] : 1;
                    }
                    if (typeof pbr.metallicFactor !== 'undefined') material.metallic = pbr.metallicFactor;
                    if (typeof pbr.roughnessFactor !== 'undefined') material.roughness = pbr.roughnessFactor;
                    if (mat.emissiveFactor) material.emissive = Math.max(...mat.emissiveFactor);
                }
                const built = meshFrom(
                    Array.from(transformed),
                    Array.from(normals),
                    Array.from(uvs),
                    Array.from(idx)
                );
                parts.push({mesh: built, material});
            });
        }
        (node.children || []).forEach(child => walk(child, world));
    };

    const sceneIdx = typeof json.scene === 'number' ? json.scene : 0;
    const scene = json.scenes ? json.scenes[sceneIdx] : null;
    const root = identity(create());
    if (scene && scene.nodes) {
        scene.nodes.forEach(n => walk(n, root));
    } else if (json.nodes) {
        json.nodes.forEach((_, i) => walk(i, root));
    }

    if (!parts.length) throw new Error('glTF contained no valid mesh primitives');
    return parts;
};

const loadGLB = buffer => {
    buffer = ensureBuffer(buffer);
    const {json, bin} = readGLBHeader(buffer);
    return parseGltfScene(json, bin);
};

const loadGltfJson = input => {
    const text = ensureText(input);
    const json = JSON.parse(text);
    let bin = null;
    if (json.buffers && json.buffers[0] && json.buffers[0].uri) {
        const uri = json.buffers[0].uri;
        if (uri.startsWith('data:')) {
            const base64 = uri.split(',')[1];
            const hasBuffer = typeof globalThis.Buffer !== 'undefined';
            const binary = (typeof atob === 'function') ?
                atob(base64) : (hasBuffer ? globalThis.Buffer.from(base64, 'base64').toString('binary') : '');
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            bin = bytes.buffer;
        }
    }
    return parseGltfScene(json, bin);
};

// ==========================================
// Wavefront OBJ Loader
// ==========================================

const loadOBJ = input => {
    const text = ensureText(input);
    const lines = text.split(/\r?\n/);

    const rawPositions = [];
    const rawNormals = [];
    const rawUVs = [];

    const outPositions = [];
    const outNormals = [];
    const outUVs = [];
    const outIndices = [];

    const vertexCache = new Map();
    let defaultAlbedo = [0.65, 0.72, 0.92];

    const getOrAddVertex = (vIdx, vtIdx, vnIdx) => {
        const key = `${vIdx}/${vtIdx}/${vnIdx}`;
        if (vertexCache.has(key)) {
            return vertexCache.get(key);
        }

        const newIndex = outPositions.length / 3;

        // Position (1-indexed, or negative offset)
        const pi = vIdx < 0 ? ((rawPositions.length / 3) + vIdx) * 3 : (vIdx - 1) * 3;
        outPositions.push(
            rawPositions[pi] || 0,
            rawPositions[pi + 1] || 0,
            rawPositions[pi + 2] || 0
        );

        // UV
        if (vtIdx !== null && typeof vtIdx !== 'undefined' && !isNaN(vtIdx)) {
            const ti = vtIdx < 0 ? ((rawUVs.length / 2) + vtIdx) * 2 : (vtIdx - 1) * 2;
            outUVs.push(rawUVs[ti] || 0, rawUVs[ti + 1] || 0);
        } else {
            outUVs.push(0, 0);
        }

        // Normal
        if (vnIdx !== null && typeof vnIdx !== 'undefined' && !isNaN(vnIdx)) {
            const ni = vnIdx < 0 ? ((rawNormals.length / 3) + vnIdx) * 3 : (vnIdx - 1) * 3;
            outNormals.push(rawNormals[ni] || 0, rawNormals[ni + 1] || 1, rawNormals[ni + 2] || 0);
        } else {
            outNormals.push(0, 1, 0);
        }

        vertexCache.set(key, newIndex);
        return newIndex;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        const type = parts[0].toLowerCase();

        if (type === 'v') {
            rawPositions.push(parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0, parseFloat(parts[3]) || 0);
        } else if (type === 'vn') {
            rawNormals.push(parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0, parseFloat(parts[3]) || 0);
        } else if (type === 'vt') {
            rawUVs.push(parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0);
        } else if (type === 'kd') {
            defaultAlbedo = [parseFloat(parts[1]) || 0.6, parseFloat(parts[2]) || 0.7, parseFloat(parts[3]) || 0.9];
        } else if (type === 'f') {
            const faceVerts = [];
            for (let j = 1; j < parts.length; j++) {
                if (!parts[j]) continue;
                const indices = parts[j].split('/');
                const v = parseInt(indices[0], 10);
                const vt = indices[1] ? parseInt(indices[1], 10) : null;
                const vn = indices[2] ? parseInt(indices[2], 10) : null;
                faceVerts.push(getOrAddVertex(v, vt, vn));
            }
            // Fan triangulation for polygons
            for (let j = 1; j < faceVerts.length - 1; j++) {
                outIndices.push(faceVerts[0], faceVerts[j], faceVerts[j + 1]);
            }
        }
    }

    if (!outPositions.length || !outIndices.length) {
        throw new Error('OBJ file contains no valid geometry faces');
    }

    let finalNormals = new Float32Array(outNormals);
    if (!rawNormals.length) {
        finalNormals = computeNormals(new Float32Array(outPositions), outIndices);
    }

    const mesh = meshFrom(
        outPositions,
        Array.from(finalNormals),
        outUVs,
        outIndices
    );

    normalizeAndCenterMesh(mesh);

    const material = {albedo: defaultAlbedo, metallic: 0.05, roughness: 0.45, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

// ==========================================
// STL Loader (Binary & ASCII)
// ==========================================

const loadSTL = input => {
    const buffer = ensureBuffer(input);
    const isBinary = buffer.byteLength > 84 && (() => {
        const v = new DataView(buffer);
        const triCount = v.getUint32(80, true);
        const expectedSize = 84 + (triCount * 50);
        return Math.abs(buffer.byteLength - expectedSize) <= 2;
    })();

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    if (isBinary) {
        const v = new DataView(buffer);
        const triCount = v.getUint32(80, true);
        let offset = 84;
        for (let i = 0; i < triCount && offset + 50 <= buffer.byteLength; i++) {
            const nx = v.getFloat32(offset, true);
            const ny = v.getFloat32(offset + 4, true);
            const nz = v.getFloat32(offset + 8, true);

            const v1x = v.getFloat32(offset + 12, true);
            const v1y = v.getFloat32(offset + 16, true);
            const v1z = v.getFloat32(offset + 20, true);

            const v2x = v.getFloat32(offset + 24, true);
            const v2y = v.getFloat32(offset + 28, true);
            const v2z = v.getFloat32(offset + 32, true);

            const v3x = v.getFloat32(offset + 36, true);
            const v3y = v.getFloat32(offset + 40, true);
            const v3z = v.getFloat32(offset + 44, true);

            const base = positions.length / 3;
            positions.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
            normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
            uvs.push(0, 0, 1, 0, 0.5, 1);
            indices.push(base, base + 1, base + 2);

            offset += 50;
        }
    } else {
        const text = ensureText(buffer);
        const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
        let match;
        const verts = [];
        while ((match = vertexRegex.exec(text)) !== null) {
            verts.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
            if (verts.length % 9 === 0) {
                const base = positions.length / 3;
                const i = verts.length - 9;
                positions.push(
                    verts[i], verts[i + 1], verts[i + 2],
                    verts[i + 3], verts[i + 4], verts[i + 5],
                    verts[i + 6], verts[i + 7], verts[i + 8]
                );
                uvs.push(0, 0, 1, 0, 0.5, 1);
                indices.push(base, base + 1, base + 2);
            }
        }
        const calcNormals = computeNormals(new Float32Array(positions), indices);
        for (let i = 0; i < calcNormals.length; i++) normals.push(calcNormals[i]);
    }

    if (!positions.length) throw new Error('STL contains no valid geometry');

    const mesh = meshFrom(positions, normals, uvs, indices);
    normalizeAndCenterMesh(mesh);

    const material = {albedo: [0.68, 0.72, 0.85], metallic: 0.1, roughness: 0.4, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

// ==========================================
// FBX Loader (Binary & ASCII)
// ==========================================

const parseFBXAscii = text => {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Extract Vertices: *N { a: 1.0, 2.0, ... }
    const vertMatch = text.match(/Vertices:\s*\*\d+\s*\{\s*a:\s*([\s\S]*?)\}/i);
    if (vertMatch) {
        const rawCoords = vertMatch[1].split(/[\s,]+/).filter(Boolean)
            .map(Number);
        positions.push(...rawCoords);
    }

    // Extract PolygonVertexIndex: *N { a: 0, 1, -3, ... }
    const polyMatch = text.match(/PolygonVertexIndex:\s*\*\d+\s*\{\s*a:\s*([\s\S]*?)\}/i);
    if (polyMatch) {
        const rawIndices = polyMatch[1].split(/[\s,]+/).filter(Boolean)
            .map(Number);
        let poly = [];
        for (let i = 0; i < rawIndices.length; i++) {
            let idx = rawIndices[i];
            if (idx < 0) {
                // Negative index denotes end of polygon
                idx = (-idx) - 1;
                poly.push(idx);
                // Triangulate
                for (let p = 1; p < poly.length - 1; p++) {
                    indices.push(poly[0], poly[p], poly[p + 1]);
                }
                poly = [];
            } else {
                poly.push(idx);
            }
        }
    }

    if (!positions.length) {
        throw new Error('ASCII FBX contained no vertices');
    }

    if (!indices.length) {
        for (let i = 0; i < positions.length / 3; i++) indices.push(i);
    }

    const calcNormals = computeNormals(new Float32Array(positions), indices);
    for (let i = 0; i < calcNormals.length; i++) normals.push(calcNormals[i]);
    for (let i = 0; i < positions.length / 3; i++) uvs.push(0, 0);

    const mesh = meshFrom(positions, normals, uvs, indices);
    normalizeAndCenterMesh(mesh);

    const material = {albedo: [0.72, 0.75, 0.9], metallic: 0.1, roughness: 0.5, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

const parseFBXBinary = buffer => {
    // Binary FBX reader for geometry
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const version = view.getUint32(23, true);
    const is64 = version >= 7500;

    let offset = 27;
    const positions = [];
    const indices = [];

    const readString = (pos, len) => new TextDecoder().decode(u8.subarray(pos, pos + len));

    const readArrayProperty = (pos, type) => {
        const arrayLen = view.getUint32(pos, true);
        const encoding = view.getUint32(pos + 4, true);
        const compLen = view.getUint32(pos + 8, true);
        const dataPos = pos + 12;
        const nextPos = dataPos + compLen;

        if (encoding === 0) { // Raw uncompressed
            const arr = [];
            if (type === 'd') {
                for (let i = 0; i < arrayLen; i++) arr.push(view.getFloat64(dataPos + (i * 8), true));
            } else if (type === 'f') {
                for (let i = 0; i < arrayLen; i++) arr.push(view.getFloat32(dataPos + (i * 4), true));
            } else if (type === 'i') {
                for (let i = 0; i < arrayLen; i++) arr.push(view.getInt32(dataPos + (i * 4), true));
            } else if (type === 'l') {
                for (let i = 0; i < arrayLen; i++) arr.push(Number(view.getBigInt64(dataPos + (i * 8), true)));
            }
            return {data: arr, nextPos};
        }

        // Compressed with zlib / deflate
        // Try node zlib if available
        let decompressed = null;
        try {
            const isNode = typeof globalThis.process !== 'undefined' &&
                globalThis.process.versions &&
                globalThis.process.versions.node;
            if (isNode && typeof globalThis.require === 'function') {
                const zlibName = 'z' + 'lib';
                const zlib = globalThis.require(zlibName);
                if (zlib && zlib.inflateSync) {
                    decompressed = zlib.inflateSync(u8.subarray(dataPos, dataPos + compLen));
                }
            }
        } catch (err) {
            void err;
            decompressed = null;
        }

        if (decompressed) {
            const dv = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
            const arr = [];
            if (type === 'd') {
                for (let i = 0; i < arrayLen; i++) arr.push(dv.getFloat64(i * 8, true));
            } else if (type === 'f') {
                for (let i = 0; i < arrayLen; i++) arr.push(dv.getFloat32(i * 4, true));
            } else if (type === 'i') {
                for (let i = 0; i < arrayLen; i++) arr.push(dv.getInt32(i * 4, true));
            } else if (type === 'l') {
                for (let i = 0; i < arrayLen; i++) arr.push(Number(dv.getBigInt64(i * 8, true)));
            }
            return {data: arr, nextPos};
        }

        return {data: [], nextPos};
    };

    const readNode = pos => {
        if (pos >= buffer.byteLength) return {endOffset: buffer.byteLength, name: ''};
        const endOffset = is64 ? Number(view.getBigUint64(pos, true)) : view.getUint32(pos, true);
        if (endOffset === 0) return {endOffset: pos + (is64 ? 25 : 13), name: ''};

        const numProps = is64 ? Number(view.getBigUint64(pos + 8, true)) : view.getUint32(pos + 4, true);
        const nameLen = view.getUint8(pos + (is64 ? 24 : 12));
        const namePos = pos + (is64 ? 25 : 13);
        const name = readString(namePos, nameLen);

        let cur = namePos + nameLen;
        const props = [];
        for (let p = 0; p < numProps; p++) {
            const type = String.fromCharCode(view.getUint8(cur));
            cur += 1;
            if (['f', 'd', 'i', 'l', 'b'].includes(type)) {
                const res = readArrayProperty(cur, type);
                props.push(res.data);
                cur = res.nextPos;
            } else if (type === 'S' || type === 'R') {
                const len = view.getUint32(cur, true);
                props.push(readString(cur + 4, len));
                cur += 4 + len;
            } else if (type === 'I') {
                props.push(view.getInt32(cur, true));
                cur += 4;
            } else if (type === 'D') {
                props.push(view.getFloat64(cur, true));
                cur += 8;
            } else if (type === 'F') {
                props.push(view.getFloat32(cur, true));
                cur += 4;
            } else if (type === 'Y') {
                props.push(view.getInt16(cur, true));
                cur += 2;
            } else if (type === 'C') {
                props.push(Boolean(view.getUint8(cur)));
                cur += 1;
            } else if (type === 'L') {
                props.push(Number(view.getBigInt64(cur, true)));
                cur += 8;
            }
        }

        if (name === 'Vertices' && props[0] && props[0].length) {
            positions.push(...props[0]);
        } else if (name === 'PolygonVertexIndex' && props[0] && props[0].length) {
            const rawIndices = props[0];
            let poly = [];
            for (let i = 0; i < rawIndices.length; i++) {
                let idx = rawIndices[i];
                if (idx < 0) {
                    idx = (-idx) - 1;
                    poly.push(idx);
                    for (let k = 1; k < poly.length - 1; k++) {
                        indices.push(poly[0], poly[k], poly[k + 1]);
                    }
                    poly = [];
                } else {
                    poly.push(idx);
                }
            }
        }

        // Subnodes
        while (cur < endOffset) {
            const sub = readNode(cur);
            if (!sub.endOffset || sub.endOffset <= cur) break;
            cur = sub.endOffset;
        }

        return {endOffset, name};
    };

    while (offset < buffer.byteLength - 20) {
        const node = readNode(offset);
        if (!node.endOffset || node.endOffset <= offset) break;
        offset = node.endOffset;
    }

    if (!positions.length) {
        throw new Error('Binary FBX contained no vertex geometry data');
    }

    if (!indices.length) {
        for (let i = 0; i < positions.length / 3; i++) indices.push(i);
    }

    const calcNormals = computeNormals(new Float32Array(positions), indices);
    const uvs = new Array((positions.length / 3) * 2).fill(0);

    const mesh = meshFrom(positions, Array.from(calcNormals), uvs, indices);
    normalizeAndCenterMesh(mesh);

    const material = {albedo: [0.72, 0.75, 0.9], metallic: 0.1, roughness: 0.5, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

const loadFBX = input => {
    const buffer = ensureBuffer(input);
    const view = new Uint8Array(buffer);
    const header = new TextDecoder().decode(view.subarray(0, 21));
    const isBinary = header.startsWith('Kaydara FBX Binary');

    if (isBinary) {
        return parseFBXBinary(buffer);
    }
    return parseFBXAscii(ensureText(buffer));
};

// ==========================================
// DAE (COLLADA) Loader
// ==========================================

const loadDAE = input => {
    const text = ensureText(input);
    const positions = [];
    const indices = [];

    const floatArrayMatch = text.match(/<float_array[^>]*id="[^"]*positions[^"]*"[^>]*>([\s\S]*?)<\/float_array>/i) ||
        text.match(/<float_array[^>]*>([\s\S]*?)<\/float_array>/i);

    if (floatArrayMatch) {
        positions.push(...floatArrayMatch[1].trim().split(/\s+/)
            .map(Number));
    }

    const pMatch = text.match(/<p>([\s\S]*?)<\/p>/i);
    if (pMatch) {
        const rawIndices = pMatch[1].trim().split(/\s+/)
            .map(Number);
        // Look for input count
        const inputCount = (text.match(/<input\s+/gi) || []).length || 1;
        const stride = Math.max(1, Math.min(inputCount, 4));
        for (let i = 0; i < rawIndices.length; i += stride) {
            indices.push(rawIndices[i]);
        }
    }

    if (!positions.length) throw new Error('DAE contained no float array positions');
    if (!indices.length) {
        for (let i = 0; i < positions.length / 3; i++) indices.push(i);
    }

    const calcNormals = computeNormals(new Float32Array(positions), indices);
    const uvs = new Array((positions.length / 3) * 2).fill(0);

    const mesh = meshFrom(positions, Array.from(calcNormals), uvs, indices);
    normalizeAndCenterMesh(mesh);

    const material = {albedo: [0.7, 0.75, 0.88], metallic: 0.05, roughness: 0.45, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

// ==========================================
// PLY Loader
// ==========================================

const loadPLY = input => {
    const text = ensureText(input);
    const lines = text.split(/\r?\n/);
    let vertexCount = 0;
    let faceCount = 0;
    let lineIdx = 0;

    for (; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx].trim();
        if (line.startsWith('element vertex')) vertexCount = parseInt(line.split(/\s+/)[2], 10);
        if (line.startsWith('element face')) faceCount = parseInt(line.split(/\s+/)[2], 10);
        if (line === 'end_header') {
            lineIdx++;
            break;
        }
    }

    const positions = [];
    const indices = [];

    for (let v = 0; v < vertexCount && lineIdx < lines.length; v++, lineIdx++) {
        const parts = lines[lineIdx].trim().split(/\s+/);
        positions.push(parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0);
    }

    for (let f = 0; f < faceCount && lineIdx < lines.length; f++, lineIdx++) {
        const parts = lines[lineIdx].trim().split(/\s+/)
            .map(Number);
        const count = parts[0];
        const vIndices = parts.slice(1, 1 + count);
        for (let j = 1; j < vIndices.length - 1; j++) {
            indices.push(vIndices[0], vIndices[j], vIndices[j + 1]);
        }
    }

    if (!positions.length) throw new Error('PLY contains no vertices');

    const calcNormals = computeNormals(new Float32Array(positions), indices);
    const uvs = new Array((positions.length / 3) * 2).fill(0);

    const mesh = meshFrom(positions, Array.from(calcNormals), uvs, indices);
    normalizeAndCenterMesh(mesh);

    const material = {albedo: [0.65, 0.7, 0.85], metallic: 0.05, roughness: 0.5, emissive: 0, opacity: 1};
    return [{mesh, material}];
};

// ==========================================
// Unified Model Loader Interface
// ==========================================

/**
 * Detects format and loads any 3D model into unified mesh primitives.
 * @param {ArrayBuffer|Uint8Array|string} bufferOrData Model buffer or string
 * @param {string} [fileName] Optional file name with extension
 * @returns {Array<{mesh: object, material: object}>} List of mesh parts
 */
const loadModel = (bufferOrData, fileName = '') => {
    const ext = String(fileName || '').toLowerCase()
        .split('.')
        .pop();

    // Check magic bytes for GLB
    let isGlb = ext === 'glb';
    if (!isGlb && (bufferOrData instanceof ArrayBuffer || ArrayBuffer.isView(bufferOrData))) {
        const bytes = new Uint8Array(
            bufferOrData instanceof ArrayBuffer ? bufferOrData : bufferOrData.buffer,
            bufferOrData.byteOffset || 0,
            Math.min(4, bufferOrData.byteLength)
        );
        if (bytes[0] === 0x67 && bytes[1] === 0x6C && bytes[2] === 0x54 && bytes[3] === 0x46) {
            isGlb = true;
        }
    }

    if (isGlb) return loadGLB(bufferOrData);
    if (ext === 'gltf') return loadGltfJson(bufferOrData);
    if (ext === 'obj') return loadOBJ(bufferOrData);
    if (ext === 'stl') return loadSTL(bufferOrData);
    if (ext === 'fbx') return loadFBX(bufferOrData);
    if (ext === 'dae') return loadDAE(bufferOrData);
    if (ext === 'ply') return loadPLY(bufferOrData);

    // Auto-detect by text inspection
    try {
        const text = ensureText(bufferOrData).trim();
        if (text.startsWith('{') && text.includes('"asset"') && text.includes('"version"')) {
            return loadGltfJson(text);
        }
        if (text.startsWith('solid') || text.includes('facet normal')) {
            return loadSTL(bufferOrData);
        }
        if (text.startsWith('ply') || text.includes('element vertex')) {
            return loadPLY(text);
        }
        if (text.includes('<COLLADA') || text.includes('<geometry')) {
            return loadDAE(text);
        }
        if (text.startsWith('Kaydara FBX') || text.includes('FBXHeaderExtension')) {
            return loadFBX(bufferOrData);
        }
        // Try OBJ as default text format
        return loadOBJ(text);
    } catch (err) {
        void err;
        // Try GLB as binary fallback
        return loadGLB(bufferOrData);
    }
};

/**
 * Convenience function to load and merge any 3D model into a single unified custom mesh.
 * @param {ArrayBuffer|Uint8Array|string} bufferOrData Model buffer or string
 * @param {string} [fileName] Optional file name with extension
 * @returns {{customMesh: object, material: object}} Merged custom mesh and primary material
 */
const loadMergedModel = (bufferOrData, fileName = '') => {
    const parts = loadModel(bufferOrData, fileName);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const material = (parts[0] && parts[0].material) || {
        albedo: [0.55, 0.62, 0.95],
        metallic: 0.05,
        roughness: 0.45,
        emissive: 0,
        opacity: 1
    };

    parts.forEach(part => {
        const base = positions.length / 3;
        positions.push(...part.mesh.positions);
        normals.push(...part.mesh.normals);
        uvs.push(...part.mesh.uvs);
        for (let i = 0; i < part.mesh.indices.length; i++) {
            indices.push(part.mesh.indices[i] + base);
        }
    });

    const customMesh = {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
    };

    normalizeAndCenterMesh(customMesh);

    return {customMesh, material};
};

module.exports = {
    loadModel,
    loadMergedModel,
    loadGLB,
    loadGltfJson,
    loadOBJ,
    loadFBX,
    loadSTL,
    loadDAE,
    loadPLY,
    normalizeAndCenterMesh,
    computeNormals
};
