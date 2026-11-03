// =====================================================================
// GARAAD BOT — Team Duel (?2v2 / ?3v3)
// Coins-only · Auto-start when full · Max 25 questions · ?r @user
// =====================================================================

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { econData, saveEcon, checkEconUser, trackEarning } = require('../economy/econStore');
const { userData, saveData } = require('../store');
const { checkUser } = require('../utils/helpers');
const { fmt, stripQuestionNumber } = require('../utils/helpers');
const {
    pickQuestionsForGame,
    markSeenForUsersInGame,
} = require('../utils/questions');
const { getAnswerOptions } = require('../utils/questionOptions');
const { GLOBAL_WAIT_MS, SOLO_FAST_MS, SOLO_MAX_SCORE, SOLO_MIN_SCORE } = require('../config');
const { createRewardSession, rewardRow, rewardSummary, POINTS_PER_REWARD, IQ_PER_REWARD, COINS_PER_REWARD } = require('../utils/gameRewards');

// channelId → state
const activeTeamDuels = new Map();

const Q_DEFAULT = 10;
const Q_MIN     = 3;
const Q_MAX     = 25;
const MIN_BET   = 10;
const MAX_BET   = 100_000;

function calcTimedScore(ms) {
    if (ms <= SOLO_FAST_MS) return SOLO_MAX_SCORE;
    const ratio = (ms - SOLO_FAST_MS) / (GLOBAL_WAIT_MS - SOLO_FAST_MS);
    return Math.max(SOLO_MIN_SCORE, Math.round(SOLO_MAX_SCORE - (SOLO_MAX_SCORE - SOLO_MIN_SCORE) * ratio));
}

function allJoined(state)   { return [...state.teams[1], ...state.teams[2]]; }
function totalNeeded(state) { return state.maxPerTeam * 2; }
function teamOf(state, uid) {
    if (state.teams[1].includes(uid)) return 1;
    if (state.teams[2].includes(uid)) return 2;
    return null;
}

function deductCoins(uid, amount) { checkEconUser(uid); econData[uid].coins = (econData[uid].coins || 0) - amount; }
function refundCoins(uid, amount) { checkEconUser(uid); econData[uid].coins = (econData[uid].coins || 0) + amount; }
function refundAll(state)  { for (const uid of allJoined(state)) refundCoins(uid, state.stakeAmount); }

// ── Embeds / Rows ─────────────────────────────────────────────────────

function buildLobbyEmbed(state) {
    const t1     = state.teams[1].map(id => `<@${id}>`).join('\n') || '—';
    const t2     = state.teams[2].map(id => `<@${id}>`).join('\n') || '—';
    const joined = allJoined(state).length;
    const needed = totalNeeded(state);

    return new EmbedBuilder()
        .setTitle(`⚔️ ${state.mode.toUpperCase()} Team Duel — Lobby`)
        .setColor('#e67e22')
        .setDescription(
            `**Host:** <@${state.hostId}>\n` +
            `**🪙 Dhig player kasta:** ${fmt(state.stakeAmount)} Coins\n` +
            `**Su'aalood:** ${state.totalQ}\n\n` +
            `🔵 **Team 1** (${state.teams[1].length}/${state.maxPerTeam})\n${t1}\n\n` +
            `🔴 **Team 2** (${state.teams[2].length}/${state.maxPerTeam})\n${t2}\n\n` +
            `👥 **${joined}/${needed}** — buuxsho si the game starts`
        )
        .setFooter({ text: 'Host: ?r @user si player loo saaro lobby-ga' });
}

function lobbyRow(channelId, hostId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tduel_join_${channelId}`)             .setLabel('✅ Ku biir') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tduel_leave_${channelId}`)            .setLabel('🚪 Ka bax') .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tduel_start_${hostId}_${channelId}`) .setLabel('▶️ start')  .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tduel_cancel_${hostId}_${channelId}`).setLabel('❌ Jooji')  .setStyle(ButtonStyle.Danger),
    );
}

// ── Commands ──────────────────────────────────────────────────────────

