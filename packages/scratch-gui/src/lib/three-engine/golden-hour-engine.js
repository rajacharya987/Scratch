import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/* =========================================================================
   1. MATH & PROCEDURAL ROAD GEOMETRY
   ========================================================================= */
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const lerp = (a, b, t) => a + (b - a) * t;

const ROAD_HALF = 4.6;
const ROAD_BOUNDARY = 5.0; // Hard boundary collision limit in meters
const MARK_TILE = 16;

const RD = {
    step: 3,
    half: ROAD_HALF,
    verge: 6.5,
    apron: 20,
    behind: 300,
    ahead: 900
};

function curvatureAt(s) {
    return 0.00268 * Math.sin(s * 0.001710)
         + 0.00162 * Math.sin(s * 0.004170 + 2.10)
         + 0.00091 * Math.sin(s * 0.009540 + 4.30);
}

function elevAt(s) {
    return 18.0 * Math.sin(s * 0.001130 + 0.70)
         + 9.5 * Math.sin(s * 0.002690 + 2.90)
         + 3.8 * Math.sin(s * 0.006310 + 1.10);
}

function bankAt(k) {
    return -clamp(k * 8.2, -0.15, 0.15);
}

/* =========================================================================
   2. TEXTURES & MATERIALS
   ========================================================================= */
function createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Asphalt base
    ctx.fillStyle = '#222328';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grain
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 4000; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Edge lines
    ctx.fillStyle = 'rgba(235, 235, 225, 0.9)';
    ctx.fillRect(35, 0, 10, 512);
    ctx.fillRect(467, 0, 10, 512);

    // Dashed center line
    ctx.fillStyle = 'rgba(235, 235, 225, 0.9)';
    for (let y = 0; y < 512; y += 64) {
        ctx.fillRect(251, y, 10, 36);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
}

function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a5832';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(30, 40, 20, 0.2)';
    for (let i = 0; i < 1500; i++) {
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(60, 60);
    return texture;
}

/* =========================================================================
   3. PROCEDURAL 3D SPORTS CAR
   ========================================================================= */
function buildCarMesh() {
    const carRoot = new THREE.Group();

    // Chassis body
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xd63b3b,
        metalness: 0.7,
        roughness: 0.25
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x181a1f,
        roughness: 0.5
    });
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x223344,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.85
    });

    // Lower body
    const baseGeo = new THREE.BoxGeometry(1.85, 0.45, 4.2);
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = 0.45;
    base.castShadow = true;
    carRoot.add(base);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.45, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.85, -0.2);
    cabin.castShadow = true;
    carRoot.add(cabin);

    // Roof
    const roofGeo = new THREE.BoxGeometry(1.35, 0.08, 1.4);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.1, -0.2);
    carRoot.add(roof);

    // Headlights
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), headMat);
    headL.position.set(-0.65, 0.52, 2.1);
    const headR = headL.clone();
    headR.position.x = 0.65;
    carRoot.add(headL, headR);

    // Taillights
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1515 });
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.1), tailMat);
    tailL.position.set(-0.65, 0.55, -2.1);
    const tailR = tailL.clone();
    tailR.position.x = 0.65;
    carRoot.add(tailL, tailR);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 20);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelPositions = [
        [-0.95, 0.36, 1.35],
        [0.95, 0.36, 1.35],
        [-0.95, 0.36, -1.35],
        [0.95, 0.36, -1.35]
    ];
    const wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, darkMat);
        wheel.position.set(...pos);
        wheel.castShadow = true;
        carRoot.add(wheel);
        wheels.push(wheel);
    });

    return { carRoot, wheels };
}

/* =========================================================================
   4. GOLDEN HOUR THREE.JS ENGINE CLASS
   ========================================================================= */
