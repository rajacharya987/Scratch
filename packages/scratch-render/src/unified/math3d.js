/**
 * Column-major 4x4 / vec3 math for the unified 2D/3D renderer.
 * Scratch space: X right, Y up, Z toward the default camera (out of the 2D plane).
 */

const EPSILON = 1e-6;

const create = () => new Float32Array(16);

const identity = (out = create()) => {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
};

const copy = (out, a) => {
    out.set(a);
    return out;
};

const multiply = (out, a, b) => {
    const a00 = a[0]; const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
    const a10 = a[4]; const a11 = a[5]; const a12 = a[6]; const a13 = a[7];
    const a20 = a[8]; const a21 = a[9]; const a22 = a[10]; const a23 = a[11];
    const a30 = a[12]; const a31 = a[13]; const a32 = a[14]; const a33 = a[15];

    let b0 = b[0]; let b1 = b[1]; let b2 = b[2]; let b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
};

const perspective = (out, fovy, aspect, near, far) => {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[11] = -1; out[15] = 0;
    if (far !== Infinity && far !== undefined) {
        const nf = 1 / (near - far);
        out[10] = (far + near) * nf;
        out[14] = 2 * far * near * nf;
    } else {
        out[10] = -1;
        out[14] = -2 * near;
    }
    out[12] = 0; out[13] = 0;
    return out;
};

const ortho = (out, left, right, bottom, top, near, far) => {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};

const lookAt = (out, eye, center, up) => {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz);
    if (len < EPSILON) {
        return identity(out);
    }
    zx /= len; zy /= len; zz /= len;

    let xx = (up[1] * zz) - (up[2] * zy);
    let xy = (up[2] * zx) - (up[0] * zz);
    let xz = (up[0] * zy) - (up[1] * zx);
    len = Math.hypot(xx, xy, xz);
    if (len < EPSILON) {
        const altUp = Math.abs(zy) > 0.9 ? [0, 0, -1] : [0, 1, 0];
        xx = (altUp[1] * zz) - (altUp[2] * zy);
        xy = (altUp[2] * zx) - (altUp[0] * zz);
        xz = (altUp[0] * zy) - (altUp[1] * zx);
        len = Math.hypot(xx, xy, xz);
    }
    if (len < EPSILON) {
        xx = 1; xy = 0; xz = 0;
    } else {
        xx /= len; xy /= len; xz /= len;
    }

    const yx = (zy * xz) - (zz * xy);
    const yy = (zz * xx) - (zx * xz);
    const yz = (zx * xy) - (zy * xx);

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -((xx * eye[0]) + (xy * eye[1]) + (xz * eye[2]));
    out[13] = -((yx * eye[0]) + (yy * eye[1]) + (yz * eye[2]));
    out[14] = -((zx * eye[0]) + (zy * eye[1]) + (zz * eye[2]));
    out[15] = 1;
    return out;
};

const translate = (out, a, v) => {
    const x = v[0]; const y = v[1]; const z = v[2];
    if (a !== out) copy(out, a);
    out[12] = (a[0] * x) + (a[4] * y) + (a[8] * z) + a[12];
    out[13] = (a[1] * x) + (a[5] * y) + (a[9] * z) + a[13];
    out[14] = (a[2] * x) + (a[6] * y) + (a[10] * z) + a[14];
    out[15] = (a[3] * x) + (a[7] * y) + (a[11] * z) + a[15];
    return out;
};

const scale = (out, a, v) => {
    const x = v[0]; const y = v[1]; const z = v[2];
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
};

