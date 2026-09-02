/**
 * Project Encryption and Standalone Packaging Utilities for Scratch
 */

const MAGIC = new Uint8Array([0x53, 0x42, 0x33, 0x45]); // 'SB3E'
const FORMAT_VERSION = 1;
const FLAG_PASSWORD_PROTECTED = 0x01;
const DEFAULT_KEY_SEED = 'scratch-project-secure-v1-key-salt-seed-7f9a2b';

/**
 * Browser-safe TextEncoder resolver
 */
const getTextEncoder = () => {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder();
    return {
        encode: str => {
            const arr = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xFF;
            return arr;
        }
    };
};

/**
 * Browser-safe Crypto resolver
 */
const getCrypto = () => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
    if (typeof window !== 'undefined' && window.crypto) return window.crypto;
    if (typeof self !== 'undefined' && self.crypto) return self.crypto;
    return null;
};

/**
 * Convert Uint8Array to base64 string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const uint8ArrayToBase64 = bytes => {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
};

/**
 * Convert base64 string to Uint8Array
 * @param {string} base64
 * @returns {Uint8Array}
 */
export const base64ToUint8Array = base64 => {
    const cleanBase64 = base64.replace(/[\s\r\n]+/g, '');
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

/**
 * Check if given buffer represents an encrypted Scratch project (.sb3e)
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {boolean}
 */
export const isEncryptedProject = data => {
    if (!data) return false;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length < 34) return false;
    return bytes[0] === MAGIC[0] &&
        bytes[1] === MAGIC[1] &&
        bytes[2] === MAGIC[2] &&
        bytes[3] === MAGIC[3];
};

/**
 * Check if an encrypted payload requires a custom password
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {boolean}
 */
export const isPasswordProtected = data => {
    if (!isEncryptedProject(data)) return false;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const flags = bytes[5];
    return (flags & FLAG_PASSWORD_PROTECTED) !== 0;
};

/**
 * Derive AES-GCM CryptoKey using PBKDF2
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {object} cryptoObj
 * @returns {Promise<CryptoKey>}
 */
async function deriveKeyWebCrypto (password, salt, cryptoObj) {
    const enc = getTextEncoder();
    const keyMaterial = await cryptoObj.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return cryptoObj.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Compute 4-byte checksum for fallback cipher
 * @param {Uint8Array} data
 * @param {string} keyString
 * @returns {Uint8Array}
 */
function computeChecksum (data, keyString) {
    const enc = getTextEncoder();
    const keyBytes = enc.encode(keyString);
    let hash = 2166136261;
    for (let i = 0; i < keyBytes.length; i++) {
        hash = Math.imul(hash ^ keyBytes[i], 16777619);
    }
    for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 16777619);
    }
    const tag = new Uint8Array(4);
    tag[0] = (hash >>> 24) & 0xFF;
    tag[1] = (hash >>> 16) & 0xFF;
    tag[2] = (hash >>> 8) & 0xFF;
    tag[3] = hash & 0xFF;
    return tag;
}

/**
 * Fallback XOR cipher when Web Crypto subtle is unavailable
 * @param {Uint8Array} data
 * @param {string} keyString
 * @param {Uint8Array} salt
 * @param {Uint8Array} iv
 * @returns {Uint8Array}
 */
function fallbackCipherEncrypt (data, keyString, salt, iv) {
    const enc = getTextEncoder();
    const keyBytes = enc.encode(keyString + salt.join('') + iv.join(''));
    const tag = computeChecksum(data, keyString);
    const result = new Uint8Array(data.length + 4);
    for (let i = 0; i < data.length; i++) {
        const keyByte = keyBytes[(i + iv[i % iv.length]) % keyBytes.length];
        result[i] = data[i] ^ keyByte ^ ((i * 37 + salt[i % salt.length]) & 0xFF);
    }
    result.set(tag, data.length);
    return result;
}

/**
 * Fallback XOR decrypt
 * @param {Uint8Array} ciphertext
 * @param {string} keyString
 * @param {Uint8Array} salt
 * @param {Uint8Array} iv
 * @returns {Uint8Array}
 */
function fallbackCipherDecrypt (ciphertext, keyString, salt, iv) {
    if (ciphertext.length < 4) {
        throw new Error('Ciphertext too short');
    }
    const dataLen = ciphertext.length - 4;
    const tag = ciphertext.subarray(dataLen);
    const enc = getTextEncoder();
    const keyBytes = enc.encode(keyString + salt.join('') + iv.join(''));
    const plaintext = new Uint8Array(dataLen);
    for (let i = 0; i < dataLen; i++) {
        const keyByte = keyBytes[(i + iv[i % iv.length]) % keyBytes.length];
        plaintext[i] = ciphertext[i] ^ keyByte ^ ((i * 37 + salt[i % salt.length]) & 0xFF);
    }
    const expectedTag = computeChecksum(plaintext, keyString);
    if (tag[0] !== expectedTag[0] || tag[1] !== expectedTag[1] || tag[2] !== expectedTag[2] || tag[3] !== expectedTag[3]) {
        const err = new Error('Incorrect password or corrupted project data.');
        err.code = 'DECRYPT_FAILED';
        throw err;
    }
    return plaintext;
}

