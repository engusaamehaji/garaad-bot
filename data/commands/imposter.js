// =====================================================================
// COMMAND: ?imposter / ?mafia (alias) — Find the Imposter
// =====================================================================

const {
    games,
    lobbyEmbed,
    lobbyRow,
    createLobbyGame,
    scheduleLobbyTimeout,
    startGame,
} = require('../../src/games/imposter');

module.exports = async function imposterCmd(message) {
    const guildId = message.guild.id;

    if (games.has(guildId)) {
        return message.reply('⚠️ A Find the Imposter game is already running. Finish it or ask an admin to stop it.');
    }

    const game = createLobbyGame(message);
    games.set(guildId, game);

    const embed = await lobbyEmbed(game, message.client);
    const row = lobbyRow(message.author.id);

    const lobbyMsg = await message.reply({ embeds: [embed], components: [row] });
    game.lobbyMsg = lobbyMsg;

    scheduleLobbyTimeout(game, message.client, games, startGame);

    return lobbyMsg;
};
