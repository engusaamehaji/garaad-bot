const fs   = require('fs');
const path = require('path');

const MARKET_PATH = path.join(__dirname, '../../data/market.json');
const TICK_MS     = 60 * 1000;
const HISTORY_MAX = 10;

// BTC price index — used for prediction display only
const BASE_PRICES = {
    btc: 100,
};

const VOLATILITY = {
    btc: 0.03,
};

const trends = { btc: 0 };

let marketData = {
    prices:     { ...BASE_PRICES },
    previous:   { ...BASE_PRICES },
    history:    { btc: [] },
    lastUpdate: 0,
};

try {
    if (fs.existsSync(MARKET_PATH)) {
        const loaded = JSON.parse(fs.readFileSync(MARKET_PATH, 'utf8'));
        if (loaded && loaded.prices && loaded.prices.btc) {
            marketData = {
                prices:     { btc: loaded.prices.btc },
                previous:   { btc: loaded.previous?.btc   || BASE_PRICES.btc },
                history:    { btc: loaded.history?.btc     || [] },
                lastUpdate: loaded.lastUpdate || 0,
            };
        }
    }
} catch (e) {
    console.error('[Market] Load error:', e.message);
}

function saveMarket() {
    try {
        const dir = path.dirname(MARKET_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(MARKET_PATH, JSON.stringify(marketData, null, 2));
    } catch (e) {
        console.error('[Market] Save error:', e.message);
    }
}

function doOneTick() {
    const prev   = marketData.prices.btc;
    const vol    = VOLATILITY.btc;
    const trend  = trends.btc || 0;
    const bias   = trend * vol * 0.35;
    const change = (Math.random() * 2 - 1) * vol + bias;
    trends.btc   = change > 0 ? 1 : change < 0 ? -1 : 0;
    const next   = Math.min(
        Math.round(BASE_PRICES.btc * 3),
        Math.max(
            Math.round(BASE_PRICES.btc * 0.4),
            Math.round(prev * (1 + change))
        )
    );
    marketData.previous.btc = prev;
    marketData.prices.btc   = next;
    marketData.history.btc  ??= [];
    marketData.history.btc.push(next);
    if (marketData.history.btc.length > HISTORY_MAX) {
        marketData.history.btc.shift();
    }
}

function tickMarket() {
    const now     = Date.now();
    const elapsed = now - marketData.lastUpdate;
    if (elapsed < TICK_MS) return false;

    const ticks = Math.min(60, Math.floor(elapsed / TICK_MS));
    for (let i = 0; i < ticks; i++) doOneTick();

    marketData.lastUpdate = now;
    saveMarket();
    return true;
}

function nextTickSeconds() {
    const elapsed = Date.now() - marketData.lastUpdate;
    return Math.max(0, Math.ceil((TICK_MS - elapsed) / 1000));
}

function getPriceChange(asset) {
    const cur  = marketData.prices[asset];
    const prev = marketData.previous[asset] || cur;
    if (!prev || prev === 0) return 0;
    return ((cur - prev) / prev) * 100;
}

function sparkline(asset) {
    const hist = marketData.history[asset];
    if (!hist || hist.length < 2) return '▄▄▄▄▄';
    const min   = Math.min(...hist);
    const max   = Math.max(...hist);
    const range = max - min || 1;
    const bars  = '▁▂▃▄▅▆▇█';
    return hist.map(v => bars[Math.min(7, Math.floor(((v - min) / range) * 7))]).join('');
}

function getPrice(asset) {
    tickMarket();
    return marketData.prices[asset?.toLowerCase()] ?? null;
}

function getPrices() {
    tickMarket();
    return { ...marketData.prices };
}

function getMarketSnapshot() {
    tickMarket();
    return Object.keys(BASE_PRICES).map(asset => ({
        asset,
        price:  marketData.prices[asset],
        change: getPriceChange(asset),
        spark:  sparkline(asset),
    }));
}

module.exports = { getPrice, getPrices, getMarketSnapshot, nextTickSeconds, BASE_PRICES, tickMarket };
