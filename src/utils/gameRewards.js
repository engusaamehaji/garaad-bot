const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../store');
const { checkUser, applyIqChange } = require('./helpers');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../economy/econStore');

const POINTS_PER_REWARD = 50;
const IQ_PER_REWARD = 2;
const COINS_PER_REWARD = 100;
const rewardSessions = new Map();

function calcReward(points) {
    const units = Math.floor(Math.max(0, points || 0) / POINTS_PER_REWARD);
    return {
        units,
        iq: units * IQ_PER_REWARD,
        coins: units * COINS_PER_REWARD,
    };
}

function createRewardSession(gameName, rewardsByUser) {
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const rewards = {};

    for (const [userId, points] of Object.entries(rewardsByUser || {})) {
        rewards[userId] = {
            points: Math.max(0, Math.floor(points || 0)),
            claimed: false,
            choice: null,
        };
    }

    rewardSessions.set(sessionId, {
        gameName,
        rewards,
        createdAt: Date.now(),
    });
    return sessionId;
}

function rewardSummary(points) {
    const reward = calcReward(points);
    if (reward.units < 1) return `${points || 0} pts → abaalmarin ma gaarin`;
    return `${points || 0} pts → ${reward.iq} IQ ama ${reward.coins} Coins`;
}

function rewardRow(sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gr_iq_${sessionId}`)
            .setLabel(`🧠 IQ claim`)
            .setStyle(ButtonStyle.Primary),
    );
}

async function handleGameRewardChoice(interaction) {
    const parts = interaction.customId.split('_');
    const choice = parts[1];
    const sessionId = parts[2];
    const session = rewardSessions.get(sessionId);

    if (!session) {
        return interaction.reply({ content: '⚠️ Abaalmarintan way dhacday ama bot restart ayaa dhacay.', flags: 64 });
    }

    const userId = interaction.user.id;
    const entry = session.rewards[userId];
    if (!entry) {
        return interaction.reply({ content: '⚠️ Abaalmarintan adiga kuwas not found.', flags: 64 });
    }
    if (entry.claimed) {
        return interaction.reply({ content: `✅ Horey ayaad u qaadatay: **${entry.choice.toUpperCase()}**.`, flags: 64 });
    }

    const reward = calcReward(entry.points);
    if (reward.units < 1) {
        return interaction.reply({
            content: `⚠️ you you have **${entry.points} pts**. Ugu yaraan **${POINTS_PER_REWARD} pts** ayaa abaalmarin lagu qaataa.`,
            flags: 64,
        });
    }

    checkUser(userId);
    checkEconUser(userId);

    if (choice === 'iq') {
        const actual = applyIqChange(userId, reward.iq);
        entry.claimed = true;
        entry.choice = 'iq';
        saveData();
        return interaction.reply({
            content: `✅ **${session.gameName}**: ${entry.points} pts → **+${actual} IQ**. Current: **${userData[userId].iq} IQ**`,
            flags: 64,
        });
    }

    if (choice === 'coins') {
        econData[userId].coins = (econData[userId].coins || 0) + reward.coins;
        trackEarning(userId, reward.coins);
        entry.claimed = true;
        entry.choice = 'coins';
        saveEcon();
        return interaction.reply({
            content: `✅ **${session.gameName}**: ${entry.points} pts → **+🪙${reward.coins.toLocaleString()} Coins**. Current: **🪙${(econData[userId].coins || 0).toLocaleString()}**`,
            flags: 64,
        });
    }

    return interaction.reply({ content: '⚠️ Doorasho lama fahmin.', flags: 64 });
}

module.exports = {
    POINTS_PER_REWARD,
    IQ_PER_REWARD,
    COINS_PER_REWARD,
    calcReward,
    createRewardSession,
    rewardSummary,
    rewardRow,
    handleGameRewardChoice,
};
