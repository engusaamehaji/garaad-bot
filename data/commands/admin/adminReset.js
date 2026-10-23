// =====================================================================
// SUB-AMARKA: ?admin reset @user
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { checkUser, todayKey } = require('../../../src/utils/helpers');

module.exports = async function adminReset(message, args) {
    let target = message.mentions.users.first();
    if (!target && args[0] && /^\d{17,20}$/.test(args[0])) {
        target = await message.client.users.fetch(args[0]).catch(() => null);
    }
    if (!target) {
        return message.reply('⚠️ Fadlan tilmaan user. Tusaale: `?admin reset @user`');
    }

    if (!userData[target.id]) {
        return message.reply(`ℹ️ <@${target.id}> xog ma laha database-ka.`);
    }

    delete userData[target.id];
    checkUser(target.id);
    saveData();

    return message.reply(`✅ Xogta <@${target.id}> dib waa loo dejiyay (IQ=0, XP=0, stats=0).`);
};
