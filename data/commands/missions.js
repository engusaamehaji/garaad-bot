const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { econData, saveEcon, trackEarning } = require('../../src/economy/econStore');
const { checkUser, todayKey, checkAndAwardBadges } = require('../../src/utils/helpers');

const MISSION_POOL = [
    { id: 'solo_5', desc: '🎮 Play 5 solo quiz games', type: 'soloPlayed', target: 5, reward: { coins: 600, xp: 60 } },
    { id: 'solo_3', desc: '🎮 Play 3 solo quiz games', type: 'soloPlayed', target: 3, reward: { coins: 350, xp: 35 } },
    { id: 'correct_10', desc: '✅ Answer 10 questions correctly', type: 'soloCorrect', target: 10, reward: { coins: 500, xp: 50 } },
    { id: 'correct_5', desc: '✅ Answer 5 questions correctly', type: 'soloCorrect', target: 5, reward: { coins: 250, xp: 25 } },
    { id: 'quiz_play', desc: '🏆 Join a quiz game', type: 'quizPlayed', target: 1, reward: { coins: 300, xp: 30 } },
];

function pickMissions() {
    const pool = [...MISSION_POOL];
    const picked = [];
    while (picked.length < 3 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
}

function getBaseline(userId) {
    const stats = userData[userId]?.stats || {};
    return {
        soloPlayed: stats.soloPlayed || 0,
        soloCorrect: stats.soloCorrect || 0,
        duelWins: stats.duelWins || 0,
        duelTotal: (stats.duelWins || 0) + (stats.duelLosses || 0) + (stats.duelDraws || 0),
        quizPlayed: stats.quizPlayed || 0,
    };
}

function getCurrentValue(userId, type) {
    const stats = userData[userId]?.stats || {};
    if (type === 'duelTotal') return (stats.duelWins || 0) + (stats.duelLosses || 0) + (stats.duelDraws || 0);
    return stats[type] || 0;
}

function ensureMissions(userId) {
    checkUser(userId);
    const data = userData[userId];
    const today = todayKey();
    if (data.missions.date !== today) {
        data.missions = {
            date: today,
            tasks: pickMissions().map(mission => ({ ...mission, claimed: false })),
            baseline: getBaseline(userId),
        };
    }
    for (const task of data.missions.tasks || []) {
        if (task.reward?.coins == null && task.reward?.btc != null)
            task.reward.coins = task.reward.btc;
        if (task.reward) delete task.reward.btc;
    }
}

function rewardText(reward) {
    const parts = [];
    if (reward.coins) parts.push(`🪙${reward.coins.toLocaleString()} Coins`);
    if (reward.xp) parts.push(`${reward.xp.toLocaleString()} XP`);
    if (reward.loot) parts.push('📦 Common Box');
    return parts.join(' + ') || 'No reward';
}

function buildMissionButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`missions_claim_1_${userId}`).setLabel('Claim 1').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`missions_claim_2_${userId}`).setLabel('Claim 2').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`missions_claim_3_${userId}`).setLabel('Claim 3').setStyle(ButtonStyle.Primary),
    );
}

async function grantMissionReward(userId, task) {
    const reward = task.reward || {};
    if (reward.coins) {
        if (!econData[userId]) econData[userId] = { coins: 1000 };
        econData[userId].coins = (econData[userId].coins || 0) + reward.coins;
        trackEarning(userId, reward.coins);
    }
    if (reward.xp) userData[userId].xp = (userData[userId].xp || 0) + reward.xp;
    if (reward.loot) {
        userData[userId].lootBoxes ??= {};
        userData[userId].lootBoxes[reward.loot] = (userData[userId].lootBoxes[reward.loot] || 0) + 1;
    }
    task.claimed = true;
    userData[userId].stats.missionsCompleted = (userData[userId].stats.missionsCompleted || 0) + 1;
    checkAndAwardBadges(userId);
    saveData();
    if (reward.coins) saveEcon();
}

