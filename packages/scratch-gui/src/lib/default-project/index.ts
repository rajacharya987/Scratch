import projectData from './project-data';
import {TranslatorFunction} from '../../gui-config';

const blankSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"><rect width="2" height="2" fill="none"/></svg>';
const stageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#10151c"/></svg>';
const hudSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="78" viewBox="0 0 480 78"><defs><linearGradient id="hudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1b1c26" stop-opacity="0.92"/><stop offset="100%" stop-color="#0f1118" stop-opacity="0.96"/></linearGradient></defs><rect x="8" y="8" width="464" height="62" rx="12" fill="url(#hudGrad)" stroke="#f1a852" stroke-width="1.5"/><circle cx="26" cy="39" r="6" fill="#f1a852"/><text x="40" y="36" fill="#ffe0b2" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">GOLDEN HOUR 3D</text><text x="40" y="55" fill="#f5c893" font-family="Arial, sans-serif" font-size="11" font-weight="600">W / ↑ DRIVE  •  S / ↓ BRAKE  •  A D / ← → STEER  •  SPACE BOOST  •  🪙 COLLECT COINS</text></svg>';
const menuSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0e131d" stop-opacity="0.92"/><stop offset="100%" stop-color="#06080d" stop-opacity="0.96"/></linearGradient><linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff9d42"/><stop offset="100%" stop-color="#e65100"/></linearGradient></defs><rect x="24" y="24" width="432" height="312" rx="20" fill="url(#bgGrad)" stroke="#ff9d42" stroke-width="2"/><text x="240" y="90" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="900" letter-spacing="4">GOLDEN HOUR 3D</text><text x="240" y="118" text-anchor="middle" fill="#f5c893" font-family="Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2">ENDLESS HIGHWAY ARCADE</text><rect x="140" y="145" width="200" height="48" rx="24" fill="url(#btnGrad)" stroke="#ffffff" stroke-width="1.5"/><text x="240" y="175" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2">▶ START DRIVE</text><text x="240" y="215" text-anchor="middle" fill="#ffe0b2" font-family="Arial, sans-serif" font-size="11" font-weight="700">CLICK HERE OR PRESS [SPACE] / [W] TO START</text><rect x="48" y="240" width="384" height="68" rx="10" fill="#141a24" stroke="#2a3545" stroke-width="1"/><text x="240" y="262" text-anchor="middle" fill="#ffd700" font-family="Arial, sans-serif" font-size="11" font-weight="800">🪙 COLLECT GOLD COINS ALONG THE ROAD</text><text x="240" y="284" text-anchor="middle" fill="#a0aec0" font-family="Arial, sans-serif" font-size="10" font-weight="600">W / ↑ THROTTLE  •  S / ↓ BRAKE  •  A / D STEER  •  SPACE NITRO  •  C CAM</text></svg>';

declare function require (path: 'fastestsmallesttextencoderdecoder'): {TextEncoder: typeof TextEncoder};

const defaultProject = (translator?: TranslatorFunction) => {
    let _TextEncoder: typeof TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: 'c933b6961759d82d4eb6afaec8d3041b',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(blankSvg)
    }, {
        id: '731a5ebbcda035d8869c9b4661005a96',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(stageSvg)
    }, {
        id: 'fec522f88bcf9f28ac2096eeb11a28cc',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(hudSvg)
    }, {
        id: '21c24655fa9ba51c20cda69dbd87dc6b',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(menuSvg)
    }];
};

export default defaultProject;
