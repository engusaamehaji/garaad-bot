// =====================================================================
// Imposter — main game controller
// =====================================================================

const { MIN_PLAYERS, MAX_PLAYERS, LOBBY_SECONDS, COLORS } = require('./constants');
const { ROLES, assignRoles, isImposter, imposterCount, roleLabel } = require('./roles');
const {
    fetchName,
    alivePlayers,
    aliveCitizens,
    aliveImposters,
    targetRows,
    clearTimers,
} = require('./utils');
const { checkWin } = require('./win');
const {
    lobbyEmbed,
    startingEmbed,
    lobbyClosedEmbed,
    gameStartEmbed,
    roleDmEmbed,
    nightPickEmbed,
    gameOverEmbed,
} = require('./embeds');
const { lobbyRow, disableRows } = require('./buttons');
const { createLobbyGame, refreshLobby, scheduleLobbyTimeout } = require('./lobby');
const { beginNight, resolveNight } = require('./night');
const { beginDay } = require('./day');
const { beginVoting, resolveVote } = require('./voting');

const games = new Map();

async function startGame(game, client) {
    clearTimeout(game.lobbyTimer);
    game.starting = true;
    game.phase = 'starting';

    const playerIds = [...game.players.keys()];
    const roles = assignRoles(playerIds.length);
    const imposterIds = [];

    playerIds.forEach((uid, index) => {
        game.players.set(uid, { role: roles[index], alive: true });
        if (roles[index] === 'imposter') imposterIds.push(uid);
    });

    await game.textChannel.send({
        content: '@everyone',
        embeds: [await gameStartEmbed(game, client, imposterIds)],
    });

    for (const [uid, { role }] of game.players) {
        const teammates = role === 'imposter' && imposterIds.length > 1
            ? `\n\n🗡️ **Fellow Imposters:** ${imposterIds.filter(id => id !== uid).map(id => `<@${id}>`).join(', ')}`
            : '';

        try {
            const user = await client.users.fetch(uid);
            await user.send({ embeds: [roleDmEmbed(role, teammates)] });
        } catch { /* DM closed */ }
    }

    await beginNight(game, client);
}

async function endGame(game, client, winner) {
    clearTimers(game);
    game.phase = 'ended';
    games.delete(game.guildId);

    await game.textChannel.send({
        embeds: [await gameOverEmbed(game, client, winner)],
    }).catch(() => {});
}

function cancelGame(guildId) {
    const game = games.get(guildId);
    if (!game) return;
    clearTimers(game);
    game.phase = 'ended';
    games.delete(guildId);
}

/** @deprecated Use isImposter — kept for any leftover callers */
function isMafia(role) {
    return isImposter(role);
}

module.exports = {
    games,
    cancelGame,
    startGame,
    endGame,
    beginNight,
    resolveNight,
    beginDay,
    beginVoting,
    resolveVote,
    checkWin,
    lobbyEmbed,
    lobbyRow,
    startingEmbed,
    lobbyClosedEmbed,
    nightPickEmbed,
    createLobbyGame,
    refreshLobby,
    scheduleLobbyTimeout,
    targetRows,
    alivePlayers,
    aliveCitizens,
    aliveImposters,
    fetchName,
    isImposter,
    isMafia,
    assignRoles,
    imposterCount,
    roleLabel,
    ROLES,
    disableRows,
    clearTimers,
    MIN_PLAYERS,
    MAX_PLAYERS,
    LOBBY_SECONDS,
    COLORS,
};
