import * as crypto from 'crypto';

if (!global.crypto) {
    (global as any).crypto = crypto.webcrypto;
}

import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function main() {
    console.log('Testing CLOB Proxy Credentials');

    const pk = process.env.PRIVATE_KEY;
    const funderAddress = process.env.FUNDER_ADDRESS;
    const signatureType = process.env.SIGNATURE_TYPE ? parseInt(process.env.SIGNATURE_TYPE) : undefined;

    if (!pk || !funderAddress) {
        console.error('Missing PK or FUNDER_ADDRESS');
        return;
    }

    const wallet = new ethers.Wallet(pk);
    console.log(`EOA Address: ${wallet.address}`);
    console.log(`Funder Address: ${funderAddress}`);
    console.log(`Signature Type: ${signatureType}`);

    const client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        wallet,
        undefined,
        signatureType,
        funderAddress
    );

    try {
        console.log('Deriving API Key...');
        const creds = await client.deriveApiKey();
        console.log('API Key Derived:', creds.key !== undefined);

        console.log('Re-initializing client with derived credentials...');
        const authenticatedClient = new ClobClient(
            'https://clob.polymarket.com',
            137,
            wallet,
            creds,
            signatureType,
            funderAddress
        );

        console.log('Fetching Open Orders...');
        const orders = await authenticatedClient.getOpenOrders();
        console.log('Open Orders:', orders);
    } catch (e: any) {
        console.error('Proxy Error:', e?.message || e);
        if (e?.response) {
            console.error('Response body:', e.response.data);
        }
    }
}

main();
