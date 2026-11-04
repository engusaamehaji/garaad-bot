const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { isUserBusy } = require('../store');

const activeNumberGames = new Map(); // channelId -> game state
const INVITE_TIMEOUT_MS = 60_000;
const PICK_TIMEOUT_MS = 120_000;
const TURN_TIMEOUT_MS = 120_000;

function createNumberModal(customId, title, label) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    const input = new TextInputBuilder()
        .setCustomId('number')
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(3)
        .setPlaceholder('1–100')
        .setRequired(true);
    return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function pickEmbed(state) {
    return new EmbedBuilder()
        .setTitle('🎯 Qabso Tiro — Dooro Tiradaada')
        .setColor('#3498db')
        .setDescription(
            `Labada ciyaaryahanba tiro qarsoodi ah ha ka doortaan **1 ilaa 100** badhanka hoose.\n` +
            `Tiradaadu qofka kale ma arki doono. Markay labaduba doortaan, mid walba wuxuu qiyaasi doonaa tirada kan kale.`
        )
        .setFooter({ text: 'Tiro doorashada: 2 daqiiqo' });
}

function pickRow(state) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tiro_pick_${state.channelId}_${state.p1}`)
            .setLabel('Ciyaaryahan 1 — Dooro tiro')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`tiro_pick_${state.channelId}_${state.p2}`)
            .setLabel('Ciyaaryahan 2 — Dooro tiro')
            .setStyle(ButtonStyle.Primary),
    );
}

function guessEmbed(state) {
    const lastChanceLine = state.lastChanceTurn ? '\n⚠️ Fursaddan waa qiyaastaadii ugu dambaysay.' : '';
    return new EmbedBuilder()
        .setTitle('🎯 Qabso Tiro — Wareegga Qiyaasta')
        .setColor('#3498db')
        .setDescription(
            `<@${state.currentTurn}>, waa wareeggaaga. Qiyaas tirada qarsoon ee <@${state.currentTurn === state.p1 ? state.p2 : state.p1}> doortay.\n\n` +
            `Tiradaada **1 ilaa 100** si toos ah ugu qor chat-ka. Qiyaastaadu way muuqanaysaa; tilmaanta **ka weyn/ka yar** ayaa isla markiiba lagu siinayaa.` +
            lastChanceLine
        )
        .setFooter({ text: `Qiyaasta ${state.guessCounts[state.currentTurn] + 1}aad` });
}

async function finishGame(state, message, content) {
    if (activeNumberGames.get(state.channelId) !== state) return;
    clearTimeout(state.timeout);
    activeNumberGames.delete(state.channelId);
    state.phase = 'finished';
    await state.prompt?.edit({ components: [] }).catch(() => {});
    await message.channel.send(content).catch(() => {});
}

async function startPicking(channel, state) {
    state.phase = 'picking';
    state.channel = channel;
    state.channelId = channel.id;
    state.player1Number = null;
    state.player2Number = null;
    state.prompt = await channel.send({ embeds: [pickEmbed(state)], components: [pickRow(state)] }).catch(() => null);
    if (!state.prompt) return finishGame(state, { channel }, 'Ciyaarta tiro-qiyaastu ma bilaaban karin.');
    state.timeout = setTimeout(() => {
        finishGame(state, { channel }, '⏰ Waqtigii tiro doorashadu wuu dhammaaday. Ciyaartii waa la joojiyey.');
    }, PICK_TIMEOUT_MS);
}

async function startTurns(state) {
    clearTimeout(state.timeout);
    state.phase = 'playing';
    state.currentTurn = Math.random() < 0.5 ? state.p1 : state.p2;
    state.guessCounts = { [state.p1]: 0, [state.p2]: 0 };
    state.found = { [state.p1]: false, [state.p2]: false };
    state.lastChanceTurn = false;
    state.turnNumber = 1;
    await state.prompt.edit({ embeds: [guessEmbed(state)], components: [] }).catch(() => {});
    state.timeout = setTimeout(() => {
        const winnerId = state.currentTurn === state.p1 ? state.p2 : state.p1;
        finishGame(state, state, `⏰ <@${state.currentTurn}> waqtigii wuu dhammaaday. 🏆 <@${winnerId}> ayaa guuleystay.`);
    }, TURN_TIMEOUT_MS);
}

async function handlePickButton(interaction) {
    const [, , channelId, ownerId] = interaction.customId.split('_');
    const state = activeNumberGames.get(channelId);
    if (!state || state.phase !== 'picking')
        return interaction.reply({ content: 'Doorashada tiradu way dhammaatay.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== ownerId || (ownerId !== state.p1 && ownerId !== state.p2))
        return interaction.reply({ content: 'Badhankani ciyaaryahanka kale ayuu u gaar yahay.', flags: MessageFlags.Ephemeral });
    const current = ownerId === state.p1 ? state.player1Number : state.player2Number;
    if (current !== null)
        return interaction.reply({ content: 'Tiradaadii hore ayaad dooratay.', flags: MessageFlags.Ephemeral });

    return interaction.showModal(createNumberModal(`tiro_pick_modal_${channelId}_${ownerId}`, 'Dooro tiro qarsoodi ah', 'Tiro u dhexeysa 1 iyo 100'));
}

async function handlePickSubmit(interaction) {
    const [, , , channelId, ownerId] = interaction.customId.split('_');
    const state = activeNumberGames.get(channelId);
    if (!state || state.phase !== 'picking' || interaction.user.id !== ownerId)
        return interaction.reply({ content: 'Doorashada tiradu way dhammaatay ama adiga kuma khusayso.', flags: MessageFlags.Ephemeral });

    const existing = ownerId === state.p1 ? state.player1Number : state.player2Number;
    if (existing !== null)
        return interaction.reply({ content: 'Tiradaadii hore ayaad dooratay.', flags: MessageFlags.Ephemeral });

    const raw = interaction.fields.getTextInputValue('number').trim();
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)
        return interaction.reply({ content: 'Geli tiro dhan oo u dhexeysa 1 iyo 100.', flags: MessageFlags.Ephemeral });

    if (ownerId === state.p1) state.player1Number = Number(raw);
    else state.player2Number = Number(raw);
    await interaction.reply({ content: '✅ Tiradaada qarsoon waa la keydiyey.', flags: MessageFlags.Ephemeral });

    if (state.player1Number !== null && state.player2Number !== null) {
        await interaction.channel.send('✅ Labadii tiro waa la doortay. Wareegga koowaad ayaa bilaabanaya.').catch(() => {});
        return startTurns(state);
    }
}

async function handleChatGuess(message) {
    if (!message.guild || message.author.bot) return false;
    const state = activeNumberGames.get(message.channel.id);
    if (!state || state.phase !== 'playing' || state.currentTurn !== message.author.id) return false;
    const raw = message.content.trim();
    if (!/^\d{1,3}$/.test(raw)) return false;
    if (Number(raw) < 1 || Number(raw) > 100) {
        await message.reply('Geli tiro dhan oo u dhexeysa **1 iyo 100**.');
        return true;
    }
    await processGuess(state, message, message.author.id, raw);
    return true;
}

async function processGuess(state, message, ownerId, raw) {
    const guess = Number(raw);
    const targetNumber = ownerId === state.p1 ? state.player2Number : state.player1Number;
    state.guessCounts[ownerId]++;
    clearTimeout(state.timeout);

    if (guess === targetNumber) {
        state.found[ownerId] = true;
        const otherId = ownerId === state.p1 ? state.p2 : state.p1;
        if (state.found[otherId])
            return finishGame(state, message, `🤝 Labadiinuba waad heshay tiradii qarsoon. Ciyaartu barbaro ayay ku dhammaatay.`);
        if (state.guessCounts[otherId] >= state.guessCounts[ownerId])
            return finishGame(state, message, `🏆 <@${ownerId}> ayaa helay tiradii qarsoon oo guuleystay!`);

        state.currentTurn = otherId;
        state.lastChanceTurn = true;
        state.turnNumber++;
        await message.channel.send(`🎯 <@${ownerId}> wuxuu helay tiradii qarsoon! <@${otherId}> wuxuu haystaa hal fursad oo ugu dambaysa.`).catch(() => {});
    } else {
        const otherId = ownerId === state.p1 ? state.p2 : state.p1;
        const hint = guess < targetNumber ? 'tirada qarsoon way **ka weyn tahay** ⬆️' : 'tirada qarsoon way **ka yar tahay** ⬇️';
        await message.channel.send(`🔎 <@${ownerId}> guessed **${guess}** — ${hint}`).catch(() => {});
        if (state.lastChanceTurn) {
            const winnerId = state.found[otherId] ? otherId : null;
            const result = winnerId ? `🏆 <@${winnerId}> ayaa guuleystay.` : 'Ciyaartu way dhammaatay; guuleyste ma jiro.';
            return finishGame(state, message, result);
        }
        state.currentTurn = otherId;
        state.turnNumber++;
    }

    await state.prompt.edit({ embeds: [guessEmbed(state)], components: [] }).catch(() => {});
    state.timeout = setTimeout(() => {
        const winnerId = state.currentTurn === state.p1 ? state.p2 : state.p1;
        finishGame(state, state, `⏰ <@${state.currentTurn}> waqtigii wuu dhammaaday. 🏆 <@${winnerId}> ayaa guuleystay.`);
    }, TURN_TIMEOUT_MS);
}

async function tiroCommand(message) {
    const issuerId = message.author.id;
    const target = message.mentions.users.first();
    if (!target) return message.reply('Isticmaal: `?tiro @user`');
    if (target.bot) return message.reply('Bot lama ciyaari kartid.');
    if (target.id === issuerId) return message.reply('Naftaada lama casuumi kartid.');
    if (activeNumberGames.has(message.channel.id)) return message.reply('Channel-kan ciyaar tiro-qiyaas ah ayaa socota.');

    const issuerBusy = isUserBusy(issuerId);
    if (issuerBusy) return message.reply(`Hadda waxaad ku jirtaa ciyaarta **${issuerBusy}**.`);
    const targetBusy = isUserBusy(target.id);
    if (targetBusy) return message.reply(`<@${target.id}> wuxuu ku jiraa ciyaarta **${targetBusy}**.`);

    const state = { channelId: message.channel.id, p1: issuerId, p2: target.id, phase: 'pending' };
    activeNumberGames.set(state.channelId, state);
    const acceptId = `accept_tiro_${issuerId}_${target.id}`;
    const declineId = `decline_tiro_${issuerId}_${target.id}`;
    const sent = await message.reply({
        content: `${target}`,
        embeds: [new EmbedBuilder()
            .setTitle('🎯 Qabso Tiro — Caqabad')
            .setColor('#3498db')
            .setDescription(`<@${issuerId}> wuxuu kugu casuumay ciyaar tiro-qiyaas ah. Labadiinuba tiro qarsoodi ah ayaad dooran doontaan, kadibna midba midka kale ayuu qiyaasi doonaa.\n\n<@${target.id}>, ma aqbashaa?`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(acceptId).setLabel('Aqbal ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(declineId).setLabel('Diid ❌').setStyle(ButtonStyle.Danger),
        )],
        fetchReply: true,
    }).catch(() => null);
    if (!sent) {
        activeNumberGames.delete(state.channelId);
        return;
    }

    const inviteCollector = sent.createMessageComponentCollector({
        filter: interaction => interaction.customId === acceptId || interaction.customId === declineId,
        time: INVITE_TIMEOUT_MS,
    });
    inviteCollector.on('collect', async interaction => {
        if (interaction.user.id !== target.id)
            return interaction.reply({ content: 'Ciyaartan qofka la casuumay oo keliya ayaa ka jawaabi kara.', flags: MessageFlags.Ephemeral }).catch(() => {});
        if (activeNumberGames.get(state.channelId) !== state || state.phase !== 'pending')
            return interaction.reply({ content: 'Casuumaddu way dhacday.', flags: MessageFlags.Ephemeral }).catch(() => {});
        if (interaction.customId === declineId) {
            clearTimeout(state.timeout);
            activeNumberGames.delete(state.channelId);
            state.phase = 'finished';
            inviteCollector.stop('declined');
            return interaction.update({ content: '❌ Casuumaddii waa la diiday.', embeds: [], components: [] }).catch(() => {});
        }
        inviteCollector.stop('accepted');
        state.phase = 'picking';
        await interaction.update({ content: `✅ <@${target.id}> wuu aqbalay.`, embeds: [], components: [] }).catch(() => {});
        startPicking(message.channel, state).catch(() => finishGame(state, { channel: message.channel }, 'Ciyaartii lama bilaabi karin.'));
    });
    inviteCollector.on('end', async (_collected, reason) => {
        if (reason !== 'time' || activeNumberGames.get(state.channelId) !== state) return;
        activeNumberGames.delete(state.channelId);
        state.phase = 'finished';
        await sent.edit({ content: '⏰ Casuumaddii waqtigeedu wuu dhammaaday.', embeds: [], components: [] }).catch(() => {});
    });
}

module.exports = {
    tiroCommand,
    activeNumberGames,
    handlePickButton,
    handlePickSubmit,
    handleChatGuess,
};
