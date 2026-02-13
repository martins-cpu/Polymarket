
import axios from 'axios';

const gammaUrl = 'https://gamma-api.polymarket.com/events';

async function main() {
    console.log("Starting Debug AMM Poll (Broad Sweep)...");
    try {
        const params = {
            limit: 100,
            closed: 'false', // Only open markets
            tag_slug: 'up-or-down',
            order: 'startDate',
            ascending: false // Newest first
        };

        console.log("Requesting Gamma API...");
        const response = await axios.get(gammaUrl, { params });
        const events = response.data;
        console.log(`Received ${events.length} events.`);

        let foundPrice = false;

        for (const event of events) {
            for (const market of event.markets) {
                const hasOrderBook = market.enableOrderBook || market.enable_order_book;

                // We are specifically looking for AMM markets with prices
                if (hasOrderBook) continue;

                // Log simplified details
                // console.log(`Market: ${market.question} | Ends: ${market.endDateIso}`);

                if (market.outcomePrices) {
                    console.log(`FOUND PRICES! Market: ${market.question}`);
                    console.log(`Prices: ${JSON.stringify(market.outcomePrices)}`);
                    foundPrice = true;
                }
            }
        }

        if (!foundPrice) {
            console.log("NO AMM MARKET WITH PRICES FOUND IN LAST 100 EVENTS.");
        }

    } catch (err) {
        console.error("AMM Polling Error:", err);
    }
}

main();
