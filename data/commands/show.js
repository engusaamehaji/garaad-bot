const { EmbedBuilder } = require('discord.js');
const { userData } = require('../../src/store');
const { econData, checkEconUser } = require('../../src/economy/econStore');
const { checkUser } = require('../../src/utils/helpers');

const DAY_MS   = 24 * 60 * 60 * 1000;
const WORK_MS  = 8 * 60 * 60 * 1000;
const ROB_MS   = 15 * 60 * 1000;

function fmtRemaining(ms) {
    const hours = Math.floor(ms / 3600000);
    const mins  = Math.floor((ms % 3600000) / 60000);
    const secs  = Math.floor((ms % 60000) / 1000);
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (mins)  parts.push(`${mins}m`);
    if (secs && !hours && !mins) parts.push(`${secs}s`);
    return parts.length ? parts.join(' ') : '0s';
}

module.exports = async function showCommand(message) {
    const userId = message.author.id;
    checkUser(userId);
    checkEconUser(userId);

    const now = Date.now();
    const dailyLast = userData[userId].lastDaily || 0;
    const workLast = econData[userId].lastWork || 0;
    const robLast = econData[userId].lastRob || 0;
    const ticketExpiry = econData[userId].inventory?.robticketExpiry || 0;

    const dailyRem = Math.max(0, DAY_MS - (now - dailyLast));
    const workRem  = Math.max(0, WORK_MS - (now - workLast));
    const robRem   = Math.max(0, ROB_MS - (now - robLast));

    const dailyStatus = dailyRem > 0 ? `On cooldown — ${fmtRemaining(dailyRem)}` : 'Ready';
    const workStatus  = workRem  > 0 ? `On cooldown — ${fmtRemaining(workRem)}`  : 'Ready';
    const robStatus   = robRem   > 0 ? `On cooldown — ${fmtRemaining(robRem)}`   : 'Ready';
    const ticketStatus = ticketExpiry > now
        ? `Active — ${fmtRemaining(ticketExpiry - now)}`
        : 'Not active';

    const embed = new EmbedBuilder()
        .setTitle('⏱️ Cooldown Status')
        .setColor('#3498db')
        .setDescription('Eeg halkan xaaladda cooldown ee amarrada muhiimka ah.')
        .addFields(
            { name: '?today', value: dailyStatus, inline: true },
            { name: '?shaqo', value: workStatus, inline: true },
            { name: '?rob', value: robStatus, inline: true },
            { name: 'Rob Ticket', value: ticketStatus, inline: true },
        )
        .setFooter({ text: 'Isticmaal cmd-kan si aad u aragto xaaladda cooldown-kaaga.' });

    return message.reply({ embeds: [embed] });
};
