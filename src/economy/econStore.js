const fs   = require('fs');
const path = require('path');

const ECON_PATH = path.join(__dirname, '../../data/economy.json');

let econData = {};

function normalizeCoinData(userData) {
    if (!userData || typeof userData !== 'object') return;
    if (userData.coins == null && userData.btc != null) userData.coins = userData.btc;
    delete userData.btc;
    userData.coins ??= 1000;
    userData.weeklyEarned ??= { week: '', coins: 0 };
    if (userData.weeklyEarned.coins == null && userData.weeklyEarned.btc != null)
        userData.weeklyEarned.coins = userData.weeklyEarned.btc;
    delete userData.weeklyEarned.btc;
    userData.weeklyEarned.coins ??= userData.weeklyEarned.usd || 0;
    delete userData.weeklyEarned.usd;

    if (userData.dailyGiven && typeof userData.dailyGiven === 'object') {
        if (userData.dailyGiven.coins == null && userData.dailyGiven.btc != null)
            userData.dailyGiven.coins = userData.dailyGiven.btc;
        delete userData.dailyGiven.btc;
        userData.dailyGiven.coins ??= userData.dailyGiven.usd || 0;
        delete userData.dailyGiven.usd;
    }
}

function normalizeEconomyCoinData() {
    for (const [userId, userData] of Object.entries(econData)) {
        if (/^\d{17,19}$/.test(userId)) normalizeCoinData(userData);
    }
}

function defaultUser() {
    const userData = {
        coins:           1000,
        banks:           { garaad: 0 },
        lastDaily:       0,
        lastInterest:    0,
        streak:          0,
        inventory:       {},
        lastWork:        0,
        interestEarned:  { garaad: 0 },
        loan:            null,
        lastLoanTaken:   0,
        lastRob:         0,
        lastRobTargets:  {},
        econTitles:      [],
        activeEconTitle: null,
        customEconTitle: null,
        weeklyEarned:    { week: '', coins: 0 },
    };
    normalizeCoinData(userData);
    return userData;
}

function setEconUsername(userId, username) {
    if (username && econData[userId]) econData[userId].username = username;
}

function checkEconUser(userId) {
    if (!econData[userId]) {
        econData[userId] = defaultUser();
    } else {
        const d = econData[userId];
        normalizeCoinData(d);
        d.coins            ??= 1000;
        d.banks            ??= { garaad: 0 };
        d.banks.garaad     ??= 0;
        d.lastDaily        ??= 0;
        d.lastInterest     ??= 0;
        d.inventory        ??= {};
        d.streak           ??= 0;
        d.lastWork         ??= 0;
        d.lastRob          ??= 0;
        d.lastRobTargets   ??= {};
        d.interestEarned   ??= { garaad: 0 };
        d.interestEarned.garaad ??= 0;
        if (d.loan === undefined)            d.loan            = null;
        d.lastLoanTaken    ??= 0;
        if (d.econTitles === undefined)      d.econTitles      = [];
        if (d.activeEconTitle === undefined) d.activeEconTitle = null;
        if (d.customEconTitle === undefined) d.customEconTitle = null;
        d.weeklyEarned     ??= { week: '', coins: 0 };
        d.weeklyEarned.coins ??= d.weeklyEarned.usd || 0;
        delete d.weeklyEarned.usd;
        d.dailyGiven ??= { date: '', coins: 0 };
        d.dailyGiven.coins ??= d.dailyGiven.usd || 0;
        delete d.dailyGiven.usd;
        d.efStreak      ??= 0;
        d.efLoseStreak  ??= 0;
        d.personalBank  ??= null;
        d.efFlipCount   ??= 0;
        d.efProfile     ??= 'balanced';
        d.efRecentBets  ??= [];
    }
    return econData[userId];
}

function getSpendableCoins(userId) {
    const user = checkEconUser(userId);
    const wallet = Math.max(0, Math.floor(Number(user.coins) || 0));
    const garaadBank = Math.max(0, Math.floor(Number(user.banks?.garaad) || 0));
    return wallet + garaadBank;
}

function spendCoins(userId, amount) {
    const cost = Math.floor(Number(amount));
    if (!Number.isSafeInteger(cost) || cost <= 0) return false;

    const user = checkEconUser(userId);
    if (getSpendableCoins(userId) < cost) return false;

    const fromWallet = Math.min(Math.max(0, Math.floor(Number(user.coins) || 0)), cost);
    const fromBank = cost - fromWallet;
    user.coins = (Number(user.coins) || 0) - fromWallet;
    user.banks.garaad = (Number(user.banks.garaad) || 0) - fromBank;
    return true;
}

function purgeInvalidKeys(data) {
    for (const k of Object.keys(data)) {
        if (k !== '__treasury__' && !/^\d{17,19}$/.test(k)) delete data[k];
    }
}

