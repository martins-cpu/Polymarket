export interface PriceUpdate {
    source: 'binance' | 'coinbase' | 'polymarket';
    asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
    price: number;
    timestamp: number;
}

export interface PolymarketUpdate {
    asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
    marketId: string;
    question: string;
    strikePrice: number;
    yesPrice: number;
    noPrice: number;
    timestamp: number;
    marketType?: 'UP_DOWN' | 'PRICE_STRIKE' | 'ESPORTS';
    startTime?: Date;
    tokenIds?: string[]; // [Yes, No] (Actually clobTokenIds)
}

export interface MarketOpportunity {
    asset: 'BTC' | 'ETH' | 'SOL' | 'ESPORTS';
    spotPrice: number;
    strikePrice: number;
    marketId: string;
    question: string;
    outcomes: string[];
    outcomePrices: [number, number]; // [Yes, No]
    tokenIds?: string[]; // [yesTokenId, noTokenId]
    impliedProbability: number; // Based on spot vs strike
    timestamp: number;
}
