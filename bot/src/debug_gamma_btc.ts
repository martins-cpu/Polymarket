
import axios from 'axios';

async function main() {
    try {
        const slug = 'bitcoin-up-or-down-january-10-7am-et';
        console.log(`Fetching specific event via slug: ${slug}...`);

        // Gamma API slug lookup often works via query param or ID.
        // Let's try /events with slug param
        const url = 'https://gamma-api.polymarket.com/events';
        const params = {
            slug: slug
        };

        const response = await axios.get(url, { params });
        const events = response.data;

        if (events.length > 0) {
            const e = events[0];
            console.log(`\nFOUND EVENT: ${e.title}`);
            console.log(`ID: ${e.id}`);
            console.log(`StartDate: ${e.startDate}`);
            console.log(`Tags: ${JSON.stringify(e.tags)}`);

            console.log(`\nMarkets:`);
            e.markets.forEach((m: any) => {
                console.log(`- [${m.id}] ${m.question}`);
                console.log(`  Desc: ${m.description}`);
                console.log(`  ClobTokenIds: ${JSON.stringify(m.clobTokenIds)}`);
            });

        } else {
            console.log("Slug lookup failed to return event.");
            // Try direct ID lookup if we knew it, but we don't.
            // Try searching by "January 10" to see if it pops up active=false
            console.log("Attempting fallback search for 'January 10'...");
            const fallbackRes = await axios.get(url, { params: { q: 'January 10', limit: 10 } });
            fallbackRes.data.forEach((ev: any) => console.log(`  Fallback: ${ev.title} (${ev.slug})`));
        }

    } catch (err) {
        console.error(err);
    }
}

main();
