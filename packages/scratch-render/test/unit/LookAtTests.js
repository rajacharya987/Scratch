const {test} = require('tap');
const {create, lookAt} = require('../../src/unified/math3d');
const {sphere} = require('../../src/unified/primitives');

const col0 = m => [m[0], m[4], m[8]];
const col1 = m => [m[1], m[5], m[9]];
const col2 = m => [m[2], m[6], m[10]];
const hypot3 = v => Math.hypot(v[0], v[1], v[2]);

test('lookAt from directly above keeps a right-handed view', t => {
    const m = lookAt(create(), [0, 400, 0], [0, 0, 0], [0, 1, 0]);
    const right = col0(m);
    const up = col1(m);
    const back = col2(m);
    t.ok(hypot3(right) > 0.9, 'right axis is not collapsed');
    t.ok(hypot3(up) > 0.9, 'up axis is not collapsed');
    t.ok(back[1] > 0.9, 'camera back points along +Y');
    t.ok(right[0] > 0.9, '+X stays to the right');
    const det =
        (right[0] * ((up[1] * back[2]) - (up[2] * back[1]))) -
        (right[1] * ((up[0] * back[2]) - (up[2] * back[0]))) +
        (right[2] * ((up[0] * back[1]) - (up[1] * back[0])));
    t.ok(det > 0.9, 'view basis is right-handed so faces are not inside-out');
    t.end();
});

test('lookAt from the side still uses the given up vector', t => {
    const m = lookAt(create(), [0, 70, 320], [0, 10, 0], [0, 1, 0]);
    t.ok(col1(m)[1] > 0.7);
    t.end();
});

test('sphere pole triangles face outward so the top is closed', t => {
    const mesh = sphere();
    const p = mesh.positions;
    const nrm = (ia, ib, ic) => {
        const ax = p[ia * 3]; const ay = p[(ia * 3) + 1]; const az = p[(ia * 3) + 2];
        const bx = p[ib * 3]; const by = p[(ib * 3) + 1]; const bz = p[(ib * 3) + 2];
        const cx = p[ic * 3]; const cy = p[(ic * 3) + 1]; const cz = p[(ic * 3) + 2];
        const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
        const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
        return [
            (e1y * e2z) - (e1z * e2y),
            (e1z * e2x) - (e1x * e2z),
            (e1x * e2y) - (e1y * e2x)
        ];
    };
    const n = nrm(mesh.indices[0], mesh.indices[1], mesh.indices[2]);
    t.ok(n[1] > 0, 'north-cap winding points +Y');
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) {
        minY = Math.min(minY, p[i]);
        maxY = Math.max(maxY, p[i]);
    }
    t.ok(maxY > 24 && minY < -24);
    t.end();
});
