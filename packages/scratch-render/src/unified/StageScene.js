/**
 * Unified stage scene: 2D objects, 3D objects, lights, camera, UI.
 * The Scratch Stage stays one Stage; this is the internal representation.
 */

const {hexToRgb} = require('./math3d');

const defaultMaterial = () => ({
    albedo: [0.55, 0.62, 0.95],
    metallic: 0.05,
    roughness: 0.45,
    emissive: 0,
    opacity: 1
});

const defaultCamera = () => ({
    position: [0, 70, 320],
    target: [0, 10, 0],
    up: [0, 1, 0],
    fov: 50,
    near: 1,
    far: 4000,
    followDrawableId: null,
    followOffset: [0, 90, 180],
    followHeading: false,
    followLookAhead: 0
});

// Nimo-style volumetric fog: height falloff + Henyey-Greenstein sun scatter.
const defaultFog = () => ({
    enabled: false,
    density: 0.0045,
    color: [0.58, 0.70, 0.90],
    height: 0,
    heightFalloff: 0.04,
    scattering: 0.85,
    g: 0.72,
    intensity: 0.55,
    maxDistance: 720,
    start: 50
});

const defaultSkyFx = () => ({
    sun: true,
    clouds: true,
    godRays: true,
    stars: true,
    cloudCoverage: 0.55,
    cloudDensity: 0.9,
    wind: 0.45,
    godRayIntensity: 0.6
});

class StageScene {
    constructor () {
        this.enabled = false;
        this.rayTracing = false;
        this.showGround = true;
        this.showSky = true;
        this.skyTop = [0.45, 0.68, 0.95];
        this.skyBottom = [0.85, 0.91, 0.98];
        this.groundColor = [0.22, 0.26, 0.32];
        this.camera = defaultCamera();
        this.ambient = [0.22, 0.24, 0.28];
        this.directional = {
            direction: [-0.45, -0.62, -0.38],
            color: [1, 0.96, 0.88],
            intensity: 1.4
        };
        this.pointLights = [];
        this.fog = defaultFog();
        this.skyFx = defaultSkyFx();
        /** @type {Map<number, object>} drawableID -> 3D object */
        this.objects = new Map();
        this.customMeshes = new Map();
        this.gizmoMode = 'move';
        this.pointer = {dx: 0, dy: 0, rightDown: false};
    }

    enable () {
        this.enabled = true;
    }

    disable () {
        this.enabled = false;
    }

    hasContent () {
        if (!this.enabled) return false;
        if (this.objects.size > 0) return true;
        return this.showGround || this.showSky;
    }

    reset () {
        this.enabled = false;
        this.rayTracing = false;
        this.showGround = true;
        this.showSky = true;
        this.skyTop = [0.45, 0.68, 0.95];
        this.skyBottom = [0.85, 0.91, 0.98];
        this.camera = defaultCamera();
        this.ambient = [0.22, 0.24, 0.28];
        this.directional = {
            direction: [-0.45, -0.62, -0.38],
            color: [1, 0.96, 0.88],
            intensity: 1.4
        };
        this.pointLights = [];
        this.fog = defaultFog();
        this.skyFx = defaultSkyFx();
        this.objects.clear();
        this.customMeshes.clear();
        this.gizmoMode = 'move';
        this.pointer = {dx: 0, dy: 0, rightDown: false};
    }

    orbitCamera (dx, dy) {
        const cam = this.camera;
        const ox = cam.position[0] - cam.target[0];
        const oy = cam.position[1] - cam.target[1];
        const oz = cam.position[2] - cam.target[2];
        const radius = Math.hypot(ox, oy, oz) || 1;
        let theta = Math.atan2(ox, oz);
        let phi = Math.acos(Math.max(-1, Math.min(1, oy / radius)));
        theta -= dx * 0.01;
        phi -= dy * 0.01;
        phi = Math.max(0.08, Math.min(Math.PI - 0.08, phi));
        cam.position = [
            cam.target[0] + (radius * Math.sin(phi) * Math.sin(theta)),
            cam.target[1] + (radius * Math.cos(phi)),
            cam.target[2] + (radius * Math.sin(phi) * Math.cos(theta))
        ];
        if (cam.followDrawableId != null) {
            cam.followOffset = [
                cam.position[0] - cam.target[0],
                cam.position[1] - cam.target[1],
                cam.position[2] - cam.target[2]
            ];
        }
        this.enable();
    }

