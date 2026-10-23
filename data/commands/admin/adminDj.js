const { EmbedBuilder } = require('discord.js');
const { isAdmin, addDJ, removeDJ, isDJ } = require('../../../src/utils/admin');

module.exports = async function djCmd(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('⛔ Admin kaliya.');

    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Isticmaal: `?dj @user`');

    if (isDJ(target.id)) {
        removeDJ(target.id);
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor('#e74c3c')
                .setDescription(`❌ **${target.username}** DJ fasaxa waa laga qaaday.`)
            ]
        });
    } else {
        addDJ(target.id);
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor('#2ecc71')
                .setDescription(`✅ **${target.username}** DJ fasaxa waa la siiyay — hadda \`?play\` isticmaali karaa.`)
            ]
        });
    }
};
