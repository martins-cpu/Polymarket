import { ReportingService, TradeRecord } from '../services/ReportingService.js';
import { MarketOpportunity } from '../types/index.js';
import { ClobClient } from '../clients/ClobClient.js';
import { CONFIG } from '../config.js';

export class SimulationEngine {
    private trades: TradeRecord[] = []; // Now uses TradeRecord interface
    private balance = 1000;
    private betSize = CONFIG.MAX_TRADE_SIZE_USDC;
    private executedMarketIds: Set<string> = new Set();
    private reportingService: ReportingService;

    // NEW: Live Trading components
    private mode: 'SIMULATION' | 'MONITOR_ONLY' | 'LIVE_TRADING' = 'SIMULATION';
    private clobClient: ClobClient | null = null;

    constructor(mode: 'SIMULATION' | 'MONITOR_ONLY' | 'LIVE_TRADING' = 'SIMULATION') {
        this.mode = mode;
        this.reportingService = new ReportingService();
        this.trades = this.reportingService.getTrades(); // Load from disk

        console.log(`[ENGINE] Starting in ${this.mode} mode.`);

        if (this.mode === 'LIVE_TRADING') {
            this.clobClient = new ClobClient();
        }

        // Safety Override in Live Mode
        if (this.mode === 'LIVE_TRADING') {
            this.betSize = Math.min(this.betSize, CONFIG.MAX_TRADE_SIZE_USDC);
        }

        this.startDailyReporting();
    }

    public handlePriceUpdate(update: any) {
        // Create a pseudo-opportunity to reuse update logic, or refactor updateOpenPositions to take update
        // MarketOpportunity has outcomePrices which we need.
        // PolymarketUpdate: { marketId, yesPrice, noPrice, ... }
        const opp: MarketOpportunity = {
            marketId: update.marketId,
            asset: update.asset,
            outcomePrices: [update.yesPrice, update.noPrice],
            // Dummy values for rest
            question: '',
            outcomes: [],
            timestamp: Date.now(),
            impliedProbability: 0,
            spotPrice: 0,
            strikePrice: 0
        };
        this.updateOpenPositions(opp);
    }



    public handleOpportunity(opp: MarketOpportunity) {
        // Always try to update existing trades first (Monitor)
        this.updateOpenPositions(opp);

        // If in Monitor Mode, STOP here.
        if (this.mode === 'MONITOR_ONLY') {
            return;
        }

        // --- Standard Trading Logic Below ---

        // 1. Resolve Trade Direction
        let type: 'BUY_YES' | 'BUY_NO' | null = null;
        if (opp.impliedProbability > 0.8) type = 'BUY_YES';
        else if (opp.impliedProbability < 0.2) type = 'BUY_NO';

        if (!type) return;

        // 2. Check if we already traded
        const tradeKey = `${opp.marketId}-${type}`;
        if (this.executedMarketIds.has(tradeKey)) return;

        // 3. Capital Check (Mock for Sim, Real check handled in placeOrder for Live)
        // For live, we assume we have funds if ClobClient works, or we can check balance if we want.
        // Sim mode checks local this.balance

        // 4. Resolve Price
        let price = type === 'BUY_YES' ? opp.outcomePrices[0] : opp.outcomePrices[1];
        if (!price && price !== 0) price = 1 - opp.outcomePrices[0]; // Fallback

        // 5. Execute
        // Filter out extreme trash (e.g. price < 0.01 is often unfillable or buggy)
        if (price > 0.01) {
            this.executeTrade(type, price, opp);
        }
    }

    private updateOpenPositions(opp: MarketOpportunity) {
        // Find any OPEN trades for this market
        const relevantTrades = this.trades.filter(t =>
            t.status === 'OPEN' &&
            ((t.marketId && t.marketId === opp.marketId) || (t.question && opp.question && t.question === opp.question))
        );

        for (const trade of relevantTrades) {
            // Get current price for the side we hold
            const currentPrice = trade.type === 'BUY_YES' ? opp.outcomePrices[0] : opp.outcomePrices[1];

            // Update state
            trade.currentPrice = currentPrice;

            // Calculate Unrealized PnL
            // Value = Shares * CurrentPrice
            // PnL = Value - CostBasis (EntryPrice * Shares)
            const shares = trade.shares || trade.size || 0;
            const entryPrice = trade.entryPrice || trade.price || 0;

            const currentValue = shares * currentPrice;
            const costBasis = shares * entryPrice;

            // Avoid NaN if price missing
            if (!isNaN(currentPrice)) {
                trade.unrealizedPnl = currentValue - costBasis;
                // console.log(`[MONITOR] ${trade.asset} ${trade.id}: PnL $${trade.unrealizedPnl.toFixed(2)}`);

                // Check for Exit Conditions
                // 1. Take Profit: > 50% gain
                if (trade.unrealizedPnl > (costBasis * 0.5)) {
                    this.closeTrade(trade, currentPrice, 'TAKE_PROFIT');
                }
                // 2. Stop Loss: > 50% loss
                else if (trade.unrealizedPnl < -(costBasis * 0.5)) {
                    this.closeTrade(trade, currentPrice, 'STOP_LOSS');
                }
            }
        }
    }

