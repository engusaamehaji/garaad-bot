// =====================================================================
// ?missions — Daily Missions (snapshot-based tracking)
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { econData, saveEcon }  = require('../../src/economy/econStore');
const { checkUser, todayKey, checkAndAwardBadges } = require('../../src/utils/helpers');

const MISSION_POOL = [
    { id: 'solo_5',    desc: '🎮 Solo quiz 5 games ku ciyaar',          type: 'soloPlayed',  target: 5,  reward: { btc: 600,  xp: 60  } },
    { id: 'solo_3',    desc: '🎮 Solo quiz 3 games ku ciyaar',          type: 'soloPlayed',  target: 3,  reward: { btc: 350,  xp: 35  } },
    { id: 'correct_10',desc: '✅ 10 su\'aal si sax ah u jaawab',        type: 'soloCorrect', target: 10, reward: { btc: 500,  xp: 50  } },
    { id: 'correct_5', desc: '✅ 5 su\'aal si sax ah u jaawab',         type: 'soloCorrect', target: 5,  reward: { btc: 250,  xp: 25  } },
    { id: 'quiz_play', desc: '🏆 Quiz hal mar ka qayb qaado',           type: 'quizPlayed',  target: 1,  reward: { btc: 300,  xp: 30  } },
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
    const s = (userData[userId]?.stats) || {};
    return {
        soloPlayed:  s.soloPlayed  || 0,
        soloCorrect: s.soloCorrect || 0,
        duelWins:    s.duelWins    || 0,
        duelTotal:   (s.duelWins || 0) + (s.duelLosses || 0) + (s.duelDraws || 0),
        quizPlayed:  s.quizPlayed  || 0,
    };
}

function getCurrentValue(userId, type) {
    const s = userData[userId]?.stats || {};
    if (type === 'duelTotal') return (s.duelWins || 0) + (s.duelLosses || 0) + (s.duelDraws || 0);
    return s[type] || 0;
}

function ensureMissions(userId) {
    checkUser(userId);
    const d   = userData[userId];
    const today = todayKey();
    if (d.missions.date !== today) {
        d.missions = {
            date:     today,
            tasks:    pickMissions().map(m => ({ ...m, claimed: false })),
            baseline: getBaseline(userId),
        };
    }
}

function rewardText(r) {
    const parts = [];
    if (r.btc)  parts.push(`₿${r.btc.toLocaleString()}`);
        if (r.loot) parts.push(`📦 Common Box`);
    return parts.join(' + ');
}

function buildMissionButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`missions_claim_1_${userId}`).setLabel('Claim 1').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`missions_claim_2_${userId}`).setLabel('Claim 2').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`missions_claim_3_${userId}`).setLabel('Claim 3').setStyle(ButtonStyle.Primary),
    );
}

async function handleMissionClaim(interaction) {
    const parts = interaction.customId.split('_');
    const idx   = parseInt(parts[2], 10) - 1;
    const ownerId = parts[3];

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⚠️ Farriintan adiga kuma codsanin.', flags: 64 });
    }

    ensureMissions(ownerId);
    const d  = userData[ownerId];
    const ec = econData[ownerId] || {};

    if (isNaN(idx) || idx < 0 || idx > 2) {
        return interaction.reply({ content: '⚠️ Waxaa jira saddex mission oo kaliya: 1, 2, 3.', flags: 64 });
    }

    const task = d.missions.tasks[idx];
    if (!task) {
        return interaction.reply({ content: '⚠️ Mission-kaas ma jiro.', flags: 64 });
    }
    if (task.claimed) {
        return interaction.reply({ content: '✅ Mission-kaas horay ayaad u qaadatay.', flags: 64 });
    }

    const base     = d.missions.baseline[task.type] || 0;
    const current  = getCurrentValue(ownerId, task.type);
    const progress = current - base;

    if (progress < task.target) {
        return interaction.reply({ content: `⏳ Mission-kaas wali dhammaystirna. **${progress}/${task.target}** ✓`, flags: 64 });
    }

    task.claimed = true;
    const r = task.reward;
    if (r.btc) {
        if (!econData[ownerId]) econData[ownerId] = { btc: 1000 };
        econData[ownerId].btc = (econData[ownerId].btc || 0) + r.btc;
    }
    if (r.xp) d.xp = (d.xp || 0) + r.xp;
    if (r.loot) {
        d.lootBoxes       ??= {};
        d.lootBoxes[r.loot] = (d.lootBoxes[r.loot] || 0) + 1;
    }
    d.stats.missionsCompleted = (d.stats.missionsCompleted || 0) + 1;
    checkAndAwardBadges(ownerId);
    saveData();
    if (r.btc) saveEcon();

    const lines = d.missions.tasks.map((task, i) => {
        const base     = d.missions.baseline[task.type] || 0;
        const current  = getCurrentValue(ownerId, task.type);
        const progress = Math.min(task.target, current - base);
        const status   = task.claimed ? '✅ Claimed' : progress >= task.target ? '✅ Done — `?missions claim ' + (i + 1) + '`' : `⏳ ${progress}/${task.target}`;
        return `**${i+1}.** ${task.desc}\n    🎁 ${rewardText(task.reward)}  •  ${status}`;
    });

    const embed = new EmbedBuilder()
        .setTitle('🎉 Mission La Dhameystiray!')
        .setColor('#27ae60')
        .setDescription(
            `**${task.desc}**\n\n` +
            `🎁 **Abaalmarinta:** ${rewardText(r)}\n\n` +
            `**Haddaad rabto, waxaad arki kartaa missions-ka kale oo aad dib u qaadan kartaa.**`
        );

    await interaction.update({ embeds: [embed], components: [buildMissionButtons(ownerId)] }).catch(() => {});
    return interaction.followUp({ content: '✅ Mission-kaa waa la qaatay! Haddii aad rabto, ku noqo ?missions si aad u eegto xaaladda.', flags: 64 });
}

