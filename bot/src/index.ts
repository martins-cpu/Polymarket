import dotenv from 'dotenv';
import { BinanceClient } from './clients/BinanceClient';
import { CoinbaseClient } from './clients/CoinbaseClient';
import { PolymarketClient } from './clients/PolymarketClient';
import { PriceAggregator } from './strategy/PriceAggregator';
import { LagStrategy } from './strategy/LagStrategy';
import { SimulationEngine } from './engine/SimulationEngine';
import { BotServer } from './server';

dotenv.config();

async function main() {
    console.log('Starting Polymarket Bot...');

    // Initialize Clients
    const binance = new BinanceClient();
    const coinbase = new CoinbaseClient();
    const polymarket = new PolymarketClient();

    // Initialize Strategy & Engine
    const aggregator = new PriceAggregator();
    const strategy = new LagStrategy();

    const liveTrading = process.env.LIVE_TRADING === 'true';
    const mode = liveTrading ? 'LIVE_TRADING' : 'SIMULATION'; // or MONITOR_ONLY
    // Default to SIMULATION for safety unless strictly enabled.

    const simEngine = new SimulationEngine(mode);
    const server = new BotServer(simEngine);

    server.start();

    // Wire up events

    // Feed Spot Prices to Aggregator
    binance.on('price', (p) => aggregator.handlePriceUpdate(p));
    coinbase.on('price', (p) => aggregator.handlePriceUpdate(p));

    // Feed Aggregated Spot to Strategy
    aggregator.on('price', (p) => {
        // Optional: Log aggregated price occasionally
        // console.log(`[SPOT] ${p.asset}: $${p.price.toFixed(2)}`);
        strategy.handleSpotPrice(p);
        server.updateSpotPrice(p);
    });

    // Feed Polymarket Data to Strategy
    polymarket.on('polymarket_price', (p) => {
        strategy.handlePolymarketUpdate(p);
        server.updatePolyPrice(p);
        simEngine.handlePriceUpdate(p);
    });

    // Feed Opportunities to Simulation Engine
    strategy.on('opportunity', (opp) => {
        simEngine.handleOpportunity(opp);
        server.addOpportunity(opp);
    });

    console.log('Bot initialized and running in simulation mode.');
}

main().catch(err => console.error(err));
