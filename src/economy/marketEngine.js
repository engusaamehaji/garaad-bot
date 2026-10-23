// =====================================================================
// MARKET ENGINE — Simple UP / DOWN only
// =====================================================================

const STATES = {
    UP:   { baseWin: 0.62, label: 'Up',   icon: '⬆️', desc: 'Suuqa kor u socda', minDur: 30, maxDur: 90 },
    DOWN: { baseWin: 0.35, label: 'Down', icon: '⬇️', desc: 'Suuqa hoos u socda', minDur: 30, maxDur: 90 },
};

const TRANSITIONS = {
    UP:   { DOWN: 1, UP: 1 },
    DOWN: { UP: 1, DOWN: 1 },
};

let currentState   = 'UP';
let stateChangedAt = Date.now();
let _timer         = null;

function pickNextState() {
    const weights = TRANSITIONS[currentState] || TRANSITIONS.UP;
    const total   = Object.values(weights).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (const [state, w] of Object.entries(weights)) {
        rand -= w;
        if (rand <= 0) return state;
    }
    return 'DOWN';
}

function transitionState() {
    const next = pickNextState();
    currentState   = next;
    stateChangedAt = Date.now();
    console.log(`[Market] → ${next} (${STATES[next].label})`);
    saveMarketState();
}

function scheduleTransition() {
    if (_timer) clearTimeout(_timer);
    const s = STATES[currentState] || STATES.UP;
    const delay = (s.minDur + Math.random() * (s.maxDur - s.minDur)) * 1000;
    _timer = setTimeout(() => {
        transitionState();
        scheduleTransition();
    }, delay);
}

function startMarketEngine() {
    scheduleTransition();
    console.log(`[Market] ✅ Engine started — state: ${currentState}`);
}

// ── Persistence ──────────────────────────────────────────────────────

async function saveMarketState() {
    try {
        const { getDB } = require('../db');
        const db = getDB();
        if (!db) return;
        await db.collection('market').updateOne(
            { _id: 'state' },
            { $set: { state: currentState, changedAt: stateChangedAt } },
            { upsert: true }
        );
    } catch (e) { console.error('[Market] Save error:', e.message); }
}

async function loadMarketState() {
    try {
        const { getDB } = require('../db');
        const db = getDB();
        if (!db) return;
        const doc = await db.collection('market').findOne({ _id: 'state' });
        if (doc && doc.state && STATES[doc.state]) {
            currentState   = doc.state;
            stateChangedAt = doc.changedAt || Date.now();
            console.log(`[Market] ✅ Restored state: ${currentState} (${STATES[currentState].label})`);
        } else {
            // reset to UP if old state not valid
            currentState = 'UP';
        }
    } catch (e) { console.error('[Market] Load error:', e.message); }
}

// ── State query ──────────────────────────────────────────────────────

function getMarketState() {
    const s       = STATES[currentState] || STATES.UP;
    const elapsed = Math.floor((Date.now() - stateChangedAt) / 1000);
    return { name: currentState, ...s, elapsed };
}

// ── Per-player modifiers ─────────────────────────────────────────────

function streakModifier(d) {
    const w = d.efStreak     || 0;
    const l = d.efLoseStreak || 0;
    if (w >= 4) return -0.15;
    if (w >= 3) return -0.09;
    if (w >= 2) return -0.04;
    if (l >= 4) return +0.12;
    if (l >= 3) return +0.07;
    if (l >= 2) return +0.03;
    return 0;
}

function recoveryModifier(d) {
    const recent = d.efRecentBets || [];
    if (recent.length < 5) return 0;
    const last10  = recent.slice(-10);
    const lost    = last10.filter(b => !b.win).reduce((s, b) => s + b.amount, 0);
    const wagered = last10.reduce((s, b) => s + b.amount, 0);
    return wagered > 0 && lost / wagered > 0.30 ? +0.08 : 0;
}

function antiFarmModifier(d) {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (d.efDayKey !== dayKey) return 0;
    return (d.efFlipCount || 0) > 50 ? -0.12 : 0;
}

// ── Main outcome calculation ─────────────────────────────────────────

function calculateOutcome(userId, betAmount, direction) {
    const { econData, checkEconUser, getTreasury } = require('./econStore');
    checkEconUser(userId);
    const d = econData[userId];

    // Win Rate: 45% (Fursadda Guusha)
    let win = Math.random() < 0.45;

    // Faa'iidada (PROFIT_RATE = 0.95)
    const profit = Math.floor(betAmount * 0.95);
    const treasury = getTreasury();

    // Haddi khaznada lacagteedu yar tahay, player-ka loss ha qaato
    if (win && (treasury.balance || 0) < profit) {
        win = false;
    }

    // Jihada suuqa: Haddi uu guulaysto ha isla ekaadaan (u -> UP, d -> DOWN)
    // Haddi uu guuldaraysto ha kala duwanaadaan (u -> DOWN, d -> UP)
    let resolvedStateName;
    if (win) {
        resolvedStateName = direction === 'u' ? 'UP' : 'DOWN';
    } else {
        resolvedStateName = direction === 'u' ? 'DOWN' : 'UP';
    }

    return {
        win,
        probability: 0.45,
        stateName:   resolvedStateName,
        stateInfo:   STATES[resolvedStateName] || STATES.UP,
    };
}

function recordFlip(userId, betAmount, win, walletBefore) {
    const { econData, checkEconUser } = require('./econStore');
    checkEconUser(userId);
    const d = econData[userId];

    if (win) { d.efStreak = (d.efStreak || 0) + 1; d.efLoseStreak = 0; }
    else      { d.efLoseStreak = (d.efLoseStreak || 0) + 1; d.efStreak = 0; }

    const dayKey = new Date().toISOString().slice(0, 10);
    if (d.efDayKey !== dayKey) { d.efDayKey = dayKey; d.efFlipCount = 0; }
    d.efFlipCount = (d.efFlipCount || 0) + 1;

    d.efRecentBets = d.efRecentBets || [];
    d.efRecentBets.push({ amount: betAmount, win, ts: Date.now() });
    if (d.efRecentBets.length > 10) d.efRecentBets.shift();
}

module.exports = { getMarketState, calculateOutcome, recordFlip, startMarketEngine, loadMarketState, STATES };
