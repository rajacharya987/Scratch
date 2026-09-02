/**
 * Built-in meshes for the 3D renderer.
 * Positions are in Scratch units; a unit cube is 50x50x50 so it matches a typical costume.
 */

const SIZE = 50;

const pushTri = (positions, normals, uvs, indices, a, b, c) => {
    const start = positions.length / 3;
    const verts = [a, b, c];
    const e1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const e2 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const nx = (e1[1] * e2[2]) - (e1[2] * e2[1]);
    const ny = (e1[2] * e2[0]) - (e1[0] * e2[2]);
    const nz = (e1[0] * e2[1]) - (e1[1] * e2[0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    const n = [nx / len, ny / len, nz / len];
    verts.forEach(v => {
        positions.push(v.p[0], v.p[1], v.p[2]);
        normals.push(v.n ? v.n[0] : n[0], v.n ? v.n[1] : n[1], v.n ? v.n[2] : n[2]);
        uvs.push(v.uv[0], v.uv[1]);
    });
    indices.push(start, start + 1, start + 2);
};

const meshFrom = (positions, normals, uvs, indices) => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices)
});

const cube = (s = SIZE) => {
    const h = s / 2;
    const faces = [
        // +Z
        {n: [0, 0, 1], verts: [[-h, -h, h, 0, 0], [h, -h, h, 1, 0], [h, h, h, 1, 1], [-h, h, h, 0, 1]]},
        // -Z
        {n: [0, 0, -1], verts: [[h, -h, -h, 0, 0], [-h, -h, -h, 1, 0], [-h, h, -h, 1, 1], [h, h, -h, 0, 1]]},
        // +X
        {n: [1, 0, 0], verts: [[h, -h, h, 0, 0], [h, -h, -h, 1, 0], [h, h, -h, 1, 1], [h, h, h, 0, 1]]},
        // -X
        {n: [-1, 0, 0], verts: [[-h, -h, -h, 0, 0], [-h, -h, h, 1, 0], [-h, h, h, 1, 1], [-h, h, -h, 0, 1]]},
        // +Y
        {n: [0, 1, 0], verts: [[-h, h, h, 0, 0], [h, h, h, 1, 0], [h, h, -h, 1, 1], [-h, h, -h, 0, 1]]},
        // -Y
        {n: [0, -1, 0], verts: [[-h, -h, -h, 0, 0], [h, -h, -h, 1, 0], [h, -h, h, 1, 1], [-h, -h, h, 0, 1]]}
    ];
    const positions = []; const normals = []; const uvs = []; const indices = [];
    faces.forEach(face => {
        const vs = face.verts.map(v => ({
            p: [v[0], v[1], v[2]],
            n: face.n,
            uv: [v[3], v[4]]
        }));
        pushTri(positions, normals, uvs, indices, vs[0], vs[1], vs[2]);
        pushTri(positions, normals, uvs, indices, vs[0], vs[2], vs[3]);
    });
    return meshFrom(positions, normals, uvs, indices);
};

const plane = (s = SIZE * 8) => {
    const h = s / 2;
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const vs = [
        {p: [-h, 0, h], n: [0, 1, 0], uv: [0, 0]},
        {p: [h, 0, h], n: [0, 1, 0], uv: [8, 0]},
        {p: [h, 0, -h], n: [0, 1, 0], uv: [8, 8]},
        {p: [-h, 0, -h], n: [0, 1, 0], uv: [0, 8]}
    ];
    pushTri(positions, normals, uvs, indices, vs[0], vs[1], vs[2]);
    pushTri(positions, normals, uvs, indices, vs[0], vs[2], vs[3]);
    return meshFrom(positions, normals, uvs, indices);
};

