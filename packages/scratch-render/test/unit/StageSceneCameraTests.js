const {test} = require('tap');
const StageScene = require('../../src/unified/StageScene');

test('orbitCamera from a top-down pose stays finite and spins around Y', t => {
    const scene = new StageScene();
    scene.setCameraPosition(0, 400, 12);
    scene.setCameraTarget(0, 0, 0);
    const before = scene.camera.position.slice();
    scene.orbitCamera(40, 0);
    scene.camera.position.forEach(v => t.ok(Number.isFinite(v)));
    const radius = Math.hypot(
        scene.camera.position[0] - scene.camera.target[0],
        scene.camera.position[1] - scene.camera.target[1],
        scene.camera.position[2] - scene.camera.target[2]
    );
    t.ok(radius > 200);
    t.notSame(scene.camera.position, before);
    t.equal(scene.enabled, true);
    t.end();
});

test('orbitCamera writes followOffset so follow does not fight the drag', t => {
    const scene = new StageScene();
    scene.upsertObject(7, {mesh: 'sphere', position: [10, 18, -20]});
    scene.camera.followDrawableId = 7;
    scene.camera.followOffset = [0, 90, 180];
    scene.setCameraTarget(10, 18, -20);
    scene.setCameraPosition(10, 108, 160);
    scene.orbitCamera(25, -12);
    const off = scene.camera.followOffset;
    t.ok(Math.abs(off[0] - (scene.camera.position[0] - scene.camera.target[0])) < 0.001);
    t.ok(Math.abs(off[1] - (scene.camera.position[1] - scene.camera.target[1])) < 0.001);
    t.ok(Math.abs(off[2] - (scene.camera.position[2] - scene.camera.target[2])) < 0.001);
    scene.applyFollow();
    t.same(scene.camera.target, [10, 18, -20]);
    t.end();
});

test('zoomCamera clamps and updates followOffset', t => {
    const scene = new StageScene();
    scene.camera.followDrawableId = 1;
    scene.setCameraPosition(0, 400, 12);
    scene.setCameraTarget(0, 0, 0);
    const before = Math.hypot(...scene.camera.position);
    scene.zoomCamera(400);
    const after = Math.hypot(
        scene.camera.position[0],
        scene.camera.position[1],
        scene.camera.position[2]
    );
    t.ok(after > before);
    t.same(scene.camera.followOffset, [
        scene.camera.position[0],
        scene.camera.position[1],
        scene.camera.position[2]
    ]);
    t.end();
});

test('heading-aware follow rotates its offset and looks along the target heading', t => {
    const scene = new StageScene();
    scene.upsertObject(1, {mesh: 'car', position: [10, 18, -20], rotation: [0, 90, 0]});
    scene.camera.followDrawableId = 1;
    scene.camera.followOffset = [0, 30, 100];
    scene.setFollowHeading(true, 80);

    scene.applyFollow();

    t.ok(Math.abs(scene.camera.position[0] + 90) < 0.001);
    t.equal(scene.camera.position[1], 48);
    t.ok(Math.abs(scene.camera.position[2] + 20) < 0.001);
    t.ok(Math.abs(scene.camera.target[0] - 90) < 0.001);
    t.equal(scene.camera.target[1], 18);
    t.ok(Math.abs(scene.camera.target[2] + 20) < 0.001);
    t.end();
});
