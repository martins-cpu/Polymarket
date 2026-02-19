import axios from 'axios';

async function main() {
    console.log("Checking connectivity...");

    // Check Gamma
    try {
        console.log("Pinging Gamma API (Events)...");
        await axios.get('https://gamma-api.polymarket.com/events?limit=1');
        console.log("Gamma API: OK");
    } catch (e: any) {
        console.log("Gamma API Failed:", e.message);
    }

    // Check CLOB
    try {
        console.log("Pinging CLOB API (Time)...");
        const t = await axios.get('https://clob.polymarket.com/time');
        console.log("CLOB API: OK", t.data);
    } catch (e: any) {
        console.log("CLOB API Failed:", e.message);
    }
}

main();
