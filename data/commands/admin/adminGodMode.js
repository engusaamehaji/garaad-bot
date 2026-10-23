// =====================================================================
// AMARKA: ?admin god @user (hidden command)
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { checkUser, addXp } = require('../../../src/utils/helpers');

module.exports = async function adminGodMode(message, args) {
    const target = message.mentions.users.first();
    if (!target) {
        return message.reply('⚠️ Sheeg user-ka: `?admin god @user`');
    }

    checkUser(target.id);
    addXp(target.id, 1000); // Give 1000 XP
    saveData();

    return message.reply(`✨ **GOD MODE ACTIVATED!** ${target.username} waxaa la siiyay **1000 XP**!`);
};