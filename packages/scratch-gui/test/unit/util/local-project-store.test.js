import {
    putSharedProject,
    getSharedProject,
    playerUrlForId,
    toBase64,
    fromBase64
} from '../../../src/lib/local-project-store';

describe('local-project-store', () => {
    test('put and get a shared project from memory', async () => {
        const buffer = new Uint8Array([1, 2, 3, 9]).buffer;
        await putSharedProject('99', {title: 'Snake', buffer});
        const record = await getSharedProject('99');
        expect(record.title).toBe('Snake');
        expect(new Uint8Array(record.buffer)[2]).toBe(3);
    });

    test('base64 round-trip', () => {
        const original = new Uint8Array([10, 20, 30, 40]);
        expect(fromBase64(toBase64(original))).toEqual(original);
    });

    test('playerUrlForId builds a player hash link', () => {
        expect(playerUrlForId('123')).toMatch(/player\.html#123$/);
    });
});
