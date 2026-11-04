const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const games = new Map(); // gameId -> state
const channelGames = new Map(); // channelId -> gameId
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const LOBBY_TIMEOUT_MS = 60_000;
const STORY_TIMEOUT_MS = 90_000;
const VOTE_TIMEOUT_MS = 60_000;

function getBusyGame(userId) {
    for (const game of games.values()) {
        if (game.players.some((player) => player.id === userId) && game.phase !== 'finished') return 'sheeko';
    }
    return null;
}

function lobbyEmbed(game) {
    const players = game.players.map((player, index) => `**${index + 1}.** <@${player.id}>`).join('\n');
    return new EmbedBuilder()
        .setTitle('🎭 Sheeko Been ah')
        .setColor('#9b59b6')
        .setDescription(
            `**Players:** ${game.players.length}/${MAX_PLAYERS}\n` +
            `**Host:** <@${game.hostId}>\n\n${players}\n\n` +
            `Ugu yaraan **${MIN_PLAYERS}** ciyaaryahan. Sheekeeyuhu wuxuu qori doonaa 2 run iyo 1 been; kuwa kale waxay qiyaasayaan beenta.`
        );
}

function lobbyComponents(game) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sheeko_join_${game.id}`).setLabel('Join').setEmoji('🟢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sheeko_leave_${game.id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sheeko_start_${game.id}`).setLabel('Start').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(game.players.length < MIN_PLAYERS),
    )];
}

async function sheekoCommand(message) {
    if (!message.guild) return message.reply('⚠️ `?sheeko` waxaa lagu ciyaaraa server-ka.');
    if (channelGames.has(message.channel.id)) return message.reply('⚠️ Sheeko game ayaa durba channel-kan ka socota.');
    const busy = require('../store').isUserBusy(message.author.id);
    if (busy) return message.reply(`⚠️ Waxaad durba ku jirtaa ciyaarta **${busy}**.`);

    const id = `${message.channel.id}_${Date.now()}`;
    const game = {
        id,
        channelId: message.channel.id,
        hostId: message.author.id,
        hostName: message.member?.displayName || message.author.username,
        players: [{ id: message.author.id, name: message.member?.displayName || message.author.username, score: 0 }],
        phase: 'lobby',
        currentIndex: -1,
        storyteller: null,
        statements: [],
        lieIndex: -1,
        votes: new Map(),
        timer: null,
        resolving: false,
        lobbyMessage: null,
        voteMessage: null,
    };
    games.set(id, game);
    channelGames.set(game.channelId, id);
    game.lobbyMessage = await message.reply({ embeds: [lobbyEmbed(game)], components: lobbyComponents(game) }).catch(() => null);
    if (!game.lobbyMessage) {
        games.delete(id);
        channelGames.delete(game.channelId);
        return;
    }
    game.timer = setTimeout(async () => {
        if (game.phase !== 'lobby') return;
        game.phase = 'finished';
        games.delete(id);
        channelGames.delete(game.channelId);
        await game.lobbyMessage.edit({ embeds: [new EmbedBuilder().setTitle('🎭 Lobby expired').setColor('#7f8c8d')], components: [] }).catch(() => {});
    }, LOBBY_TIMEOUT_MS);
}

async function refreshLobby(game, interaction) {
    return interaction.update({ embeds: [lobbyEmbed(game)], components: lobbyComponents(game) });
}

async function startGame(game, interaction) {
    clearTimeout(game.timer);
    game.phase = 'story';
    await interaction.update({
        embeds: [new EmbedBuilder().setTitle('🎭 Sheeko Been ah — Game Started').setColor('#9b59b6')
            .setDescription(`${game.players.length} ciyaaryahan ayaa tartamaya. Qof walba markiisa ayuu qori doonaa 2 run iyo 1 been.`)],
        components: [],
    });
    return startNextStory(game);
}

