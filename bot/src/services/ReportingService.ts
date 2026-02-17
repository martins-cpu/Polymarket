import * as fs from 'fs';
import * as path from 'path';

export interface TradeRecord {
    id: string;
    marketId: string;
    asset: string;
    type: 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO';
    price: number;
    size: number;
    timestamp: number;
    status: 'OPEN' | 'CLOSED';
    pnl?: number; // Realized PnL

    // Monitoring Fields (Optional)
    question?: string;
    currentPrice?: number;
    shares?: number; // Legacy alias for size
    entryPrice?: number; // Legacy alias for price
    unrealizedPnl?: number;
    exitPrice?: number;
    exitTimestamp?: number;
    tokenIds?: string[];
}

export class ReportingService {
    private tradesFile = path.join(process.cwd(), 'saved_trades.json');
    private trades: TradeRecord[] = [];

    constructor() {
        this.loadTrades();
    }

    private loadTrades() {
        try {
            if (fs.existsSync(this.tradesFile)) {
                const data = fs.readFileSync(this.tradesFile, 'utf-8');
                this.trades = JSON.parse(data);
                console.log(`[REPORTING] Loaded ${this.trades.length} trades from disk.`);
            }
        } catch (err) {
            console.error('[REPORTING] Failed to load trades:', err);
        }
    }

    public saveTrades() {
        try {
            fs.writeFileSync(this.tradesFile, JSON.stringify(this.trades, null, 2));
        } catch (err) {
            console.error('[REPORTING] Failed to save trades:', err);
        }
    }

    public addTrade(trade: TradeRecord) {
        // Check if exists
        const index = this.trades.findIndex(t => t.id === trade.id);
        if (index >= 0) {
            this.trades[index] = trade; // Update
        } else {
            this.trades.push(trade);
        }
        this.saveTrades();
    }

    public getDailyReport(): string {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        const recentTrades = this.trades.filter(t => t.timestamp > oneDayAgo);
        const closedTrades = recentTrades.filter(t => t.status === 'CLOSED');

        let totalPnL = 0;
        let volume = 0;
        let wins = 0;

        closedTrades.forEach(t => {
            if (t.pnl) totalPnL += t.pnl;
            if (t.pnl && t.pnl > 0) wins++;
            volume += (t.price * t.size);
        });

        const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : '0.0';

        return `
=== DAILY TRADING REPORT ===
Date: ${new Date().toISOString().split('T')[0]}
Trades (24h): ${recentTrades.length}
Volume: $${volume.toFixed(2)}
Realized PnL: $${totalPnL.toFixed(2)}
Win Rate: ${winRate}%
============================
`;
    }

    public getTrades() {
        return this.trades;
    }
}
