// =====================================================================
// GARAAD BOT - Shaqooyinka Gargaarka (Helper Functions)
// =====================================================================

const { userData, saveData } = require('../store');
const { LEVEL_STEP, TITLES } = require('../config');

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function checkUser(userId) {
    if (!userData[userId]) {
        userData[userId] = {
            iq: 0,
            xp: 0,
            lastDaily: 0,
            doubleXpUntil: 0,
            title: null,
            stars: 0,
            seenQuestions: {},
            seenByGame: { solo: {}, duel: {}, rush: {}, quiz: {}, bet: {}, tournament: {} },
            lastPlayed: 0,
            lastReminderSent: 0,
            hostQuota: { date: todayKey(), count: 0 },
            ownedTitles: ['beginner'],
            activeTitle: 'beginner',
            customTitle: null,
            inventory: { shield: 0, double: 0, hint: 0, retry: 0 },
            pendingQuizPoints: 0,
            seenSoloIntro: false,
            bank: { balance: 0, transactions: [] },
            stats: {
                soloPlayed: 0, soloCorrect: 0, soloWrong: 0,
                duelWins: 0, duelLosses: 0, duelDraws: 0,
                rushBest: 0,
                quizWins: 0, quizPlayed: 0,
                bugsReported: 0, lootOpened: 0, flipsPlayed: 0, missionsCompleted: 0,
            },
            // ── New fields ──
            ownedFrames:  [],
            activeFrame:  null,
            badges:       [],
            boosters:     { doubleIq: 0, doubleXp: 0, doubleBtc: 0, iqShields: 0 },
            lootBoxes:    { common: 0, rare: 0, legendary: 0 },
            missions:     { date: '', tasks: [], baseline: {} },
            relationship:      { partnerId: null, partnerUsername: null, ringType: null, since: null },
            friends:           [],
            pendingFriendReqs: [],
            pendingProposal:   null,
            ownedRings:        { silver: 0, diamond: 0, royal: 0, somali: 0 },
        };
    } else {
        const d = userData[userId];
        d.iq               ??= 0;
        d.xp               ??= 0;
        d.lastDaily        ??= 0;
        d.doubleXpUntil    ??= 0;
        d.title            ??= null;
        d.stars            ??= 0;
        d.seenQuestions    ??= {};
        d.seenByGame       ??= { solo: {}, duel: {}, rush: {}, quiz: {}, bet: {}, tournament: {} };
        d.seenByGame.solo  ??= {};
        d.seenByGame.duel  ??= {};
        d.seenByGame.rush  ??= {};
        d.seenByGame.quiz  ??= {};
        d.seenByGame.bet   ??= {};
        d.seenByGame.tournament ??= {};
        d.lastPlayed       ??= 0;
        d.lastReminderSent ??= 0;
        d.hostQuota        ??= { date: todayKey(), count: 0 };
        d.ownedTitles      ??= ['beginner'];
        if (d.ownedTitles.length === 0) d.ownedTitles = ['beginner'];
        d.activeTitle      ??= 'beginner';
        if (!d.activeTitle) d.activeTitle = 'beginner';
        d.customTitle      ??= null;
        d.inventory        ??= { shield: 0, double: 0, hint: 0, retry: 0 };
        d.pendingQuizPoints ??= 0;
        d.seenSoloIntro    ??= false;
        d.bank             ??= { balance: 0, transactions: [] };
        d.bank.balance     ??= 0;
        d.bank.transactions ??= [];
        d.stats            ??= {};
        const s = d.stats;
        s.soloPlayed    ??= 0;
        s.soloCorrect   ??= 0;
        s.soloWrong     ??= 0;
        s.duelWins      ??= 0;
        s.duelLosses    ??= 0;
        s.duelDraws     ??= 0;
        s.rushBest      ??= 0;
        s.quizWins      ??= 0;
        s.quizPlayed    ??= 0;
        s.bugsReported  ??= 0;
        s.lootOpened          ??= 0;
        s.flipsPlayed         ??= 0;
        s.missionsCompleted   ??= 0;
        // ── New fields ──
        d.ownedFrames  ??= [];
        d.activeFrame  ??= null;
        d.badges       ??= [];
        d.boosters     ??= {};
        d.boosters.doubleIq  ??= 0;
        d.boosters.doubleXp  ??= 0;
        d.boosters.doubleBtc ??= 0;
        d.boosters.iqShields ??= 0;
        d.lootBoxes    ??= {};
        d.lootBoxes.common    ??= 0;
        d.lootBoxes.rare      ??= 0;
        d.lootBoxes.legendary ??= 0;
        d.missions     ??= { date: '', tasks: [], baseline: {} };
    }
}

