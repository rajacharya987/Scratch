/**
 * Store shared Scratch projects in IndexedDB (always) and optionally
 * publish them to /api/projects so a Vercel-hosted editor can serve them.
 */

const DB_NAME = 'scratch-shared-projects';
const STORE_NAME = 'projects';
const memory = new Map();

const toBase64 = bytes => {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const fromBase64 = b64 => {
    const binary = atob(b64);
    const u8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        u8[i] = binary.charCodeAt(i);
    }
    return u8;
};

const openDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const putSharedProject = async (id, record) => {
    const key = String(id);
    memory.set(key, record);
    const db = await openDb();
    if (!db) return record;
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    return record;
};

const getSharedProject = async id => {
    const key = String(id);
    if (memory.has(key)) return memory.get(key);
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => {
            const value = request.result || null;
            if (value) memory.set(key, value);
            resolve(value);
        };
        request.onerror = () => reject(request.error);
    });
};

const publishSharedProject = async (id, buffer, title) => {
    if (typeof fetch === 'undefined') return null;
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id: String(id),
                title: title || 'Untitled',
                data: toBase64(buffer)
            })
        });
        if (!response.ok) return null;
        return response.json();
    } catch (e) { // eslint-disable-line no-unused-vars
        return null;
    }
};

const fetchPublishedProject = async id => {
    if (typeof fetch === 'undefined') return null;
    try {
        const response = await fetch(`/api/projects?id=${encodeURIComponent(id)}`);
        if (!response.ok) return null;
        const body = await response.json();
        if (!body || !body.data) return null;
        const record = {
            title: body.title,
            buffer: fromBase64(body.data).buffer
        };
        await putSharedProject(id, record);
        return record;
    } catch (e) { // eslint-disable-line no-unused-vars
        return null;
    }
};

const loadSharedProjectBytes = async id => {
    const local = await getSharedProject(id);
    if (local && local.buffer) return local.buffer;
    const published = await fetchPublishedProject(id);
    return published && published.buffer ? published.buffer : null;
};

const playerUrlForId = id => {
    if (typeof window === 'undefined') return `/player.html#${id}`;
    return `${window.location.origin}/player.html#${id}`;
};

module.exports = {
    putSharedProject,
    getSharedProject,
    publishSharedProject,
    fetchPublishedProject,
    loadSharedProjectBytes,
    playerUrlForId,
    toBase64,
    fromBase64
};
