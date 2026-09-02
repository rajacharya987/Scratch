"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var messages = {
    costume: { defaultMessage: 'costume' },
    meow: { defaultMessage: 'Meow' },
    backdrop: { defaultMessage: 'backdrop' },
    pop: { defaultMessage: 'pop' },
    sprite: { defaultMessage: 'Sprite' },
    variable: { defaultMessage: 'my variable' }
};
var defaultTranslator = function (msgObj) { return msgObj.defaultMessage; };
var ID = {
    score: 'varScore',
    dx: 'varDx',
    dz: 'varDz',
    ndx: 'varNdx',
    ndz: 'varNdz',
    alive: 'varAlive',
    paused: 'varPaused',
    index: 'varIndex',
    i: 'varI',
    bodyX: 'listBodyX',
    bodyZ: 'listBodyZ',
    placeFood: 'bcPlaceFood'
};
var makeBlocks = function () {
    var n = 0;
    var blocks = {};
    var nid = function () { return "n".concat(++n); };
    var put = function (partial) {
        var id = partial.id || nid();
        blocks[id] = Object.assign({
            next: null,
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
        }, partial, { id: id });
        return id;
    };
    var attachNext = function (parent, child) {
        if (parent) {
            blocks[child].parent = parent;
            blocks[parent].next = child;
        }
        else {
            blocks[child].topLevel = true;
            blocks[child].parent = null;
        }
        return child;
    };
    var cmd = function (opcode, parent, extra) {
        if (extra === void 0) { extra = {}; }
        return attachNext(parent, put(Object.assign({ opcode: opcode }, extra)));
    };
    var hat = function (opcode, x, y, extra) {
        if (extra === void 0) { extra = {}; }
        return put(Object.assign({ opcode: opcode, topLevel: true, x: x, y: y }, extra));
    };
    var shadowNum = function (parent, name, value, opcode) {
        if (opcode === void 0) { opcode = 'math_number'; }
        var id = put({
            opcode: opcode,
            parent: parent,
            shadow: true,
            fields: { NUM: [String(value), null] }
        });
        blocks[parent].inputs[name] = [1, id];
        return id;
    };
    var shadowText = function (parent, name, value) {
        var id = put({
            opcode: 'text',
            parent: parent,
            shadow: true,
            fields: { TEXT: [value, null] }
        });
        blocks[parent].inputs[name] = [1, id];
        return id;
    };
    var shadowColor = function (parent, name, value) {
        var id = put({
            opcode: 'colour_picker',
            parent: parent,
            shadow: true,
            fields: { COLOUR: [value, null] }
        });
        blocks[parent].inputs[name] = [1, id];
        return id;
    };
    var shadowMenu = function (parent, inputName, menuOpcode, fieldName, value) {
        var _a;
        var id = put({
            opcode: menuOpcode,
            parent: parent,
            shadow: true,
            fields: (_a = {}, _a[fieldName] = [value, null], _a)
        });
        blocks[parent].inputs[inputName] = [1, id];
        return id;
    };
    var reporter = function (opcode, parent, inputName, extra) {
        if (extra === void 0) { extra = {}; }
        var id = put(Object.assign({ opcode: opcode, parent: parent, shadow: false }, extra));
        blocks[parent].inputs[inputName] = [2, id];
        return id;
    };
    var varRep = function (parent, inputName, name, varId) {
        return reporter('data_variable', parent, inputName, {
            fields: { VARIABLE: [name, varId] }
        });
    };
    var setVar = function (parent, name, varId, value) {
        var id = cmd('data_setvariableto', parent, {
            fields: { VARIABLE: [name, varId] }
        });
        shadowText(id, 'VALUE', String(value));
        return id;
    };
    var xyz = function (parent, x, y, z) {
        var id = cmd('threed_setPosition', parent);
        shadowNum(id, 'X', x);
        shadowNum(id, 'Y', y);
        shadowNum(id, 'Z', z);
        return id;
    };
    var mesh = function (parent, shape) {
        var id = cmd('threed_setMesh', parent);
        shadowMenu(id, 'MESH', 'threed_menu_mesh', 'mesh', shape);
        return id;
    };
    var color = function (parent, hex) {
        var id = cmd('threed_setMaterialColor', parent);
        shadowColor(id, 'COLOR', hex);
        return id;
    };
    var scaleXYZ = function (parent, x, y, z) {
        var id = cmd('threed_setScale', parent);
        shadowNum(id, 'X', x);
        shadowNum(id, 'Y', y);
        shadowNum(id, 'Z', z);
        return id;
    };
    var scale = function (parent, s) { return scaleXYZ(parent, s, s, s); };
    var rot = function (parent, x, y, z) {
        var id = cmd('threed_setRotation', parent);
        shadowNum(id, 'X', x);
        shadowNum(id, 'Y', y);
        shadowNum(id, 'Z', z);
        return id;
    };
    var setNum = function (parent, opcode, name, value) {
        var id = cmd(opcode, parent);
        shadowNum(id, name, value);
        return id;
    };
    var onOff = function (parent, opcode, value) {
        var id = cmd(opcode, parent);
        shadowMenu(id, 'STATE', 'threed_menu_onOff', 'onOff', value);
        return id;
    };
    return {
        blocks: blocks,
        put: put,
        cmd: cmd,
        hat: hat,
        shadowNum: shadowNum,
        shadowText: shadowText,
        shadowMenu: shadowMenu,
        shadowColor: shadowColor,
        reporter: reporter,
        varRep: varRep,
        setVar: setVar,
        xyz: xyz,
        mesh: mesh,
        color: color,
        scale: scale,
        scaleXYZ: scaleXYZ,
        rot: rot,
        setNum: setNum,
        onOff: onOff,
        attachNext: attachNext
    };
};
var coverVar = function (b, parent, name, varName, varId) {
    var textShadow = b.blocks[parent].inputs.VALUE[1];
    var rep = b.reporter('data_variable', parent, 'VALUE', { fields: { VARIABLE: [varName, varId] } });
    b.blocks[parent].inputs.VALUE = [3, rep, textShadow];
    b.blocks[textShadow].parent = parent;
    b.blocks[rep].parent = parent;
};
var headBlocks = function () {
    var b = makeBlocks();
    var cmd = b.cmd, hat = b.hat, shadowNum = b.shadowNum, shadowText = b.shadowText, shadowMenu = b.shadowMenu, shadowColor = b.shadowColor, reporter = b.reporter, varRep = b.varRep, setVar = b.setVar, xyz = b.xyz, mesh = b.mesh, color = b.color, scale = b.scale, rot = b.rot, setNum = b.setNum, onOff = b.onOff;
    var p = hat('event_whenflagclicked', 40, 40);
    p = cmd('threed_enableWorld', p);
    p = onOff(p, 'threed_showSun', 'on');
    p = onOff(p, 'threed_showClouds', 'on');
    p = setNum(p, 'threed_setCloudCoverage', 'VALUE', 18);
    p = setNum(p, 'threed_setCloudSpeed', 'VALUE', 16);
    p = onOff(p, 'threed_showGodRays', 'off');
    {
        var c = cmd('threed_setFogPreset', p);
        shadowMenu(c, 'PRESET', 'threed_menu_fogPreset', 'fogPreset', 'off');
        p = c;
    }
    {
        var c = cmd('threed_setSkyColor', p);
        shadowColor(c, 'COLOR', '#5AA8E8');
        p = c;
    }
    {
        var c = cmd('threed_setSkyBottom', p);
        shadowColor(c, 'COLOR', '#C8E6A8');
        p = c;
    }
    {
        var c = cmd('threed_setGroundColor', p);
        shadowColor(c, 'COLOR', '#2E7A3C');
        p = c;
    }
    p = onOff(p, 'threed_showGround', 'on');
    p = onOff(p, 'threed_showSky', 'on');
    {
        var c = cmd('threed_setLightDirection', p);
        shadowNum(c, 'X', 0.2);
        shadowNum(c, 'Y', -1);
        shadowNum(c, 'Z', 0.15);
        p = c;
    }
    {
        var c = cmd('threed_setLightColor', p);
        shadowColor(c, 'COLOR', '#FFF3C8');
        p = c;
    }
    p = setNum(p, 'threed_setLightIntensity', 'VALUE', 100);
    p = setNum(p, 'threed_setAmbient', 'VALUE', 38);
    {
        var c = cmd('threed_setCameraPosition', p);
        shadowNum(c, 'X', 0);
        shadowNum(c, 'Y', 420);
        shadowNum(c, 'Z', 16);
        p = c;
    }
    {
        var c = cmd('threed_setCameraTarget', p);
        shadowNum(c, 'X', 0);
        shadowNum(c, 'Y', 0);
        shadowNum(c, 'Z', 0);
        p = c;
    }
    p = setNum(p, 'threed_setCameraFov', 'FOV', 42);
    p = cmd('threed_cameraStopFollow', p);
    p = mesh(p, 'sphere');
    p = color(p, '#1B8F3A');
    p = setNum(p, 'threed_setRoughness', 'VALUE', 28);
    p = setNum(p, 'threed_setMetallic', 'VALUE', 8);
    p = scale(p, 1.05);
    p = xyz(p, 0, 16, 0);
    p = rot(p, 0, 90, 0);
    p = setVar(p, 'dx', ID.dx, 40);
    p = setVar(p, 'dz', ID.dz, 0);
    p = setVar(p, 'ndx', ID.ndx, 40);
    p = setVar(p, 'ndz', ID.ndz, 0);
    p = setVar(p, 'score', ID.score, 0);
    p = setVar(p, 'alive', ID.alive, 1);
    p = setVar(p, 'paused', ID.paused, 0);
    p = cmd('data_deletealloflist', p, { fields: { LIST: ['body x', ID.bodyX] } });
    p = cmd('data_deletealloflist', p, { fields: { LIST: ['body z', ID.bodyZ] } });
    {
        var c = cmd('data_insertatlist', p);
        b.blocks[c].fields.LIST = ['body x', ID.bodyX];
        shadowNum(c, 'INDEX', 1, 'math_integer');
        shadowText(c, 'ITEM', '-40');
        p = c;
    }
    {
        var c = cmd('data_insertatlist', p);
        b.blocks[c].fields.LIST = ['body z', ID.bodyZ];
        shadowNum(c, 'INDEX', 1, 'math_integer');
        shadowText(c, 'ITEM', '0');
        p = c;
    }
    {
        var c = cmd('control_create_clone_of', p);
        shadowMenu(c, 'CLONE_OPTION', 'control_create_clone_of_menu', 'CLONE_OPTION', 'Body');
        p = c;
    }
    {
        var c = cmd('data_insertatlist', p);
        b.blocks[c].fields.LIST = ['body x', ID.bodyX];
        shadowNum(c, 'INDEX', 'last', 'math_integer');
        shadowText(c, 'ITEM', '-80');
        p = c;
    }
    {
        var c = cmd('data_insertatlist', p);
        b.blocks[c].fields.LIST = ['body z', ID.bodyZ];
        shadowNum(c, 'INDEX', 'last', 'math_integer');
        shadowText(c, 'ITEM', '0');
        p = c;
    }
    {
        var c = cmd('control_create_clone_of', p);
        shadowMenu(c, 'CLONE_OPTION', 'control_create_clone_of_menu', 'CLONE_OPTION', 'Body');
        p = c;
    }
    {
        var c = cmd('looks_say', p);
        shadowText(c, 'MESSAGE', 'WASD / arrows. Space pause. Right-drag to tilt. Eat the gold orb.');
        p = c;
    }
    {
        var c = cmd('event_broadcast', p);
        shadowMenu(c, 'BROADCAST_INPUT', 'event_broadcast_menu', 'BROADCAST_OPTION', 'place food');
        b.blocks[b.blocks[c].inputs.BROADCAST_INPUT[1]].fields.BROADCAST_OPTION = ['place food', ID.placeFood];
        p = c;
    }
    var forever = cmd('control_forever', p);
    var ifAlive = cmd('control_if', forever);
    b.blocks[forever].inputs.SUBSTACK = [2, ifAlive];
    b.blocks[ifAlive].parent = forever;
    b.blocks[forever].next = null;
    {
        var and = reporter('operator_and', ifAlive, 'CONDITION');
        var eq = reporter('operator_equals', and, 'OPERAND1');
        varRep(eq, 'OPERAND1', 'alive', ID.alive);
        shadowText(eq, 'OPERAND2', '1');
        var eqP = reporter('operator_equals', and, 'OPERAND2');
        varRep(eqP, 'OPERAND1', 'paused', ID.paused);
        shadowText(eqP, 'OPERAND2', '0');
    }
    var s = cmd('control_wait', ifAlive);
    b.blocks[ifAlive].inputs.SUBSTACK = [2, s];
    {
        var dur = reporter('operator_add', s, 'DURATION');
        shadowNum(dur, 'NUM1', 0.13);
        var div = reporter('operator_divide', dur, 'NUM2');
        shadowNum(div, 'NUM1', 1.1);
        var add = reporter('operator_add', div, 'NUM2');
        varRep(add, 'NUM1', 'score', ID.score);
        shadowNum(add, 'NUM2', 10, 'math_number');
        b.blocks[s].inputs.DURATION = [2, dur];
    }
    s = setVar(s, 'dx', ID.dx, '0');
    coverVar(b, s, 'VALUE', 'ndx', ID.ndx);
    s = setVar(s, 'dz', ID.dz, '0');
    coverVar(b, s, 'VALUE', 'ndz', ID.ndz);
    {
        var c = cmd('data_insertatlist', s);
        b.blocks[c].fields.LIST = ['body x', ID.bodyX];
        shadowNum(c, 'INDEX', 1, 'math_integer');
        reporter('threed_getX', c, 'ITEM');
        s = c;
    }
    {
        var c = cmd('data_insertatlist', s);
        b.blocks[c].fields.LIST = ['body z', ID.bodyZ];
        shadowNum(c, 'INDEX', 1, 'math_integer');
        reporter('threed_getZ', c, 'ITEM');
        s = c;
    }
    {
        var c = cmd('threed_setPosition', s);
        var addX = reporter('operator_add', c, 'X');
        reporter('threed_getX', addX, 'NUM1');
        varRep(addX, 'NUM2', 'dx', ID.dx);
        shadowNum(c, 'Y', 16);
        var addZ = reporter('operator_add', c, 'Z');
        reporter('threed_getZ', addZ, 'NUM1');
        varRep(addZ, 'NUM2', 'dz', ID.dz);
        s = c;
    }
    var face = function (parent, axisVar, axisId, value, yaw) {
        var iff = cmd('control_if', parent);
        var eq = reporter('operator_equals', iff, 'CONDITION');
        varRep(eq, 'OPERAND1', axisVar, axisId);
        shadowText(eq, 'OPERAND2', String(value));
        rot(iff, 0, yaw, 0);
        b.blocks[iff].inputs.SUBSTACK = [2, b.blocks[iff].next];
        b.blocks[iff].next = null;
        return iff;
    };
    s = face(s, 'dx', ID.dx, 40, 90);
    s = face(s, 'dx', ID.dx, -40, -90);
    s = face(s, 'dz', ID.dz, -40, 0);
    s = face(s, 'dz', ID.dz, 40, 180);
    var ifFood = cmd('control_if_else', s);
    {
        var lt = reporter('operator_lt', ifFood, 'CONDITION');
        var dist = reporter('threed_distanceTo', lt, 'OPERAND1');
        shadowMenu(dist, 'SPRITE', 'threed_menu_sprites', 'sprites', 'Food');
        shadowNum(lt, 'OPERAND2', 34);
    }
    var t = cmd('data_changevariableby', ifFood);
    b.blocks[ifFood].inputs.SUBSTACK = [2, t];
    b.blocks[t].fields.VARIABLE = ['score', ID.score];
    shadowNum(t, 'VALUE', 1);
    {
        var c = cmd('sound_play', t);
        var sh = b.put({
            opcode: 'sound_sounds_menu',
            parent: c,
            shadow: true,
            fields: { SOUND_MENU: ['Meow', null] }
        });
        b.blocks[c].inputs.SOUND_MENU = [1, sh];
        t = c;
    }
    {
        var c = cmd('control_create_clone_of', t);
        shadowMenu(c, 'CLONE_OPTION', 'control_create_clone_of_menu', 'CLONE_OPTION', 'Body');
        t = c;
    }
    {
        var c = cmd('event_broadcast', t);
        shadowMenu(c, 'BROADCAST_INPUT', 'event_broadcast_menu', 'BROADCAST_OPTION', 'place food');
        b.blocks[b.blocks[c].inputs.BROADCAST_INPUT[1]].fields.BROADCAST_OPTION = ['place food', ID.placeFood];
        t = c;
    }
    var el = cmd('data_deleteoflist', ifFood);
    b.blocks[ifFood].inputs.SUBSTACK2 = [2, el];
    b.blocks[el].parent = ifFood;
    b.blocks[el].fields.LIST = ['body x', ID.bodyX];
    shadowNum(el, 'INDEX', 'last', 'math_integer');
    el = cmd('data_deleteoflist', el);
    b.blocks[el].fields.LIST = ['body z', ID.bodyZ];
    shadowNum(el, 'INDEX', 'last', 'math_integer');
    s = ifFood;
    var ifWall = cmd('control_if', s);
    {
        var or1 = reporter('operator_or', ifWall, 'CONDITION');
        var or2 = reporter('operator_or', or1, 'OPERAND1');
        var or3 = reporter('operator_or', or1, 'OPERAND2');
        var gtX = reporter('operator_gt', or2, 'OPERAND1');
        reporter('threed_getX', gtX, 'OPERAND1');
        shadowNum(gtX, 'OPERAND2', 168);
        var ltX = reporter('operator_lt', or2, 'OPERAND2');
        reporter('threed_getX', ltX, 'OPERAND1');
        shadowNum(ltX, 'OPERAND2', -168);
        var gtZ = reporter('operator_gt', or3, 'OPERAND1');
        reporter('threed_getZ', gtZ, 'OPERAND1');
        shadowNum(gtZ, 'OPERAND2', 168);
        var ltZ = reporter('operator_lt', or3, 'OPERAND2');
        reporter('threed_getZ', ltZ, 'OPERAND1');
        shadowNum(ltZ, 'OPERAND2', -168);
    }
    var w = setVar(ifWall, 'alive', ID.alive, 0);
    b.blocks[ifWall].inputs.SUBSTACK = [2, w];
    {
        var c = cmd('looks_say', w);
        shadowText(c, 'MESSAGE', 'Game over — hit the wall.');
    }
    s = ifWall;
    var ifBody = cmd('control_if', s);
    {
        var gt = reporter('operator_gt', ifBody, 'CONDITION');
        reporter('data_lengthoflist', gt, 'OPERAND1', { fields: { LIST: ['body x', ID.bodyX] } });
        shadowNum(gt, 'OPERAND2', 4);
    }
    var loopParent = setVar(ifBody, 'i', ID.i, 3);
    b.blocks[ifBody].inputs.SUBSTACK = [2, loopParent];
    var repeat = cmd('control_repeat', loopParent);
    {
        var len = reporter('data_lengthoflist', repeat, 'TIMES', { fields: { LIST: ['body x', ID.bodyX] } });
        b.blocks[repeat].inputs.TIMES = [2, len];
    }
    var ifHit = cmd('control_if', repeat);
    b.blocks[repeat].inputs.SUBSTACK = [2, ifHit];
    b.blocks[repeat].next = null;
    {
        var and = reporter('operator_and', ifHit, 'CONDITION');
        var eqX = reporter('operator_equals', and, 'OPERAND1');
        reporter('threed_getX', eqX, 'OPERAND1');
        var itemX = reporter('data_itemoflist', eqX, 'OPERAND2', { fields: { LIST: ['body x', ID.bodyX] } });
        varRep(itemX, 'INDEX', 'i', ID.i);
        var eqZ = reporter('operator_equals', and, 'OPERAND2');
        reporter('threed_getZ', eqZ, 'OPERAND1');
        var itemZ = reporter('data_itemoflist', eqZ, 'OPERAND2', { fields: { LIST: ['body z', ID.bodyZ] } });
        varRep(itemZ, 'INDEX', 'i', ID.i);
    }
    var die = setVar(ifHit, 'alive', ID.alive, 0);
    b.blocks[ifHit].inputs.SUBSTACK = [2, die];
    {
        var c = cmd('looks_say', die);
        shadowText(c, 'MESSAGE', 'Game over — you bit yourself.');
    }
    var bump = cmd('data_changevariableby', ifHit);
    b.blocks[ifHit].next = bump;
    b.blocks[bump].fields.VARIABLE = ['i', ID.i];
    shadowNum(bump, 'VALUE', 1);
    var arrow = function (key, y, ndx, ndz, blockDx, avoid) {
        var h = hat('event_whenkeypressed', 40, y, {
            fields: { KEY_OPTION: [key, null] }
        });
        var iff = cmd('control_if', h);
        delete b.blocks[iff].inputs.CONDITION;
        var notOp = reporter('operator_not', iff, 'CONDITION');
        var eq = reporter('operator_equals', notOp, 'OPERAND');
        varRep(eq, 'OPERAND1', blockDx, blockDx === 'dx' ? ID.dx : ID.dz);
        shadowText(eq, 'OPERAND2', String(avoid));
        var q = setVar(iff, 'ndx', ID.ndx, ndx);
        b.blocks[iff].inputs.SUBSTACK = [2, q];
        setVar(q, 'ndz', ID.ndz, ndz);
    };
    arrow('right arrow', 900, 40, 0, 'dx', -40);
    arrow('left arrow', 1080, -40, 0, 'dx', 40);
    arrow('up arrow', 1260, 0, -40, 'dz', 40);
    arrow('down arrow', 1440, 0, 40, 'dz', -40);
    arrow('d', 1620, 40, 0, 'dx', -40);
    arrow('a', 1800, -40, 0, 'dx', 40);
    arrow('w', 1980, 0, -40, 'dz', 40);
    arrow('s', 2160, 0, 40, 'dz', -40);
    var space = hat('event_whenkeypressed', 420, 900, {
        fields: { KEY_OPTION: ['space', null] }
    });
    var ifPause = cmd('control_if_else', space);
    {
        var eq = reporter('operator_equals', ifPause, 'CONDITION');
        varRep(eq, 'OPERAND1', 'paused', ID.paused);
        shadowText(eq, 'OPERAND2', '0');
    }
    var setP1 = b.put({
        opcode: 'data_setvariableto',
        parent: ifPause,
        fields: { VARIABLE: ['paused', ID.paused] }
    });
    shadowText(setP1, 'VALUE', '1');
    b.blocks[ifPause].inputs.SUBSTACK = [2, setP1];
    var setP0 = b.put({
        opcode: 'data_setvariableto',
        parent: ifPause,
        fields: { VARIABLE: ['paused', ID.paused] }
    });
    shadowText(setP0, 'VALUE', '0');
    b.blocks[ifPause].inputs.SUBSTACK2 = [2, setP0];
    b.blocks[ifPause].next = null;
    return b.blocks;
};
var foodBlocks = function () {
    var b = makeBlocks();
    var cmd = b.cmd, hat = b.hat, shadowNum = b.shadowNum, shadowMenu = b.shadowMenu, mesh = b.mesh, color = b.color, scale = b.scale, xyz = b.xyz, setNum = b.setNum;
    var p = hat('event_whenflagclicked', 40, 40);
    p = mesh(p, 'sphere');
    p = color(p, '#FFC107');
    p = setNum(p, 'threed_setEmissive', 'VALUE', 42);
    p = setNum(p, 'threed_setMetallic', 'VALUE', 35);
    p = setNum(p, 'threed_setRoughness', 'VALUE', 30);
    p = scale(p, 0.7);
    p = xyz(p, 80, 16, -80);
    var forever = cmd('control_forever', p);
    var spin = cmd('threed_turnAxis', forever);
    b.blocks[forever].inputs.SUBSTACK = [2, spin];
    b.blocks[forever].next = null;
    shadowMenu(spin, 'AXIS', 'threed_menu_axis', 'axis', 'y');
    shadowNum(spin, 'DEGREES', 8);
    var wait = cmd('control_wait', spin);
    shadowNum(wait, 'DURATION', 0.05);
    var recv = hat('event_whenbroadcastreceived', 40, 420, {
        fields: { BROADCAST_OPTION: ['place food', ID.placeFood] }
    });
    var pos = cmd('threed_setPosition', recv);
    var mulX = b.reporter('operator_multiply', pos, 'X');
    var rndX = b.reporter('operator_random', mulX, 'NUM1');
    shadowNum(rndX, 'FROM', -3);
    shadowNum(rndX, 'TO', 3);
    shadowNum(mulX, 'NUM2', 40);
    shadowNum(pos, 'Y', 16);
    var mulZ = b.reporter('operator_multiply', pos, 'Z');
    var rndZ = b.reporter('operator_random', mulZ, 'NUM1');
    shadowNum(rndZ, 'FROM', -3);
    shadowNum(rndZ, 'TO', 3);
    shadowNum(mulZ, 'NUM2', 40);
    return b.blocks;
};
var bodyBlocks = function () {
    var b = makeBlocks();
    var cmd = b.cmd, hat = b.hat, shadowNum = b.shadowNum, reporter = b.reporter, setVar = b.setVar, mesh = b.mesh, color = b.color, scale = b.scale, setNum = b.setNum;
    var p = hat('event_whenflagclicked', 40, 40);
    p = cmd('looks_hide', p);
    var cloneHat = hat('control_start_as_clone', 40, 200);
    var c = cmd('looks_show', cloneHat);
    c = mesh(c, 'sphere');
    c = color(c, '#43A047');
    c = setNum(c, 'threed_setRoughness', 'VALUE', 40);
    c = setNum(c, 'threed_setMetallic', 'VALUE', 4);
    c = scale(c, 0.88);
    c = setVar(c, 'index', ID.index, '0');
    {
        var textShadow = b.blocks[c].inputs.VALUE[1];
        var len = reporter('data_lengthoflist', c, 'VALUE', {
            fields: { LIST: ['body x', ID.bodyX] }
        });
        b.blocks[c].inputs.VALUE = [3, len, textShadow];
        b.blocks[textShadow].parent = c;
        b.blocks[len].parent = c;
    }
    var forever = cmd('control_forever', c);
    var pos = cmd('threed_setPosition', forever);
    b.blocks[forever].inputs.SUBSTACK = [2, pos];
    b.blocks[forever].next = null;
    b.blocks[pos].parent = forever;
    var itemX = reporter('data_itemoflist', pos, 'X', { fields: { LIST: ['body x', ID.bodyX] } });
    reporter('data_variable', itemX, 'INDEX', { fields: { VARIABLE: ['index', ID.index] } });
    shadowNum(pos, 'Y', 16);
    var itemZ = reporter('data_itemoflist', pos, 'Z', { fields: { LIST: ['body z', ID.bodyZ] } });
    reporter('data_variable', itemZ, 'INDEX', { fields: { VARIABLE: ['index', ID.index] } });
    var wait = cmd('control_wait', pos);
    shadowNum(wait, 'DURATION', 0.05);
    return b.blocks;
};
var propBlocks = function (shape, hex, sx, sy, sz, x, y, z) {
    var b = makeBlocks();
    var hat = b.hat, mesh = b.mesh, color = b.color, scaleXYZ = b.scaleXYZ, xyz = b.xyz, setNum = b.setNum;
    var p = hat('event_whenflagclicked', 40, 40);
    p = mesh(p, shape);
    p = color(p, hex);
    p = setNum(p, 'threed_setRoughness', 'VALUE', 55);
    p = scaleXYZ(p, sx, sy, sz);
    xyz(p, x, y, z);
    return b.blocks;
};
var costumePair = function (translator) { return ([
    {
        assetId: 'bcf454acf82e4504149f7ffe07081dbc',
        name: translator(messages.costume, { index: 1 }),
        bitmapResolution: 1,
        md5ext: 'bcf454acf82e4504149f7ffe07081dbc.svg',
        dataFormat: 'svg',
        rotationCenterX: 48,
        rotationCenterY: 50
    },
    {
        assetId: '0fb9be3e8397c983338cb71dc84d0b25',
        name: translator(messages.costume, { index: 2 }),
        bitmapResolution: 1,
        md5ext: '0fb9be3e8397c983338cb71dc84d0b25.svg',
        dataFormat: 'svg',
        rotationCenterX: 46,
        rotationCenterY: 53
    }
]); };
var meowSound = function (translator) { return ({
    assetId: '83c36d806dc92327b9e7049a565c6bff',
    name: translator(messages.meow),
    dataFormat: 'wav',
    format: '',
    rate: 22050,
    sampleCount: 18688,
    md5ext: '83c36d806dc92327b9e7049a565c6bff.wav'
}); };
var sprite = function (name, layer, blocks, extra) { return Object.assign({
    isStage: false,
    name: name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: blocks,
    comments: {},
    currentCostume: 0,
    volume: 100,
    visible: true,
    x: extra.x || 0,
    y: extra.y || 0,
    z: extra.z || 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    layerOrder: layer
}, extra); };
var projectData = function (translateFunction) {
    var _a, _b, _c, _d, _e;
    var translator = translateFunction || defaultTranslator;
    var costumes = costumePair(translator);
    var meow = meowSound(translator);
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: (_a = {},
                    _a[ID.score] = ['score', 0],
                    _a[ID.dx] = ['dx', 40],
                    _a[ID.dz] = ['dz', 0],
                    _a[ID.ndx] = ['ndx', 40],
                    _a[ID.ndz] = ['ndz', 0],
                    _a[ID.alive] = ['alive', 1],
                    _a[ID.paused] = ['paused', 0],
                    _a),
                lists: (_b = {},
                    _b[ID.bodyX] = ['body x', []],
                    _b[ID.bodyZ] = ['body z', []],
                    _b),
                broadcasts: (_c = {},
                    _c[ID.placeFood] = 'place food',
                    _c),
                blocks: {},
                comments: {
                    about: {
                        blockId: null,
                        x: 24,
                        y: 24,
                        width: 260,
                        height: 210,
                        minimized: false,
                        text: '3D Snake — Top Down\n\nGreen flag to start.\nWASD or arrows to turn.\nSpace pauses.\nRight-drag to tilt, scroll to zoom.\nEat the gold orb.\nStay inside the walls.\nDon\'t bite your own tail.'
                    }
                },
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        name: translator(messages.backdrop, { index: 1 }),
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    {
                        assetId: '83a9787d4cb6f3b7632b4ddfebf74367',
                        name: translator(messages.pop),
                        dataFormat: 'wav',
                        format: '',
                        rate: 11025,
                        sampleCount: 258,
                        md5ext: '83a9787d4cb6f3b7632b4ddfebf74367.wav'
                    }
                ],
                volume: 100,
                layerOrder: 0,
                scene3d: {
                    enabled: true,
                    rayTracing: false,
                    showGround: true,
                    showSky: true,
                    skyTop: [0.353, 0.659, 0.91],
                    skyBottom: [0.784, 0.902, 0.659],
                    groundColor: [0.18, 0.478, 0.235],
                    camera: {
                        position: [0, 420, 16],
                        target: [0, 0, 0],
                        up: [0, 1, 0],
                        fov: 42,
                        near: 1,
                        far: 4000
                    },
                    ambient: [0.38, 0.38, 0.38],
                    directional: {
                        direction: [0.2, -1, 0.15],
                        color: [1, 0.953, 0.784],
                        intensity: 2
                    },
                    pointLights: [],
                    fog: { enabled: false, density: 0, color: [0.58, 0.70, 0.90] },
                    skyFx: {
                        sun: true,
                        clouds: true,
                        godRays: false,
                        stars: false,
                        cloudCoverage: 0.18,
                        cloudDensity: 0.7,
                        wind: 0.16,
                        godRayIntensity: 0
                    }
                }
            },
            sprite('Head', 1, headBlocks(), {
                variables: (_d = {}, _d[ID.i] = ['i', 0], _d),
                costumes: costumes,
                sounds: [meow],
                x: 0,
                y: 16,
                z: 0,
                mesh: 'sphere',
                material3d: { albedo: [0.106, 0.561, 0.227], metallic: 0.08, roughness: 0.28, emissive: 0, opacity: 1 }
            }),
            sprite('Food', 2, foodBlocks(), {
                costumes: costumes,
                sounds: [meow],
                x: 80,
                y: 16,
                z: -80,
                mesh: 'sphere',
                material3d: { albedo: [1, 0.757, 0.027], metallic: 0.35, roughness: 0.3, emissive: 0.42, opacity: 1 }
            }),
            sprite('Body', 3, bodyBlocks(), {
                variables: (_e = {}, _e[ID.index] = ['index', 0], _e),
                costumes: costumes,
                sounds: [meow],
                visible: false,
                x: 0,
                y: 16,
                z: 0,
                mesh: 'sphere',
                material3d: { albedo: [0.263, 0.627, 0.278], metallic: 0.04, roughness: 0.4, emissive: 0, opacity: 1 }
            }),
            sprite('WallN', 4, propBlocks('cube', '#5D4037', 8.2, 0.55, 0.45, 0, 14, -190), {
                costumes: costumes,
                sounds: [meow], x: 0, y: 14, z: -190,
                mesh: 'cube',
                material3d: { albedo: [0.365, 0.251, 0.216], metallic: 0.04, roughness: 0.78, emissive: 0, opacity: 1 }
            }),
            sprite('WallS', 5, propBlocks('cube', '#5D4037', 8.2, 0.55, 0.45, 0, 14, 190), {
                costumes: costumes,
                sounds: [meow], x: 0, y: 14, z: 190,
                mesh: 'cube',
                material3d: { albedo: [0.365, 0.251, 0.216], metallic: 0.04, roughness: 0.78, emissive: 0, opacity: 1 }
            }),
            sprite('WallE', 6, propBlocks('cube', '#4E342E', 0.45, 0.55, 8.2, 190, 14, 0), {
                costumes: costumes,
                sounds: [meow], x: 190, y: 14, z: 0,
                mesh: 'cube',
                material3d: { albedo: [0.306, 0.204, 0.18], metallic: 0.04, roughness: 0.8, emissive: 0, opacity: 1 }
            }),
            sprite('WallW', 7, propBlocks('cube', '#4E342E', 0.45, 0.55, 8.2, -190, 14, 0), {
                costumes: costumes,
                sounds: [meow], x: -190, y: 14, z: 0,
                mesh: 'cube',
                material3d: { albedo: [0.306, 0.204, 0.18], metallic: 0.04, roughness: 0.8, emissive: 0, opacity: 1 }
            })
        ],
        monitors: [
            {
                id: ID.score,
                mode: 'default',
                opcode: 'data_variable',
                params: { VARIABLE: 'score' },
                spriteName: null,
                value: 0,
                width: 0,
                height: 0,
                x: 5,
                y: 5,
                visible: true,
                sliderMin: 0,
                sliderMax: 100,
                isDiscrete: true
            }
        ],
        extensions: ['threed'],
        meta: {
            semver: '3.0.0',
            vm: '0.1.0',
            agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36'
        }
    });
};
exports.default = projectData;
