/**
 * Unified renderer: the existing WebGL 2D renderer is the compatibility
 * layer; a WebGPU/WebGL2 3D pass draws the world behind it.
 *
 * Frame:
 *   3D geometry → lighting → shadows → ray-traced reflections → 2D/UI overlay
 */

const RenderWebGL = require('../RenderWebGL');
const Render3D = require('./Render3D');
const StageScene = require('./StageScene');

class RenderUnified extends RenderWebGL {
    constructor (canvas, xLeft, xRight, yBottom, yTop) {
        super(canvas, xLeft, xRight, yBottom, yTop, {
            alpha: true,
            premultipliedAlpha: true
        });

        this.canvas2d = canvas;
        this.canvas3d = (typeof document !== 'undefined') ? document.createElement('canvas') : canvas;
        if (this.canvas3d !== canvas) {
            this.canvas3d.className = 'scratch-stage-3d';
            this.canvas3d.setAttribute('aria-hidden', 'true');
            this.canvas3d.style.position = 'absolute';
            this.canvas3d.style.left = '0';
            this.canvas3d.style.top = '0';
            this.canvas3d.style.pointerEvents = 'none';
            this.canvas3d.style.visibility = 'hidden';
        }
        this._render3d = null;
        try {
            this._render3d = new Render3D(this.canvas3d);
            if (this._render3d._upgrade) {
                this._render3d._upgrade.then(() => {
                    this.canvas3d = this._render3d.canvas;
                    this.draw();
                }).catch(() => {});
            }
        } catch (e) { // eslint-disable-line no-unused-vars
            this._render3d = null;
        }
        this._whiteBackground = [1, 1, 1, 1];
        this.overlayMode = false;
    }

    get scene () {
        return this._render3d ? this._render3d.scene : null;
    }

    get backendName () {
        return this._render3d ? this._render3d.backendName : 'none';
    }

    is3DActive () {
        return Boolean(this._render3d && this._render3d.ready && this._render3d.scene.hasContent());
    }

    _queueDraw () {
        if (this._drawQueued) return;
        this._drawQueued = true;
        const kick = typeof requestAnimationFrame === 'function' ?
            requestAnimationFrame : cb => setTimeout(cb, 16);
        kick(() => {
            this._drawQueued = false;
            this.draw();
        });
    }

    resize (pixelsWide, pixelsTall) {
        const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const pixelRatio = Math.min(raw, 1.25);
        if (this._render3d) {
            this._render3d.resize(pixelsWide, pixelsTall, pixelRatio);
            if (this.canvas3d && this.canvas3d.style) {
                this.canvas3d.style.width = `${pixelsWide}px`;
                this.canvas3d.style.height = `${pixelsTall}px`;
            }
        }
        super.resize(pixelsWide, pixelsTall);
    }

    draw () {
        const active3d = this.is3DActive();
        this.overlayMode = active3d;
        if (this.canvas3d && this.canvas3d.style) {
            this.canvas3d.style.visibility = active3d ? 'visible' : 'hidden';
        }
        if (active3d) {
            this._render3d.draw();
            this._backgroundColor4f = [0, 0, 0, 0];
        } else if (this._backgroundColor4f[3] === 0) {
            this._backgroundColor4f = this._whiteBackground.slice();
        }
        super.draw();
    }

    updateObject3D (drawableId, props) {
        if (this._render3d) this._render3d.updateObject3D(drawableId, props);
    }

    removeObject3D (drawableId) {
        if (this._render3d) this._render3d.removeObject3D(drawableId);
    }

    importModel (drawableId, arrayBufferOrData, fileName = '') {
        if (!this._render3d) throw new Error('3D renderer is not available');
        return this._render3d.importModel(drawableId, arrayBufferOrData, fileName);
    }

    importGlb (drawableId, arrayBuffer) {
        if (!this._render3d) throw new Error('3D renderer is not available');
        return this._render3d.importGlb(drawableId, arrayBuffer);
    }

    setMaterialColor (drawableId, hex) {
        if (this._render3d) this._render3d.setMaterialColor(drawableId, hex);
    }

    destroyDrawable (drawableID, group) {
        this.removeObject3D(drawableID);
        return super.destroyDrawable(drawableID, group);
    }

    exportScene3D () {
        return this._render3d ? this._render3d.exportScene() : null;
    }

    importScene3D (data) {
        if (this._render3d) this._render3d.importScene(data);
    }

    reset3D () {
        if (this._render3d) this._render3d.reset();
    }

    orbitCamera (dx, dy) {
        if (this.scene) this.scene.orbitCamera(dx, dy);
        this._queueDraw();
    }

    panCamera (dx, dy) {
        if (this.scene) this.scene.panCamera(dx, dy);
        this._queueDraw();
    }

    zoomCamera (delta) {
        if (this.scene) this.scene.zoomCamera(delta);
        this._queueDraw();
    }

    projectPoint (x, y, z, displaySize) {
        const vp = this._render3d && this._render3d.getViewProj();
        if (!vp || !this.canvas3d) return null;
        const w = (vp[3] * x) + (vp[7] * y) + (vp[11] * z) + vp[15];
        if (Math.abs(w) < 1e-6) return null;
        const ndcX = ((vp[0] * x) + (vp[4] * y) + (vp[8] * z) + vp[12]) / w;
        const ndcY = ((vp[1] * x) + (vp[5] * y) + (vp[9] * z) + vp[13]) / w;
        const ndcZ = ((vp[2] * x) + (vp[6] * y) + (vp[10] * z) + vp[14]) / w;
        if (ndcZ < -1.2 || ndcZ > 1.2) return null;
        const width = (displaySize && displaySize.width) ||
            this.canvas3d.clientWidth || this.canvas.clientWidth || this.canvas3d.width;
        const height = (displaySize && displaySize.height) ||
            this.canvas3d.clientHeight || this.canvas.clientHeight || this.canvas3d.height;
        if (!width || !height) return null;
        return {
            x: (ndcX * 0.5 + 0.5) * width,
            y: (1 - (ndcY * 0.5 + 0.5)) * height
        };
    }

    pickObject3D (sx, sy) {
        if (!this.scene) return null;
        let best = null;
        let bestDist = 28;
        this.scene.objects.forEach(obj => {
            if (!obj.visible || (!obj.mesh && !obj.customMesh)) return;
            const p = this.projectPoint(obj.position[0], obj.position[1], obj.position[2]);
            if (!p) return;
            const d = Math.hypot(p.x - sx, p.y - sy);
            const size = 18 + (Math.abs(obj.scale[0]) * 8);
            if (d < Math.max(bestDist, size) && d < 48) {
                bestDist = d;
                best = obj.id;
            }
        });
        return best;
    }
}

RenderUnified.StageScene = StageScene;
RenderUnified.Render3D = Render3D;

module.exports = RenderUnified;
