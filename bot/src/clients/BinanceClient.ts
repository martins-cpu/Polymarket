import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PriceUpdate } from '../types/index.js';

export class BinanceClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private url = 'wss://stream.binance.com:9443/ws';
    private streams = [
        'btcusdt@trade',
        'ethusdt@trade',
        'solusdt@trade'
    ];

    constructor() {
        super();
        this.connect();
    }

    private connect() {
        this.ws = new WebSocket(`${this.url}/${this.streams.join('/')}`);

        this.ws.on('open', () => {
            console.log('Connected to Binance WebSocket');
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                // e: event type, s: symbol, p: price, E: event time
                if (message.e === 'trade') {
                    const update: PriceUpdate = {
                        source: 'binance',
                        asset: this.mapSymbol(message.s),
                        price: parseFloat(message.p),
                        timestamp: message.E
                    };
                    this.emit('price', update);
                }
            } catch (err) {
                console.error('Error parsing Binance message:', err);
            }
        });

        this.ws.on('close', () => {
            console.log('Binance connection closed. Reconnecting...');
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err: any) => {
            console.error('Binance WebSocket error:', err);
            this.ws?.terminate();
        });
    }

    private mapSymbol(symbol: string): 'BTC' | 'ETH' | 'SOL' {
        if (symbol === 'BTCUSDT') return 'BTC';
        if (symbol === 'ETHUSDT') return 'ETH';
        if (symbol === 'SOLUSDT') return 'SOL';
        return 'BTC'; // default
    }
}
