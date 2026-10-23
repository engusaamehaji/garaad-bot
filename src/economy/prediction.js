const fs   = require('fs');
const path = require('path');
const { getPrice }  = require('./market');
const { econData, checkEconUser, saveEcon, trackEarning, addToTreasury, deductFromTreasury } = require('./econStore');

const PRED_PATH = path.join(__dirname, '../../data/predictions.json');

const pendingSetup      = new Map();
const activePredictions = new Map();

const WIN_MULTI  = 1.8; // win = stake back + 80% profit
const LOSE_MULTI = 0;   // lose entire stake

const ASSET_LABEL = { btc: '₿ BTC' };

function savePredictions() {
    try {
        const obj = {};
        for (const [uid, pred] of activePredictions) obj[uid] = pred;
        const dir = path.dirname(PRED_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PRED_PATH, JSON.stringify(obj, null, 2));
    } catch (e) {
        console.error('[Predictions] Save error:', e.message);
    }
}

function restorePredictions(client) {
    try {
        if (!fs.existsSync(PRED_PATH)) return;
        const obj = JSON.parse(fs.readFileSync(PRED_PATH, 'utf8'));
        let count = 0;
        for (const [uid, pred] of Object.entries(obj)) {
            activePredictions.set(uid, pred);
            const remaining = pred.endTime - Date.now();
            if (remaining <= 0) {
                setImmediate(() => resolvePrediction(uid, client));
            } else {
                setTimeout(() => resolvePrediction(uid, client), remaining);
            }
            count++;
        }
        if (count > 0) console.log(`[Predictions] ${count} prediction(s) restored`);
    } catch (e) {
        console.error('[Predictions] Restore error:', e.message);
    }
}

function setPending(userId, patch) {
    const cur = pendingSetup.get(userId) || {};
    pendingSetup.set(userId, { ...cur, ...patch });
}

function getPending(userId)   { return pendingSetup.get(userId) || null; }
function clearPending(userId) { pendingSetup.delete(userId); }

function hasPrediction(userId)       { return activePredictions.has(userId); }
function getActivePrediction(userId) { return activePredictions.get(userId) || null; }

async function lockPrediction(userId, client) {
    const pend = getPending(userId);
    if (!pend)                 return { ok: false, msg: '⚠️ No setup found — start over.' };
    if (hasPrediction(userId)) return { ok: false, msg: '⚠️ You already have an active prediction. Wait for it to resolve.' };

    const { stakeAmount, minutes, direction, channelId, messageId } = pend;
    if (!stakeAmount || !minutes || !direction) {
        return { ok: false, msg: '⚠️ Incomplete setup — start over.' };
    }

    checkEconUser(userId);
    const d = econData[userId];

    if ((d.btc || 0) < stakeAmount)
        return { ok: false, msg: `⚠️ Not enough BTC. Wallet: **${(d.btc || 0).toLocaleString()} BTC**` };

    d.btc = (d.btc || 0) - stakeAmount;
    saveEcon();

    const entryPrice = getPrice('btc');
    if (!entryPrice) return { ok: false, msg: '⚠️ Market price la heli waayo — daqiiqad yar ka dib isku day.' };
    const endTime    = Date.now() + minutes * 60 * 1000;

    const pred = {
        userId,
        asset:       'btc',
        stakeType:   'btc',
        stakeAmount,
        stakeUsd:    stakeAmount,
        minutes,
        direction,
        endTime,
        entryPrice,
        channelId,
        messageId,
    };
    activePredictions.set(userId, pred);
    clearPending(userId);
    savePredictions();

    setTimeout(() => resolvePrediction(userId, client), minutes * 60 * 1000);
    return { ok: true };
}

async function resolvePrediction(userId, client) {
    const pred = activePredictions.get(userId);
    if (!pred) return;

    const exitPrice   = getPrice('btc');
    const priceWentUp = exitPrice > pred.entryPrice;
    const priceEqual  = exitPrice === pred.entryPrice;

    let win = false, isDraw = false;
    if (priceEqual) {
        isDraw = true;
    } else {
        win = (pred.direction === 'up' && priceWentUp) || (pred.direction === 'down' && !priceWentUp);
    }

    const payout = isDraw
        ? pred.stakeUsd
        : win
            ? Math.floor(pred.stakeUsd * WIN_MULTI)
            : Math.floor(pred.stakeUsd * LOSE_MULTI);

    checkEconUser(userId);
    const d = econData[userId];
    d.btc = (d.btc || 0) + payout;

    if (isDraw) {
        // full refund, no treasury movement
    } else if (win) {
        const profit = payout - pred.stakeUsd;
        deductFromTreasury(profit);
        trackEarning(userId, profit);
    } else {
        addToTreasury(pred.stakeUsd); // entire stake goes to treasury
    }
    saveEcon();
    activePredictions.delete(userId);
    savePredictions();

    const pctChange = ((exitPrice - pred.entryPrice) / pred.entryPrice * 100).toFixed(2);
    const dirLabel  = pred.direction === 'up' ? '⬆️ UP' : '⬇️ DOWN';
    const profit    = payout - pred.stakeUsd;
    const fmt       = n => Math.round(n).toLocaleString();
    const pctStr    = (parseFloat(pctChange) > 0 ? '+' : '') + pctChange + '%';

    const { EmbedBuilder } = require('discord.js');

    const returnedLine = isDraw
        ? `↩️ Returned: **${fmt(payout)} BTC** _(draw — full refund)_`
        : win
        ? `✅ Returned: **${fmt(payout)} BTC** _(+${fmt(profit)} BTC profit)_`
        : `❌ Returned: **0 BTC** _(−${fmt(pred.stakeUsd)} BTC loss)_`;

    const resultEmbed = new EmbedBuilder()
        .setTitle(isDraw ? '🤝 Prediction — DRAW' : win ? '✅ Prediction — WIN' : '❌ Prediction — LOSS')
        .setColor(isDraw ? '#f1c40f' : win ? '#2ecc71' : '#e74c3c')
        .setDescription(
            `🎯 Direction: **${dirLabel}**\n` +
            `📊 Entry price: **${fmt(pred.entryPrice)} BTC**\n` +
            `📊 Exit price: **${fmt(exitPrice)} BTC** (${pctStr})\n\n` +
            `💰 Invested: **${fmt(pred.stakeUsd)} BTC**\n` +
            `${returnedLine}\n\n` +
            `₿ Wallet: **${fmt(d.btc || 0)} BTC**`
        )
        .setFooter({ text: 'Garaad Predict • ?trade to play again' });

    // Send result to channel as a reply/mention — no DM
    if (client && pred.channelId) {
        try {
            const ch = await client.channels.fetch(pred.channelId).catch(() => null);
            if (ch) {
                await ch.send({ content: `<@${userId}>`, embeds: [resultEmbed] }).catch(() => {});
            }
        } catch {}
    }
}

module.exports = {
    pendingSetup,
    activePredictions,
    WIN_MULTI,
    LOSE_MULTI,
    ASSET_LABEL,
    setPending,
    getPending,
    clearPending,
    hasPrediction,
    getActivePrediction,
    lockPrediction,
    resolvePrediction,
    restorePredictions,
};
