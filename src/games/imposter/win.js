// =====================================================================
// Imposter — win checker
// =====================================================================

const { isImposter } = require('./roles');
const { alivePlayers } = require('./utils');

/**
 * @returns {'citizens'|'imposters'|null}
 */
function checkWin(game) {
    const alive = alivePlayers(game);
    const imposters = alive.filter(([, player]) => isImposter(player.role));
    const citizens = alive.filter(([, player]) => !isImposter(player.role));

    if (imposters.length === 0) return 'citizens';
    if (imposters.length >= citizens.length) return 'imposters';
    return null;
}

module.exports = { checkWin };
