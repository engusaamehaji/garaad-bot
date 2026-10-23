// =====================================================================
// ?open [common|rare|legendary] — Loot Box
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { econData, saveEcon }  = require('../../src/economy/econStore');
const { checkUser, checkAndAwardBadges } = require('../../src/utils/helpers');
const { FRAMES, BADGES, BOOSTERS, LOOT_BOXES, rollLoot } = require('../../src/utils/itemDefs');

const RARITY_COLORS = { Common: '#95a5a6', Rare: '#3498db', Epic: '#9b59b6', Legendary: '#f39c12', Mythic: '#e74c3c' };

function grantLootReward(userId, result) {
    checkUser(userId);
    const d  = userData[userId];
    const ec = econData[userId];

    let desc = '';
    if (result.type === 'btc') {
        const mult = (ec?.boosters?.doubleBtc > Date.now()) ? 2 : 1;
        const amt  = result.key * mult;
        if (ec) ec.btc = (ec.btc || 0) + amt;
        desc = `₿ **+${amt.toLocaleString()} BTC**`;
        saveEcon();
    } else if (result.type === 'frame') {
        const frame = FRAMES[result.key];
        if (!d.ownedFrames.includes(result.key)) d.ownedFrames.push(result.key);
        const rarity = frame?.rarity || 'Common';
        desc = `🖼️ **${frame?.emoji || ''} ${frame?.name || result.key}** (${rarity})`;
    } else if (result.type === 'booster') {
        const boost = BOOSTERS[result.key];
        if (result.key === 'iq_shield') {
            d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
        } else if (result.key === 'double_iq') {
            d.boosters.doubleIq  = Date.now() + (boost?.duration || 3600000);
        } else if (result.key === 'double_xp') {
            d.boosters.doubleXp  = Date.now() + (boost?.duration || 3600000);
        } else if (result.key === 'double_btc') {
            d.boosters.doubleBtc = Date.now() + (boost?.duration || 3600000);
        }
        desc = `⚡ **${boost?.emoji || ''} ${boost?.name || result.key}**`;
    } else if (result.type === 'badge') {
        if (!d.badges.includes(result.key)) d.badges.push(result.key);
        const badge = BADGES[result.key];
        desc = `🏅 **${badge?.emoji || ''} ${badge?.name || result.key}** badge`;
    }

    d.stats.lootOpened = (d.stats.lootOpened || 0) + 1;
    checkAndAwardBadges(userId);
    saveData();
    return desc;
}

module.exports = async function openCmd(message, args) {
    const userId  = message.author.id;
    checkUser(userId);
    const d = userData[userId];

    const type = (args[0] || 'common').toLowerCase();
    if (!['common', 'rare', 'legendary'].includes(type))
        return message.reply('⚠️ Isticmaal: `?open common`, `?open rare`, ama `?open legendary`');

    const box = LOOT_BOXES[type];

    // Show inventory if no args
    if (!args[0]) {
        const inv = d.lootBoxes || {};
        const lines = Object.entries(LOOT_BOXES).map(([k, b]) => `${b.emoji} **${b.name}** — **${inv[k] || 0}** qof`);
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📦 Sanduuqyadaada — Your Loot Boxes')
                .setColor('#9b59b6')
                .setDescription(lines.join('\n'))
                .setFooter({ text: '?open common / rare / legendary' })
            ]
        });
    }

    if (!(d.lootBoxes?.[type] > 0))
        return message.reply(`📦 **${box.emoji} ${box.name}** kuma lihid. Dukaan ka iibso: \`?shop loot\``);

    // Deduct box
    d.lootBoxes[type]--;
    saveData();

    // Suspense animation
    const suspense = await message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`${box.emoji} ${box.name} Waa La Furayayaa...`)
            .setColor(box.color)
            .setDescription('⏳ Eeg waxa ku jira...\n\n🎲 🎲 🎲')
        ]
    });

    await new Promise(r => setTimeout(r, 1500));
    await suspense.edit({
        embeds: [new EmbedBuilder()
            .setTitle(`${box.emoji} ${box.name} Waa La Furayayaa...`)
            .setColor(box.color)
            .setDescription('✨ ✨ ✨\n\n🎲 🎲 🎲')
        ]
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 1200));

    const result  = rollLoot(type);
    const rewardDesc = grantLootReward(userId, result);

    let rarity = 'Common';
    if (result.type === 'frame' && FRAMES[result.key]) rarity = FRAMES[result.key].rarity;

    const color  = RARITY_COLORS[rarity] || '#95a5a6';

    return suspense.edit({
        embeds: [new EmbedBuilder()
            .setTitle(`🎉 ${box.emoji} ${box.name} — Natiijo!`)
            .setColor(color)
            .setDescription(`**Abaalmarintaada:**\n\n${rewardDesc}`)
            .addFields(
                { name: '📦 Sanduuqyo Haray', value: `${box.emoji} ${box.name}: **${d.lootBoxes[type]}** haray`, inline: true },
                { name: '📋 Guud', value: `Sanduuqyo la furay: **${d.stats.lootOpened}**`, inline: true }
            )
            .setFooter({ text: 'Garaad Bot • Loot Box System' })
        ]
    }).catch(() => {});
};
