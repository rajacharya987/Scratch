const RenderWebGL = require('./RenderWebGL');
const RenderUnified = require('./unified/RenderUnified');
const Render3D = require('./unified/Render3D');
const StageScene = require('./unified/StageScene');
const {renderMeshThumbnail} = require('./unified/mesh-thumbnail');
const {loadModel, loadMergedModel} = require('./unified/model-loader');

/**
 * Default export remains the 2D WebGL renderer so existing tests and
 * consumers keep working. The GUI constructs RenderUnified, which uses
 * RenderWebGL as the 2D compatibility layer.
 */
module.exports = RenderWebGL;
module.exports.RenderWebGL = RenderWebGL;
module.exports.RenderUnified = RenderUnified;
module.exports.Render3D = Render3D;
module.exports.StageScene = StageScene;
module.exports.renderMeshThumbnail = renderMeshThumbnail;
module.exports.loadModel = loadModel;
module.exports.loadMergedModel = loadMergedModel;
