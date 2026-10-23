// =====================================================================
// Imposter — shared constants & colors
// =====================================================================

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 100;
const TARGETS_PER_PAGE = 20;

const LOBBY_SECONDS = 120;
const NIGHT_SECONDS = 30;
const DAY_SECONDS = 45;
const VOTE_SECONDS = 30;

const COLORS = {
    lobby: 0x3498db,       // Blue
    night: 0x9b59b6,       // Purple
    day: 0xf1c40f,         // Yellow
    voting: 0xf39c12,      // Amber (voting)
    elimination: 0xe74c3c, // Red
    citizensWin: 0x27ae60, // Green
    impostersWin: 0x8b0000,// Dark Red
    neutral: 0x95a5a6,
    starting: 0x2c3e50,
};

module.exports = {
    MIN_PLAYERS,
    MAX_PLAYERS,
    TARGETS_PER_PAGE,
    LOBBY_SECONDS,
    NIGHT_SECONDS,
    DAY_SECONDS,
    VOTE_SECONDS,
    COLORS,
};
