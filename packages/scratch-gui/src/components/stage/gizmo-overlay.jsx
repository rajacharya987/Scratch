import PropTypes from 'prop-types';
import React from 'react';
import styles from './gizmo-overlay.css';

const AXIS_COLORS = {x: '#ff4d4f', y: '#52c41a', z: '#1890ff'};

const GizmoOverlay = props => {
    const {
        visible,
        origin,
        axes,
        mode,
        activeAxis,
        onModeChange,
        onAxisDown
    } = props;
    const blockMenu = e => {
        e.preventDefault();
        e.stopPropagation();
    };
    if (!visible || !origin) {
        return (
            <div
                className={styles.bar}
                onContextMenu={blockMenu}
            >
                <span className={styles.hint}>Right-drag to look · scroll to zoom</span>
            </div>
        );
    }
    const len = 56;
    const axisLine = axis => {
        const dir = axes[axis];
        if (!dir) return null;
        const endX = origin.x + (dir.x * len);
        const endY = origin.y + (dir.y * len);
        const color = AXIS_COLORS[axis];
        const thick = activeAxis === axis ? 5 : 3;
        const startDrag = e => {
            if (e.button && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (onAxisDown) onAxisDown(axis, e);
        };
        return (
            <g key={axis}>
                <line
                    className={styles.hit}
                    x1={origin.x}
                    y1={origin.y}
                    x2={endX}
                    y2={endY}
                    stroke={color}
                    strokeWidth={thick}
                    strokeLinecap="round"
                    onMouseDown={startDrag}
                    onPointerDown={startDrag}
                />
                <line
                    className={styles.hitWide}
                    x1={origin.x}
                    y1={origin.y}
                    x2={endX}
                    y2={endY}
                    stroke="transparent"
                    strokeWidth="16"
                    strokeLinecap="round"
                    onMouseDown={startDrag}
                    onPointerDown={startDrag}
                />
                {mode === 'scale' ? (
                    <rect
                        className={styles.hit}
                        x={endX - 5}
                        y={endY - 5}
                        width={10}
                        height={10}
                        fill={color}
                        stroke="#fff"
                        strokeWidth="1"
                        onMouseDown={startDrag}
                        onPointerDown={startDrag}
                    />
                ) : mode === 'rotate' ? (
                    <circle
                        className={styles.hit}
                        cx={endX}
                        cy={endY}
                        r={7}
                        fill="none"
                        stroke={color}
                        strokeWidth={activeAxis === axis ? 3 : 2}
                        onMouseDown={startDrag}
                        onPointerDown={startDrag}
                    />
                ) : (
                    <polygon
                        className={styles.hit}
                        points={`${endX},${endY} ${endX - (dir.x * 12) + (dir.y * 5)},${endY - (dir.y * 12) - (dir.x * 5)} ${endX - (dir.x * 12) - (dir.y * 5)},${endY - (dir.y * 12) + (dir.x * 5)}`}
                        fill={color}
                        onMouseDown={startDrag}
                        onPointerDown={startDrag}
                    />
                )}
            </g>
        );
    };
    return (
        <div
            className={styles.wrap}
            onContextMenu={blockMenu}
        >
            <div className={styles.bar}>
                {['move', 'rotate', 'scale'].map(item => (
                    <button
                        key={item}
                        className={mode === item ? styles.btnOn : styles.btn}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                            e.stopPropagation();
                            onModeChange(item);
                        }}
                        type="button"
                    >
                        {item}
                    </button>
                ))}
                <span className={styles.hint}>Right-drag look · Shift-right pan · scroll zoom</span>
            </div>
            <svg className={styles.svg}>
                <circle
                    cx={origin.x}
                    cy={origin.y}
                    r={5}
                    fill="#fff"
                    stroke="#333"
                    strokeWidth="1.5"
                />
                {['x', 'y', 'z'].map(axisLine)}
            </svg>
        </div>
    );
};

GizmoOverlay.propTypes = {
    visible: PropTypes.bool,
    origin: PropTypes.shape({x: PropTypes.number, y: PropTypes.number}),
    axes: PropTypes.object,
    mode: PropTypes.string,
    activeAxis: PropTypes.string,
    onModeChange: PropTypes.func,
    onAxisDown: PropTypes.func
};

GizmoOverlay.defaultProps = {
    visible: false,
    axes: {},
    mode: 'move',
    onModeChange: () => {}
};

export default GizmoOverlay;
