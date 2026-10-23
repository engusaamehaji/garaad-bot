const fs   = require('fs');
const path = require('path');

const ECON_PATH = path.join(__dirname, '../../data/economy.json');

let econData = {};

function defaultUser() {
    return {
        btc:             1000,
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
        weeklyEarned:    { week: '', btc: 0 },
    };
}

function setEconUsername(userId, username) {
    if (username && econData[userId]) econData[userId].username = username;
}

function checkEconUser(userId) {
    if (!econData[userId]) {
        econData[userId] = defaultUser();
    } else {
        const d = econData[userId];
        d.btc              ??= 1000;
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
        d.weeklyEarned     ??= { week: '', btc: 0 };
        if (!d.weeklyEarned.btc) d.weeklyEarned.btc ??= d.weeklyEarned.usd || 0;
        d.efStreak      ??= 0;
        d.efLoseStreak  ??= 0;
        d.personalBank  ??= null;
        d.efFlipCount   ??= 0;
        d.efProfile     ??= 'balanced';
        d.efRecentBets  ??= [];
    }
    return econData[userId];
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
    econData.__treasury__.totalOut ??= 0;
    return econData.__treasury__;
}

function addToTreasury(amount) {
    if (!amount || amount <= 0) return;
    const t = getTreasury();
    t.balance += amount;
    t.totalIn += amount;
}

function topUpTreasury(amount) {
    if (!amount || amount <= 0) return;
    const t = getTreasury();
    t.balance += amount;
}

function setTreasury(amount) {
    if (amount < 0) return;
    const t = getTreasury();
    t.balance = amount;
}

function deductFromTreasury(amount) {
    const t = getTreasury();
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

function trackEarning(userId, btcAmount) {
    if (!btcAmount || btcAmount <= 0) return;
    const d = econData[userId];
    if (!d) return;
    const week = getWeekKey();
    if (!d.weeklyEarned || d.weeklyEarned.week !== week) {
        d.weeklyEarned = { week, btc: 0 };
    }
    d.weeklyEarned.btc = (d.weeklyEarned.btc || 0) + btcAmount;
}

function resetWeeklyEarnings() {
    const week = getWeekKey();
    for (const uid of Object.keys(econData)) {
        if (econData[uid] && econData[uid].weeklyEarned) {
            econData[uid].weeklyEarned = { week, btc: 0 };
        }
    }
    saveEcon();
}

module.exports = {
    econData,
    loadEcon,
    checkEconUser,
    setEconUsername,
    saveEcon,
    getTreasury,
    addToTreasury,
    topUpTreasury,
    setTreasury,
    deductFromTreasury,
    trackEarning,
    resetWeeklyEarnings,
};
