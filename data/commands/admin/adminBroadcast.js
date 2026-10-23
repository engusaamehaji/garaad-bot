// =====================================================================
// SUB-AMARKA: ?admin broadcast [fariin] / ?adall [fariin]
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { userData }     = require('../../../src/store');

module.exports = async function adminBroadcast(message, args) {
    const text = args.join(' ').trim();

    if (!text) {
        return message.reply('⚠️ Fadlan qor fariinta. Tusaale: `?adall Quiz cusub berri 8 PM!`');
    }
    if (text.length > 1500) {
        return message.reply('⚠️ Fariin aad u dheer (max 1500 xaraf).');
    }

    const userIds = Object.keys(userData);
    if (userIds.length === 0) {
        return message.reply('⚠️ Cidna kuma jirto database-ka.');
    }

    const status = await message.reply(`📢 Fariin loo dirayaa **${userIds.length}** user...`);

    const embed = new EmbedBuilder()
        .setTitle('📢 Garaad Bot — Fariin Rasmi ah')
        .setDescription(text)
        .setColor('#3498db')
        .setFooter({ text: 'Garaad Bot' })
        .setTimestamp();

    let success = 0, failed = 0;

    for (const uid of userIds) {
        try {
            const user = await message.client.users.fetch(uid).catch(() => null);
            if (!user) { failed++; continue; }
            await user.send({ embeds: [embed] });
            success++;
        } catch {
            failed++;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    return status.edit(
        `✅ **Broadcast la dhameystiray**\n` +
        `📨 La gaadhsiiyay: **${success}**\n` +
        `❌ Gaadhsiin lagama waayey: **${failed}**`
    );
};
