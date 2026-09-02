/**
 * WebGL2 3D backend. Always available as the compatibility path when WebGPU
 * is missing. Implements the rasterization pass of the unified renderer.
 */

const {
    create, identity, multiply, perspective, lookAt, ortho,
    fromTransform, invert, normalMatrix, vec3Normalize
} = require('./math3d');
const {getPrimitive, plane} = require('./primitives');
const {PBR_VS, PBR_FS, DEPTH_VS, DEPTH_FS, SKY_VS, SKY_FS} = require('./shaders-webgl');

const compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile failed: ${log}`);
    }
    return sh;
};

const link = (gl, vsSrc, fsSrc) => {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
};

const loc = (gl, prog) => {
    const uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        uniforms[info.name.replace(/\[0]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    return uniforms;
};

class GPUMesh {
    constructor (gl, mesh) {
        this.gl = gl;
        this.count = mesh.indices.length;
        this.indexType = mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const bindAttr = (index, data, size) => {
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(index);
            gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
            return buf;
        };
        this.pos = bindAttr(0, mesh.positions, 3);
        this.nrm = bindAttr(1, mesh.normals, 3);
        this.uv = bindAttr(2, mesh.uvs, 2);
        this.ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
    }

    draw () {
        const gl = this.gl;
        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.count, this.indexType, 0);
        gl.bindVertexArray(null);
    }

    dispose () {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteBuffer(this.pos);
        gl.deleteBuffer(this.nrm);
        gl.deleteBuffer(this.uv);
        gl.deleteBuffer(this.ibo);
    }
}

class WebGL2Backend {
    constructor (canvas) {
        this.canvas = canvas;
        this.ready = false;
        this.name = 'webgl2';
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            depth: true,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });
        if (!gl) {
            this.gl = null;
            return;
        }
        this.gl = gl;
        this._meshCache = new Map();
        this._gpuMeshes = new Map();
        this._scratch = {
            model: create(),
            view: create(),
            proj: create(),
            vp: create(),
            nrm: create(),
            lightVP: create(),
            lightView: create(),
            lightProj: create(),
            invVP: create()
        };
        try {
            this._init();
            this.ready = true;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('WebGL2 3D backend failed to initialize', e);
            this.ready = false;
        }
    }

    _init () {
        const gl = this.gl;
        this.pbr = link(gl, PBR_VS, PBR_FS);
        this.pbrU = loc(gl, this.pbr);
        this.depthProg = link(gl, DEPTH_VS, DEPTH_FS);
        this.depthU = loc(gl, this.depthProg);
        this.sky = link(gl, SKY_VS, SKY_FS);
        this.skyU = loc(gl, this.sky);

        this.shadowSize = 512;
        this.shadowFbo = gl.createFramebuffer();
        this.shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, this.shadowSize, this.shadowSize, 0,
            gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.skyVao = gl.createVertexArray();
        gl.bindVertexArray(this.skyVao);
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.groundMesh = this._gpu(plane(2000), '__ground');
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
    }

    _gpu (mesh, key) {
        if (this._gpuMeshes.has(key)) return this._gpuMeshes.get(key);
        const gpu = new GPUMesh(this.gl, mesh);
        this._gpuMeshes.set(key, gpu);
        return gpu;
    }

    getMesh (object) {
        if (object.customMesh) {
            const key = `custom:${object.id}`;
            return this._gpu(object.customMesh, key);
        }
        const name = object.mesh || 'cube';
        if (!this._meshCache.has(name)) {
            this._meshCache.set(name, getPrimitive(name));
        }
        return this._gpu(this._meshCache.get(name), `prim:${name}`);
    }

    resize (width, height, pixelRatio = 1) {
        const w = Math.max(1, Math.round(width * pixelRatio));
        const h = Math.max(1, Math.round(height * pixelRatio));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    _visibleObjects (scene) {
        const list = [];
        scene.objects.forEach(obj => {
            if (!obj.visible) return;
            if (!obj.mesh && !obj.customMesh) return;
            list.push(obj);
        });
        return list;
    }

    _setMatrices (scene) {
        const cam = scene.camera;
        const aspect = (this.canvas.width || 1) / (this.canvas.height || 1);
        perspective(this._scratch.proj, cam.fov * Math.PI / 180, aspect, cam.near, cam.far);
        lookAt(this._scratch.view, cam.position, cam.target, cam.up);
        multiply(this._scratch.vp, this._scratch.proj, this._scratch.view);
        this.viewProj = this._scratch.vp;

        const dir = vec3Normalize([0, 0, 0], scene.directional.direction);
        const lightPos = [
            cam.target[0] - (dir[0] * 400),
            cam.target[1] - (dir[1] * 400),
            cam.target[2] - (dir[2] * 400)
        ];
        lookAt(this._scratch.lightView, lightPos, cam.target, [0, 1, 0]);
        ortho(this._scratch.lightProj, -400, 400, -400, 400, 1, 1200);
        multiply(this._scratch.lightVP, this._scratch.lightProj, this._scratch.lightView);
    }

    _drawDepth (objects) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.depthProg);
        gl.uniformMatrix4fv(this.depthU.uLightVP, false, this._scratch.lightVP);
        gl.cullFace(gl.FRONT);
        objects.forEach(obj => {
            fromTransform(this._scratch.model, obj.position, obj.rotation, obj.scale);
            gl.uniformMatrix4fv(this.depthU.uModel, false, this._scratch.model);
            this.getMesh(obj).draw();
        });
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _drawSky (scene) {
        const gl = this.gl;
        gl.depthFunc(gl.LEQUAL);
        gl.useProgram(this.sky);
        invert(this._scratch.invVP, this._scratch.vp);
        gl.uniformMatrix4fv(this.skyU.uInvViewProj, false, this._scratch.invVP);
        gl.uniform3fv(this.skyU.uSkyTop, scene.skyTop);
        gl.uniform3fv(this.skyU.uSkyBottom, scene.skyBottom);
        gl.uniform3fv(this.skyU.uSunDir, scene.directional.direction);
        gl.uniform3fv(this.skyU.uCameraPos, scene.camera.position);
        gl.uniform3fv(this.skyU.uDirLightColor, scene.directional.color);
        gl.uniform1f(this.skyU.uDirLightIntensity, scene.directional.intensity);
        gl.uniformMatrix4fv(this.skyU.uLightVP, false, this._scratch.lightVP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(this.skyU.uShadowMap, 0);
        this._bindFog(this.skyU, scene);
        this._bindSkyFx(this.skyU, scene);
        gl.bindVertexArray(this.skyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        gl.depthFunc(gl.LESS);
    }

    _bindFog (u, scene) {
        const gl = this.gl;
        const fog = scene.fog || {};
        const enabled = fog.enabled && fog.density > 0 ? 1 : 0;
        if (u.uFogColor) {
            gl.uniform3fv(u.uFogColor, fog.color || [0.58, 0.70, 0.90]);
        }
        if (u.uFogParams) {
            gl.uniform4f(
                u.uFogParams,
                enabled,
                fog.density || 0,
                fog.height || 0,
                fog.heightFalloff === undefined ? 0.04 : fog.heightFalloff
            );
        }
        if (u.uFogParams2) {
            gl.uniform4f(
                u.uFogParams2,
                fog.maxDistance === undefined ? 720 : fog.maxDistance,
                fog.scattering === undefined ? 0.85 : fog.scattering,
                fog.g === undefined ? 0.72 : fog.g,
                fog.intensity === undefined ? 0.55 : fog.intensity
            );
        }
        if (u.uFogStart) {
            gl.uniform1f(u.uFogStart, fog.start === undefined ? 50 : fog.start);
        }
    }

    _bindSkyFx (u, scene) {
        const gl = this.gl;
        const fx = scene.skyFx || {};
        const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
        if (u.uSkyFx) {
            gl.uniform4f(
                u.uSkyFx,
                fx.sun === false ? 0 : 1,
                fx.clouds === false ? 0 : 1,
                fx.godRays === false ? 0 : 1,
                fx.stars === false ? 0 : 1
            );
        }
        if (u.uCloudParams) {
            gl.uniform4f(
                u.uCloudParams,
                fx.cloudCoverage === undefined ? 0.55 : fx.cloudCoverage,
                fx.cloudDensity === undefined ? 0.9 : fx.cloudDensity,
                fx.wind === undefined ? 0.45 : fx.wind,
                time
            );
        }
        if (u.uGodRayIntensity) {
            gl.uniform1f(u.uGodRayIntensity, fx.godRayIntensity === undefined ? 0.6 : fx.godRayIntensity);
        }
    }

    _bindPBRScene (scene) {
        const gl = this.gl;
        const u = this.pbrU;
        gl.useProgram(this.pbr);
        gl.uniformMatrix4fv(u.uView, false, this._scratch.view);
        gl.uniformMatrix4fv(u.uProj, false, this._scratch.proj);
        gl.uniformMatrix4fv(u.uLightVP, false, this._scratch.lightVP);
        gl.uniform3fv(u.uCameraPos, scene.camera.position);
        gl.uniform3fv(u.uAmbient, scene.ambient);
        gl.uniform3fv(u.uDirLightDir, scene.directional.direction);
        gl.uniform3fv(u.uDirLightColor, scene.directional.color);
        gl.uniform1f(u.uDirLightIntensity, scene.directional.intensity);
        gl.uniform3fv(u.uSkyTop, scene.skyTop);
        gl.uniform3fv(u.uSkyBottom, scene.skyBottom);
        gl.uniform3fv(u.uGroundColor, scene.groundColor);
        gl.uniform1i(u.uRayTrace, scene.rayTracing ? 1 : 0);
        this._bindFog(u, scene);
        const count = Math.min(4, scene.pointLights.length);
        gl.uniform1i(u.uPointLightCount, count);
        for (let i = 0; i < 4; i++) {
            const pl = scene.pointLights[i] || {position: [0, 0, 0], color: [0, 0, 0], intensity: 0};
            gl.uniform3fv(gl.getUniformLocation(this.pbr, `uPointLightPos[${i}]`), pl.position);
            gl.uniform3fv(gl.getUniformLocation(this.pbr, `uPointLightColor[${i}]`), pl.color);
            gl.uniform1f(gl.getUniformLocation(this.pbr, `uPointLightIntensity[${i}]`), pl.intensity || 0);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(u.uShadowMap, 0);
    }

    _drawObject (obj, isGround) {
        const gl = this.gl;
        const u = this.pbrU;
        fromTransform(this._scratch.model, obj.position, obj.rotation, obj.scale);
        normalMatrix(this._scratch.nrm, this._scratch.model);
        gl.uniformMatrix4fv(u.uModel, false, this._scratch.model);
        gl.uniformMatrix4fv(u.uNormalMatrix, false, this._scratch.nrm);
        const mat = obj.material || {};
        gl.uniform3fv(u.uAlbedo, mat.albedo || [0.7, 0.7, 0.7]);
        gl.uniform1f(u.uMetallic, mat.metallic || 0);
        gl.uniform1f(u.uRoughness, mat.roughness === undefined ? 0.5 : mat.roughness);
        gl.uniform1f(u.uEmissive, mat.emissive || 0);
        gl.uniform1f(u.uOpacity, mat.opacity === undefined ? 1 : mat.opacity);
        gl.uniform1i(u.uIsGround, isGround ? 1 : 0);
        gl.uniform1i(u.uReceiveShadow, 1);
        this.getMesh(obj).draw();
    }

    draw (scene) {
        if (!this.ready) return;
        const gl = this.gl;
        const objects = this._visibleObjects(scene);
        this._setMatrices(scene);
        this._drawDepth(objects);

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(scene.skyBottom[0], scene.skyBottom[1], scene.skyBottom[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (scene.showSky) this._drawSky(scene);
        this._bindPBRScene(scene);
        if (scene.showGround) {
            this._drawObject({
                id: '__ground',
                mesh: 'plane',
                customMesh: this._meshCache.get('__groundPlane') ||
                    (this._meshCache.set('__groundPlane', plane(2000)), this._meshCache.get('__groundPlane')),
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                material: {albedo: scene.groundColor, metallic: 0, roughness: 0.9, emissive: 0, opacity: 1}
            }, true);
        }
        objects.forEach(obj => this._drawObject(obj, false));
    }

    cacheCustomMesh (id, mesh) {
        const key = `custom:${id}`;
        if (this._gpuMeshes.has(key)) {
            this._gpuMeshes.get(key).dispose();
            this._gpuMeshes.delete(key);
        }
        this._gpu(mesh, key);
    }

    dispose () {
        this._gpuMeshes.forEach(m => m.dispose());
        this._gpuMeshes.clear();
    }
}

WebGL2Backend.isSupported = canvas => {
    try {
        const c = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
        if (!c) return false;
        return Boolean(c.getContext('webgl2'));
    } catch (e) { // eslint-disable-line no-unused-vars
        return false;
    }
};

module.exports = WebGL2Backend;
