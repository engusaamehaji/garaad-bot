const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const OWNER_ID = '1191096205955055690';

function buildTreasuryEmbed() {
    const t = getTreasury();
    return new EmbedBuilder()
        .setTitle('🏛️ Treasury — Admin Panel')
        .setColor('#8e44ad')
        .addFields(
            { name: '💰 Balance',   value: `**₿ ${fmt(t.balance  || 0)}**`, inline: true },
            { name: '📥 Total In',  value: `**₿ ${fmt(t.totalIn  || 0)}**`, inline: true },
            { name: '📤 Total Out', value: `**₿ ${fmt(t.totalOut || 0)}**`, inline: true },
        )
        .setFooter({ text: 'Garaad Admin • Treasury Control' });
}

function treasuryRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trs_add_${userId}`)   .setLabel('📥 Add')   .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trs_reduce_${userId}`).setLabel('📤 Reduce').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`trs_set_${userId}`)   .setLabel('🎯 Set')   .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_trs_${userId}`)  .setLabel('✖ Close') .setStyle(ButtonStyle.Secondary),
    );
}

module.exports = async function treasuryCmd(message) {
    if (message.author.id !== OWNER_ID)
        return message.reply('⛔ Amarka owner kaliya ayaa isticmaali kara.');

    return message.reply({
        embeds:     [buildTreasuryEmbed()],
        components: [treasuryRow(message.author.id)],
    });
};

module.exports.buildTreasuryEmbed = buildTreasuryEmbed;
module.exports.treasuryRow        = treasuryRow;
