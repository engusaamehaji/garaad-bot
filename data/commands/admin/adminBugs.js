// =====================================================================
// SUB-AMARKA: ?admin bugs
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { getBugs }      = require('../../../src/utils/admin');

module.exports = async function adminBugs(message) {
    const bugs = getBugs(15);

    if (!bugs.length) {
        return message.reply('🎉 Cilad lama soo sheegin!');
    }

    const embed = new EmbedBuilder()
        .setTitle('🐛 Cilada La Soo Sheegay')
        .setColor('#e74c3c')
        .setFooter({ text: `Hadda la muujinayo ${bugs.length} cilad` });

    bugs.forEach((b, i) => {
        const date = new Date(b.timestamp).toLocaleString();
        const desc = b.description.length > 200 ? b.description.slice(0, 200) + '...' : b.description;
        embed.addFields({
            name:  `${i + 1}. ${b.username || 'Aan la garanayn'} • ${date}`,
            value: `> ${desc}\n🆔 \`${b.userId}\``,
            inline: false,
        });
    });

    return message.reply({ embeds: [embed] });
};
