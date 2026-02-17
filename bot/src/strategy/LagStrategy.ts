import { EventEmitter } from 'events';
import axios from 'axios';
import { AggregatedPrice } from './PriceAggregator.js';
import { PolymarketUpdate, MarketOpportunity } from '../types/index.js';

export class LagStrategy extends EventEmitter {
    private lastSpotPrices: Map<string, number> = new Map(); // asset -> price
    private marketReferencePrices: Map<string, number> = new Map(); // marketId -> Open Price
    private lastFetchTime: Map<string, number> = new Map(); // marketId -> timestamp

    public handleSpotPrice(update: AggregatedPrice) {
        // Store latest spot price (Binance/Coinbase)
        this.lastSpotPrices.set(update.asset, update.price);
    }

    public async handlePolymarketUpdate(update: PolymarketUpdate) {
        // 1. Filter for UP/DOWN markets only (BTC, ETH, SOL)
        if (update.marketType !== 'UP_DOWN' || !update.startTime) return;

        // 2. Get Live Spot Price
        const spotPrice = this.lastSpotPrices.get(update.asset);
        if (!spotPrice) {
            if (Math.random() < 0.01) console.log(`[STRATEGY] Waiting for Spot Price for ${update.asset}`);
            return;
        }

        // 3. Get Reference Price (Strike)
        // For Up/Down, Strike is the "Open Price" of the candle at startTime.
        let referencePrice = this.marketReferencePrices.get(update.marketId);

        if (referencePrice === undefined) {
            // Attempt to resolve reference price
            const fetched = await this.resolveReferencePrice(update.asset, update.startTime, update.marketId);
            if (fetched === null) {
                if (Math.random() < 0.01) console.log(`[STRATEGY] Failed to resolve Ref Price for ${update.asset}`);
                return; // Can't trade without knowing the anchor
            }
            referencePrice = fetched;
        }

        // 4. Calculate "True" Delta
        // How far has the asset moved since the candle opened?
        const delta = spotPrice - referencePrice;
        const deltaPercent = (delta / referencePrice) * 100;

        // 5. Strategy Config (The "0x8dxd" parameters)
        // We look for a move of > 0.1% (or similar) that market hasn't priced
        const MOMENTUM_THRESHOLD = 0.05; // 0.05% move is significant for 15m candle
        const PRICE_MISMATCH = 0.20; // 20 cent safety margin

        // 6. Evaluate Signal
        // If Price is UP significanty AND Market Price is low -> BUY YES
        if (deltaPercent > MOMENTUM_THRESHOLD) {
            // Real world says UP.
            // If Polymarket says < 70% (0.70), it's "Lagging"
            if (update.yesPrice < 0.75) {
                console.log(`[LATENCY] ${update.asset} UP! Spot: ${spotPrice.toFixed(2)} > Ref: ${referencePrice.toFixed(2)} (+${deltaPercent.toFixed(3)}%). Poly: ${update.yesPrice.toFixed(2)}`);
                this.emitOpportunity(update, spotPrice, referencePrice, 0.95, 'BUY_YES');
            }
        }
        // If Price is DOWN significantly AND Market Price is high -> BUY NO
        else if (deltaPercent < -MOMENTUM_THRESHOLD) {
            // Real world says DOWN.
            // If Polymarket says > 30% (0.30) for YES, it's lagging (Yes should be near 0)
            if (update.yesPrice > 0.25) {
                console.log(`[LATENCY] ${update.asset} DOWN! Spot: ${spotPrice.toFixed(2)} < Ref: ${referencePrice.toFixed(2)} (${deltaPercent.toFixed(3)}%). Poly: ${update.yesPrice.toFixed(2)}`);
                this.emitOpportunity(update, spotPrice, referencePrice, 0.05, 'BUY_NO');
            }
        }
        else {
            if (Math.random() < 0.01) console.log(`[STRATEGY] Delta ${deltaPercent.toFixed(3)}% < Threshold ${MOMENTUM_THRESHOLD}% (${update.asset})`);
        }
    }

    private async resolveReferencePrice(asset: string, startTime: Date, marketId: string): Promise<number | null> {
        // Debounce fetches
        const lastFetch = this.lastFetchTime.get(marketId) || 0;
        if (Date.now() - lastFetch < 5000) return null; // Don't spam API
        this.lastFetchTime.set(marketId, Date.now());

        try {
            // If start time is in future + buffer, we can't know the open price yet
            if (startTime.getTime() > Date.now() + 60000) return null;

            // Binance API: https://api.binance.com/api/v3/klines
            const symbol = `${asset}USDT`;
            const interval = '15m'; // Up/Down are usually 15m or 1h. 
            // We request the candle AT verify time. 
            // Actually Polymarket 'Start Time' is the lock time/open time of the candle.

            const startTs = startTime.getTime();

            const res = await axios.get('https://api.binance.com/api/v3/klines', {
                params: {
                    symbol,
                    interval,
                    startTime: startTs,
                    limit: 1
                }
            });

            if (res.data && res.data.length > 0) {
                const candle = res.data[0];
                const openPrice = parseFloat(candle[1]);

                // Cache it
                this.marketReferencePrices.set(marketId, openPrice);
                console.log(`[STRATEGY] Resolved Ref Price for ${asset} ${marketId} (Start: ${startTime.toISOString()}): ${openPrice}`);
                return openPrice;
            }
        } catch (err) {
            console.error(`Error fetching Binance candle for ${asset}:`, err);
        }
        return null;
    }

    private emitOpportunity(market: PolymarketUpdate, spot: number, strike: number, implProb: number, action: string) {
        const opp: MarketOpportunity = {
            asset: market.asset,
            spotPrice: spot,
            strikePrice: strike,
            marketId: market.marketId,
            question: market.question,
            outcomes: ['Yes', 'No'],
            outcomePrices: [market.yesPrice, market.noPrice],
            impliedProbability: implProb,
            tokenIds: market.tokenIds, // Pass tokenIds
            timestamp: Date.now()
        };

        this.emit('opportunity', opp);
    }
}