const sphere = (radius = SIZE / 2, seg = 24, rings = 16) => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    for (let y = 0; y <= rings; y++) {
        const v = y / rings;
        const phi = v * Math.PI;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        for (let x = 0; x <= seg; x++) {
            const u = x / seg;
            const theta = u * Math.PI * 2;
            const nx = Math.cos(theta) * sinP;
            const ny = cosP;
            const nz = Math.sin(theta) * sinP;
            positions.push(nx * radius, ny * radius, nz * radius);
            normals.push(nx, ny, nz);
            uvs.push(u, 1 - v);
        }
    }
    for (let y = 0; y < rings; y++) {
        for (let x = 0; x < seg; x++) {
            const a = (y * (seg + 1)) + x;
            const b = a + seg + 1;
            indices.push(a, b + 1, b);
            indices.push(a, a + 1, b + 1);
        }
    }
    return meshFrom(positions, normals, uvs, indices);
};

const cylinder = (radius = SIZE / 2, height = SIZE, seg = 24) => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const hh = height / 2;
    for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const a = u * Math.PI * 2;
        const nx = Math.cos(a);
        const nz = Math.sin(a);
        positions.push(nx * radius, -hh, nz * radius);
        normals.push(nx, 0, nz);
        uvs.push(u, 0);
        positions.push(nx * radius, hh, nz * radius);
        normals.push(nx, 0, nz);
        uvs.push(u, 1);
    }
    for (let i = 0; i < seg; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2);
        indices.push(a + 1, a + 3, a + 2);
    }
    const bottomCenter = positions.length / 3;
    positions.push(0, -hh, 0); normals.push(0, -1, 0); uvs.push(0.5, 0.5);
    const topCenter = positions.length / 3;
    positions.push(0, hh, 0); normals.push(0, 1, 0); uvs.push(0.5, 0.5);
    for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2;
        const b = (i + 1) / seg * Math.PI * 2;
        const ax = Math.cos(a) * radius; const az = Math.sin(a) * radius;
        const bx = Math.cos(b) * radius; const bz = Math.sin(b) * radius;
        const i0 = positions.length / 3;
        positions.push(ax, -hh, az, bx, -hh, bz);
        normals.push(0, -1, 0, 0, -1, 0);
        uvs.push(
            0.5 + ((ax / radius) * 0.5),
            0.5 + ((az / radius) * 0.5),
            0.5 + ((bx / radius) * 0.5),
            0.5 + ((bz / radius) * 0.5)
        );
        indices.push(bottomCenter, i0 + 1, i0);
        const j0 = positions.length / 3;
        positions.push(ax, hh, az, bx, hh, bz);
        normals.push(0, 1, 0, 0, 1, 0);
        uvs.push(
            0.5 + ((ax / radius) * 0.5),
            0.5 + ((az / radius) * 0.5),
            0.5 + ((bx / radius) * 0.5),
            0.5 + ((bz / radius) * 0.5)
        );
        indices.push(topCenter, j0, j0 + 1);
    }
    return meshFrom(positions, normals, uvs, indices);
};

const cone = (radius = SIZE / 2, height = SIZE, seg = 24) => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const hh = height / 2;
    const slope = Math.atan2(radius, height);
    const ny = Math.cos(slope);
    const nr = Math.sin(slope);
    for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const a = u * Math.PI * 2;
        const nx = Math.cos(a) * nr;
        const nz = Math.sin(a) * nr;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        positions.push(Math.cos(a) * radius, -hh, Math.sin(a) * radius);
        normals.push(nx / nlen, ny / nlen, nz / nlen);
        uvs.push(u, 0);
        positions.push(0, hh, 0);
        normals.push(nx / nlen, ny / nlen, nz / nlen);
        uvs.push(u, 1);
    }
    for (let i = 0; i < seg; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2);
    }
    const base = positions.length / 3;
    positions.push(0, -hh, 0); normals.push(0, -1, 0); uvs.push(0.5, 0.5);
    for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2;
        const b = (i + 1) / seg * Math.PI * 2;
        const i0 = positions.length / 3;
        positions.push(Math.cos(a) * radius, -hh, Math.sin(a) * radius,
            Math.cos(b) * radius, -hh, Math.sin(b) * radius);
        normals.push(0, -1, 0, 0, -1, 0);
        uvs.push(0.5, 0.5, 0.5, 0.5);
        indices.push(base, i0 + 1, i0);
    }
    return meshFrom(positions, normals, uvs, indices);
};

