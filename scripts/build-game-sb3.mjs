import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {execFileSync} from 'child_process';

const outDir = process.cwd();
const projectName = 'golden_hour_3d_driving';

/** Create valid Scratch 3 blocks without depending on the editor at build time. */
const makeBlocks = () => {
    let sequence = 0;
    const blocks = {};
    const put = (opcode, extra = {}) => {
        const id = `golden_${++sequence}`;
        blocks[id] = Object.assign({
            opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
        }, extra, {id});
        return id;
    };
    const attachInput = (parent, name, child) => {
        blocks[parent].inputs[name] = [blocks[child].shadow ? 1 : 2, child];
        blocks[child].parent = parent;
    };
    const command = (opcode, inputs = {}, fields = {}) => {
        const id = put(opcode, {fields});
        Object.entries(inputs).forEach(([name, child]) => attachInput(id, name, child));
        return id;
    };
    const num = value => put('math_number', {shadow: true, fields: {NUM: [String(value), null]}});
    const text = value => put('text', {shadow: true, fields: {TEXT: [String(value), null]}});
    const menu = (opcode, field, value) => put(opcode, {shadow: true, fields: {[field]: [value, null]}});
    const chain = ids => {
        for (let i = 0; i < ids.length - 1; i++) {
            blocks[ids[i]].next = ids[i + 1];
            blocks[ids[i + 1]].parent = ids[i];
        }
    };
    const stack = (parent, name, ids) => {
        if (!ids.length) return;
        blocks[parent].inputs[name] = [2, ids[0]];
        blocks[ids[0]].parent = parent;
        chain(ids);
    };
    const script = (opcode, x, y, body, fields = {}) => {
        const hat = put(opcode, {topLevel: true, x, y, fields});
        chain([hat, ...body]);
        return hat;
    };
    const forever = body => {
        const id = command('control_forever');
        stack(id, 'SUBSTACK', body);
        return id;
    };
    const ifThen = (condition, body) => {
        const id = command('control_if', {CONDITION: condition});
        stack(id, 'SUBSTACK', body);
        return id;
    };
    const ifElse = (condition, yes, no) => {
        const id = command('control_if_else', {CONDITION: condition});
        stack(id, 'SUBSTACK', yes);
        stack(id, 'SUBSTACK2', no);
        return id;
    };
    const report = (opcode, inputs = {}, fields = {}) => command(opcode, inputs, fields);

    return {
        blocks, command, script, forever, ifThen, ifElse, num, text,
        sprite: value => menu('threed_menu_sprites', 'sprites', value),
        mesh: value => menu('threed_menu_mesh', 'mesh', value),
        axis: value => menu('threed_menu_axis', 'axis', value),
        onOff: value => menu('threed_menu_onOff', 'onOff', value),
        fog: value => menu('threed_menu_fogPreset', 'fogPreset', value),
        key: value => menu('sensing_keyoptions', 'KEY_OPTION', value),
        wait: seconds => command('control_wait', {DURATION: seconds}),
        add: (a, b) => report('operator_add', {NUM1: a, NUM2: b}),
        sub: (a, b) => report('operator_subtract', {NUM1: a, NUM2: b}),
        mul: (a, b) => report('operator_multiply', {NUM1: a, NUM2: b}),
        div: (a, b) => report('operator_divide', {NUM1: a, NUM2: b}),
        gt: (a, b) => report('operator_gt', {OPERAND1: a, OPERAND2: b}),
        lt: (a, b) => report('operator_lt', {OPERAND1: a, OPERAND2: b}),
        eq: (a, b) => report('operator_equals', {OPERAND1: a, OPERAND2: b}),
        or: (a, b) => report('operator_or', {OPERAND1: a, OPERAND2: b}),
        and: (a, b) => report('operator_and', {OPERAND1: a, OPERAND2: b}),
        not: a => report('operator_not', {OPERAND: a}),
        random: (a, b) => report('operator_random', {FROM: a, TO: b}),
        sin: value => report('operator_mathop', {NUM: value}, {OPERATOR: ['sin', null]}),
        pressed: key => report('sensing_keypressed', {KEY_OPTION: menu('sensing_keyoptions', 'KEY_OPTION', key)})
    };
};

const variables = {
    speed: {id: 'golden_speed', name: 'Speed (km/h)', value: 0},
    coins: {id: 'golden_coins', name: 'Coins 🪙', value: 0},
    gameState: {id: 'golden_state', name: 'Game State', value: 0}, // 0 = Menu, 1 = Driving
    rpm: {id: 'golden_rpm', name: 'RPM', value: 900},
    nitro: {id: 'golden_nitro', name: 'Nitro', value: 100},
    distance: {id: 'golden_distance', name: 'Distance (m)', value: 0},
    worldZ: {id: 'golden_world_z', name: 'World Z', value: 0},
    camera: {id: 'golden_camera', name: 'Camera', value: 1},
    time: {id: 'golden_time', name: 'Golden Hour', value: 35}
};