    panCamera (dx, dy) {
        const cam = this.camera;
        const fx = cam.target[0] - cam.position[0];
        const fy = cam.target[1] - cam.position[1];
        const fz = cam.target[2] - cam.position[2];
        const fl = Math.hypot(fx, fy, fz) || 1;
        const f = [fx / fl, fy / fl, fz / fl];
        let rx = (f[1] * cam.up[2]) - (f[2] * cam.up[1]);
        let ry = (f[2] * cam.up[0]) - (f[0] * cam.up[2]);
        let rz = (f[0] * cam.up[1]) - (f[1] * cam.up[0]);
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        const ux = (ry * f[2]) - (rz * f[1]);
        const uy = (rz * f[0]) - (rx * f[2]);
        const uz = (rx * f[1]) - (ry * f[0]);
        const speed = fl * 0.0022;
        const mx = ((-dx * rx) + (dy * ux)) * speed;
        const my = ((-dx * ry) + (dy * uy)) * speed;
        const mz = ((-dx * rz) + (dy * uz)) * speed;
        cam.position = [cam.position[0] + mx, cam.position[1] + my, cam.position[2] + mz];
        cam.target = [cam.target[0] + mx, cam.target[1] + my, cam.target[2] + mz];
        this.enable();
    }

    zoomCamera (delta) {
        const cam = this.camera;
        const ox = cam.position[0] - cam.target[0];
        const oy = cam.position[1] - cam.target[1];
        const oz = cam.position[2] - cam.target[2];
        const factor = Math.exp(delta * 0.0012);
        const nx = ox * factor;
        const ny = oy * factor;
        const nz = oz * factor;
        const len = Math.hypot(nx, ny, nz);
        if (len < 25 || len > 2800) return;
        cam.position = [cam.target[0] + nx, cam.target[1] + ny, cam.target[2] + nz];
        if (cam.followDrawableId != null) {
            cam.followOffset = [nx, ny, nz];
        }
        this.enable();
    }

    applyFollow () {
        const id = this.camera.followDrawableId;
        if (id == null) return;
        let obj = this.objects.get(id);
        if (!obj && typeof id === 'string') obj = this.objects.get(Number(id));
        if (!obj && typeof id === 'number') obj = this.objects.get(String(id));
        if (!obj) {
            for (const [k, v] of this.objects.entries()) {
                if (k == id || (v && (v.id == id || v.mesh === 'car'))) {
                    obj = v;
                    break;
                }
            }
        }
        if (!obj || !obj.position) return;
        const off = this.camera.followOffset || [0, 90, 180];
        let offX = off[0];
        let offZ = off[2];
        let lookX = 0;
        let lookZ = 0;
        if (this.camera.followHeading) {
            const yaw = ((obj.rotation && obj.rotation[1]) || 0) * Math.PI / 180;
            offX = (off[0] * Math.cos(yaw)) - (off[2] * Math.sin(yaw));
            offZ = (off[0] * Math.sin(yaw)) + (off[2] * Math.cos(yaw));
            const lookAhead = this.camera.followLookAhead || 0;
            lookX = Math.sin(yaw) * lookAhead;
            lookZ = -Math.cos(yaw) * lookAhead;
        }
        this.camera.target = [obj.position[0] + lookX, obj.position[1], obj.position[2] + lookZ];
        this.camera.position = [
            obj.position[0] + offX,
            obj.position[1] + off[1],
            obj.position[2] + offZ
        ];
    }

    setFollowHeading (enabled, lookAhead) {
        this.camera.followHeading = Boolean(enabled);
        this.camera.followLookAhead = Math.max(0, Number(lookAhead) || 0);
        this.enable();
    }

    setCameraPosition (x, y, z) {
        this.camera.position = [x, y, z];
        this.enable();
    }

