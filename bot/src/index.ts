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

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function fileLog(prefix: string, args: any[]) {
    const time = new Date().toISOString();
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const line = `[${time}] ${prefix} ${msg}\n`;
    try {
        if (!fs.existsSync('logs')) fs.mkdirSync('logs');
        fs.appendFileSync('logs/debug.log', line);
    } catch (e) {
        // ignore
    }
}

console.log = (...args) => {
    originalLog(...args);
    fileLog('', args);
};

console.warn = (...args) => {
    originalWarn(...args);
    fileLog('[WARN]', args);
};

console.error = (...args) => {
    originalError(...args);
    fileLog('[ERROR]', args);
};

function log(msg: string) {
    console.log(msg); // Now uses our patched version
}

async function main() {
    log('Starting Polymarket Bot (Debug Mode)...');

    try {
        // Initialize Clients
        // const binance = new BinanceClient(); // Disabled due to Geo-block (451 error)
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
        // binance.on('price', (p) => aggregator.handlePriceUpdate(p));
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
            if (Math.random() < 0.05) { // 5% sample
                console.log(`[POLY] ${p.asset}: ${p.yesPrice.toFixed(2)}`);
            }
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
