const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hagbadData, saveHagbad } = require('../../../src/economy/hagbadStore');
const { econData, saveEcon, checkEconUser } = require('../../../src/economy/econStore');

const DAILY_CONTRIBUTION = 1000;

function fmt(n) { return Math.floor(n || 0).toLocaleString(); }

function buildGroupPanel(groupName, group, userId) {
    const now = Date.now();
    const memberLines = group.members.map(id => {
        const mPay = group.payments[id] || 0;
        const hasPaid = (now - mPay < 20 * 60 * 60 * 1000);
        return `${hasPaid ? '✅' : '❌'} <@${id}>`;
    }).join('\n');

    const turnUserId = group.payoutQueue[group.currentTurn];
    const myPaid = (now - (group.payments[userId] || 0)) < 20 * 60 * 60 * 1000;
    const inGroup = group.members.includes(userId);

    const paidCount = group.members.filter(id => (now - (group.payments[id] || 0)) < 20 * 60 * 60 * 1000).length;

    const embed = new EmbedBuilder()
        .setTitle(`💰 HAGBAD — ${groupName.toUpperCase()}`)
        .setColor('#f39c12')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🏦 **XAALADDA KOOXDA**\n\n` +
            `👥 Members: **${group.members.length}**\n` +
            `💵 Xaddiga Maalinle: **₿${fmt(DAILY_CONTRIBUTION)}**\n` +
            `🏺 Pot Hadda: **₿${fmt(group.pot)}**\n` +
            `🎯 Kii Xiga: ${turnUserId ? `<@${turnUserId}>` : 'N/A'}\n` +
            `📊 Bixiyay: **${paidCount}/${group.members.length}**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 **XUBNAHA**\n\n${memberLines || 'Xubno ma jiraan'}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            (inGroup
                ? (myPaid
                    ? `✅ **Maanta waad bixisay!** Berri ku bix.\n`
                    : `⚠️ **Maad bixin!** ₿${fmt(DAILY_CONTRIBUTION)} bix si aad u gacan gasho.\n`)
                : `🚫 Ma xubin kooxdan kuma jirtid.\n`) +
            `\n━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: `Garaad Economy • ?hagbad` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hag_pay_${userId}_${groupName}`)
            .setLabel('💰 Bixi')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!inGroup || myPaid),
        new ButtonBuilder()
            .setCustomId(`hag_leave_${userId}_${groupName}`)
            .setLabel('🚪 Ka Bax')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!inGroup),
        new ButtonBuilder()
            .setCustomId(`hag_refresh_${userId}_${groupName}`)
            .setLabel('🔄 Cusboonaysii')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`close_hag_${userId}`)
            .setLabel('✖ Xir')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embed, row };
}

