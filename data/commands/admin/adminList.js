// =====================================================================
// SUB-AMARKA: ?admin list
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { listAdmins }   = require('../../../src/utils/admin');

module.exports = async function adminList(message) {
    const admins = listAdmins();

    const lines = await Promise.all(admins.map(async (id, i) => {
        const u = await message.client.users.fetch(id).catch(() => null);
        return `**${i + 1}.** ${u ? `${u.tag} ` : ''}<@${id}> \`${id}\``;
    }));

    const embed = new EmbedBuilder()
        .setTitle('👑 Garaad — Liiska Admin-yada')
        .setDescription(lines.length ? lines.join('\n') : 'Cidna admin maaha.')
        .setColor('#9b59b6')
        .setFooter({ text: `Wadarta admin-yada: ${admins.length}` });

    return message.reply({ embeds: [embed] });
};
