const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon, getTreasury, addToTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const INTEREST_RATE     = 0.01;
const INTEREST_TAX_RATE = 0.10; // 10% of interest goes to treasury
const INTEREST_INTERVAL = 24 * 60 * 60 * 1000;
const LOAN_MAX          = 2_500;
const LOAN_FEE          = 100;
const LOAN_OWED         = LOAN_MAX + LOAN_FEE;
const DEDUCT_AFTER_MS   = 3 * 24 * 60 * 60 * 1000;
const EAT_OFFSET        = 3 * 60 * 60 * 1000; // UTC+3 Somalia

function isBankOpen() {
    const eat = new Date(Date.now() + EAT_OFFSET);
    const day = eat.getUTCDay();
    return (day === 4 && eat.getUTCHours() >= 1) || day === 5;
}

function getThursdayWindowStart() {
    const eat = new Date(Date.now() + EAT_OFFSET);
    const day = eat.getUTCDay();
    let daysBack = (day - 4 + 7) % 7;
    if (day === 4 && eat.getUTCHours() < 1) daysBack = 7;
    const thu = new Date(eat);
    thu.setUTCDate(eat.getUTCDate() - daysBack);
    thu.setUTCHours(1, 0, 0, 0);
    return thu.getTime() - EAT_OFFSET;
}

function usedWeeklyLoan(d) {
    return (d.lastLoanTaken || 0) >= getThursdayWindowStart();
}

function applyInterest(d) {
    const now = Date.now();
    d.lastInterest   ??= now;
    d.interestEarned ??= { garaad: 0 };
    d.interestEarned.garaad ??= 0;

    const days = Math.floor((now - d.lastInterest) / INTEREST_INTERVAL);
    if (days <= 0) return;

    if (d.banks.garaad > 0) {
        const gross             = Math.floor(d.banks.garaad * INTEREST_RATE * days);
        const tax               = Math.floor(gross * INTEREST_TAX_RATE);
        const interest          = gross - tax;
        d.banks.garaad         += interest;
        d.interestEarned.garaad += interest;
        if (tax > 0) addToTreasury(tax);
    }
    d.lastInterest = now;
}

function bankTotalDeposits() {
    return Object.values(econData)
        .filter(d => d && typeof d === 'object' && !d.__treasury__)
        .reduce((sum, d) => sum + (d.banks?.garaad || 0), 0);
}

function bankTotalInterest() {
    return Object.values(econData)
        .filter(d => d && typeof d === 'object' && !d.__treasury__)
        .reduce((sum, d) => sum + (d.interestEarned?.garaad || 0), 0);
}

// ── Embeds ────────────────────────────────────────────────────────

function buildMainEmbed(d) {
    const wallet   = fmt(d.btc || 0);
    const garaad   = fmt(d.banks?.garaad || 0);
    const pubBanks = Object.values(require('../../../src/economy/bankStore').getAllPublicBanks());
    const myPub    = pubBanks.find(b => b.members?.[d.__id__ || ''] || b.deposits?.[d.__id__ || '']);
    const pubName  = myPub ? myPub.name : null;
    const pubBal   = myPub ? fmt(myPub.deposits?.[d.__id__ || ''] || 0) : '0';
    const total    = fmt((d.btc || 0) + (d.banks?.garaad || 0) + (myPub ? (myPub.deposits?.[d.__id__ || ''] || 0) : 0));
    const pubTotal = myPub ? fmt(myPub.balance || 0) : '₿0';
    const garaadTotal = fmt(bankTotalDeposits());

    const desc =
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\n` +
        `💰 **𝐇𝐀𝐍𝐓𝐈𝐃𝐀𝐀𝐃𝐀**\n` +
        `\n` +
        `💵 Wallet         ➜ ₿${wallet}\n` +
        `🏦 Garaad Bank    ➜ ₿${garaad}\n` +
        (pubName ? `🏛️ ${pubName}   ➜ ₿${pubBal}\n` : `🏛️ Kormaal Bank   ➜ ₿0\n`) +
        `\n` +
        `📊 Wadarta Guud   ➜ ₿${total}\n` +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\n` +
        `🏦 **𝐁𝐀𝐍𝐊𝐈𝐘𝐀𝐃𝐀**\n` +
        `\n` +
        `💎 Garaad Bank\n` +
        `└ 📈 Interest: 1% Maalinle\n` +
        `└ 💰 Kaydka Bankiga: ₿${garaadTotal}\n` +
        `\n` +
        (pubName
            ? `🌐 ${pubName}\n` +
              `└ 💰 Kaydka Bankiga: ₿${pubTotal}\n` +
              `└ 📥 Kaydkaaga: ₿${pubBal}\n`
            : `🌐 Kormaal Bank\n` +
              `└ 💰 Kaydka Bankiga: ₿0\n` +
              `└ 📥 Kaydkaaga: ₿0\n`
        ) +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\n` +
        `⚙️ **𝐀𝐌𝐀𝐑𝐑𝐀𝐃𝐀**\n` +
        `\n` +
        `📥 Deposit\n` +
        `➜ \`?d Garaad Bank <xad>\`\n` +
        (pubName ? `➜ \`?d ${pubName} <xad>\`\n` : `➜ \`?d Kormaal Bank <xad>\`\n`) +
        `\n` +
        `📤 Withdraw\n` +
        `➜ \`?w Garaad Bank <xad>\`\n` +
        (pubName ? `➜ \`?w ${pubName} <xad>\`\n` : `➜ \`?w Kormaal Bank <xad>\`\n`) +
        `\n` +
        `📋 Tusaalooyin\n` +
        `\n` +
        `➜ \`?d Garaad Bank 250\`\n` +
        (pubName ? `➜ \`?d ${pubName} 500\`\n` : `➜ \`?d Kormaal Bank 500\`\n`) +
        `\n` +
        `➜ \`?w Garaad Bank 50\`\n` +
        (pubName ? `➜ \`?w ${pubName} 100\`\n` : `➜ \`?w Kormaal Bank 100\`\n`) +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    return new EmbedBuilder()
        .setTitle('🏛️ 🏦 𝐁𝐀𝐍𝐊 𝐌𝐀𝐍𝐀𝐆𝐄𝐑')
        .setColor('#1a73e8')
        .setDescription(desc)
        .setFooter({ text: '🟢 DEPOSIT   🔵 WITHDRAW   🔴 XIR' });
}