module.exports = async function missionsCmd(message, args) {
    const userId = message.author.id;
    checkUser(userId);

    // ?missions claim <1|2|3>
    if (args[0] === 'claim') {
        const idx = parseInt(args[1]) - 1;
        ensureMissions(userId);
        const d   = userData[userId];
        const ec  = econData[userId] || {};

        if (isNaN(idx) || idx < 0 || idx > 2)
            return message.reply('⚠️ Isticmaal: `?missions claim 1`, `?missions claim 2`, ama `?missions claim 3`');

        const task = d.missions.tasks[idx];
        if (!task)
            return message.reply('⚠️ Mission-kaas ma jiro.');
        if (task.claimed)
            return message.reply('✅ Mission-kaas horay ayaad u qaadatay.');

        const base    = d.missions.baseline[task.type] || 0;
        const current = getCurrentValue(userId, task.type);
        const progress = current - base;

        if (progress < task.target)
            return message.reply(`⏳ Mission-kaas wali dhammaystirna. **${progress}/${task.target}** ✓`);

        // Grant reward
        task.claimed = true;
        const r = task.reward;
        if (r.btc) {
            if (!econData[userId]) econData[userId] = { btc: 1000 };
            econData[userId].btc = (econData[userId].btc || 0) + r.btc;
        }
        if (r.xp) d.xp = (d.xp || 0) + r.xp;
        if (r.loot) {
            d.lootBoxes       ??= {};
            d.lootBoxes[r.loot] = (d.lootBoxes[r.loot] || 0) + 1;
        }
        d.stats.missionsCompleted = (d.stats.missionsCompleted || 0) + 1;
        checkAndAwardBadges(userId);
        saveData();
        if (r.btc) saveEcon();

        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🎉 Mission La Dhameystiray!')
                .setColor('#27ae60')
                .setDescription(
                    `**${task.desc}**\n\n` +
                    `🎁 **Abaalmarinta:** ${rewardText(r)}`
                )
                .setFooter({ text: 'Garaad Bot • Daily Missions' })
            ]
        });
    }

    // Show missions
    ensureMissions(userId);
    const d = userData[userId];

    const lines = d.missions.tasks.map((task, i) => {
        const base     = d.missions.baseline[task.type] || 0;
        const current  = getCurrentValue(userId, task.type);
        const progress = Math.min(task.target, current - base);
        const done     = progress >= task.target;
        const status   = task.claimed ? '✅ Claimed' : done ? '✅ Done — `?missions claim ' + (i+1) + '`' : `⏳ ${progress}/${task.target}`;
        return `**${i+1}.** ${task.desc}\n    🎁 ${rewardText(task.reward)}  •  ${status}`;
    });

    const allDone  = d.missions.tasks.every(t => t.claimed);
    const completedUsers = Object.entries(userData).filter(([_uid, u]) =>
        u.missions?.date === d.missions.date &&
        Array.isArray(u.missions?.tasks) &&
        u.missions.tasks.length === 3 &&
        u.missions.tasks.every(task => task.claimed)
    );
    const completedText = completedUsers.length === 0
        ? 'Wali cidna ma dhammaystirin maanta.'
        : completedUsers.slice(0, 5).map(([uid, u]) => {
            const name = econData[uid]?.username;
            return name ? `**${name}**` : `<@${uid}>`;
        }).join('\n') + (completedUsers.length > 5 ? `\n…+${completedUsers.length - 5} kale` : '');

    const embed = new EmbedBuilder()
        .setTitle('📋 Howlaha Maalinlaha ah — Daily Missions')
        .setColor('#3498db')
        .setDescription(lines.join('\n\n'))
        .addFields(
            { name: '📅 Taariikhda', value: `Maanta: **${d.missions.date}**`, inline: true },
            { name: '✅ Dhameystiray maanta', value: completedText }
        )
        .setFooter({ text: allDone ? '🎉 Dhamaan missions waa la dhamaystiray!' : 'Riix badhamada hoose ama isticmaal ?missions claim <1/2/3>' });

    return message.reply({ embeds: [embed], components: [buildMissionButtons(userId)] });
};

module.exports.handleMissionClaim = handleMissionClaim;
module.exports.buildMissionButtons = buildMissionButtons;
