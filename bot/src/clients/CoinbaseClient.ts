import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PriceUpdate } from '../types';

export class CoinbaseClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private url = 'wss://ws-feed.exchange.coinbase.com';
    private productIds = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

    constructor() {
        super();
        this.connect();
    }

    private connect() {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            console.log('Connected to Coinbase WebSocket');
            const subscribeMsg = {
                type: 'subscribe',
                product_ids: this.productIds,
                channels: ['ticker']
            };
            this.ws?.send(JSON.stringify(subscribeMsg));
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'ticker') {
                    const update: PriceUpdate = {
                        source: 'coinbase',
                        asset: this.mapSymbol(message.product_id),
                        price: parseFloat(message.price),
                        timestamp: new Date(message.time).getTime()
                    };
                    this.emit('price', update);
                }
            } catch (err) {
                console.error('Error parsing Coinbase message:', err);
            }
        });

        this.ws.on('close', () => {
            console.log('Coinbase connection closed. Reconnecting...');
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err: any) => {
            console.error('Coinbase WebSocket error:', err);
            this.ws?.terminate();
        });
    }

    private mapSymbol(symbol: string): 'BTC' | 'ETH' | 'SOL' {
        if (symbol === 'BTC-USD') return 'BTC';
        if (symbol === 'ETH-USD') return 'ETH';
        if (symbol === 'SOL-USD') return 'SOL';
        return 'BTC'; // default
    }
}
