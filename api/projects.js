/**
 * Vercel serverless store for shared Scratch projects.
 * In-memory on the current instance; uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 */

const memory = globalThis.__scratchSharedProjects || new Map();
globalThis.__scratchSharedProjects = memory;

const blobPut = async (id, payload) => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return false;
    const response = await fetch(`https://blob.vercel-storage.com/scratch-projects/${id}.json`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-vercel-blob-access': 'public'
        },
        body: JSON.stringify(payload)
    });
    return response.ok;
};

const blobGet = async id => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    const response = await fetch(`https://blob.vercel-storage.com/scratch-projects/${id}.json`, {
        headers: {Authorization: `Bearer ${token}`}
    });
    if (!response.ok) return null;
    return response.json();
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method === 'GET') {
        const id = String((req.query && req.query.id) || '');
        if (!id) {
            res.status(400).json({error: 'missing id'});
            return;
        }
        let record = memory.get(id);
        if (!record) record = await blobGet(id);
        if (!record) {
            res.status(404).json({error: 'not found'});
            return;
        }
        res.status(200).json(record);
        return;
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const id = String(body.id || Date.now());
        if (!body.data) {
            res.status(400).json({error: 'missing data'});
            return;
        }
        const record = {
            id,
            title: body.title || 'Untitled',
            data: body.data
        };
        memory.set(id, record);
        await blobPut(id, record);
        res.status(200).json({id, title: record.title});
        return;
    }

    res.status(405).json({error: 'method not allowed'});
};
