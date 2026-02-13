
import axios from 'axios';

const gammaUrl = 'https://gamma-api.polymarket.com/events';

async function main() {
    console.log("Starting Debug Large Fetch (Limit 500)...");
    try {
        // Try limit 500 (max usually)
        const params = {
            limit: 500,
            active: 'true',
            closed: 'false',
            tag_slug: 'up-or-down',
            order: 'startDate',
            ascending: false, // Newest first
            offset: 500 // Try to skip the first 500 (Jan 16)
        };

        console.log("Requesting Gamma API...");
        const response = await axios.get(gammaUrl, { params });
        const events = response.data;
        console.log(`Received ${events.length} events.`);

        let foundOrderBook = 0;
        let todayMarkets = 0;
        const nowStr = new Date().toISOString().split('T')[0]; // "2026-01-15" (User Time)
        // User is Jan 15.
        // Let's just string match "January 15" in title

        for (const event of events) {
            if (event.title.includes("January 15")) {
                todayMarkets++;
                for (const market of event.markets) {
                    if (market.enableOrderBook || market.enable_order_book) {
                        foundOrderBook++;
                        console.log(`FOUND TARGET: ${market.question} (OrderBook: True)`);
                    }
                }
            }
        }

        console.log(`\nSummary:`);
        console.log(`Total Events Fetched: ${events.length}`);
        console.log(`Events for "January 15": ${todayMarkets}`);
        console.log(`OrderBook Markets for Jan 15: ${foundOrderBook}`);

    } catch (err: any) {
        console.error("Error:", err.message || err);
    }
}

main();