const addVariableBlocks = b => ({
    value: name => b.command('data_variable', {}, {VARIABLE: [variables[name].name, variables[name].id]}),
    set: (name, value) => b.command('data_setvariableto', {VALUE: value}, {
        VARIABLE: [variables[name].name, variables[name].id]
    }),
    change: (name, value) => b.command('data_changevariableby', {VALUE: value}, {
        VARIABLE: [variables[name].name, variables[name].id]
    })
});

const three = (b, opcode, inputs = {}) => b.command(`threed_${opcode}`, inputs);

const stageBlocks = () => {
    const b = makeBlocks();
    const {num, text, onOff, fog, script, forever, ifThen, wait, add, mul, sub, sin, gt} = b;
    const v = addVariableBlocks(b);
    const init = [
        three(b, 'enableWorld'),
        three(b, 'showSky', {STATE: onOff('on')}),
        three(b, 'setSkyColor', {COLOR: text('#DE5824')}),
        three(b, 'setSkyBottom', {COLOR: text('#FFB660')}),
        three(b, 'showGround', {STATE: onOff('on')}),
        three(b, 'setGroundColor', {COLOR: text('#263620')}),
        three(b, 'setLightColor', {COLOR: text('#FFE6BA')}),
        three(b, 'setLightIntensity', {VALUE: num(96)}),
        three(b, 'setLightDirection', {X: num(-0.62), Y: num(-0.30), Z: num(-0.55)}),
        three(b, 'setAmbient', {VALUE: num(35)}),
        three(b, 'showSun', {STATE: onOff('on')}),
        three(b, 'showClouds', {STATE: onOff('on')}),
        three(b, 'setCloudCoverage', {VALUE: num(52)}),
        three(b, 'setCloudSpeed', {VALUE: num(20)}),
        three(b, 'showGodRays', {STATE: onOff('on')}),
        three(b, 'setGodRays', {VALUE: num(88)}),
        three(b, 'enableVolumetricFog', {STATE: onOff('on')}),
        three(b, 'setFogPreset', {PRESET: fog('haze')}),
        three(b, 'setFogColor', {COLOR: text('#E89D52')}),
        three(b, 'setFogDensity', {VALUE: num(34)}),
        three(b, 'setFogHeight', {Y: num(0)}),
        three(b, 'setFogFalloff', {VALUE: num(31)}),
        three(b, 'setFogStart', {VALUE: num(38)}),
        three(b, 'setFogDistance', {VALUE: num(1250)}),
        three(b, 'setFogShafts', {VALUE: num(76)}),
        v.set('time', num(35)),
        v.set('distance', num(0)),
        v.set('coins', num(0)),
        v.set('gameState', num(0))
    ];
    const angle = sub(mul(v.value('time'), num(3.6)), num(90));
    script('event_whenflagclicked', 30, 30, init);
    script('event_whenflagclicked', 370, 30, [forever([
        v.change('time', num(0.12)),
        ifThen(gt(v.value('time'), num(100)), [v.set('time', num(0))]),
        three(b, 'setLightDirection', {X: sin(angle), Y: num(-0.32), Z: num(-0.55)}),
        three(b, 'setCloudSpeed', {VALUE: add(num(14), mul(v.value('time'), num(0.12)))}),
        wait(num(0.25))
    ])]);
    return b.blocks;
};

