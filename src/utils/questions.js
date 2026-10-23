// =====================================================================
// GARAAD BOT - Maareynta Su'aalaha
// • Per-game pools (solo.json, duel.json, quiz.json, tournament.json)
// • Global text-based dedup per user (su'aal mar la arkay marna laguma soo celin)
// =====================================================================

const fs   = require('fs');
const path = require('path');
const { EmbedBuilder }            = require('discord.js');
const { userData, saveData }      = require('../store');
const { checkUser, shuffleArray } = require('./helpers');
const { TWO_WEEKS_MS, PREFIX }    = require('../config');

const QUESTIONS_DIR = path.join(__dirname, '..', '..', 'data', 'questions');
const CACHE_QUESTIONS_DIR = path.join(__dirname, '..', '..', 'data', 'cache', 'questions');
const GAMES = ['solo', 'duel', 'quiz', 'tournament', 'team'];
const questionsByGame = {};

function loadQuestionsFromDisk() {
    for (const game of GAMES) {
        try {
            const cacheFile = path.join(CACHE_QUESTIONS_DIR, `${game}.json`);
            if (fs.existsSync(cacheFile)) {
                questionsByGame[game] = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            } else {
                const file = path.join(QUESTIONS_DIR, `${game}.json`);
                questionsByGame[game] = JSON.parse(fs.readFileSync(file, 'utf8'));
            }
        } catch (e) {
            console.warn(`[Questions] Faylka ${game}.json lama helin — poolka madhan yahay`);
            questionsByGame[game] = [];
        }
    }
}

loadQuestionsFromDisk();

function reloadQuestions() {
    loadQuestionsFromDisk();
    try {
        const qc = require('../../data/commands/qc');
        if (typeof qc.invalidatePoolCache === 'function') qc.invalidatePoolCache();
    } catch { /* qc optional */ }
    const counts = GAMES.map(g => `${g}:${(questionsByGame[g] || []).length}`).join(', ');
    console.log(`[Questions] ✅ Reloaded — ${counts}`);
    return questionsByGame;
}

function getQuestionCounts() {
    const out = {};
    for (const g of GAMES) out[g] = (questionsByGame[g] || []).length;
    return out;
}

// ─────────────────────────────────────────────────────────────────────
// PER-GAME SEEN INDEX (la haystaa kuwii hore)
// ─────────────────────────────────────────────────────────────────────
function getSeenForGame(userId, game) {
    checkUser(userId);
    if (!userData[userId].seenByGame[game]) userData[userId].seenByGame[game] = {};
    return userData[userId].seenByGame[game];
}

function cleanExpiredSeenForGame(userId, game) {
    const seen = getSeenForGame(userId, game);
    const now  = Date.now();
    for (const idx of Object.keys(seen)) {
        if (now - seen[idx] >= TWO_WEEKS_MS) delete seen[idx];
    }
}

// ─────────────────────────────────────────────────────────────────────
// ⭐ GLOBAL SEEN BY TEXT
// ─────────────────────────────────────────────────────────────────────
function getSeenTexts(userId) {
    checkUser(userId);
    if (!userData[userId].seenTexts) userData[userId].seenTexts = {};
    return userData[userId].seenTexts;
}

function cleanExpiredSeenTexts(userId) {
    const seen = getSeenTexts(userId);
    const now  = Date.now();
    for (const txt of Object.keys(seen)) {
        if (now - seen[txt] >= TWO_WEEKS_MS) delete seen[txt];
    }
}

// ─────────────────────────────────────────────────────────────────────
// Dib u cusboonaysii su'aalaha la arkay (replay mode)
// ─────────────────────────────────────────────────────────────────────
function resetSeenForGame(userId, game, replayFlag) {
    checkUser(userId);
    const d = userData[userId];
    if (d.seenByGame && d.seenByGame[game]) d.seenByGame[game] = {};

    const pool     = questionsByGame[game] || [];
    const poolTexts = new Set(pool.map(q => q.question));
    if (d.seenTexts) {
        for (const txt of Object.keys(d.seenTexts)) {
            if (poolTexts.has(txt)) delete d.seenTexts[txt];
        }
    }

    if (replayFlag) d[replayFlag] = true;
    saveData();
}

function resetSeenSoloQuestions(userId)  { resetSeenForGame(userId, 'solo',  'soloReplaying'); }
function resetSeenQuizQuestions(userId) { resetSeenForGame(userId, 'quiz',  'quizReplaying'); }
function resetSeenDuelQuestions(userId) { resetSeenForGame(userId, 'duel', 'duelReplaying'); }