const pyramid = (s = SIZE) => {
    const h = s / 2;
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const apex = {p: [0, h, 0], uv: [0.5, 1]};
    const base = [
        {p: [-h, -h, h], uv: [0, 0]},
        {p: [h, -h, h], uv: [1, 0]},
        {p: [h, -h, -h], uv: [1, 0]},
        {p: [-h, -h, -h], uv: [0, 0]}
    ];
    for (let i = 0; i < 4; i++) {
        pushTri(positions, normals, uvs, indices, base[i], base[(i + 1) % 4], apex);
    }
    pushTri(positions, normals, uvs, indices, base[0], base[2], base[1]);
    pushTri(positions, normals, uvs, indices, base[0], base[3], base[2]);
    return meshFrom(positions, normals, uvs, indices);
};

const torus = (R = SIZE / 2.5, r = SIZE / 6, seg = 24, tube = 16) => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        for (let j = 0; j <= tube; j++) {
            const v = j / tube;
            const phi = v * Math.PI * 2;
            const cosP = Math.cos(phi);
            const sinP = Math.sin(phi);
            const x = (R + (r * cosP)) * cosT;
            const y = r * sinP;
            const z = (R + (r * cosP)) * sinT;
            positions.push(x, y, z);
            normals.push(cosP * cosT, sinP, cosP * sinT);
            uvs.push(u, v);
        }
    }
    for (let i = 0; i < seg; i++) {
        for (let j = 0; j < tube; j++) {
            const a = (i * (tube + 1)) + j;
            const b = a + tube + 1;
            indices.push(a, b, a + 1);
            indices.push(a + 1, b, b + 1);
        }
    }
    return meshFrom(positions, normals, uvs, indices);
};

