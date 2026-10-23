const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { fmt, getDisplayName } = require('../../../src/utils/helpers');

const ASSET_LABELS = { btc: '₿ BTC', gold: '🥇 Gold' };

function buildUsageEmbed() {
    return new EmbedBuilder()
        .setDescription(
            `⚠️ **Qaabka saxda ah:**\n` +
            `**Option 1:** Qof message-kiisa **reply** ka samee, kadibna qor:\n` +
            `\`?give 300\` ama \`?give gold 300\`\n\n` +
            `**Option 2:** Si toos ah user u dir:\n` +
            `\`?give @user 300\` ama \`?give @user gold 300\``
        )
        .setColor('#e74c3c');
}

async function resolveReplyTarget(message) {
    if (!message.reference?.messageId) return null;
    const refChannel = message.reference.channelId
        ? await message.client.channels.fetch(message.reference.channelId).catch(() => null)
        : message.channel;
    if (!refChannel || !refChannel.isTextBased()) return null;
    const refMsg = await refChannel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!refMsg || !refMsg.author || refMsg.author.bot) return null;
    return refMsg.author;
}

module.exports = async function giveCmd(message, args) {
    const userId = message.author.id;
    let target = null;

    // Option 1: ?give @user <amount> or ?give @user gold <amount>
    const mentioned = message.mentions.users.first();
    if (mentioned) {
        target = mentioned;
        args = args.filter(a => !a.startsWith('<@'));
    } else {
        // Option 2: reply
        target = await resolveReplyTarget(message);
    }

    if (!target) {
        return message.reply({ embeds: [buildUsageEmbed()] });
    }

    if (target.id === userId)
        return message.reply({ embeds: [new EmbedBuilder()
            .setDescription('⚠️ Adiga nafta lacag uguma diri kartid.')
            .setColor('#e74c3c')] });

    if (target.bot)
        return message.reply({ embeds: [new EmbedBuilder()
            .setDescription('⚠️ Bot-ka lacag uguma diri kartid.')
            .setColor('#e74c3c')] });

    // Parse asset and amount
    let asset = 'btc';
    let amount = NaN;

    const token = (args[0] || '').toLowerCase();
    if (!token) return message.reply({ embeds: [buildUsageEmbed()] });

    if (token === 'btc') {
        return message.reply({ embeds: [new EmbedBuilder()
            .setDescription('⚠️ BTC si toos ah looma diri karo. Isticmaal `?btc send <amount>`.')
            .setColor('#e74c3c')] });
    }

    if (token === 'gold') {
        asset = 'gold';
        amount = parseInt(args[1], 10);
    } else if (!isNaN(parseInt(token, 10))) {
        amount = parseInt(token, 10);
    } else {
        return message.reply({ embeds: [buildUsageEmbed()] });
    }

    if (!Number.isInteger(amount) || amount <= 0)
        return message.reply({ embeds: [buildUsageEmbed()] });

    checkEconUser(userId);
    checkEconUser(target.id);

    const sender   = econData[userId];
    const receiver = econData[target.id];

    if ((sender[asset] || 0) < amount)
        return message.reply({ embeds: [new EmbedBuilder()
            .setDescription(`⚠️ **${fmt(amount)} ${ASSET_LABELS[asset]}** kugu filna ma lihid.`)
            .setColor('#e74c3c')] });

    sender[asset]   = (sender[asset]   || 0) - amount;
    receiver[asset] = (receiver[asset] || 0) + amount;
    saveEcon();

    const senderName   = await getDisplayName(message.client, message.guild, userId, message.author);
    const receiverName = await getDisplayName(message.client, message.guild, target.id, target);

    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle('💸 Lacagta Waa La Diray!')
        .setColor('#2ecc71')
        .setDescription(`**${senderName}** → **${receiverName}**`)
        .addFields(
            { name: '💰 Lacagta',        value: `**${fmt(amount)} ${ASSET_LABELS[asset]}**`,     inline: true },
            { name: '👛 Wallet-kaaga',   value: `**${fmt(sender[asset])} ${ASSET_LABELS[asset]}**`,   inline: true },
            { name: '👛 Wallet-kooda',   value: `**${fmt(receiver[asset])} ${ASSET_LABELS[asset]}**`,  inline: true },
        )
        .setFooter({ text: 'Garaad Economy' })] });
};

module.exports.ASSET_LABELS = ASSET_LABELS;