function buildBankEmbed(d) {
    return new EmbedBuilder()
        .setTitle('🏦 Garaad Bank — Savings')
        .setColor('#2471a3')
        .addFields(
            { name: '🏦 Bank Balance',    value: `**₿ ${fmt(d.banks.garaad)}**`,                inline: true },
            { name: '💳 Wallet',          value: `**₿ ${fmt(d.btc || 0)}**`,                     inline: true },
            { name: '📈 Interest Earned', value: `**+₿ ${fmt(d.interestEarned?.garaad || 0)}**`, inline: true },
            { name: '📊 Rate',            value: '**1% per day**',                                inline: true },
            { name: '🏛️ Total Deposits',  value: `**₿ ${fmt(bankTotalDeposits())}**`,            inline: true },
        )
        .setFooter({ text: 'Garaad Bank • Deposit to grow your BTC' });
}

function buildTreasuryEmbed() {
    const t = getTreasury();
    return new EmbedBuilder()
        .setTitle('🏛️ Treasury')
        .setColor('#8e44ad')
        .addFields(
            { name: '🏛️ Balance',   value: `**₿ ${fmt(t.balance  || 0)}**`, inline: true },
            { name: '📥 Total In',  value: `**₿ ${fmt(t.totalIn  || 0)}**`, inline: true },
            { name: '📤 Total Out', value: `**₿ ${fmt(t.totalOut || 0)}**`, inline: true },
        )
        .setFooter({ text: 'Garaad Bank • Sources: shop, flips, tax' });
}


// ── Rows ──────────────────────────────────────────────────────────

function bankFullRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eco_eba_deposit_garaad_${userId}`) .setLabel('🟢 DEPOSIT')  .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`eco_eba_withdraw_garaad_${userId}`).setLabel('🔵 WITHDRAW') .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`)            .setLabel('🔴 XIR')      .setStyle(ButtonStyle.Danger),
    );
}

function ebCloseRow(userId) {
    return null; // merged into bankFullRow
}

function actionRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eco_eba_deposit_garaad_${userId}`) .setLabel('⬇️ Deposit') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`eco_eba_withdraw_garaad_${userId}`).setLabel('⬆️ Withdraw').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`)            .setLabel('✖ Close')    .setStyle(ButtonStyle.Danger),
    );
}

function backRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eco_eb_main_${userId}`).setLabel('🔙 Back') .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );
}

function closeRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );
}

// ── Command ───────────────────────────────────────────────────────

module.exports = async function ebankCmd(message) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];
    applyInterest(d);
    saveEcon();
    return message.reply({
        embeds:     [buildMainEmbed(d)],
        components: [bankFullRow(userId)],
    });
};

module.exports.applyInterest      = applyInterest;
module.exports.bankTotalDeposits  = bankTotalDeposits;
module.exports.bankTotalInterest  = bankTotalInterest;
module.exports.buildMainEmbed     = buildMainEmbed;
module.exports.buildBankEmbed     = buildBankEmbed;
module.exports.buildTreasuryEmbed = buildTreasuryEmbed;
module.exports.buildKhaznadEmbed  = buildTreasuryEmbed;
module.exports.bankFullRow        = bankFullRow;
module.exports.ebCloseRow         = ebCloseRow;
module.exports.actionRow          = actionRow;
module.exports.backRow            = backRow;
module.exports.closeRow           = closeRow;
