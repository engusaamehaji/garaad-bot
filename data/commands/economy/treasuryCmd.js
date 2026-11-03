const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');
const { isAdmin } = require('../../../src/utils/admin');

function buildTreasuryEmbed() {
    const treasury = getTreasury();
    return new EmbedBuilder()
        .setTitle('Treasury - Coins')
        .setColor('#8e44ad')
        .addFields(
            { name: 'Balance', value: `🪙 ${fmt(treasury.balance || 0)} Coins`, inline: true },
            { name: 'Total received', value: `🪙 ${fmt(treasury.totalIn || 0)} Coins`, inline: true },
            { name: 'Total spent', value: `🪙 ${fmt(treasury.totalOut || 0)} Coins`, inline: true },
        )
        .setFooter({ text: 'Garaad Economy | All amounts are Coins' });
}

function treasuryRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trs_add_${userId}`).setLabel('Add').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trs_reduce_${userId}`).setLabel('Reduce').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`trs_set_${userId}`).setLabel('Set').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_trs_${userId}`).setLabel('Close').setStyle(ButtonStyle.Secondary),
    );
}

module.exports = async function treasuryCmd(message) {
    if (!isAdmin(message.author.id)) {
        return message.reply('Only admins can view or manage the treasury.');
    }

    return message.reply({
        embeds: [buildTreasuryEmbed()],
        components: [treasuryRow(message.author.id)],
    });
};

module.exports.buildTreasuryEmbed = buildTreasuryEmbed;
module.exports.treasuryRow = treasuryRow;
