const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');

const lobbies = new Map();
const games = new Map();
const channelGames = new Map();

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 25;
const LOBBY_TIMEOUT_MS = 60_000;
const VOTE_TIMEOUT_MS = 60_000;

function imposterCount(playerCount) {
    if (playerCount >= 19) return 4;
    if (playerCount >= 12) return 3;
    if (playerCount >= 7) return 2;
    return 1;
}

function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function getBusyGame(userId) {
    for (const lobby of lobbies.values()) {
        if (lobby.players.some((player) => player.id === userId)) return 'imposter lobby';
    }
    for (const game of games.values()) {
        if (game.players.some((player) => player.id === userId)) return 'imposter';
    }
    return null;
}

function lobbyEmbed(lobby) {
    const players = lobby.players.map((player, index) => `**${index + 1}.** <@${player.id}>`).join('\n');
    const imposters = imposterCount(lobby.players.length);
    return new EmbedBuilder()
        .setTitle('🎭 Find the Imposter')
        .setColor('#5865f2')
        .setDescription(
            `**Players:** ${lobby.players.length}/${lobby.maxPlayers}\n` +
            `**Host:** <@${lobby.hostId}>\n` +
            `**Imposters:** ${imposters}\n\n` +
            `${players}\n\n` +
            `Join the lobby. The host can start once at least ${MIN_PLAYERS} players have joined.`
        )
        .setFooter({ text: 'Roles are private. Discuss, vote, and find the imposters.' });
}

function lobbyRows(lobby) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fti_join_${lobby.id}`).setLabel('Join').setEmoji('🟢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fti_leave_${lobby.id}`).setLabel('Leave').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fti_start_${lobby.id}`).setLabel('Start').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(lobby.players.length < MIN_PLAYERS),
        new ButtonBuilder().setCustomId(`fti_close_${lobby.id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
    )];
}

async function refreshLobby(lobby, interaction) {
    return interaction.update({ embeds: [lobbyEmbed(lobby)], components: lobbyRows(lobby) });
}

async function createLobby(message, maxPlayers) {
    if (!message.guild) return message.reply('⚠️ Find the Imposter can only be played in a server.');
    if (channelGames.has(message.channel.id)) return message.reply('⚠️ A Find the Imposter game or lobby is already active in this channel.');
    const busy = require('../store').isUserBusy(message.author.id) || getBusyGame(message.author.id);
    if (busy) return message.reply(`⚠️ You are already playing **${busy}**.`);

    const id = `${message.channel.id}_${Date.now()}`;
    const lobby = {
        id,
        channelId: message.channel.id,
        hostId: message.author.id,
        maxPlayers,
        players: [{ id: message.author.id, username: message.author.username }],
        message: null,
        timer: null,
    };
    lobbies.set(id, lobby);
    channelGames.set(message.channel.id, id);
    lobby.message = await message.channel.send({ embeds: [lobbyEmbed(lobby)], components: lobbyRows(lobby) });
    lobby.timer = setTimeout(async () => {
        if (!lobbies.has(id)) return;
        lobbies.delete(id);
        channelGames.delete(lobby.channelId);
        await lobby.message.edit({
            embeds: [new EmbedBuilder().setTitle('🎭 Lobby expired').setDescription('The lobby closed because the game did not start in time.').setColor('#7f8c8d')],
            components: [],
        }).catch(() => {});
    }, LOBBY_TIMEOUT_MS);
}

async function findImposterCommand(message, args = []) {
    let maxPlayers = Number(args[0]);
    if (!args[0]) {
        await message.reply('🎭 How many players should the lobby hold? Choose a number from **3 to 25**.');
        const collected = await message.channel.awaitMessages({
            filter: (reply) => reply.author.id === message.author.id,
            max: 1,
            time: 30_000,
        }).catch(() => null);
        const answer = collected?.first()?.content?.trim();
        if (!answer || !/^\d+$/.test(answer)) return message.reply('⌛ Lobby setup ended. Start again with `?fti <players>` (3–25).');
        maxPlayers = Number(answer);
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
        return message.reply('⚠️ Usage: `?fti <players>` — choose a lobby size from **3 to 25**.');
    }
    return createLobby(message, maxPlayers);
}

function aliveImposters(game) {
    return game.imposters.filter((id) => game.alive.some((player) => player.id === id)).length;
}

