const test = require('tap').test;
const collision = require('../../src/extensions/scratch3_threed/collision');
const Scratch3ThreeDBlocks = require('../../src/extensions/scratch3_threed/index');

const sprite = (name, extra) => Object.assign({
    isStage: false,
    visible: true,
    sprite: {name},
    x: 0,
    y: 16,
    z: 0,
    size: 100,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    mesh: 'sphere',
    solid3d: false
}, extra);

test('halfExtents scales with mesh and size', t => {
    t.same(collision.halfExtents(sprite('A', {mesh: 'cube'})), [25, 25, 25]);
    t.same(collision.halfExtents(sprite('A', {mesh: 'sphere', scaleX: 2, scaleY: 1, scaleZ: 1})), [50, 25, 25]);
    const wall = sprite('W', {mesh: 'cube', scaleX: 8.2, scaleY: 0.55, scaleZ: 0.45});
    const h = collision.halfExtents(wall);
    t.ok(Math.abs(h[0] - 205) < 0.01);
    t.ok(Math.abs(h[2] - 11.25) < 0.01);
    t.end();
});

test('aabbOverlap detects sphere-vs-wall and misses a far sprite', t => {
    const head = sprite('Head', {x: 160, y: 16, z: 0, mesh: 'sphere'});
    const wall = sprite('WallE', {
        x: 190, y: 14, z: 0, mesh: 'cube',
        scaleX: 0.45, scaleY: 0.55, scaleZ: 8.2, solid3d: true
    });
    t.equal(collision.aabbOverlap(head, wall), true);
    wall.x = 400;
    t.equal(collision.aabbOverlap(head, wall), false);
    t.end();
});

test('namedTargets includes visible clones, skips hidden originals', t => {
    const original = sprite('Body', {visible: false, x: 0});
    const clone = sprite('Body', {visible: true, x: -40});
    const runtime = {targets: [original, clone]};
    const hits = collision.namedTargets(runtime, 'Body');
    t.equal(hits.length, 1);
    t.equal(hits[0], clone);
    t.end();
});

test('touching3D uses clones and mesh bounds', t => {
    const head = sprite('Head', {x: 0, y: 16, z: 0, mesh: 'sphere'});
    const food = sprite('Food', {x: 20, y: 16, z: 0, mesh: 'sphere', scaleX: 0.7, scaleY: 0.7, scaleZ: 0.7});
    const runtime = {
        on: () => {},
        targets: [head, food],
        requestRedraw: () => {}
    };
    const blocks = new Scratch3ThreeDBlocks(runtime);
    t.equal(blocks.touching3D({SPRITE: 'Food'}, {target: head}), true);
    food.x = 200;
    t.equal(blocks.touching3D({SPRITE: 'Food'}, {target: head}), false);
    t.end();
});

test('touchingSolid finds other solid sprites and records the name', t => {
    const head = sprite('Head', {x: 0, y: 16, z: 0, mesh: 'sphere'});
    const wall = sprite('WallN', {
        x: 0, y: 14, z: 10, mesh: 'cube',
        scaleX: 8.2, scaleY: 0.55, scaleZ: 0.45, solid3d: true
    });
    const runtime = {
        on: () => {},
        targets: [head, wall],
        requestRedraw: () => {}
    };
    const blocks = new Scratch3ThreeDBlocks(runtime);
    t.equal(blocks.touchingSolid({}, {target: head}), true);
    t.equal(blocks.collisionSprite({}, {target: head}), 'WallN');
    t.end();
});

test('pushOut separates overlapping boxes on the shortest axis', t => {
    const a = sprite('A', {x: 0, y: 0, z: 0, mesh: 'cube'});
    const b = sprite('B', {x: 10, y: 0, z: 0, mesh: 'cube'});
    t.equal(collision.pushOut(a, b), true);
    t.ok(a.x >= 50 - 0.01);
    t.end();
});

test('heading follow uses the car local camera offset', t => {
    const car = sprite('Player Car', {drawableID: 23});
    const scene = {
        camera: {},
        setFollowHeading: (enabled, lookAhead) => {
            scene.heading = enabled;
            scene.lookAhead = lookAhead;
        }
    };
    const runtime = {
        on: () => {},
        renderer: {scene},
        getSpriteTargetByName: name => name === 'Player Car' ? car : null,
        requestRedraw: () => {}
    };
    const blocks = new Scratch3ThreeDBlocks(runtime);

    blocks.followHeading({SPRITE: 'Player Car', X: 0, Y: 56, Z: 155, LOOK_AHEAD: 60});

    t.equal(scene.camera.followDrawableId, 23);
    t.same(scene.camera.followOffset, [0, 56, 155]);
    t.equal(scene.heading, true);
    t.equal(scene.lookAhead, 60);
    t.ok(blocks.getInfo().menus.mesh.items.includes('car'));
    t.end();
});
