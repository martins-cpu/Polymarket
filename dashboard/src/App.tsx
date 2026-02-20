import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

interface ActiveTrade {
    id: string;
    asset: string;
    question?: string;
    type: string;
    entryPrice: number;
    potentialReturn?: number;
    entryTime: number;
}

interface Stats {
    balance: number;
    openTrades: number;
    totalTrades: number;
    mode?: string;
    activeTrades?: ActiveTrade[];
}

interface PriceData {
    asset: string;
    spot: number;
    polyYes: number;
    strike: number;
}

interface Opportunity {
    asset: string;
    spotPrice: number;
    strikePrice: number;
    outcomePrices: [number, number];
    impliedProbability: number;
    marketId: string;
    timestamp: number;
}

function App() {
    const [stats, setStats] = useState<Stats>({ balance: 0, openTrades: 0, totalTrades: 0 });
    const [prices, setPrices] = useState<PriceData[]>([]);
    const [opps, setOpps] = useState<Opportunity[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, pricesRes, oppsRes] = await Promise.all([
                    axios.get('/api/stats'),
                    axios.get('/api/prices'),
                    axios.get('/api/opportunities')
                ]);

                setStats(statsRes.data);
                setPrices(pricesRes.data);
                setOpps(oppsRes.data);
                setLastUpdate(new Date());
            } catch (err) {
                console.error('Error fetching dashboard data:', err);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 1000); // Poll every second
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="container">
            <header>
                <h1>Polymarket Bot Dashboard</h1>
                <div className={`status-badge ${stats.mode === 'LIVE_TRADING' ? 'live' : ''}`}>
                    {stats.mode === 'LIVE_TRADING' ? 'Live Trading' : 'Simulation Mode'}
                </div>
                <div className="last-update">Last Update: {lastUpdate.toLocaleTimeString()}</div>
            </header>

            <div className="stats-grid">
                <div className="card">
                    <h3>Balance</h3>
                    <div className="value">${stats.balance.toFixed(2)}</div>
                </div>
                <div className="card">
                    <h3>Open Trades</h3>
                    <div className="value">{stats.openTrades}</div>
                </div>
                <div className="card">
                    <h3>Total Trades</h3>
                    <div className="value">{stats.totalTrades}</div>
                </div>
            </div>

            <div className="prices-section">
                <h2>Live Market Data</h2>
                <div className="prices-grid">
                    {prices.map(p => (
                        <div key={p.asset} className="price-card">
                            <div className="asset-name">{p.asset}</div>
                            <div className="price-row">
                                <span>Spot Price:</span>
                                <span className="price-value">${p.spot.toFixed(2)}</span>
                            </div>
                            <div className="price-row">
                                <span>Target Strike:</span>
                                <span className="price-value">${p.strike.toFixed(2)}</span>
                            </div>
                            <div className="price-row">
                                <span>Poly YES Price:</span>
                                <span className={p.polyYes > 0 ? "poly-value" : "poly-value waiting"}>
                                    {p.polyYes > 0 ? p.polyYes.toFixed(2) : 'Waiting...'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="active-trades-section">
                <h2>Active Trades (Live Positions)</h2>
                <table className="opps-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Asset</th>
                            <th>Question</th>
                            <th>Type</th>
                            <th>Entry Price</th>
                            <th>Pot. Profit</th>
                            <th>Entry Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.activeTrades && stats.activeTrades.length > 0 ? (
                            stats.activeTrades.slice().reverse().map((trade) => (
                                <tr key={trade.id}>
                                    <td>{trade.id}</td>
                                    <td>{trade.asset}</td>
                                    <td className="question-col">{trade.question || 'N/A'}</td>
                                    <td className={trade.type === 'BUY_YES' ? 'buy-yes' : 'buy-no'}>
                                        {trade.type.replace('_', ' ')}
                                    </td>
                                    <td>${trade.entryPrice.toFixed(2)}</td>
                                    <td className="profit-col">+${(trade.potentialReturn || 0).toFixed(2)}</td>
                                    <td>{new Date(trade.entryTime).toLocaleTimeString()}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="empty-row">No active trades currently open.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="opps-section">
                <h2>Recent Opportunities</h2>
                <table className="opps-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Asset</th>
                            <th>Action</th>
                            <th>Spot</th>
                            <th>Strike</th>
                            <th>Market Price</th>
                            <th>Implied Prob</th>
                        </tr>
                    </thead>
                    <tbody>
                        {opps.slice().reverse().map((opp, i) => (
                            <tr key={i}>
                                <td>{new Date(opp.timestamp).toLocaleTimeString()}</td>
                                <td>{opp.asset}</td>
                                <td className={opp.impliedProbability > 0.8 ? 'buy-yes' : 'buy-no'}>
                                    {opp.impliedProbability > 0.8 ? 'BUY YES' : 'BUY NO'}
                                </td>
                                <td>${opp.spotPrice.toFixed(2)}</td>
                                <td>${opp.strikePrice.toFixed(2)}</td>
                                <td>{opp.outcomePrices[0].toFixed(2)}</td>
                                <td>{opp.impliedProbability.toFixed(2)}</td>
                            </tr>
                        ))}
                        {opps.length === 0 && (
                            <tr>
                                <td colSpan={7} className="empty-row">No opportunities detected yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default App
