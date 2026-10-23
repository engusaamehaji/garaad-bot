// =====================================================================
// Game State Persistence — MongoDB
// Collections: game_solo | game_quiz | game_duel
// =====================================================================

const { getDB } = require('../db');

// ─── Solo ─────────────────────────────────────────────────────────────
async function saveSoloState(userId, game) {
    const db = getDB();
    if (!db) return;
    try {
        await db.collection('game_solo').updateOne(
            { _id: userId },
            { $set: {
                _id:           userId,
                userId,
                channelId:     game.channelId     || null,
                questions:     game.questions      || [],
                total:         game.total          || 0,
                currentQ:      game.currentQ       || 1,
                totalPoints:   game.totalPoints    || 0,
                correctCount:  game.correctCount   || 0,
                bestStreak:    game.bestStreak     || 0,
                currentStreak: game.currentStreak  || 0,
                savedAt:       Date.now(),
            }},
            { upsert: true }
        );
    } catch (e) { console.error('[GamePersist] Solo save error:', e.message); }
}

async function loadSoloState(userId) {
    const db = getDB();
    if (!db) return null;
    try { return await db.collection('game_solo').findOne({ _id: userId }); }
    catch (e) { console.error('[GamePersist] Solo load error:', e.message); return null; }
}

async function loadAllSoloStates() {
    const db = getDB();
    if (!db) return [];
    try { return await db.collection('game_solo').find({}).toArray(); }
    catch (e) { console.error('[GamePersist] Solo loadAll error:', e.message); return []; }
}

async function deleteSoloState(userId) {
    const db = getDB();
    if (!db) return;
    try { await db.collection('game_solo').deleteOne({ _id: userId }); }
    catch (e) { console.error('[GamePersist] Solo delete error:', e.message); }
}

// ─── Quiz ─────────────────────────────────────────────────────────────
async function saveQuizState(channelId, state) {
    const db = getDB();
    if (!db) return;
    try {
        await db.collection('game_quiz').updateOne(
            { _id: channelId },
            { $set: {
                _id:           channelId,
                channelId,
                hostId:        state.hostId        || null,
                questionCount: state.questionCount  || 0,
                players:       [...(state.players   || [])],
                scores:        state.scores         || {},
                questions:     state.questions       || [],
                currentQ:      state.currentQ        || 0,
                savedAt:       Date.now(),
            }},
            { upsert: true }
        );
    } catch (e) { console.error('[GamePersist] Quiz save error:', e.message); }
}

async function loadAllQuizStates() {
    const db = getDB();
    if (!db) return [];
    try { return await db.collection('game_quiz').find({}).toArray(); }
    catch (e) { console.error('[GamePersist] Quiz loadAll error:', e.message); return []; }
}

async function deleteQuizState(channelId) {
    const db = getDB();
    if (!db) return;
    try { await db.collection('game_quiz').deleteOne({ _id: channelId }); }
    catch (e) { console.error('[GamePersist] Quiz delete error:', e.message); }
}

// ─── Duel ─────────────────────────────────────────────────────────────
async function saveDuelState(channelId, state) {
    const db = getDB();
    if (!db) return;
    try {
        await db.collection('game_duel').updateOne(
            { _id: channelId },
            { $set: {
                _id:         channelId,
                channelId,
                p1:          state.p1,
                p2:          state.p2,
                questions:   state.questions   || [],
                totalQ:      state.totalQ      || 0,
                scores:      state.scores      || {},
                currentQ:    state.currentQ    || 0,
                stakesTaken: state.stakesTaken || false,
                savedAt:     Date.now(),
            }},
            { upsert: true }
        );
    } catch (e) { console.error('[GamePersist] Duel save error:', e.message); }
}

async function loadAllDuelStates() {
    const db = getDB();
    if (!db) return [];
    try { return await db.collection('game_duel').find({}).toArray(); }
    catch (e) { console.error('[GamePersist] Duel loadAll error:', e.message); return []; }
}

async function deleteDuelState(channelId) {
    const db = getDB();
    if (!db) return;
    try { await db.collection('game_duel').deleteOne({ _id: channelId }); }
    catch (e) { console.error('[GamePersist] Duel delete error:', e.message); }
}

module.exports = {
    saveSoloState, loadSoloState, loadAllSoloStates, deleteSoloState,
    saveQuizState, loadAllQuizStates, deleteQuizState,
    saveDuelState, loadAllDuelStates, deleteDuelState,
};
