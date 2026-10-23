// =====================================================================
// Imposter — Discord embeds
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const {
    MIN_PLAYERS,
    MAX_PLAYERS,
    LOBBY_SECONDS,
    NIGHT_SECONDS,
    DAY_SECONDS,
    VOTE_SECONDS,
    COLORS,
} = require('./constants');
const { ROLES, imposterCount, roleLabel } = require('./roles');
const { fetchName, alivePlayers } = require('./utils');

async function lobbyEmbed(game, client) {
    const hostName = await fetchName(game.hostId, client);
    const shown = [...game.players.keys()].slice(0, 30);
    const names = await Promise.all(shown.map(async uid => `• ${await fetchName(uid, client)}`));
    const more = game.players.size > shown.length
        ? `\n...and ${game.players.size - shown.length} more`
        : '';

    const expected = game.players.size >= MIN_PLAYERS
        ? imposterCount(game.players.size)
        : '—';

    return new EmbedBuilder()
        .setColor(COLORS.lobby)
        .setTitle('🎭 Find the Imposter — Lobby')
        .setDescription(
            `**Host:** ${hostName}\n` +
            `**Players (${game.players.size}/${MAX_PLAYERS}):**\n` +
            `${names.join('\n') || '_No players yet_'}${more}\n\n` +
            `Minimum: **${MIN_PLAYERS} players**\n` +
            `⌛ Lobby closes in **${LOBBY_SECONDS}s** (host can start anytime)\n` +
            `🗡️ Imposters at start: **${expected}**\n\n` +
            `_Balance: 3–5→1 · 6–10→2 · 11–15→3 · 16–20→4_`
        )
        .setFooter({ text: 'Garaad Bot • Find the Imposter' });
}

function startingEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.starting)
        .setTitle('🎭 Find the Imposter — Starting...')
        .setDescription('Roles are being sent via DM. Get ready!');
}

function lobbyClosedEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle('🎭 Find the Imposter — Lobby Closed')
        .setDescription(`Need at least **${MIN_PLAYERS} players** to start.`);
}

async function gameStartEmbed(game, client, imposterIds) {
    const playerIds = [...game.players.keys()];
    const playerList = await Promise.all(
        playerIds.slice(0, 40).map(async uid => `• ${await fetchName(uid, client)}`)
    );
    const extra = playerIds.length > playerList.length
        ? `\n...and ${playerIds.length - playerList.length} more`
        : '';

    return new EmbedBuilder()
        .setColor(COLORS.lobby)
        .setTitle('🎭 Find the Imposter — Game Started!')
        .setDescription(
            `**${playerIds.length}** players are in.\n\n` +
            `${playerList.join('\n')}${extra}\n\n` +
            `🗡️ Imposters: **${imposterIds.length}**\n` +
            `👤 Citizens: **${playerIds.length - imposterIds.length}**\n\n` +
            `Check your DMs for your role.`
        );
}

function roleDmEmbed(role, teammateMentions = '') {
    const info = ROLES[role];
    return new EmbedBuilder()
        .setColor(info.color)
        .setTitle(`${info.emoji} Your Role: ${info.name}`)
        .setDescription(
            `You are a **${info.name}**.\n\n` +
            `${info.dm}${teammateMentions}\n\n` +
            `Keep your role secret.`
        );
}

function nightPhaseEmbed(round) {
    return new EmbedBuilder()
        .setColor(COLORS.night)
        .setTitle(`🌙 Night Phase — Round ${round}`)
        .setDescription(
            `The town falls silent...\n\n` +
            `🗡️ Imposters are choosing a victim in DMs.\n` +
            `⏳ **${NIGHT_SECONDS} seconds**`
        );
}

function nightPickEmbed(page, pages) {
    return new EmbedBuilder()
        .setColor(COLORS.night)
        .setTitle('🗡️ Find the Imposter — Choose a Victim')
        .setDescription(`Vote secretly for one Citizen to eliminate.\nPage **${page + 1}/${pages}**`);
}

function morningEmbed(description) {
    return new EmbedBuilder()
        .setColor(COLORS.elimination)
        .setTitle('🌅 Morning Report')
        .setDescription(description);
}

async function dayPhaseEmbed(game, client) {
    const alive = alivePlayers(game);
    const shown = alive.slice(0, 40);
    const names = await Promise.all(shown.map(async ([uid]) => `• ${await fetchName(uid, client)}`));
    const extra = alive.length > shown.length
        ? `\n...and ${alive.length - shown.length} more`
        : '';

    return new EmbedBuilder()
        .setColor(COLORS.day)
        .setTitle(`☀️ Day Phase — Round ${game.round}`)
        .setDescription(
            `Discuss who the Imposters might be.\n\n` +
            `**Alive (${alive.length}):**\n${names.join('\n')}${extra}\n\n` +
            `💬 Voting begins in **${DAY_SECONDS} seconds**.`
        );
}

function votingPhaseEmbed(round, page, pages) {
    return new EmbedBuilder()
        .setColor(COLORS.voting)
        .setTitle(`🗳️ Voting Phase — Round ${round}`)
        .setDescription(
            `Vote to eliminate a player.\n\n` +
            `Page **${page + 1}/${pages}**\n` +
            `⏳ **${VOTE_SECONDS} seconds**`
        );
}

function voteResultEmbed(description) {
    return new EmbedBuilder()
        .setColor(COLORS.elimination)
        .setTitle('📊 Vote Results')
        .setDescription(description);
}

async function gameOverEmbed(game, client, winner) {
    const citizensWon = winner === 'citizens';
    const roleReveal = await Promise.all([...game.players.entries()].map(async ([uid, player]) => {
        const name = await fetchName(uid, client);
        return `${player.alive ? '✅' : '☠️'} **${name}** — ${roleLabel(player.role)}`;
    }));
    const revealText = roleReveal.join('\n');
    const safeReveal = revealText.length > 3000
        ? `${revealText.slice(0, 3000)}\n...and more`
        : revealText;

    return new EmbedBuilder()
        .setColor(citizensWon ? COLORS.citizensWin : COLORS.impostersWin)
        .setTitle(citizensWon ? '🏆 Find the Imposter — Citizens Win!' : '🏆 Find the Imposter — Imposters Win!')
        .setDescription(
            (citizensWon
                ? 'All Imposters have been eliminated.'
                : 'Imposters equal or outnumber the Citizens.') +
            `\n\n**Roles:**\n${safeReveal}`
        )
        .setFooter({ text: 'Garaad Bot • Find the Imposter' });
}

module.exports = {
    lobbyEmbed,
    startingEmbed,
    lobbyClosedEmbed,
    gameStartEmbed,
    roleDmEmbed,
    nightPhaseEmbed,
    nightPickEmbed,
    morningEmbed,
    dayPhaseEmbed,
    votingPhaseEmbed,
    voteResultEmbed,
    gameOverEmbed,
};