/**
 * Encrypt project buffer with AES-GCM 256
 * @param {ArrayBuffer|Uint8Array} projectData
 * @param {string=} password Optional custom password
 * @returns {Promise<Uint8Array>}
 */
export async function encryptProject (projectData, password = '') {
    const inputBytes = projectData instanceof Uint8Array ?
        projectData :
        new Uint8Array(projectData);

    const hasCustomPassword = typeof password === 'string' && password.trim().length > 0;
    const effectivePass = hasCustomPassword ? password.trim() : DEFAULT_KEY_SEED;

    const cryptoObj = getCrypto();
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    if (cryptoObj && cryptoObj.getRandomValues) {
        cryptoObj.getRandomValues(salt);
        cryptoObj.getRandomValues(iv);
    } else {
        for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
        for (let i = 0; i < 12; i++) iv[i] = Math.floor(Math.random() * 256);
    }

    let ciphertext;
    if (cryptoObj && cryptoObj.subtle) {
        try {
            const key = await deriveKeyWebCrypto(effectivePass, salt, cryptoObj);
            const cipherBuffer = await cryptoObj.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                inputBytes
            );
            ciphertext = new Uint8Array(cipherBuffer);
        } catch (e) {
            ciphertext = fallbackCipherEncrypt(inputBytes, effectivePass, salt, iv);
        }
    } else {
        ciphertext = fallbackCipherEncrypt(inputBytes, effectivePass, salt, iv);
    }

    const flags = hasCustomPassword ? FLAG_PASSWORD_PROTECTED : 0x00;
    const headerSize = 4 + 1 + 1 + 16 + 12; // Magic(4) + Ver(1) + Flags(1) + Salt(16) + IV(12) = 34 bytes
    const output = new Uint8Array(headerSize + ciphertext.length);

    output.set(MAGIC, 0);
    output[4] = FORMAT_VERSION;
    output[5] = flags;
    output.set(salt, 6);
    output.set(iv, 22);
    output.set(ciphertext, 34);

    return output;
}

/**
 * Decrypt project buffer
 * @param {ArrayBuffer|Uint8Array} encryptedData
 * @param {string=} password
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptProject (encryptedData, password = '') {
    const bytes = encryptedData instanceof Uint8Array ?
        encryptedData :
        new Uint8Array(encryptedData);

    if (!isEncryptedProject(bytes)) {
        // Not encrypted, return as is
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    const version = bytes[4];
    if (version !== FORMAT_VERSION) {
        throw new Error(`Unsupported encrypted project version: ${version}`);
    }

    const flags = bytes[5];
    const isProtected = (flags & FLAG_PASSWORD_PROTECTED) !== 0;

    let effectivePass;
    if (isProtected) {
        if (!password || password.trim().length === 0) {
            const err = new Error('This project is password protected.');
            err.code = 'PASSWORD_REQUIRED';
            throw err;
        }
        effectivePass = password.trim();
    } else {
        effectivePass = (password && password.trim().length > 0) ? password.trim() : DEFAULT_KEY_SEED;
    }

    const salt = bytes.subarray(6, 22);
    const iv = bytes.subarray(22, 34);
    const ciphertext = bytes.subarray(34);

    const cryptoObj = getCrypto();
    if (cryptoObj && cryptoObj.subtle) {
        try {
            const key = await deriveKeyWebCrypto(effectivePass, salt, cryptoObj);
            const decrypted = await cryptoObj.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                ciphertext
            );
            return decrypted;
        } catch (e) {
            // Check if fallback cipher was used
            try {
                const fallbackDecrypted = fallbackCipherDecrypt(ciphertext, effectivePass, salt, iv);
                return fallbackDecrypted.buffer.slice(
                    fallbackDecrypted.byteOffset,
                    fallbackDecrypted.byteOffset + fallbackDecrypted.byteLength
                );
            } catch (fallbackErr) {
                const err = new Error('Incorrect password or corrupted project data.');
                err.code = 'DECRYPT_FAILED';
                throw err;
            }
        }
    } else {
        const decrypted = fallbackCipherDecrypt(ciphertext, effectivePass, salt, iv);
        return decrypted.buffer.slice(
            decrypted.byteOffset,
            decrypted.byteOffset + decrypted.byteLength
        );
    }
}

/**
 * Generate a standalone self-contained single HTML player package
 * @param {string} projectTitle
 * @param {string} encryptedBase64
 * @param {boolean} isProtected
 * @returns {string}
 */
