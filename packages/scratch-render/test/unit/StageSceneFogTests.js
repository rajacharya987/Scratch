const {test} = require('tap');
const StageScene = require('../../src/unified/StageScene');

test('volumetric fog defaults off and uses Nimo-style params', t => {
    const scene = new StageScene();
    t.equal(scene.fog.enabled, false);
    t.equal(scene.fog.density, 0.0045);
    t.equal(scene.fog.g, 0.72);
    t.equal(scene.fog.scattering, 0.85);
    t.equal(scene.fog.heightFalloff, 0.04);
    t.end();
});

test('setVolumetricFog enables the 3D world', t => {
    const scene = new StageScene();
    scene.setVolumetricFog(true);
    t.equal(scene.fog.enabled, true);
    t.equal(scene.enabled, true);
    scene.setVolumetricFog(false);
    t.equal(scene.fog.enabled, false);
    t.end();
});

test('setFogDensity maps 0-100 onto optical density', t => {
    const scene = new StageScene();
    scene.setFogDensity(25);
    t.ok(Math.abs(scene.fog.density - 0.0045) < 1e-6);
    t.equal(scene.fog.enabled, true);
    scene.setFogDensity(0);
    t.equal(scene.fog.density, 0);
    t.equal(scene.fog.enabled, false);
    t.end();
});

test('fog serializes and deserializes', t => {
    const scene = new StageScene();
    scene.setVolumetricFog(true);
    scene.setFogDensity(40);
    scene.setFogColor([0.2, 0.3, 0.4]);
    scene.setFogHeight(12);
    const data = scene.serialize();
    const other = new StageScene();
    other.deserialize(data);
    t.equal(other.fog.enabled, true);
    t.ok(Math.abs(other.fog.density - 0.0072) < 1e-6);
    t.same(other.fog.color, [0.2, 0.3, 0.4]);
    t.equal(other.fog.height, 12);
    t.end();
});

test('fog presets and extra controls', t => {
    const scene = new StageScene();
    scene.setFogPreset('night');
    t.equal(scene.fog.enabled, true);
    t.same(scene.fog.color, [0.04, 0.06, 0.12]);
    scene.setFogPreset('off');
    t.equal(scene.fog.enabled, false);
    scene.setFogPreset('haze');
    scene.changeFogDensity(10);
    t.ok(Math.abs(scene.fogDensityPercent() - 35) < 0.2);
    scene.setFogShafts(50);
    t.ok(Math.abs(scene.fog.intensity - 0.6) < 1e-6);
    scene.setFogStart(80);
    t.equal(scene.fog.start, 80);
    scene.setFogDistance(400);
    t.equal(scene.fog.maxDistance, 400);
    t.end();
});
