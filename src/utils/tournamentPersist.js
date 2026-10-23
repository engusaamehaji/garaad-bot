// =====================================================================
// Tournament State Persistence — MongoDB
// Saves/restores tournament state across bot restarts
// =====================================================================

const { getDB } = require('../db');

const COLLECTION = 'tournament_state';

function serializeState(state, registry) {
    return {
        _id:                  state.guildId,
        guildId:              state.guildId,
        announceChannelId:    state.announceChannelId    || null,
        gameChannelId:        state.gameChannelId        || null,
        vcChannelId:          state.vcChannelId          || null,
        adminId:              state.adminId              || null,
        panelChannelId:       state.panelChannelId       || null,
        panelMsgId:           state.panelMsgId           || null,
        announceMsgId:        state.announceMsgId        || null,
        registrationDeadline: state.registrationDeadline || null,
        stage:                state.stage,
        roundIdx:             state.roundIdx             || 0,
        currentQ:             state.currentQ             || 0,
        questionOffset:       state.questionOffset       || 0,
        players:              [...(state.players   || new Set())],
        survivors:            [...(state.survivors || new Set())],
        totalScores:          state.totalScores          || {},
        roundScores:          state.roundScores          || {},
        prevRoundQuestions:   state.prevRoundQuestions   || [],
        _nextSurvivors:       state._nextSurvivors       || null,
        questions:            state.questions            || [],
        registry:             registry ? [...registry.entries()] : [],
        savedAt:              Date.now(),
    };
}

async function saveTournamentState(state, registry) {
    const db = getDB();
    if (!db) return;
    try {
        const doc = serializeState(state, registry);
        await db.collection(COLLECTION).updateOne(
            { _id: doc.guildId },
            { $set: doc },
            { upsert: true }
        );
    } catch (e) {
        console.error('[TournamentPersist] Save error:', e.message);
    }
}

async function loadTournamentStates() {
    const db = getDB();
    if (!db) return [];
    try {
        return await db.collection(COLLECTION).find({}).toArray();
    } catch (e) {
        console.error('[TournamentPersist] Load error:', e.message);
        return [];
    }
}

async function deleteTournamentState(guildId) {
    const db = getDB();
    if (!db) return;
    try {
        await db.collection(COLLECTION).deleteOne({ _id: guildId });
    } catch (e) {
        console.error('[TournamentPersist] Delete error:', e.message);
    }
}

module.exports = { saveTournamentState, loadTournamentStates, deleteTournamentState };
