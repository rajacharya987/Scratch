/**
 * Minimal glTF 2.0 / GLB loader: meshes, node transforms, PBR metallic-roughness.
 * Animation/skins are ignored so kids can drop in character.glb / environment.glb.
 */

const {meshFrom} = require('./primitives');
const {multiply, identity, create} = require('./math3d');

const COMPONENT_BYTES = {
    5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4
};
const TYPE_COUNT = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16
};

const readHeader = buffer => {
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
    if (accessorIndex === undefined || accessorIndex === null) return null;
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const comps = TYPE_COUNT[accessor.type];
    const bytes = COMPONENT_BYTES[accessor.componentType];
    const stride = bufferView.byteStride || (bytes * comps);
    let Typed;
    switch (accessor.componentType) {
    case 5120: Typed = Int8Array; break;
    case 5121: Typed = Uint8Array; break;
    case 5122: Typed = Int16Array; break;
    case 5123: Typed = Uint16Array; break;
    case 5125: Typed = Uint32Array; break;
    case 5126: Typed = Float32Array; break;
    default: throw new Error('Unsupported accessor type');
    }
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

const nodeMatrix = node => {
    const m = create();
    if (node.matrix) {
        m.set(node.matrix);
        return m;
    }
    const t = node.translation || [0, 0, 0];
    const r = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    // Convert quaternion to a matrix then scale/translate.
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

const loadGLB = buffer => {
    const {json, bin} = readHeader(buffer);
    if (!bin) throw new Error('GLB missing BIN chunk');

    const parts = [];
    const walk = (nodeIndex, parentMatrix) => {
        const node = json.nodes[nodeIndex];
        const local = nodeMatrix(node);
        const world = create();
        multiply(world, parentMatrix, local);
        if (node.mesh !== undefined) {
            const mesh = json.meshes[node.mesh];
            mesh.primitives.forEach(prim => {
                const pos = accessorTyped(json, bin, prim.attributes.POSITION);
                if (!pos) return;
                let indices = accessorTyped(json, bin, prim.indices);
                if (!indices) {
                    indices = new Uint32Array(pos.length / 3);
                    for (let i = 0; i < indices.length; i++) indices[i] = i;
                }
                const index16 = indices.length > 65535 ?
                    null : new Uint16Array(indices);
                const idx = index16 || new Uint32Array(indices);
                let normals = accessorTyped(json, bin, prim.attributes.NORMAL);
                const transformed = transformPositions(pos, world);
                if (!normals) normals = computeNormals(transformed, idx);
                let uvs = accessorTyped(json, bin, prim.attributes.TEXCOORD_0);
                if (!uvs) {
                    uvs = new Float32Array((transformed.length / 3) * 2);
                }
                const material = {albedo: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5, emissive: 0, opacity: 1};
                if (prim.material !== undefined && json.materials) {
                    const mat = json.materials[prim.material];
                    const pbr = mat.pbrMetallicRoughness || {};
                    if (pbr.baseColorFactor) {
                        material.albedo = pbr.baseColorFactor.slice(0, 3);
                        material.opacity = pbr.baseColorFactor[3] !== undefined ? pbr.baseColorFactor[3] : 1;
                    }
                    if (pbr.metallicFactor !== undefined) material.metallic = pbr.metallicFactor;
                    if (pbr.roughnessFactor !== undefined) material.roughness = pbr.roughnessFactor;
                    if (mat.emissiveFactor) {
                        material.emissive = Math.max(...mat.emissiveFactor);
                    }
                }
                const built = meshFrom(
                    Array.from(transformed),
                    Array.from(normals),
                    Array.from(uvs),
                    Array.from(idx)
                );
                // Scale imported models into Scratch-ish units if they are tiny or huge.
                let maxAbs = 0;
                for (let i = 0; i < built.positions.length; i++) {
                    maxAbs = Math.max(maxAbs, Math.abs(built.positions[i]));
                }
                if (maxAbs > 0.0001) {
                    const target = 80;
                    const scale = maxAbs > target * 4 || maxAbs < 5 ? target / maxAbs : 1;
                    if (scale !== 1) {
                        for (let i = 0; i < built.positions.length; i++) {
                            built.positions[i] *= scale;
                        }
                    }
                }
                parts.push({mesh: built, material});
            });
        }
        (node.children || []).forEach(child => walk(child, world));
    };

    const scene = json.scenes[(json.scene !== undefined) ? json.scene : 0];
    const root = identity(create());
    if (scene && scene.nodes) {
        scene.nodes.forEach(n => walk(n, root));
    } else if (json.nodes) {
        json.nodes.forEach((_, i) => walk(i, root));
    }

    if (!parts.length) throw new Error('GLB contained no mesh primitives');
    return parts;
};

const {loadModel, loadMergedModel} = require('./model-loader');

module.exports = {
    loadGLB,
    loadModel,
    loadMergedModel
};