async function cmdTeamGame(message, args, maxPerTeam) {
    if (!message.guild)
        return message.reply('⛔ Team duels can only be played in a server channel.');

    const channelId = message.channel.id;
    const hostId    = message.author.id;
    const mode      = maxPerTeam === 2 ? '2v2' : '3v3';

    if (activeTeamDuels.has(channelId))
        return message.reply(`⚠️ A ${mode} duel is already active in this channel. Wait for it to finish or ask the host to stop it.`);

    const amountArg = parseFloat(args[0]);
    if (!args[0] || isNaN(amountArg) || amountArg <= 0)
        return message.reply(
            `⚠️ Usage: \`?${mode} [Coins]\` or \`?${mode} [Coins] [questions]\`\n` +
            `Example: \`?${mode} 500\` or \`?${mode} 500 15\``
        );
    if (amountArg < MIN_BET)
        return message.reply(`⚠️ Min dhig waa **🪙 ${MIN_BET.toLocaleString()}**.`);
    if (amountArg > MAX_BET)
        return message.reply(`⚠️ Max dhig waa **🪙 ${fmt(MAX_BET)}**.`);

    checkEconUser(hostId);
    if ((econData[hostId].coins || 0) < amountArg)
        return message.reply(`⚠️ You do not have enough Coins. Wallet: **🪙 ${fmt(econData[hostId].coins || 0)}**`);

    const countRaw = args[1] ? parseInt(args[1]) : Q_DEFAULT;
    if (isNaN(countRaw) || countRaw < Q_MIN || countRaw > Q_MAX)
        return message.reply(`⚠️ Su'aalaha tirada waa inay u dhexeyso **${Q_MIN}–${Q_MAX}**.`);

    const state = {
        hostId,
        mode,
        maxPerTeam,
        stakeAmount: amountArg,
        teams:  { 1: [], 2: [] },
        scores: {},
        phase:     'lobby',
        questions: [],
        currentQ:  0,
        totalQ:    countRaw,
        channelId,
        lobbyMsg:  null,
    };

    activeTeamDuels.set(channelId, state);
    const msg = await message.reply({
        embeds:     [buildLobbyEmbed(state)],
        components: [lobbyRow(channelId, hostId)],
    });
    state.lobbyMsg = msg;
}

async function cmdTeamRemove(message) {
    const channelId = message.channel.id;
    const state     = activeTeamDuels.get(channelId);

    if (!state || state.phase !== 'lobby')
        return message.reply('⚠️ Lobby was not found channel-kan.');
    if (message.author.id !== state.hostId)
        return message.reply('⛔ Only the host can remove a player.');

    const target = message.mentions.users.first();
    if (!target)
        return message.reply('⚠️ Usage: `?r @user`');
    if (target.id === state.hostId)
        return message.reply('⚠️ The host cannot remove themselves. Click `❌ Stop` to end the duel.');

    const team = teamOf(state, target.id);
    if (team === null)
        return message.reply(`⚠️ <@${target.id}> lobby kuwas not found.`);

    state.teams[team].splice(state.teams[team].indexOf(target.id), 1);
    refundCoins(target.id, state.stakeAmount);
    saveEcon();

    await state.lobbyMsg?.edit({
        embeds:     [buildLobbyEmbed(state)],
        components: [lobbyRow(state.channelId, state.hostId)],
    }).catch(() => {});

    return message.reply(`✅ <@${target.id}> was removed from the lobby. **🪙 ${fmt(state.stakeAmount)}** was refunded.`);
}

// ── Button handlers ───────────────────────────────────────────────────

