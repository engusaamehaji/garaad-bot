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

const activeNumberGames = new Map(); // channelId -> pending or active game
const INVITE_TIMEOUT_MS = 60_000;
const GUESS_TIMEOUT_MS = 60_000;

function challengeEmbed(issuerId, targetId) {
    return new EmbedBuilder()
        .setTitle('🎯 Number Guess Challenge')
        .setColor('#3498db')
        .setDescription(
            `<@${issuerId}> challenged <@${targetId}> to a fair number guessing game.\n\n` +
            `Both players guess at the same time, one guess per round. The secret number is from **1 to 100**. ` +
            `After each round, I will say whether the secret is higher or lower.\n\n` +
            `<@${targetId}>, accept to play!`
        )
        .setFooter({ text: 'The challenge expires in 60 seconds.' });
}

function gameEmbed(state) {
    return new EmbedBuilder()
        .setTitle('🎯 Number Guess — Game Started')
        .setColor('#3498db')
        .setDescription(
            `Players: <@${state.p1}> and <@${state.p2}>\n` +
            `I have chosen a secret number from **1 to 100**.\n\n` +
            `Each round, both players click **Enter Guess** and privately submit a whole number from **1 to 100**. ` +
            `I will say **higher** or **lower** without revealing either guess. First to guess the secret wins.\n\n` +
            `You have **60 seconds** to enter each guess.`
        )
        .setFooter({ text: `Round ${state.round}` });
}

function guessRow(state) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tiro_guess_${state.channelId}_${state.round}`)
            .setLabel('Enter Guess 🔢')
            .setStyle(ButtonStyle.Primary),
    );
}

async function finishGame(channel, state, reason) {
    if (activeNumberGames.get(channel.id) !== state) return;
    clearTimeout(state.timeout);
    activeNumberGames.delete(channel.id);
    state.phase = 'ended';
    await state.prompt?.edit({ components: [] }).catch(() => {});

    if (reason === 'winner') {
        return channel.send(
            `🏆 <@${state.winnerId}> guessed the secret number **${state.secret}** and won! ` +
            `Rounds played: **${state.round}**.`
        ).catch(() => {});
    }
    if (reason === 'tie') {
        return channel.send(`🤝 Both players guessed **${state.secret}** in the same round. It's a tie!`).catch(() => {});
    }

    const guesses = [...state.guesses.keys()];
    if (guesses.length === 1) {
        const winnerId = guesses[0];
        const loserId = winnerId === state.p1 ? state.p2 : state.p1;
        const guess = state.guesses.get(winnerId);
        if (guess === state.secret) {
            return channel.send(
                `🏆 <@${winnerId}> guessed the secret number **${state.secret}**! ` +
                `<@${loserId}> ran out of time.`
            ).catch(() => {});
        }
        return channel.send(
            `🏆 <@${winnerId}> wins! <@${loserId}> did not submit a guess within 60 seconds. ` +
            `The secret number was **${state.secret}**.`
        ).catch(() => {});
    }
    return channel.send('⏰ The number game ended because neither player guessed in time. No winner this round.').catch(() => {});
}

async function startGuessing(channel, state) {
    state.phase = 'playing';
    state.channel = channel;
    state.channelId = channel.id;
    state.secret = Math.floor(Math.random() * 100) + 1;
    state.round = 1;
    state.guesses = new Map();
    state.prompt = await channel.send({ embeds: [gameEmbed(state)], components: [guessRow(state)] }).catch(() => null);
    if (!state.prompt) return finishGame(channel, state, 'cancelled');
    state.timeout = setTimeout(() => {
        finishGame(state.channel, state, 'timeout').catch(() => {});
    }, GUESS_TIMEOUT_MS);
}

