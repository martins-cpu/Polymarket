import * as fs from 'fs';
import * as path from 'path';
import { MarketOpportunity } from '../types';
import { ClobClient } from '../clients/ClobClient';
import { CONFIG } from '../config';

interface Trade {
    id: string;
    marketId: string;
    question: string;
    asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
    type: 'BUY_YES' | 'BUY_NO';
    entryPrice: number;
    shares: number;
    entryTimestamp: number;
    status: 'OPEN' | 'CLOSED';
    exitPrice?: number;
    exitTimestamp?: number;
    pnl?: number;
    potentialReturn?: number;
    currentPrice?: number;   // New: Track live price
    unrealizedPnl?: number;  // New: Track theoretical PnL
}

export class SimulationEngine {
    private trades: Trade[] = [];
    private balance = 1000;
    private betSize = CONFIG.MAX_TRADE_SIZE_USDC; // Start small
    private executedMarketIds: Set<string> = new Set();
    private readonly STORAGE_FILE = path.join(__dirname, '../../saved_trades.json');

    // NEW: Live Trading components
    private mode: 'SIMULATION' | 'MONITOR_ONLY' | 'LIVE_TRADING' = 'SIMULATION';
    private clobClient: ClobClient | null = null;

    constructor(mode: 'SIMULATION' | 'MONITOR_ONLY' | 'LIVE_TRADING' = 'SIMULATION') {
        this.mode = mode;
        console.log(`[ENGINE] Starting in ${this.mode} mode.`);

        if (this.mode === 'LIVE_TRADING') {
            this.clobClient = new ClobClient();
        }

        this.loadTrades();

        // Safety Override in Live Mode
        if (this.mode === 'LIVE_TRADING') {
            this.betSize = Math.min(this.betSize, CONFIG.MAX_TRADE_SIZE_USDC);
        }
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

    private loadTrades() {
        if (fs.existsSync(this.STORAGE_FILE)) {
            try {
                const data = fs.readFileSync(this.STORAGE_FILE, 'utf-8');
                this.trades = JSON.parse(data);
                this.trades.forEach(t => {
                    if (t.status === 'OPEN') {
                        this.executedMarketIds.add(`${t.marketId}-${t.type}`);
                    }
                });
                console.log(`[ENGINE] Loaded ${this.trades.length} trades from storage.`);
            } catch (err) {
                console.error('[ENGINE] Failed to load trades:', err);
            }
        }
    }

    private saveTrades() {
        try {
            fs.writeFileSync(this.STORAGE_FILE, JSON.stringify(this.trades, null, 2));
        } catch (err) {
            console.error('[ENGINE] Failed to save trades:', err);
        }
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
            const currentValue = trade.shares * currentPrice;
            const costBasis = trade.shares * trade.entryPrice;

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

    private async closeTrade(trade: Trade, exitPrice: number, reason: string) {
        console.log(`[EXIT] Attempting to close ${trade.id} (${reason}) @ $${exitPrice.toFixed(2)}...`);

        if (this.mode === 'LIVE_TRADING' && this.clobClient) {
            // LIVE EXIT: Place opposite order
            // If we bought YES, we SELL YES. (Or Buy NO? Polymarket usually means Sell Position).
            // CLOB Client needs to support SELL.
            const side = trade.type === 'BUY_YES' ? 'SELL' : 'SELL'; // "Selling the YES shares" or "Selling the NO shares"

            // Wait, "BUY_NO" means we hold "NO" tokens. To exit, we SELL "NO" tokens.
            // Polymarket API uses TokenID. 
            // We didn't store TokenID in Trade struct properly? 
            // Wait, we stored `marketId`. The CLOB needs `tokenID`.
            // Currently our `Trade` struct lacks `tokenId`. 
            // For now, in LIVE mode, we might fail to exit if we don't have tokenId.
            // FIXME: We need to store tokenId in Trade. Only Simulaton stored simplified data.
            console.warn('[EXIT] Live Exit not fully implemented (missing TokenId storage). Manual Close Required.');
            return;
        }

        // SIMULATION EXIT
        trade.status = 'CLOSED';
        trade.exitPrice = exitPrice;
        trade.exitTimestamp = Date.now();

        // Final PnL
        const currentValue = trade.shares * exitPrice;
        const costBasis = trade.shares * trade.entryPrice;
        trade.pnl = currentValue - costBasis;

        this.balance += currentValue; // Return capital + profit
        this.executedMarketIds.delete(`${trade.marketId}-${trade.type}`);

        console.log(`[EXIT] Closed ${trade.id} (${reason}) @ $${exitPrice.toFixed(2)}. PnL: $${trade.pnl.toFixed(2)}`);
        this.saveTrades();
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
        const trade: Trade = {
            id: Math.random().toString(36).substring(7),
            marketId: opp.marketId,
            question: opp.question,
            asset: opp.asset,
            type,
            entryPrice: price,
            shares,
            entryTimestamp: Date.now(),
            status: 'OPEN',
            potentialReturn: potentialProfit
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

            // BUY_YES -> Index 0. BUY_NO -> Index 1.
            // Polymarket Tokens: [YesToken, NoToken] usually, verify order? 
            // Standard is Yes = 0, No = 1 in our arrays from `clobTokenIds`.
            const tokenId = type === 'BUY_YES' ? opp.tokenIds[0] : opp.tokenIds[1];

            try {
                // Ensure price is string, size is string
                // Safety: Limit price to 2 decimals or proper tick size? CLOB handles it?
                // Price MUST be string.
                const order = await this.clobClient.placeOrder(tokenId, 'BUY', price, tradeSize);

                trade.id = order.orderID;
                trade.status = 'OPEN';

                // Add to open trades immediately (OPTIMISTIC Update)
                // Real confirmation relies on separate REST/WS check, but for now we assume Fill.
                // NOTE: If FOK fails, this throws, and we don't add.

                this.trades.push(trade);
                this.executedMarketIds.add(tradeKey);
                // Balance update is theoretical until we sync with chain, but keep track locally.
                this.balance -= tradeSize;

                console.log(`[LIVE] Trade Executed! ID: ${order.orderID}`);
                this.saveTrades();

            } catch (err: any) {
                console.error('[LIVE] Execution Failed:', err?.message || err);
                return;
            }
        }
        else {
            // SIMULATION
            this.trades.push(trade);
            this.executedMarketIds.add(tradeKey);
            this.balance -= tradeSize;
            console.log(`[SIMULATION] Executed ${type} on ${opp.asset} @ $${price.toFixed(2)} | Shares: ${shares.toFixed(2)}`);
            this.saveTrades();
        }
    }

    public getStats() {
        // Equity = Cash + Value of Open Positions
        let openPositionValue = 0;
        this.trades.filter(t => t.status === 'OPEN').forEach(t => {
            // Use current price if available, else entry price
            const price = t.currentPrice ?? t.entryPrice;
            openPositionValue += (t.shares * price);
        });

        return {
            balance: this.balance + openPositionValue,
            cash: this.balance,
            openTrades: this.trades.filter(t => t.status === 'OPEN').length,
            totalTrades: this.trades.length,
            activeTrades: this.trades.filter(t => t.status === 'OPEN').map(t => ({
                id: t.id,
                asset: t.asset,
                question: t.question,
                type: t.type,
                entryPrice: t.entryPrice,
                currentPrice: t.currentPrice,
                unrealizedPnl: t.unrealizedPnl,
                entryTime: t.entryTimestamp
            }))
        };
    }
}
