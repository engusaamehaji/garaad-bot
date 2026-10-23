// =====================================================================
// AMARKA: ?champion — Tusida dadka haysata Champion 🏆 title-ka
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData } = require('../../src/store');

module.exports = async function championCommand(message) {
    const userId = message.author.id;

    const champions = Object.entries(userData)
        .filter(([, data]) =>
            data.ownedTitles && data.ownedTitles.includes('champion')
        );

    if (champions.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🏆 Champions — Garaad Quiz')
            .setDescription('Wali cidna Champion title ma heysto.\n\nTitle-kan waxaa heli kara kaliya guulaha tartan weyn.')
            .setColor('#FFD700');

        return message.reply({ embeds: [embed] });
    }

    const list = champions.map(([id, data], i) => {
        const active = data.activeTitle === 'champion' ? ' ✦' : '';
        return `**${i + 1}.** <@${id}>${active}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('🏆 Champions — Garaad Quiz')
        .setDescription(
            `Kuwani waa dadka haysata **Champion 🏆** title-ka:\n\n${list}\n\n` +
            `*✦ = hadda shaqaynaya*`
        )
        .setColor('#FFD700')
        .setFooter({ text: `Wadarta: ${champions.length} Champion` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_champion_${userId}`)
            .setLabel('Iska xir')
            .setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [embed], components: [row] });
};
