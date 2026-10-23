// =====================================================================
// GARAAD BOT - Xogta Wadaagta (Shared State / Store)
// =====================================================================

const fs   = require('fs');
const path = require('path');

const DATA_PATH        = path.join(__dirname, '..', 'data', 'users.json');
const CONFIG_PATH      = path.join(__dirname, '..', 'data', 'botConfig.json');

let userData = {};

// Channels where bot commands are disabled
const disabledChannels = new Set();

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            (cfg.disabledChannels || []).forEach(id => disabledChannels.add(id));
        }
    } catch (e) {
        console.error('[Config] Khalad akhrinaynta botConfig.json:', e.message);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ disabledChannels: [...disabledChannels] }, null, 2));
    } catch (e) {
        console.error('[Config] Khalad keydintiinta botConfig.json:', e.message);
    }
}

const activeGames      = new Map(); // userId    -> solo game state
const activeDuels      = new Map(); // channelId -> duel state
const activeRush       = new Map(); // userId    -> rush state
const activeQuiz       = new Map(); // channelId -> quiz state

const activeTournament = new Map(); // channelId -> tartan state
/** @type {Map<string, { code: string, at: number }>} */
const tournamentRegistry = new Map(); // userId -> diiwaangeli

// ── Load: MongoDB first, fallback to JSON ──
async function loadData() {
    const { getDB } = require('./db');
    const db = getDB();
    if (db) {
        try {
            const doc = await db.collection('store').findOne({ _id: 'users' });
            if (doc && doc.data) {
                Object.assign(userData, doc.data);
                console.log('[Store] ✅ users.json ka soo degtay MongoDB');
                return;
            }
        } catch (e) {
            console.error('[Store] MongoDB load failed, falling back to JSON:', e.message);
        }
    }
    // Fallback: JSON file
    try {
        if (fs.existsSync(DATA_PATH)) {
            Object.assign(userData, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
        }
    } catch (e) {
        console.error('[Store] Khalad akhrinaynta users.json:', e.message);
    }
}

// ── Save: JSON always + MongoDB if connected ──
function saveData() {
    // Always write local JSON (backup)
    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(userData, null, 2));
    } catch (e) {
        console.error('[Store] Khalad keydintiinta users.json:', e.message);
    }
    // Also save to MongoDB (fire-and-forget)
    const { getDB } = require('./db');
    const db = getDB();
    if (db) {
        db.collection('store')
            .updateOne({ _id: 'users' }, { $set: { data: userData } }, { upsert: true })
            .catch(e => console.error('[Store] MongoDB save error:', e.message));
    }
}

function isUserBusy(userId) {
    if (activeGames.has(userId)) return 'solo';

    for (const state of activeDuels.values()) {
        if (state.p1 === userId || state.p2 === userId) return 'duel';
    }
    for (const state of activeQuiz.values()) {
        if (state.players && state.players.has(userId)) return 'quiz';
    }
    for (const state of activeTournament.values()) {
        if (state.stage === 'play' && state.survivors && state.survivors.has(userId)) return 'tournament';
    }
    // Team duel check (lazy require to avoid circular deps)
    try {
        const { activeTeamDuels } = require('./games/teamDuel');
        for (const state of activeTeamDuels.values()) {
            if (state.phase === 'playing' && ([...state.teams[1], ...state.teams[2]]).includes(userId)) return 'tduel';
        }
    } catch {}
    return null;
}

module.exports = {
    userData,
    loadData,
    saveData,
    loadConfig,
    saveConfig,
    disabledChannels,
    activeGames,
    activeDuels,
    activeRush,
    activeQuiz,
    activeTournament,
    tournamentRegistry,
    isUserBusy,
};
