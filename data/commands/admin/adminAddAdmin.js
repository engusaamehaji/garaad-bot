// =====================================================================
// SUB-AMARKA: ?admin add @user (ama userId)
// =====================================================================

const { addAdmin } = require('../../../src/utils/admin');

module.exports = async function adminAddAdmin(message, args) {
    let target = message.mentions.users.first();
    if (!target && args[0] && /^\d{17,20}$/.test(args[0])) {
        target = await message.client.users.fetch(args[0]).catch(() => null);
    }
    if (!target) {
        return message.reply('⚠️ Fadlan tilmaan user. Tusaale: `?admin add @user` ama `?admin add 1234567890`');
    }

    const added = addAdmin(target.id);
    if (added) {
        return message.reply(`✅ <@${target.id}> waxaa loo daray admin-yada.`);
    } else {
        return message.reply(`ℹ️ <@${target.id}> mar hore ayuu admin ahaa.`);
    }
};