const playerBlocks = () => {
    const b = makeBlocks();
    const {num, text, mesh, sprite, script, forever, ifThen, ifElse, add, mul, gt, lt, eq, or, and, pressed} = b;
    const v = addVariableBlocks(b);
    const follow = (x, y, z, lookAhead, fov) => [
        three(b, 'followHeading', {SPRITE: sprite('Player Car'), X: num(x), Y: num(y), Z: num(z), LOOK_AHEAD: num(lookAhead)}),
        three(b, 'setCameraFov', {FOV: num(fov)})
    ];
    const reset = [
        three(b, 'setMesh', {MESH: mesh('car')}),
        three(b, 'setMaterialColor', {COLOR: text('#E63946')}),
        three(b, 'setMetallic', {VALUE: num(55)}),
        three(b, 'setRoughness', {VALUE: num(22)}),
        three(b, 'setPosition', {X: num(0), Y: num(11), Z: num(0)}),
        three(b, 'setRotation', {X: num(0), Y: num(0), Z: num(0)}),
        v.set('speed', num(0)), v.set('rpm', num(900)), v.set('nitro', num(100)),
        v.set('distance', num(0)), v.set('worldZ', num(0)), v.set('camera', num(1)),
        v.set('gameState', num(0)),
        ...follow(0, 56, 155, 60, 52)
    ];

    const drive = forever([
        // Check Menu State -> Transition to Driving
        ifElse(eq(v.value('gameState'), num(0)), [
            // While in Menu: idle and wait for start trigger
            three(b, 'setRotation', {X: num(0), Y: num(0), Z: num(0)}),
            ifThen(or(or(pressed('space'), pressed('w')), pressed('up arrow')), [
                v.set('gameState', num(1))
            ])
        ], [
            // Active Driving Simulation
            // 1. Throttle / Brake / Reverse (WASD + Arrows)
            ifElse(or(pressed('w'), pressed('up arrow')), [
                v.change('speed', num(0.75)),
                ifThen(gt(v.value('speed'), num(36)), [v.set('speed', num(36))])
            ], [
                ifElse(or(pressed('s'), pressed('down arrow')), [
                    ifElse(gt(v.value('speed'), num(0.5)), [
                        v.change('speed', num(-1.8)) // Hydraulic Brake
                    ], [
                        v.change('speed', num(-0.4)), // Smooth Reverse
                        ifThen(lt(v.value('speed'), num(-9)), [v.set('speed', num(-9))])
                    ])
                ], [
                    // Clean stopping when throttle released
                    ifThen(gt(v.value('speed'), num(0)), [
                        v.set('speed', mul(v.value('speed'), num(0.92))),
                        ifThen(lt(v.value('speed'), num(0.15)), [v.set('speed', num(0))])
                    ]),
                    ifThen(lt(v.value('speed'), num(0)), [
                        v.set('speed', mul(v.value('speed'), num(0.92))),
                        ifThen(gt(v.value('speed'), num(-0.15)), [v.set('speed', num(0))])
                    ])
                ])
            ]),

            // 2. Nitro Boost (Space / Shift)
            ifElse(or(pressed('space'), pressed('shift')), [
                ifThen(and(gt(v.value('nitro'), num(0)), gt(v.value('speed'), num(5))), [
                    v.change('speed', num(1.15)),
                    v.change('nitro', num(-1.1)),
                    ifThen(gt(v.value('speed'), num(48)), [v.set('speed', num(48))])
                ])
            ], [
                ifThen(lt(v.value('nitro'), num(100)), [v.change('nitro', num(0.22))])
            ]),
            ifThen(lt(v.value('nitro'), num(0)), [v.set('nitro', num(0))]),

            // 3. Responsive Lane Steering (A / D and Left / Right Arrows)
            ifThen(or(pressed('a'), pressed('left arrow')), [
                three(b, 'changeX', {X: num(-4.2)})
            ]),
            ifThen(or(pressed('d'), pressed('right arrow')), [
                three(b, 'changeX', {X: num(4.2)})
            ]),

            // 4. Lock Rotation facing strictly forward (0, 0, 0)
            three(b, 'setRotation', {X: num(0), Y: num(0), Z: num(0)}),

            // 5. Strict Road Guardrail Collisions & Bouncing (Car cannot get off track!)
            ifThen(lt(three(b, 'getX'), num(-54)), [
                three(b, 'setPosition', {X: num(-54), Y: num(11), Z: three(b, 'getZ')}),
                three(b, 'changeX', {X: num(4.5)}),
                v.set('speed', mul(v.value('speed'), num(0.88)))
            ]),
            ifThen(gt(three(b, 'getX'), num(54)), [
                three(b, 'setPosition', {X: num(54), Y: num(11), Z: three(b, 'getZ')}),
                three(b, 'changeX', {X: num(-4.5)}),
                v.set('speed', mul(v.value('speed'), num(0.88)))
            ]),
            three(b, 'keepInside', {SIZE: num(56)}),

            // 6. Forward Motion along track (Z-axis)
            three(b, 'changeZ', {Z: mul(v.value('speed'), num(-1))}),

            // 7. Stats & HUD Tracking
            v.set('worldZ', three(b, 'getZ')),
            v.change('distance', mul(v.value('speed'), num(0.052))),
            v.set('rpm', add(num(900), mul(v.value('speed'), num(220))))
        ])
    ]);

    const selectCamera = [
        ifThen(eq(v.value('camera'), num(1)), follow(0, 56, 155, 60, 52)), // Chase
        ifThen(eq(v.value('camera'), num(2)), follow(0, 96, 300, 90, 62)), // High Chase
        ifThen(eq(v.value('camera'), num(3)), follow(0, 32, 84, 70, 46)),  // Close Chase
        ifThen(eq(v.value('camera'), num(4)), follow(0, 24, -28, 150, 64)), // Bumper
        ifThen(eq(v.value('camera'), num(5)), follow(0, 18, -4, 125, 74)),  // Cockpit
        ifThen(eq(v.value('camera'), num(6)), follow(-150, 94, 178, 45, 58)) // Dynamic Side
    ];
    script('event_whenflagclicked', 28, 28, reset);
    script('event_whenflagclicked', 420, 28, [drive]);
    script('event_whenkeypressed', 28, 510, reset, {KEY_OPTION: ['r', null]});
    script('event_whenkeypressed', 700, 510, [
        v.change('camera', num(1)),
        ifThen(gt(v.value('camera'), num(6)), [v.set('camera', num(1))]),
        ...selectCamera
    ], {KEY_OPTION: ['c', null]});
    return b.blocks;
};

