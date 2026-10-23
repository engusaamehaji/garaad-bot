// =====================================================================
// GARAAD BOT - Habaynta Guud (Config)
// =====================================================================

module.exports = {
    PREFIX: '?',

    // Channel economy commands kaliya ku shaqeeyaan (non-admins redirect)
    SAVER_CHANNEL_ID: process.env.SAVER_CHANNEL_ID || '1483269768873246794',

    // ───── Waqtiyo (Milliseconds) ─────
    TWO_WEEKS_MS:    14 * 24 * 60 * 60 * 1000,
    GLOBAL_WAIT_MS:  18000,
    QUIZ_QTIME_MS:   14000,
    QUIZ_LOBBY_MS:   3 * 60 * 1000,
    REMINDER_HOURS:  24,

    // ───── Xadduudaha ciyaarta ─────
    HOST_DAILY_LIMIT:    5,
    QUIZ_QUESTION_COUNT: 10,
    QUIZ_MIN_QUESTIONS:  3,
    QUIZ_MAX_QUESTIONS:  25,
    QUIZ_MIN_PLAYERS:    3,
    QUIZ_MAX_PLAYERS:    100,
    LEVEL_STEP:          30,

    /** 1 dhibic tartan = inta XP ee la siiyo marka la badalo */
    QUIZ_POINTS_TO_XP: 5,
    /** Inta dhibcood ee 1 IQ loogu baahdo (90 dhibcood = 1 IQ) */
    QUIZ_POINTS_PER_IQ: 90,
    /** Dib-u-ciyaar: 90 dhibcood = inta BTC ee la siiyo (halkii IQ) */
    QUIZ_REPLAY_BTC_PER_IQ: 25,

    SOLO_MIN_QUESTIONS:     3,
    SOLO_MAX_QUESTIONS:     25,
    SOLO_DEFAULT_QUESTIONS: 25,

    DUEL_MIN_QUESTIONS:     3,
    DUEL_MAX_QUESTIONS:     15,
    DUEL_DEFAULT_QUESTIONS: 15,

    /** Duel: mid kasta wuxuu dhigaa IQ intaan ka hor inta aan la bilaabin */
    DUEL_STAKE_IQ: 5,
    /** Duel: guuleystaha wuxuu helayaa IQ inta badan (ka dib marka la dhigo dhig) */
    DUEL_WIN_IQ: 10,

    // ── TARTAN (Tournament) ── Wareeg 1=25, Wareeg 2=20, Final=15 ──
    TOURNAMENT_MIN_PLAYERS:      2,
    TOURNAMENT_R1_QUESTIONS:     25,
    TOURNAMENT_R2_QUESTIONS:     20,
    TOURNAMENT_FINAL_QUESTIONS:  15,

    // ── Solo Dhibco (Time-based) ──
    SOLO_MAX_SCORE:  40,
    SOLO_MIN_SCORE:  5,
    SOLO_FAST_MS:    5000,

    // ── Streak Bonus ──
    STREAK_BONUS_2:  1,
    STREAK_BONUS_5:  2,
    STREAK_BONUS_10: 4,

    REWARDS: {
        daily: { iq: 5, xp: 100 },
    },

    /** Dukaanka: kaliya cinwaanada (XP) */
    SHOP_ITEMS: {},

    /** Cinwaanada lagu muujiyo ?shop / ?buy */
    SHOP_TITLE_KEYS: [
        'aqoonyahan',
        'macalin',
        'halyey',
        'king',
        'queen',
        'boss',
        'custom',
    ],

    TITLES: {
        general: {
            beginner: { name: 'Bilow', price: 0, desc: 'Cinwaanka bilowga ah' },
        },
        male: {
            aqoonyahan: { name: 'Aqoon-yahan', price: 400, desc: 'Heerka bilowga ciyaaryahan aqoon leh.' },
            macalin:    { name: 'Macalin',     price: 600, desc: 'Ciyaaryahan khibrad iyo xirfad sare leh.' },
            halyey:     { name: 'Halyey',      price: 900, desc: 'Qof si weyn uga dhex muuqda tartamada.' },
        },
        female: {
            aqoonyahanad: { name: 'Aqoon-yahan', price: 400, desc: 'Heerka bilowga ciyaaryahan aqoon leh.' },
            macalimad:    { name: 'Macalin',     price: 600, desc: 'Ciyaaryahan khibrad iyo xirfad sare leh.' },
            halyeeyad:    { name: 'Halyey',      price: 900, desc: 'Qof si weyn uga dhex muuqda tartamada.' },
        },
        premium: {
            king:     { name: 'King 👑',     price: 1000, desc: 'Boqorka tartanka Garaad Quiz.' },
            queen:    { name: 'Queen 👑',    price: 1000, desc: 'Boqoradda tartanka Garaad Quiz.' },
            boss:     { name: 'Boss 💼',     price: 1200, desc: 'Darajada ugu sarreysa ee maamulka iyo awoodda dhibcaha.' },
            champion: { name: 'Champion 🏆', price: 0,    desc: 'Kaliya admin / tartan' },
        },
        custom: {
            custom: { name: 'Custom Title ✍️', price: 3000, desc: 'Sameyso darajo kuu gaar ah oo magacaaga wata.' },
        },
        legacy: {
            student: { name: 'Student', price: 0, desc: 'Cinwaan hore' },
            expert:  { name: 'Expert',  price: 0, desc: 'Cinwaan hore' },
            master:  { name: 'Master',  price: 0, desc: 'Cinwaan hore' },
            legend:  { name: 'Legend',  price: 0, desc: 'Cinwaan hore' },
            garaad:  { name: 'Garaad',  price: 0, desc: 'Cinwaan hore' },
            garaadad:{ name: 'Garaadad',price: 0, desc: 'Cinwaan hore' },
        },
    },
};
