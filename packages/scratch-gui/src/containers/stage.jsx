import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {Map} from 'immutable';
import Renderer from '@scratch/scratch-render';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import {STAGE_DISPLAY_SIZES} from '../lib/layout-constants';
import {getEventXY} from '../lib/touch-utils';
import VideoProvider from '../lib/video/video-provider';
import {BitmapAdapter as V2BitmapAdapter} from '@scratch/scratch-svg-renderer';

import StageComponent from '../components/stage/stage.jsx';

import {
    activateColorPicker,
    deactivateColorPicker
} from '../reducers/color-picker';

const colorPickerRadius = 20;
const dragThreshold = 3; // Same as the block drag threshold

class Stage extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'attachMouseEvents',
            'cancelMouseDownTimeout',
            'detachMouseEvents',
            'handleDoubleClick',
            'handleQuestionAnswered',
            'onMouseUp',
            'onMouseMove',
            'onMouseDown',
            'onStartDrag',
            'onStopDrag',
            'onWheel',
            'onContextMenu',
            'onPointerDown',
            'onGizmoAxisDown',
            'setStageStack',
            'updateRect',
            'questionListener',
            'setDragCanvas',
            'clearDragCanvas',
            'drawDragCanvas',
            'positionDragCanvas',
            'tickGizmo',
            'setGizmoMode',
            'is3DWorld',
            'onGameTelemetry',
            'applyGameTelemetry'
        ]);
        this._lastTelemetry = null;
        this.state = {
            mouseDownTimeoutId: null,
            mouseDownPosition: null,
            isDragging: false,
            dragOffset: null,
            dragId: null,
            colorInfo: null,
            question: null,
            gizmoOrigin: null,
            gizmoAxes: {},
            gizmoMode: 'move',
            gizmoAxis: null,
            showGizmo: false
        };
        this._orbiting = false;
        this._panning = false;
        this._gizmoDrag = null;
        this._lastPointer = null;
        this._stageStack = null;
        this._downStamp = null;
        this._wheelStamp = null;
        this._lastGizmoTick = 0;
        if (this.props.vm.renderer) {
            this.renderer = this.props.vm.renderer;
            this.canvas = this.renderer.canvas;
            this.canvas3d = this.renderer.canvas3d || null;
        } else {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'scratch-stage-2d';
            const Unified = Renderer.RenderUnified;
            this.renderer = Unified ? new Unified(this.canvas) : new Renderer(this.canvas);
            this.canvas3d = this.renderer.canvas3d || null;
            this.props.vm.attachRenderer(this.renderer);

            // Only attach a video provider once because it is stateful
            this.props.vm.setVideoProvider(new VideoProvider());

            // Calling draw a single time before any project is loaded just makes
            // the canvas white instead of solid black–needed because it is not
            // possible to use CSS to style the canvas to have a different
            // default color
            this.props.vm.renderer.draw();
        }
        this.props.vm.attachV2BitmapAdapter(new V2BitmapAdapter());
    }
    componentDidMount () {
        this.attachRectEvents();
        this.attachMouseEvents(this.canvas);
        if (this.canvas3d) {
            this.attachPointerBlockers(this.canvas3d);
            this.canvas3d.oncontextmenu = this.onContextMenu;
        }
        if (this.canvas) {
            this.canvas.oncontextmenu = this.onContextMenu;
        }
        this.updateRect();
        this.props.vm.runtime.addListener('QUESTION', this.questionListener);
        this._gizmoRaf = requestAnimationFrame(this.tickGizmo);
        window.addEventListener('message', this.onGameTelemetry);
    }
    shouldComponentUpdate (nextProps, nextState) {
        return this.props.stageSize !== nextProps.stageSize ||
            this.props.isColorPicking !== nextProps.isColorPicking ||
            this.state.colorInfo !== nextState.colorInfo ||
            this.props.isFullScreen !== nextProps.isFullScreen ||
            this.state.question !== nextState.question ||
            this.props.micIndicator !== nextProps.micIndicator ||
            this.props.isStarted !== nextProps.isStarted ||
            this.props.isRunning !== nextProps.isRunning ||
            this.props.editingTarget !== nextProps.editingTarget ||
            this.state.showGizmo !== nextState.showGizmo ||
            this.state.gizmoMode !== nextState.gizmoMode ||
            this.state.gizmoAxis !== nextState.gizmoAxis ||
            this.state.gizmoOrigin !== nextState.gizmoOrigin;
    }
    componentDidUpdate (prevProps) {
        if (this.props.isColorPicking && !prevProps.isColorPicking) {
            this.startColorPickingLoop();
        } else if (!this.props.isColorPicking && prevProps.isColorPicking) {
            this.stopColorPickingLoop();
        }
        if (prevProps.isRunning && !this.props.isRunning) {
            this._lastTelemetry = {speed: 0, coins: 0, nitro: 0, distance: 0, rpm: 0};
            this.applyGameTelemetry();
        }
        this.updateRect();
        this.renderer.resize(this.rect.width, this.rect.height);
    }
    componentWillUnmount () {
        this.detachMouseEvents(this.canvas);
        if (this._stageStack) this.detachStageInput(this._stageStack);
        if (this.canvas3d) this.detachPointerBlockers(this.canvas3d);
        if (this.canvas) this.canvas.oncontextmenu = null;
        if (this.canvas3d) this.canvas3d.oncontextmenu = null;
        this.detachRectEvents();
        this.stopColorPickingLoop();
        this.props.vm.runtime.removeListener('QUESTION', this.questionListener);
        window.removeEventListener('message', this.onGameTelemetry);
        if (this._gizmoRaf) cancelAnimationFrame(this._gizmoRaf);
    }
    onGameTelemetry (event) {
        const data = event && event.data;
        if (!data || data.type !== 'scratch_game_telemetry') return;
        this._lastTelemetry = data;
        this.applyGameTelemetry();
    }
    applyGameTelemetry () {
        const data = this._lastTelemetry;
        if (!data) return;
        const runtime = this.props.vm.runtime;
        const stage = runtime.getTargetForStage();
        if (!stage || !stage.lookupVariableByNameAndType) return;
        const pairs = [
            ['Speed (km/h)', data.speed],
            ['Coins 🪙', data.coins],
            ['Nitro', data.nitro],
            ['Distance (m)', data.distance],
            ['RPM', data.rpm]
        ];
        let changed = false;
        const monitors = runtime.getMonitorState();
        for (let i = 0; i < pairs.length; i++) {
            const value = pairs[i][1];
            if (value === undefined || value === null) continue;
            const variable = stage.lookupVariableByNameAndType(pairs[i][0], '');
            if (!variable) continue;
            variable.value = value;
            const monitor = monitors.get(variable.id);
            if (!monitor || monitor.get('value') !== value) changed = true;
            runtime.requestUpdateMonitor(Map({
                id: variable.id,
                value: value
            }));
        }
        if (changed) {
            runtime.emit('MONITORS_UPDATE', runtime.getMonitorState());
            runtime._prevMonitorState = runtime.getMonitorState();
            runtime.requestRedraw();
        }
    }
    questionListener (question) {
        this.setState({question: question});
    }
    handleQuestionAnswered (answer) {
        this.setState({question: null}, () => {
            this.props.vm.runtime.emit('ANSWER', answer);
        });
    }
    startColorPickingLoop () {
        this.intervalId = setInterval(() => {
            if (typeof this.pickX === 'number') {
                this.setState({colorInfo: this.getColorInfo(this.pickX, this.pickY)});
            }
        }, 30);
    }
    stopColorPickingLoop () {
        clearInterval(this.intervalId);
    }
    attachPointerBlockers (el) {
        if (!el) return;
        el.addEventListener('contextmenu', this.onContextMenu);
        el.addEventListener('auxclick', this.onContextMenu);
    }
    detachPointerBlockers (el) {
        if (!el) return;
        el.removeEventListener('contextmenu', this.onContextMenu);
        el.removeEventListener('auxclick', this.onContextMenu);
    }
    attachStageInput (el) {
        if (!el) return;
        el.addEventListener('mousedown', this.onMouseDown);
        el.addEventListener('pointerdown', this.onPointerDown);
        el.addEventListener('touchstart', this.onMouseDown, {passive: false});
        el.addEventListener('wheel', this.onWheel, {passive: false});
        el.addEventListener('contextmenu', this.onContextMenu);
        el.addEventListener('auxclick', this.onContextMenu);
    }
    detachStageInput (el) {
        if (!el) return;
        el.removeEventListener('mousedown', this.onMouseDown);
        el.removeEventListener('pointerdown', this.onPointerDown);
        el.removeEventListener('touchstart', this.onMouseDown);
        el.removeEventListener('wheel', this.onWheel);
        el.removeEventListener('contextmenu', this.onContextMenu);
        el.removeEventListener('auxclick', this.onContextMenu);
    }
    setStageStack (el) {
        if (this._stageStack === el) return;
        if (this._stageStack) this.detachStageInput(this._stageStack);
        this._stageStack = el;
        if (el) this.attachStageInput(el);
    }
    attachMouseEvents (canvas) {
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('touchmove', this.onMouseMove);
        document.addEventListener('touchend', this.onMouseUp);
        document.addEventListener('contextmenu', this.onContextMenu, true);
        this.attachStageInput(canvas);
        this.attachPointerBlockers(canvas);
    }
    detachMouseEvents (canvas) {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('touchmove', this.onMouseMove);
        document.removeEventListener('touchend', this.onMouseUp);
        document.removeEventListener('contextmenu', this.onContextMenu, true);
        this.detachStageInput(canvas);
        this.detachPointerBlockers(canvas);
    }
    attachRectEvents () {
        window.addEventListener('resize', this.updateRect);
        window.addEventListener('scroll', this.updateRect);
    }
    detachRectEvents () {
        window.removeEventListener('resize', this.updateRect);
        window.removeEventListener('scroll', this.updateRect);
    }
    updateRect () {
        this.rect = this.canvas.getBoundingClientRect();
    }
    isStageEvent (e) {
        const t = e.target;
        if (!t || !this.canvas) return false;
        if (t === this.canvas || t === this.canvas3d) return true;
        const wrap = this.canvas.parentNode;
        const stack = wrap && wrap.parentNode;
        return Boolean(
            (wrap && wrap.contains(t)) ||
            (stack && stack.contains(t))
        );
    }
    is3DWorld () {
        return Boolean(
            this.renderer &&
            ((this.renderer.is3DActive && this.renderer.is3DActive()) ||
                (this.renderer.scene && this.renderer.scene.enabled))
        );
    }
    canOrbit3D () {
        if (!this.renderer || !this.renderer.orbitCamera) return false;
        if (this.is3DWorld()) return true;
        const scene = this.renderer.scene;
        return Boolean(scene && scene.objects && scene.objects.size > 0);
    }
    onContextMenu (e) {
        if (!this.isStageEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    onPointerDown (e) {
        if (e.button === 2 || e.button === 1) {
            this.onMouseDown(e);
            if (e.currentTarget && e.pointerId != null && e.currentTarget.setPointerCapture) {
                try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                } catch (err) { // eslint-disable-line no-unused-vars
                    // Capture is optional; document mousemove still drives the orbit.
                }
            }
        }
    }
    beginCameraDrag (e) {
        if (!this.canOrbit3D()) return false;
        const right = e.button === 2;
        const middle = e.button === 1;
        if (!right && !middle) return false;
        this.updateRect();
        this._orbiting = right && !e.shiftKey;
        this._panning = middle || (right && e.shiftKey);
        if (this.renderer.scene) {
            this.renderer.scene.pointer.rightDown = right;
            this.renderer.scene.enable();
        }
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        return true;
    }
    onGizmoAxisDown (axis, e) {
        e.preventDefault();
        e.stopPropagation();
        this.updateRect();
        const {x, y} = getEventXY(e);
        this._lastPointer = [x - this.rect.left, y - this.rect.top];
        const target = this.getGizmoTarget();
        if (!target) return;
        this._gizmoDrag = {
            axis,
            mode: this.state.gizmoMode,
            target
        };
        this.setState({gizmoAxis: axis});
    }
    setGizmoMode (mode) {
        this.setState({gizmoMode: mode});
        if (this.renderer && this.renderer.scene) {
            this.renderer.scene.gizmoMode = mode;
        }
    }
    getGizmoTarget () {
        const id = this.props.editingTarget ||
            (this.props.vm.editingTarget && this.props.vm.editingTarget.id);
        if (!id) return null;
        const target = this.props.vm.runtime.getTargetById(id);
        if (!target || target.isStage || !target.mesh) return null;
        return target;
    }
    tickGizmo () {
        this._gizmoRaf = requestAnimationFrame(this.tickGizmo);
        if (this.props.isRunning) {
            this.applyGameTelemetry();
        }
        if (this.renderer && this.renderer.scene && this.renderer.scene.pointer &&
            !this._orbiting && !this._panning && !this._gizmoDrag && !this._movedThisFrame) {
            this.renderer.scene.pointer.dx = 0;
            this.renderer.scene.pointer.dy = 0;
        }
        this._movedThisFrame = false;
        if (this._orbiting || this._panning) {
            return;
        }
        const now = Date.now();
        if (now - this._lastGizmoTick < 50) {
            return;
        }
        this._lastGizmoTick = now;
        if (!this.is3DWorld() || !this.renderer.projectPoint) {
            if (this.state.showGizmo) this.setState({showGizmo: false, gizmoOrigin: null});
            return;
        }
        const target = this.getGizmoTarget();
        if (!target) {
            if (!this.state.showGizmo || this.state.gizmoOrigin) {
                this.setState({showGizmo: true, gizmoOrigin: null});
            }
            return;
        }
        const size = {width: this.rect.width, height: this.rect.height};
        const origin = this.renderer.projectPoint(target.x, target.y, target.z, size);
        if (!origin) {
            if (this.state.showGizmo) this.setState({showGizmo: false, gizmoOrigin: null});
            return;
        }
        const axisLen = 40;
        const px = this.renderer.projectPoint(target.x + axisLen, target.y, target.z, size);
        const py = this.renderer.projectPoint(target.x, target.y + axisLen, target.z, size);
        const pz = this.renderer.projectPoint(target.x, target.y, target.z + axisLen, size);
        const dir = (p, fallback) => {
            if (!p) return fallback;
            const dx = p.x - origin.x;
            const dy = p.y - origin.y;
            const len = Math.hypot(dx, dy) || 1;
            return {x: dx / len, y: dy / len};
        };
        const axes = {
            x: dir(px, {x: 1, y: 0}),
            y: dir(py, {x: 0, y: -1}),
            z: dir(pz, {x: 0.7, y: 0.7})
        };
        const same =
            this.state.showGizmo &&
            this.state.gizmoOrigin &&
            Math.abs(this.state.gizmoOrigin.x - origin.x) < 0.6 &&
            Math.abs(this.state.gizmoOrigin.y - origin.y) < 0.6;
        if (!same) {
            this.setState({showGizmo: true, gizmoOrigin: origin, gizmoAxes: axes});
        }
        if (this.renderer.scene) {
            this.renderer.scene.gizmoMode = this.state.gizmoMode;
        }
    }
    hitGizmoAxis (mouseX, mouseY) {
        const origin = this.state.gizmoOrigin;
        const axes = this.state.gizmoAxes;
        if (!origin || !axes) return null;
        const len = 56;
        let best = null;
        let bestD = 14;
        ['x', 'y', 'z'].forEach(axis => {
            const dir = axes[axis];
            if (!dir) return;
            const ex = origin.x + (dir.x * len);
            const ey = origin.y + (dir.y * len);
            const vx = ex - origin.x;
            const vy = ey - origin.y;
            const wx = mouseX - origin.x;
            const wy = mouseY - origin.y;
            const v2 = (vx * vx) + (vy * vy) || 1;
            let t = ((wx * vx) + (wy * vy)) / v2;
            t = Math.max(0, Math.min(1, t));
            const px = origin.x + (vx * t);
            const py = origin.y + (vy * t);
            const d = Math.hypot(mouseX - px, mouseY - py);
            if (d < bestD) {
                bestD = d;
                best = axis;
            }
        });
        return best;
    }
    getScratchCoords (x, y) {
        const nativeSize = this.renderer.getNativeSize();
        return [
            (nativeSize[0] / this.rect.width) * (x - (this.rect.width / 2)),
            (nativeSize[1] / this.rect.height) * (y - (this.rect.height / 2))
        ];
    }
    getColorInfo (x, y) {
        return {
            x: x,
            y: y,
            ...this.renderer.extractColor(x, y, colorPickerRadius)
        };
    }
    handleDoubleClick (e) {
        const {x, y} = getEventXY(e);
        // Set editing target from cursor position, if clicking on a sprite.
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        const drawableId = this.renderer.pick(mousePosition[0], mousePosition[1]);
        if (drawableId === null) return;
        const targetId = this.props.vm.getTargetIdForDrawableId(drawableId);
        if (targetId === null) return;
        this.props.vm.setEditingTarget(targetId);
    }
    onMouseMove (e) {
        if (!this.rect) this.updateRect();
        const {x, y} = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];

        if (!this._orbiting && !this._panning && this.canOrbit3D() && typeof e.buttons === 'number') {
            const overStage = this.rect &&
                x >= this.rect.left && x <= this.rect.right &&
                y >= this.rect.top && y <= this.rect.bottom;
            if (overStage && (e.buttons & 2)) {
                this._orbiting = !e.shiftKey;
                this._panning = Boolean(e.shiftKey);
                if (this.renderer.scene) {
                    this.renderer.scene.pointer.rightDown = true;
                    this.renderer.scene.enable();
                }
            } else if (overStage && (e.buttons & 4)) {
                this._panning = true;
            }
        }

        if (this._lastPointer) {
            const dx = mousePosition[0] - this._lastPointer[0];
            const dy = mousePosition[1] - this._lastPointer[1];
            this._movedThisFrame = true;
            if (this.renderer && this.renderer.scene && this.renderer.scene.pointer) {
                this.renderer.scene.pointer.dx = dx;
                this.renderer.scene.pointer.dy = dy;
            }
            if (this._orbiting && this.renderer && this.renderer.orbitCamera) {
                this.renderer.orbitCamera(dx, dy);
            } else if (this._panning && this.renderer && this.renderer.panCamera) {
                this.renderer.panCamera(dx, dy);
            } else if (this._gizmoDrag) {
                this.applyGizmoDrag(dx, dy);
            }
        }
        this._lastPointer = mousePosition;

        if (this.props.isColorPicking) {
            // Set the pickX/Y for the color picker loop to pick up
            this.pickX = mousePosition[0];
            this.pickY = mousePosition[1];
        }

        if (this.state.mouseDown && !this.state.isDragging) {
            const distanceFromMouseDown = Math.sqrt(
                Math.pow(mousePosition[0] - this.state.mouseDownPosition[0], 2) +
                Math.pow(mousePosition[1] - this.state.mouseDownPosition[1], 2)
            );
            if (distanceFromMouseDown > dragThreshold) {
                this.cancelMouseDownTimeout();
                this.onStartDrag(...this.state.mouseDownPosition);
            }
        }
        if (this.state.mouseDown && this.state.isDragging) {
            // Editor drag style only updates the drag canvas, does full update at the end of drag
            // Non-editor drag style just updates the sprite continuously.
            if (this.props.useEditorDragStyle) {
                this.positionDragCanvas(mousePosition[0], mousePosition[1]);
            } else {
                const spritePosition = this.getScratchCoords(mousePosition[0], mousePosition[1]);
                this.props.vm.postSpriteInfo({
                    x: spritePosition[0] + this.state.dragOffset[0],
                    y: -(spritePosition[1] + this.state.dragOffset[1]),
                    force: true
                });
            }
        }
        const coordinates = {
            x: mousePosition[0],
            y: mousePosition[1],
            canvasWidth: this.rect.width,
            canvasHeight: this.rect.height
        };
        this.props.vm.postIOData('mouse', coordinates);
    }
    onMouseUp (e) {
        const {x, y} = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        this.cancelMouseDownTimeout();
        this._orbiting = false;
        this._panning = false;
        this._gizmoDrag = null;
        if (this.renderer && this.renderer.scene && this.renderer.scene.pointer) {
            this.renderer.scene.pointer.rightDown = false;
            this.renderer.scene.pointer.dx = 0;
            this.renderer.scene.pointer.dy = 0;
        }
        this.setState({
            mouseDown: false,
            mouseDownPosition: null,
            gizmoAxis: null
        });
        const data = {
            isDown: false,
            x: x - this.rect.left,
            y: y - this.rect.top,
            canvasWidth: this.rect.width,
            canvasHeight: this.rect.height,
            wasDragged: this.state.isDragging
        };
        if (this.state.isDragging) {
            this.onStopDrag(mousePosition[0], mousePosition[1]);
        }
        this.props.vm.postIOData('mouse', data);

        if (this.props.isColorPicking &&
            mousePosition[0] > 0 && mousePosition[0] < this.rect.width &&
            mousePosition[1] > 0 && mousePosition[1] < this.rect.height
        ) {
            const {r, g, b} = this.state.colorInfo.color;
            const componentToString = c => {
                const hex = c.toString(16);
                return hex.length === 1 ? `0${hex}` : hex;
            };
            const colorString = `#${componentToString(r)}${componentToString(g)}${componentToString(b)}`;
            this.props.onDeactivateColorPicker(colorString);
            this.setState({colorInfo: null});
            this.pickX = null;
            this.pickY = null;
        }
    }
    onMouseDown (e) {
        if (e.timeStamp && this._downStamp === e.timeStamp && this._downButton === e.button) {
            return;
        }
        this._downStamp = e.timeStamp;
        this._downButton = e.button;
        this.updateRect();
        const {x, y} = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        if (this.props.isColorPicking) {
            // Set the pickX/Y for the color picker loop to pick up
            this.pickX = mousePosition[0];
            this.pickY = mousePosition[1];
            // Immediately update the color picker info
            this.setState({colorInfo: this.getColorInfo(this.pickX, this.pickY)});
        } else {
            this._lastPointer = mousePosition;
            if (this.beginCameraDrag(e)) {
                return;
            } else if (this.is3DWorld() && e.button === 0) {
                const axis = this.hitGizmoAxis(mousePosition[0], mousePosition[1]);
                if (axis) {
                    this._gizmoDrag = {
                        axis,
                        mode: this.state.gizmoMode,
                        target: this.getGizmoTarget()
                    };
                    this.setState({gizmoAxis: axis});
                    e.preventDefault();
                } else if (this.renderer.pickObject3D) {
                    const drawableId = this.renderer.pickObject3D(mousePosition[0], mousePosition[1]);
                    if (drawableId != null) {
                        const targetId = this.props.vm.getTargetIdForDrawableId(drawableId);
                        if (targetId) this.props.vm.setEditingTarget(targetId);
                    }
                    this.setState({
                        mouseDown: true,
                        mouseDownPosition: mousePosition,
                        mouseDownTimeoutId: setTimeout(
                            this.onStartDrag.bind(this, mousePosition[0], mousePosition[1]),
                            400
                        )
                    });
                }
            } else if (e.button === 0 || (window.TouchEvent && e instanceof TouchEvent)) {
                this.setState({
                    mouseDown: true,
                    mouseDownPosition: mousePosition,
                    mouseDownTimeoutId: setTimeout(
                        this.onStartDrag.bind(this, mousePosition[0], mousePosition[1]),
                        400
                    )
                });
            }
            const data = {
                isDown: true,
                x: mousePosition[0],
                y: mousePosition[1],
                canvasWidth: this.rect.width,
                canvasHeight: this.rect.height
            };
            this.props.vm.postIOData('mouse', data);
            if (e.preventDefault) {
                // Prevent default to prevent touch from dragging page
                e.preventDefault();
                // But we do want any active input to be blurred
                if (document.activeElement && document.activeElement.blur) {
                    document.activeElement.blur();
                }
            }
        }
    }
    onWheel (e) {
        if (e.timeStamp && this._wheelStamp === e.timeStamp) return;
        this._wheelStamp = e.timeStamp;
        if (this.canOrbit3D() && this.renderer.zoomCamera) {
            e.preventDefault();
            this.renderer.zoomCamera(e.deltaY);
            return;
        }
        const data = {
            deltaX: e.deltaX,
            deltaY: e.deltaY
        };
        this.props.vm.postIOData('mouseWheel', data);
    }
    applyGizmoDrag (dx, dy) {
        const drag = this._gizmoDrag;
        if (!drag || !drag.target || !this.state.gizmoAxes[drag.axis]) return;
        const dir = this.state.gizmoAxes[drag.axis];
        const along = (dx * dir.x) + (dy * dir.y);
        const target = drag.target;
        if (drag.mode === 'rotate') {
            const rot = {
                x: target.rotationX || 0,
                y: target.rotationY || 0,
                z: target.rotationZ || 0
            };
            rot[drag.axis] += along * 0.6;
            target.setRotation3D(rot.x, rot.y, rot.z);
        } else if (drag.mode === 'scale') {
            const next = {
                x: target.scaleX || 1,
                y: target.scaleY || 1,
                z: target.scaleZ || 1
            };
            next[drag.axis] = Math.max(0.05, next[drag.axis] + (along * 0.012));
            target.setScale3D(next.x, next.y, next.z);
        } else {
            const step = along * 0.85;
            const pos = {x: target.x, y: target.y, z: target.z || 0};
            pos[drag.axis] += step;
            target.setXYZ(pos.x, pos.y, pos.z, true);
        }
    }
    cancelMouseDownTimeout () {
        if (this.state.mouseDownTimeoutId !== null) {
            clearTimeout(this.state.mouseDownTimeoutId);
        }
        this.setState({mouseDownTimeoutId: null});
    }
    /**
     * Initialize the position of the "dragged sprite" canvas
     * @param {DrawableExtraction} drawableData The data returned from renderer.extractDrawableScreenSpace
     * @param {number} x The x position of the initial drag event
     * @param {number} y The y position of the initial drag event
     */
    drawDragCanvas (drawableData, x, y) {
        const {
            imageData,
            x: boundsX,
            y: boundsY,
            width: boundsWidth,
            height: boundsHeight
        } = drawableData;
        this.dragCanvas.width = imageData.width;
        this.dragCanvas.height = imageData.height;
        // On high-DPI devices, the canvas size in layout-pixels is not equal to the size of the extracted data.
        this.dragCanvas.style.width = `${boundsWidth}px`;
        this.dragCanvas.style.height = `${boundsHeight}px`;

        this.dragCanvas.getContext('2d').putImageData(imageData, 0, 0);
        // Position so that pick location is at (0, 0) so that  positionDragCanvas()
        // can use translation to move to mouse position smoothly.
        this.dragCanvas.style.left = `${boundsX - x}px`;
        this.dragCanvas.style.top = `${boundsY - y}px`;
        this.dragCanvas.style.display = 'block';
    }
    clearDragCanvas () {
        this.dragCanvas.width = this.dragCanvas.height = 0;
        this.dragCanvas.style.display = 'none';
    }
    positionDragCanvas (mouseX, mouseY) {
        // mouseX/Y are relative to stage top/left, and dragCanvas is already
        // positioned so that the pick location is at (0,0).
        this.dragCanvas.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
    }
    onStartDrag (x, y) {
        if (this.state.dragId) return;
        
        // Targets with no attached drawable cannot be dragged.
        let draggableTargets = this.props.vm.runtime.targets.filter(
            target => Number.isFinite(target.drawableID)
        );

        // Because pick queries can be expensive, only perform them for drawables that are currently draggable.
        // If we're in the editor, we can drag all targets. Otherwise, filter.
        if (!this.props.useEditorDragStyle) {
            draggableTargets = draggableTargets.filter(
                target => target.draggable
            );
        }
        if (draggableTargets.length === 0) return;

        const draggableIDs = draggableTargets.map(target => target.drawableID);
        const drawableId = this.renderer.pick(x, y, 1, 1, draggableIDs);
        if (drawableId === null) return;
        const targetId = this.props.vm.getTargetIdForDrawableId(drawableId);
        if (targetId === null) return;

        const target = this.props.vm.runtime.getTargetById(targetId);

        // Dragging always brings the target to the front
        target.goToFront();

        const [scratchMouseX, scratchMouseY] = this.getScratchCoords(x, y);
        const offsetX = target.x - scratchMouseX;
        const offsetY = -(target.y + scratchMouseY);

        this.props.vm.startDrag(targetId);
        this.setState({
            isDragging: true,
            dragId: targetId,
            dragOffset: [offsetX, offsetY]
        });
        if (this.props.useEditorDragStyle) {
            // Extract the drawable art
            const drawableData = this.renderer.extractDrawableScreenSpace(drawableId);
            this.drawDragCanvas(drawableData, x, y);
            this.positionDragCanvas(x, y);
            this.props.vm.postSpriteInfo({visible: false});
            this.props.vm.renderer.draw();
        }
    }
    onStopDrag (mouseX, mouseY) {
        const dragId = this.state.dragId;
        const commonStopDragActions = () => {
            this.props.vm.stopDrag(dragId);
            this.setState({
                isDragging: false,
                dragOffset: null,
                dragId: null
            });
        };
        if (this.props.useEditorDragStyle) {
            // Need to sequence these actions to prevent flickering.
            const spriteInfo = {visible: true};
            // First update the sprite position if dropped in the stage.
            if (mouseX > 0 && mouseX < this.rect.width &&
                mouseY > 0 && mouseY < this.rect.height) {
                const spritePosition = this.getScratchCoords(mouseX, mouseY);
                spriteInfo.x = spritePosition[0] + this.state.dragOffset[0];
                spriteInfo.y = -(spritePosition[1] + this.state.dragOffset[1]);
                spriteInfo.force = true;
            }
            this.props.vm.postSpriteInfo(spriteInfo);
            // Then clear the dragging canvas and stop drag (potentially slow if selecting sprite)
            this.clearDragCanvas();
            commonStopDragActions();
            this.props.vm.renderer.draw();
        } else {
            commonStopDragActions();
        }
    }
    setDragCanvas (canvas) {
        this.dragCanvas = canvas;
    }
    render () {
        const {
            vm,
            onActivateColorPicker,
            ...props
        } = this.props;
        return (
            <StageComponent
                canvas={this.canvas}
                canvas3d={this.canvas3d}
                colorInfo={this.state.colorInfo}
                dragRef={this.setDragCanvas}
                question={this.state.question}
                onDoubleClick={this.handleDoubleClick}
                onQuestionAnswered={this.handleQuestionAnswered}
                showGizmo={this.state.showGizmo && this.is3DWorld()}
                gizmoOrigin={this.state.gizmoOrigin}
                gizmoAxes={this.state.gizmoAxes}
                gizmoMode={this.state.gizmoMode}
                gizmoAxis={this.state.gizmoAxis}
                onGizmoMode={this.setGizmoMode}
                onGizmoAxisDown={this.onGizmoAxisDown}
                onContextMenu={this.onContextMenu}
                onMouseDown={this.onMouseDown}
                onWheel={this.onWheel}
                stageStackRef={this.setStageStack}
                isRunning={this.props.isRunning}
                {...props}
            />
        );
    }
}

Stage.propTypes = {
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isStarted: PropTypes.bool,
    isRunning: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onActivateColorPicker: PropTypes.func,
    onDeactivateColorPicker: PropTypes.func,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool,
    editingTarget: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

Stage.defaultProps = {
    useEditorDragStyle: true
};

const mapStateToProps = state => ({
    isColorPicking: state.scratchGui.colorPicker.active,
    isFullScreen: state.scratchGui.mode.isFullScreen,
    isStarted: state.scratchGui.vmStatus.started,
    isRunning: state.scratchGui.vmStatus.running,
    micIndicator: state.scratchGui.micIndicator,
    // Do not use editor drag style in fullscreen or player mode.
    useEditorDragStyle: !(state.scratchGui.mode.isFullScreen || state.scratchGui.mode.isPlayerOnly),
    editingTarget: state.scratchGui.targets.editingTarget
});

const mapDispatchToProps = dispatch => ({
    onActivateColorPicker: () => dispatch(activateColorPicker()),
    onDeactivateColorPicker: color => dispatch(deactivateColorPicker(color))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Stage);
