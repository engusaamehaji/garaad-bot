const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { ECON_TITLES } = require('./econShop');

function resolveLabel(d, key) {
    if (key === 'custom') return d.customEconTitle ? `${d.customEconTitle} ✍️` : 'Custom ✍️';
    return ECON_TITLES[key]?.label || key;
}

module.exports = async function econTitleCmd(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];

    if (args[0]) {
        const key = args[0].toLowerCase();
        if (!d.econTitles.includes(key)) {
            return message.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`⚠️ You don't own **${resolveLabel(d, key)}**.\nBuy it first at \`?shop\``)
                    .setColor('#e74c3c'),
            ]});
        }
        d.activeEconTitle = key;
        saveEcon();
        return message.reply({ embeds: [
            new EmbedBuilder()
                .setTitle('🏷️ Title Updated')
                .setColor('#2ecc71')
                .setDescription(`✅ Active title set to: **${resolveLabel(d, key)}**`)
                .setFooter({ text: 'Garaad Economy' }),
        ]});
    }

    if (d.econTitles.length === 0) {
        return message.reply({ embeds: [
            new EmbedBuilder()
                .setTitle('🏷️ Economy Titles')
                .setColor('#9b59b6')
                .setDescription("You don't own any titles yet.\n\nBrowse **`?shop`** to buy one.")
                .setFooter({ text: 'Garaad Economy' }),
        ]});
    }

    const ownedLines = d.econTitles.map(key => {
        const active = d.activeEconTitle === key ? ' ✅ *(active)*' : '';
        return `• ${resolveLabel(d, key)}${active}`;
    }).join('\n');

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('🏷️ Your Titles')
            .setColor('#9b59b6')
            .setDescription(ownedLines + '\n\n`?etitle <key>` to equip a title.')
            .setFooter({ text: 'Garaad Economy' }),
    ]});
};