const coinBlocks = (initialX, initialZ) => {
    const b = makeBlocks();
    const {num, text, mesh, sprite, script, forever, ifThen, and, gt, lt, add, sub, random} = b;
    const v = addVariableBlocks(b);
    script('event_whenflagclicked', 28, 28, [
        three(b, 'setMesh', {MESH: mesh('coin')}),
        three(b, 'setMaterialColor', {COLOR: text('#FFD700')}),
        three(b, 'setMetallic', {VALUE: num(95)}),
        three(b, 'setRoughness', {VALUE: num(14)}),
        three(b, 'setScale', {X: num(1.2), Y: num(1.2), Z: num(1.2)}),
        three(b, 'setPosition', {X: num(initialX), Y: num(16), Z: num(initialZ)})
    ]);
    script('event_whenflagclicked', 316, 28, [forever([
        three(b, 'changeRotation', {X: num(0), Y: num(9), Z: num(0)}),
        ifThen(gt(v.value('gameState'), num(0)), [
            // Proximity collection check with Player Car
            ifThen(and(
                and(
                    gt(three(b, 'getZ'), sub(v.value('worldZ'), num(26))),
                    lt(three(b, 'getZ'), add(v.value('worldZ'), num(26)))
                ),
                and(
                    gt(three(b, 'getX'), sub(three(b, 'getSpriteX', {SPRITE: sprite('Player Car')}), num(22))),
                    lt(three(b, 'getX'), add(three(b, 'getSpriteX', {SPRITE: sprite('Player Car')}), num(22)))
                )
            ), [
                v.change('coins', num(1)),
                three(b, 'setPosition', {
                    X: random(num(-38), num(38)),
                    Y: num(16),
                    Z: sub(v.value('worldZ'), random(num(900), num(1500)))
                })
            ]),
            // Recycling when car drives past coin
            ifThen(gt(three(b, 'getZ'), add(v.value('worldZ'), num(180))), [
                three(b, 'setPosition', {
                    X: random(num(-38), num(38)),
                    Y: num(16),
                    Z: sub(v.value('worldZ'), random(num(900), num(1500)))
                })
            ])
        ])
    ])]);
    return b.blocks;
};

const menuBlocks = () => {
    const b = makeBlocks();
    const {num, script, forever, ifThen, ifElse, or, pressed, eq} = b;
    const v = addVariableBlocks(b);
    script('event_whenflagclicked', 28, 28, [
        b.command('looks_gotofrontback', {}, {FRONT_BACK: ['front', null]}),
        b.command('motion_gotoxy', {X: num(0), Y: num(0)}),
        b.command('looks_setsizeto', {SIZE: num(100)}),
        b.command('looks_show'),
        forever([
            ifElse(eq(v.value('gameState'), num(0)), [
                b.command('looks_show'),
                ifThen(or(or(pressed('space'), pressed('w')), pressed('up arrow')), [
                    v.set('gameState', num(1)),
                    b.command('looks_hide')
                ])
            ], [
                b.command('looks_hide')
            ])
        ])
    ]);
    script('event_whenthisspriteclicked', 28, 380, [
        v.set('gameState', num(1)),
        b.command('looks_hide')
    ]);
    return b.blocks;
};

