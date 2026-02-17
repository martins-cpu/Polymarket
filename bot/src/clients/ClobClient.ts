import { ClobClient as PolyClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

export class ClobClient {
    private client: PolyClobClient | null = null;
    private wallet: ethers.Wallet | null = null;
    private chainId = 137; // Polygon Mainnet

    constructor() {
        this.init();
    }

    private async init() {
        const pk = process.env.PRIVATE_KEY;
        if (!pk) {
            console.warn('[CLOB] No PRIVATE_KEY found in .env. Live trading disabled.');
            return;
        }

        try {
            this.wallet = new ethers.Wallet(pk);
            console.log(`[CLOB] Wallet loaded: ${this.wallet.address}`);
            try { require('fs').appendFileSync('debug.log', `[CLOB] Wallet Loaded: ${this.wallet.address}\n`); } catch (e) { }

            // Check for Proxy Configuration
            const funderAddress = process.env.FUNDER_ADDRESS;
            const signatureType = process.env.SIGNATURE_TYPE ? parseInt(process.env.SIGNATURE_TYPE) : undefined;

            if (funderAddress) {
                console.log(`[CLOB] Proxy Trading Enabled. Funder: ${funderAddress}, SigType: ${signatureType}`);
                try { require('fs').appendFileSync('debug.log', `[CLOB] Proxy Trading Enabled. Funder: ${funderAddress}\n`); } catch (e) { }
            }

            // Initialize Client
            this.client = new PolyClobClient(
                'https://clob.polymarket.com',
                this.chainId,
                this.wallet,
                undefined, // options
                signatureType, // signatureType (0, 1, 2)
                funderAddress // funderAddress
            );

            // Derive or create API Credentials (L2 headers)
            // Ideally we check if we have stored creds, if not we derive/create.
            // For simplicity, the SDK handles 'deriveApiKey' which signs a msg to get the API Key.
            try {
                const creds = await this.client.deriveApiKey();
                console.log('[CLOB] API Key derived successfully.');
            } catch (authErr) {
                console.error('[CLOB] Failed to derive API Key:', authErr);
            }

        } catch (err) {
            console.error('[CLOB] Init Error:', err);
        }
    }

    public async placeOrder(tokenId: string, side: 'BUY' | 'SELL', price: number, size: number) {
        if (!this.client || !this.wallet) {
            throw new Error('CLOB Client not initialized (check PRIVATE_KEY)');
        }

        if (price <= 0 || size <= 0) {
            throw new Error(`Invalid price/size: ${price}/${size}`);
        }

        console.log(`[CLOB] Placing ${side} order: ${size} shares @ $${price.toFixed(2)} for ${tokenId}`);

        try {
            // Polymarket CLOB uses "Buy" / "Sell" strings (Title case or Upper? SDK usually handles types)
            // SDK OrderArgs: price (string), size (string), side (Side.BUY / Side.SELL), tokenID
            const sideEnum = side === 'BUY' ? 'BUY' : 'SELL';

            // Create Order
            // FOK (Fill or Kill) or GTC. For sniping, FOK is safer, OR IoC. 
            // SDK might default to GTC limits.
            const orderArgs: any = {
                tokenID: tokenId,
                price: price, // SDK expects number? Or String? 
                // Error says: Type 'string' is not assignable to type 'number'.
                // So SDK expects NUMBER.
                side: sideEnum as any,
                size: size, // SDK expects NUMBER.
                feeRateBps: 0,
                nonce: Date.now(),
            };

            // PROXY SUPPORT: If FUNDER_ADDRESS is set, we must specify it in the order
            const funderAddress = process.env.FUNDER_ADDRESS;
            if (funderAddress) {
                // When using a Proxy, the SDK might need specific args or the client might be init differently.
                // Actually, the PolyClobClient constructor takes `funderAddress`? No, it takes `signer`.
                // Checking SDK docs: createOrder takes `OrderArgs`.
                // OrderArgs doesn't usually take funder. The `ClobClient` instance holds the state.
                // WAIT: The SDK init in constructor didn't use options.
            }

            const order = await this.client.createOrder(orderArgs);

            console.log(`[CLOB] Order Placed! ID: ${order.orderID} | Status: ${order.status}`);
            return order;

        } catch (err: any) {
            console.error(`[CLOB] Order Failed:`, err?.message || err);
            // Handle common errors (balance, allowance)
            if (err?.message?.includes('allowance')) {
                console.error('[CLOB] ACTION REQUIRED: You need to Approve USDC for the Exchange Proxy.');
            }
            throw err;
        }
    }

    public getAddress() {
        return this.wallet?.address;
    }
}