module.exports = async function hagbadCommand(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);

    const subCommand = args[0] ? args[0].toLowerCase() : '';
    const groupName  = args[1] ? args[1].toLowerCase() : '';

    // ── No args: show help panel + user's groups ──
    if (!subCommand) {
        const myGroups = Object.entries(hagbadData).filter(([, g]) => g.members.includes(userId));
        const now = Date.now();

        const groupLines = myGroups.length
            ? myGroups.map(([name, g]) => {
                const myPaid = (now - (g.payments[userId] || 0)) < 20 * 60 * 60 * 1000;
                const paidCount = g.members.filter(id => (now - (g.payments[id] || 0)) < 20 * 60 * 60 * 1000).length;
                return `${myPaid ? '✅' : '❌'} **${name}** · 👥 ${g.members.length} xubno · 🏺 ₿${fmt(g.pot)} · ${paidCount}/${g.members.length} bixiyay`;
            }).join('\n')
            : `_Weli koox ku jirtid ma jiro._`;

        const embed = new EmbedBuilder()
            .setTitle('💰 HAGBAD — Nidaamka')
            .setColor('#f39c12')
            .setDescription(
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `**📋 AMARRADA**\n\n` +
                `**\`?hagbad create <magac>\`** — Koox cusub abuur\n` +
                `**\`?hagbad join <magac>\`** — Koox ku biir\n` +
                `**\`?hagbad <magac>\`** — Koox fur (panel)\n` +
                `**\`?hagbad pay <magac>\`** — Lacag bixi\n` +
                `**\`?hagbad leave <magac>\`** — Koox ka bax\n` +
                `**\`?hagbad status <magac>\`** — Xaaladda arag\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `**👤 KOOXAHAAGA**\n\n` +
                groupLines +
                `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .addFields(
                { name: '💵 Xaddiga Maalinle', value: `**₿${fmt(DAILY_CONTRIBUTION)}**`, inline: true },
                { name: '⏰ Reset Waqti',      value: `**20 saacadood**`,                  inline: true },
                { name: '🏆 Payout',            value: `**Dhamaan bixiyaan → Kii xiga**`,  inline: true },
            )
            .setFooter({ text: 'Garaad Economy • ?hagbad <magac> si aad koox u furtid' });

        const row = new ActionRowBuilder().addComponents(
            ...(myGroups.slice(0, 4).map(([name]) =>
                new ButtonBuilder()
                    .setCustomId(`hag_refresh_${userId}_${name}`)
                    .setLabel(`📂 ${name}`)
                    .setStyle(ButtonStyle.Secondary)
            )),
            new ButtonBuilder()
                .setCustomId(`close_hag_${userId}`)
                .setLabel('✖ Xir')
                .setStyle(ButtonStyle.Secondary),
        );

        return message.reply({ embeds: [embed], components: myGroups.length ? [row] : [] });
    }

    // ── ?hagbad create <name> ──
    if (subCommand === 'create') {
        if (!groupName) return message.reply('⚠️ Magac geli. Tusaale: `?hagbad create saxibada`');
        if (hagbadData[groupName]) return message.reply(`⚠️ Koox **${groupName}** horay ayaa u jirtay!`);
        hagbadData[groupName] = {
            creator: userId,
            members: [userId],
            payments: {},
            payoutQueue: [userId],
            currentTurn: 0,
            pot: 0,
        };
        saveHagbad();
        const { embed, row } = buildGroupPanel(groupName, hagbadData[groupName], userId);
        return message.reply({ content: `✅ Koox **${groupName}** la abuurtay!`, embeds: [embed], components: [row] });
    }

    // ── ?hagbad join <name> ──
    if (subCommand === 'join') {
        if (!groupName) return message.reply('⚠️ Magac geli. Tusaale: `?hagbad join saxibada`');
        const group = hagbadData[groupName];
        if (!group) return message.reply(`⚠️ Koox **${groupName}** lama helin.`);
        if (group.members.includes(userId)) return message.reply(`⚠️ Horay baa koox **${groupName}** ku jiray!`);
        group.members.push(userId);
        group.payoutQueue.push(userId);
        saveHagbad();
        const { embed, row } = buildGroupPanel(groupName, group, userId);
        return message.reply({ content: `✅ Koox **${groupName}** ku birtay!`, embeds: [embed], components: [row] });
    }

    // ── ?hagbad leave <name> ──
    if (subCommand === 'leave') {
        if (!groupName) return message.reply('⚠️ Magac geli. Tusaale: `?hagbad leave saxibada`');
        const group = hagbadData[groupName];
        if (!group) return message.reply(`⚠️ Koox **${groupName}** lama helin.`);
        if (!group.members.includes(userId)) return message.reply(`⚠️ Koox **${groupName}** kuma jirtid.`);
        if (group.creator === userId && group.members.length > 1)
            return message.reply('⚠️ Abuure ma baxo hadii xubnaha kale jiraan. Kooxda u wareejiso ama keligaa ka tag.');
        group.members = group.members.filter(id => id !== userId);
        group.payoutQueue = group.payoutQueue.filter(id => id !== userId);
        if (group.currentTurn >= group.payoutQueue.length) group.currentTurn = 0;
        if (group.members.length === 0) {
            delete hagbadData[groupName];
            saveHagbad();
            return message.reply(`🗑️ Koox **${groupName}** la tirtiray (xubno la'aan).`);
        }
        saveHagbad();
        return message.reply(`✅ Koox **${groupName}** ka baxday.`);
    }

    // ── ?hagbad pay <name> ──
    if (subCommand === 'pay') {
        if (!groupName) return message.reply('⚠️ Magac geli. Tusaale: `?hagbad pay saxibada`');
        const group = hagbadData[groupName];
        if (!group) return message.reply(`⚠️ Koox **${groupName}** lama helin.`);
        if (!group.members.includes(userId)) return message.reply(`⚠️ Koox **${groupName}** ku biir marka hore.`);
        return _doPay(message, userId, groupName, group);
    }

    // ── ?hagbad status <name> ──
    if (subCommand === 'status') {
        if (!groupName) return message.reply('⚠️ Magac geli.');
        const group = hagbadData[groupName];
        if (!group) return message.reply(`⚠️ Koox **${groupName}** lama helin.`);
        const { embed, row } = buildGroupPanel(groupName, group, userId);
        return message.reply({ embeds: [embed], components: [row] });
    }

    // ── ?hagbad <groupname> ── (shortcut: just show the panel)
    const directGroup = hagbadData[subCommand];
    if (directGroup) {
        const { embed, row } = buildGroupPanel(subCommand, directGroup, userId);
        return message.reply({ embeds: [embed], components: [row] });
    }

    return message.reply(
        `📝 **Hagbad Commands:**\n` +
        `\`?hagbad\` — Kooxahaaga arag\n` +
        `\`?hagbad <magac>\` — Koox fur\n` +
        `\`?hagbad create <magac>\` — Koox abuuri\n` +
        `\`?hagbad join <magac>\` — Koox ku biir\n` +
        `\`?hagbad leave <magac>\` — Koox ka bax\n` +
        `\`?hagbad pay <magac>\` — Lacag bixi\n` +
        `\`?hagbad status <magac>\` — Xaaladda arag`
    );
};

