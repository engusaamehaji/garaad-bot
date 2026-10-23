// =====================================================================
// Imposter — lobby
// =====================================================================

const { MIN_PLAYERS, LOBBY_SECONDS } = require('./constants');
const { lobbyEmbed, startingEmbed, lobbyClosedEmbed } = require('./embeds');
const { lobbyRow } = require('./buttons');
const { clearTimers } = require('./utils');

function createLobbyGame(message) {
    return {
        guildId: message.guild.id,
        guild: message.guild,
        hostId: message.author.id,
        phase: 'lobby',
        players: new Map([[message.author.id, null]]),
        textChannel: message.channel,
        round: 1,
        votes: new Map(),
        nightActions: null,
        nightTimer: null,
        lobbyTimer: null,
        dayTimer: null,
        voteTimer: null,
        lobbyMsg: null,
        voteMsg: null,
        starting: false,
        busyUsers: new Set(),
    };
}

async function refreshLobby(game, client, hostId) {
    const embed = await lobbyEmbed(game, client);
    const row = lobbyRow(hostId || game.hostId);
    if (game.lobbyMsg) {
        await game.lobbyMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
    }
    return { embed, row };
}

function scheduleLobbyTimeout(game, client, games, startGame) {
    clearTimeout(game.lobbyTimer);
    game.lobbyTimer = setTimeout(async () => {
        const current = games.get(game.guildId);
        if (!current || current.phase !== 'lobby' || current.starting) return;

        if (current.players.size < MIN_PLAYERS) {
            clearTimers(current);
            games.delete(game.guildId);
            if (current.lobbyMsg) {
                await current.lobbyMsg.edit({
                    embeds: [lobbyClosedEmbed()],
                    components: [],
                }).catch(() => {});
            }
            return;
        }

        current.starting = true;
        if (current.lobbyMsg) {
            await current.lobbyMsg.edit({
                embeds: [startingEmbed()],
                components: [],
            }).catch(() => {});
        }
        await startGame(current, client);
    }, LOBBY_SECONDS * 1000);
}

module.exports = {
    createLobbyGame,
    refreshLobby,
    scheduleLobbyTimeout,
};
