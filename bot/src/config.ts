export const CONFIG = {
    CHAIN_ID: 137, // Polygon Mainnet
    RPC_URL: 'https://polygon.drpc.org', // Public RPC, can be overridden by env

    // Polygon Contracts
    // Native USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
    USDC_ADDRESS: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    // USDC.e (Bridged) - Main Liquidity on Polymarket
    USDC_E_ADDRESS: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',

    // Exchange Proxy to approve
    // CTF Exchange: 0x4D97DCd97eC945f40cF65F87097ACE5EA0476045
    // Lowercase to avoid checksum errors in ethers v5 if casing is mixed wrong
    EXCHANGE_PROXY: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',

    // Safety Limits
    MAX_TRADE_SIZE_USDC: 10,
    MIN_BALANCE_THRESHOLD: 5,
};