    setCameraTarget (x, y, z) {
        this.camera.target = [x, y, z];
        this.enable();
    }

    setCameraFov (fov) {
        this.camera.fov = Math.max(10, Math.min(120, fov));
        this.enable();
    }

    setAmbient (value) {
        const v = Math.max(0, value) / 100;
        this.ambient = [v, v, v];
        this.enable();
    }

    setLightDirection (x, y, z) {
        this.directional.direction = [x, y, z];
        this.enable();
    }

    setLightColor (hex) {
        this.directional.color = hexToRgb(hex);
        this.enable();
    }

    setLightIntensity (value) {
        this.directional.intensity = Math.max(0, value) / 100 * 2;
        this.enable();
    }

    setSkyColor (hex) {
        this.skyTop = hexToRgb(hex);
        this.enable();
    }

    setVolumetricFog (enabled) {
        this.fog.enabled = Boolean(enabled);
        if (this.fog.enabled && this.fog.density <= 0) {
            this.fog.density = 0.0045;
        }
        this.enable();
    }

    fogDensityPercent () {
        return this.fog.density / 0.018 * 100;
    }

    setFogDensity (value) {
        this.fog.density = Math.max(0, value) / 100 * 0.018;
        this.fog.enabled = this.fog.density > 0;
        this.enable();
    }

    changeFogDensity (delta) {
        this.setFogDensity(this.fogDensityPercent() + delta);
    }

    setFogColor (hex) {
        this.fog.color = typeof hex === 'string' ? hexToRgb(hex) : hex;
        this.fog.enabled = true;
        this.enable();
    }

    setFogHeight (y) {
        this.fog.height = y;
        this.fog.enabled = true;
        this.enable();
    }

    setFogFalloff (value) {
        this.fog.heightFalloff = 0.005 + (Math.max(0, Math.min(100, value)) / 100) * 0.115;
        this.fog.enabled = true;
        this.enable();
    }

    setFogStart (value) {
        this.fog.start = Math.max(0, value);
        this.fog.enabled = true;
        this.enable();
    }

    setFogDistance (value) {
        this.fog.maxDistance = Math.max(40, value);
        this.fog.enabled = true;
        this.enable();
    }

    setFogShafts (value) {
        const t = Math.max(0, Math.min(100, value)) / 100;
        this.fog.intensity = t * 1.2;
        this.fog.scattering = 0.45 + (t * 0.5);
        this.fog.enabled = true;
        this.enable();
    }

    setFogPreset (name) {
        const key = String(name || '').toLowerCase();
        const presets = {
            off: {enabled: false},
            mist: {
                enabled: true,
                density: 0.002,
                color: [0.75, 0.82, 0.92],
                height: 0,
                heightFalloff: 0.025,
                start: 80,
                maxDistance: 900,
                intensity: 0.35,
                scattering: 0.7,
                g: 0.65
            },
            haze: {
                enabled: true,
                density: 0.0045,
                color: [0.58, 0.70, 0.90],
                height: 0,
                heightFalloff: 0.04,
                start: 50,
                maxDistance: 720,
                intensity: 0.55,
                scattering: 0.85,
                g: 0.72
            },
            fog: {
                enabled: true,
                density: 0.008,
                color: [0.62, 0.68, 0.78],
                height: 0,
                heightFalloff: 0.05,
                start: 30,
                maxDistance: 520,
                intensity: 0.45,
                scattering: 0.8,
                g: 0.7
            },
            thick: {
                enabled: true,
                density: 0.014,
                color: [0.55, 0.60, 0.70],
                height: 8,
                heightFalloff: 0.03,
                start: 12,
                maxDistance: 380,
                intensity: 0.4,
                scattering: 0.75,
                g: 0.68
            },
            night: {
                enabled: true,
                density: 0.007,
                color: [0.04, 0.06, 0.12],
                height: 0,
                heightFalloff: 0.045,
                start: 20,
                maxDistance: 450,
                intensity: 0.22,
                scattering: 0.6,
                g: 0.75
            }
        };
        const preset = presets[key] || presets.haze;
        Object.assign(this.fog, defaultFog(), preset);
        this.enable();
    }

