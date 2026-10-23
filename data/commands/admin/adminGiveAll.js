const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { userData, saveData }                = require('../../../src/store');
const { checkUser, fmt }                    = require('../../../src/utils/helpers');
const { listAdmins }                       = require('../../../src/utils/admin');

const OWNER_ID = '1191096205955055690';

async function notifyAdmins(client, adminUser, action) {
    const recipients = new Set([OWNER_ID, ...listAdmins()]);
    recipients.delete(adminUser.id);
    const messageText =
        `🔐 **Admin Action Log**\n` +
        `👤 Admin: **${adminUser.username}** (\`${adminUser.id}\`)\n` +
        `⚙️ Action: ${action}\n` +
        `🕐 ${new Date().toUTCString()}`;
    for (const uid of recipients) {
        const user = await client.users.fetch(uid).catch(() => null);
        if (user) await user.send(messageText).catch(() => {});
    }
}

// ?admin giveallbtc 5000  /  ?admin giveall btc 5000  /  ?admin giveall iq 100
module.exports = async function adminGiveAll(message, args) {
    const asset  = (args[0] || '').toLowerCase();
    const amount = Number((args[1] || '').replace(/,/g, ''));

    if ((asset !== 'btc' && asset !== 'iq') || isNaN(amount) || amount <= 0) {
        return message.reply('⚠️ Usage: `?admin giveall btc 5000`  or  `?admin giveall iq 100`');
    }

    if (asset === 'iq') {
        const users = Object.keys(userData);
        for (const uid of users) {
            checkUser(uid);
            userData[uid].iq = (userData[uid].iq || 0) + amount;
        }
        saveData();
        await notifyAdmins(message.client, message.author, `Give All IQ: +${amount} IQ × ${users.length} players`);
        return message.reply(`✅ **${users.length}** players each received **+${amount} IQ**`);
    }

    const users = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));
    for (const uid of users) {
        checkEconUser(uid);
        econData[uid].btc = (econData[uid].btc || 0) + amount;
    }
    saveEcon();
    await notifyAdmins(message.client, message.author, `Give All BTC: +₿ ${fmt(amount)} × ${users.length} players`);
    return message.reply(`✅ **${users.length}** players each received **₿ ${fmt(amount)}** (total **₿ ${fmt(amount * users.length)}**).`);
};
