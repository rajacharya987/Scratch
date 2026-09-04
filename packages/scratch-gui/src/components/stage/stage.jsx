import PropTypes from 'prop-types';
import React, {useEffect, useRef} from 'react';
import classNames from 'classnames';

import Box from '../box/box.jsx';
import DOMElementRenderer from '../../containers/dom-element-renderer.jsx';
import Loupe from '../loupe/loupe.jsx';
import MonitorList from '../../containers/monitor-list.jsx';
import TargetHighlight from '../../containers/target-highlight.jsx';
import GreenFlagOverlay from '../../containers/green-flag-overlay.jsx';
import Question from '../../containers/question.jsx';
import MicIndicator from '../mic-indicator/mic-indicator.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import {getStageDimensions} from '../../lib/screen-utils.js';
import GizmoOverlay from './gizmo-overlay.jsx';
import VM from '@scratch/scratch-vm';
import styles from './stage.css';

const StageComponent = props => {
    const iframeRef = useRef(null);
    const {
        canvas,
        canvas3d,
        dragRef,
        isColorPicking,
        isFullScreen,
        isStarted,
        isRunning,
        colorInfo,
        micIndicator,
        question,
        stageSize,
        useEditorDragStyle,
        onDeactivateColorPicker,
        onDoubleClick,
        onQuestionAnswered,
        showGizmo,
        gizmoOrigin,
        gizmoAxes,
        gizmoMode,
        gizmoAxis,
        onGizmoMode,
        onGizmoAxisDown,
        onContextMenu,
        onMouseDown,
        onWheel,
        stageStackRef,
        ...boxProps
    } = props;

    const stageDimensions = getStageDimensions(stageSize, isFullScreen);
    const stageLive = Boolean(isRunning);

    // Green flag unlocks the stage so the player can click Play in the menu.
    // Keyboard is forwarded into the iframe because Blockly otherwise steals WASD.
    // Stop reloads the game so the next flag starts from the menu again.
    const wasLiveRef = useRef(false);
    useEffect(() => {
        const frame = iframeRef.current;
        if (!frame) return undefined;
        const send = (action, extra) => {
            try {
                if (frame.contentWindow) {
                    frame.contentWindow.postMessage(Object.assign({action, type: action}, extra || {}), '*');
                }
            } catch (err) { // eslint-disable-line no-unused-vars
                // Cross-origin during first load is fine; the iframe still boots.
            }
        };
        const onLoad = () => {
            if (stageLive) {
                send('unlock');
                frame.focus();
            }
        };
        frame.addEventListener('load', onLoad);
        if (stageLive) {
            send('unlock');
            frame.focus();
        } else if (wasLiveRef.current) {
            send('stop');
            frame.src = `/static/game/index.html?r=${Date.now()}`;
        }
        wasLiveRef.current = stageLive;
        return () => frame.removeEventListener('load', onLoad);
    }, [stageLive]);
    useEffect(() => {
        if (!stageLive) return undefined;
        const gameCodes = {
            KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1,
            ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
            ShiftLeft: 1, ShiftRight: 1, Space: 1, KeyR: 1, Enter: 1
        };
        const forward = e => {
            const frame = iframeRef.current;
            if (!frame || !frame.contentWindow) return;
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (!gameCodes[e.code]) return;
            frame.contentWindow.postMessage({
                action: 'key',
                type: 'key',
                code: e.code,
                isDown: e.type === 'keydown'
            }, '*');
            e.preventDefault();
        };
        window.addEventListener('keydown', forward, true);
        window.addEventListener('keyup', forward, true);
        return () => {
            window.removeEventListener('keydown', forward, true);
            window.removeEventListener('keyup', forward, true);
        };
    }, [stageLive]);

    return (
        <React.Fragment>
            <Box
                className={classNames(
                    styles.stageWrapper,
                    {[styles.withColorPicker]: !isFullScreen && isColorPicking})}
                onDoubleClick={onDoubleClick}
            >
                <Box
                    className={classNames(
                        styles.stage,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                    style={{
                        height: stageDimensions.height,
                        width: stageDimensions.width
                    }}
                >
                    <iframe
                        ref={iframeRef}
                        className={styles.stageEmbeddedGame}
                        src="/static/game/index.html"
                        title="Scratch Stage"
                        tabIndex={stageLive ? 0 : -1}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            zIndex: 8,
                            opacity: 1,
                            pointerEvents: stageLive ? 'auto' : 'none'
                        }}
                        allow="autoplay; fullscreen"
                    />
                    <div
                        className={styles.stageCanvasStack}
                        ref={stageStackRef}
                        style={{
                            height: stageDimensions.height,
                            width: stageDimensions.width
                        }}
                        onContextMenu={onContextMenu}
                        onMouseDown={onMouseDown}
                        onWheel={onWheel}
                    >
                        {canvas3d ? (
                            <DOMElementRenderer
                                className={styles.stage3d}
                                domElement={canvas3d}
                                style={{
                                    height: stageDimensions.height,
                                    width: stageDimensions.width
                                }}
                            />
                        ) : null}
                        <DOMElementRenderer
                            className={styles.stage2d}
                            domElement={canvas}
                            style={{
                                height: stageDimensions.height,
                                width: stageDimensions.width
                            }}
                            {...boxProps}
                        />
                        {showGizmo || gizmoOrigin ? (
                            <GizmoOverlay
                                visible={showGizmo}
                                origin={gizmoOrigin}
                                axes={gizmoAxes}
                                mode={gizmoMode}
                                activeAxis={gizmoAxis}
                                onModeChange={onGizmoMode}
                                onAxisDown={onGizmoAxisDown}
                            />
                        ) : null}
                    </div>
                    <Box
                        className={styles.monitorWrapper}
                        style={{zIndex: 12}}
                    >
                        <MonitorList
                            draggable={useEditorDragStyle}
                            stageSize={stageDimensions}
                        />
                    </Box>
                    <Box className={styles.frameWrapper}>
                        <TargetHighlight
                            className={styles.frame}
                            stageHeight={stageDimensions.height}
                            stageWidth={stageDimensions.width}
                        />
                    </Box>
                    {isColorPicking && colorInfo ? (
                        <Loupe colorInfo={colorInfo} />
                    ) : null}
                </Box>

                {/* `stageOverlays` is for items that should *not* have their overflow contained within the stage */}
                <Box
                    className={classNames(
                        styles.stageOverlays,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                >
                    <div
                        className={styles.stageBottomWrapper}
                        style={{
                            width: stageDimensions.width,
                            height: stageDimensions.height
                        }}
                    >
                        {micIndicator ? (
                            <MicIndicator
                                className={styles.micIndicator}
                                stageSize={stageDimensions}
                            />
                        ) : null}
                        {question === null ? null : (
                            <div
                                className={styles.questionWrapper}
                                style={{width: stageDimensions.width}}
                            >
                                <Question
                                    question={question}
                                    onQuestionAnswered={onQuestionAnswered}
                                />
                            </div>
                        )}
                    </div>
                    <canvas
                        className={styles.draggingSprite}
                        height={0}
                        ref={dragRef}
                        width={0}
                    />
                </Box>
                {stageLive ? null : (
                    <GreenFlagOverlay
                        className={styles.greenFlagOverlay}
                        wrapperClass={styles.greenFlagOverlayWrapper}
                    />
                )}
            </Box>
            {isColorPicking ? (
                <Box
                    className={styles.colorPickerBackground}
                    onClick={onDeactivateColorPicker}
                />
            ) : null}
        </React.Fragment>
    );
};
StageComponent.propTypes = {
    canvas: PropTypes.instanceOf(Element).isRequired,
    canvas3d: PropTypes.instanceOf(Element),
    showGizmo: PropTypes.bool,
    gizmoOrigin: PropTypes.object,
    gizmoAxes: PropTypes.object,
    gizmoMode: PropTypes.string,
    gizmoAxis: PropTypes.string,
    onGizmoMode: PropTypes.func,
    onGizmoAxisDown: PropTypes.func,
    onContextMenu: PropTypes.func,
    onMouseDown: PropTypes.func,
    onWheel: PropTypes.func,
    stageStackRef: PropTypes.func,
    colorInfo: Loupe.propTypes.colorInfo,
    dragRef: PropTypes.func,
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isStarted: PropTypes.bool,
    isRunning: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onDeactivateColorPicker: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onQuestionAnswered: PropTypes.func,
    question: PropTypes.string,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool,
    vm: PropTypes.instanceOf(VM)
};
StageComponent.defaultProps = {
    dragRef: () => {}
};
export default StageComponent;
