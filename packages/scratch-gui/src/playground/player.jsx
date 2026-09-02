import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef, useCallback} from 'react';
import ReactDomClient from 'react-dom/client';
import {connect} from 'react-redux';
import {compose} from 'redux';

import Box from '../components/box/box.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import AppStateHOC from '../lib/app-state-hoc.jsx';

import {setPlayer} from '../reducers/mode';
import {
    base64ToUint8Array,
    decryptProject,
    isEncryptedProject,
    isPasswordProtected
} from '../lib/project-encryption';

if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
    window.onbeforeunload = () => true;
}

import styles from './player.css';

const Player = ({isPlayerOnly, onSeeInside, projectId}) => {
    const [vmInstance, setVmInstance] = useState(null);
    const [encryptedBytes, setEncryptedBytes] = useState(null);
    const [needsPassword, setNeedsPassword] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState(null);
    const [isDecryptedAndLoaded, setIsDecryptedAndLoaded] = useState(false);
    const passwordInputRef = useRef(null);

    // Extract encrypted payload from URL hash or sessionStorage
    useEffect(() => {
        const parsePayload = () => {
            const hash = window.location.hash;
            let rawB64 = null;

            if (hash.includes('#enc=')) {
                rawB64 = decodeURIComponent(hash.split('#enc=')[1]);
            } else if (hash.includes('#key=')) {
                const key = decodeURIComponent(hash.split('#key=')[1]);
                rawB64 = sessionStorage.getItem(key);
            }

            if (!rawB64) {
                rawB64 = sessionStorage.getItem('scratch_active_encrypted_project');
            }

            if (rawB64) {
                try {
                    const bytes = base64ToUint8Array(rawB64);
                    setEncryptedBytes(bytes);
                    if (isPasswordProtected(bytes)) {
                        setNeedsPassword(true);
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn('Failed to parse payload bytes:', e);
                }
            }
        };

        parsePayload();
        window.addEventListener('hashchange', parsePayload);
        return () => window.removeEventListener('hashchange', parsePayload);
    }, []);

    // Load decrypted project into VM
    const loadBytesIntoVm = useCallback(async (bytes, password = '') => {
        if (!vmInstance || !bytes) return;
        try {
            let buffer;
            if (isEncryptedProject(bytes)) {
                buffer = await decryptProject(bytes, password);
            } else {
                buffer = bytes.buffer || bytes;
            }
            await vmInstance.loadProject(buffer);
            vmInstance.start();
            vmInstance.greenFlag();
            setIsDecryptedAndLoaded(true);
            setNeedsPassword(false);
            setPasswordError(null);
        } catch (err) {
            if (err.code === 'PASSWORD_REQUIRED' || isPasswordProtected(bytes)) {
                setNeedsPassword(true);
                setPasswordError('Please enter the password to unlock this project.');
            } else {
                setPasswordError('Incorrect password or invalid project data.');
            }
        }
    }, [vmInstance]);

    // Auto-decrypt if not password protected once VM is ready
    useEffect(() => {
        if (vmInstance && encryptedBytes && !needsPassword && !isDecryptedAndLoaded) {
            loadBytesIntoVm(encryptedBytes, '');
        }
    }, [vmInstance, encryptedBytes, needsPassword, isDecryptedAndLoaded, loadBytesIntoVm]);

    // Focus password input when modal opens
    useEffect(() => {
        if (needsPassword && passwordInputRef.current) {
            passwordInputRef.current.focus();
        }
    }, [needsPassword]);

    const handlePasswordSubmit = (e) => {
        e.preventDefault();
        if (encryptedBytes) {
            loadBytesIntoVm(encryptedBytes, passwordInput);
        }
    };

    const handleVmInit = (vm) => {
        setVmInstance(vm);
    };

    // Drag and drop handler for .sb3 and .sb3e files
    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            setEncryptedBytes(bytes);
            if (isPasswordProtected(bytes)) {
                setNeedsPassword(true);
            } else {
                setNeedsPassword(false);
                loadBytesIntoVm(bytes, '');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    return (
        <div
            className={styles.playerWrapper}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <div className={styles.topBarControls}>
                <button
                    className={styles.seeInsideBtn}
                    onClick={onSeeInside}
                >
                    {'✏️ See Inside Editor'}
                </button>
            </div>

            <Box className={classNames(isPlayerOnly ? styles.stageOnly : styles.editor)}>
                <GUI
                    canEditTitle
                    enableCommunity
                    isPlayerOnly={isPlayerOnly}
                    projectId={projectId}
                    onVmInit={handleVmInit}
                />
            </Box>

            {/* Password Unlock Modal */}
            {needsPassword && (
                <div className={styles.passwordModalOverlay}>
                    <form className={styles.passwordCard} onSubmit={handlePasswordSubmit}>
                        <div className={styles.passwordIcon}>{'🔒'}</div>
                        <h2 className={styles.passwordTitle}>{'Project Protected'}</h2>
                        <p className={styles.passwordDesc}>
                            {'This Scratch project is encrypted with password protection. Enter the password to unlock and run.'}
                        </p>
                        <input
                            ref={passwordInputRef}
                            type="password"
                            className={styles.passwordInput}
                            placeholder="Enter password..."
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                        />
                        <button type="submit" className={styles.passwordSubmitBtn}>
                            {'Unlock & Play'}
                        </button>
                        {passwordError && (
                            <div className={styles.passwordError}>{passwordError}</div>
                        )}
                    </form>
                </div>
            )}
        </div>
    );
};

Player.propTypes = {
    isPlayerOnly: PropTypes.bool,
    onSeeInside: PropTypes.func,
    projectId: PropTypes.string
};

const mapStateToProps = state => ({
    isPlayerOnly: state.scratchGui.mode.isPlayerOnly
});

const mapDispatchToProps = dispatch => ({
    onSeeInside: () => dispatch(setPlayer(false))
});

const ConnectedPlayer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Player);

const WrappedPlayer = compose(
    AppStateHOC,
    HashParserHOC
)(ConnectedPlayer);

const appTarget = document.createElement('div');
document.body.appendChild(appTarget);

const root = ReactDomClient.createRoot(appTarget);
root.render(<WrappedPlayer isPlayerOnly />);
