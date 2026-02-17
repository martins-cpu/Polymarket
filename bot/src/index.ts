import dotenv from 'dotenv';
import { BinanceClient } from './clients/BinanceClient.js';
import { CoinbaseClient } from './clients/CoinbaseClient.js';
import { PolymarketClient } from './clients/PolymarketClient.js';
import { PriceAggregator } from './strategy/PriceAggregator.js';
import { LagStrategy } from './strategy/LagStrategy.js';
import { SimulationEngine } from './engine/SimulationEngine.js';
import { BotServer } from './server.js';

dotenv.config();

import * as fs from 'fs';

function log(msg: string) {
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}\n`;
    console.log(msg); // Keep console
    try {
        fs.appendFileSync('debug.log', line);
    } catch (e) {
        // ignore
    }
}

async function main() {
    log('Starting Polymarket Bot (Debug Mode)...');

    try {
        // Initialize Clients
        const binance = new BinanceClient();
        const coinbase = new CoinbaseClient();
        const polymarket = new PolymarketClient();

        // Initialize Strategy & Engine
        const aggregator = new PriceAggregator();
        const strategy = new LagStrategy();

        const liveTrading = process.env.LIVE_TRADING === 'true';
        const mode = liveTrading ? 'LIVE_TRADING' : 'SIMULATION';

        log(`Mode: ${mode}`);

        const simEngine = new SimulationEngine(mode);
        const server = new BotServer(simEngine);

        log('[INDEX] Initialized Server. Starting...');
        server.start();
        log('[INDEX] Server start() called.');

        // Wire up events
        // ... (keep existing wiring)

        // Feed Spot Prices to Aggregator
        binance.on('price', (p) => aggregator.handlePriceUpdate(p));
        coinbase.on('price', (p) => aggregator.handlePriceUpdate(p));

        // Feed Aggregated Spot to Strategy
        aggregator.on('price', (p) => {
            // Log locally to debug file to prove life
            if (Math.random() < 0.05) { // 5% sample to avoid spam
                log(`[SPOT] ${p.asset}: $${p.price.toFixed(2)}`);
            }
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

        log(`Bot initialized and running in ${mode} mode.`);
    } catch (err: any) {
        log(`CRASH: ${err.message}\n${err.stack}`);
    }
}

main().catch(err => log(`FATAL: ${err}`));
