
import axios from 'axios';

async function main() {
    // Known AMM Token ID from previous debug (Bitcoin Up or Down, Orderbook: False)
    // From Step 327 logs: 'Found LIVE Market: Bitcoin Up or Down...'
    // I need to fetch one fresh ID to be sure.

    console.log("Fetching a live AMM token...");
    try {
        const initResp = await axios.get('https://gamma-api.polymarket.com/events', {
            params: { limit: 1, active: true, tag_slug: 'up-or-down', order: 'startDate', ascending: false }
        });
        const market = initResp.data[0].markets[0];
        // Parse token
        let tids = market.clobTokenIds;
        if (typeof tids === 'string') tids = JSON.parse(tids);
        const tokenId = tids[0];

        console.log(`Checking Token: ${tokenId} (${market.question})`);
        console.log(`Orderbook Enabled: ${market.enableOrderBook}`);

        // 1. Try CLOB Ticker/Price
        // https://clob.polymarket.com/price?token_id=...
        // or /midpoint

        console.log("\n--- Checking CLOB /price ---");
        try {
            const p = await axios.get(`https://clob.polymarket.com/price`, { params: { token_id: tokenId, side: 'buy' } });
            console.log("CLOB Price detected:", p.data);
        } catch (e: any) {
            console.log("CLOB Price Error:", e.response?.status, e.response?.data);
        }

        console.log("\n--- Checking CLOB /book ---");
        try {
            const b = await axios.get(`https://clob.polymarket.com/book`, { params: { token_id: tokenId } });
            console.log("CLOB Book detected:", b.data);
        } catch (e: any) {
            console.log("CLOB Book Error:", e.response?.status, e.response?.data);
        }

    } catch (err) {
        console.error(err);
    }
}

main();