    setGroundColor (hex) {
        this.groundColor = typeof hex === 'string' ? hexToRgb(hex) : hex;
        this.enable();
    }

    setSkyBottom (hex) {
        this.skyBottom = typeof hex === 'string' ? hexToRgb(hex) : hex;
        this.enable();
    }

    setShowSun (on) {
        this.skyFx.sun = Boolean(on);
        this.enable();
    }

    setShowClouds (on) {
        this.skyFx.clouds = Boolean(on);
        this.enable();
    }

    setCloudCoverage (value) {
        this.skyFx.cloudCoverage = Math.max(0, Math.min(100, value)) / 100;
        this.skyFx.clouds = true;
        this.enable();
    }

    setCloudSpeed (value) {
        this.skyFx.wind = Math.max(0, value) / 100;
        this.enable();
    }

    setShowGodRays (on) {
        this.skyFx.godRays = Boolean(on);
        this.enable();
    }

    setGodRays (value) {
        this.skyFx.godRayIntensity = Math.max(0, Math.min(100, value)) / 100 * 1.2;
        this.skyFx.godRays = this.skyFx.godRayIntensity > 0;
        this.enable();
    }

    setPointLight (index, position, color, intensity) {
        this.pointLights[index] = {
            position,
            color: typeof color === 'string' ? hexToRgb(color) : color,
            intensity: intensity / 100 * 2
        };
        this.enable();
    }

    upsertObject (id, props) {
        const existing = this.objects.get(id) || {
            id,
            mesh: null,
            customMesh: null,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
            material: defaultMaterial()
        };
        if (props.mesh !== undefined) existing.mesh = props.mesh;
        if (props.customMesh !== undefined) existing.customMesh = props.customMesh;
        if (props.position) existing.position = props.position;
        if (props.rotation) existing.rotation = props.rotation;
        if (props.scale) existing.scale = props.scale;
        if (props.visible !== undefined) existing.visible = props.visible;
        if (props.material) {
            existing.material = Object.assign({}, existing.material, props.material);
        }
        this.objects.set(id, existing);
        if (existing.mesh || existing.customMesh) this.enable();
        return existing;
    }

    removeObject (id) {
        this.objects.delete(id);
        this.customMeshes.delete(id);
    }

    serialize () {
        const objects = [];
        this.objects.forEach((obj, id) => {
            objects.push({
                id,
                mesh: obj.mesh,
                position: obj.position,
                rotation: obj.rotation,
                scale: obj.scale,
                visible: obj.visible,
                material: obj.material
            });
        });
        return {
            enabled: this.enabled,
            rayTracing: this.rayTracing,
            showGround: this.showGround,
            showSky: this.showSky,
            skyTop: this.skyTop,
            skyBottom: this.skyBottom,
            camera: this.camera,
            ambient: this.ambient,
            directional: this.directional,
            pointLights: this.pointLights,
            fog: this.fog,
            skyFx: this.skyFx
        };
    }

    deserialize (data) {
        if (!data) return;
        this.enabled = Boolean(data.enabled);
        this.rayTracing = Boolean(data.rayTracing);
        if (data.showGround !== undefined) this.showGround = data.showGround;
        if (data.showSky !== undefined) this.showSky = data.showSky;
        if (data.skyTop) this.skyTop = data.skyTop;
        if (data.skyBottom) this.skyBottom = data.skyBottom;
        if (data.camera) this.camera = Object.assign(defaultCamera(), data.camera);
        if (data.ambient) this.ambient = data.ambient;
        if (data.directional) this.directional = Object.assign({}, this.directional, data.directional);
        if (data.pointLights) this.pointLights = data.pointLights;
        if (data.fog) this.fog = Object.assign(defaultFog(), data.fog);
        if (data.skyFx) this.skyFx = Object.assign(defaultSkyFx(), data.skyFx);
    }
}

StageScene.defaultMaterial = defaultMaterial;
StageScene.defaultCamera = defaultCamera;
StageScene.defaultFog = defaultFog;

module.exports = StageScene;
