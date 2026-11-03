// =====================================================================
// SUB-AMARKA: ?admin dm @user [message]
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
        return message.reply('⚠️ Please mention a user iyo message. Example: `?admin dm @user Salaan!`');
    }

    const text = args.slice(textStart).join(' ').trim();
    if (!text) {
        return message.reply('⚠️ Fadlan qor messageta aad rabto in la diro.');
    }
    if (text.length > 1500) {
        return message.reply('⚠️ Message aad u dheer (max 1500 xaraf).');
    }

    const embed = new EmbedBuilder()
        .setTitle('✉️ Message — Garaad Bot')
        .setDescription(text)
        .setColor('#3498db')
        .setFooter({ text: 'Garaad Bot' })
        .setTimestamp();

    try {
        await target.send({ embeds: [embed] });
        return message.reply(`✅ Messageta waxaa la geyey <@${target.id}>.`);
    } catch (e) {
        return message.reply(`❌ Lama gaarsiin <@${target.id}> — DM-yadiisa way xidhantahay.`);
    }
};
