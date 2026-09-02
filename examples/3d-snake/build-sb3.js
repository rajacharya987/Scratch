const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '../..');
const guiDefault = path.join(root, 'packages/scratch-gui/src/lib/default-project');

const projectData = require('./project-data.cjs').default;
const json = projectData();

const zip = new JSZip();
zip.file('project.json', JSON.stringify(json));

const assets = [
    '83a9787d4cb6f3b7632b4ddfebf74367.wav',
    '83c36d806dc92327b9e7049a565c6bff.wav',
    'cd21514d0531fdffb22204e0ec5ed84a.svg',
    'bcf454acf82e4504149f7ffe07081dbc.svg',
    '0fb9be3e8397c983338cb71dc84d0b25.svg'
];
assets.forEach(name => {
    zip.file(name, fs.readFileSync(path.join(guiDefault, name)));
});

zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}).then(buf => {
    const out = path.join(__dirname, '3d-snake.sb3');
    fs.writeFileSync(out, buf);
    console.log('wrote', out, buf.length, 'bytes');
});
