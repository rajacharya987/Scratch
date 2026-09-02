import PropTypes from 'prop-types';
import React, {useState} from 'react';
import classNames from 'classnames';

import Modal from '../modal/modal.jsx';
import styles from './share-modal.css';

import greenFlagIcon from '../green-flag/icon--green-flag.svg';
import stopAllIcon from '../stop-all/icon--stop-all.svg';
import fullScreenIcon from '../stage-header/icon--fullscreen.svg';

const ShareModalComponent = function (props) {
    const {
        isOpen,
        onClose,
        projectTitle,
        thumbnailUrl,
        onOpenWebPlayer,
        onExportHtml,
        onExportSb3e,
        onCopyEmbed,
        onCopyLink,
        webPlayerUrl,
        embedCode,
        isExporting
    } = props;

    const [activeTab, setActiveTab] = useState('web'); // 'web', 'html', 'embed', 'file'
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [copiedKey, setCopiedKey] = useState(null);

    if (!isOpen) return null;

    const handleCopy = (key, text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2500);
        });
    };

    const effectivePassword = usePassword ? password : '';

    return (
        <Modal
            className={styles.modalContent}
            contentLabel="🔗 Share & Export Project"
            onRequestClose={onClose}
        >
            <div className={styles.modalBody}>
                {/* Visual Scratch Player Preview */}
                <div className={styles.playerPreviewCard}>
                    <div className={styles.previewStageHeader}>
                        <div className={styles.previewControls}>
                            <img
                                alt="Go"
                                className={styles.previewFlagIcon}
                                src={greenFlagIcon}
                            />
                            <img
                                alt="Stop"
                                className={styles.previewStopIcon}
                                src={stopAllIcon}
                            />
                        </div>
                        <div className={styles.previewTitle}>
                            {projectTitle || 'Untitled Project'}
                        </div>
                        <div className={styles.previewControls}>
                            <img
                                alt="Full Screen"
                                className={styles.previewFullscreenIcon}
                                src={fullScreenIcon}
                            />
                        </div>
                    </div>
                    <div className={styles.previewStageView}>
                        {thumbnailUrl ? (
                            <img
                                alt={projectTitle}
                                className={styles.previewThumbnail}
                                src={thumbnailUrl}
                            />
                        ) : (
                            <div style={{color: '#94a3b8', fontSize: 13, fontWeight: 500}}>
                                {'🎮 Scratch Stage Player View'}
                            </div>
                        )}
                        <div className={styles.previewBadge}>
                            {'🔒 AES-GCM Encrypted'}
                        </div>
                    </div>
                </div>

                {/* Encryption Settings */}
                <div className={styles.encryptionSection}>
                    <div className={styles.encryptionHeader}>
                        <div className={styles.encryptionTitle}>
                            <span>{'🛡️'}</span>
                            <span>{'Project Security & Code Protection'}</span>
                        </div>
                        <label style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#166534'}}>
                            <input
                                type="checkbox"
                                checked={usePassword}
                                onChange={e => setUsePassword(e.target.checked)}
                            />
                            {'Set Password'}
                        </label>
                    </div>
                    <p className={styles.encryptionDesc}>
                        {'Your project code and assets are encrypted with AES-256. Code and sprites cannot be extracted without decryption.'}
                    </p>
                    {usePassword && (
                        <div className={styles.passwordRow}>
                            <input
                                type="password"
                                className={styles.passwordInput}
                                placeholder="Enter password to lock project..."
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {/* Navigation Tabs */}
                <div className={styles.tabRow}>
                    <button
                        className={classNames(styles.tabBtn, {[styles.active]: activeTab === 'web'})}
                        onClick={() => setActiveTab('web')}
                    >
                        {'🎮 Web Player'}
                    </button>
                    <button
                        className={classNames(styles.tabBtn, {[styles.active]: activeTab === 'html'})}
                        onClick={() => setActiveTab('html')}
                    >
                        {'📦 Standalone HTML'}
                    </button>
                    <button
                        className={classNames(styles.tabBtn, {[styles.active]: activeTab === 'embed'})}
                        onClick={() => setActiveTab('embed')}
                    >
                        {'💻 Embed'}
                    </button>
                    <button
                        className={classNames(styles.tabBtn, {[styles.active]: activeTab === 'file'})}
                        onClick={() => setActiveTab('file')}
                    >
                        {'🔒 .sb3e File'}
                    </button>
                </div>

                {/* Tab: Web Player */}
                {activeTab === 'web' && (
                    <div className={styles.tabContent}>
                        <div className={styles.cardActionRow}>
                            <div className={styles.actionCard}>
                                <div className={styles.actionCardTitle}>
                                    {'▶️ Direct Play'}
                                </div>
                                <p className={styles.actionCardDesc}>
                                    {'Launch the Scratch player view in a clean standalone window.'}
                                </p>
                                <button
                                    className={styles.btnPrimary}
                                    disabled={isExporting}
                                    onClick={() => onOpenWebPlayer(effectivePassword)}
                                >
                                    {isExporting ? 'Preparing...' : 'Open Web Player'}
                                </button>
                            </div>
                            <div className={styles.actionCard}>
                                <div className={styles.actionCardTitle}>
                                    {'🔗 Shareable Link'}
                                </div>
                                <p className={styles.actionCardDesc}>
                                    {'Copy the web player link to share with players.'}
                                </p>
                                <button
                                    className={classNames(styles.btnSecondary, {
                                        [styles.btnSuccess]: copiedKey === 'link'
                                    })}
                                    onClick={() => onCopyLink(effectivePassword, () => setCopiedKey('link'))}
                                >
                                    {copiedKey === 'link' ? '✓ Copied Link!' : 'Copy Player Link'}
                                </button>
                            </div>
                        </div>
                        <div className={styles.inputGroup}>
                            <input
                                readOnly
                                className={styles.codeInput}
                                value={webPlayerUrl}
                                onFocus={e => e.target.select()}
                            />
                            <button
                                className={classNames(styles.btnPrimary, {
                                    [styles.btnSuccess]: copiedKey === 'url'
                                })}
                                onClick={() => handleCopy('url', webPlayerUrl)}
                            >
                                {copiedKey === 'url' ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab: Standalone HTML */}
                {activeTab === 'html' && (
                    <div className={styles.tabContent}>
                        <div className={styles.actionCard}>
                            <div className={styles.actionCardTitle}>
                                {'📦 Standalone Offline Game (.html)'}
                            </div>
                            <p className={styles.actionCardDesc}>
                                {'Download a single self-contained HTML file. Anyone can double-click it to play in their browser without an internet connection or installing Scratch.'}
                            </p>
                            <button
                                className={styles.btnPrimary}
                                disabled={isExporting}
                                onClick={() => onExportHtml(effectivePassword)}
                            >
                                {isExporting ? 'Generating HTML Package...' : '💾 Download HTML Player Package'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab: Embed */}
                {activeTab === 'embed' && (
                    <div className={styles.tabContent}>
                        <p style={{fontSize: 13, color: '#64748b', margin: 0}}>
                            {'Embed this Scratch stage player into any website or blog with interactive controls:'}
                        </p>
                        <div className={styles.inputGroup}>
                            <input
                                readOnly
                                className={styles.codeInput}
                                value={embedCode}
                                onFocus={e => e.target.select()}
                            />
                            <button
                                className={classNames(styles.btnPrimary, {
                                    [styles.btnSuccess]: copiedKey === 'embed'
                                })}
                                onClick={() => {
                                    onCopyEmbed(effectivePassword);
                                    handleCopy('embed', embedCode);
                                }}
                            >
                                {copiedKey === 'embed' ? '✓ Copied!' : 'Copy Embed'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab: Encrypted File */}
                {activeTab === 'file' && (
                    <div className={styles.tabContent}>
                        <div className={styles.actionCard}>
                            <div className={styles.actionCardTitle}>
                                {'🔒 Encrypted Scratch Project (.sb3e)'}
                            </div>
                            <p className={styles.actionCardDesc}>
                                {'Download the project as an encrypted binary package. Can be loaded back into Scratch GUI or player by importing.'}
                            </p>
                            <button
                                className={styles.btnPrimary}
                                disabled={isExporting}
                                onClick={() => onExportSb3e(effectivePassword)}
                            >
                                {isExporting ? 'Encrypting...' : '🔒 Download .sb3e Project'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

ShareModalComponent.propTypes = {
    embedCode: PropTypes.string,
    isExporting: PropTypes.bool,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCopyEmbed: PropTypes.func.isRequired,
    onCopyLink: PropTypes.func.isRequired,
    onExportHtml: PropTypes.func.isRequired,
    onExportSb3e: PropTypes.func.isRequired,
    onOpenWebPlayer: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    thumbnailUrl: PropTypes.string,
    webPlayerUrl: PropTypes.string
};

export default ShareModalComponent;
