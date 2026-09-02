import {
    encryptProject,
    decryptProject,
    isEncryptedProject,
    isPasswordProtected,
    uint8ArrayToBase64,
    base64ToUint8Array,
    generateStandaloneHtml
} from '../../../src/lib/project-encryption';

describe('Project Encryption & Packaging', () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    test('uint8ArrayToBase64 and base64ToUint8Array round-trip', () => {
        const b64 = uint8ArrayToBase64(testData);
        expect(typeof b64).toBe('string');
        const restored = base64ToUint8Array(b64);
        expect(restored).toEqual(testData);
    });

    test('encrypt and decrypt project with default key (no password)', async () => {
        const encrypted = await encryptProject(testData);
        expect(isEncryptedProject(encrypted)).toBe(true);
        expect(isPasswordProtected(encrypted)).toBe(false);

        const decryptedBuffer = await decryptProject(encrypted);
        const decryptedBytes = new Uint8Array(decryptedBuffer);
        expect(decryptedBytes).toEqual(testData);
    });

    test('encrypt and decrypt project with custom password', async () => {
        const password = 'my-secret-password-123';
        const encrypted = await encryptProject(testData, password);
        expect(isEncryptedProject(encrypted)).toBe(true);
        expect(isPasswordProtected(encrypted)).toBe(true);

        // Decrypt with correct password
        const decryptedBuffer = await decryptProject(encrypted, password);
        const decryptedBytes = new Uint8Array(decryptedBuffer);
        expect(decryptedBytes).toEqual(testData);

        // Decrypt with missing password should fail with PASSWORD_REQUIRED
        await expect(decryptProject(encrypted, '')).rejects.toThrow();

        // Decrypt with wrong password should fail
        await expect(decryptProject(encrypted, 'wrong-password')).rejects.toThrow();
    });

    test('generateStandaloneHtml produces valid standalone HTML package', () => {
        const b64 = uint8ArrayToBase64(testData);
        const html = generateStandaloneHtml('My Cool Game', b64, false);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('My Cool Game');
        expect(html).toContain('btn-green-flag');
        expect(html).toContain('btn-stop');
        expect(html).toContain('btn-fullscreen');
        expect(html).toContain('stage-canvas');
        expect(html).toContain(b64);
    });
});
