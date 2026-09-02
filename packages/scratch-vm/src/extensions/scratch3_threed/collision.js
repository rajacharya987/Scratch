/**
 * Axis-aligned 3D collision for Scratch sprites.
 * Extents are in Scratch units; a default cube is 50 on a side.
 */

const HALF = {
    cube: [25, 25, 25],
    box: [25, 25, 25],
    sphere: [25, 25, 25],
    plane: [200, 1, 200],
    cylinder: [25, 25, 25],
    cone: [25, 25, 25],
    pyramid: [25, 25, 25],
    torus: [28, 9, 28],
    donut: [28, 9, 28],
    car: [25, 12, 30]
};

const halfExtents = target => {
    const size = (Number(target.size) || 100) / 100;
    const sx = Math.abs(Number(target.scaleX) || 1) * size;
    const sy = Math.abs(Number(target.scaleY) || 1) * size;
    const sz = Math.abs(Number(target.scaleZ) || 1) * size;
    const key = String(target.mesh || 'cube').toLowerCase();
    const h = HALF[key] || HALF.cube;
    return [h[0] * sx, h[1] * sy, h[2] * sz];
};

const aabbOverlap = (a, b) => {
    const ha = halfExtents(a);
    const hb = halfExtents(b);
    return Math.abs(a.x - b.x) < (ha[0] + hb[0]) &&
        Math.abs(a.y - b.y) < (ha[1] + hb[1]) &&
        Math.abs((a.z || 0) - (b.z || 0)) < (ha[2] + hb[2]);
};

const touchingGround = target => {
    const hy = halfExtents(target)[1];
    return (target.y - hy) <= 1;
};

const visibleTargets = (runtime, predicate) => {
    const list = (runtime && runtime.targets) || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t || t.isStage || t.visible === false) continue;
        if (predicate && !predicate(t)) continue;
        out.push(t);
    }
    return out;
};

const namedTargets = (runtime, name) => {
    const n = String(name);
    return visibleTargets(runtime, t => t.sprite && t.sprite.name === n);
};

const firstOverlapping = (self, others) => {
    for (let i = 0; i < others.length; i++) {
        const other = others[i];
        if (other === self) continue;
        if (aabbOverlap(self, other)) return other;
    }
    return null;
};

const pushOut = (self, other) => {
    const ha = halfExtents(self);
    const hb = halfExtents(other);
    const dx = self.x - other.x;
    const dy = self.y - other.y;
    const dz = (self.z || 0) - (other.z || 0);
    const ox = (ha[0] + hb[0]) - Math.abs(dx);
    const oy = (ha[1] + hb[1]) - Math.abs(dy);
    const oz = (ha[2] + hb[2]) - Math.abs(dz);
    if (ox <= 0 || oy <= 0 || oz <= 0) return false;
    if (ox <= oy && ox <= oz) {
        self.x = other.x + (dx >= 0 ? (ha[0] + hb[0]) : (ha[0] + hb[0]));
    } else if (oy <= ox && oy <= oz) {
        self.y = other.y + (dy >= 0 ? (ha[1] + hb[1]) : (ha[1] + hb[1]));
    } else {
        self.z = (other.z || 0) + (dz >= 0 ? (ha[2] + hb[2]) : (ha[2] + hb[2]));
    }
    return true;
};

module.exports = {
    HALF,
    halfExtents,
    aabbOverlap,
    touchingGround,
    visibleTargets,
    namedTargets,
    firstOverlapping,
    pushOut
};
