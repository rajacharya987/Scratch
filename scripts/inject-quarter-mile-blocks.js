'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'packages', 'scratch-gui', 'src', 'lib', 'default-project', 'project-data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.targets = data.targets.filter(t => t.name !== 'Quarter Mile');

let n = 0;
const blocks = {};
const comments = {};
const id = prefix => `${prefix}_${++n}`;

function add (block) {
    blocks[block.id] = block;
    return block.id;
}

function num (parent, value) {
    const i = id('n');
    return add({
        opcode: 'math_number',
        next: null,
        parent,
        inputs: {},
        fields: {NUM: [String(value), null]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function keyMenu (parent, key) {
    const i = id('k');
    return add({
        opcode: 'sensing_keyoptions',
        next: null,
        parent,
        inputs: {},
        fields: {KEY_OPTION: [key, null]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function broadcastMenu (parent, name, bid) {
    const i = id('bm');
    return add({
        opcode: 'event_broadcast_menu',
        next: null,
        parent,
        inputs: {},
        fields: {BROADCAST_OPTION: [name, bid]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function onOffMenu (parent, value) {
    const i = id('m');
    return add({
        opcode: 'threed_menu_onOff',
        next: null,
        parent,
        inputs: {},
        fields: {onOff: [value, null]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function fogMenu (parent, value) {
    const i = id('m');
    return add({
        opcode: 'threed_menu_fogPreset',
        next: null,
        parent,
        inputs: {},
        fields: {fogPreset: [value, null]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function spriteMenu (parent, name) {
    const i = id('m');
    return add({
        opcode: 'threed_menu_sprites',
        next: null,
        parent,
        inputs: {},
        fields: {sprites: [name, null]},
        shadow: true,
        topLevel: false,
        id: i
    });
}

function cmd (opcode, parent, inputs, fields) {
    const i = id('c');
    return add({
        opcode,
        next: null,
        parent: parent || null,
        inputs: inputs || {},
        fields: fields || {},
        shadow: false,
        topLevel: !parent,
        id: i
    });
}

function link (ids) {
    for (let i = 0; i < ids.length; i++) {
        const b = blocks[ids[i]];
        b.next = ids[i + 1] || null;
        if (i > 0) b.parent = ids[i - 1];
    }
}

function setVar (parent, name, varId, value) {
    const i = cmd('data_setvariableto', parent, {}, {VARIABLE: [name, varId]});
    blocks[i].inputs.VALUE = [1, num(i, value)];
    return i;
}

function setVarText (parent, name, varId, value) {
    const i = cmd('data_setvariableto', parent, {}, {VARIABLE: [name, varId]});
    const t = id('t');
    add({
        opcode: 'text',
        next: null,
        parent: i,
        inputs: {},
        fields: {TEXT: [String(value), null]},
        shadow: true,
        topLevel: false,
        id: t
    });
    blocks[i].inputs.VALUE = [1, t];
    return i;
}

function changeVar (parent, name, varId, value) {
    const i = cmd('data_changevariableby', parent, {}, {VARIABLE: [name, varId]});
    blocks[i].inputs.VALUE = [1, num(i, value)];
    return i;
}

function wait (parent, secs) {
    const i = cmd('control_wait', parent, {});
    blocks[i].inputs.DURATION = [1, num(i, secs)];
    return i;
}

function broadcast (parent, name, bid) {
    const i = cmd('event_broadcast', parent, {});
    blocks[i].inputs.BROADCAST_INPUT = [1, broadcastMenu(i, name, bid)];
    return i;
}

function keyPressed (parent, key) {
    const i = cmd('sensing_keypressed', parent, {});
    blocks[i].inputs.KEY_OPTION = [1, keyMenu(i, key)];
    return i;
}

function ifKey (parent, key, bodyFn) {
    const iff = cmd('control_if', parent, {});
    const cond = keyPressed(iff, key);
    blocks[iff].inputs.CONDITION = [2, cond];
    const body = bodyFn(iff);
    const first = Array.isArray(body) ? body[0] : body;
    if (Array.isArray(body)) link(body);
    blocks[iff].inputs.SUBSTACK = [2, first];
    blocks[first].parent = iff;
    return iff;
}

function forever (parent, bodyIds) {
    const f = cmd('control_forever', parent, {});
    link(bodyIds);
    blocks[f].inputs.SUBSTACK = [2, bodyIds[0]];
    blocks[bodyIds[0]].parent = f;
    blocks[bodyIds[bodyIds.length - 1]].next = null;
    return f;
}

function hatFlag (x, y) {
    return add({
        opcode: 'event_whenflagclicked',
        next: null,
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x, y,
        id: id('hat')
    });
}

function hatKey (key, x, y) {
    return add({
        opcode: 'event_whenkeypressed',
        next: null,
        parent: null,
        inputs: {},
        fields: {KEY_OPTION: [key, null]},
        shadow: false,
        topLevel: true,
        x, y,
        id: id('hat')
    });
}

function hatBroadcast (name, bid, x, y) {
    return add({
        opcode: 'event_whenbroadcastreceived',
        next: null,
        parent: null,
        inputs: {},
        fields: {BROADCAST_OPTION: [name, bid]},
        shadow: false,
        topLevel: true,
        x, y,
        id: id('hat')
    });
}

function comment (blockId, text, x, y, w, h) {
    const i = id('note');
    comments[i] = {
        blockId: blockId || null,
        x, y,
        width: w || 220,
        height: h || 120,
        minimized: false,
        text
    };
    if (blockId && blocks[blockId]) blocks[blockId].comment = i;
    return i;
}

function threed (opcode, parent, makeInputs) {
    const i = cmd(`threed_${opcode}`, parent, {});
    if (makeInputs) makeInputs(i);
    return i;
}

const V = {
    speed: ['Speed (km/h)', 'golden_speed'],
    coins: ['Coins 🪙', 'golden_coins'],
    nitro: ['Nitro', 'golden_nitro'],
    dist: ['Distance (m)', 'golden_distance'],
    rpm: ['RPM', 'golden_rpm'],
    state: ['Game State', 'golden_state'],
    author: ['Author', 'race_author'],
    engine: ['Engine', 'race_engine']
};

function sv (parent, key, value) {
    return setVar(parent, V[key][0], V[key][1], value);
}
function cv (parent, key, value) {
    return changeVar(parent, V[key][0], V[key][1], value);
}

// --- Green flag: boot the 3D race ---
const flag = hatFlag(40, 40);
const setup = [];
setup.push(cmd('looks_hide', flag));
setup.push(threed('enableWorld', null));
setup.push(threed('enableVolumetricFog', null, i => {
    blocks[i].inputs.STATE = [1, onOffMenu(i, 'on')];
}));
setup.push(threed('setFogPreset', null, i => {
    blocks[i].inputs.PRESET = [1, fogMenu(i, 'haze')];
}));
setup.push(threed('setFogDensity', null, i => {
    blocks[i].inputs.VALUE = [1, num(i, 28)];
}));
setup.push(threed('showSun', null, i => {
    blocks[i].inputs.STATE = [1, onOffMenu(i, 'on')];
}));
setup.push(threed('showClouds', null, i => {
    blocks[i].inputs.STATE = [1, onOffMenu(i, 'on')];
}));
setup.push(threed('showGodRays', null, i => {
    blocks[i].inputs.STATE = [1, onOffMenu(i, 'on')];
}));
setup.push(threed('setCameraPosition', null, i => {
    blocks[i].inputs.X = [1, num(i, 0)];
    blocks[i].inputs.Y = [1, num(i, 3.2)];
    blocks[i].inputs.Z = [1, num(i, -9.4)];
}));
setup.push(threed('setCameraTarget', null, i => {
    blocks[i].inputs.X = [1, num(i, 0)];
    blocks[i].inputs.Y = [1, num(i, 0.7)];
    blocks[i].inputs.Z = [1, num(i, 8)];
}));
setup.push(threed('setCameraFov', null, i => {
    blocks[i].inputs.FOV = [1, num(i, 58)];
}));
setup.push(threed('cameraFollow', null, i => {
    blocks[i].inputs.SPRITE = [1, spriteMenu(i, 'Player Car')];
}));
setup.push(sv(null, 'speed', 0));
setup.push(sv(null, 'coins', 0));
setup.push(sv(null, 'nitro', 100));
setup.push(sv(null, 'dist', 402));
setup.push(sv(null, 'rpm', 900));
setup.push(sv(null, 'state', 0));
setup.push(setVarText(null, V.author[0], V.author[1], 'Raj Acharya'));
setup.push(setVarText(null, V.engine[0], V.engine[1], 'Nimo Game Engine'));
setup.push(broadcast(null, 'Show Menu', 'race_menu'));
const loopBody = [];
loopBody.push(ifKey(null, 'w', p => cv(p, 'speed', 4)));
loopBody.push(ifKey(null, 'up arrow', p => cv(p, 'speed', 4)));
loopBody.push(ifKey(null, 's', p => cv(p, 'speed', -3)));
loopBody.push(ifKey(null, 'down arrow', p => cv(p, 'speed', -3)));
loopBody.push(ifKey(null, 'space', p => [cv(p, 'nitro', -2), cv(p, 'speed', 6)]));
loopBody.push(ifKey(null, 'a', p => cv(p, 'state', 0)));
loopBody.push(ifKey(null, 'd', p => cv(p, 'state', 0)));
loopBody.push(cv(null, 'dist', -1));
loopBody.push(wait(null, 0.05));
setup.push(forever(null, loopBody));
link(setup);
blocks[flag].next = setup[0];
blocks[setup[0]].parent = flag;
comment(
    flag,
    'Quarter Mile — Scratch + Nimo 3D\n\nCreated by Raj Acharya\nDeveloper & founder of Nimo Game Engine\n\nThis project is a demonstration of Scratch and Nimo.\nGreen flag starts the stage. Play begins the race.',
    40, 8, 260, 170
);

// --- Play Race ---
const play = hatBroadcast('Play Race', 'race_play', 420, 40);
const playBody = [
    sv(null, 'speed', 0),
    sv(null, 'nitro', 100),
    sv(null, 'dist', 402),
    sv(null, 'state', 1),
    wait(null, 1),
    wait(null, 1),
    wait(null, 1),
    broadcast(null, '3 2 1 GO', 'race_go'),
    sv(null, 'state', 2)
];
link(playBody);
blocks[play].next = playBody[0];
blocks[playBody[0]].parent = play;
comment(play, 'Countdown then drop the lights.\nP1 WASD · P2 arrows · Shift nitro', 420, 8, 200, 90);

// --- Menu ---
const menu = hatBroadcast('Show Menu', 'race_menu', 800, 40);
const menuBody = [
    sv(null, 'state', 0),
    sv(null, 'speed', 0)
];
link(menuBody);
blocks[menu].next = menuBody[0];
blocks[menuBody[0]].parent = menu;

// --- Coin ---
const coin = hatBroadcast('Collect Coin', 'race_coin', 800, 220);
blocks[coin].next = cv(coin, 'coins', 1);
comment(coin, 'Gold coins on the strip.\nEach one adds 1 to Coins.', 800, 188, 180, 70);

// --- Finish ---
const fin = hatBroadcast('Finish Line', 'race_finish', 800, 400);
const finBody = [sv(null, 'state', 3), sv(null, 'speed', 0)];
link(finBody);
blocks[fin].next = finBody[0];
blocks[finBody[0]].parent = fin;

// --- Nitro ---
const nit = hatBroadcast('Nitro Burst', 'race_nitro', 420, 420);
const nitBody = [cv(null, 'nitro', -8), cv(null, 'speed', 12), cv(null, 'rpm', 400)];
link(nitBody);
blocks[nit].next = nitBody[0];
blocks[nitBody[0]].parent = nit;

// --- Key hats for P1 ---
const p1Keys = [
    ['w', 40, 720, 'speed', 5],
    ['s', 40, 860, 'speed', -4],
    ['a', 40, 1000, 'state', 0],
    ['d', 40, 1140, 'state', 0],
    ['space', 40, 1280, 'nitro', -3]
];
for (const [key, x, y, vname, amt] of p1Keys) {
    const h = hatKey(key, x, y);
    const body = [cv(null, vname, amt)];
    if (vname === 'nitro') body.push(cv(null, 'speed', 8));
    link(body);
    blocks[h].next = body[0];
    blocks[body[0]].parent = h;
}

// --- Key hats for P2 ---
const p2Keys = [
    ['up arrow', 420, 720, 'speed', 5],
    ['down arrow', 420, 860, 'speed', -4],
    ['left arrow', 420, 1000, 'state', 0],
    ['right arrow', 420, 1140, 'state', 0],
    ['z', 420, 1280, 'nitro', -3]
];
for (const [key, x, y, vname, amt] of p2Keys) {
    const h = hatKey(key, x, y);
    const body = [cv(null, vname, amt)];
    if (vname === 'nitro') body.push(broadcast(null, 'Nitro Burst', 'race_nitro'));
    link(body);
    blocks[h].next = body[0];
    blocks[body[0]].parent = h;
}

// --- Click sprite = play ---
const click = add({
    opcode: 'event_whenthisspriteclicked',
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: true,
    x: 800,
    y: 560,
    id: id('hat')
});
blocks[click].next = broadcast(click, 'Play Race', 'race_play');

// --- Second forever: camera follow + rpm ---
const flag2 = hatFlag(1140, 40);
const rpmIf = cmd('control_if', null, {});
const gt = cmd('operator_gt', rpmIf, {});
const speedRep = cmd('data_variable', gt, {}, {VARIABLE: V.speed});
blocks[gt].inputs.OPERAND1 = [2, speedRep];
blocks[gt].inputs.OPERAND2 = [1, num(gt, 1)];
blocks[rpmIf].inputs.CONDITION = [2, gt];
const rpmBody = cv(rpmIf, 'rpm', 20);
blocks[rpmIf].inputs.SUBSTACK = [2, rpmBody];
blocks[rpmBody].parent = rpmIf;
const follow = threed('followHeading', null, i => {
    blocks[i].inputs.SPRITE = [1, spriteMenu(i, 'Player Car')];
    blocks[i].inputs.X = [1, num(i, 0)];
    blocks[i].inputs.Y = [1, num(i, 3.2)];
    blocks[i].inputs.Z = [1, num(i, -9.4)];
    blocks[i].inputs.LOOK_AHEAD = [1, num(i, 8)];
});
const loop2 = forever(flag2, [follow, rpmIf, wait(null, 0.03)]);
blocks[flag2].next = loop2;
blocks[loop2].parent = flag2;
comment(flag2, 'Keep the chase camera on the car\nand tick RPM while moving.', 1140, 8, 200, 80);

// --- GO broadcast ---
const go = hatBroadcast('3 2 1 GO', 'race_go', 1140, 420);
blocks[go].next = sv(go, 'state', 2);

for (const b of Object.values(blocks)) {
    if (b.parent) b.topLevel = false;
}

const sprite = {
    isStage: false,
    name: 'Quarter Mile',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks,
    comments,
    currentCostume: 0,
    costumes: [{
        assetId: 'c933b6961759d82d4eb6afaec8d3041b',
        name: 'race',
        bitmapResolution: 1,
        md5ext: 'c933b6961759d82d4eb6afaec8d3041b.svg',
        dataFormat: 'svg',
        rotationCenterX: 1,
        rotationCenterY: 1
    }],
    sounds: [],
    volume: 100,
    visible: false,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    layerOrder: 98
};

const stage = data.targets[0];
stage.broadcasts = Object.assign({}, stage.broadcasts, {
    race_play: 'Play Race',
    race_menu: 'Show Menu',
    race_go: '3 2 1 GO',
    race_finish: 'Finish Line',
    race_nitro: 'Nitro Burst',
    race_coin: 'Collect Coin'
});
stage.variables.race_author = ['Author', 'Raj Acharya'];
stage.variables.race_engine = ['Engine', 'Nimo'];
stage.comments = stage.comments || {};
stage.comments.dragRace = {
    blockId: null,
    x: 24,
    y: 24,
    width: 300,
    height: 210,
    minimized: false,
    text: 'Quarter Mile Drag Race\n\nCreated by Raj Acharya\nDeveloper & founder of Nimo Game Engine\n\nThis project is a demonstration of Scratch and Nimo.\n\nGreen flag → Play\nP1 WASD · P2 arrows\nFirst to the lights wins.'
};

data.targets.splice(1, 0, sprite);
data.meta.agent = 'Raj Acharya — Nimo Game Engine + Scratch 3D';

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`injected Quarter Mile sprite with ${Object.keys(blocks).length} blocks`);