const car = () => {
    const positions = []; const normals = []; const uvs = []; const indices = [];

    const addBox = (minX, minY, minZ, maxX, maxY, maxZ, colorUv = [0.5, 0.5]) => {
        const faces = [
            // +Z (Rear)
            {n: [0, 0, 1], verts: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]]},
            // -Z (Front)
            {n: [0, 0, -1], verts: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]]},
            // +X (Right)
            {n: [1, 0, 0], verts: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]]},
            // -X (Left)
            {n: [-1, 0, 0], verts: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]]},
            // +Y (Top)
            {n: [0, 1, 0], verts: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]]},
            // -Y (Bottom)
            {n: [0, -1, 0], verts: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]]}
        ];
        faces.forEach(face => {
            const vs = face.verts.map(v => ({
                p: [v[0], v[1], v[2]],
                n: face.n,
                uv: colorUv
            }));
            pushTri(positions, normals, uvs, indices, vs[0], vs[1], vs[2]);
            pushTri(positions, normals, uvs, indices, vs[0], vs[2], vs[3]);
        });
    };

    // 1. Lower Chassis & Aerodynamic Body (Low-slung GT sports stance)
    addBox(-16, 2, -32, 16, 9, 32); // Main lower hull
    addBox(-18, 1, -36, 18, 4, -28); // Front aggressive chin splitter
    addBox(-18, 2, 28, 18, 6, 36); // Rear aerodynamic diffuser
    addBox(-18, 2, -18, 18, 5, 20); // Wide flared side skirts

    // 2. Sculpted Hood & Nose
    addBox(-14, 7, -30, 14, 11, -12); // Front hood block
    addBox(-6, 11, -26, 6, 13, -16); // Hood scoop / air intake

    // 3. Sports Cabin & Canopy (Aerodynamic Roof & Windows)
    addBox(-12, 10, -10, 12, 18, 14); // Cockpit core
    addBox(-13, 10, -14, 13, 15, -9); // Windshield slope base

    // 4. Massive GT Supercar Rear Wing / Spoiler (Distinct & Elevated)
    addBox(-14, 10, 26, -11, 20, 29); // Left wing pylon
    addBox(11, 10, 26, 14, 20, 29); // Right wing pylon
    addBox(-20, 20, 24, 20, 22, 33); // Main GT aerofoil wing blade
    addBox(-21, 18, 23, -19, 23, 34); // Left wing endplate
    addBox(19, 18, 23, 21, 23, 34); // Right wing endplate

    // 5. Dual Aerodynamic Side Mirrors
    addBox(-18, 12, -7, -13, 14, -4);
    addBox(13, 12, -7, 18, 14, -4);

    // 6. LED Headlights & Full-Width Taillight Bar
    addBox(-14, 6, -35, -8, 9, -32); // Left twin LED headlight
    addBox(8, 6, -35, 14, 9, -32); // Right twin LED headlight
    addBox(-16, 6, 32, 16, 9, 35); // Full-width rear racing LED lightbar

    // 7. Quad Exhaust Tips
    addBox(-6, 3, 33, -3, 6, 37); // Left exhaust
    addBox(3, 3, 33, 6, 6, 37); // Right exhaust

    // 8. Wide Racing Wheels & Performance Tires
    addBox(-20, 0, -26, -15, 10, -14); // Front Left Wheel
    addBox(15, 0, -26, 20, 10, -14); // Front Right Wheel
    addBox(-21, 0, 14, -15, 11, 28); // Rear Left Performance Wheel
    addBox(15, 0, 14, 21, 11, 28); // Rear Right Performance Wheel

    // Alloy Rim Highlights
    addBox(-20.5, 2, -23, -19.5, 8, -17);
    addBox(19.5, 2, -23, 20.5, 8, -17);
    addBox(-21.5, 2, 17, -20.5, 9, 25);
    addBox(20.5, 2, 17, 21.5, 9, 25);

    return meshFrom(positions, normals, uvs, indices);
};

const tree = () => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const addBox = (minX, minY, minZ, maxX, maxY, maxZ) => {
        const faces = [
            {n: [0, 0, 1], verts: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]]},
            {n: [0, 0, -1], verts: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]]},
            {n: [1, 0, 0], verts: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]]},
            {n: [-1, 0, 0], verts: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]]},
            {n: [0, 1, 0], verts: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]]},
            {n: [0, -1, 0], verts: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]]}
        ];
        faces.forEach(face => {
            const vs = face.verts.map(v => ({p: [v[0], v[1], v[2]], n: face.n, uv: [0.5, 0.5]}));
            pushTri(positions, normals, uvs, indices, vs[0], vs[1], vs[2]);
            pushTri(positions, normals, uvs, indices, vs[0], vs[2], vs[3]);
        });
    };
    const addCone = (baseY, topY, radius, segs = 8) => {
        for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const x0 = Math.sin(a0) * radius; const z0 = Math.cos(a0) * radius;
            const x1 = Math.sin(a1) * radius; const z1 = Math.cos(a1) * radius;
            const tip = {p: [0, topY, 0], uv: [0.5, 1]};
            const v0 = {p: [x0, baseY, z0], uv: [0, 0]};
            const v1 = {p: [x1, baseY, z1], uv: [1, 0]};
            pushTri(positions, normals, uvs, indices, tip, v0, v1);
            // bottom cap
            const bot = {p: [0, baseY, 0], uv: [0.5, 0]};
            pushTri(positions, normals, uvs, indices, bot, v1, v0);
        }
    };
    // Trunk
    addBox(-3, 0, -3, 3, 16, 3);
    // 3-tiered pine foliage
    addCone(12, 38, 22);
    addCone(26, 52, 17);
    addCone(40, 66, 12);
    return meshFrom(positions, normals, uvs, indices);
};

