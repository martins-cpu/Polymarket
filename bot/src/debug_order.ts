
import { ClobClient } from './clients/ClobClient.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    console.log("Starting Order Debug...");

    const client = new ClobClient();

    // Allow init to finish
    await new Promise(r => setTimeout(r, 2000));

    // Known Token from previous debug
    const tokenId = '31912206699089681168045007855120858308880251958066452232423703807492346450415';

    console.log("Attempting to place test order...");
    console.log("Token:", tokenId);

    try {
        // Buy NO at 0.01 (Should sit in book or cancel immediately if FOK)
        // Using GTC to be safe for testing placement
        const order = await client.placeOrder(tokenId, 'BUY', 0.01, 5);
        console.log("SUCCESS:", order);
    } catch (e: any) {
        console.error("FAILURE:");
        console.error(e);
        if (e.stack) console.error(e.stack);
    }
}

main();
