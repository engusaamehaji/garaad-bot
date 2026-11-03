const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { ECON_TITLES }             = require('./econShop');
const { banksData } = require('../../../src/economy/bankStore');
const { getCoinWealthByUser } = require('../../../src/economy/coinWealth');

const COINS_ICON = 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/coins.png';

function fmtW(n) {
    return Math.round(n || 0).toLocaleString();
}

function getPlayerRank(userId) {
    const entries = Object.entries(getCoinWealthByUser(econData, banksData))
        .sort(([, a], [, b]) => b - a);
    const idx = entries.findIndex(([uid]) => uid === userId);
    return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
}

function buildJeebEmbed(userId, username, deposited = 0) {
    checkEconUser(userId);
    const d = econData[userId];

    const coins    = d.coins           || 0;
    const wealth = getCoinWealthByUser(econData, banksData)[userId] || 0;
    const bankAndDeposits = Math.max(0, wealth - coins);
    const streak = d.streak        || 0;
    const { rank, total: playerCount } = getPlayerRank(userId);
    const rankStr = rank ? `**#${rank}** / ${playerCount}` : '—';

    const titleLabel = (() => {
        if (!d.activeEconTitle) return '';
        if (d.activeEconTitle === 'custom') return d.customEconTitle ? ` / ${d.customEconTitle}` : '';
        return ECON_TITLES[d.activeEconTitle] ? ` / ${ECON_TITLES[d.activeEconTitle].label}` : '';
    })();

    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const loanLine = d.loan?.owed ? `\n⚠️ **Loan:** 🪙 ${fmtW(d.loan.owed)}` : '';

    const desc =
        `# 👤 ${username}${titleLabel}\n` +
        `💳 **Wallet:** 🪙 ${fmtW(coins)}  •  🏆 **Rank:** ${rankStr}\n` +
        `🏦 **Banks & deposits:** 🪙 ${fmtW(bankAndDeposits)}\n` +
        `💰 **Total Coins:** 🪙 ${fmtW(wealth)}\n` +
        `🔥 **Streak:** ${streak} day${streak !== 1 ? 's' : ''}` +
        loanLine +
        (deposited > 0 ? `\n📥 Deposited **${fmtW(deposited)} Coins** into Garaad Bank.` : '') + `\n\n` +
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
    let deposited = 0;

    // Running ?jeeb on your own account deposits your wallet into Garaad Bank.
    if (!target || userId === authorId) {
        checkEconUser(authorId);
        const account = econData[authorId];
        const amount = Math.max(0, Math.floor(Number(account.coins) || 0));
        if (amount > 0) {
            account.banks ??= { garaad: 0 };
            account.banks.garaad = (Number(account.banks.garaad) || 0) + amount;
            account.coins = 0;
            deposited = amount;
            saveEcon();
        }
    }

    // Get member for server nickname
    let member = null;
    try { member = await message.guild?.members.fetch(userId); } catch {}
    const user        = target || message.author;
    const displayName = getDisplayName(user, member);

    return message.reply({
        embeds:     [buildJeebEmbed(userId, displayName, deposited)],
        components: [jeebRow(authorId, userId)],
    });
};

module.exports.buildJeebEmbed = buildJeebEmbed;
module.exports.jeebRow        = jeebRow;
