/**
 * Sprite-list preview of a 3D mesh. Same primitives and lighting direction
 * as the stage, drawn from a 3/4 camera so a cube reads as a cube.
 */

const {create, lookAt, perspective, multiply} = require('./math3d');
const {getPrimitive} = require('./primitives');

const SIZE = 96;
const cache = new Map();
const view = create();
const proj = create();
const vp = create();

const project = (m, x, y, z) => {
    const w = (m[3] * x) + (m[7] * y) + (m[11] * z) + m[15];
    const iw = Math.abs(w) < 1e-6 ? 1 : (1 / w);
    return [
        ((m[0] * x) + (m[4] * y) + (m[8] * z) + m[12]) * iw,
        ((m[1] * x) + (m[5] * y) + (m[9] * z) + m[13]) * iw,
        ((m[2] * x) + (m[6] * y) + (m[10] * z) + m[14]) * iw
    ];
};

const fillTriangle = (pixels, zbuf, width, height, a, b, c, r, g, bl) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const denom = ((b[1] - c[1]) * (a[0] - c[0])) + ((c[0] - b[0]) * (a[1] - c[1]));
    if (Math.abs(denom) < 1e-5) return;
    const inv = 1 / denom;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const w0 = (((b[1] - c[1]) * (x - c[0])) + ((c[0] - b[0]) * (y - c[1]))) * inv;
            const w1 = (((c[1] - a[1]) * (x - c[0])) + ((a[0] - c[0]) * (y - c[1]))) * inv;
            const w2 = 1 - w0 - w1;
            if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
            const z = (w0 * a[2]) + (w1 * b[2]) + (w2 * c[2]);
            const zi = (y * width) + x;
            if (z >= zbuf[zi]) continue;
            zbuf[zi] = z;
            const pi = zi * 4;
            pixels[pi] = r;
            pixels[pi + 1] = g;
            pixels[pi + 2] = bl;
            pixels[pi + 3] = 255;
        }
    }
};

const makeCanvas = (width, height) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

/**
 * @param {string|object} meshOrName primitive name (cube, sphere, …) or custom mesh object
 * @param {number[]} [albedo] linear RGB 0-1
 * @param {number} [size] pixel size
 * @returns {?string} PNG data URL
 */
