// =====================================================================
// SUB-AMARKA: ?admin remove @user
// =====================================================================

const { removeAdmin, listAdmins } = require('../../../src/utils/admin');

module.exports = async function adminRemoveAdmin(message, args) {
    let target = message.mentions.users.first();
    if (!target && args[0] && /^\d{17,20}$/.test(args[0])) {
        target = await message.client.users.fetch(args[0]).catch(() => null);
    }
    if (!target) {
        return message.reply('⚠️ Please mention a user. Example: `?admin remove @user`');
    }

    if (listAdmins().length === 1 && target.id === message.author.id) {
        return message.reply('⛔ You cannot remove yourself because you are the only admin.');
    }

    const removed = removeAdmin(target.id);
    if (removed) {
        return message.reply(`✅ <@${target.id}> was removed from the admin list.`);
    } else {
        return message.reply(`ℹ️ <@${target.id}> was not found in the admin list.`);
    }
};