export class GoldenHourEngine {
    constructor() {
        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.composer = null;
        this.running = false;
        this.animId = null;

        // Path integration state
        this.path = {
            s: [], x: [], z: [], y: [], h: [], k: [], b: [],
            headS: 0, headX: 0, headZ: 0, headH: 0
        };

        // Vehicle physics state
        this.car = {
            s: 0,
            n: 0,
            yaw: 0,
            vLong: 0,
            vLat: 0,
            omega: 0,
            steer: 0,
            rpm: 900,
            dist: 0,
            boost: 1.0,
            y: 0.5
        };

        // Input state
        this.keys = {};
        this.input = { th: 0, br: 0, st: 0, boost: false };

        this.roadMesh = null;
        this.groundMesh = null;
        this.carMesh = null;
        this.lastTime = performance.now();

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    init(canvas, width = 480, height = 360) {
        if (this.renderer) this.dispose();
        this.canvas = canvas;

        // 1. Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // 2. Scene & Volumetric Sunset Fog
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xe8a86c, 0.0022);

        // 3. Camera
        this.camera = new THREE.PerspectiveCamera(54, width / height, 0.5, 3000);
        this.camera.position.set(0, 25, -50);

        // 4. Atmosphere & Golden Hour Sun
        const sky = new Sky();
        sky.scale.setScalar(450000);
        this.scene.add(sky);

        const sunUniforms = sky.material.uniforms;
        sunUniforms.turbidity.value = 8.5;
        sunUniforms.rayleigh.value = 2.2;
        sunUniforms.mieCoefficient.value = 0.005;
        sunUniforms.mieDirectionalG.value = 0.85;

        const sun = new THREE.Vector3();
        const phi = THREE.MathUtils.degToRad(86);
        const theta = THREE.MathUtils.degToRad(175);
        sun.setFromSphericalCoords(1, phi, theta);
        sunUniforms.sunPosition.value.copy(sun);

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffdfba, 0x443322, 0.85);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffbe76, 2.2);
        dirLight.position.set(200, 120, 300);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // 5. Post Processing Composer (Bloom)
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            0.65, // strength
            0.45, // radius
            0.85  // threshold
        );
        this.composer.addPass(bloomPass);

        // 6. Ground & Road
        this._buildGround();
        this._initPath();
        this._buildRoad();

        // 7. 3D Car
        const { carRoot, wheels } = buildCarMesh();
        this.carMesh = carRoot;
        this.wheels = wheels;
        this.scene.add(this.carMesh);

        // Event listeners
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);

        this.renderOnce();
    }

    _buildGround() {
        const groundGeo = new THREE.PlaneGeometry(3000, 3000, 32, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x5a6842,
            map: createGroundTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
        this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.position.y = -0.05;
        this.groundMesh.receiveShadow = true;
        this.scene.add(this.groundMesh);
    }

    _initPath() {
        this.path.s.length = 0;
        this.path.x.length = 0;
        this.path.z.length = 0;
        this.path.y.length = 0;
        this.path.h.length = 0;

        let s = -RD.behind, x = 0, z = 0, h = 0;
        const total = Math.round((RD.ahead + RD.behind) / RD.step);
        for (let i = 0; i <= total; i++) {
            const ss = s + i * RD.step;
            const k = curvatureAt(ss);
            h += k * RD.step;
            x += Math.sin(h) * RD.step;
            z += Math.cos(h) * RD.step;
            this.path.s.push(ss);
            this.path.x.push(x);
            this.path.z.push(z);
            this.path.y.push(elevAt(ss));
            this.path.h.push(h);
        }
        this.path.headS = s + total * RD.step;
        this.path.headX = x;
        this.path.headZ = z;
        this.path.headH = h;
    }

    _frameAt(s) {
        const s0 = this.path.s[0] || 0;
        let i = Math.floor((s - s0) / RD.step);
        i = clamp(i, 0, this.path.s.length - 2);
        const t = clamp((s - this.path.s[i]) / RD.step, 0, 1);
        return {
            x: lerp(this.path.x[i], this.path.x[i + 1], t),
            y: lerp(this.path.y[i], this.path.y[i + 1], t),
            z: lerp(this.path.z[i], this.path.z[i + 1], t),
            h: lerp(this.path.h[i], this.path.h[i + 1], t)
        };
    }

    _buildRoad() {
        const segments = 240;
        const widthHalf = ROAD_HALF;
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const s = this.car.s - 60 + i * (RD.ahead / segments);
            const f = this._frameAt(s);
            const cs = Math.cos(f.h), sn = Math.sin(f.h);

            // Left vertex
            positions.push(f.x - cs * widthHalf, f.y + 0.02, f.z + sn * widthHalf);
            uvs.push(0, s / MARK_TILE);

            // Right vertex
            positions.push(f.x + cs * widthHalf, f.y + 0.02, f.z - sn * widthHalf);
            uvs.push(1, s / MARK_TILE);

            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const roadGeo = new THREE.BufferGeometry();
        roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        roadGeo.setIndex(indices);
        roadGeo.computeVertexNormals();

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: createRoadTexture(),
            roughness: 0.85,
            metalness: 0.1
        });

        if (this.roadMesh) this.scene.remove(this.roadMesh);
        this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
        this.roadMesh.receiveShadow = true;
        this.scene.add(this.roadMesh);
    }

    _onKeyDown(e) {
        this.keys[e.code] = true;
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        if (!this.animId) this._tick();
    }

    stop() {
        this.running = false;
        this.car.vLong = 0;
        this.car.vLat = 0;
        this.car.omega = 0;
        this.car.steer = 0;
        for (const k in this.keys) this.keys[k] = false;
        this.input.th = 0;
        this.input.br = 0;
        this.input.st = 0;
        this.renderOnce();
    }

    _tick() {
        if (!this.running) {
            this.animId = null;
            return;
        }
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        this._updatePhysics(dt);
        this._updateRoadStreaming();
        this._renderFrame();

        this.animId = requestAnimationFrame(() => this._tick());
    }

    _updatePhysics(dt) {
        const k = this.keys;
        const up = k['KeyW'] || k['ArrowUp'];
        const down = k['KeyS'] || k['ArrowDown'];
        const left = k['KeyA'] || k['ArrowLeft'];
        const right = k['KeyD'] || k['ArrowRight'];
        const boostKey = k['ShiftLeft'] || k['ShiftRight'] || k['Space'];

        this.input.th = lerp(this.input.th, up ? 1 : 0, 10 * dt);
        this.input.br = lerp(this.input.br, down ? 1 : 0, 12 * dt);
        const steerTarget = (left ? 1 : 0) + (right ? -1 : 0);
        this.input.st = lerp(this.input.st, steerTarget, 14 * dt);
        this.input.boost = boostKey && this.car.boost > 0.05;

        // Acceleration & braking
        const topSpeed = this.input.boost ? 85 : 65; // m/s (~230 km/h)
        const accelRate = (this.input.boost ? 22 : 14) * this.input.th;
        const brakeRate = 28 * this.input.br;
        const drag = 0.35 * Math.sign(this.car.vLong);

        this.car.vLong += (accelRate - brakeRate - drag) * dt;
        if (!up && !down) this.car.vLong *= Math.pow(0.96, dt * 60);
        this.car.vLong = clamp(this.car.vLong, 0, topSpeed);

        if (this.input.boost) {
            this.car.boost = Math.max(0, this.car.boost - dt * 0.25);
        } else {
            this.car.boost = Math.min(1.0, this.car.boost + dt * 0.1);
        }

        // Steering & yaw
        const steerAngle = this.input.st * 0.48;
        this.car.steer = lerp(this.car.steer, steerAngle, 12 * dt);
        this.car.omega = this.car.steer * (this.car.vLong * 0.08);

        // Move along road frame
        const cy = Math.cos(this.car.yaw), sy = Math.sin(this.car.yaw);
        const ds = (this.car.vLong * cy - this.car.vLat * sy) * dt;
        const dn = (this.car.vLong * sy + this.car.vLat * cy) * dt;
        const kap = curvatureAt(this.car.s);

        this.car.s += ds;
        this.car.n += dn;
        this.car.yaw += this.car.omega * dt - kap * ds;
        this.car.yaw = Math.atan2(Math.sin(this.car.yaw), Math.cos(this.car.yaw));
        this.car.dist += Math.abs(ds);
        this.car.rpm = 900 + this.car.vLong * 95;

        // --- Road Edge Boundary Collision ---
        const nAbs = Math.abs(this.car.n);
        if (nAbs >= ROAD_BOUNDARY) {
            const sign = Math.sign(this.car.n) || 1;
            this.car.n = sign * ROAD_BOUNDARY;
            if ((sign > 0 && this.car.vLat > 0) || (sign < 0 && this.car.vLat < 0)) {
                this.car.vLat = -this.car.vLat * 0.45;
            }
            this.car.vLong *= 0.88;
            this.car.omega *= 0.35;
            this.car.yaw = lerp(this.car.yaw, 0, Math.min(1, 16 * dt));
        }

        // Wheel spin animation
        if (this.wheels) {
            this.wheels.forEach((w, idx) => {
                w.rotation.x += this.car.vLong * dt * 2.8;
                if (idx < 2) w.rotation.y = this.car.steer * 0.75;
            });
        }
    }

    _updateRoadStreaming() {
        if (this.car.s > this.path.headS - 600) {
            let s = this.path.headS;
            let x = this.path.headX;
            let z = this.path.headZ;
            let h = this.path.headH;
            for (let i = 0; i < 80; i++) {
                s += RD.step;
                const k = curvatureAt(s);
                h += k * RD.step;
                x += Math.sin(h) * RD.step;
                z += Math.cos(h) * RD.step;
                this.path.s.push(s);
                this.path.x.push(x);
                this.path.z.push(z);
                this.path.y.push(elevAt(s));
                this.path.h.push(h);
            }
            this.path.headS = s;
            this.path.headX = x;
            this.path.headZ = z;
            this.path.headH = h;
            this._buildRoad();
        }
    }

    _renderFrame() {
        const f = this._frameAt(this.car.s);
        const cs = Math.cos(f.h), sn = Math.sin(f.h);
        const carWorldX = f.x + cs * this.car.n;
        const carWorldZ = f.z - sn * this.car.n;
        const carWorldY = f.y + 0.05;

        // Position car
        if (this.carMesh) {
            this.carMesh.position.set(carWorldX, carWorldY, carWorldZ);
            this.carMesh.rotation.set(0, f.h + this.car.yaw + Math.PI, 0);
        }

        // Dynamic Chase Camera
        const camDistance = 14.5;
        const camHeight = 4.8;
        const heading = f.h + this.car.yaw;
        const camX = carWorldX - Math.sin(heading) * camDistance;
        const camZ = carWorldZ - Math.cos(heading) * camDistance;
        const camY = carWorldY + camHeight;

        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(carWorldX, carWorldY + 1.2, carWorldZ);

        // Render pass
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    renderOnce() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this._renderFrame();
    }

    resize(width, height) {
        if (!this.renderer || !this.camera || !this.composer) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height);
        this.renderOnce();
    }

    getTelemetry() {
        return {
            speedKmh: Math.round(this.car.vLong * 3.6),
            rpm: Math.round(this.car.rpm),
            distKm: (this.car.dist / 1000).toFixed(2),
            boost: this.car.boost
        };
    }

    dispose() {
        this.stop();
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
    }
}
