const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser } = require('../../../src/economy/econStore');
const { ECON_TITLES }             = require('./econShop');

const BTC_ICON = 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png';

function fmtW(n) {
    return Math.round(n || 0).toLocaleString();
}

function getPlayerRank(userId) {
    const entries = Object.entries(econData).filter(([k]) => /^\d{17,19}$/.test(k));
    entries.sort(([, a], [, b]) => (b.btc || 0) - (a.btc || 0));
    const idx = entries.findIndex(([uid]) => uid === userId);
    return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
}

function buildJeebEmbed(userId, username) {
    checkEconUser(userId);
    const d = econData[userId];

    const btc    = d.btc           || 0;
    const bank   = d.banks?.garaad || 0;
    const streak = d.streak        || 0;
    const total  = Math.max(0, btc + bank - (d.loan?.owed || 0));
    const { rank, total: playerCount } = getPlayerRank(userId);
    const rankStr = rank ? `**#${rank}** / ${playerCount}` : '—';

    const titleLabel = (() => {
        if (!d.activeEconTitle) return '';
        if (d.activeEconTitle === 'custom') return d.customEconTitle ? ` / ${d.customEconTitle}` : '';
        return ECON_TITLES[d.activeEconTitle] ? ` / ${ECON_TITLES[d.activeEconTitle].label}` : '';
    })();

    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const loanLine = d.loan?.owed ? `\n⚠️ **Loan:** ₿ ${fmtW(d.loan.owed)}` : '';

    const desc =
        `# 👤 ${username}${titleLabel}\n` +
        `💳 **Wallet:** ₿ ${fmtW(btc)}  •  🏆 **Rank:** ${rankStr}\n` +
        `🔥 **Streak:** ${streak} day${streak !== 1 ? 's' : ''}` +
        loanLine + `\n\n` +
        `**🏛️ Garaad Economy**\n` +
        `🕐 *${time}*`;

    return new EmbedBuilder()
        .setDescription(desc)
        .setColor('#f39c12');
}

function jeebRow(authorId, targetId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`jeeb_refresh_${authorId}_${targetId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`close_jeeb_${authorId}`)
            .setLabel('✖ Close')
            .setStyle(ButtonStyle.Danger),
    );
}

function getDisplayName(user, member) {
    // Priority: server nickname > global display name > username
    return member?.nickname || user?.globalName || user?.displayName || user?.username || 'Unknown';
}

module.exports = async function jeebCmd(message) {
    const authorId = message.author.id;
    const target   = message.mentions.users.first();
    const userId   = target ? target.id : authorId;

    // Get member for server nickname
    let member = null;
    try { member = await message.guild?.members.fetch(userId); } catch {}
    const user        = target || message.author;
    const displayName = getDisplayName(user, member);

    return message.reply({
        embeds:     [buildJeebEmbed(userId, displayName)],
        components: [jeebRow(authorId, userId)],
    });
};

module.exports.buildJeebEmbed = buildJeebEmbed;
module.exports.jeebRow        = jeebRow;
