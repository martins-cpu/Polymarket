import express from 'express';
import cors from 'cors';
import { SimulationEngine } from './engine/SimulationEngine.js';
import { AggregatedPrice } from './strategy/PriceAggregator.js';
import { MarketOpportunity, PolymarketUpdate } from './types/index.js';

export class BotServer {
    private app;
    private port = 3001;

    private latestSpot: Map<string, number> = new Map();
    private latestPoly: Map<string, PolymarketUpdate> = new Map();
    private recentOpps: MarketOpportunity[] = [];

    constructor(private simEngine: SimulationEngine) {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json());

        this.setupRoutes();
    }

    private setupRoutes() {
        this.app.get('/api/stats', (req, res) => {
            const stats = this.simEngine.getStats();
            // console.log('Stats requested:', JSON.stringify(stats)); 
            res.json(stats);
        });

        this.app.get('/api/prices', (req, res) => {
            const prices: any = {};
            this.latestSpot.forEach((v, k) => prices[k] = { spot: v });
            // Add poly data if available
            this.latestPoly.forEach((v, k) => {
                // k might be marketId or asset. We store by asset if possible or map.
                // For simplicity, just return what we have.
            });

            // Return simple combined view
            const combined = ['BTC', 'ETH', 'SOL'].map(asset => ({
                asset,
                spot: this.latestSpot.get(asset) || 0,
                polyYes: this.latestPoly.get(asset)?.yesPrice || 0,
                strike: this.latestPoly.get(asset)?.strikePrice || 0
            }));

            res.json(combined);
        });

        this.app.get('/api/opportunities', (req, res) => {
            res.json(this.recentOpps.slice(-10)); // Last 10
        });
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`Bot Server running on http://localhost:${this.port}`);
        });
    }

    public updateSpotPrice(p: AggregatedPrice) {
        this.latestSpot.set(p.asset, p.price);
    }

    public updatePolyPrice(p: PolymarketUpdate) {
        // We might have multiple markets per asset. 
        // For visualization, we keep the latest update for that asset for now.
        this.latestPoly.set(p.asset, p);
    }

    public addOpportunity(opp: MarketOpportunity) {
        this.recentOpps.push(opp);
        if (this.recentOpps.length > 50) this.recentOpps.shift();
    }
}