function buildMissionEmbed(userId) {
    const data = userData[userId];
    const lines = data.missions.tasks.map((task, index) => {
        const baseline = data.missions.baseline[task.type] || 0;
        const progress = Math.min(task.target, getCurrentValue(userId, task.type) - baseline);
        const done = progress >= task.target;
        const status = task.claimed ? '✅ Claimed' : done ? `✅ Ready — use ?missions claim ${index + 1}` : `⏳ ${progress}/${task.target}`;
        return `**${index + 1}. ${task.desc}**\n🎁 ${rewardText(task.reward)} • ${status}`;
    });
    const allDone = data.missions.tasks.every(task => task.claimed);
    const completed = Object.entries(userData).filter(([, user]) =>
        user.missions?.date === data.missions.date &&
        Array.isArray(user.missions?.tasks) &&
        user.missions.tasks.length === 3 &&
        user.missions.tasks.every(task => task.claimed)
    );
    const completedText = completed.length === 0
        ? 'No players have completed missions today.'
        : completed.slice(0, 5).map(([id, user]) => econData[id]?.username || `<@${id}>`).join('\n') +
          (completed.length > 5 ? `\n…and ${completed.length - 5} more` : '');

    return new EmbedBuilder()
        .setTitle('📋 Daily Missions')
        .setColor('#3498db')
        .setDescription(lines.join('\n\n'))
        .addFields(
            { name: '📅 Date', value: `**${data.missions.date}**`, inline: true },
            { name: '✅ Completed today', value: completedText },
        )
        .setFooter({ text: allDone ? '🎉 All missions completed!' : 'Claim a reward below or use ?missions claim <1/2/3>.' });
}

async function claimMission(interaction, userId, index) {
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '⚠️ This mission panel belongs to another player.', flags: 64 });
    }
    ensureMissions(userId);
    const task = userData[userId].missions.tasks[index];
    if (!task) return interaction.reply({ content: '⚠️ Choose a mission number from 1 to 3.', flags: 64 });
    if (task.claimed) return interaction.reply({ content: '✅ You already claimed this mission.', flags: 64 });

    const baseline = userData[userId].missions.baseline[task.type] || 0;
    const progress = getCurrentValue(userId, task.type) - baseline;
    if (progress < task.target) {
        return interaction.reply({ content: `⏳ Mission not complete yet: **${progress}/${task.target}**.`, flags: 64 });
    }

    await grantMissionReward(userId, task);
    const embed = new EmbedBuilder()
        .setTitle('🎉 Mission Completed!')
        .setColor('#27ae60')
        .setDescription(`**${task.desc}**\n\n🎁 **Reward:** ${rewardText(task.reward)}\n\nUse ?missions to view your other missions.`);
    await interaction.update({ embeds: [embed], components: [buildMissionButtons(userId)] }).catch(() => {});
    return interaction.followUp({ content: '✅ Mission claimed!', flags: 64 });
}

async function handleMissionClaim(interaction) {
    const parts = interaction.customId.split('_');
    const index = parseInt(parts[2], 10) - 1;
    const userId = parts[3];
    if (Number.isNaN(index) || index < 0 || index > 2) {
        return interaction.reply({ content: '⚠️ Choose a mission number from 1 to 3.', flags: 64 });
    }
    ensureMissions(userId);
    return claimMission(interaction, userId, index);
}

module.exports = async function missionsCmd(message, args) {
    const userId = message.author.id;
    checkUser(userId);
    ensureMissions(userId);

    if (args[0] === 'claim') {
        const index = parseInt(args[1], 10) - 1;
        const task = userData[userId].missions.tasks[index];
        if (Number.isNaN(index) || index < 0 || index > 2) {
            return message.reply('⚠️ Usage: ?missions claim 1, 2, or 3.');
        }
        if (!task) return message.reply('⚠️ Mission not found.');
        if (task.claimed) return message.reply('✅ You already claimed this mission.');
        const baseline = userData[userId].missions.baseline[task.type] || 0;
        const progress = getCurrentValue(userId, task.type) - baseline;
        if (progress < task.target) {
            return message.reply(`⏳ Mission not complete yet: **${progress}/${task.target}**.`);
        }
        await grantMissionReward(userId, task);
        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('🎉 Mission Completed!')
            .setColor('#27ae60')
            .setDescription(`**${task.desc}**\n\n🎁 **Reward:** ${rewardText(task.reward)}`)
            .setFooter({ text: 'Garaad Bot • Daily Missions' })] });
    }

    return message.reply({ embeds: [buildMissionEmbed(userId)], components: [buildMissionButtons(userId)] });
};

module.exports.handleMissionClaim = handleMissionClaim;
module.exports.buildMissionButtons = buildMissionButtons;
