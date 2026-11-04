const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
            `Each round, both players must type one whole number from **1 to 100** in chat. ` +
            `After both guesses, I will say **higher** or **lower**. First to guess the secret wins.\n\n` +
            `You have **60 seconds** to enter each guess.`
        )
        .setFooter({ text: `Round ${state.round}` });
}

function finishGame(channel, state, collector, reason) {
    if (activeNumberGames.get(channel.id) !== state) return;
    activeNumberGames.delete(channel.id);

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

function startGuessing(channel, state) {
    state.phase = 'playing';
    state.secret = Math.floor(Math.random() * 100) + 1;
    state.round = 1;
    state.guesses = new Map();

    channel.send({ embeds: [gameEmbed(state)] }).catch(() => {});

    const collector = channel.createMessageCollector({
        filter: message => message.author.id === state.p1 || message.author.id === state.p2,
        time: GUESS_TIMEOUT_MS,
    });

    collector.on('collect', async message => {
        const raw = message.content.trim();
        if (!/^\d+$/.test(raw)) return;

        const guess = Number(raw);
        if (guess < 1 || guess > 100) {
            await message.reply('Choose a whole number from **1 to 100**.').catch(() => {});
            return;
        }
        if (state.guesses.has(message.author.id)) {
            await message.reply('You already guessed this round. Wait for the other player.').catch(() => {});
            return;
        }

        state.guesses.set(message.author.id, guess);
        collector.resetTimer({ time: GUESS_TIMEOUT_MS });

        if (state.guesses.size < 2) {
            await message.reply('Guess received. Waiting for the other player.').catch(() => {});
            return;
        }

        const p1Guess = state.guesses.get(state.p1);
        const p2Guess = state.guesses.get(state.p2);
        const p1Correct = p1Guess === state.secret;
        const p2Correct = p2Guess === state.secret;

        if (p1Correct && p2Correct) {
            collector.stop('tie');
            return;
        }
        if (p1Correct || p2Correct) {
            state.winnerId = p1Correct ? state.p1 : state.p2;
            collector.stop('winner');
            return;
        }

        const hint = value => value < state.secret ? 'secret is **higher** ⬆️' : 'secret is **lower** ⬇️';
        const roundResult =
            `🔎 **Round ${state.round} results**\n` +
            `<@${state.p1}> guessed **${p1Guess}** — ${hint(p1Guess)}\n` +
            `<@${state.p2}> guessed **${p2Guess}** — ${hint(p2Guess)}\n\n` +
            `Both players, enter your next guess from **1 to 100**.`;

        state.round++;
        state.guesses.clear();
        await channel.send(roundResult).catch(() => {});
    });

    collector.on('end', (_collected, reason) => finishGame(channel, state, collector, reason));
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
        startGuessing(message.channel, state);
    });

    challengeCollector.on('end', async (_collected, reason) => {
        if (reason !== 'time' || activeNumberGames.get(message.channel.id) !== state) return;
        activeNumberGames.delete(message.channel.id);
        state.phase = 'ended';
        await sent.edit({ content: '⏰ Number game challenge expired.', embeds: [], components: [] }).catch(() => {});
    });
}

module.exports = { numberGuessCommand, activeNumberGames };
