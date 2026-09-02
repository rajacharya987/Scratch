/**
 * WebGPU 3D backend. Used when navigator.gpu is available.
 * Same scene graph as WebGL2Backend; RTX/hardware ray tracing plugs in later
 * via the scene.rayTracing flag (currently analytic plane/sky reflections).
 */

const {
    create, multiply, perspective, lookAt, fromTransform, invert, normalMatrix
} = require('./math3d');
const {getPrimitive, plane} = require('./primitives');
const {PBR_WGSL, SKY_WGSL} = require('./shaders-wgsl');

const writeMat4 = (view, offset, m) => {
    // WGSL mat4x4 is column-major, 16-byte column stride — matches our matrices.
    for (let i = 0; i < 16; i++) view.setFloat32(offset + (i * 4), m[i], true);
};

const writeVec4 = (view, offset, x, y, z, w = 0) => {
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setFloat32(offset + 12, w, true);
};

class WebGPUBackend {
    constructor (canvas, device, context, format) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.ready = true;
        this.name = 'webgpu';
        this._meshCache = new Map();
        this._gpuMeshes = new Map();
        this._objectBuffers = new Map();
        this._scratch = {
            model: create(),
            view: create(),
            proj: create(),
            vp: create(),
            nrm: create(),
            invVP: create()
        };
        this._initPipelines();
    }

    static async create (canvas) {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            throw new Error('WebGPU not available');
        }
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter');
        const device = await adapter.requestDevice();
        const context = canvas.getContext('webgpu');
        if (!context) throw new Error('Could not get WebGPU canvas context');
        canvas._scratchHasWebGPU = true;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format,
            alphaMode: 'opaque'
        });
        return new WebGPUBackend(canvas, device, context, format);
    }

    static isSupported () {
        return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
    }

    _initPipelines () {
        const device = this.device;
        this.pbrShader = device.createShaderModule({code: PBR_WGSL});
        this.skyShader = device.createShaderModule({code: SKY_WGSL});

        this.cameraBuf = device.createBuffer({size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
        this.lightBuf = device.createBuffer({size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
        this.objectBuf = null;
        this.skyBuf = device.createBuffer({size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});

        // Dummy shadow texture so the PBR layout stays valid (RTX replaces this later).
        this.shadowTex = device.createTexture({
            size: {width: 4, height: 4, depthOrArrayLayers: 1},
            format: 'depth32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.shadowView = this.shadowTex.createView();
        this.shadowSamp = device.createSampler({compare: 'less', magFilter: 'linear', minFilter: 'linear'});

        this.pbrBgl = device.createBindGroupLayout({
            entries: [
                {binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}},
                {binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}},
                {binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}},
                {binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: 'depth'}},
                {binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {type: 'comparison'}}
            ]
        });
        this.pbrPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({bindGroupLayouts: [this.pbrBgl]}),
            vertex: {
                module: this.pbrShader,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 32,
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: 'float32x3'},
                        {shaderLocation: 1, offset: 12, format: 'float32x3'},
                        {shaderLocation: 2, offset: 24, format: 'float32x2'}
                    ]
                }]
            },
            fragment: {
                module: this.pbrShader,
                entryPoint: 'fs_main',
                targets: [{format: this.format}]
            },
            primitive: {topology: 'triangle-list', cullMode: 'back'},
            depthStencil: {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less'}
        });

        this.skyBgl = device.createBindGroupLayout({
            entries: [
                {binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}}
            ]
        });
        this.skyPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({bindGroupLayouts: [this.skyBgl]}),
            vertex: {
                module: this.skyShader,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8,
                    attributes: [{shaderLocation: 0, offset: 0, format: 'float32x2'}]
                }]
            },
            fragment: {
                module: this.skyShader,
                entryPoint: 'fs_main',
                targets: [{format: this.format}]
            },
            primitive: {topology: 'triangle-list'},
            depthStencil: {format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal'}
        });

        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        this.quadBuf = device.createBuffer({
            size: quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.quadBuf, 0, quad);

        this.depthTex = null;
        this.depthView = null;
        this._ensureDepth();
    }

    _ensureDepth () {
        const w = Math.max(1, this.canvas.width || 1);
        const h = Math.max(1, this.canvas.height || 1);
        if (this.depthTex && this._depthW === w && this._depthH === h) return;
        if (this.depthTex) this.depthTex.destroy();
        this.depthTex = this.device.createTexture({
            size: {width: w, height: h, depthOrArrayLayers: 1},
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthView = this.depthTex.createView();
        this._depthW = w;
        this._depthH = h;
    }

    _interleave (mesh) {
        const n = mesh.positions.length / 3;
        const data = new Float32Array(n * 8);
        for (let i = 0; i < n; i++) {
            data[(i * 8) + 0] = mesh.positions[(i * 3) + 0];
            data[(i * 8) + 1] = mesh.positions[(i * 3) + 1];
            data[(i * 8) + 2] = mesh.positions[(i * 3) + 2];
            data[(i * 8) + 3] = mesh.normals[(i * 3) + 0];
            data[(i * 8) + 4] = mesh.normals[(i * 3) + 1];
            data[(i * 8) + 5] = mesh.normals[(i * 3) + 2];
            data[(i * 8) + 6] = mesh.uvs[(i * 2) + 0];
            data[(i * 8) + 7] = mesh.uvs[(i * 2) + 1];
        }
        return {data, indices: mesh.indices, count: mesh.indices.length};
    }

    _gpu (mesh, key) {
        if (this._gpuMeshes.has(key)) return this._gpuMeshes.get(key);
        const packed = this._interleave(mesh);
        const vbo = this.device.createBuffer({
            size: packed.data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(vbo, 0, packed.data);
        const indexData = packed.indices instanceof Uint32Array ?
            packed.indices : new Uint32Array(packed.indices);
        const ibo = this.device.createBuffer({
            size: indexData.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(ibo, 0, indexData);
        const gpu = {vbo, ibo, count: packed.count};
        this._gpuMeshes.set(key, gpu);
        return gpu;
    }

    getMesh (object) {
        if (object.customMesh) return this._gpu(object.customMesh, `custom:${object.id}`);
        const name = object.mesh || 'cube';
        if (!this._meshCache.has(name)) this._meshCache.set(name, getPrimitive(name));
        return this._gpu(this._meshCache.get(name), `prim:${name}`);
    }

    resize (width, height, pixelRatio = 1) {
        const w = Math.max(1, Math.round(width * pixelRatio));
        const h = Math.max(1, Math.round(height * pixelRatio));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'opaque'
            });
        }
        this._ensureDepth();
    }

    _writeCamera (scene) {
        const cam = scene.camera;
        const aspect = (this.canvas.width || 1) / (this.canvas.height || 1);
        perspective(this._scratch.proj, cam.fov * Math.PI / 180, aspect, cam.near, cam.far);
        lookAt(this._scratch.view, cam.position, cam.target, cam.up);
        multiply(this._scratch.vp, this._scratch.proj, this._scratch.view);
        this.viewProj = this._scratch.vp;
        const buf = new ArrayBuffer(256);
        const view = new DataView(buf);
        writeMat4(view, 0, this._scratch.vp);
        writeMat4(view, 64, this._scratch.view);
        writeMat4(view, 128, this._scratch.proj);
        writeVec4(view, 192, cam.position[0], cam.position[1], cam.position[2], 0);
        this.device.queue.writeBuffer(this.cameraBuf, 0, buf);
    }

    _writeLights (scene) {
        const buf = new ArrayBuffer(512);
        const view = new DataView(buf);
        writeVec4(view, 0, scene.ambient[0], scene.ambient[1], scene.ambient[2], 0);
        writeVec4(view, 16, scene.directional.direction[0], scene.directional.direction[1],
            scene.directional.direction[2], 0);
        writeVec4(view, 32, scene.directional.color[0], scene.directional.color[1],
            scene.directional.color[2], scene.directional.intensity);
        writeVec4(view, 48, scene.skyTop[0], scene.skyTop[1], scene.skyTop[2], 1);
        writeVec4(view, 64, scene.skyBottom[0], scene.skyBottom[1], scene.skyBottom[2], 1);
        writeVec4(view, 80, scene.groundColor[0], scene.groundColor[1], scene.groundColor[2], 1);
        writeVec4(view, 96, scene.rayTracing ? 1 : 0, Math.min(4, scene.pointLights.length), 0, 0);
        for (let i = 0; i < 4; i++) {
            const pl = scene.pointLights[i] || {position: [0, 0, 0], color: [0, 0, 0], intensity: 0};
            writeVec4(view, 112 + (i * 16), pl.position[0], pl.position[1], pl.position[2], 0);
            writeVec4(view, 176 + (i * 16), pl.color[0], pl.color[1], pl.color[2], pl.intensity || 0);
        }
        const fog = this._fogFields(scene);
        writeVec4(view, 240, fog.color[0], fog.color[1], fog.color[2], fog.enabled);
        writeVec4(view, 256, fog.density, fog.height, fog.falloff, fog.maxDistance);
        writeVec4(view, 272, fog.scattering, fog.g, fog.intensity, fog.start);
        this.device.queue.writeBuffer(this.lightBuf, 0, buf);
    }

    _fogFields (scene) {
        const fog = scene.fog || {};
        return {
            enabled: fog.enabled && fog.density > 0 ? 1 : 0,
            color: fog.color || [0.58, 0.70, 0.90],
            density: fog.density || 0,
            height: fog.height || 0,
            falloff: fog.heightFalloff === undefined ? 0.04 : fog.heightFalloff,
            maxDistance: fog.maxDistance === undefined ? 720 : fog.maxDistance,
            scattering: fog.scattering === undefined ? 0.85 : fog.scattering,
            g: fog.g === undefined ? 0.72 : fog.g,
            intensity: fog.intensity === undefined ? 0.55 : fog.intensity,
            start: fog.start === undefined ? 50 : fog.start
        };
    }

    _objectUniformBuffer (id) {
        if (!this._objectBuffers.has(id)) {
            this._objectBuffers.set(id, this.device.createBuffer({
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            }));
        }
        return this._objectBuffers.get(id);
    }

    _writeObject (obj, isGround) {
        fromTransform(this._scratch.model, obj.position, obj.rotation, obj.scale);
        normalMatrix(this._scratch.nrm, this._scratch.model);
        const mat = obj.material || {};
        const albedo = mat.albedo || [0.7, 0.7, 0.7];
        const buf = new ArrayBuffer(256);
        const view = new DataView(buf);
        writeMat4(view, 0, this._scratch.model);
        writeMat4(view, 64, this._scratch.nrm);
        writeVec4(view, 128, albedo[0], albedo[1], albedo[2], mat.opacity === undefined ? 1 : mat.opacity);
        writeVec4(view, 144,
            mat.metallic || 0,
            mat.roughness === undefined ? 0.5 : mat.roughness,
            mat.emissive || 0,
            isGround ? 1 : 0);
        const gpuBuf = this._objectUniformBuffer(obj.id);
        this.device.queue.writeBuffer(gpuBuf, 0, buf);
        return gpuBuf;
    }

    draw (scene) {
        if (!this.ready) return;
        this._ensureDepth();
        this._writeCamera(scene);
        this._writeLights(scene);

        if (scene.showSky) {
            invert(this._scratch.invVP, this._scratch.vp);
            const sbuf = new ArrayBuffer(256);
            const sv = new DataView(sbuf);
            writeMat4(sv, 0, this._scratch.invVP);
            writeVec4(sv, 64, scene.skyTop[0], scene.skyTop[1], scene.skyTop[2], 1);
            writeVec4(sv, 80, scene.skyBottom[0], scene.skyBottom[1], scene.skyBottom[2], 1);
            writeVec4(sv, 96, scene.directional.direction[0], scene.directional.direction[1],
                scene.directional.direction[2], 0);
            writeVec4(sv, 112, scene.camera.position[0], scene.camera.position[1],
                scene.camera.position[2], 0);
            writeVec4(sv, 128, scene.directional.color[0], scene.directional.color[1],
                scene.directional.color[2], scene.directional.intensity);
            const fog = this._fogFields(scene);
            writeVec4(sv, 144, fog.color[0], fog.color[1], fog.color[2], fog.enabled);
            writeVec4(sv, 160, fog.density, fog.height, fog.falloff, fog.maxDistance);
            writeVec4(sv, 176, fog.scattering, fog.g, fog.intensity, fog.start);
            const fx = scene.skyFx || {};
            const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
            writeVec4(sv, 192,
                fx.sun === false ? 0 : 1,
                fx.clouds === false ? 0 : 1,
                fx.godRays === false ? 0 : 1,
                fx.stars === false ? 0 : 1
            );
            writeVec4(sv, 208,
                fx.cloudCoverage === undefined ? 0.55 : fx.cloudCoverage,
                fx.cloudDensity === undefined ? 0.9 : fx.cloudDensity,
                fx.wind === undefined ? 0.45 : fx.wind,
                time
            );
            writeVec4(sv, 224, fx.godRayIntensity === undefined ? 0.6 : fx.godRayIntensity, 0, 0, 0);
            this.device.queue.writeBuffer(this.skyBuf, 0, sbuf);
        }

        const items = [];
        if (scene.showGround) {
            if (!this._meshCache.has('__groundPlane')) {
                this._meshCache.set('__groundPlane', plane(2000));
            }
            items.push({
                obj: {
                    id: '__ground',
                    mesh: 'plane',
                    customMesh: this._meshCache.get('__groundPlane'),
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    material: {albedo: scene.groundColor, metallic: 0, roughness: 0.9, emissive: 0, opacity: 1}
                },
                isGround: true
            });
        }
        scene.objects.forEach(obj => {
            if (!obj.visible || (!obj.mesh && !obj.customMesh)) return;
            items.push({obj, isGround: false});
        });
        const prepared = items.map(item => ({
            ...item,
            objectBuf: this._writeObject(item.obj, item.isGround),
            gpu: this.getMesh(item.obj)
        }));

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: {r: scene.skyBottom[0], g: scene.skyBottom[1], b: scene.skyBottom[2], a: 1},
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: this.depthView,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
        });

        if (scene.showSky) {
            const skyBg = this.device.createBindGroup({
                layout: this.skyBgl,
                entries: [{binding: 0, resource: {buffer: this.skyBuf}}]
            });
            pass.setPipeline(this.skyPipeline);
            pass.setBindGroup(0, skyBg);
            pass.setVertexBuffer(0, this.quadBuf);
            pass.draw(6);
        }

        pass.setPipeline(this.pbrPipeline);
        prepared.forEach(item => {
            const pbrBg = this.device.createBindGroup({
                layout: this.pbrBgl,
                entries: [
                    {binding: 0, resource: {buffer: this.cameraBuf}},
                    {binding: 1, resource: {buffer: item.objectBuf}},
                    {binding: 2, resource: {buffer: this.lightBuf}},
                    {binding: 3, resource: this.shadowView},
                    {binding: 4, resource: this.shadowSamp}
                ]
            });
            pass.setBindGroup(0, pbrBg);
            pass.setVertexBuffer(0, item.gpu.vbo);
            pass.setIndexBuffer(item.gpu.ibo, 'uint32');
            pass.drawIndexed(item.gpu.count);
        });

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    cacheCustomMesh (id, mesh) {
        this._gpuMeshes.delete(`custom:${id}`);
        this._gpu(mesh, `custom:${id}`);
    }

    dispose () {
        if (this.depthTex) this.depthTex.destroy();
        if (this.shadowTex) this.shadowTex.destroy();
    }
}

module.exports = WebGPUBackend;
