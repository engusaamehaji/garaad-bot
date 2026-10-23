const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

module.exports = async function bankListCmd(message) {
    const userId = message.author.id;

    const bankEntries = Object.entries(econData)
        .filter(([k, d]) => /^\d{17,19}$/.test(k) && d && typeof d === 'object' && (d.banks?.garaad || 0) > 0)
        .map(([uid, d]) => ({ uid, garaad: d.banks.garaad }))
        .sort((a, b) => b.garaad - a.garaad);

    const grandTotal = bankEntries.reduce((s, e) => s + e.garaad, 0);

    const bankLines = bankEntries.slice(0, 15).map((e, i) => {
        const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `${rank} <@${e.uid}> — **₿: ${fmt(e.garaad)}**`;
    });

    const loanEntries = Object.entries(econData)
        .filter(([k, d]) => /^\d{17,19}$/.test(k) && d && d.loan && d.loan.owed > 0)
        .map(([uid, d]) => {
            const daysLeft = Math.max(0, 3 - Math.floor((Date.now() - d.loan.takenAt) / 86400000));
            return { uid, owed: d.loan.owed, daysLeft };
        })
        .sort((a, b) => b.owed - a.owed);

    const loanLines = loanEntries.map(e => {
        const urgency = e.daysLeft === 0 ? '🔴' : e.daysLeft === 1 ? '⚠️' : '💳';
        const timeStr = e.daysLeft > 0 ? `${e.daysLeft}d left` : '**OVERDUE**';
        return `${urgency} <@${e.uid}> — **₿: ${fmt(e.owed)}** | ${timeStr}`;
    });

    const embed = new EmbedBuilder()
        .setTitle('🏦 Garaad Bank — Directory')
        .setColor('#3498db');

    let desc = '';
    if (bankLines.length > 0) {
        desc += `**🏦 Bank Deposits:**\n${bankLines.join('\n')}\n\n`;
        desc += `💰 **Total deposited:** ₿: ${fmt(grandTotal)}\n\n`;
    } else {
        desc += '_No one has deposited into the bank yet._\n\n';
    }

    if (loanLines.length > 0) {
        desc += `**💳 Active Loans (${loanEntries.length}):**\n${loanLines.join('\n')}`;
    } else {
        desc += '_No active loans._';
    }

    embed.setDescription(desc);
    embed.setFooter({ text: `${bankEntries.length} depositors • ${loanEntries.length} loans • Garaad Economy` });

    return message.reply({ embeds: [embed], components: [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_banklist_${userId}`)
                .setLabel('✖ Close')
                .setStyle(ButtonStyle.Danger),
        ),
    ]});
};