    private async closeTrade(trade: TradeRecord, exitPrice: number, reason: string) { // Use TradeRecord
        console.log(`[EXIT] Attempting to close ${trade.id} (${reason}) @ $${exitPrice.toFixed(2)}...`);

        if (this.mode === 'LIVE_TRADING' && this.clobClient) {
            // LIVE EXIT: Place opposite order
            const side = trade.type === 'BUY_YES' ? 'SELL' : 'SELL';

            // FIXME: Missing TokenId storage in trade record for live exit
            // For now, in LIVE mode, we might fail to exit if we don't have tokenId.
            console.warn('[EXIT] Live Exit not fully implemented (missing TokenId storage). Manual Close Required.');
            return;
        }

        // SIMULATION EXIT
        trade.status = 'CLOSED';
        trade.exitPrice = exitPrice;
        trade.exitTimestamp = Date.now();

        // Final PnL
        const shares = trade.shares || trade.size || 0;
        const entryPrice = trade.entryPrice || trade.price || 0;

        const currentValue = shares * exitPrice;
        const costBasis = shares * entryPrice;
        trade.pnl = currentValue - costBasis;

        this.balance += currentValue; // Return capital + profit
        this.executedMarketIds.delete(`${trade.marketId}-${trade.type}`);

        console.log(`[EXIT] Closed ${trade.id} (${reason}) @ $${exitPrice.toFixed(2)}. PnL: $${trade.pnl.toFixed(2)}`);
        this.reportingService.addTrade(trade); // Save via service
    }

    private async executeTrade(type: 'BUY_YES' | 'BUY_NO', price: number, opp: MarketOpportunity) {

        // SAFETY GUARD
        const MAX_BET = CONFIG.MAX_TRADE_SIZE_USDC;
        const tradeSize = Math.min(this.betSize, MAX_BET);

        // CALCULATE SHARES
        const shares = tradeSize / price;
        const potentialPayout = shares * 1;
        const potentialProfit = potentialPayout - tradeSize;

        // PREPARE TRADE OBJECT
        const trade: TradeRecord = {
            id: Math.random().toString(36).substring(7),
            marketId: opp.marketId,
            asset: opp.asset,
            type: type,
            price: price, // entryPrice -> price
            size: shares, // shares -> size
            timestamp: Date.now(), // entryTimestamp -> timestamp
            status: 'OPEN'
        };

        const tradeKey = `${opp.marketId}-${type}`;
        if (this.executedMarketIds.has(tradeKey)) return;

        // EXECUTION
        if (this.mode === 'LIVE_TRADING' && this.clobClient) {
            console.log(`[LIVE] Triggering Order: ${type} on ${opp.asset} @ $${price}`);

            if (!opp.tokenIds || opp.tokenIds.length < 2) {
                console.error('[LIVE] Missing TokenIDs for execution. Trade aborted.');
                return;
            }

            const tokenId = type === 'BUY_YES' ? opp.tokenIds[0] : opp.tokenIds[1];

            try {
                const order = await this.clobClient.placeOrder(tokenId, 'BUY', price, tradeSize);

                trade.id = String(order.orderID);
                trade.status = 'OPEN';

                // Add token IDs for potential exit later
                trade.tokenIds = opp.tokenIds;

                this.reportingService.addTrade(trade); // Persist
                this.logTradeToCSV(trade);
                this.executedMarketIds.add(tradeKey);

                // Balance update is theoretical until we sync with chain, but keep track locally.
                this.balance -= tradeSize;

                console.log(`[LIVE] Trade Executed! ID: ${order.orderID}`);

            } catch (err: any) {
                console.error('[LIVE] Execution Failed:', err?.message || err);
                return;
            }
        }
        else {
            // SIMULATION
            this.reportingService.addTrade(trade);
            this.executedMarketIds.add(tradeKey);
            this.balance -= tradeSize;
            console.log(`[SIMULATION] Executed ${type} on ${opp.asset} @ $${price.toFixed(2)} | Shares: ${shares.toFixed(2)}`);
        }
    }

    public getStats() {
        // Equity = Cash + Value of Open Positions
        let openPositionValue = 0;
        this.trades.filter(t => t.status === 'OPEN').forEach(t => {
            const price = t.price; // Simplified, use entry price
            openPositionValue += (t.size * price);
        });

        return {
            balance: this.mode === 'LIVE_TRADING' ? 0 : (this.balance + openPositionValue),
            cash: this.balance,
            openTrades: this.trades.filter(t => t.status === 'OPEN').length,
            totalTrades: this.trades.length,
            mode: this.mode,
            wallet: this.clobClient ? this.clobClient.getAddress() : 'Simulation',
            activeTrades: this.trades.filter(t => t.status === 'OPEN').map(t => ({
                id: t.id,
                asset: t.asset,
                type: t.type,
                entryPrice: t.price,
                shares: t.size,
                currentPrice: t.price, // Placeholder
                pnl: 0 // Placeholder
            }))
        };
    }

    private startDailyReporting() {
        // Schedule Report for 00:00 UTC
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setUTCHours(24, 0, 0, 0); // Next midnight

        const timeToMidnight = nextMidnight.getTime() - now.getTime();

        console.log(`[REPORTING] Next report scheduled in ${Math.round(timeToMidnight / 1000 / 60)} minutes.`);

        setTimeout(() => {
            this.generateDailyReport();
            // Schedule next loop
            setInterval(() => this.generateDailyReport(), 24 * 60 * 60 * 1000);
        }, timeToMidnight);
    }

    private generateDailyReport() {
        const report = this.reportingService.getDailyReport();
        console.log(report);
    }

    private logTradeToCSV(trade: TradeRecord) {
        const line = `${new Date(trade.timestamp).toISOString()},${trade.marketId},${trade.asset},${trade.type},${trade.price},${trade.size},${trade.id},${trade.status}\n`;
        try {
            // Ensure logs dir exists (it should, but safety first)
            // if (!fs.existsSync('logs')) fs.mkdirSync('logs'); // Sync check might be heavy in loop, but OK for low freq
            // Actually index.ts handles dir creation usually, but let's be safe or just write.
            // Using require to avoid top-level import if strictly needed, or just import fs at top.
            require('fs').appendFileSync('logs/trades.csv', line);
        } catch (e) {
            console.error('[CSV] Failed to log trade:', e);
        }
    }
}
