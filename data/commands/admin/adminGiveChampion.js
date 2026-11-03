// =====================================================================
// AMARKA: ?admin givechampion @user
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { checkUser } = require('../../../src/utils/helpers');

module.exports = async function adminGiveChampion(message, args) {
    const target = message.mentions.users.first();
    if (!target) {
        return message.reply('⚠️ Mention a user: `?admin givechampion @user`');
    }

    checkUser(target.id);
    const data = userData[target.id];

    if (!data.ownedTitles.includes('champion')) {
        data.ownedTitles.push('champion');
    }
    data.activeTitle = 'champion';
    data.customTitle = null; // Deactivate custom if any

    saveData();
    return message.reply(`✅ **${target.username}** waxaa given to title-ka **Champion 🏆**.`);
};