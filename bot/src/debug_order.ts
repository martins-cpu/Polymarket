import * as crypto from 'crypto';

if (!global.crypto) {
    (global as any).crypto = crypto.webcrypto;
}

import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const pk = process.env.PRIVATE_KEY;
    const funderAddress = process.env.FUNDER_ADDRESS;
    const signatureType = process.env.SIGNATURE_TYPE ? parseInt(process.env.SIGNATURE_TYPE) : undefined;

    if (!pk || !funderAddress) return;

    const wallet = new ethers.Wallet(pk);
    const client = new ClobClient('https://clob.polymarket.com', 137, wallet, undefined, signatureType, funderAddress);
    const creds = await client.deriveApiKey();
    const authenticatedClient = new ClobClient('https://clob.polymarket.com', 137, wallet, creds, signatureType, funderAddress);

    try {
        console.log('Attempting to create a local order signature...');
        const orderArgs: any = {
            tokenID: '87227787875491260181488543391406726692138176448000553635628229461629207572347', // ETH Yes
            price: 0.5,
            side: 'BUY',
            size: 10,
            nonce: Date.now(),
        };
        const signedOrder = await authenticatedClient.createOrder(orderArgs);
        console.log('Order created successfully!');
    } catch (e: any) {
        console.error('Order Signature Error:', e?.message || e);
        console.error(e.stack);
    }
}

main();
