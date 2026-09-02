const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');
const {namedTargets, visibleTargets, firstOverlapping} = require('./collision');

class Scratch3ThreeDBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._onDisposed = this._onDisposed.bind(this);
        runtime.on('RUNTIME_DISPOSED', this._onDisposed);

        const enable3D = () => {
            try {
                if (this.runtime && this.runtime.renderer && this.runtime.renderer.setWorld3D) {
                    this.runtime.renderer.setWorld3D(true);
                }
            } catch (e) {
                // ignore in mock unit test environments
                void e;
            }
        };
        enable3D();
        if (this.runtime && typeof this.runtime.on === 'function') {
            this.runtime.on('PROJECT_LOADED', enable3D);
        }
    }

    _onDisposed () {
        if (this.runtime.renderer && this.runtime.renderer.reset3D) {
            this.runtime.renderer.reset3D();
        }
    }

    getInfo () {
        return {
            id: 'threed',
            name: formatMessage({
                id: 'threed.categoryName',
                default: '3D',
                description: 'Label for the 3D extension category'
            }),
            color1: '#6D5CFF',
            color2: '#5646D6',
            color3: '#3E329E',
            blocks: [
                {
                    opcode: 'enableWorld',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.enableWorld',
                        default: 'enable 3D world',
                        description: 'Turn the stage into a 3D world with a camera, lights, and ground'
                    })
                },
                '---',
                {
                    opcode: 'enableVolumetricFog',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.enableVolumetricFog',
                        default: 'turn volumetric fog [STATE]',
                        description: 'Toggle volumetric height fog and sun shafts'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setFogPreset',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogPreset',
                        default: 'set fog to [PRESET]',
                        description: 'Apply a fog look: mist, haze, thick, night'
                    }),
                    arguments: {
                        PRESET: {type: ArgumentType.STRING, menu: 'fogPreset', defaultValue: 'haze'}
                    }
                },
                {
                    opcode: 'setFogDensity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogDensity',
                        default: 'set fog density to [VALUE]',
                        description: 'How thick the fog is, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 30}
                    }
                },
                {
                    opcode: 'changeFogDensity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.changeFogDensity',
                        default: 'change fog density by [VALUE]',
                        description: 'Add or subtract fog thickness'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 5}
                    }
                },
                {
                    opcode: 'setFogColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogColor',
                        default: 'set fog color [COLOR]',
                        description: 'Color of distant haze and volume scatter'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#94B3E6'}
                    }
                },
                {
                    opcode: 'setFogHeight',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogHeight',
                        default: 'set fog height to [Y]',
                        description: 'Fog hugs the ground below this height'
                    }),
                    arguments: {
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'setFogFalloff',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogFalloff',
                        default: 'set fog falloff to [VALUE]',
                        description: 'How fast fog thins as you go up, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 40}
                    }
                },
                {
                    opcode: 'setFogStart',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogStart',
                        default: 'set fog start to [VALUE]',
                        description: 'Keep this much distance near the camera clear'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 50}
                    }
                },
                {
                    opcode: 'setFogDistance',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogDistance',
                        default: 'set fog distance to [VALUE]',
                        description: 'How far the volume fog reaches'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 720}
                    }
                },
                {
                    opcode: 'setFogShafts',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setFogShafts',
                        default: 'set fog shafts to [VALUE]',
                        description: 'Sun shafts through the fog, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 55}
                    }
                },
                {
                    opcode: 'getFogDensity',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getFogDensity',
                        default: 'fog density',
                        description: 'Current fog density 0-100'
                    })
                },
                {
                    opcode: 'getFogHeight',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getFogHeight',
                        default: 'fog height',
                        description: 'Current fog height'
                    })
                },
                {
                    opcode: 'fogOn',
                    blockType: BlockType.BOOLEAN,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.fogOn',
                        default: 'volumetric fog on?',
                        description: 'True when volumetric fog is enabled'
                    })
                },
                {
                    opcode: 'showSun',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.showSun',
                        default: 'show sun [STATE]',
                        description: 'Toggle the sun disc in the sky'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'showClouds',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.showClouds',
                        default: 'show clouds [STATE]',
                        description: 'Toggle volumetric sky clouds'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setCloudCoverage',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setCloudCoverage',
                        default: 'set clouds to [VALUE]',
                        description: 'How much of the sky is cloudy, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 55}
                    }
                },
                {
                    opcode: 'setCloudSpeed',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setCloudSpeed',
                        default: 'set cloud speed to [VALUE]',
                        description: 'How fast clouds drift, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 45}
                    }
                },
                {
                    opcode: 'showGodRays',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.showGodRays',
                        default: 'show god rays [STATE]',
                        description: 'Toggle sun shafts through the clouds'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setGodRays',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setGodRays',
                        default: 'set god rays to [VALUE]',
                        description: 'Strength of sun shafts, 0 to 100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 50}
                    }
                },
                '---',
                {
                    opcode: 'setCameraPosition',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setCameraPosition',
                        default: 'set camera position x: [X] y: [Y] z: [Z]',
                        description: 'Move the 3D camera'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 70},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 320}
                    }
                },
                {
                    opcode: 'setCameraTarget',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setCameraTarget',
                        default: 'point camera at x: [X] y: [Y] z: [Z]',
                        description: 'Aim the 3D camera'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 10},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'setCameraFov',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setCameraFov',
                        default: 'set camera field of view to [FOV]',
                        description: 'Set perspective field of view in degrees'
                    }),
                    arguments: {
                        FOV: {type: ArgumentType.NUMBER, defaultValue: 50}
                    }
                },
                {
                    opcode: 'changeCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.changeCamera',
                        default: 'change camera [AXIS] by [VALUE]',
                        description: 'Nudge the camera on one axis'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'axis', defaultValue: 'x'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                {
                    opcode: 'pointCameraAtSprite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.pointCameraAtSprite',
                        default: 'point camera at [SPRITE]',
                        description: 'Aim the camera at a sprite'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    }
                },
                {
                    opcode: 'cameraFollow',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.cameraFollow',
                        default: 'camera follow [SPRITE]',
                        description: 'Keep the camera looking at a sprite'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    }
                },
                {
                    opcode: 'followHeading',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.followHeading',
                        default: 'follow [SPRITE] with car camera X: [X] Y: [Y] Z: [Z] look ahead [LOOK_AHEAD]',
                        description: 'Follow a sprite with an offset that rotates with its heading'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 60},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 180},
                        LOOK_AHEAD: {type: ArgumentType.NUMBER, defaultValue: 60}
                    }
                },
                {
                    opcode: 'cameraStopFollow',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.cameraStopFollow',
                        default: 'stop camera follow',
                        description: 'Stop following a sprite with the camera'
                    })
                },
                {
                    opcode: 'getCamera',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getCamera',
                        default: 'camera [AXIS]',
                        description: 'Camera position on an axis'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'axis', defaultValue: 'x'}
                    }
                },
                '---',
                {
                    opcode: 'setMesh',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setMesh',
                        default: 'set mesh to [MESH]',
                        description: 'Give this sprite a 3D shape'
                    }),
                    arguments: {
                        MESH: {type: ArgumentType.STRING, menu: 'mesh', defaultValue: 'cube'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'importModel',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.importModel',
                        default: 'import 3D model',
                        description: 'Open a .glb file and use it as this sprite mesh'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'clearMesh',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.clearMesh',
                        default: 'use 2D costume',
                        description: 'Remove the 3D mesh and go back to the costume'
                    }),
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setPosition',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setPosition',
                        default: 'set position x: [X] y: [Y] z: [Z]',
                        description: 'Set 3D position'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 25},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'changeZ',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.changeZ',
                        default: 'change z by [Z]',
                        description: 'Change depth'
                    }),
                    arguments: {
                        Z: {type: ArgumentType.NUMBER, defaultValue: 10}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'changeX',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.changeX',
                        default: 'change x by [X]',
                        description: 'Change 3D x'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 10}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'changeY',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.changeY',
                        default: 'change y by [Y]',
                        description: 'Change 3D y'
                    }),
                    arguments: {
                        Y: {type: ArgumentType.NUMBER, defaultValue: 10}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'goToSprite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.goToSprite',
                        default: 'go to [SPRITE] in 3D',
                        description: 'Move this sprite to another sprite in 3D'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'lookAtSprite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.lookAtSprite',
                        default: 'point towards [SPRITE] in 3D',
                        description: 'Yaw this sprite toward another'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'keepInside',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.keepInside',
                        default: 'keep inside world size [SIZE]',
                        description: 'Clamp x and z so the sprite stays on the ground'
                    }),
                    arguments: {
                        SIZE: {type: ArgumentType.NUMBER, defaultValue: 180}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setGizmoMode',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setGizmoMode',
                        default: 'set gizmo to [MODE]',
                        description: 'Move, rotate, or scale handles on the stage'
                    }),
                    arguments: {
                        MODE: {type: ArgumentType.STRING, menu: 'gizmo', defaultValue: 'move'}
                    }
                },
                {
                    opcode: 'setRotation',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setRotation',
                        default: 'set rotation x: [X] y: [Y] z: [Z]',
                        description: 'Set 3D euler rotation in degrees'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 45},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'turnAxis',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.turnAxis',
                        default: 'turn [AXIS] by [DEGREES] degrees',
                        description: 'Rotate around one axis'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'axis', defaultValue: 'y'},
                        DEGREES: {type: ArgumentType.NUMBER, defaultValue: 15}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setScale',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setScale',
                        default: 'set scale x: [X] y: [Y] z: [Z]',
                        description: 'Set non-uniform 3D scale'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 1},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 1},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 1}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'move3D',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.move3D',
                        default: 'move [STEPS] steps in 3D',
                        description: 'Move along the sprite facing direction in 3D'
                    }),
                    arguments: {
                        STEPS: {type: ArgumentType.NUMBER, defaultValue: 10}
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setMaterialColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setMaterialColor',
                        default: 'set material color [COLOR]',
                        description: 'PBR albedo color'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#6D5CFF'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setRoughness',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setRoughness',
                        default: 'set roughness [VALUE]',
                        description: '0 is mirror, 100 is matte'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 45}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setMetallic',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setMetallic',
                        default: 'set metallic [VALUE]',
                        description: '0 is dielectric, 100 is metal'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 5}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setEmissive',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setEmissive',
                        default: 'set emissive [VALUE]',
                        description: 'Make the object glow'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setLightIntensity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setLightIntensity',
                        default: 'set light intensity [VALUE]',
                        description: 'Directional light brightness'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 70}
                    }
                },
                {
                    opcode: 'setLightDirection',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setLightDirection',
                        default: 'set light direction x: [X] y: [Y] z: [Z]',
                        description: 'Vector the sun shines along'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: -0.35},
                        Y: {type: ArgumentType.NUMBER, defaultValue: -1},
                        Z: {type: ArgumentType.NUMBER, defaultValue: -0.25}
                    }
                },
                {
                    opcode: 'setLightColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setLightColor',
                        default: 'set light color [COLOR]',
                        description: 'Sun color'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#FFF0E0'}
                    }
                },
                {
                    opcode: 'setAmbient',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setAmbient',
                        default: 'set ambient light [VALUE]',
                        description: 'Fill light 0-100'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 25}
                    }
                },
                {
                    opcode: 'setPointLight',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setPointLight',
                        default: 'set point light [INDEX] at x: [X] y: [Y] z: [Z] color [COLOR] intensity [VALUE]',
                        description: 'Place a point light 1-4'
                    }),
                    arguments: {
                        INDEX: {type: ArgumentType.NUMBER, defaultValue: 1},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 80},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 40},
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#FFD166'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 80}
                    }
                },
                {
                    opcode: 'setSkyColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setSkyColor',
                        default: 'set sky color [COLOR]',
                        description: 'Sky gradient top color'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#73ADFF'}
                    }
                },
                {
                    opcode: 'showGround',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.showGround',
                        default: 'show ground [STATE]',
                        description: 'Toggle the ground plane'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setGroundColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setGroundColor',
                        default: 'set ground color [COLOR]',
                        description: 'Color of the ground plane'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#38424F'}
                    }
                },
                {
                    opcode: 'showSky',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.showSky',
                        default: 'show sky [STATE]',
                        description: 'Toggle the sky background'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setSkyBottom',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.setSkyBottom',
                        default: 'set horizon color [COLOR]',
                        description: 'Sky color near the ground'
                    }),
                    arguments: {
                        COLOR: {type: ArgumentType.COLOR, defaultValue: '#D9E8FA'}
                    }
                },
                {
                    opcode: 'enableRayTracing',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'threed.enableRayTracing',
                        default: 'enable ray tracing [STATE]',
                        description: 'Toggle ray-traced reflections (RTX path later)'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on'}
                    }
                },
                '---',
                {
                    opcode: 'getX',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getX',
                        default: 'x position',
                        description: '3D x'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'getY',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getY',
                        default: 'y position',
                        description: '3D y'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'getZ',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.getZ',
                        default: 'z position',
                        description: '3D z'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'getRotation',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'threed.getRotation',
                        default: 'rotation [AXIS]',
                        description: 'Euler rotation on an axis'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'axis', defaultValue: 'y'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'distanceTo',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'threed.distanceTo',
                        default: '3D distance to [SPRITE]',
                        description: 'Euclidean distance to another sprite'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'touching3D',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'threed.touching3D',
                        default: 'touching 3D [SPRITE]?',
                        description: 'Axis-aligned box overlap in 3D'
                    }),
                    arguments: {
                        SPRITE: {type: ArgumentType.STRING, menu: 'sprites'}
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'backendName',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.backendName',
                        default: '3D renderer',
                        description: 'webgpu, webgl2, or none'
                    })
                },
                {
                    opcode: 'mouseDx',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.mouseDx',
                        default: 'mouse dx',
                        description: 'Horizontal mouse movement this frame'
                    })
                },
                {
                    opcode: 'mouseDy',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'threed.mouseDy',
                        default: 'mouse dy',
                        description: 'Vertical mouse movement this frame'
                    })
                },
                {
                    opcode: 'rightMouseDown',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'threed.rightMouseDown',
                        default: 'right mouse down?',
                        description: 'True while the right mouse button is held'
                    })
                }
            ],
            menus: {
                mesh: {
                    acceptReporters: true,
                    items: ['cube', 'sphere', 'plane', 'cylinder', 'cone', 'pyramid', 'torus', 'car', 'tree', 'mountain', 'coin']
                },
                axis: {
                    acceptReporters: true,
                    items: ['x', 'y', 'z']
                },
                onOff: {
                    acceptReporters: true,
                    items: ['on', 'off']
                },
                gizmo: {
                    acceptReporters: true,
                    items: ['move', 'rotate', 'scale']
                },
                sprites: {
                    acceptReporters: true,
                    items: 'getSpriteMenu'
                },
                fogPreset: {
                    acceptReporters: true,
                    items: ['off', 'mist', 'haze', 'fog', 'thick', 'night']
                }
            }
        };
    }

    getSpriteMenu () {
        const names = (this.runtime.targets || [])
            .filter(t => t && !t.isStage && t.isOriginal && t.sprite && t.sprite.name)
            .map(t => t.sprite.name);
        return names.length ? names : ['none'];
    }

    _scene () {
        return this.runtime.renderer && this.runtime.renderer.scene;
    }

    _rgb (colorArg) {
        const rgb = Cast.toRgbColorObject(colorArg);
        return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
    }

    _onOff (value) {
        const v = Cast.toString(value).toLowerCase();
        return v === 'on' || v === 'true' || v === '1';
    }

    enableWorld () {
        const scene = this._scene();
        if (!scene) return;
        scene.enable();
        this.runtime.requestRedraw();
    }

    setCameraPosition (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setCameraPosition(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
        this.runtime.requestRedraw();
    }

    setCameraTarget (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setCameraTarget(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
        this.runtime.requestRedraw();
    }

    setCameraFov (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setCameraFov(Cast.toNumber(args.FOV));
        this.runtime.requestRedraw();
    }

    changeCamera (args) {
        const scene = this._scene();
        if (!scene) return;
        const axis = Cast.toString(args.AXIS).toLowerCase();
        const value = Cast.toNumber(args.VALUE);
        const pos = scene.camera.position.slice();
        if (axis === 'y') pos[1] += value;
        else if (axis === 'z') pos[2] += value;
        else pos[0] += value;
        scene.setCameraPosition(pos[0], pos[1], pos[2]);
        this.runtime.requestRedraw();
    }

    _spriteByName (name, util) {
        const targetName = Cast.toString(name);
        if (util && util.target && (
            (typeof util.target.getName === 'function' && util.target.getName() === targetName) ||
            (util.target.sprite && util.target.sprite.name === targetName) ||
            targetName === '_myself_' || targetName === ''
        )) {
            return util.target;
        }
        if (this.runtime.getSpriteTargetByName) {
            const found = this.runtime.getSpriteTargetByName(targetName);
            if (found) return found;
        }
        const targets = this.runtime.targets || [];
        return targets.find(t => t && !t.isStage && (
            (t.sprite && t.sprite.name === targetName) ||
            (typeof t.getName === 'function' && t.getName() === targetName) ||
            t.name === targetName
        ));
    }

    pointCameraAtSprite (args, util) {
        const scene = this._scene();
        const other = this._spriteByName(args.SPRITE, util) || (util && util.target);
        if (!scene || !other) return;
        scene.setCameraTarget(other.x, other.y, other.z || 0);
        if (scene.enable) scene.enable();
        this.runtime.requestRedraw();
    }

    cameraFollow (args, util) {
        const scene = this._scene();
        const other = this._spriteByName(args.SPRITE, util) || (util && util.target);
        if (!scene || !other) return;
        scene.camera.followDrawableId = other.drawableID;
        scene.setFollowHeading(false, 0);
        scene.camera.followOffset = [
            scene.camera.position[0] - other.x,
            scene.camera.position[1] - other.y,
            scene.camera.position[2] - (other.z || 0)
        ];
        if (scene.enable) scene.enable();
        this.runtime.requestRedraw();
    }

    followHeading (args, util) {
        const scene = this._scene();
        const other = this._spriteByName(args.SPRITE, util) || (util && util.target);
        if (!scene || !other) return;
        scene.camera.followDrawableId = other.drawableID;
        scene.camera.followOffset = [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ];
        scene.setFollowHeading(true, Cast.toNumber(args.LOOK_AHEAD));
        if (scene.enable) scene.enable();
        this.runtime.requestRedraw();
    }

    cameraStopFollow () {
        const scene = this._scene();
        if (!scene) return;
        scene.camera.followDrawableId = null;
        scene.setFollowHeading(false, 0);
        this.runtime.requestRedraw();
    }

    getCamera (args) {
        const scene = this._scene();
        if (!scene) return 0;
        const axis = Cast.toString(args.AXIS).toLowerCase();
        if (axis === 'y') return scene.camera.position[1];
        if (axis === 'z') return scene.camera.position[2];
        return scene.camera.position[0];
    }

    setMesh (args, util) {
        const name = Cast.toString(args.MESH);
        if (!util.target.mesh && (util.target.y === 0 || Math.abs(util.target.y) < 1)) {
            // Sit a newly-created primitive on the ground so it is visible.
            util.target.y = 25;
        }
        util.target.setMesh(name);
        const scene = this._scene();
        if (scene) scene.enable();
    }

    importModel (args, util) {
        if (typeof document === 'undefined') return Promise.resolve();
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.glb,.gltf,.obj,.fbx,.stl,.dae,.ply,.3ds,model/*,application/octet-stream';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                if (!file) {
                    resolve();
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const renderer = this.runtime.renderer;
                        if (!renderer || (!renderer.importModel && !renderer.importGlb)) {
                            log.warn('3D renderer cannot import model');
                            resolve();
                            return;
                        }
                        const importFn = renderer.importModel || renderer.importGlb;
                        const customMesh = importFn.call(renderer, util.target.drawableID, reader.result, file.name);
                        util.target.mesh = file.name;
                        if (customMesh) {
                            util.target.customMesh = customMesh;
                        }
                        if (!util.target.y) util.target.y = 25;
                        util.target.syncDrawable3D();
                        const scene = this._scene();
                        if (scene) scene.enable();
                        this.runtime.requestRedraw();
                    } catch (e) {
                        log.warn('Failed to import 3D model', e);
                    }
                    resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsArrayBuffer(file);
            });
            // Cancelled file dialog
            input.addEventListener('cancel', () => resolve());
            input.click();
        });
    }

    clearMesh (args, util) {
        util.target.setMesh(null);
    }

    setPosition (args, util) {
        util.target.setXYZ(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
    }

    changeZ (args, util) {
        util.target.setZ(util.target.z + Cast.toNumber(args.Z));
    }

    changeX (args, util) {
        util.target.setXYZ(util.target.x + Cast.toNumber(args.X), util.target.y, util.target.z);
    }

    changeY (args, util) {
        util.target.setXYZ(util.target.x, util.target.y + Cast.toNumber(args.Y), util.target.z);
    }

    goToSprite (args, util) {
        const other = this._spriteByName(args.SPRITE);
        if (!other) return;
        util.target.setXYZ(other.x, other.y, other.z || 0);
    }

    lookAtSprite (args, util) {
        const other = this._spriteByName(args.SPRITE);
        if (!other) return;
        const dx = other.x - util.target.x;
        const dz = (other.z || 0) - (util.target.z || 0);
        const yaw = Math.atan2(dx, -dz) * 180 / Math.PI;
        util.target.setRotation3D(util.target.rotationX, yaw, util.target.rotationZ);
    }

    keepInside (args, util) {
        const size = Math.max(10, Cast.toNumber(args.SIZE));
        const x = Math.max(-size, Math.min(size, util.target.x));
        const z = Math.max(-size, Math.min(size, util.target.z || 0));
        util.target.setXYZ(x, util.target.y, z);
    }

    setGizmoMode (args) {
        const scene = this._scene();
        if (!scene) return;
        const mode = Cast.toString(args.MODE).toLowerCase();
        scene.gizmoMode = (mode === 'rotate' || mode === 'scale') ? mode : 'move';
    }

    setRotation (args, util) {
        util.target.setRotation3D(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
    }

    turnAxis (args, util) {
        const axis = Cast.toString(args.AXIS).toLowerCase();
        const deg = Cast.toNumber(args.DEGREES);
        const rx = util.target.rotationX + (axis === 'x' ? deg : 0);
        const ry = util.target.rotationY + (axis === 'y' ? deg : 0);
        const rz = util.target.rotationZ + (axis === 'z' ? deg : 0);
        util.target.setRotation3D(rx, ry, rz);
    }

    setScale (args, util) {
        util.target.setScale3D(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
    }

    move3D (args, util) {
        const steps = Cast.toNumber(args.STEPS);
        const rx = util.target.rotationX * Math.PI / 180;
        const ry = util.target.rotationY * Math.PI / 180;
        const cosX = Math.cos(rx);
        const dx = Math.sin(ry) * cosX * steps;
        const dy = -Math.sin(rx) * steps;
        const dz = -Math.cos(ry) * cosX * steps;
        util.target.setXYZ(util.target.x + dx, util.target.y + dy, util.target.z + dz);
    }

    setMaterialColor (args, util) {
        util.target.material3d.albedo = this._rgb(args.COLOR);
        util.target.syncDrawable3D();
        this.runtime.requestRedraw();
        this.runtime.requestTargetsUpdate(util.target);
    }

    setRoughness (args, util) {
        util.target.material3d.roughness = Math.max(0, Math.min(100, Cast.toNumber(args.VALUE))) / 100;
        util.target.syncDrawable3D();
        this.runtime.requestRedraw();
    }

    setMetallic (args, util) {
        util.target.material3d.metallic = Math.max(0, Math.min(100, Cast.toNumber(args.VALUE))) / 100;
        util.target.syncDrawable3D();
        this.runtime.requestRedraw();
    }

    setEmissive (args, util) {
        util.target.material3d.emissive = Math.max(0, Cast.toNumber(args.VALUE)) / 100;
        util.target.syncDrawable3D();
        this.runtime.requestRedraw();
    }

    setLightIntensity (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setLightIntensity(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setLightDirection (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setLightDirection(Cast.toNumber(args.X), Cast.toNumber(args.Y), Cast.toNumber(args.Z));
        this.runtime.requestRedraw();
    }

    setLightColor (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.directional.color = this._rgb(args.COLOR);
        scene.enable();
        this.runtime.requestRedraw();
    }

    setAmbient (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setAmbient(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setPointLight (args) {
        const scene = this._scene();
        if (!scene) return;
        const index = Math.max(0, Math.min(3, Math.round(Cast.toNumber(args.INDEX)) - 1));
        scene.setPointLight(index, [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ], this._rgb(args.COLOR), Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setSkyColor (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.skyTop = this._rgb(args.COLOR);
        scene.enable();
        this.runtime.requestRedraw();
    }

    showGround (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.showGround = this._onOff(args.STATE);
        scene.enable();
        this.runtime.requestRedraw();
    }

    enableVolumetricFog (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setVolumetricFog(this._onOff(args.STATE));
        this.runtime.requestRedraw();
    }

    setFogPreset (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogPreset(Cast.toString(args.PRESET));
        this.runtime.requestRedraw();
    }

    setFogDensity (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogDensity(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    changeFogDensity (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.changeFogDensity(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setFogColor (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogColor(this._rgb(args.COLOR));
        this.runtime.requestRedraw();
    }

    setFogHeight (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogHeight(Cast.toNumber(args.Y));
        this.runtime.requestRedraw();
    }

    setFogFalloff (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogFalloff(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setFogStart (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogStart(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setFogDistance (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogDistance(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setFogShafts (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setFogShafts(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    getFogDensity () {
        const scene = this._scene();
        return scene ? scene.fogDensityPercent() : 0;
    }

    getFogHeight () {
        const scene = this._scene();
        return scene && scene.fog ? scene.fog.height : 0;
    }

    fogOn () {
        const scene = this._scene();
        return Boolean(scene && scene.fog && scene.fog.enabled);
    }

    showSun (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setShowSun(this._onOff(args.STATE));
        this.runtime.requestRedraw();
    }

    showClouds (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setShowClouds(this._onOff(args.STATE));
        this.runtime.requestRedraw();
    }

    setCloudCoverage (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setCloudCoverage(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setCloudSpeed (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setCloudSpeed(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    showGodRays (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setShowGodRays(this._onOff(args.STATE));
        this.runtime.requestRedraw();
    }

    setGodRays (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setGodRays(Cast.toNumber(args.VALUE));
        this.runtime.requestRedraw();
    }

    setGroundColor (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setGroundColor(this._rgb(args.COLOR));
        this.runtime.requestRedraw();
    }

    showSky (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.showSky = this._onOff(args.STATE);
        scene.enable();
        this.runtime.requestRedraw();
    }

    setSkyBottom (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.setSkyBottom(this._rgb(args.COLOR));
        this.runtime.requestRedraw();
    }

    enableRayTracing (args) {
        const scene = this._scene();
        if (!scene) return;
        scene.rayTracing = this._onOff(args.STATE);
        scene.enable();
        this.runtime.requestRedraw();
    }

    getX (args, util) {
        return util.target.x;
    }

    getY (args, util) {
        return util.target.y;
    }

    getZ (args, util) {
        return util.target.z;
    }

    getRotation (args, util) {
        const axis = Cast.toString(args.AXIS).toLowerCase();
        if (axis === 'x') return util.target.rotationX;
        if (axis === 'z') return util.target.rotationZ;
        return util.target.rotationY;
    }

    distanceTo (args, util) {
        const other = this._spriteByName(args.SPRITE, util);
        if (!other) return 0;
        const dx = other.x - util.target.x;
        const dy = other.y - util.target.y;
        const dz = (other.z || 0) - util.target.z;
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    touching3D (args, util) {
        const name = Cast.toString(args.SPRITE);
        const matches = namedTargets(this.runtime, name);
        return Boolean(firstOverlapping(util.target, matches));
    }

    touchingSolid (args, util) {
        const solids = visibleTargets(this.runtime, t => t.solid3d);
        const hit = firstOverlapping(util.target, solids);
        if (hit) {
            this._lastCollisionSprite = hit.sprite ? hit.sprite.name : '';
            return true;
        }
        return false;
    }

    collisionSprite (args, util) {
        return this._lastCollisionSprite || '';
    }

    backendName () {
        if (this.runtime.renderer && this.runtime.renderer.backendName) {
            return this.runtime.renderer.backendName;
        }
        return 'none';
    }

    mouseDx () {
        const scene = this._scene();
        return scene && scene.pointer ? scene.pointer.dx : 0;
    }

    mouseDy () {
        const scene = this._scene();
        return scene && scene.pointer ? scene.pointer.dy : 0;
    }

    rightMouseDown () {
        const scene = this._scene();
        return Boolean(scene && scene.pointer && scene.pointer.rightDown);
    }
}

module.exports = Scratch3ThreeDBlocks;