export function generateStandaloneHtml (projectTitle, encryptedBase64, isProtected) {
    const escapedTitle = (projectTitle || 'Scratch Project')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${escapedTitle}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            width: 100%; height: 100%;
            background: #11141a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            user-select: none;
        }
        #player-app {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            max-width: 960px;
            max-height: 720px;
            padding: 10px;
        }
        .stage-box {
            position: relative;
            background: #000;
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            width: 100%;
            max-width: 640px;
            aspect-ratio: 4 / 3.3;
        }
        .stage-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 44px;
            background: #242933;
            padding: 0 12px;
            border-bottom: 1px solid #333a48;
            flex-shrink: 0;
        }
        .header-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .control-btn {
            background: none;
            border: none;
            cursor: pointer;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s, transform 0.1s;
        }
        .control-btn:hover { background: rgba(255,255,255,0.1); }
        .control-btn:active { transform: scale(0.92); }
        .btn-green-flag svg { fill: #45d862; filter: drop-shadow(0 2px 4px rgba(69,216,98,0.3)); }
        .btn-stop svg { fill: #ff4d4d; filter: drop-shadow(0 2px 4px rgba(255,77,77,0.3)); }
        .btn-fullscreen svg { fill: #a0aec0; }
        .project-title {
            font-size: 14px;
            font-weight: 600;
            color: #e2e8f0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 40%;
        }
        .stage-container {
            position: relative;
            flex: 1;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        canvas#stage-canvas {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: contain;
        }
        .loading-overlay {
            position: absolute;
            inset: 0;
            background: #1e222d;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            z-index: 100;
            transition: opacity 0.3s ease;
        }
        .loading-spinner {
            width: 44px;
            height: 44px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top-color: #4c97ff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { font-size: 14px; color: #cbd5e1; }
        .password-modal {
            position: absolute;
            inset: 0;
            background: rgba(15,23,42,0.92);
            backdrop-filter: blur(6px);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            z-index: 200;
        }
        .password-card {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 24px 28px;
            border-radius: 12px;
            width: 100%;
            max-width: 360px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            text-align: center;
        }
        .password-card h3 { margin-bottom: 8px; font-size: 17px; }
        .password-card p { font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
        .password-card input {
            width: 100%;
            padding: 10px 12px;
            background: #0f172a;
            border: 1.5px solid #475569;
            border-radius: 8px;
            color: #fff;
            font-size: 14px;
            margin-bottom: 14px;
            outline: none;
        }
        .password-card input:focus { border-color: #4c97ff; }
        .password-card button {
            width: 100%;
            padding: 10px;
            background: #4c97ff;
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
        }
        .password-card button:hover { background: #3b82f6; }
        .error-msg { color: #f87171; font-size: 12px; margin-top: 8px; display: none; }
        :fullscreen .stage-box { max-width: 100%; width: 100%; height: 100%; border-radius: 0; }
        :-webkit-full-screen .stage-box { max-width: 100%; width: 100%; height: 100%; border-radius: 0; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/scratch-vm@latest/dist/web/scratch-vm.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/scratch-render@latest/dist/web/scratch-render.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/scratch-storage@latest/dist/web/scratch-storage.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/scratch-audio@latest/dist/web/scratch-audio.min.js"></script>
</head>
<body>
    <div id="player-app">
        <div class="stage-box" id="stage-box">
            <div class="stage-header">
                <div class="header-controls">
                    <button class="control-btn btn-green-flag" id="btn-green-flag" title="Go">
                        <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 3v18l14-9L6 3z"/></svg>
                    </button>
                    <button class="control-btn btn-stop" id="btn-stop" title="Stop">
                        <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                </div>
                <div class="project-title">${escapedTitle}</div>
                <div class="header-controls">
                    <button class="control-btn btn-fullscreen" id="btn-fullscreen" title="Full Screen">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                </div>
            </div>
            <div class="stage-container" id="stage-container">
                <canvas id="stage-canvas" width="480" height="360"></canvas>
                <div class="loading-overlay" id="loading-overlay">
                    <div class="loading-spinner"></div>
                    <div class="loading-text" id="loading-text">Loading encrypted project...</div>
                </div>
                <div class="password-modal" id="password-modal">
                    <div class="password-card">
                        <h3>🔒 Password Protected</h3>
                        <p>Enter the password to unlock and play this project.</p>
                        <input type="password" id="password-input" placeholder="Password" autofocus />
                        <button id="password-submit">Unlock Project</button>
                        <div class="error-msg" id="password-error">Incorrect password. Please try again.</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const ENCRYPTED_PAYLOAD = "${encryptedBase64}";
        const IS_PROTECTED = ${isProtected ? 'true' : 'false'};
        const DEFAULT_SEED = "${DEFAULT_KEY_SEED}";
        const MAGIC = [0x53, 0x42, 0x33, 0x45];

        const stageBox = document.getElementById('stage-box');
        const canvas = document.getElementById('stage-canvas');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        const passwordModal = document.getElementById('password-modal');
        const passwordInput = document.getElementById('password-input');
        const passwordSubmit = document.getElementById('password-submit');
        const passwordError = document.getElementById('password-error');
        const btnGreenFlag = document.getElementById('btn-green-flag');
        const btnStop = document.getElementById('btn-stop');
        const btnFullscreen = document.getElementById('btn-fullscreen');

        let vm = null;
        let renderer = null;

        function base64ToBytes(b64) {
            const binary = atob(b64.replace(/\\s+/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        }

        async function deriveKey(password, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
            );
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
                keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
            );
        }

        function fallbackXor(data, pass, salt, iv) {
            const enc = new TextEncoder();
            const keyBytes = enc.encode(pass + salt.join('') + iv.join(''));
            const result = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                result[i] = data[i] ^ keyBytes[(i + iv[i % iv.length]) % keyBytes.length] ^ ((i * 37 + salt[i % salt.length]) & 0xFF);
            }
            return result.buffer;
        }

        async function decryptPayload(pass) {
            const bytes = base64ToBytes(ENCRYPTED_PAYLOAD);
            if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) {
                return bytes.buffer;
            }
            const salt = bytes.subarray(6, 22);
            const iv = bytes.subarray(22, 34);
            const ciphertext = bytes.subarray(34);
            const effPass = pass || DEFAULT_SEED;

            if (typeof crypto !== 'undefined' && crypto.subtle) {
                try {
                    const key = await deriveKey(effPass, salt);
                    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
                } catch (e) {
                    return fallbackXor(ciphertext, effPass, salt, iv);
                }
            }
            return fallbackXor(ciphertext, effPass, salt, iv);
        }

        async function initPlayer(projectBuffer) {
            try {
                loadingText.innerText = 'Initializing Scratch VM...';
                const VMClass = window.VirtualMachine || window.ScratchVM || (window.scratch && window.scratch.VM);
                const RendererClass = window.ScratchRender || window.RenderWebGL;
                const StorageClass = window.ScratchStorage;
                const AudioClass = window.AudioEngine || window.ScratchAudio;

                if (!VMClass) {
                    loadingText.innerText = 'Error: Scratch runtime could not be loaded.';
                    return;
                }

                vm = new VMClass();
                if (StorageClass) vm.attachStorage(new StorageClass());
                if (RendererClass) {
                    renderer = new RendererClass(canvas);
                    vm.attachRenderer(renderer);
                }
                if (AudioClass) {
                    vm.attachAudioEngine(new AudioClass());
                }

                loadingText.innerText = 'Loading project assets...';
                await vm.loadProject(projectBuffer);
                vm.start();
                vm.greenFlag();

                loadingOverlay.style.opacity = '0';
                setTimeout(() => { loadingOverlay.style.display = 'none'; }, 300);
            } catch (err) {
                console.error(err);
                loadingText.innerText = 'Error loading project: ' + err.message;
            }
        }

        async function startApp() {
            if (IS_PROTECTED) {
                loadingOverlay.style.display = 'none';
                passwordModal.style.display = 'flex';
                passwordInput.focus();
            } else {
                try {
                    const decrypted = await decryptPayload('');
                    await initPlayer(decrypted);
                } catch (e) {
                    console.error(e);
                    passwordModal.style.display = 'flex';
                }
            }
        }

        passwordSubmit.addEventListener('click', async () => {
            const pass = passwordInput.value;
            passwordError.style.display = 'none';
            try {
                const decrypted = await decryptPayload(pass);
                passwordModal.style.display = 'none';
                loadingOverlay.style.display = 'flex';
                loadingOverlay.style.opacity = '1';
                await initPlayer(decrypted);
            } catch (e) {
                passwordError.style.display = 'block';
            }
        });

        passwordInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') passwordSubmit.click();
        });

        btnGreenFlag.addEventListener('click', () => {
            if (vm) {
                vm.stopAll();
                vm.greenFlag();
            }
        });

        btnStop.addEventListener('click', () => {
            if (vm) vm.stopAll();
        });

        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (stageBox.requestFullscreen) stageBox.requestFullscreen();
                else if (stageBox.webkitRequestFullscreen) stageBox.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });

        window.addEventListener('load', startApp);
    </script>
</body>
</html>`;
}
