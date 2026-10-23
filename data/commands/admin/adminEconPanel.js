const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon, getTreasury, topUpTreasury, deductFromTreasury, addToTreasury } = require('../../../src/economy/econStore');
const { ECON_TITLES } = require('../economy/econShop');
const { fmt } = require('../../../src/utils/helpers');
const { PREFIX } = require('../../../src/config');

const OWNER_ID = '1191096205955055690';

function getEconStats() {
    const users = Object.entries(econData).filter(([k]) => /^\d{17,19}$/.test(k));
    const t     = getTreasury();

    let totalBtc = 0, totalBank = 0, activeLoans = 0, totalOwed = 0, overdueLoans = 0;

    for (const [, d] of users) {
        totalBtc  += d.btc           || 0;
        totalBank += d.banks?.garaad || 0;
        if (d.loan && d.loan.owed > 0) {
            activeLoans++;
            totalOwed += d.loan.owed;
            if (Date.now() - d.loan.takenAt > 3 * 86400000) overdueLoans++;
        }
    }

    return { users: users.length, totalBtc, totalBank, t, activeLoans, totalOwed, overdueLoans };
}

function buildAdminEconEmbed() {
    const s = getEconStats();
    return new EmbedBuilder()
        .setTitle('💰 Admin — Economy Dashboard')
        .setColor('#f39c12')
        .setDescription(
            `**🏛️ Treasury**\n` +
            `💰 Balance: **${fmt(s.t.balance)} BTC** | 📥 Total in: **${fmt(s.t.totalIn)} BTC**\n\n` +
            `**📊 Circulation** _(${s.users} players)_\n` +
            `₿ Wallets: **${fmt(s.totalBtc)} BTC**\n` +
            `🏦 Bank: **${fmt(s.totalBank)} BTC**\n\n` +
            `**💳 Loans**\n` +
            `Active: **${s.activeLoans}** | Owed: **${fmt(s.totalOwed)} BTC** | 🔴 Overdue: **${s.overdueLoans}**`
        )
        .setFooter({ text: 'Garaad Admin • Economy' });
}

function buildAllPlayersEmbed(page = 0) {
    const PER_PAGE = 10;

    const players = Object.entries(econData)
        .filter(([k]) => /^\d{17,19}$/.test(k))
        .map(([uid, d]) => ({
            uid,
            username: d.username   || null,
            btc:  d.btc            || 0,
            bank: d.banks?.garaad  || 0,
            loan: d.loan?.owed     || 0,
        }))
        .sort((a, b) => b.btc - a.btc);

    const totalPages = Math.max(1, Math.ceil(players.length / PER_PAGE));
    const slice      = players.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    const lines = slice.map((p, i) => {
        const rank = page * PER_PAGE + i + 1;
        const bank = p.bank > 0 ? ` 🏦${fmt(p.bank)}` : '';
        const loan = p.loan > 0 ? ` 💳${fmt(p.loan)}` : '';
        const name = p.username ? `**${p.username}**` : `<@${p.uid}>`;
        return `**${rank}.** ${name} — ₿ **${fmt(p.btc)}**${bank}${loan}`;
    });

    return new EmbedBuilder()
        .setTitle(`👥 All Players (${players.length})`)
        .setColor('#3498db')
        .setDescription(lines.join('\n') || '_No players._')
        .setFooter({ text: `Page ${page + 1}/${totalPages} • ${players.length} total` });
}

// ── Rows — delegate to unified panel ──────────────────────────────

const { adminRow1, adminRow2, adminRow3, getRows } = require('./adminHelpPanel');

function adminTabRow(uid)          { return adminRow1(uid); }
function adminEcoMainRow(uid)      { return adminRow1(uid); }
function adminEcoMidRow(uid)       { return adminRow2(uid); }
function adminEcoFooterRow(uid)    { return adminRow3(uid); }
function adminEcoActionsRow(uid)   { return adminRow2(uid); }
function adminEconActionsRow(uid)  { return adminRow2(uid); }
function adminEconActionsRow2(uid) { return adminRow3(uid); }
function adminEcoCloseRow(uid)     { return adminRow3(uid); }

// ── Command ────────────────────────────────────────────────────────