// ── Pay logic (shared by command + button) ──
async function _doPay(context, userId, groupName, group) {
    const lastPayment = group.payments[userId] || 0;
    const now = Date.now();

    if (now - lastPayment < 20 * 60 * 60 * 1000) {
        const { embed, row } = buildGroupPanel(groupName, group, userId);
        const reply = { content: `⏳ Maanta waad bixisay. Berri ku soo bixi.`, embeds: [embed], components: [row] };
        if (context.update) return context.update(reply);
        return context.reply(reply);
    }

    checkEconUser(userId);
    const userBtc = econData[userId].btc || 0;

    if (userBtc <= 0) {
        const reply = { content: `❌ Jeebkaagu madhan yahay. Lacag kuma haysatid.`, flags: 64 };
        if (context.reply) return context.reply(reply);
        return context.reply(reply);
    }

    // Auto-deduct: deduct whatever they have (up to DAILY_CONTRIBUTION)
    const toPay = Math.min(userBtc, DAILY_CONTRIBUTION);
    const isPartial = toPay < DAILY_CONTRIBUTION;

    econData[userId].btc = userBtc - toPay;
    saveEcon();

    group.payments[userId] = now;
    group.pot += toPay;

    // Check if everyone paid
    let allPaid = true;
    for (const memberId of group.members) {
        const mPay = group.payments[memberId] || 0;
        if (now - mPay > 24 * 60 * 60 * 1000) { allPaid = false; break; }
    }

    let payoutMsg = '';
    if (allPaid && group.members.length > 1) {
        const winnerId = group.payoutQueue[group.currentTurn];
        const potAmount = group.pot;
        checkEconUser(winnerId);
        econData[winnerId].btc = (econData[winnerId].btc || 0) + potAmount;
        saveEcon();
        payoutMsg = `\n\n🎉 **PAYOUT!** <@${winnerId}> helay **₿${fmt(potAmount)}**!`;
        group.pot = 0;
        group.currentTurn = (group.currentTurn + 1) % group.payoutQueue.length;
        group.payments = {};
    }

    saveHagbad();

    const partialNote = isPartial
        ? `\n⚠️ Aad ugu filan ma lihid (**₿${fmt(DAILY_CONTRIBUTION)}**). **₿${fmt(toPay)}** ayaa laga jaray.`
        : '';

    const { embed, row } = buildGroupPanel(groupName, group, userId);
    const reply = {
        content: `✅ **₿${fmt(toPay)}** koox **${groupName}** pot-keeda ku dartay.${partialNote}${payoutMsg}`,
        embeds: [embed],
        components: [row],
    };

    if (context.update) return context.update(reply);
    return context.reply(reply);
}

module.exports._doPay = _doPay;
module.exports.buildGroupPanel = buildGroupPanel;