const roadBlocks = initialZ => {
    const b = makeBlocks();
    const {num, text, mesh, script, forever, ifThen, add, sub, gt} = b;
    const v = addVariableBlocks(b);
    script('event_whenflagclicked', 28, 28, [
        three(b, 'setMesh', {MESH: mesh('plane')}),
        three(b, 'setMaterialColor', {COLOR: text('#1C1D22')}),
        three(b, 'setRoughness', {VALUE: num(92)}),
        three(b, 'setScale', {X: num(2.2), Y: num(1), Z: num(3.6)}),
        three(b, 'setPosition', {X: num(0), Y: num(0), Z: num(initialZ)})
    ]);
    script('event_whenflagclicked', 316, 28, [forever([
        ifThen(gt(three(b, 'getZ'), add(v.value('worldZ'), num(240))), [
            three(b, 'setPosition', {X: num(0), Y: num(0), Z: sub(v.value('worldZ'), num(1350))})
        ])
    ])]);
    return b.blocks;
};

const propBlocks = config => {
    const b = makeBlocks();
    const {num, text, mesh, script, forever, ifThen, add, sub, gt, random} = b;
    const v = addVariableBlocks(b);
    const x = config.xMin === config.xMax ? num(config.xMin) : random(num(config.xMin), num(config.xMax));
    script('event_whenflagclicked', 28, 28, [
        three(b, 'setMesh', {MESH: mesh(config.mesh)}),
        three(b, 'setMaterialColor', {COLOR: text(config.color)}),
        three(b, 'setRoughness', {VALUE: num(config.roughness || 80)}),
        three(b, 'setMetallic', {VALUE: num(config.metallic || 0)}),
        three(b, 'setScale', {X: num(config.scale[0]), Y: num(config.scale[1]), Z: num(config.scale[2])}),
        three(b, 'setPosition', {X: num(config.initialX), Y: num(config.initialY), Z: num(config.initialZ)})
    ]);
    script('event_whenflagclicked', 316, 28, [forever([
        ifThen(gt(three(b, 'getZ'), add(v.value('worldZ'), num(180))), [
            three(b, 'setPosition', {
                X: x, Y: num(config.recycleY),
                Z: sub(v.value('worldZ'), random(num(config.recycleMinZ), num(config.recycleMaxZ)))
            })
        ])
    ])]);
    return b.blocks;
};

const dustBlocks = index => {
    const b = makeBlocks();
    const {num, text, mesh, sprite, script, forever, ifThen, gt, random} = b;
    const v = addVariableBlocks(b);
    script('event_whenflagclicked', 28, 28, [
        three(b, 'setMesh', {MESH: mesh('sphere')}),
        three(b, 'setMaterialColor', {COLOR: text('#C8945D')}),
        three(b, 'setRoughness', {VALUE: num(100)}),
        three(b, 'setScale', {X: num(0.16 + ((index % 3) * 0.05)), Y: num(0.08), Z: num(0.16)}),
        three(b, 'setPosition', {X: num(0), Y: num(3), Z: num(35)})
    ]);
    script('event_whenflagclicked', 316, 28, [forever([
        ifThen(gt(v.value('speed'), num(6)), [
            three(b, 'goToSprite', {SPRITE: sprite('Player Car')}),
            three(b, 'changeX', {X: random(num(-26), num(26))}),
            three(b, 'changeY', {Y: random(num(-4), num(7))}),
            three(b, 'changeZ', {Z: random(num(26), num(56))})
        ])
    ])]);
    return b.blocks;
};

const blankSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"><rect width="2" height="2" fill="none"/></svg>';
const stageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#10151c"/></svg>';
const hudSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="78" viewBox="0 0 480 78"><defs><linearGradient id="hudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1b1c26" stop-opacity="0.92"/><stop offset="100%" stop-color="#0f1118" stop-opacity="0.96"/></linearGradient></defs><rect x="8" y="8" width="464" height="62" rx="12" fill="url(#hudGrad)" stroke="#f1a852" stroke-width="1.5"/><circle cx="26" cy="39" r="6" fill="#f1a852"/><text x="40" y="36" fill="#ffe0b2" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">GOLDEN HOUR 3D</text><text x="40" y="55" fill="#f5c893" font-family="Arial, sans-serif" font-size="11" font-weight="600">W / ↑ DRIVE  •  S / ↓ BRAKE  •  A D / ← → STEER  •  SPACE BOOST  •  🪙 COLLECT COINS</text></svg>';
const menuSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0e131d" stop-opacity="0.92"/><stop offset="100%" stop-color="#06080d" stop-opacity="0.96"/></linearGradient><linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff9d42"/><stop offset="100%" stop-color="#e65100"/></linearGradient></defs><rect x="24" y="24" width="432" height="312" rx="20" fill="url(#bgGrad)" stroke="#ff9d42" stroke-width="2"/><text x="240" y="90" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="900" letter-spacing="4">GOLDEN HOUR 3D</text><text x="240" y="118" text-anchor="middle" fill="#f5c893" font-family="Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2">ENDLESS HIGHWAY ARCADE</text><rect x="140" y="145" width="200" height="48" rx="24" fill="url(#btnGrad)" stroke="#ffffff" stroke-width="1.5"/><text x="240" y="175" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2">▶ START DRIVE</text><text x="240" y="215" text-anchor="middle" fill="#ffe0b2" font-family="Arial, sans-serif" font-size="11" font-weight="700">CLICK HERE OR PRESS [SPACE] / [W] TO START</text><rect x="48" y="240" width="384" height="68" rx="10" fill="#141a24" stroke="#2a3545" stroke-width="1"/><text x="240" y="262" text-anchor="middle" fill="#ffd700" font-family="Arial, sans-serif" font-size="11" font-weight="800">🪙 COLLECT GOLD COINS ALONG THE ROAD</text><text x="240" y="284" text-anchor="middle" fill="#a0aec0" font-family="Arial, sans-serif" font-size="10" font-weight="600">W / ↑ THROTTLE  •  S / ↓ BRAKE  •  A / D STEER  •  SPACE NITRO  •  C CAM</text></svg>';

