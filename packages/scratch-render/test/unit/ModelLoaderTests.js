const {test} = require('tap');
const {
    loadMergedModel, loadOBJ, loadSTL, loadFBX, loadDAE, loadPLY
} = require('../../src/unified/model-loader');

test('loadOBJ parses wavefront OBJ geometry with triangles and quads', t => {
    const objContent = `
# Cube OBJ
v -1.0 -1.0 1.0
v 1.0 -1.0 1.0
v 1.0 1.0 1.0
v -1.0 1.0 1.0
v -1.0 -1.0 -1.0
v 1.0 -1.0 -1.0
v 1.0 1.0 -1.0
v -1.0 1.0 -1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 -1.0
vt 0.0 0.0
vt 1.0 0.0
vt 1.0 1.0
vt 0.0 1.0
f 1/1/1 2/2/1 3/3/1 4/4/1
f 6/1/2 5/2/2 8/3/2 7/4/2
`;
    const parts = loadOBJ(objContent);
    t.equal(parts.length, 1);
    const {mesh, material} = parts[0];
    t.ok(mesh.positions.length > 0);
    t.ok(mesh.indices.length >= 12); // 2 quads = 4 triangles = 12 indices
    t.ok(mesh.normals.length === mesh.positions.length);
    t.ok(material && material.albedo);
    t.end();
});

test('loadSTL parses ASCII STL geometry', t => {
    const stlContent = `
solid cube_stl
  facet normal 0 0 1
    outer loop
      vertex -10 -10 10
      vertex 10 -10 10
      vertex 10 10 10
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex -10 -10 10
      vertex 10 10 10
      vertex -10 10 10
    endloop
  endfacet
endsolid
`;
    const parts = loadSTL(stlContent);
    t.equal(parts.length, 1);
    const {mesh} = parts[0];
    t.equal(mesh.positions.length, 18); // 2 triangles * 3 vertices * 3 coords
    t.equal(mesh.indices.length, 6);
    t.end();
});

test('loadFBX parses ASCII FBX geometry', t => {
    const fbxContent = `
; FBX 7.4.0 project file
FBXHeaderExtension: {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
}
Objects: {
    Geometry: 12345, "Geometry::Mesh", "Mesh" {
        Vertices: *12 {
            a: -10,-10,0, 10,-10,0, 10,10,0, -10,10,0
        }
        PolygonVertexIndex: *4 {
            a: 0,1,2,-4
        }
    }
}
`;
    const parts = loadFBX(fbxContent);
    t.equal(parts.length, 1);
    const {mesh} = parts[0];
    t.ok(mesh.positions.length >= 12);
    t.ok(mesh.indices.length >= 6); // 1 quad = 2 triangles
    t.end();
});

test('loadDAE parses COLLADA geometry', t => {
    const daeContent = `
<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_geometries>
    <geometry id="Cube-mesh" name="Cube">
      <mesh>
        <source id="Cube-mesh-positions">
          <float_array id="Cube-mesh-positions-array" count="12">-10 -10 0 10 -10 0 10 10 0 -10 10 0</float_array>
        </source>
        <triangles count="2">
          <p>0 1 2 0 2 3</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
</COLLADA>
`;
    const parts = loadDAE(daeContent);
    t.equal(parts.length, 1);
    const {mesh} = parts[0];
    t.equal(mesh.positions.length, 12);
    t.equal(mesh.indices.length, 6);
    t.end();
});

test('loadPLY parses PLY geometry', t => {
    const plyContent = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
element face 2
property list uchar int vertex_indices
end_header
-10 -10 0
10 -10 0
10 10 0
-10 10 0
3 0 1 2
3 0 2 3
`;
    const parts = loadPLY(plyContent);
    t.equal(parts.length, 1);
    const {mesh} = parts[0];
    t.equal(mesh.positions.length, 12);
    t.equal(mesh.indices.length, 6);
    t.end();
});

test('loadMergedModel auto-detects format and produces unified customMesh', t => {
    const objData = `
v 0 0 0
v 10 0 0
v 0 10 0
f 1 2 3
`;
    const result = loadMergedModel(objData, 'test.obj');
    t.ok(result.customMesh);
    t.ok(result.customMesh.positions.length === 9);
    t.ok(result.customMesh.indices.length === 3);
    t.ok(result.material);
    t.end();
});
