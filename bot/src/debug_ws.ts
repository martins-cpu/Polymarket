
import axios from 'axios';

const gammaUrl = 'https://gamma-api.polymarket.com/events';

async function main() {
    console.log("Checking enable_order_book for LIVE markets...");
    try {
        const resp = await axios.get(gammaUrl, {
            params: {
                limit: 10,
                active: true,
                closed: false,
                tag_slug: 'up-or-down',
                order: 'startDate',
                ascending: false
            }
        });
        const events = resp.data;
        const now = Date.now();

        for (const e of events) {
            for (const m of e.markets) {
                const end = new Date(m.endDateIso || m.end_date_iso || e.endDate).getTime();
                if (end < now) continue;

                console.log(`\nMarket: ${m.question}`);
                console.log(`Order Book Enabled: ${m.enable_order_book || m.enableOrderBook}`); // Check both cases
                console.log(`AMM Enabled: ${m.amm_enabled || m.ammEnabled}`); // Check AMM
                console.log(`Active: ${m.active}, Closed: ${m.closed}`);
            }
        }

    } catch (err) {
        console.error(err);
    }
}

main();