const makeAsset = (name, data) => {
    const assetId = crypto.createHash('md5').update(data).digest('hex');
    return {assetId, name, md5ext: `${assetId}.svg`, dataFormat: 'svg', data};
};
const costume = asset => ({
    assetId: asset.assetId,
    name: asset.name,
    bitmapResolution: 1,
    md5ext: asset.md5ext,
    dataFormat: 'svg',
    rotationCenterX: 1,
    rotationCenterY: 1
});
const material = (albedo, metallic = 0, roughness = 0.8, opacity = 1) => ({albedo, metallic, roughness, emissive: 0, opacity});

const target = ({name, blocks, mesh, position, appearance, placeholder, layerOrder}) => ({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks, comments: {}, currentCostume: 0,
    costumes: [costume(placeholder)], sounds: [], volume: 100, visible: true,
    x: position[0], y: position[1], z: position[2], size: 100, direction: 90, draggable: false,
    rotationStyle: 'all around', layerOrder, mesh, material3d: appearance
});

const createProject = () => {
    const blank = makeAsset('3D placeholder', blankSvg);
    const stageAsset = makeAsset('Golden hour backdrop', stageSvg);
    const hud = makeAsset('Golden Hour HUD', hudSvg);
    const menuAsset = makeAsset('Golden Hour Main Menu', menuSvg);
    const targets = [{
        isStage: true, name: 'Stage',
        variables: Object.fromEntries(Object.values(variables).map(v => [v.id, [v.name, v.value]])),
        lists: {}, broadcasts: {}, blocks: stageBlocks(), comments: {}, currentCostume: 0,
        costumes: [costume(stageAsset)], sounds: [], volume: 100, layerOrder: 0,
        scene3d: {
            enabled: true, showGround: true, showSky: true,
            camera: {position: [0, 67, 155], target: [0, 11, -60], up: [0, 1, 0], fov: 52, near: 1, far: 4000},
            fog: {enabled: true, density: 0.0043, color: [0.91, 0.63, 0.35], maxDistance: 1250},
            skyFx: {sun: true, clouds: true, godRays: true, cloudCoverage: 0.52, godRayIntensity: 0.88}
        }
    }];
    let layer = 1;

    // 1. Player Supercar
    targets.push(target({name: 'Player Car', blocks: playerBlocks(), mesh: 'car', position: [0, 11, 0], placeholder: blank, layerOrder: layer++, appearance: material([0.839, 0.231, 0.231], 0.55, 0.22)}));

    // 2. 8 Collectible 3D Golden Coins
    const coinInitialPositions = [
        [-34, -140], [18, -280], [-18, -420], [34, -560],
        [-24, -700], [24, -840], [0, -980], [-34, -1120]
    ];
    coinInitialPositions.forEach((pos, idx) => {
        targets.push(target({
            name: `Coin ${idx + 1}`, blocks: coinBlocks(pos[0], pos[1]), mesh: 'coin', position: [pos[0], 16, pos[1]],
            placeholder: blank, layerOrder: layer++, appearance: material([1.0, 0.84, 0.0], 0.95, 0.14)
        }));
    });

    // 3. Cycling Infinite Road Segments
    [0, -270, -540, -810, -1080, -1350].forEach((z, index) => targets.push(target({
        name: `Road ${index + 1}`, blocks: roadBlocks(z), mesh: 'plane', position: [0, 0, z], placeholder: blank, layerOrder: layer++, appearance: material([0.11, 0.11, 0.14], 0, 0.92)
    })));

    // 4. Double Center Yellow Striping
    for (let i = 0; i < 8; i++) {
        const z = -80 - (i * 170);
        targets.push(target({name: `Centre marker ${i + 1}`, mesh: 'cube', position: [0, 2.2, z], placeholder: blank, layerOrder: layer++, appearance: material([1.0, 0.80, 0.20], 0.2, 0.35), blocks: propBlocks({mesh: 'cube', color: '#FFCC33', scale: [0.06, 0.025, 0.95], initialX: 0, initialY: 2.2, initialZ: z, xMin: 0, xMax: 0, recycleY: 2.2, recycleMinZ: 750, recycleMaxZ: 1350, roughness: 35, metallic: 20})}));
    }

    // 5. Highway Guard Rails & Reflectors
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
        const z = -100 - (i * 220);
        targets.push(target({name: `${side < 0 ? 'Left' : 'Right'} rail ${i + 1}`, mesh: 'cube', position: [side * 104, 12, z], placeholder: blank, layerOrder: layer++, appearance: material([0.72, 0.70, 0.68], 0.78, 0.28), blocks: propBlocks({mesh: 'cube', color: '#B8B2AC', scale: [0.055, 0.14, 1.35], initialX: side * 104, initialY: 12, initialZ: z, xMin: side * 104, xMax: side * 104, recycleY: 12, recycleMinZ: 900, recycleMaxZ: 1400, roughness: 28, metallic: 78})}));
    }

    // 6. Distant Mountain Silhouettes on Horizon
    const mtnPositions = [
        [-420, 90, -1200], [420, 110, -1500],
        [-360, 130, -2000], [380, 95, -2300],
        [-520, 140, -2600], [480, 120, -2900]
    ];
    mtnPositions.forEach((pos, idx) => {
        const col = idx % 2 === 0 ? '#522E3A' : '#683949';
        targets.push(target({name: `Mountain ${idx + 1}`, mesh: 'mountain', position: pos, placeholder: blank, layerOrder: layer++, appearance: material(idx % 2 === 0 ? [0.32, 0.18, 0.23] : [0.41, 0.22, 0.29], 0, 0.95), blocks: propBlocks({mesh: 'mountain', color: col, scale: [1.8, 1.4, 1.8], initialX: pos[0], initialY: pos[1], initialZ: pos[2], xMin: pos[0] - 80, xMax: pos[0] + 80, recycleY: pos[1], recycleMinZ: 1600, recycleMaxZ: 3200, roughness: 95})}));
    });

    // 7. Forest Pine Trees (Rich Multi-Layered 3D Trees)
    for (let i = 0; i < 26; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -120 - (i * 95);
        const col = i % 3 === 0 ? '#1A4B29' : (i % 3 === 1 ? '#143D20' : '#226838');
        const scale = 0.65 + ((i % 4) * 0.10);
        const xDist = side * (132 + ((i % 5) * 36));
        targets.push(target({name: `Pine ${i + 1}`, mesh: 'tree', position: [xDist, 40, z], placeholder: blank, layerOrder: layer++, appearance: material(col === '#1A4B29' ? [0.10, 0.29, 0.16] : [0.13, 0.41, 0.22], 0, 0.88), blocks: propBlocks({mesh: 'tree', color: col, scale: [scale, scale * 1.1, scale], initialX: xDist, initialY: 40, initialZ: z, xMin: side < 0 ? -340 : 128, xMax: side < 0 ? -128 : 340, recycleY: 40, recycleMinZ: 750, recycleMaxZ: 1550, roughness: 88})}));
    }

    // 8. Highway Sunset Billboards
    for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -280 - (i * 420);
        targets.push(target({name: `Billboard ${i + 1}`, mesh: 'cube', position: [side * 155, 34, z], placeholder: blank, layerOrder: layer++, appearance: material([0.11, 0.14, 0.20], 0.2, 0.6), blocks: propBlocks({mesh: 'cube', color: '#1B2433', scale: [0.15, 0.45, 0.75], initialX: side * 155, initialY: 34, initialZ: z, xMin: side < 0 ? -165 : 145, xMax: side < 0 ? -145 : 165, recycleY: 34, recycleMinZ: 1100, recycleMaxZ: 1900, roughness: 60})}));
    }

    // 9. Roadside Boulders / Rocks
    for (let i = 0; i < 10; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -180 - (i * 240);
        targets.push(target({name: `Rock ${i + 1}`, mesh: 'sphere', position: [side * (124 + ((i % 3) * 35)), 10, z], placeholder: blank, layerOrder: layer++, appearance: material([0.35, 0.32, 0.28], 0, 0.95), blocks: propBlocks({mesh: 'sphere', color: '#585248', scale: [0.32, 0.20, 0.36], initialX: side * (124 + ((i % 3) * 35)), initialY: 10, initialZ: z, xMin: side < 0 ? -280 : 120, xMax: side < 0 ? -120 : 280, recycleY: 10, recycleMinZ: 750, recycleMaxZ: 1450, roughness: 95})}));
    }

    // 10. Highway Street Lampposts
    for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -140 - (i * 280);
        targets.push(target({name: `Streetlight ${i + 1}`, mesh: 'cylinder', position: [side * 115, 30, z], placeholder: blank, layerOrder: layer++, appearance: material([0.55, 0.53, 0.51], 0.7, 0.35), blocks: propBlocks({mesh: 'cylinder', color: '#8C8882', scale: [0.04, 0.65, 0.04], initialX: side * 115, initialY: 30, initialZ: z, xMin: side * 115, xMax: side * 115, recycleY: 30, recycleMinZ: 850, recycleMaxZ: 1650, roughness: 35, metallic: 70})}));
    }

    // 11. Dynamic Exhaust Dust Particles
    for (let i = 0; i < 6; i++) {
        targets.push(target({name: `Dust ${i + 1}`, mesh: 'sphere', position: [0, 3, 35], placeholder: blank, layerOrder: layer++, appearance: material([0.78, 0.58, 0.36], 0, 1, 0.35), blocks: dustBlocks(i)}));
    }

    // 12. Main Menu UI Sprite (Scratch Native Menu Overlay)
    targets.push({
        isStage: false, name: 'Main Menu UI', variables: {}, lists: {}, broadcasts: {}, blocks: menuBlocks(), comments: {}, currentCostume: 0,
        costumes: [{
            assetId: menuAsset.assetId,
            name: menuAsset.name,
            bitmapResolution: 1,
            md5ext: menuAsset.md5ext,
            dataFormat: 'svg',
            rotationCenterX: 240,
            rotationCenterY: 180
        }],
        sounds: [], volume: 100, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around', layerOrder: layer++
    });

    // 13. HUD Controller
    targets.push({
        isStage: false, name: 'Golden Hour Controls', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
        costumes: [{
            assetId: hud.assetId,
            name: hud.name,
            bitmapResolution: 1,
            md5ext: hud.md5ext,
            dataFormat: 'svg',
            rotationCenterX: 240,
            rotationCenterY: 39
        }],
        sounds: [], volume: 100, visible: true, x: 0, y: -138, size: 100, direction: 90, draggable: false, rotationStyle: 'all around', layerOrder: layer++
    });

    const monitor = (v, x, y) => ({
        id: v.id,
        mode: 'default',
        opcode: 'data_variable',
        params: {VARIABLE: v.name},
        spriteName: null,
        value: v.value,
        width: 0,
        height: 0,
        x,
        y,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true
    });

    return {
        project: {
            targets,
            monitors: [
                monitor(variables.coins, 18, 14),
                monitor(variables.speed, 18, 40),
                monitor(variables.nitro, 18, 66),
                monitor(variables.distance, 18, 92)
            ],
            extensions: ['threed'],
            meta: {semver: '3.0.0', vm: '15.1.0', agent: 'Golden Hour Scratch 3D generator'}
        },
        assets: [blank, stageAsset, hud, menuAsset]
    };
};

const build = () => {
    const {project, assets} = createProject();
    const json = path.join(outDir, `${projectName}.json`);
    const sb3 = path.join(outDir, `${projectName}.sb3`);
    const temp = path.join(outDir, '.golden-hour-sb3');
    fs.writeFileSync(json, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
    fs.rmSync(temp, {recursive: true, force: true});
    fs.mkdirSync(temp, {recursive: true});
    fs.writeFileSync(path.join(temp, 'project.json'), JSON.stringify(project), 'utf8');
    assets.forEach(asset => fs.writeFileSync(path.join(temp, asset.md5ext), asset.data, 'utf8'));
    const archive = `${sb3}.zip`;
    fs.rmSync(archive, {force: true});
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${temp}\\*' -DestinationPath '${archive}' -Force`], {stdio: 'inherit'});
    fs.rmSync(sb3, {force: true});
    fs.renameSync(archive, sb3);
    fs.rmSync(temp, {recursive: true, force: true});
    console.log(`Wrote ${path.relative(outDir, json)} and ${path.relative(outDir, sb3)} (${project.targets.length} targets).`);
};

build();
