import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import ShareModalComponent from '../components/share-modal/share-modal.jsx';
import {
    encryptProject,
    uint8ArrayToBase64,
    generateStandaloneHtml
} from '../lib/project-encryption';
import downloadBlob from '../lib/download-blob';
import {storeProjectThumbnail} from '../lib/store-project-thumbnail';

class ShareModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            thumbnailUrl: null,
            isExporting: false,
            webPlayerUrl: '',
            embedCode: ''
        };
        this.handleOpenWebPlayer = this.handleOpenWebPlayer.bind(this);
        this.handleExportHtml = this.handleExportHtml.bind(this);
        this.handleExportSb3e = this.handleExportSb3e.bind(this);
        this.handleCopyEmbed = this.handleCopyEmbed.bind(this);
        this.handleCopyLink = this.handleCopyLink.bind(this);
        this.getEncryptedData = this.getEncryptedData.bind(this);
    }

    componentDidMount () {
        if (this.props.vm) {
            storeProjectThumbnail(this.props.vm, dataURI => {
                this.setState({thumbnailUrl: dataURI});
            });
        }
        this.updateUrls();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.isOpen !== this.props.isOpen && this.props.isOpen) {
            if (this.props.vm) {
                storeProjectThumbnail(this.props.vm, dataURI => {
                    this.setState({thumbnailUrl: dataURI});
                });
            }
            this.updateUrls();
        }
    }

    updateUrls () {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8601';
        const webPlayerUrl = `${origin}/player.html`;
        const embedCode = `<iframe src="${webPlayerUrl}" width="485" height="402" allowfullscreen allow="gamepad; autoplay; fullscreen" style="border:none; border-radius:12px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.15);"></iframe>`;
        this.setState({webPlayerUrl, embedCode});
    }

    async getEncryptedData (password = '') {
        const rawBuffer = await this.props.vm.saveProjectSb3('uint8array');
        const encryptedBytes = await encryptProject(rawBuffer, password);
        return encryptedBytes;
    }

    async handleOpenWebPlayer (password = '') {
        this.setState({isExporting: true});
        try {
            const encryptedBytes = await this.getEncryptedData(password);
            const b64 = uint8ArrayToBase64(encryptedBytes);
            const storageKey = `scratch_enc_proj_${Date.now()}`;
            try {
                sessionStorage.setItem(storageKey, b64);
                sessionStorage.setItem('scratch_active_encrypted_project', b64);
            } catch (e) {
                // Storage limit fallback
            }

            const origin = window.location.origin;
            let playerUrl = `${origin}/player.html`;
            if (b64.length < 1500) {
                playerUrl += `#enc=${encodeURIComponent(b64)}`;
            } else {
                playerUrl += `#key=${storageKey}`;
            }

            window.open(playerUrl, '_blank');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to prepare web player:', err);
        } finally {
            this.setState({isExporting: false});
        }
    }

    async handleExportHtml (password = '') {
        this.setState({isExporting: true});
        try {
            const encryptedBytes = await this.getEncryptedData(password);
            const b64 = uint8ArrayToBase64(encryptedBytes);
            const isProtected = typeof password === 'string' && password.trim().length > 0;
            const htmlContent = generateStandaloneHtml(
                this.props.projectTitle,
                b64,
                isProtected
            );
            const blob = new Blob([htmlContent], {type: 'text/html;charset=utf-8'});
            const cleanTitle = (this.props.projectTitle || 'Scratch_Project').replace(/[^a-zA-Z0-9_-]/g, '_');
            downloadBlob(`${cleanTitle}_Player.html`, blob);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to export standalone HTML:', err);
        } finally {
            this.setState({isExporting: false});
        }
    }

    async handleExportSb3e (password = '') {
        this.setState({isExporting: true});
        try {
            const encryptedBytes = await this.getEncryptedData(password);
            const blob = new Blob([encryptedBytes], {type: 'application/x.scratch.sb3e'});
            const cleanTitle = (this.props.projectTitle || 'Scratch_Project').replace(/[^a-zA-Z0-9_-]/g, '_');
            downloadBlob(`${cleanTitle}.sb3e`, blob);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to export .sb3e:', err);
        } finally {
            this.setState({isExporting: false});
        }
    }

    async handleCopyLink (password = '', onSuccess) {
        this.setState({isExporting: true});
        try {
            const encryptedBytes = await this.getEncryptedData(password);
            const b64 = uint8ArrayToBase64(encryptedBytes);
            const storageKey = `scratch_enc_proj_${Date.now()}`;
            try {
                sessionStorage.setItem(storageKey, b64);
                sessionStorage.setItem('scratch_active_encrypted_project', b64);
            } catch (e) {
                // Storage limit
            }

            const origin = window.location.origin;
            let playerUrl = `${origin}/player.html`;
            if (b64.length < 1500) {
                playerUrl += `#enc=${encodeURIComponent(b64)}`;
            } else {
                playerUrl += `#key=${storageKey}`;
            }

            await navigator.clipboard.writeText(playerUrl);
            this.setState({webPlayerUrl: playerUrl});
            if (onSuccess) onSuccess();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to copy link:', err);
        } finally {
            this.setState({isExporting: false});
        }
    }

    handleCopyEmbed () {
        // Handled directly in presentation component with updated embed code
    }

    render () {
        return (
            <ShareModalComponent
                embedCode={this.state.embedCode}
                isExporting={this.state.isExporting}
                isOpen={this.props.isOpen}
                projectTitle={this.props.projectTitle}
                thumbnailUrl={this.state.thumbnailUrl}
                webPlayerUrl={this.state.webPlayerUrl}
                onClose={this.props.onClose}
                onCopyEmbed={this.handleCopyEmbed}
                onCopyLink={this.handleCopyLink}
                onExportHtml={this.handleExportHtml}
                onExportSb3e={this.handleExportSb3e}
                onOpenWebPlayer={this.handleOpenWebPlayer}
            />
        );
    }
}

ShareModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    vm: state.scratchGui.vm
});

export default connect(mapStateToProps)(ShareModal);