function clearReplayFlag(userId, flag) {
    checkUser(userId);
    userData[userId][flag] = false;
    saveData();
}

// ─────────────────────────────────────────────────────────────────────
// Dooro su'aalo aan WELIGOOD la arkin (per-game + global text)
// Su'aal la arkay weligeed dib looma soo celin
// ─────────────────────────────────────────────────────────────────────
function pickQuestionsForGame(userId, game, count) {
    const pool        = questionsByGame[game] || [];
    const seenIdx     = getSeenForGame(userId, game);
    const seenTxt     = getSeenTexts(userId);
    const unseenIdx   = [];
    const pickedTxts  = new Set();

    for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (i in seenIdx)                continue;
        if (q.question in seenTxt)       continue;
        if (pickedTxts.has(q.question))  continue;
        pickedTxts.add(q.question);
        unseenIdx.push(i);
    }

    if (unseenIdx.length === 0) return null;

    return shuffleArray(unseenIdx)
        .slice(0, count)
        .map(i => ({ ...pool[i], _idx: i, _game: game }));
}

function pickQuestionsForUsers(userIds, game, count) {
    const pool = questionsByGame[game] || [];

    const combinedSeenIdx = new Set();
    const combinedSeenTxt = new Set();
    for (const uid of userIds) {
        const seenIdx = getSeenForGame(uid, game);
        const seenTxt = getSeenTexts(uid);
        for (const idx of Object.keys(seenIdx)) combinedSeenIdx.add(Number(idx));
        for (const txt of Object.keys(seenTxt))  combinedSeenTxt.add(txt);
    }

    const unseenIdx  = [];
    const pickedTxts = new Set();

    for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (combinedSeenIdx.has(i))           continue;
        if (combinedSeenTxt.has(q.question))  continue;
        if (pickedTxts.has(q.question))        continue;
        pickedTxts.add(q.question);
        unseenIdx.push(i);
    }

    if (unseenIdx.length === 0) return null;

    return shuffleArray(unseenIdx)
        .slice(0, count)
        .map(i => ({ ...pool[i], _idx: i, _game: game }));
}

function markSeenForGame(userId, game, idx) {
    if (idx === undefined || idx === null) return;
    const seen = getSeenForGame(userId, game);
    seen[idx]  = Date.now();

    const pool = questionsByGame[game] || [];
    const q    = pool[idx];
    if (q && q.question) {
        const seenTxt = getSeenTexts(userId);
        seenTxt[q.question] = Date.now();
    }
}

function markSeenForUsersInGame(userIds, game, idx) {
    for (const uid of userIds) markSeenForGame(uid, game, idx);
}

function noQuestionsLeftEmbed(username) {
    return new EmbedBuilder()
        .setTitle("📚 Su'aalihii waa dhammaadeen")
        .setDescription(
            `**${username}**, su'aalaha aad u baahnayd waad dhameystay.\n\n` +
            `🔄 **Dib u ciyaar:** Qor \`${PREFIX}quiz 10\` ama \`${PREFIX}solo 10\` — si toos ah ayaa dib loo bilaabayaa!\n` +
            `💰 Dib-u-ciyaarta: **BTC yar** ayaad heshaa (IQ ma heli doontid).\n\n` +
            `🎮 Weli waxaad ciyaari kartaa:\n` +
            `• \`${PREFIX}duel @ciyaaryahan\` — tartan labo qof ah\n` +
            `• \`${PREFIX}today\` — abaalmarinta maalinlaha ah`
        )
        .setColor('#95a5a6');
}

// ───── BACKWARD COMPAT (legacy API) ─────
const pickUnseenQuestions = (userId, count) => pickQuestionsForGame(userId, 'solo', count);
const pickUnseenForGroup  = (hostId, count) => pickQuestionsForGame(hostId, 'quiz', count);
const markSeen            = (userId, idx)   => markSeenForGame(userId, 'solo', idx);
const markSeenForUsers    = (userIds, idx)  => markSeenForUsersInGame(userIds, 'quiz', idx);

function getAllQuestionsForGame(game) {
    return questionsByGame[game] || [];
}

module.exports = {
    pickQuestionsForGame,
    pickQuestionsForUsers,
    markSeenForGame,
    markSeenForUsersInGame,
    pickUnseenQuestions,
    pickUnseenForGroup,
    markSeen,
    markSeenForUsers,
    noQuestionsLeftEmbed,
    getAllQuestionsForGame,
    reloadQuestions,
    getQuestionCounts,
    resetSeenSoloQuestions,
    resetSeenQuizQuestions,
    resetSeenDuelQuestions,
    clearReplayFlag,
};
