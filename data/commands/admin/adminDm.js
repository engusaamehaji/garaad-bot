// =====================================================================
// SUB-AMARKA: ?admin dm @user [fariin]
// =====================================================================

const { EmbedBuilder } = require('discord.js');

module.exports = async function adminDm(message, args) {
    let target = message.mentions.users.first();
    let textStart = 0;

    if (target) {
        textStart = 1;
    } else if (args[0] && /^\d{17,20}$/.test(args[0])) {
        target = await message.client.users.fetch(args[0]).catch(() => null);
        textStart = 1;
    }

    if (!target) {
        return message.reply('⚠️ Fadlan tilmaan user iyo fariin. Tusaale: `?admin dm @user Salaan!`');
    }

    const text = args.slice(textStart).join(' ').trim();
    if (!text) {
        return message.reply('⚠️ Fadlan qor fariinta aad rabto in la diro.');
    }
    if (text.length > 1500) {
        return message.reply('⚠️ Fariin aad u dheer (max 1500 xaraf).');
    }

    const embed = new EmbedBuilder()
        .setTitle('✉️ Fariin — Garaad Bot')
        .setDescription(text)
        .setColor('#3498db')
        .setFooter({ text: 'Garaad Bot' })
        .setTimestamp();

    try {
        await target.send({ embeds: [embed] });
        return message.reply(`✅ Fariinta waxaa la geyey <@${target.id}>.`);
    } catch (e) {
        return message.reply(`❌ Lama gaarsiin <@${target.id}> — DM-yadiisa way xidhantahay.`);
    }
};
