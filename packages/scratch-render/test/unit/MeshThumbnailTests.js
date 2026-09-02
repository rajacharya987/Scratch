const {test} = require('tap');
const {renderMeshThumbnail} = require('../../src/unified/mesh-thumbnail');
const {getPrimitive} = require('../../src/unified/primitives');

test('unknown mesh names still produce a cube primitive', t => {
    const cube = getPrimitive('cube');
    const fallback = getPrimitive('not-a-shape');
    t.equal(cube.positions.length, fallback.positions.length);
    t.end();
});

test('primitives used as sprite thumbs have different silhouettes', t => {
    const cube = getPrimitive('cube');
    const sphere = getPrimitive('sphere');
    const cone = getPrimitive('cone');
    t.not(cube.positions.length, sphere.positions.length);
    t.not(sphere.positions.length, cone.positions.length);
    t.end();
});

test('thumbnail is null without a canvas (node)', t => {
    t.equal(renderMeshThumbnail('cube', [0.3, 0.8, 0.4]), null);
    t.end();
});