async function handleJoin(interaction, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'lobby')
        return interaction.reply({ content: '⚠️ Lobby was not found.', flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    if (teamOf(state, userId) !== null)
        return interaction.reply({ content: '✅ You have already joined!', flags: MessageFlags.Ephemeral });

    if (state.teams[1].length >= state.maxPerTeam && state.teams[2].length >= state.maxPerTeam)
        return interaction.reply({ content: '⚠️ Lobby waa buuxday!', flags: MessageFlags.Ephemeral });

    checkEconUser(userId);
    if ((econData[userId].coins || 0) < state.stakeAmount)
        return interaction.reply({
            content: `⚠️ You do not have enough Coins.\nWallet: **🪙 ${fmt(econData[userId].coins || 0)}** — Dhig: **🪙 ${fmt(state.stakeAmount)}**`,
            flags: MessageFlags.Ephemeral,
        });

    if (state.teams[1].length < state.maxPerTeam) state.teams[1].push(userId);
    else state.teams[2].push(userId);

    deductCoins(userId, state.stakeAmount);
    saveEcon();

    // Auto-start when all slots filled
    if (allJoined(state).length >= totalNeeded(state)) {
        await interaction.update({ embeds: [buildLobbyEmbed(state)], components: [lobbyRow(channelId, state.hostId)] });
        setTimeout(() => autoStart(interaction.channel, channelId), 1500);
        return;
    }

    return interaction.update({
        embeds:     [buildLobbyEmbed(state)],
        components: [lobbyRow(channelId, state.hostId)],
    });
}

async function handleLeave(interaction, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'lobby')
        return interaction.reply({ content: '⚠️ Lobby was not found.', flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    if (userId === state.hostId)
        return interaction.reply({ content: '⚠️ Host si loo baxo "❌ Jooji" gujiso.', flags: MessageFlags.Ephemeral });

    const team = teamOf(state, userId);
    if (team === null)
        return interaction.reply({ content: '⚠️ You are not in this lobby.', flags: MessageFlags.Ephemeral });

    state.teams[team].splice(state.teams[team].indexOf(userId), 1);
    refundCoins(userId, state.stakeAmount);
    saveEcon();

    return interaction.update({
        embeds:     [buildLobbyEmbed(state)],
        components: [lobbyRow(channelId, state.hostId)],
    });
}

async function handleStart(interaction, hostId, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'lobby')
        return interaction.reply({ content: '⚠️ Lobby was not found.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== hostId)
        return interaction.reply({ content: '⛔ Only the host can start the duel.', flags: MessageFlags.Ephemeral });

    const t1 = state.teams[1].length;
    const t2 = state.teams[2].length;
    if (t1 === 0 || t2 === 0)
        return interaction.reply({ content: '⚠️ Labada koob mid walba waa inuu leeyahay at least 1 player.', flags: MessageFlags.Ephemeral });
    if (t1 !== t2)
        return interaction.reply({ content: `⚠️ Koobabku waa inay isla tirsanyihiin. Team 1: ${t1} | Team 2: ${t2}`, flags: MessageFlags.Ephemeral });

    await interaction.update({ embeds: [buildStartEmbed(state)], components: [] });
    await prepareAndStart(interaction.channel, channelId);
}

async function handleCancel(interaction, hostId, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state)
        return interaction.reply({ content: '⚠️ Lobby was not found.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== hostId)
        return interaction.reply({ content: '⛔ Only the host can stop the duel.', flags: MessageFlags.Ephemeral });

    refundAll(state);
    saveEcon();
    activeTeamDuels.delete(channelId);

    return interaction.update({
        embeds: [new EmbedBuilder().setTitle('❌ Team Duel Cancelled').setDescription('The stakes have been refunded.').setColor('#e74c3c')],
        components: [],
    });
}

// ── Game start helpers ────────────────────────────────────────────────

function buildStartEmbed(state) {
    const players    = allJoined(state);
    const totalPrize = state.stakeAmount * players.length;
    return new EmbedBuilder()
        .setTitle(`⚔️ ${state.mode.toUpperCase()} — Bilaabmay! 🏆`)
        .setColor('#27ae60')
        .setDescription(
            `🔵 **Team 1:** ${state.teams[1].map(id => `<@${id}>`).join(', ')}\n` +
            `🔴 **Team 2:** ${state.teams[2].map(id => `<@${id}>`).join(', ')}\n\n` +
            `💰 **Total:** 🪙 ${fmt(totalPrize)}\n` +
            `📋 **${state.totalQ}** questions\n\n` +
            `Question 1 is coming up...`
        );
}

async function autoStart(channel, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'lobby') return;

    const startEmbed = buildStartEmbed(state);
    await state.lobbyMsg?.edit({ embeds: [startEmbed], components: [] }).catch(() => {});
    await prepareAndStart(channel, channelId);
}

async function prepareAndStart(channel, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state) return;

    const questions = pickQuestionsForGame(state.hostId, 'team', state.totalQ);
    if (!questions || questions.length === 0) {
        refundAll(state);
        saveEcon();
        activeTeamDuels.delete(channelId);
        await channel.send('⚠️ No questions were found. The stakes have been refunded.').catch(() => {});
        return;
    }

    state.questions = questions;
    state.totalQ    = questions.length;
    state.phase     = 'playing';
    for (const uid of allJoined(state)) state.scores[uid] = 0;

    setTimeout(() => sendTeamQuestion(channel, channelId), 3000);
}

// ── Game loop ─────────────────────────────────────────────────────────

async function sendTeamQuestion(channel, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'playing') return;
    if (state.currentQ >= state.totalQ) return finishTeamDuel(channel, channelId);

    const qIndex  = state.currentQ;
    const q       = state.questions[qIndex];
    const players = allJoined(state);

    markSeenForUsersInGame(players, 'team', q._idx);

    const entries = getAnswerOptions(q);
    if (entries.length === 0) {
        refundAll(state);
        saveEcon();
        activeTeamDuels.delete(channelId);
        await channel.send('⚠️ Invalid question. The stakes have been refunded.').catch(() => {});
        return;
    }

    const t1Score = state.teams[1].reduce((s, id) => s + (state.scores[id] || 0), 0);
    const t2Score = state.teams[2].reduce((s, id) => s + (state.scores[id] || 0), 0);

    const qEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${state.mode.toUpperCase()} — Su'aal ${qIndex + 1}/${state.totalQ}`)
        .setColor('#9b59b6')
        .setDescription(
            `## ${stripQuestionNumber(q.question)}\n\n` +
            `⏱️ ${GLOBAL_WAIT_MS / 1000}s\n\n` +
            `🔵 Team 1: **${t1Score}** | 🔴 Team 2: **${t2Score}**`
        );

    const buttons = entries.map((e, i) =>
        new ButtonBuilder()
            .setCustomId(`tduel_ans_${channelId}_${qIndex}_${i}_${e.isCorrect ? 't' : 'f'}`)
            .setLabel(e.label.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
    );

    let msg;
    try {
        msg = await channel.send({ embeds: [qEmbed], components: [new ActionRowBuilder().addComponents(buttons)] });
    } catch (e) {
        console.error('[TeamDuel] Failed to send question:', e.message);
        refundAll(state);
        saveEcon();
        activeTeamDuels.delete(channelId);
        await channel.send('⚠️ The question could not be sent. The stakes have been refunded.').catch(() => {});
        return;
    }
    state.currentMsg = msg;

    const answeredThisQ   = new Set();
    const questionStartMs = Date.now();

    const collector = msg.createMessageComponentCollector({
        filter: i => i.customId.startsWith(`tduel_ans_${channelId}_${qIndex}_`) && players.includes(i.user.id),
        time: GLOBAL_WAIT_MS,
    });

    collector.on('collect', async interaction => {
        if (answeredThisQ.has(interaction.user.id))
            return interaction.reply({ content: '↩️ You already answered this question!', flags: MessageFlags.Ephemeral }).catch(() => {});
        answeredThisQ.add(interaction.user.id);

        const isCorrect = interaction.customId.endsWith('_t');
        checkUser(interaction.user.id);
        if (isCorrect) {
            const pts  = calcTimedScore(Date.now() - questionStartMs);
            const secs = ((Date.now() - questionStartMs) / 1000).toFixed(1);
            state.scores[interaction.user.id] = (state.scores[interaction.user.id] || 0) + pts;
            userData[interaction.user.id].iq = (userData[interaction.user.id].iq || 0) + 2;
            saveData();
            await interaction.reply({ content: `✅ Correct! +${pts} points · +2 IQ · ⏱️ ${secs}s`, flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            userData[interaction.user.id].iq = Math.max(0, (userData[interaction.user.id].iq || 0) - 1);
            saveData();
            await interaction.reply({ content: '❌ Incorrect! −1 IQ · 0 points', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (answeredThisQ.size >= players.length) collector.stop('all_answered');
    });

    collector.on('end', async () => {
        const cur = activeTeamDuels.get(channelId);
        if (!cur || cur.phase !== 'playing') return;

        const correctLabel = entries.find(e => e.isCorrect)?.label || String(q.correct);
        const newT1 = cur.teams[1].reduce((s, id) => s + (cur.scores[id] || 0), 0);
        const newT2 = cur.teams[2].reduce((s, id) => s + (cur.scores[id] || 0), 0);

        const summaryEmbed = new EmbedBuilder()
            .setTitle(`⚔️ ${state.mode.toUpperCase()} — Su'aal ${qIndex + 1}/${cur.totalQ}`)
            .setColor('#2ecc71')
            .setDescription(
                `## ${stripQuestionNumber(q.question)}\n\n` +
                `✅ **${correctLabel}**\n\n` +
                `🔵 Team 1: **${newT1}** | 🔴 Team 2: **${newT2}**`
            );

        await msg.edit({ embeds: [summaryEmbed], components: [] }).catch(() => {});
        cur.currentQ++;
        setTimeout(() => sendTeamQuestion(channel, channelId), 2500);
    });
}

async function finishTeamDuel(channel, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state) return;

    const t1Score    = state.teams[1].reduce((s, id) => s + (state.scores[id] || 0), 0);
    const t2Score    = state.teams[2].reduce((s, id) => s + (state.scores[id] || 0), 0);
    const players    = allJoined(state);
    const totalPrize = state.stakeAmount * players.length;

    let resultEmbed;

    if (t1Score === t2Score) {
        refundAll(state);
        resultEmbed = new EmbedBuilder()
            .setTitle('🤝 Team Duel — Iskumid!')
            .setColor('#f1c40f')
            .setDescription(
                `🔵 Team 1: **${t1Score}** points\n` +
                `🔴 Team 2: **${t2Score}** points\n\n` +
                `It's a tie! The stakes have been refunded.`
            );
    } else {
        const winTeam   = t1Score > t2Score ? 1 : 2;
        const loseTeam  = winTeam === 1 ? 2 : 1;
        const winIds    = state.teams[winTeam];
        const loseIds   = state.teams[loseTeam];
        const perWinner = Math.floor(totalPrize / winIds.length);

        for (const uid of winIds) {
            checkEconUser(uid);
            econData[uid].coins = (econData[uid].coins || 0) + perWinner;
            trackEarning(uid, perWinner);
        }

        const icon = winTeam === 1 ? '🔵' : '🔴';
        resultEmbed = new EmbedBuilder()
            .setTitle(`🏆 ${state.mode.toUpperCase()} — Dhamaatay!`)
            .setColor('#2ecc71')
            .setDescription(
                `${icon} **Team ${winTeam}:** **${Math.max(t1Score, t2Score)}** points 🏆\n` +
                `${winTeam === 1 ? '🔴' : '🔵'} **Team ${loseTeam}:** **${Math.min(t1Score, t2Score)}** points\n\n` +
                `🥇 **Guulayste:** ${winIds.map(id => `<@${id}>`).join(', ')}\n` +
                `   player kasta: **+🪙 ${fmt(perWinner)}**\n\n` +
                `💀 **Lumiyay:** ${loseIds.map(id => `<@${id}>`).join(', ')}\n` +
                `   player kasta: **−🪙 ${fmt(state.stakeAmount)}**`
            );
    }

    saveEcon();
    activeTeamDuels.delete(channelId);

    const rewardPoints = Object.fromEntries(players.map(uid => [uid, state.scores[uid] || 0]));
    const rewardSessionId = createRewardSession(state.mode.toUpperCase(), rewardPoints);
    const rewardLines = players
        .map(uid => `<@${uid}> — ${rewardSummary(rewardPoints[uid])}`)
        .join('\n');

    resultEmbed.addFields({
        name: '🎁 Abaalmarin points',
        value: `${rewardLines}\nChoose IQ or Coins. (${POINTS_PER_REWARD} pts = ${IQ_PER_REWARD} IQ or ${COINS_PER_REWARD} Coins)`,
    });

    await channel.send({ embeds: [resultEmbed], components: [rewardRow(rewardSessionId)] });
}

async function handleNonParticipantAnswer(interaction, channelId) {
    const state = activeTeamDuels.get(channelId);
    if (!state || state.phase !== 'playing')
        return interaction.reply({ content: '⚠️ No game is active.', flags: MessageFlags.Ephemeral });
    if (!allJoined(state).includes(interaction.user.id))
        return interaction.reply({ content: '⛔ You are not in this game and cannot answer.', flags: MessageFlags.Ephemeral });
}

module.exports = {
    activeTeamDuels,
    cmd2v2:    (message, args) => cmdTeamGame(message, args, 2),
    cmd3v3:    (message, args) => cmdTeamGame(message, args, 3),
    cmdTeamDuel: (message, args) => cmdTeamGame(message, args, 2), // legacy compat
    cmdTeamRemove,
    handleJoin,
    handleLeave,
    handleStart,
    handleCancel,
    handleNonParticipantAnswer,
};
