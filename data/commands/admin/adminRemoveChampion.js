// =====================================================================
// AMARKA: ?admin removechampion @user
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { checkUser } = require('../../../src/utils/helpers');

module.exports = async function adminRemoveChampion(message, args) {
    const target = message.mentions.users.first();
    if (!target) {
        return message.reply('⚠️ Sheeg user-ka: `?admin removechampion @user`');
    }

    checkUser(target.id);
    const data = userData[target.id];

    // Remove from owned titles
    data.ownedTitles = data.ownedTitles.filter(t => t !== 'champion');

    // If active, deactivate
    if (data.activeTitle === 'champion') {
        data.activeTitle = null;
    }

    saveData();
    return message.reply(`✅ **${target.username}** waxaa laga qaaday title-ka **Champion 🏆**.`);
};