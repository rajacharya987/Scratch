jest.mock('@scratch/scratch-vm', () => {
    const VM = function VM () {};
    return VM;
}, {virtual: true});

import {Blocks} from '../../../src/containers/blocks.jsx';

describe('Blocks container onWorkspaceUpdate', () => {
    let instance;

    beforeEach(() => {
        // Minimal mock instance — just enough for onWorkspaceUpdate to run
        instance = {
            getToolboxXML: jest.fn().mockReturnValue(null),
            onWorkspaceMetricsChange: jest.fn(),
            toolboxUpdateChangeListener: jest.fn(),
            props: {
                vm: {editingTarget: null},
                workspaceMetrics: {targets: {}},
                updateToolboxState: jest.fn()
            },
            workspace: {
                removeChangeListener: jest.fn(),
                addChangeListener: jest.fn(),
                clearUndo: jest.fn()
            },
            ScratchBlocks: {
                Events: {
                    disable: jest.fn(),
                    enable: jest.fn()
                },
                utils: {
                    xml: {
                        textToDom: jest.fn().mockReturnValue(document.createElement('xml'))
                    }
                },
                clearWorkspaceAndLoadFromXml: jest.fn()
            }
        };
    });

    test('Events.enable() is called after a successful workspace load', () => {
        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when clearWorkspaceAndLoadFromXml throws', () => {
        instance.ScratchBlocks.clearWorkspaceAndLoadFromXml.mockImplementation(() => {
            throw new Error('workspace load failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when textToDom throws', () => {
        instance.ScratchBlocks.utils.xml.textToDom.mockImplementation(() => {
            throw new Error('XML parse failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: 'invalid xml'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });
});

describe('Blocks container script glow', () => {
    let instance;

    beforeEach(() => {
        instance = {
            ScratchBlocks: {
                glowStack: jest.fn(),
                reportValue: jest.fn()
            },
            glowWorkspaceStack: Blocks.prototype.glowWorkspaceStack
        };
    });

    test('glows a stack that exists in the workspace', () => {
        Blocks.prototype.onScriptGlowOn.call(instance, {id: 'n1'});
        expect(instance.ScratchBlocks.glowStack).toHaveBeenCalledWith('n1', true);

        Blocks.prototype.onScriptGlowOff.call(instance, {id: 'n1'});
        expect(instance.ScratchBlocks.glowStack).toHaveBeenCalledWith('n1', false);
    });

    test('does not throw when glowing a block that is not in the workspace', () => {
        instance.ScratchBlocks.glowStack.mockImplementation(() => {
            throw new Error('Tried to glow block that does not exist.');
        });

        expect(() => {
            Blocks.prototype.onScriptGlowOn.call(instance, {id: 'missing'});
        }).not.toThrow();
        expect(() => {
            Blocks.prototype.onScriptGlowOff.call(instance, {id: 'missing'});
        }).not.toThrow();
    });

    test('ignores glow requests with no block id', () => {
        Blocks.prototype.onScriptGlowOn.call(instance, {});
        Blocks.prototype.onScriptGlowOff.call(instance, {id: null});
        expect(instance.ScratchBlocks.glowStack).not.toHaveBeenCalled();
    });

    test('does not throw when reporting a value for a missing block', () => {
        instance.ScratchBlocks.reportValue.mockImplementation(() => {
            throw new Error('Tried to report value on block that does not exist.');
        });

        expect(() => {
            Blocks.prototype.onVisualReport.call(instance, {id: 'missing', value: 1});
        }).not.toThrow();
    });
});
