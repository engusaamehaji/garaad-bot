// =====================================================================
// Imposter — day phase
// =====================================================================

const { DAY_SECONDS } = require('./constants');
const { dayPhaseEmbed } = require('./embeds');

async function beginDay(game, client) {
    const { beginVoting } = require('./voting');

    game.phase = 'day';
    game.votes = new Map();
    game.busyUsers = new Set();

    await game.textChannel.send({ embeds: [await dayPhaseEmbed(game, client)] });

    clearTimeout(game.dayTimer);
    game.dayTimer = setTimeout(() => beginVoting(game, client), DAY_SECONDS * 1000);
}

module.exports = { beginDay };
