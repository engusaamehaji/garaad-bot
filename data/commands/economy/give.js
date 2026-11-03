const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon, recordDailyCoinTransfer, DAILY_COIN_TRANSFER_LIMIT } = require('../../../src/economy/econStore');
const { fmt, getDisplayName } = require('../../../src/utils/helpers');

const ASSET_LABELS = { coins: '🪙 Coins' };

function buildUsageEmbed() {
    return new EmbedBuilder()
        .setColor('#e74c3c')
        .setDescription(
            '⚠️ **Usage**\n' +
            'Reply to a player, then use `?give <amount>`; or mention them: `?give @user <amount>`.\n' +
            'Example: `?give @user 300`'
        );
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
    const target = message.mentions.users.first() || await resolveReplyTarget(message);
    if (!target) return message.reply({ embeds: [buildUsageEmbed()] });
    if (target.id === userId) return message.reply('⚠️ You cannot send Coins to yourself.');
    if (target.bot) return message.reply('⚠️ You cannot send Coins to a bot.');

    const values = args.filter(arg => !arg.startsWith('<@'));
    const amountText = values[0]?.toLowerCase() === 'coins' ? values[1] : values[0];
    const amount = Number(amountText?.replace(/,/g, ''));
    if (!/^\d+$/.test((amountText || '').replace(/,/g, '')) || !Number.isSafeInteger(amount) || amount <= 0) {
        return message.reply({ embeds: [buildUsageEmbed()] });
    }

    checkEconUser(userId);
    checkEconUser(target.id);
    const sender = econData[userId];
    const receiver = econData[target.id];
    if ((sender.coins || 0) < amount) {
        return message.reply(`⚠️ You do not have enough Coins. Wallet balance: **${fmt(sender.coins || 0)} Coins**.`);
    }
    const transfer = recordDailyCoinTransfer(userId, amount);
    if (!transfer.ok) {
        return message.reply(`⚠️ Daily transfer limit: **${fmt(DAILY_COIN_TRANSFER_LIMIT)} Coins**. Remaining today: **${fmt(transfer.remaining)} Coins**.`);
    }

    sender.coins = (sender.coins || 0) - amount;
    receiver.coins = (receiver.coins || 0) + amount;
    saveEcon();

    const senderName = await getDisplayName(message.client, message.guild, userId, message.author);
    const receiverName = await getDisplayName(message.client, message.guild, target.id, target);
    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle('💸 Coins Sent')
        .setColor('#2ecc71')
        .setDescription(`**${senderName}** sent Coins to **${receiverName}**.`)
        .addFields(
            { name: 'Amount', value: `🪙 ${fmt(amount)} Coins`, inline: true },
            { name: 'Your wallet', value: `🪙 ${fmt(sender.coins)} Coins`, inline: true },
            { name: 'Their wallet', value: `🪙 ${fmt(receiver.coins)} Coins`, inline: true },
        )
        .setFooter({ text: 'Garaad Economy' })] });
};

module.exports.ASSET_LABELS = ASSET_LABELS;