async function handleNumberGuessButton(interaction) {
    const [, , channelId, roundText] = interaction.customId.split('_');
    const round = Number(roundText);
    const state = activeNumberGames.get(channelId);

    if (!state || state.phase !== 'playing' || state.round !== round) {
        return interaction.reply({ content: 'This guessing round has ended. Use the current button.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== state.p1 && interaction.user.id !== state.p2) {
        return interaction.reply({ content: 'You are not a player in this number game.', flags: MessageFlags.Ephemeral });
    }
    if (state.guesses.has(interaction.user.id)) {
        return interaction.reply({ content: 'Your guess is already submitted for this round.', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`tiro_guess_modal_${channelId}_${round}_${interaction.user.id}`)
        .setTitle('Private Number Guess');
    const numberInput = new TextInputBuilder()
        .setCustomId('number')
        .setLabel('Enter a whole number from 1 to 100')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(3)
        .setPlaceholder('1–100')
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(numberInput));
    return interaction.showModal(modal);
}

async function handleNumberGuessSubmit(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts[3];
    const round = Number(parts[4]);
    const ownerId = parts[5];
    const state = activeNumberGames.get(channelId);

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: 'This private guess form belongs to another player.', flags: MessageFlags.Ephemeral });
    }
    if (!state || state.phase !== 'playing' || state.round !== round) {
        return interaction.reply({ content: 'This guessing round has ended. Open the current guess button.', flags: MessageFlags.Ephemeral });
    }
    if (state.guesses.has(ownerId)) {
        return interaction.reply({ content: 'Your guess is already submitted for this round.', flags: MessageFlags.Ephemeral });
    }

    const raw = interaction.fields.getTextInputValue('number').trim();
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) {
        return interaction.reply({ content: 'Enter a whole number from 1 to 100.', flags: MessageFlags.Ephemeral });
    }

    const guess = Number(raw);
    state.guesses.set(ownerId, guess);
    clearTimeout(state.timeout);
    state.timeout = setTimeout(() => {
        finishGame(state.channel, state, 'timeout').catch(() => {});
    }, GUESS_TIMEOUT_MS);

    await interaction.reply({ content: 'Your guess was submitted privately.', flags: MessageFlags.Ephemeral });
    if (state.guesses.size < 2) return;

    clearTimeout(state.timeout);
    const p1Guess = state.guesses.get(state.p1);
    const p2Guess = state.guesses.get(state.p2);
    const p1Correct = p1Guess === state.secret;
    const p2Correct = p2Guess === state.secret;
    const channel = state.channel;

    if (p1Correct && p2Correct) {
        return finishGame(channel, state, 'tie');
    }
    if (p1Correct || p2Correct) {
        state.winnerId = p1Correct ? state.p1 : state.p2;
        return finishGame(channel, state, 'winner');
    }

    const hint = value => value < state.secret ? 'the secret is **higher** ⬆️' : 'the secret is **lower** ⬇️';
    await channel.send(
        `🔎 **Round ${state.round} results**\n` +
        `<@${state.p1}>: ${hint(p1Guess)}\n` +
        `<@${state.p2}>: ${hint(p2Guess)}\n\n` +
        `Both players, submit your next guess privately.`
    ).catch(() => {});

    state.round++;
    state.guesses.clear();
    await state.prompt.edit({ embeds: [gameEmbed(state)], components: [guessRow(state)] }).catch(() => {});
    state.timeout = setTimeout(() => {
        finishGame(state.channel, state, 'timeout').catch(() => {});
    }, GUESS_TIMEOUT_MS);
}

async function numberGuessCommand(message) {
    const issuerId = message.author.id;
    const target = message.mentions.users.first();

    if (!target) return message.reply('Use `?tiro @user` to challenge someone.');
    if (target.bot) return message.reply('You cannot challenge a bot.');
    if (target.id === issuerId) return message.reply('You cannot challenge yourself.');
    if (activeNumberGames.has(message.channel.id)) return message.reply('A number game is already active in this channel.');

    const issuerBusy = isUserBusy(issuerId);
    if (issuerBusy) return message.reply(`You are already playing **${issuerBusy}**. Finish that game first.`);
    const targetBusy = isUserBusy(target.id);
    if (targetBusy) return message.reply(`<@${target.id}> is already playing **${targetBusy}**.`);

    const state = { p1: issuerId, p2: target.id, phase: 'pending', guesses: new Map() };
    activeNumberGames.set(message.channel.id, state);

    const acceptId = `accept_tiro_${issuerId}_${target.id}`;
    const declineId = `decline_tiro_${issuerId}_${target.id}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(acceptId).setLabel('Accept ✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(declineId).setLabel('Decline ❌').setStyle(ButtonStyle.Danger),
    );

    const sent = await message.reply({
        content: `${target}`,
        embeds: [challengeEmbed(issuerId, target.id)],
        components: [row],
        fetchReply: true,
    }).catch(() => null);
    if (!sent) {
        activeNumberGames.delete(message.channel.id);
        return;
    }

    const challengeCollector = sent.createMessageComponentCollector({
        filter: interaction => interaction.customId === acceptId || interaction.customId === declineId,
        time: INVITE_TIMEOUT_MS,
    });

    challengeCollector.on('collect', async interaction => {
        if (interaction.user.id !== target.id) {
            return interaction.reply({ content: 'This challenge is only for the mentioned player.', ephemeral: true }).catch(() => {});
        }
        if (activeNumberGames.get(message.channel.id) !== state || state.phase !== 'pending') {
            return interaction.update({ content: 'This number game challenge has expired.', embeds: [], components: [] }).catch(() => {});
        }

        if (interaction.customId === declineId) {
            activeNumberGames.delete(message.channel.id);
            state.phase = 'ended';
            challengeCollector.stop('declined');
            return interaction.update({ content: '❌ Number game challenge declined.', embeds: [], components: [] }).catch(() => {});
        }

        state.phase = 'playing';
        challengeCollector.stop('accepted');
        await interaction.update({ content: `✅ <@${target.id}> accepted!`, embeds: [], components: [] }).catch(() => {});
        startGuessing(message.channel, state).catch(() => finishGame(message.channel, state, 'cancelled'));
    });

    challengeCollector.on('end', async (_collected, reason) => {
        if (reason !== 'time' || activeNumberGames.get(message.channel.id) !== state) return;
        activeNumberGames.delete(message.channel.id);
        state.phase = 'ended';
        await sent.edit({ content: '⏰ Number game challenge expired.', embeds: [], components: [] }).catch(() => {});
    });
}

module.exports = {
    numberGuessCommand,
    activeNumberGames,
    handleNumberGuessButton,
    handleNumberGuessSubmit,
};
