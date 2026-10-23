const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../store');
const { checkUser, applyIqChange } = require('./helpers');
const { econData, checkEconUser, saveEcon } = require('../economy/econStore');

const POINTS_PER_REWARD = 50;
const IQ_PER_REWARD = 2;
const BTC_PER_REWARD = 100;
const rewardSessions = new Map();

function calcReward(points) {
    const units = Math.floor(Math.max(0, points || 0) / POINTS_PER_REWARD);
    return {
        units,
        iq: units * IQ_PER_REWARD,
        btc: units * BTC_PER_REWARD,
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
    return `${points || 0} pts → ${reward.iq} IQ ama ${reward.btc} BTC`;
}

function rewardRow(sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gr_iq_${sessionId}`)
            .setLabel(`🧠 IQ qaado`)
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
        return interaction.reply({ content: '⚠️ Abaalmarintan adiga kuma jirto.', flags: 64 });
    }
    if (entry.claimed) {
        return interaction.reply({ content: `✅ Horey ayaad u qaadatay: **${entry.choice.toUpperCase()}**.`, flags: 64 });
    }

    const reward = calcReward(entry.points);
    if (reward.units < 1) {
        return interaction.reply({
            content: `⚠️ Waxaad haysataa **${entry.points} pts**. Ugu yaraan **${POINTS_PER_REWARD} pts** ayaa abaalmarin lagu qaataa.`,
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
            content: `✅ **${session.gameName}**: ${entry.points} pts → **+${actual} IQ**. Hadda: **${userData[userId].iq} IQ**`,
            flags: 64,
        });
    }

    if (choice === 'btc') {
        econData[userId].btc = (econData[userId].btc || 0) + reward.btc;
        entry.claimed = true;
        entry.choice = 'btc';
        saveEcon();
        return interaction.reply({
            content: `✅ **${session.gameName}**: ${entry.points} pts → **+₿${reward.btc.toLocaleString()} BTC**. Hadda: **₿${(econData[userId].btc || 0).toLocaleString()}**`,
            flags: 64,
        });
    }

    return interaction.reply({ content: '⚠️ Doorasho lama fahmin.', flags: 64 });
}

module.exports = {
    POINTS_PER_REWARD,
    IQ_PER_REWARD,
    BTC_PER_REWARD,
    calcReward,
    createRewardSession,
    rewardSummary,
    rewardRow,
    handleGameRewardChoice,
};
