const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

module.exports = async function treasuryCmd(message) {
    const t       = getTreasury();
    const bal     = t.balance || 0;
    const totalIn = t.totalIn || 0;
    const spent   = t.totalOut || 0;

    const userId = message.author.id;
    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_treasury_${userId}`)
            .setLabel('❌ Close')
            .setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('🏛️ Garaad Treasury')
            .setColor('#8e44ad')
            .setDescription(
                `**💰 Current Balance:**\n` +
                `🏦 Treasury: **${fmt(bal)} Coins**\n\n` +
                `**📊 Statistics:**\n` +
                `📥 Total received: **${fmt(totalIn)} Coins**\n` +
                `📤 Total spent: **${fmt(spent)} Coins**\n\n` +
                `**📌 Treasury income:** title purchases and losing coinflips\n` +
                `**📌 Treasury payouts:** Coins distributed by admins`
            )
            .setFooter({ text: 'Garaad Economy • Treasury balances are in Coins' }),
    ], components: [closeRow] });
};