function getLevel(iq) {
    return Math.floor((iq || 0) / LEVEL_STEP);
}

function addXp(userId, amount) {
    checkUser(userId);
    const d    = userData[userId];
    const xpMult = (d.doubleXpUntil > Date.now() || (d.boosters && d.boosters.doubleXp > Date.now())) ? 2 : 1;
    d.xp += amount * xpMult;
}

function applyIqChange(userId, delta) {
    checkUser(userId);
    const d = userData[userId];
    if (delta < 0 && d.boosters && d.boosters.iqShields > 0) {
        d.boosters.iqShields--;
        return 0; // absorbed
    }
    const mult = (d.boosters && d.boosters.doubleIq > Date.now()) ? 2 : 1;
    const actual = delta > 0 ? delta * mult : delta;
    d.iq = Math.max(0, (d.iq || 0) + actual);
    return actual;
}

function checkAndAwardBadges(userId) {
    checkUser(userId);
    const d = userData[userId];
    const s = d.stats || {};
    const { econData } = require('../economy/econStore');
    const econ = econData[userId] || {};
    const newBadges = [];

    function award(key) {
        if (!d.badges.includes(key)) { d.badges.push(key); newBadges.push(key); }
    }

    if (s.duelWins >= 1)                       award('first_win');
    if ((d.stats?.rushBest || 0) >= 5)         award('streak_5');
    if ((d.iq || 0) >= 100)                    award('iq_100');
    if ((d.iq || 0) >= 500)                    award('iq_500');
    if ((d.iq || 0) >= 1000)                   award('iq_1000');
    if ((d.iq || 0) >= 3000)                   award('iq_3000');
    if (s.duelWins >= 10)                      award('duel_10');
    if (s.duelWins >= 50)                      award('duel_50');
    if (s.duelWins >= 100)                     award('duel_100');
    if (s.quizPlayed >= 10)                    award('quiz_10');
    if (s.quizWins >= 20)                      award('quiz_champ');
    if ((econ.btc || 0) >= 100_000)            award('rich_100k');
    if ((econ.btc || 0) >= 1_000_000)          award('rich_1m');
    if ((d.iq || 0) >= 7000)                   award('legend_rank');
    if ((d.stats?.lootOpened || 0) >= 10)      award('loot_opener');

    return newBadges;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getDisplayTitle(userId) {
    checkUser(userId);
    const data = userData[userId];
    if (data.customTitle) return data.customTitle;
    if (data.activeTitle) {
        for (const category in TITLES) {
            if (TITLES[category][data.activeTitle]) {
                return TITLES[category][data.activeTitle].name;
            }
        }
    }
    return null;
}

function fmt(n) {
    return Math.round(n || 0).toLocaleString();
}

// Lambarka horeba ka tir (tusaale: "85. Su'aal" → "Su'aal")
function stripQuestionNumber(text) {
    return String(text).replace(/^\d+\.\s*/, '');
}

module.exports = { todayKey, checkUser, getLevel, addXp, applyIqChange, checkAndAwardBadges, shuffleArray, getDisplayTitle, saveData, fmt, stripQuestionNumber };


// ── Display Name Helper ──────────────────────────────────────────────
// Priority: server nickname > global display name > username
async function getDisplayName(client, guild, userId, fallbackUser = null) {
    try {
        const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
        if (member?.displayName) return member.displayName;
        if (member?.nickname) return member.nickname;
        const user = member?.user || fallbackUser || (client?.users ? await client.users.fetch(userId).catch(() => null) : null);
        return user?.globalName || user?.displayName || user?.username || `User ${String(userId).slice(-4)}`;
    } catch {
        return fallbackUser?.globalName || fallbackUser?.displayName || fallbackUser?.username || `User ${String(userId).slice(-4)}`;
    }
}

module.exports.getDisplayName = getDisplayName;