const renderMeshThumbnail = (meshOrName, albedo, size = SIZE) => {
    if (!meshOrName) return null;
    const color = albedo && albedo.length >= 3 ? albedo : [0.55, 0.62, 0.95];

    let mesh;
    let key;
    if (typeof meshOrName === 'string') {
        key = `${meshOrName.toLowerCase()}|${color[0].toFixed(3)},${color[1].toFixed(3)},${color[2].toFixed(3)}|${size}`;
        if (cache.has(key)) return cache.get(key);
        mesh = getPrimitive(meshOrName);
    } else if (meshOrName && (meshOrName.positions || (meshOrName.customMesh && meshOrName.customMesh.positions))) {
        const custom = meshOrName.positions ? meshOrName : meshOrName.customMesh;
        const posLen = custom.positions ? custom.positions.length : 0;
        const idxLen = custom.indices ? custom.indices.length : 0;
        const hash = (custom.positions && custom.positions[0] !== undefined) ? custom.positions[0].toFixed(2) : '0';
        key = `custom_${posLen}_${idxLen}_${hash}|${color[0].toFixed(3)},${color[1].toFixed(3)},${color[2].toFixed(3)}|${size}`;
        if (cache.has(key)) return cache.get(key);
        mesh = {
            positions: custom.positions instanceof Float32Array ? custom.positions : new Float32Array(custom.positions),
            normals: custom.normals instanceof Float32Array ? custom.normals : (custom.normals ? new Float32Array(custom.normals) : null),
            indices: custom.indices ? (custom.indices instanceof Uint16Array || custom.indices instanceof Uint32Array ? custom.indices : new Uint16Array(custom.indices)) : null
        };
    } else {
        return null;
    }

    if (!mesh || !mesh.positions || !mesh.positions.length) return null;

    const canvas = makeCanvas(size, size);
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return null;

    const pos = mesh.positions;
    let idx = mesh.indices;
    if (!idx || !idx.length) {
        idx = new Uint16Array(pos.length / 3);
        for (let i = 0; i < idx.length; i++) idx[i] = i;
    }
    const nrm = mesh.normals || new Float32Array(pos.length);


    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
        minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
        minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) * 0.5;
    const dist = radius * 2.55;
    // Same 3/4 view as the default stage camera (slightly above, from +Z).
    lookAt(view, [cx + (dist * 0.52), cy + (dist * 0.68), cz + (dist * 1.18)], [cx, cy, cz], [0, 1, 0]);
    perspective(proj, 38 * Math.PI / 180, 1, 0.05, dist * 8);
    multiply(vp, proj, view);

    const image = ctx.createImageData(size, size);
    const pixels = image.data;
    const zbuf = new Float32Array(size * size);
    zbuf.fill(Infinity);

    const lightX = 0.35;
    const lightY = 1;
    const lightZ = 0.25;
    const lightLen = Math.hypot(lightX, lightY, lightZ) || 1;
    const lx = lightX / lightLen;
    const ly = lightY / lightLen;
    const lz = lightZ / lightLen;
    const eyeX = cx + (dist * 0.52);
    const eyeY = cy + (dist * 0.68);
    const eyeZ = cz + (dist * 1.18);
    const pad = size * 0.12;
    const inner = size - (pad * 2);

    for (let t = 0; t < idx.length; t += 3) {
        const ia = idx[t] * 3;
        const ib = idx[t + 1] * 3;
        const ic = idx[t + 2] * 3;
        const ax = pos[ia]; const ay = pos[ia + 1]; const az = pos[ia + 2];
        const bx = pos[ib]; const by = pos[ib + 1]; const bz = pos[ib + 2];
        const cxp = pos[ic]; const cyp = pos[ic + 1]; const czp = pos[ic + 2];

        const nx = (nrm[ia] + nrm[ib] + nrm[ic]) / 3;
        const ny = (nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1]) / 3;
        const nz = (nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2]) / 3;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        const nnx = nx / nlen; const nny = ny / nlen; const nnz = nz / nlen;

        const mx = (ax + bx + cxp) / 3;
        const my = (ay + by + cyp) / 3;
        const mz = (az + bz + czp) / 3;
        const vx = eyeX - mx; const vy = eyeY - my; const vz = eyeZ - mz;
        if (((nnx * vx) + (nny * vy) + (nnz * vz)) <= 0) continue;

        const pa = project(vp, ax, ay, az);
        const pb = project(vp, bx, by, bz);
        const pc = project(vp, cxp, cyp, czp);
        if (pa[2] < -1 || pa[2] > 1 || pb[2] < -1 || pb[2] > 1 || pc[2] < -1 || pc[2] > 1) continue;

        const sa = [pad + ((pa[0] * 0.5 + 0.5) * inner), pad + ((0.5 - pa[1] * 0.5) * inner), pa[2]];
        const sb = [pad + ((pb[0] * 0.5 + 0.5) * inner), pad + ((0.5 - pb[1] * 0.5) * inner), pb[2]];
        const sc = [pad + ((pc[0] * 0.5 + 0.5) * inner), pad + ((0.5 - pc[1] * 0.5) * inner), pc[2]];

        const ndotl = Math.max(0, (nnx * lx) + (nny * ly) + (nnz * lz));
        const shade = 0.22 + (0.82 * ndotl);
        const gamma = 1 / 2.2;
        const r = Math.max(0, Math.min(255, Math.round(Math.pow(color[0] * shade, gamma) * 255)));
        const g = Math.max(0, Math.min(255, Math.round(Math.pow(color[1] * shade, gamma) * 255)));
        const b = Math.max(0, Math.min(255, Math.round(Math.pow(color[2] * shade, gamma) * 255)));
        fillTriangle(pixels, zbuf, size, size, sa, sb, sc, r, g, b);
    }

    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png');
    cache.set(key, url);
    return url;
};

module.exports = {renderMeshThumbnail};