const rotateX = (out, a, rad) => {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a10 = a[4]; const a11 = a[5]; const a12 = a[6]; const a13 = a[7];
    const a20 = a[8]; const a21 = a[9]; const a22 = a[10]; const a23 = a[11];
    if (a !== out) {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[4] = (a10 * c) + (a20 * s);
    out[5] = (a11 * c) + (a21 * s);
    out[6] = (a12 * c) + (a22 * s);
    out[7] = (a13 * c) + (a23 * s);
    out[8] = (a20 * c) - (a10 * s);
    out[9] = (a21 * c) - (a11 * s);
    out[10] = (a22 * c) - (a12 * s);
    out[11] = (a23 * c) - (a13 * s);
    return out;
};

const rotateY = (out, a, rad) => {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = a[0]; const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
    const a20 = a[8]; const a21 = a[9]; const a22 = a[10]; const a23 = a[11];
    if (a !== out) {
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[0] = (a00 * c) - (a20 * s);
    out[1] = (a01 * c) - (a21 * s);
    out[2] = (a02 * c) - (a22 * s);
    out[3] = (a03 * c) - (a23 * s);
    out[8] = (a00 * s) + (a20 * c);
    out[9] = (a01 * s) + (a21 * c);
    out[10] = (a02 * s) + (a22 * c);
    out[11] = (a03 * s) + (a23 * c);
    return out;
};

const rotateZ = (out, a, rad) => {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = a[0]; const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
    const a10 = a[4]; const a11 = a[5]; const a12 = a[6]; const a13 = a[7];
    if (a !== out) {
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[0] = (a00 * c) + (a10 * s);
    out[1] = (a01 * c) + (a11 * s);
    out[2] = (a02 * c) + (a12 * s);
    out[3] = (a03 * c) + (a13 * s);
    out[4] = (a10 * c) - (a00 * s);
    out[5] = (a11 * c) - (a01 * s);
    out[6] = (a12 * c) - (a02 * s);
    out[7] = (a13 * c) - (a03 * s);
    return out;
};

/**
 * Scratch / Blender-style XYZ euler, degrees. Applied as Z then Y then X (intrinsic).
 * @param out
 * @param position
 * @param rotationDeg
 * @param scaleVec
 */
const fromTransform = (out, position, rotationDeg, scaleVec) => {
    identity(out);
    translate(out, out, position);
    rotateY(out, out, rotationDeg[1] * Math.PI / 180);
    rotateX(out, out, rotationDeg[0] * Math.PI / 180);
    rotateZ(out, out, rotationDeg[2] * Math.PI / 180);
    scale(out, out, scaleVec);
    return out;
};

const invert = (out, a) => {
    const a00 = a[0]; const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
    const a10 = a[4]; const a11 = a[5]; const a12 = a[6]; const a13 = a[7];
    const a20 = a[8]; const a21 = a[9]; const a22 = a[10]; const a23 = a[11];
    const a30 = a[12]; const a31 = a[13]; const a32 = a[14]; const a33 = a[15];

    const b00 = (a00 * a11) - (a01 * a10);
    const b01 = (a00 * a12) - (a02 * a10);
    const b02 = (a00 * a13) - (a03 * a10);
    const b03 = (a01 * a12) - (a02 * a11);
    const b04 = (a01 * a13) - (a03 * a11);
    const b05 = (a02 * a13) - (a03 * a12);
    const b06 = (a20 * a31) - (a21 * a30);
    const b07 = (a20 * a32) - (a22 * a30);
    const b08 = (a20 * a33) - (a23 * a30);
    const b09 = (a21 * a32) - (a22 * a31);
    const b10 = (a21 * a33) - (a23 * a31);
    const b11 = (a22 * a33) - (a23 * a32);

    let det = (b00 * b11) - (b01 * b10) + (b02 * b09) + (b03 * b08) - (b04 * b07) + (b05 * b06);
    if (!det) return null;
    det = 1.0 / det;

    out[0] = ((a11 * b11) - (a12 * b10) + (a13 * b09)) * det;
    out[1] = ((a02 * b10) - (a01 * b11) - (a03 * b09)) * det;
    out[2] = ((a31 * b05) - (a32 * b04) + (a33 * b03)) * det;
    out[3] = ((a22 * b04) - (a21 * b05) - (a23 * b03)) * det;
    out[4] = ((a12 * b08) - (a10 * b11) - (a13 * b07)) * det;
    out[5] = ((a00 * b11) - (a02 * b08) + (a03 * b07)) * det;
    out[6] = ((a32 * b02) - (a30 * b05) - (a33 * b01)) * det;
    out[7] = ((a20 * b05) - (a22 * b02) + (a23 * b01)) * det;
    out[8] = ((a10 * b10) - (a11 * b08) + (a13 * b06)) * det;
    out[9] = ((a01 * b08) - (a00 * b10) - (a03 * b06)) * det;
    out[10] = ((a30 * b04) - (a31 * b02) + (a33 * b00)) * det;
    out[11] = ((a21 * b02) - (a20 * b04) - (a23 * b00)) * det;
    out[12] = ((a11 * b07) - (a10 * b09) - (a12 * b06)) * det;
    out[13] = ((a00 * b09) - (a01 * b07) + (a02 * b06)) * det;
    out[14] = ((a31 * b01) - (a30 * b03) - (a32 * b00)) * det;
    out[15] = ((a20 * b03) - (a21 * b01) + (a22 * b00)) * det;
    return out;
};

const transpose = (out, a) => {
    if (out === a) {
        const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
        const a12 = a[6]; const a13 = a[7]; const a23 = a[11];
        out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a01; out[6] = a[9]; out[7] = a[13];
        out[8] = a02; out[9] = a12; out[11] = a[14];
        out[12] = a03; out[13] = a13; out[14] = a23;
    } else {
        out[0] = a[0]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a[1]; out[5] = a[5]; out[6] = a[9]; out[7] = a[13];
        out[8] = a[2]; out[9] = a[6]; out[10] = a[10]; out[11] = a[14];
        out[12] = a[3]; out[13] = a[7]; out[14] = a[11]; out[15] = a[15];
    }
    return out;
};

const normalMatrix = (out, model) => {
    const inv = invert(create(), model);
    if (!inv) return identity(out);
    return transpose(out, inv);
};

const vec3Normalize = (out, v) => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    out[0] = v[0] / len; out[1] = v[1] / len; out[2] = v[2] / len;
    return out;
};

const vec3Sub = (out, a, b) => {
    out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
    return out;
};

const vec3Add = (out, a, b) => {
    out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
    return out;
};

const vec3Scale = (out, a, s) => {
    out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s;
    return out;
};

const vec3Cross = (out, a, b) => {
    const ax = a[0]; const ay = a[1]; const az = a[2];
    const bx = b[0]; const by = b[1]; const bz = b[2];
    out[0] = (ay * bz) - (az * by);
    out[1] = (az * bx) - (ax * bz);
    out[2] = (ax * by) - (ay * bx);
    return out;
};

const vec3Dot = (a, b) => (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);

const vec3Length = v => Math.hypot(v[0], v[1], v[2]);

/**
 * Rotate a local-space offset (typically 0,0,-1) by yaw/pitch/roll degrees.
 * @param out
 * @param rotationDeg
 */
const eulerForward = (out, rotationDeg) => {
    const rx = rotationDeg[0] * Math.PI / 180;
    const ry = rotationDeg[1] * Math.PI / 180;
    // Default facing: down -Z, matching a camera looking at the origin from +Z.
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    out[0] = sinY * cosX;
    out[1] = -sinX;
    out[2] = -cosY * cosX;
    return vec3Normalize(out, out);
};

const transformPoint = (out, m, v) => {
    const x = v[0]; const y = v[1]; const z = v[2];
    const w = (m[3] * x) + (m[7] * y) + (m[11] * z) + m[15] || 1;
    out[0] = ((m[0] * x) + (m[4] * y) + (m[8] * z) + m[12]) / w;
    out[1] = ((m[1] * x) + (m[5] * y) + (m[9] * z) + m[13]) / w;
    out[2] = ((m[2] * x) + (m[6] * y) + (m[10] * z) + m[14]) / w;
    return out;
};

const hexToRgb = hex => {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ?
        h.split('').map(c => c + c)
            .join('') : h, 16);
    return [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255
    ];
};

module.exports = {
    create,
    identity,
    copy,
    multiply,
    perspective,
    ortho,
    lookAt,
    translate,
    scale,
    rotateX,
    rotateY,
    rotateZ,
    fromTransform,
    invert,
    transpose,
    normalMatrix,
    vec3Normalize,
    vec3Sub,
    vec3Add,
    vec3Scale,
    vec3Cross,
    vec3Dot,
    vec3Length,
    eulerForward,
    transformPoint,
    hexToRgb
};