module.exports = async function adminEconCmd(message, args) {
    const userId = message.author.id;
    const sub    = (args[0] || '').toLowerCase();
    const target = message.mentions.users.first();

    if (!sub || sub === 'help') {
        const { buildAdminEmbed } = require('./adminHelpPanel');
        return message.reply({
            embeds:     [buildAdminEmbed(userId)],
            components: getRows(userId),
        });
    }

    // ?admin econ give @user btc [amount]
    if (sub === 'give') {
        if (!target) return message.reply('⚠️ `?admin econ give @user btc [amount]`');
        const rest   = args.filter(a => !/<@!?\d+>/.test(a));
        const asset  = (rest[1] || 'btc').toLowerCase();
        const amount = parseFloat(rest[2]);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Enter a valid amount.');
        if (asset !== 'btc') return message.reply('⚠️ Asset must be `btc`');
        checkEconUser(target.id);
        const d = econData[target.id];
        d.btc = (d.btc || 0) + amount;
        saveEcon();
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71')
            .setDescription(`✅ **${fmt(amount)} BTC** given to <@${target.id}>.\nNew balance: **${fmt(d.btc)} BTC**`)] });
    }

    // ?admin econ title @user <key>
    if (sub === 'title') {
        if (!target) return message.reply('⚠️ `?admin econ title @user <key>`');
        const rest = args.filter(a => !/<@!?\d+>/.test(a));
        const key  = (rest[1] || '').toLowerCase();
        const info = ECON_TITLES[key];
        if (!info) return message.reply(`⚠️ Unknown title: \`${key}\``);
        checkEconUser(target.id);
        const d = econData[target.id];
        if (!d.econTitles.includes(key)) d.econTitles.push(key);
        d.activeEconTitle = key;
        saveEcon();
        return message.reply({ embeds: [new EmbedBuilder().setColor('#9b59b6')
            .setDescription(`✅ <@${target.id}> given title: **${info.label}**`)] });
    }

    // ?admin econ treasury [view|topup|distribute|give]
    if (sub === 'treasury') {
        const action = (args[1] || '').toLowerCase();
        const t      = getTreasury();

        if (!action || action === 'view') {
            return message.reply({ embeds: [new EmbedBuilder().setTitle('🏛️ Treasury').setColor('#8e44ad')
                .setDescription(
                    `💰 **Balance:** ${fmt(t.balance)} BTC\n` +
                    `📥 **Total in:** ${fmt(t.totalIn)} BTC\n` +
                    `📤 **Spent:** ${fmt((t.totalIn || 0) - (t.balance || 0))} BTC`
                )] });
        }

        if (action === 'topup') {
            const amount = parseFloat(args[2]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ `?admin econ treasury topup [amount]`');
            topUpTreasury(amount);
            saveEcon();
            return message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71')
                .setDescription(`✅ **${fmt(amount)} BTC** added to treasury.\n🏛️ Balance: **${fmt(t.balance)} BTC**`)] });
        }

        if (action === 'distribute') {
            const users  = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));
            const rawArg = (args[2] || '').toLowerCase();
            const amount = rawArg === 'all' ? t.balance : parseFloat(args[2]);
            if (!amount || isNaN(amount) || amount <= 0)
                return message.reply('⚠️ `?admin econ treasury distribute all`  or  `?admin econ treasury distribute [amount]`');
            const perUser = Math.floor(amount / users.length);
            if (perUser < 1) return message.reply('⚠️ Amount too small to distribute.');
            if (!deductFromTreasury(amount)) return message.reply(`⚠️ Treasury insufficient. Balance: **${fmt(t.balance)} BTC**`);
            for (const uid of users) { checkEconUser(uid); econData[uid].btc = (econData[uid].btc || 0) + perUser; }
            saveEcon();
            return message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71')
                .setDescription(`✅ **${fmt(perUser)} BTC** × **${users.length}** players.\n🏛️ Treasury remaining: **${fmt(t.balance)} BTC**`)] });
        }

        if (action === 'give') {
            if (!target) return message.reply('⚠️ `?admin econ treasury give @user [amount]`');
            const amount = parseFloat(args.filter(a => !/<@!?\d+>/.test(a))[2]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Enter a valid amount.');
            if (!deductFromTreasury(amount)) return message.reply(`⚠️ Treasury insufficient. Balance: **${fmt(t.balance)} BTC**`);
            checkEconUser(target.id);
            econData[target.id].btc = (econData[target.id].btc || 0) + amount;
            saveEcon();
            return message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71')
                .setDescription(`✅ **${fmt(amount)} BTC** from treasury → <@${target.id}>.\n🏛️ Remaining: **${fmt(t.balance)} BTC**`)] });
        }
    }

    // ?admin econ reset @user
    if (sub === 'reset') {
        if (!target) return message.reply('⚠️ `?admin econ reset @user`');
        checkEconUser(target.id);
        const d = econData[target.id];
        d.btc = 1000; d.banks = { garaad: 0 };
        d.inventory = { safety: 0, robticket: 0 };
        d.loan = null; d.lastLoanTaken = 0;
        d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
        saveEcon();
        return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c')
            .setDescription(`🗑️ <@${target.id}>'s economy data has been reset to 1,000 BTC.`)] });
    }

    // ?admin econ wallet @user
    if (sub === 'wallet' || sub === 'jeeb') {
        if (!target) return message.reply('⚠️ `?admin econ wallet @user`');
        const { buildJeebEmbed, jeebRow } = require('../economy/jeeb');
        return message.reply({ embeds: [buildJeebEmbed(target.id, target.username)], components: [jeebRow(message.author.id, target.id)] });
    }

    // ?admin econ all [page]
    if (sub === 'all') {
        const page = Math.max(0, (parseInt(args[1]) || 1) - 1);
        return message.reply({ embeds: [buildAllPlayersEmbed(page)] });
    }

    // ?admin econ loans
    if (sub === 'loans') {
        const loans = Object.entries(econData)
            .filter(([k, d]) => /^\d{17,19}$/.test(k) && d.loan?.owed > 0)
            .map(([uid, d]) => {
                const days    = Math.floor((Date.now() - d.loan.takenAt) / 86400000);
                const left    = Math.max(0, 3 - days);
                const overdue = left === 0;
                return `${overdue ? '🔴' : '💳'} <@${uid}> — **${fmt(d.loan.owed)} BTC** | ${overdue ? '**OVERDUE**' : `${left}d left`}`;
            });
        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle(`💳 Active Loans (${loans.length})`)
            .setColor('#e74c3c')
            .setDescription(loans.join('\n') || '_No active loans._')
            .setFooter({ text: 'Garaad Admin' })] });
    }

    // ?admin econ tax [amount]
    if (sub === 'tax') {
        const amount = parseFloat(args[1]);
        if (isNaN(amount) || amount <= 0)
            return message.reply('⚠️ `?admin econ tax [amount]`  — e.g. `?admin econ tax 5`');
        const users = Object.entries(econData).filter(([k]) => /^\d{17,19}$/.test(k));
        let collected = 0;
        for (const [uid] of users) {
            checkEconUser(uid);
            const d = econData[uid];
            const deduct = Math.min(amount, d.btc || 0);
            d.btc = (d.btc || 0) - deduct;
            collected += deduct;
        }
        if (collected > 0) addToTreasury(collected);
        saveEcon();
        return message.reply({ embeds: [new EmbedBuilder().setColor('#e67e22')
            .setTitle('💸 Tax Collected')
            .setDescription(
                `**${fmt(amount)} BTC** deducted from each of **${users.length}** players.\n` +
                `🏛️ Treasury received: **${fmt(collected)} BTC**`
            )] });
    }

    return message.reply(`⚠️ Usage: \`${PREFIX}admin econ help\``);
};

module.exports.buildAdminEconEmbed   = buildAdminEconEmbed;
module.exports.buildAllPlayersEmbed  = buildAllPlayersEmbed;
module.exports.adminTabRow           = adminTabRow;
module.exports.adminEconActionsRow   = adminEconActionsRow;
module.exports.adminEconActionsRow2  = adminEconActionsRow2;
module.exports.adminEcoMainRow       = adminEcoMainRow;
module.exports.adminEcoMidRow        = adminEcoMidRow;
module.exports.adminEcoFooterRow     = adminEcoFooterRow;
module.exports.adminEcoCloseRow      = adminEcoCloseRow;
