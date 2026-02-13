
import axios from 'axios';

async function main() {
    try {
        console.log("Fetching markets...");
        // We'll fetch a few pages to ensure we find them
        let cursor: string | undefined = undefined;
        let found = false;

        for (let i = 0; i < 10; i++) {
            const params: any = { limit: 100 };
            if (cursor) params.next_cursor = cursor;

            const response = await axios.get('https://clob.polymarket.com/markets', { params });
            const markets = Array.isArray(response.data) ? response.data : response.data.data || [];

            console.log(`Page ${i + 1}: Fetched ${markets.length} markets.`);

            cursor = response.data.next_cursor;

            // Search for "Up or Down"
            const specific = markets.filter((m: any) =>
                m.question.includes('Up or Down') ||
                m.question.includes('Bitcoin')
            );

            if (specific.length > 0) {
                console.log(`FOUND ${specific.length} potential markets on page ${i + 1}.`);
                console.log("\n--- JSON DUMP OF FIRST MATCH ---");
                console.log(JSON.stringify(specific[0], null, 2));

                // Check description of first match
                console.log("\n--- Description ---");
                console.log(specific[0].description);
                found = true;
                break;
            }

            if (!cursor) break;
        }

        if (!found) {
            console.log("Could not find any 'Up or Down' or 'Bitcoin' markets in first 10 pages.");
        }

    } catch (err) {
        console.error(err);
    }
}

main();