const mountain = () => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const segs = 7;
    const baseR = 120;
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const r0 = baseR * (0.85 + (0.3 * Math.sin(i * 2.3)));
        const r1 = baseR * (0.85 + (0.3 * Math.sin((i + 1) * 2.3)));
        const x0 = Math.sin(a0) * r0; const z0 = Math.cos(a0) * r0;
        const x1 = Math.sin(a1) * r1; const z1 = Math.cos(a1) * r1;
        const peak = {p: [0, 95, 0], uv: [0.5, 1]};
        const v0 = {p: [x0, 0, z0], uv: [0, 0]};
        const v1 = {p: [x1, 0, z1], uv: [1, 0]};
        pushTri(positions, normals, uvs, indices, peak, v0, v1);
    }
    return meshFrom(positions, normals, uvs, indices);
};

const coin = () => {
    const positions = []; const normals = []; const uvs = []; const indices = [];
    const segs = 16;
    const r = 8;
    const thickness = 2.6;
    const halfT = thickness / 2;
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0); const s0 = Math.sin(a0);
        const c1 = Math.cos(a1); const s1 = Math.sin(a1);
        const x0 = c0 * r; const y0 = s0 * r;
        const x1 = c1 * r; const y1 = s1 * r;
        // Outer rim quad
        const n0 = [c0, y0 / r, 0];
        const n1 = [c1, y1 / r, 0];
        const r0Top = {p: [x0, y0, halfT], n: n0, uv: [i / segs, 1]};
        const r1Top = {p: [x1, y1, halfT], n: n1, uv: [(i + 1) / segs, 1]};
        const r0Bot = {p: [x0, y0, -halfT], n: n0, uv: [i / segs, 0]};
        const r1Bot = {p: [x1, y1, -halfT], n: n1, uv: [(i + 1) / segs, 0]};
        pushTri(positions, normals, uvs, indices, r0Top, r1Top, r1Bot);
        pushTri(positions, normals, uvs, indices, r0Top, r1Bot, r0Bot);
        // Front face
        const fCenter = {p: [0, 0, halfT], n: [0, 0, 1], uv: [0.5, 0.5]};
        const f0 = {p: [x0, y0, halfT], n: [0, 0, 1], uv: [0.5 + (c0 * 0.48), 0.5 + (s0 * 0.48)]};
        const f1 = {p: [x1, y1, halfT], n: [0, 0, 1], uv: [0.5 + (c1 * 0.48), 0.5 + (s1 * 0.48)]};
        pushTri(positions, normals, uvs, indices, fCenter, f0, f1);
        // Back face
        const bCenter = {p: [0, 0, -halfT], n: [0, 0, -1], uv: [0.5, 0.5]};
        const b0 = {p: [x0, y0, -halfT], n: [0, 0, -1], uv: [0.5 + (c0 * 0.48), 0.5 + (s0 * 0.48)]};
        const b1 = {p: [x1, y1, -halfT], n: [0, 0, -1], uv: [0.5 + (c1 * 0.48), 0.5 + (s1 * 0.48)]};
        pushTri(positions, normals, uvs, indices, bCenter, b1, b0);
    }
    return meshFrom(positions, normals, uvs, indices);
};

const PRIMITIVE_BUILDERS = {
    cube,
    box: cube,
    sphere,
    plane,
    cylinder,
    cone,
    pyramid,
    torus,
    donut: torus,
    car,
    tree,
    mountain,
    coin
};

const getPrimitive = name => {
    const key = String(name || 'cube').toLowerCase();
    const builder = PRIMITIVE_BUILDERS[key];
    return builder ? builder() : cube();
};

const primitiveNames = () => Object.keys(PRIMITIVE_BUILDERS).filter(n => n !== 'box' && n !== 'donut');

module.exports = {
    SIZE,
    cube,
    plane,
    sphere,
    cylinder,
    cone,
    pyramid,
    torus,
    car,
    tree,
    mountain,
    coin,
    getPrimitive,
    primitiveNames,
    meshFrom
};
