// =====================================================================
// AMARKA: ?admin reward @user iq [amount]
//         ?admin reward @user xp [amount]
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { checkUser, addXp } = require('../../../src/utils/helpers');

module.exports = async function adminReward(message, args) {
    const target = message.mentions.users.first();
    if (!target) {
        return message.reply(
            'Isticmaal:\n' +
            '`?admin reward @user iq [amount]` — IQ\n' +
            '`?admin reward @user xp [amount]` — XP'
        );
    }

    const rest = args.filter((a) => !/<@!?(\d+)>/.test(a));
    if (rest.length < 2) {
        return message.reply(
            'Isticmaal:\n' +
            '`?admin reward @user iq [amount]` — IQ\n' +
            '`?admin reward @user xp [amount]` — XP'
        );
    }

    const type = rest[0].toLowerCase();
    const amount = Number(rest[1].replace(/,/g, ''));

    if (!['iq', 'xp'].includes(type) || Number.isNaN(amount) || amount === 0) {
        return message.reply(
            'Isticmaal:\n' +
            '`?admin reward @user iq [amount]` — IQ\n' +
            '`?admin reward @user xp [amount]` — XP'
        );
    }

    checkUser(target.id);

    if (type === 'iq') {
        userData[target.id].iq = Math.max(0, (userData[target.id].iq || 0) + amount);
        saveData();
        return message.reply(
            `✅ <@${target.id}> wuxuu helay **${amount > 0 ? '+' : ''}${amount} IQ**. ` +
            `(Hadda: **${userData[target.id].iq} IQ**)`
        );
    }

    if (type === 'xp') {
        addXp(target.id, amount);
        saveData();
        return message.reply(
            `✅ <@${target.id}> wuxuu helay **${amount > 0 ? '+' : ''}${amount} XP**. ` +
            `(Wadarta XP: **${userData[target.id].xp}**)`
        );
    }
};
