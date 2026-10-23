// =====================================================================
// AMARKA: ?admin stop
// =====================================================================

const tournament = require('../../../src/games/tournament');

module.exports = async function adminStop(message, args) {
    return tournament.cmdStop(message);
};