import axios from 'axios';

async function findEsportsMarkets() {
    const gammaUrl = 'https://gamma-api.polymarket.com/events';
    const params = {
        limit: 50,
        active: 'true',
        closed: 'false',
        tag_slug: 'esports'
    };

    try {
        console.log('Fetching markets to search for Esports with Tag: esports...');

        const response = await axios.get(gammaUrl, { params });
        const events = response.data;

        if (events.length > 0) {
            console.log(`Found ${events.length} markets with tag 'esports'!`);
            for (const event of events) {
                console.log(`Event: ${event.title} (ID: ${event.id})`);
                for (const market of event.markets) {
                    const hasOrderBook = (market.enableOrderBook || market.enable_order_book);
                    console.log(`  - [${market.id}] ${market.question}`);
                    console.log(`    CLOB Enabled: ${hasOrderBook}`);
                }
            }
        } else {
            console.log("No markets found with tag 'esports'.");
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

findEsportsMarkets();
