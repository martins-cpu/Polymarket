import * as crypto from 'crypto';

if (!globalThis.crypto) {
    (globalThis as any).crypto = crypto.webcrypto;
}
if (globalThis.crypto && !(globalThis.crypto as any).subtle && crypto.webcrypto) {
    (globalThis.crypto as any).subtle = crypto.webcrypto.subtle;
}

async function test() {
    console.log('Testing importKey...');
    try {
        const keyData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        const result = await globalThis.crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        console.log('Result:', result);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

test();