function getWinner(game) {
    const imposters = aliveImposters(game);
    const citizens = game.alive.length - imposters;
    if (imposters === 0) return 'Citizens';
    if (imposters >= citizens) return 'Imposters';
    return null;
}

async function startGame(lobby, channel) {
    if (!lobbies.has(lobby.id)) return;
    clearTimeout(lobby.timer);
    lobbies.delete(lobby.id);

    const imposters = shuffle(lobby.players).slice(0, imposterCount(lobby.players.length)).map((player) => player.id);
    const game = {
        ...lobby,
        alive: [...lobby.players],
        imposters,
        day: 1,
        phase: 'discussion',
        votes: new Map(),
        missedVotes: new Map(),
        revoteCandidates: null,
        timer: null,
        message: null,
        resolving: false,
    };
    games.set(game.id, game);

    for (const player of game.players) {
        const isImposter = imposters.includes(player.id);
        const partners = isImposter
            ? imposters.filter((id) => id !== player.id).map((id) => `<@${id}>`).join(', ')
            : '';
        const roleText = isImposter
            ? `🔪 **You are an Imposter.** Work with your fellow imposters: ${partners || 'you are alone'}.`
            : '🧑‍🤝‍🧑 **You are a Citizen.** Find and vote out the imposters.';
        await channel.client.users.fetch(player.id)
            .then((user) => user.send(`🎭 **Find the Imposter — your secret role**\n\n${roleText}`))
            .catch(() => {});
    }

    await lobby.message.edit({
        embeds: [new EmbedBuilder()
            .setTitle('🎭 Find the Imposter — Game Started')
            .setColor('#5865f2')
            .setDescription('Secret roles were sent by DM. If your DMs are closed, use **Reveal my role** below; only you can see the reply.')],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fti_role_${game.id}`).setLabel('Reveal my role').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        )],
    }).catch(() => {});
    await channel.send({
        embeds: [new EmbedBuilder().setTitle('🎭 Round 1 — Discussion').setColor('#f1c40f')
            .setDescription(`Players, discuss who may be an imposter. You have **${discussionSeconds(game)} seconds**, then vote below.\n\n${game.alive.map((p) => `<@${p.id}>`).join(' ')}`)],
    });
    game.timer = setTimeout(() => startVoting(game, channel), discussionSeconds(game) * 1000);
}

function discussionSeconds(game) {
    return Math.max(30, Math.min(200, game.alive.length * 10));
}

function voteRows(game, candidates) {
    const rows = [];
    for (let offset = 0; offset < candidates.length; offset += 5) {
        const row = new ActionRowBuilder();
        for (const player of candidates.slice(offset, offset + 5)) {
            row.addComponents(new ButtonBuilder()
                .setCustomId(`fti_vote_${game.id}_${player.id}`)
                .setLabel(player.username.slice(0, 80))
                .setStyle(game.revoteCandidates ? ButtonStyle.Danger : ButtonStyle.Primary));
        }
        rows.push(row);
    }
    return rows;
}

async function startVoting(game, channel, candidates = null) {
    if (!games.has(game.id)) return;
    clearTimeout(game.timer);
    game.phase = 'voting';
    game.votes.clear();
    game.revoteCandidates = candidates;
    const eligible = game.alive.filter((player) => !candidates?.some((candidate) => candidate.id === player.id));
    if (candidates && eligible.length === 0) {
        return finishRound(game, channel, null, true);
    }
    const voteMessage = await channel.send({
        embeds: [new EmbedBuilder().setTitle(candidates ? '⚖️ Tie-break Vote' : `🗳️ Round ${game.day} — Vote`)
            .setColor('#e74c3c')
            .setDescription(`${candidates ? 'Vote between the tied players.' : 'Choose one player to eliminate.'} You have **60 seconds**. Your vote is private.`)],
        components: voteRows(game, candidates || game.alive),
    });
    game.voteMessage = voteMessage;
    game.timer = setTimeout(() => resolveVotes(game, channel), VOTE_TIMEOUT_MS);
}

async function resolveVotes(game, channel) {
    if (!games.has(game.id) || game.resolving) return;
    game.resolving = true;
    clearTimeout(game.timer);
    await game.voteMessage?.edit({ components: [] }).catch(() => {});

    if (!game.revoteCandidates) {
        for (const player of [...game.alive]) {
            if (game.votes.has(player.id)) {
                game.missedVotes.set(player.id, 0);
                continue;
            }
            const missed = (game.missedVotes.get(player.id) || 0) + 1;
            game.missedVotes.set(player.id, missed);
            if (missed >= 2) {
                game.alive = game.alive.filter((alive) => alive.id !== player.id);
                await channel.send({ embeds: [new EmbedBuilder().setTitle('⏳ Inactive Player Removed')
                    .setDescription(`<@${player.id}> missed two votes and has been removed. They were **${game.imposters.includes(player.id) ? 'an Imposter' : 'a Citizen'}**.`)
                    .setColor('#e67e22')] });
            }
        }
    }

    const counts = new Map();
    for (const targetId of game.votes.values()) counts.set(targetId, (counts.get(targetId) || 0) + 1);
    const highest = Math.max(0, ...counts.values());
    const leaders = [...counts].filter(([, count]) => count === highest && highest > 0).map(([id]) => id);
    if (leaders.length > 1 && !game.revoteCandidates) {
        game.resolving = false;
        const candidates = game.alive.filter((player) => leaders.includes(player.id));
        await channel.send({ embeds: [new EmbedBuilder().setTitle('⚖️ Vote Tied')
            .setDescription(`Tie between ${candidates.map((player) => `<@${player.id}>`).join(' and ')}. A tie-break vote starts now.`)
            .setColor('#f1c40f')] });
        return startVoting(game, channel, candidates);
    }

    let eliminatedId = leaders.length === 1 ? leaders[0] : null;
    if (game.revoteCandidates && leaders.length > 1) eliminatedId = null;
    if (eliminatedId) {
        game.alive = game.alive.filter((player) => player.id !== eliminatedId);
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🚫 Player Eliminated')
            .setDescription(`<@${eliminatedId}> was eliminated. Their role was **${game.imposters.includes(eliminatedId) ? 'Imposter' : 'Citizen'}**.`)
            .setColor(game.imposters.includes(eliminatedId) ? '#2ecc71' : '#e74c3c')] });
    } else {
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🗳️ No Elimination')
            .setDescription('No votes were cast, or the tie-break vote was still tied. The game continues.')
            .setColor('#7f8c8d')] });
    }

    await finishRound(game, channel, eliminatedId, false);
}

async function finishRound(game, channel, eliminatedId, noEligibleRevoters) {
    const winner = getWinner(game);
    if (winner) {
        await endGame(game, channel, winner);
        return;
    }
    game.resolving = false;
    game.day += 1;
    game.phase = 'discussion';
    game.revoteCandidates = null;
    const seconds = discussionSeconds(game);
    const note = noEligibleRevoters ? 'There were no eligible players for a tie-break vote. ' : '';
    await channel.send({ embeds: [new EmbedBuilder().setTitle(`🎭 Round ${game.day} — Discussion`)
        .setColor('#f1c40f')
        .setDescription(`${note}Discuss who may be an imposter. You have **${seconds} seconds**, then vote.\n\n${game.alive.map((p) => `<@${p.id}>`).join(' ')}`)] });
    game.timer = setTimeout(() => startVoting(game, channel), seconds * 1000);
}

async function endGame(game, channel, winner) {
    clearTimeout(game.timer);
    const imposterMentions = game.imposters.map((id) => `<@${id}>`).join(', ');
    const citizenMentions = game.players.filter((player) => !game.imposters.includes(player.id)).map((player) => `<@${player.id}>`).join(', ');
    await channel.send({ embeds: [new EmbedBuilder().setTitle('🏁 Find the Imposter — Game Over')
        .setColor(winner === 'Citizens' ? '#2ecc71' : '#e74c3c')
        .setDescription(`**${winner} win!**\n\n🔪 **Imposters:** ${imposterMentions}\n🧑‍🤝‍🧑 **Citizens:** ${citizenMentions}`)] });
    games.delete(game.id);
    channelGames.delete(game.channelId);
}

async function handleFindImposterButton(interaction) {
    const id = interaction.customId;
    const action = id.startsWith('fti_vote_') ? 'vote' : id.slice(4, id.indexOf('_', 4));
    const gameId = action === 'vote' ? id.slice('fti_vote_'.length, id.lastIndexOf('_')) : id.slice(`fti_${action}_`.length);
    const lobby = lobbies.get(gameId);
    const game = games.get(gameId);
    const userId = interaction.user.id;

    if (action === 'join' || action === 'leave' || action === 'start' || action === 'close') {
        if (!lobby) return interaction.reply({ content: '⚠️ This lobby has ended.', flags: MessageFlags.Ephemeral });
        if (action === 'join') {
            if (lobby.players.some((player) => player.id === userId)) return interaction.reply({ content: 'You are already in this lobby.', flags: MessageFlags.Ephemeral });
            const busy = require('../store').isUserBusy(userId) || getBusyGame(userId);
            if (busy) return interaction.reply({ content: `You are already playing **${busy}**.`, flags: MessageFlags.Ephemeral });
            if (lobby.players.length >= lobby.maxPlayers) return interaction.reply({ content: 'This lobby is full.', flags: MessageFlags.Ephemeral });
            lobby.players.push({ id: userId, username: interaction.user.username });
            await refreshLobby(lobby, interaction);
            if (lobby.players.length === lobby.maxPlayers) await startGame(lobby, interaction.channel);
            return;
        }
        if (action === 'leave') {
            const index = lobby.players.findIndex((player) => player.id === userId);
            if (index < 0) return interaction.reply({ content: 'You are not in this lobby.', flags: MessageFlags.Ephemeral });
            lobby.players.splice(index, 1);
            if (lobby.players.length === 0) {
                clearTimeout(lobby.timer);
                lobbies.delete(gameId);
                channelGames.delete(lobby.channelId);
                return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎭 Lobby closed').setColor('#7f8c8d')], components: [] });
            }
            if (lobby.hostId === userId) lobby.hostId = lobby.players[0].id;
            return refreshLobby(lobby, interaction);
        }
        if (lobby.hostId !== userId) return interaction.reply({ content: 'Only the lobby host can do that.', flags: MessageFlags.Ephemeral });
        if (action === 'close') {
            clearTimeout(lobby.timer);
            lobbies.delete(gameId);
            channelGames.delete(lobby.channelId);
            return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎭 Lobby closed').setColor('#7f8c8d')], components: [] });
        }
        if (lobby.players.length < MIN_PLAYERS) return interaction.reply({ content: `At least ${MIN_PLAYERS} players are needed.`, flags: MessageFlags.Ephemeral });
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('🎭 Starting Find the Imposter…').setColor('#5865f2')], components: [] });
        return startGame(lobby, interaction.channel);
    }

    if (action === 'role') {
        if (!game) return interaction.reply({ content: 'This game has ended.', flags: MessageFlags.Ephemeral });
        const isImposter = game.imposters.includes(userId);
        const partners = isImposter ? game.imposters.filter((id) => id !== userId).map((id) => `<@${id}>`).join(', ') : '';
        return interaction.reply({ content: isImposter
            ? `🔪 **Your secret role: Imposter.** Fellow imposters: ${partners || 'none'}.`
            : '🧑‍🤝‍🧑 **Your secret role: Citizen.** Find and vote out the imposters.', flags: MessageFlags.Ephemeral });
    }

    if (action === 'vote') {
        if (!game || game.phase !== 'voting') return interaction.reply({ content: 'Voting is closed.', flags: MessageFlags.Ephemeral });
        if (!game.alive.some((player) => player.id === userId)) return interaction.reply({ content: 'Only living players can vote.', flags: MessageFlags.Ephemeral });
        if (game.votes.has(userId)) return interaction.reply({ content: 'You already voted this round.', flags: MessageFlags.Ephemeral });
        if (game.revoteCandidates?.some((player) => player.id === userId)) return interaction.reply({ content: 'Tied candidates cannot vote in the tie-break.', flags: MessageFlags.Ephemeral });
        const targetId = id.slice(id.lastIndexOf('_') + 1);
        const validTargets = game.revoteCandidates || game.alive;
        if (!validTargets.some((player) => player.id === targetId)) return interaction.reply({ content: 'That player is not a vote option.', flags: MessageFlags.Ephemeral });
        game.votes.set(userId, targetId);
        return interaction.reply({ content: '✅ Your vote was recorded privately.', flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    findImposterCommand,
    handleFindImposterButton,
    getBusyGame,
};
