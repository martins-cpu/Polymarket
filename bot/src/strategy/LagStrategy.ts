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

        // If start time is in future + buffer, we can't know the open price yet
        if (startTime.getTime() > Date.now() + 60000) return null;

        // Try Binance First
        try {
            const price = await this.fetchBinanceCandle(asset, startTime);
            if (price) {
                this.marketReferencePrices.set(marketId, price);
                console.log(`[STRATEGY] Resolved Ref Price (Binance) for ${asset}: ${price}`);
                return price;
            }
        } catch (e) {
            console.warn(`[STRATEGY] Binance Ref check failed: ${e}`);
        }

        // Try Coinbase Fallback
        try {
            const price = await this.fetchCoinbaseCandle(asset, startTime);
            if (price) {
                this.marketReferencePrices.set(marketId, price);
                console.log(`[STRATEGY] Resolved Ref Price (Coinbase) for ${asset}: ${price}`);
                return price;
            }
        } catch (e) {
            console.warn(`[STRATEGY] Coinbase Ref check failed: ${e}`);
        }

        return null;
    }

    private async fetchBinanceCandle(asset: string, startTime: Date): Promise<number | null> {
        const symbol = `${asset}USDT`;
        const startTs = startTime.getTime();

        try {
            const res = await axios.get('https://api.binance.com/api/v3/klines', {
                params: {
                    symbol,
                    interval: '15m',
                    startTime: startTs,
                    limit: 1
                },
                timeout: 3000
            });
            if (res.data && res.data.length > 0) {
                return parseFloat(res.data[0][1]);
            }
        } catch (err) {
            // throw err; // Let caller handle
        }
        return null;
    }

    private async fetchCoinbaseCandle(asset: string, startTime: Date): Promise<number | null> {
        // Coinbase: /products/{id}/candles
        // Granularity 900 = 15m
        const productId = `${asset}-USD`;
        // Coinbase wants ISO strings or similar? No, standard params usually.
        // Actually Coinbase Pro API kwargs: start, end, granularity
        // Start must be ISO 8601

        const startIso = startTime.toISOString();
        const endIso = new Date(startTime.getTime() + 15 * 60 * 1000).toISOString();

        try {
            const res = await axios.get(`https://api.exchange.coinbase.com/products/${productId}/candles`, {
                params: {
                    start: startIso,
                    end: endIso,
                    granularity: 900
                },
                headers: { 'User-Agent': 'Mozilla/5.0' }, // Anti-bot bypass sometimes
                timeout: 3000
            });

            // Response is array of buckets: [ time, low, high, open, close, volume ]
            if (res.data && res.data.length > 0) {
                // We want OPEN price. Coinbase returns newest first? 
                // We requested a specific 15m window.
                // Bucket: [ time, low, high, open, close, volume ] -> Index 3 is Open
                const candle = res.data[res.data.length - 1]; // Oldest (closest to start)
                return candle[3];
            }
        } catch (err: any) {
            console.warn(`Coinbase Error details: ${err.message}`);
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