async function startNextStory(game) {
    if (!games.has(game.id)) return;
    game.currentIndex++;
    if (game.currentIndex >= game.players.length) return endGame(game);
    game.storyteller = game.players[game.currentIndex];
    game.statements = [];
    game.lieIndex = -1;
    game.votes.clear();
    game.resolving = false;
    game.phase = 'story';
    const prompt = await game.lobbyMessage.channel.send({
        embeds: [new EmbedBuilder().setTitle(`📖 Sheekada ${game.currentIndex + 1}/${game.players.length}`)
            .setColor('#9b59b6')
            .setDescription(`<@${game.storyteller.id}> waa sheekeeyaha. Riix badhanka oo geli **3 sheeko: 2 run ah iyo 1 been**. Ciyaartoyda kale waxay codaynayaan sheekada beenta ah.\n\nWaqti: **90 ilbiriqsi**.`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sheeko_tell_${game.id}`).setLabel('Geli 3 sheeko').setEmoji('✍️').setStyle(ButtonStyle.Primary),
        )],
    });
    game.storyMessage = prompt;
    game.timer = setTimeout(() => skipStory(game), STORY_TIMEOUT_MS);
}

async function skipStory(game) {
    if (!games.has(game.id) || game.phase !== 'story') return;
    clearTimeout(game.timer);
    game.phase = 'resolving';
    await game.storyMessage?.edit({ components: [] }).catch(() => {});
    await game.lobbyMessage.channel.send(`⏰ <@${game.storyteller.id}> sheekada waqtigeeda kuma uusan soo gudbin. Wareeggan waa laga gudbayaa.`).catch(() => {});
    return startNextStory(game);
}

async function handleSheekoModal(interaction) {
    const gameId = interaction.customId.slice('sheeko_modal_'.length);
    const game = games.get(gameId);
    if (!game || game.phase !== 'story') return interaction.reply({ content: 'Wareegga sheekadu wuu dhammaaday.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== game.storyteller.id) return interaction.reply({ content: 'Sheekeeyaha hadda jooga oo keliya ayaa sheeko diri kara.', flags: MessageFlags.Ephemeral });

    const statements = [1, 2, 3].map((n) => interaction.fields.getTextInputValue(`story${n}`).trim());
    const lie = interaction.fields.getTextInputValue('lie').trim();
    if (statements.some((statement) => !statement) || !['1', '2', '3'].includes(lie)) {
        return interaction.reply({ content: 'Geli 3 sheeko oo qor lambarka sheekada beenta ah (1, 2, ama 3).', flags: MessageFlags.Ephemeral });
    }

    clearTimeout(game.timer);
    game.statements = statements;
    game.lieIndex = Number(lie) - 1;
    game.votes.clear();
    game.phase = 'voting';
    await interaction.reply({ content: '✅ Sheekooyinka waa la diray. Codayntu waxay ka socotaa channel-ka.', flags: MessageFlags.Ephemeral });
    game.voteMessage = await game.lobbyMessage.channel.send({
        embeds: [new EmbedBuilder().setTitle(`🕵️ Qiyaas beenta — ${game.storyteller.name}`)
            .setColor('#5865f2')
            .setDescription(statements.map((statement, index) => `**${index + 1}.** ${statement}`).join('\n\n') + '\n\nCiyaartoyda kale: dooro hal sheeko. **60 ilbiriqsi** ayaa idiin yaal.')],
        components: [new ActionRowBuilder().addComponents(
            ...[1, 2, 3].map((number) => new ButtonBuilder()
                .setCustomId(`sheeko_vote_${game.id}_${number - 1}`)
                .setLabel(`Sheeko ${number}`)
                .setStyle(ButtonStyle.Secondary))
        )],
    });
    game.timer = setTimeout(() => resolveVotes(game), VOTE_TIMEOUT_MS);
}

async function resolveVotes(game) {
    if (!games.has(game.id) || game.phase !== 'voting' || game.resolving) return;
    game.resolving = true;
    clearTimeout(game.timer);
    await game.voteMessage?.edit({ components: [] }).catch(() => {});
    const correctVoters = [];
    const fooledVoters = [];
    for (const [userId, vote] of game.votes) {
        if (vote === game.lieIndex) {
            correctVoters.push(userId);
            const player = game.players.find((entry) => entry.id === userId);
            if (player) player.score += 2;
        } else {
            fooledVoters.push(userId);
            game.storyteller.score += 1;
        }
    }
    const resultLines = game.statements.map((statement, index) =>
        `${index === game.lieIndex ? '❌ **Lie**' : '✅ Truth'} — **${index + 1}.** ${statement}`
    );
    resultLines.push('', `🎯 Correct guesses: ${correctVoters.length} · Fooled: ${fooledVoters.length}`);
    await game.lobbyMessage.channel.send({ embeds: [new EmbedBuilder().setTitle(`📊 Natiijada — ${game.storyteller.name}`)
        .setColor('#9b59b6')
        .setDescription(resultLines.join('\n'))] }).catch(() => {});
    game.resolving = false;
    return startNextStory(game);
}

async function endGame(game) {
    clearTimeout(game.timer);
    game.phase = 'finished';
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const highScore = sorted[0]?.score ?? 0;
    const winners = sorted.filter((player) => player.score === highScore);
    const board = sorted.map((player, index) => `**${index + 1}.** <@${player.id}> — **${player.score}** pts`).join('\n');
    await game.lobbyMessage.channel.send({ embeds: [new EmbedBuilder().setTitle('🏁 Sheeko Been ah — Game Over')
        .setColor('#f1c40f')
        .setDescription(`**${winners.length > 1 ? 'Winners' : 'Winner'}:** ${winners.map((player) => `<@${player.id}>`).join(', ')}\n\n${board}`)] }).catch(() => {});
    games.delete(game.id);
    channelGames.delete(game.channelId);
}

async function handleSheekoButton(interaction) {
    const id = interaction.customId;
    const action = id.slice('sheeko_'.length, id.indexOf('_', 'sheeko_'.length));
    const gameId = action === 'vote'
        ? id.slice('sheeko_vote_'.length, id.lastIndexOf('_'))
        : id.slice(`sheeko_${action}_`.length);
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: 'Ciyaartan way dhammaatay ama lama helin.', flags: MessageFlags.Ephemeral });

    if (action === 'join') {
        if (game.phase !== 'lobby') return interaction.reply({ content: 'Ciyaartu mar hore ayay bilaabatay.', flags: MessageFlags.Ephemeral });
        if (game.players.some((player) => player.id === interaction.user.id)) return interaction.reply({ content: 'Hore ayaad lobby-ga ugu jirtaa.', flags: MessageFlags.Ephemeral });
        if (game.players.length >= MAX_PLAYERS) return interaction.reply({ content: 'Lobby-gu wuu buuxsamay.', flags: MessageFlags.Ephemeral });
        const busy = require('../store').isUserBusy(interaction.user.id);
        if (busy) return interaction.reply({ content: `Waxaad durba ku jirtaa ciyaarta **${busy}**.`, flags: MessageFlags.Ephemeral });
        game.players.push({ id: interaction.user.id, name: interaction.member?.displayName || interaction.user.username, score: 0 });
        return refreshLobby(game, interaction);
    }

    if (action === 'leave') {
        if (game.phase !== 'lobby') return interaction.reply({ content: 'Ciyaartu mar hore ayay bilaabatay.', flags: MessageFlags.Ephemeral });
        const index = game.players.findIndex((player) => player.id === interaction.user.id);
        if (index < 0) return interaction.reply({ content: 'Lobby-ga kuma jirto.', flags: MessageFlags.Ephemeral });
        game.players.splice(index, 1);
        if (game.players.length === 0) {
            clearTimeout(game.timer);
            games.delete(game.id);
            channelGames.delete(game.channelId);
            return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎭 Lobby closed').setColor('#7f8c8d')], components: [] });
        }
        if (game.hostId === interaction.user.id) {
            game.hostId = game.players[0].id;
            game.hostName = game.players[0].name;
        }
        return refreshLobby(game, interaction);
    }

    if (action === 'start') {
        if (game.phase !== 'lobby') return interaction.reply({ content: 'Ciyaartu mar hore ayay bilaabatay.', flags: MessageFlags.Ephemeral });
        if (game.hostId !== interaction.user.id) return interaction.reply({ content: 'Host-ka keliya ayaa bilaabi kara.', flags: MessageFlags.Ephemeral });
        if (game.players.length < MIN_PLAYERS) return interaction.reply({ content: `Ugu yaraan ${MIN_PLAYERS} ciyaaryahan ayaa loo baahan yahay.`, flags: MessageFlags.Ephemeral });
        return startGame(game, interaction);
    }

    if (action === 'tell') {
        if (game.phase !== 'story') return interaction.reply({ content: 'Hadda sheeko lama qorayo.', flags: MessageFlags.Ephemeral });
        if (game.storyteller.id !== interaction.user.id) return interaction.reply({ content: 'Sheekeeyaha hadda jooga oo keliya ayaa qori kara.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId(`sheeko_modal_${game.id}`).setTitle('Qor 2 run iyo 1 been');
        const rows = [
            new TextInputBuilder().setCustomId('story1').setLabel('Sheekada 1aad').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true),
            new TextInputBuilder().setCustomId('story2').setLabel('Sheekada 2aad').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true),
            new TextInputBuilder().setCustomId('story3').setLabel('Sheekada 3aad').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true),
            new TextInputBuilder().setCustomId('lie').setLabel('Lambarka sheekada beenta ah (1–3)').setStyle(TextInputStyle.Short).setMaxLength(1).setRequired(true),
        ].map((input) => new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal.addComponents(...rows));
    }

    if (action === 'vote') {
        if (game.phase !== 'voting') return interaction.reply({ content: 'Codayntu way dhammaatay.', flags: MessageFlags.Ephemeral });
        if (!game.players.some((player) => player.id === interaction.user.id)) return interaction.reply({ content: 'Ciyaartan kuma jirto.', flags: MessageFlags.Ephemeral });
        if (game.storyteller.id === interaction.user.id) return interaction.reply({ content: 'Sheekeeyuhu codayn ma samayn karo.', flags: MessageFlags.Ephemeral });
        if (game.votes.has(interaction.user.id)) return interaction.reply({ content: 'Hore ayaad u codaysey.', flags: MessageFlags.Ephemeral });
        const vote = Number(id.slice(id.lastIndexOf('_') + 1));
        if (!Number.isInteger(vote) || vote < 0 || vote > 2) return interaction.reply({ content: 'Doorashadan sax ma aha.', flags: MessageFlags.Ephemeral });
        game.votes.set(interaction.user.id, vote);
        await interaction.reply({ content: '✅ Codkaaga waa la keydiyey.', flags: MessageFlags.Ephemeral });
        const votersRequired = game.players.length - 1;
        if (game.votes.size >= votersRequired) await resolveVotes(game);
    }
}

module.exports = {
    sheekoCommand,
    handleSheekoButton,
    handleSheekoModal,
    getBusyGame,
};
