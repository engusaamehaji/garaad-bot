const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData } = require('../../../src/economy/econStore');
const { fmt, getDisplayName } = require('../../../src/utils/helpers');

const BTC_ICON = 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png';

async function buildRichLeaderboard(client, guild, authorId) {
    const allEntries = Object.entries(econData)
        .filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d && typeof d === 'object')
        .map(([uid, d]) => {
            const bankSum = d.banks ? Object.values(d.banks).reduce((acc, val) => acc + (Number(val) || 0), 0) : 0;
            const personalBank = d.personalBank?.balance || 0;
            const total = (Number(d.btc) || 0) + bankSum + personalBank;
            return { uid, total };
        })
        .filter(item => item.total > 0)
        .sort((a, b) => b.total - a.total);

    const top10 = allEntries.slice(0, 10);
    const top10Total = top10.reduce((acc, curr) => acc + curr.total, 0);

    const rankBadges = ['🥇 👑', '🥈 💎', '🥉 ✨', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    const lines = await Promise.all(top10.map(async ({ uid, total }, index) => {
        const name = await getDisplayName(client, guild, uid);
        const badge = rankBadges[index] || `**${index + 1}.**`;
        return `${badge} **${name}** — ₿ **${fmt(total)}**`;
    }));

    const authorIndex = allEntries.findIndex(e => e.uid === authorId);
    let authorStatusStr = 'Wali ma galin liiska';
    if (authorIndex !== -1) {
        const userTotal = allEntries[authorIndex].total;
        authorStatusStr = `Rank **#${authorIndex + 1}** ka mid ah ${allEntries.length} • ₿ **${fmt(userTotal)}**`;
    }

    const embed = new EmbedBuilder()
        .setTitle('👑 ₿ TOP 10 — Hantiilayaasha ugu Qanisan')
        .setColor('#F7931A')
        .setThumbnail(BTC_ICON)
        .setDescription(lines.length > 0 ? lines.join('\n\n') : '_Wali xog hantiileyaal ah ma jirto._')
        .addFields(
            { name: '📊 Total Top 10 Wealth', value: `₿ **${fmt(top10Total)}**`, inline: true },
            { name: '📍 Your Rank', value: authorStatusStr, inline: true }
        )
        .setFooter({ text: 'Garaad Economy • BTC Leaderboard • 🔄 Live Data', iconURL: BTC_ICON })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`refresh_rich_${authorId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`close_rich_${authorId}`)
            .setLabel('✖ Xir')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

async function richCmd(message) {
    const payload = await buildRichLeaderboard(message.client, message.guild, message.author.id);
    return message.reply(payload);
}

module.exports = richCmd;
module.exports.buildRichLeaderboard = buildRichLeaderboard;
