
import axios from 'axios';

async function main() {
    try {
        console.log("Searching Gamma API for 'Up or Down'...");

        const url = 'https://gamma-api.polymarket.com/events';
        const params = {
            limit: 5,
            active: true,
            closed: false,
            q: 'Up or Down',
            order: 'startDate',
            ascending: true // Start with soonest?
        };

        const response = await axios.get(url, { params });
        const events = response.data;

        if (events.length > 0) {
            const event = events[0];
            console.log(`\nEvent: ${event.title}`);

            event.markets.forEach((m: any) => {
                console.log(`\n[Market ID: ${m.id}]`);
                console.log(`Question: ${m.question}`);
                console.log(`Description: ${m.description}`);
                console.log(`Outcomes: ${JSON.stringify(m.outcomes)}`);
                console.log(`Outcome Prices: ${JSON.stringify(m.outcomePrices)}`);
                console.log(`CLOB Token ID: ${m.clobTokenIds ? m.clobTokenIds[0] : 'N/A'}`);
            });
        } else {
            console.log("No markets found.");
        }

    } catch (err) {
        console.error(err);
    }
}

main();
