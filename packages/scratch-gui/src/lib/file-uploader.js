import {BitmapAdapter, sanitizeSvg} from '@scratch/scratch-svg-renderer';
import randomizeSpritePosition from './randomize-sprite-position.js';
import bmpConverter from './bmp-converter';
import gifDecoder from './gif-decoder';
import {renderMeshThumbnail, loadMergedModel} from '@scratch/scratch-render';

const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'dae', 'ply', '3ds'];

const is3DModel = function (fileName = '', fileType = '') {
    const ext = String(fileName || '').toLowerCase().split('.').pop();
    if (MODEL_EXTENSIONS.includes(ext)) return true;
    if (fileType && (fileType.startsWith('model/') || fileType === 'application/octet-stream')) {
        return MODEL_EXTENSIONS.includes(ext);
    }
    return false;
};

/**
 * Extract the file name given a string of the form fileName + ext
 * @param {string} nameExt File name + extension (e.g. 'my_image.png')
 * @returns {string} The name without the extension, or the full name if
 * there was no '.' in the string (e.g. 'my_image')
 */
const extractFileName = function (nameExt) {
    const lastDot = nameExt.lastIndexOf('.');
    if (lastDot === -1) return nameExt;
    return nameExt.substring(0, lastDot);
};

/**
 * Handle a file upload given the input element that contains the file,
 * and a function to handle loading the file.
 * @param {Input} fileInput The <input/> element that contains the file being loaded
 * @param {Function} onload The function that handles loading the file
 * @param {Function} onerror The function that handles any error loading the file
 */
const handleFileUpload = function (fileInput, onload, onerror) {
    const readFile = (i, files) => {
        if (i === files.length) {
            fileInput.value = null;
            return;
        }
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
            const fileType = file.type;
            const fileName = extractFileName(file.name);
            onload(reader.result, fileType, fileName, i, files.length, file.name);
            readFile(i + 1, files);
        };
        reader.onerror = onerror;
        reader.readAsArrayBuffer(file);
    };
    readFile(0, fileInput.files);
};

/**
 * @typedef VMAsset
 * @property {string} name The user-readable name of this asset
 * @property {string} dataFormat The data format of this asset
 * @property {string} md5 The md5 hash of the asset data, followed by '.' and dataFormat
 * @property {string} assetId The md5 hash of the asset data
 */

/**
 * Create an asset (costume, sound) with storage and return an object representation
 * of the asset to track in the VM.
 * @param {ScratchStorage} storage The storage to cache the asset in
 * @param {AssetType} assetType A ScratchStorage AssetType indicating what kind of asset this is
 * @param {string} dataFormat The format of this data (typically the file extension)
 * @param {Uint8Array} data The asset data buffer
 * @returns {VMAsset} An object representing this asset
 */
const createVMAsset = function (storage, assetType, dataFormat, data) {
    const asset = storage.createAsset(
        assetType,
        dataFormat,
        data,
        null,
        true // generate md5
    );

    return {
        name: null, // Needs to be set by caller
        dataFormat: dataFormat,
        asset: asset,
        md5: `${asset.assetId}.${dataFormat}`,
        assetId: asset.assetId
    };
};

/**
 * Handles loading a costume or a backdrop using the provided, context-relevant information.
 * @param {ArrayBuffer | string} fileData The costume data to load
 * @param {string} fileType The MIME type of this file
 * @param {ScratchStorage} storage The ScratchStorage instance to cache the costume data
 * @param {Function} handleCostume The function to execute on the costume object returned
 * @param {Function} handleError The function to execute if there is an error
 * @param {string} [optFullFileName=''] Optional full file name with extension
 */
