import WebSocket from 'ws';
import axios from 'axios';
import { EventEmitter } from 'events';
import { PolymarketUpdate } from '../types/index.js';

interface GammaMarket {
    id: string;
    question: string;
    description: string;
    active: boolean;
    closed: boolean;
    clobTokenIds: string[];
    outcomes: string[];
    outcomePrices: string[];
}

interface GammaEvent {
    id: string;
    title: string;
    startDate: string;
    markets: GammaMarket[];
}

export class PolymarketClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private gammaUrl = 'https://gamma-api.polymarket.com/events';
    private wsUrl = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

    // Map TokenID -> Market Info
    private marketMetadata: Map<string, {
        asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
        marketId: string;
        question: string;
        startTime?: Date; // For Up/Down markets
        type: 'UP_DOWN' | 'PRICE_STRIKE' | 'ESPORTS';
        strike?: number;
        tokenIds?: string[]; // Store all token IDs for this market (Yes, No)
    }> = new Map();

    private activeTokenIds: Set<string> = new Set();

    constructor() {
        super();
        this.init();
    }

    private async init() {
        await this.fetchActiveMarkets();
        this.connect();

        // Discovery every 30s
        setInterval(() => this.fetchActiveMarkets(), 30 * 1000);

        // AMM Price Polling every 1s (for non-orderbook markets)
        setInterval(() => this.pollAmmPrices(), 1000);
    }

    private async fetchActiveMarkets() {
        try {
            console.log('Fetching active Up/Down and Esports markets from Gamma API...');

            const tags = ['up-or-down', 'esports'];
            const newTokenIds: string[] = [];
            const maxPages = 3;
            const pageSize = 500;

            for (const tag of tags) {
                for (let page = 0; page < maxPages; page++) {
                    const params = {
                        limit: pageSize,
                        active: 'true',
                        closed: 'false',
                        tag_slug: tag,
                        offset: page * pageSize
                    };

                    const response = await axios.get(this.gammaUrl, { params });
                    const events: GammaEvent[] = response.data;

                    if (!events.length) break;

                    for (const event of events) {
                        // Filter for Up/Down assets only if tag is up-or-down
                        let asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS' | null = null;

                        if (tag === 'up-or-down') {
                            const titleUpper = event.title.toUpperCase();
                            if (titleUpper.includes('BITCOIN') || titleUpper.includes('BTC')) asset = 'BTC';
                            else if (titleUpper.includes('ETHEREUM') || titleUpper.includes('ETH')) asset = 'ETH';
                            else if (titleUpper.includes('SOLANA') || titleUpper.includes('SOL')) asset = 'SOL';
                        } else {
                            asset = 'ESPORTS';
                        }

                        if (!asset) continue;

                        const startTime = new Date(event.startDate);

                        for (const market of event.markets) {
                            if (!market.active || market.closed || !market.clobTokenIds) continue;

                            const hasOrderBook = (market as any).enableOrderBook || (market as any).enable_order_book;
                            if (!hasOrderBook) continue;

                            let marketType: 'UP_DOWN' | 'PRICE_STRIKE' | 'ESPORTS' = 'UP_DOWN';
                            if (tag === 'esports') marketType = 'ESPORTS';

                            // Parse clobTokenIds if it's a string
                            let tokenIds = market.clobTokenIds;
                            if (typeof tokenIds === 'string') {
                                try {
                                    tokenIds = JSON.parse(tokenIds);
                                } catch (e) {
                                    console.error('Failed to parse clobTokenIds:', tokenIds);
                                    continue;
                                }
                            }

                            if (!Array.isArray(tokenIds)) continue;

                            for (let i = 0; i < tokenIds.length; i++) {
                                const tid = tokenIds[i];
                                if (this.activeTokenIds.has(tid)) continue;

                                let strike = 0;
                                if (marketType === 'UP_DOWN') {
                                    const strikeMatch = market.question.match(/(?:>|<|above|below)\s?\$?([0-9,]+(\.[0-9]{2})?)/i);
                                    if (strikeMatch && strikeMatch[1]) {
                                        strike = parseFloat(strikeMatch[1].replace(/,/g, ''));
                                    }
                                }

                                this.marketMetadata.set(tid, {
                                    asset: asset as any,
                                    marketId: market.id,
                                    question: market.question,
                                    startTime,
                                    type: marketType,
                                    strike,
                                    tokenIds: tokenIds // Store the full array
                                });

                                newTokenIds.push(tid);
                                this.activeTokenIds.add(tid);
                            }
                        }
                    }
                }
            }

            console.log(`Found ${newTokenIds.length} NEW active tokens for Up/Down and Esports markets (Total: ${this.activeTokenIds.size}).`);
            if (newTokenIds.length > 0) {
                this.subscribe(newTokenIds);
            }

        } catch (err) {
            console.error('Error fetching Gamma markets:', err);
        }
    }

    private async pollAmmPrices() {
        // Fetch specific active markets for AMM pricing
        try {
            const params = {
                limit: 50,
                active: 'true',
                closed: 'false',
                tag_slug: 'up-or-down',
                order: 'startDate',
                ascending: false // Newest first
            };

            const response = await axios.get(this.gammaUrl, { params });
            const events: GammaEvent[] = response.data;

            for (const event of events) {
                // Filter Asset
                let asset: 'BTC' | 'ETH' | 'SOL' | null = null;
                const titleUpper = event.title.toUpperCase();
                if (titleUpper.includes('BITCOIN') || titleUpper.includes('BTC')) asset = 'BTC';
                else if (titleUpper.includes('ETHEREUM') || titleUpper.includes('ETH')) asset = 'ETH';
                else if (titleUpper.includes('SOLANA') || titleUpper.includes('SOL')) asset = 'SOL';
                if (!asset) continue;

                const startTime = new Date(event.startDate);

                for (const market of event.markets) {
                    // Check if this is an AMM market
                    const hasOrderBook = (market as any).enableOrderBook || (market as any).enable_order_book;
                    if (hasOrderBook) continue;

                    // Extract Prices
                    if (market.outcomePrices && market.outcomePrices.length >= 2) {
                        try {
                            // Parse outcomePrices similar to tokenIds
                            let prices = market.outcomePrices;
                            if (typeof prices === 'string') {
                                prices = JSON.parse(prices);
                            }

                            if (Array.isArray(prices)) {
                                const yesPrice = parseFloat(prices[0]);
                                const noPrice = parseFloat(prices[1]);

                                // Send Update
                                const update: PolymarketUpdate = {
                                    asset,
                                    marketId: market.id,
                                    question: market.question,
                                    strikePrice: 0, // Dynamic (handled in strategy)
                                    yesPrice,
                                    noPrice,
                                    timestamp: Date.now(),
                                    marketType: 'UP_DOWN',
                                    startTime,
                                    tokenIds: market.clobTokenIds as any // Add tokenIds
                                };
                                console.log(`[AMM Poll] ${asset} Price: ${yesPrice.toFixed(2)} (${market.question})`);
                                this.emit('polymarket_price', update);
                            }

                        } catch (e) {
                            // console.error("Error parsing AMM prices", e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("AMM Polling Error:", err);
        }
    }

    private connect() {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('Connected to Polymarket WebSocket');
            if (this.activeTokenIds.size > 0) {
                this.subscribe(Array.from(this.activeTokenIds));
            }
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msgs = JSON.parse(data.toString());
                const updates = Array.isArray(msgs) ? msgs : [msgs];

                // DEBUG: Log the first message of any batch
                if (updates.length > 0) {
                    console.log(`Received ${updates.length} updates. Type: ${updates[0].event_type}`);
                }

                for (const msg of updates) {
                    // Log to debug what's flowing
                    // console.log('WS Msg:', JSON.stringify(msg).substring(0, 150));

                    if (msg.event_type === 'price_change') {
                        // Handle array of price changes
                        const changes = msg.price_changes || [msg]; // Fallback if single

                        for (const change of changes) {
                            const tokenId = change.asset_id || change.token_id;
                            const webPrice = change.price;
                            const meta = this.marketMetadata.get(tokenId);

                            if (meta && webPrice) {
                                console.log(`Price Update for ${meta.asset}: ${webPrice}`);
                                const update: PolymarketUpdate = {
                                    asset: meta.asset,
                                    marketId: meta.marketId,
                                    question: meta.question,
                                    strikePrice: meta.strike || 0,
                                    yesPrice: parseFloat(webPrice),
                                    noPrice: 1 - parseFloat(webPrice),
                                    marketType: 'UP_DOWN',
                                    startTime: meta.startTime,
                                    tokenIds: meta.tokenIds,
                                    timestamp: Date.now()
                                };
                                this.emit('polymarket_price', update);
                            }
                        }
                    } else if (msg.event_type === 'book') {
                        // Handle orderbook updates (simplified)
                    }
                }
            } catch (err) { }
        });

        this.ws.on('close', () => {
            console.log('Polymarket connection closed. Reconnecting...');
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err: any) => console.error('Polymarket WS Error:', err));
    }

    private async subscribe(tokenIds: string[]) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Reduce chunk size to avoid flooding/limits
        const CHUNK_SIZE = 50;

        for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
            const chunk = tokenIds.slice(i, i + CHUNK_SIZE);
            const msg = {
                type: "market",
                assets_ids: chunk,
            };
            this.ws.send(JSON.stringify(msg));
            console.log(`Subscribed to chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} tokens)`);

            // Add a small delay to be gentle and prevent bursts
            await new Promise(r => setTimeout(r, 100));
        }
    }
}
