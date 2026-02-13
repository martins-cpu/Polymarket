import { EventEmitter } from 'events';
import { PriceUpdate } from '../types';
import Decimal from 'decimal.js';

export interface AggregatedPrice {
    asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
    price: number;
    sources: number; // How many sources contributed
    timestamp: number;
}

export class PriceAggregator extends EventEmitter {
    private latestPrices: Map<string, Map<string, number>> = new Map(); // asset -> source -> price

    constructor() {
        super();
        this.latestPrices.set('BTC', new Map());
        this.latestPrices.set('ETH', new Map());
        this.latestPrices.set('SOL', new Map());
    }

    public handlePriceUpdate(update: PriceUpdate) {
        if (update.asset === 'ESPORTS') return; // No aggregation for esports
        const sources = this.latestPrices.get(update.asset);
        if (!sources) return;

        sources.set(update.source, update.price);
        this.emitAggregatedPrice(update.asset);
    }

    private emitAggregatedPrice(asset: 'BTC' | 'ETH' | 'SOL') {
        const sources = this.latestPrices.get(asset);
        if (!sources || sources.size === 0) return;

        // Calculate average
        let sum = new Decimal(0);
        sources.forEach(price => sum = sum.plus(price));
        const avg = sum.div(sources.size).toNumber();

        const update: AggregatedPrice = {
            asset,
            price: avg,
            sources: sources.size,
            timestamp: Date.now()
        };

        this.emit('price', update);
    }
}
