const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

module.exports = async function khaznadCmd(message) {
    const t       = getTreasury();
    const bal     = t.balance || 0;
    const totalIn = t.totalIn || 0;
    const spent   = totalIn - bal;

    const userId = message.author.id;
    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_khaznad_${userId}`)
            .setLabel('❌ Iska xir')
            .setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('🏛️ Khaznadda Garaad — Treasury')
            .setColor('#8e44ad')
            .setDescription(
                `**💰 Hadda:**\n` +
                `🏦 Khaznad: **${fmt(bal)} BTC**\n\n` +
                `**📊 Tirakoobka:**\n` +
                `📥 Wadarta soo gashay: **${fmt(totalIn)} BTC**\n` +
                `📤 Wadarta la qaybiyay: **${fmt(spent)} BTC**\n\n` +
                `**📌 Lacagta xaga kale:** Title iibsiga iyo Ecoflip qasaaraha\n` +
                `**📌 Lacagta la siiyaa:** Admin ayaa qaybiyaa dadka`
            )
            .setFooter({ text: 'Garaad Economy • Keedsane Bank Treasury' }),
    ], components: [closeRow] });
};