const costumeUpload = function (fileData, fileType, storage, handleCostume, handleError = () => {}, optFullFileName = '') {
    if (is3DModel(optFullFileName, fileType)) {
        try {
            const {customMesh, material} = loadMergedModel(fileData, optFullFileName || '');
            let pngDataUri = null;
            try {
                pngDataUri = renderMeshThumbnail(customMesh, material && material.albedo);
            } catch (_) {
                pngDataUri = null;
            }

            let pngBytes;
            if (pngDataUri && pngDataUri.startsWith('data:image/png;base64,')) {
                const base64 = pngDataUri.split(',')[1];
                const binary = typeof atob === 'function' ?
                    atob(base64) : Buffer.from(base64, 'base64').toString('binary');
                pngBytes = new Uint8Array(binary.length);
                for (let b = 0; b < binary.length; b++) {
                    pngBytes[b] = binary.charCodeAt(b);
                }
            } else {
                // 1x1 fallback PNG
                pngBytes = new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
                    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
                    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
                    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
                    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
                    0x42, 0x60, 0x82
                ]);
            }

            const vmCostume = createVMAsset(
                storage,
                storage.AssetType.ImageBitmap,
                storage.DataFormat.PNG,
                pngBytes
            );
            vmCostume.name = optFullFileName || '3D Model';
            vmCostume.rotationCenterX = 48;
            vmCostume.rotationCenterY = 48;
            vmCostume.bitmapResolution = 1;
            vmCostume.mesh = optFullFileName || 'custom';
            vmCostume.customMesh = {
                positions: Array.from(customMesh.positions),
                normals: Array.from(customMesh.normals),
                uvs: Array.from(customMesh.uvs),
                indices: Array.from(customMesh.indices)
            };
            vmCostume.material3d = material;

            handleCostume([vmCostume]);
            return;
        } catch (err) {
            handleError(`Failed to load 3D model: ${err.message}`);
            return;
        }
    }

    let costumeFormat = null;
    let assetType = null;
    switch (fileType) {
    case 'image/svg+xml': {
        // run svg bytes through scratch-svg-renderer's sanitization code
        fileData = sanitizeSvg.sanitizeByteStream(fileData);

        costumeFormat = storage.DataFormat.SVG;
        assetType = storage.AssetType.ImageVector;
        break;
    }
    case 'image/jpeg': {
        costumeFormat = storage.DataFormat.JPG;
        assetType = storage.AssetType.ImageBitmap;
        break;
    }
    case 'image/bmp': {
        bmpConverter(fileData).then(dataUrl => {
            costumeUpload(dataUrl, 'image/png', storage, handleCostume);
        });
        return;
    }
    case 'image/png': {
        costumeFormat = storage.DataFormat.PNG;
        assetType = storage.AssetType.ImageBitmap;
        break;
    }
    case 'image/gif': {
        let costumes = [];
        gifDecoder(fileData, (frameNumber, dataUrl, numFrames) => {
            costumeUpload(dataUrl, 'image/png', storage, costumes_ => {
                costumes = costumes.concat(costumes_);
                if (frameNumber === numFrames - 1) {
                    handleCostume(costumes);
                }
            }, handleError);
        });
        return;
    }
    default:
        handleError(`Encountered unexpected file type: ${fileType}`);
        return;
    }

    const bitmapAdapter = new BitmapAdapter();
    const addCostumeFromBuffer = function (dataBuffer) {
        const vmCostume = createVMAsset(
            storage,
            assetType,
            costumeFormat,
            dataBuffer
        );
        handleCostume([vmCostume]);
    };

    if (costumeFormat === storage.DataFormat.SVG) {
        addCostumeFromBuffer(new Uint8Array(fileData));
    } else {
        bitmapAdapter.importBitmap(fileData, fileType).then(addCostumeFromBuffer)
            .catch(handleError);
    }
};

/**
 * Handles loading a sound using the provided, context-relevant information.
 * @param {ArrayBuffer} fileData The sound data to load
 * @param {string} fileType The MIME type of this file
 * @param {ScratchStorage} storage The ScratchStorage instance to cache the sound data
 * @param {Function} handleSound The function to execute on the sound object
 * @param {Function} handleError The function to execute if there is an error
 */
const soundUpload = function (fileData, fileType, storage, handleSound, handleError) {
    let soundFormat;
    switch (fileType) {
    case 'audio/mp3':
    case 'audio/mpeg': {
        soundFormat = storage.DataFormat.MP3;
        break;
    }
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
    case 'audio/x-pn-wav': {
        soundFormat = storage.DataFormat.WAV;
        break;
    }
    default:
        handleError(`Encountered unexpected file type: ${fileType}`);
        return;
    }

    const vmSound = createVMAsset(
        storage,
        storage.AssetType.Sound,
        soundFormat,
        new Uint8Array(fileData));

    handleSound(vmSound);
};

const spriteUpload = function (fileData, fileType, spriteName, storage, handleSprite, handleError = () => {}, optFullFileName = '') {
    if (is3DModel(optFullFileName || spriteName, fileType)) {
        costumeUpload(fileData, fileType, storage, vmCostumes => {
            const costume = vmCostumes[0];
            costume.name = spriteName;
            const newSprite = {
                name: spriteName,
                isStage: false,
                x: 0,
                y: 25,
                z: 0,
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0,
                scaleX: 1,
                scaleY: 1,
                scaleZ: 1,
                mesh: optFullFileName || `${spriteName}.glb`,
                customMesh: costume.customMesh,
                material3d: costume.material3d || {
                    albedo: [0.55, 0.62, 0.95],
                    metallic: 0.05,
                    roughness: 0.45,
                    emissive: 0,
                    opacity: 1
                },
                visible: true,
                size: 100,
                rotationStyle: 'all around',
                direction: 90,
                draggable: false,
                currentCostume: 0,
                blocks: {},
                variables: {},
                costumes: vmCostumes,
                sounds: []
            };
            handleSprite(JSON.stringify(newSprite));
        }, handleError, optFullFileName || spriteName);
        return;
    }

    switch (fileType) {
    case '':
    case 'application/x-scratch3-sprite':
    case 'application/zip': {
        handleSprite(new Uint8Array(fileData));
        return;
    }
    case 'image/svg+xml':
    case 'image/png':
    case 'image/bmp':
    case 'image/jpeg':
    case 'image/gif': {
        costumeUpload(fileData, fileType, storage, vmCostumes => {
            vmCostumes.forEach((costume, i) => {
                costume.name = `${spriteName}${i ? i + 1 : ''}`;
            });
            const newSprite = {
                name: spriteName,
                isStage: false,
                x: 0,
                y: 0,
                visible: true,
                size: 100,
                rotationStyle: 'all around',
                direction: 90,
                draggable: false,
                currentCostume: 0,
                blocks: {},
                variables: {},
                costumes: vmCostumes,
                sounds: []
            };
            randomizeSpritePosition(newSprite);
            handleSprite(JSON.stringify(newSprite));
        }, handleError);
        return;
    }
    default: {
        handleError(`Encountered unexpected file type: ${fileType}`);
        return;
    }
    }
};

export {
    handleFileUpload,
    costumeUpload,
    soundUpload,
    spriteUpload
};