// ── Load: MongoDB first, fallback to JSON ──
async function loadEcon() {
    const { getDB } = require('../db');
    const db = getDB();
    if (db) {
        try {
            const doc = await db.collection('store').findOne({ _id: 'economy' });
            if (doc && doc.data) {
                Object.assign(econData, doc.data);
                purgeInvalidKeys(econData);
                normalizeEconomyCoinData();
                saveEcon();
                console.log('[EconStore] ✅ economy.json ka soo degtay MongoDB');
                return;
            }
        } catch (e) {
            console.error('[EconStore] MongoDB load failed, falling back to JSON:', e.message);
        }
    }
    // Fallback: JSON file
    try {
        if (fs.existsSync(ECON_PATH)) {
            Object.assign(econData, JSON.parse(fs.readFileSync(ECON_PATH, 'utf8')));
            purgeInvalidKeys(econData);
            normalizeEconomyCoinData();
            saveEcon();
        }
    } catch (e) {
        console.error('[EconStore] Load error:', e.message);
    }
}

// ── Save: JSON always + MongoDB if connected ──
function saveEcon() {
    // Always write local JSON (backup)
    try {
        const dir = path.dirname(ECON_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(ECON_PATH, JSON.stringify(econData, null, 2));
    } catch (e) {
        console.error('[EconStore] Save error:', e.message);
    }
    // Also save to MongoDB (fire-and-forget)
    const { getDB } = require('../db');
    const db = getDB();
    if (db) {
        db.collection('store')
            .updateOne({ _id: 'economy' }, { $set: { data: econData } }, { upsert: true })
            .catch(e => console.error('[EconStore] MongoDB save error:', e.message));
    }
}

function getTreasury() {
    econData.__treasury__ ??= { balance: 0, totalIn: 0, totalOut: 0 };
    econData.__treasury__.balance  ??= 0;
    econData.__treasury__.totalIn  ??= 0;
    if (!Number.isFinite(econData.__treasury__.totalOut) ||
        (econData.__treasury__.totalOut === 0 && econData.__treasury__.totalIn > econData.__treasury__.balance)) {
        econData.__treasury__.totalOut = Math.max(0, econData.__treasury__.totalIn - econData.__treasury__.balance);
    }
    return econData.__treasury__;
}

function addToTreasury(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const t = getTreasury();
    t.balance += amount;
    t.totalIn += amount;
}

function topUpTreasury(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const t = getTreasury();
    t.balance += amount;
    t.totalIn += amount;
}

function setTreasury(amount) {
    if (!Number.isFinite(amount) || amount < 0) return;
    const t = getTreasury();
    t.balance = amount;
}

function deductFromTreasury(amount) {
    const t = getTreasury();
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (t.balance < amount) return false;
    t.balance  -= amount;
    t.totalOut += amount;
    return true;
}

function getWeekKey() {
    const d    = new Date();
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
}

function trackEarning(userId, coinsAmount) {
    if (!Number.isFinite(coinsAmount) || coinsAmount <= 0) return;
    const d = econData[userId];
    if (!d) return;
    const week = getWeekKey();
    if (!d.weeklyEarned || d.weeklyEarned.week !== week) {
        d.weeklyEarned = { week, coins: 0 };
    }
    d.weeklyEarned.coins = (d.weeklyEarned.coins || 0) + coinsAmount;
}

const DAILY_COIN_TRANSFER_LIMIT = 5_000;

function recordDailyCoinTransfer(userId, amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, remaining: 0 };
    const d = econData[userId];
    if (!d) return { ok: false, remaining: 0 };
    const today = new Date().toISOString().slice(0, 10);
    d.dailyGiven ??= { date: today, coins: 0 };
    d.dailyGiven.coins ??= d.dailyGiven.usd || 0;
    if (d.dailyGiven.date !== today) d.dailyGiven = { date: today, coins: 0 };
    const remaining = Math.max(0, DAILY_COIN_TRANSFER_LIMIT - d.dailyGiven.coins);
    if (amount > remaining) return { ok: false, remaining };
    d.dailyGiven.coins += amount;
    delete d.dailyGiven.usd;
    return { ok: true, remaining: remaining - amount };
}

function resetWeeklyEarnings() {
    const week = getWeekKey();
    for (const uid of Object.keys(econData)) {
        if (econData[uid] && econData[uid].weeklyEarned) {
            econData[uid].weeklyEarned = { week, coins: 0 };
        }
    }
    saveEcon();
}

module.exports = {
    econData,
    loadEcon,
    checkEconUser,
    getSpendableCoins,
    spendCoins,
    setEconUsername,
    saveEcon,
    getTreasury,
    addToTreasury,
    topUpTreasury,
    setTreasury,
    deductFromTreasury,
    trackEarning,
    DAILY_COIN_TRANSFER_LIMIT,
    recordDailyCoinTransfer,
    resetWeeklyEarnings,
};
