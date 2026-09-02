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

    // Reload the embedded game iframe when stop button is clicked
    const hasMountedRef = useRef(false);
    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }
        if (!isStarted && iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src; // eslint-disable-line no-self-assign
        }
    }, [isStarted]);

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
                        title="Golden Hour 3D Driving"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            zIndex: 8
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
                    <Box className={styles.monitorWrapper}>
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
                {isStarted ? null : (
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
