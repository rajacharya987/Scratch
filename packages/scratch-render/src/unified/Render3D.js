/**
 * 3D renderer facade: WebGPU when the adapter is ready, WebGL2 otherwise.
 * Ray tracing is a scene flag; the current backends use analytic reflections,
 * and a future RTX pass can replace that without changing the VM or GUI.
 */

const StageScene = require('./StageScene');
const WebGL2Backend = require('./WebGL2Backend');
const WebGPUBackend = require('./WebGPUBackend');
const {loadGLB, loadMergedModel} = require('./model-loader');
const {hexToRgb} = require('./math3d');

class Render3D {
    constructor (canvas) {
        this.canvas = canvas;
        this.scene = new StageScene();
        this.backend = null;
        this.backendName = 'none';
        this._initBackend(canvas);
    }

    _startWebGL2 (canvas) {
        this.canvas = canvas;
        this.backend = new WebGL2Backend(canvas);
        this.backendName = this.backend.ready ? 'webgl2' : 'none';
        return this.backend;
    }

    _initBackend (canvas) {
        // Prefer WebGPU. Only attach a GPU canvas context after a device exists
        // so a failed adapter request still leaves the canvas free for WebGL2.
        const canWebGPU = typeof navigator !== 'undefined' && navigator.gpu;
        if (!canWebGPU) {
            this._upgrade = Promise.resolve(this._startWebGL2(canvas));
            return;
        }
        this._upgrade = WebGPUBackend.create(canvas)
            .then(backend => {
                this.canvas = canvas;
                this.backend = backend;
                this.backendName = 'webgpu';
                return backend;
            })
            .catch(() => {
                let target = canvas;
                if (canvas._scratchHasWebGPU && typeof document !== 'undefined') {
                    const fallback = document.createElement('canvas');
                    fallback.className = canvas.className || 'scratch-stage-3d';
                    if (canvas.parentNode) {
                        canvas.parentNode.replaceChild(fallback, canvas);
                    }
                    target = fallback;
                }
                return this._startWebGL2(target);
            });
    }

    get ready () {
        return Boolean(this.backend && this.backend.ready);
    }

    resize (width, height, pixelRatio) {
        if (this.backend && this.backend.resize) {
            this.backend.resize(width, height, pixelRatio);
        } else {
            const pr = pixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
            this.canvas.width = Math.max(1, Math.round(width * pr));
            this.canvas.height = Math.max(1, Math.round(height * pr));
        }
    }

    draw () {
        if (!this.scene.hasContent()) return;
        this.scene.applyFollow();
        if (this.backend && this.backend.ready) {
            this.backend.draw(this.scene);
        }
    }

    getViewProj () {
        return this.backend && this.backend.viewProj;
    }

    updateObject3D (drawableId, props) {
        this.scene.upsertObject(drawableId, props);
        if (props.customMesh && this.backend && this.backend.cacheCustomMesh) {
            this.backend.cacheCustomMesh(drawableId, props.customMesh);
        }
    }

    removeObject3D (drawableId) {
        this.scene.removeObject(drawableId);
    }

    importModel (drawableId, arrayBufferOrData, fileName = '') {
        const {customMesh, material} = loadMergedModel(arrayBufferOrData, fileName);
        this.scene.customMeshes.set(drawableId, customMesh);
        this.scene.upsertObject(drawableId, {
            mesh: fileName || 'custom',
            customMesh,
            material
        });
        if (this.backend && this.backend.cacheCustomMesh) {
            this.backend.cacheCustomMesh(drawableId, customMesh);
        }
        return customMesh;
    }

    importGlb (drawableId, arrayBuffer) {
        return this.importModel(drawableId, arrayBuffer, 'model.glb');
    }

    setMaterialColor (drawableId, hex) {
        this.scene.upsertObject(drawableId, {material: {albedo: hexToRgb(hex)}});
    }

    exportScene () {
        return this.scene.serialize();
    }

    importScene (data) {
        this.scene.deserialize(data);
    }

    reset () {
        this.scene.reset();
    }
}

module.exports = Render3D;
