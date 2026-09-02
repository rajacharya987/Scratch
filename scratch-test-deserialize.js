const fs = require('fs');
const path = require('path');
const Runtime = require('./packages/scratch-vm/src/engine/runtime');
const sb3 = require('./packages/scratch-vm/src/serialization/sb3');

const projectPath = path.resolve(process.argv[2] || 'golden_hour_3d_driving.json');

const validate = async () => {
    const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const extensionSource = fs.readFileSync('./packages/scratch-vm/src/extensions/scratch3_threed/index.js', 'utf8');
    const supportedOpcodes = new Set([...extensionSource.matchAll(/opcode: '([^']+)'/g)]
        .map(match => `threed_${match[1]}`));
    const unknownOpcodes = project.targets.flatMap(target => Object.values(target.blocks)
        .map(block => block.opcode)
        .filter(opcode => opcode.startsWith('threed_') && !opcode.startsWith('threed_menu_') && !supportedOpcodes.has(opcode)));

    if (unknownOpcodes.length) {
        throw new Error(`Project uses unsupported 3D blocks: ${[...new Set(unknownOpcodes)].join(', ')}`);
    }
    if (!project.extensions.includes('threed') || !project.targets.some(target => target.name === 'Player Car')) {
        throw new Error('Project is missing the 3D extension or Player Car target');
    }

    const runtime = new Runtime();
    const deserialized = await sb3.deserialize(project, runtime);
    if (deserialized.targets.length !== project.targets.length) {
        throw new Error(`Expected ${project.targets.length} targets, loaded ${deserialized.targets.length}`);
    }

    console.log(`Validated ${path.basename(projectPath)}: ${project.targets.length} targets and no unknown 3D blocks.`);
};

validate().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
