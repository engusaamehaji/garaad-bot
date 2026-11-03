// =====================================================================
// AMARKA: ?admin (router)
// =====================================================================

const { isAdmin }  = require('../../../src/utils/admin');

const broadcast      = require('./adminBroadcast');
const addAdmin       = require('./adminAddAdmin');
const removeAdm      = require('./adminRemoveAdmin');
const listAdm        = require('./adminList');
const bugs           = require('./adminBugs');
const reset          = require('./adminReset');
const dm             = require('./adminDm');
const reward         = require('./adminReward');
const adminHelpPanel = require('./adminHelpPanel');
const giveChampion   = require('./adminGiveChampion');
const removeChampion = require('./adminRemoveChampion');
const godMode        = require('./adminGodMode');
const adminStop      = require('./adminStop');
const adminEconPanel   = require('./adminEconPanel');
const adminEconRestart = require('./adminEconRestart');
const adminGiveAll     = require('./adminGiveAll');

module.exports = async function adminCommand(message, args) {
    if (!isAdmin(message.author.id)) {
        return message.reply('⛔ **Admins only.** Ask an existing admin to add you to the admin list.');
    }

    const sub = (args.shift() || 'help').toLowerCase();

    switch (sub) {
        case 'broadcast':
        case 'bc':
        case 'announce':
            return broadcast(message, args);

        case 'add':
            return addAdmin(message, args);

        case 'remove':
        case 'rm':
        case 'del':
            return removeAdm(message, args);

        case 'list':
        case 'ls':
            return listAdm(message, args);

        case 'bugs':
        case 'cilada':
            return bugs(message, args);

        case 'reset':
            return reset(message, args);

        case 'dm':
        case 'message':
            return dm(message, args);

        case 'reward':
        case 'siin':
        case 'gift':
            return reward(message, args);

        case 'givechampion':
        case 'champion':
            return giveChampion(message, args);

        case 'removechampion':
        case 'rmchampion':
            return removeChampion(message, args);

        case 'stop':
            return adminStop(message, args);

        case 'god':
            return godMode(message, args);

        case 'econ':
        case 'economy':
            return adminEconPanel(message, args);

        case 'giveallcoins':
            return adminGiveAll(message, ['coins', ...args]);

        case 'giveall':
        case 'siidhamaan':
            return adminGiveAll(message, args);

        case 'restart':
        case 'start':
            return adminEconRestart(message);


        case 'transfer':
        case 'bank':
        case 'send': {
            const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
            const { fmt } = require('../../../src/utils/helpers');

            // ?admin bank reset — reset all personal bank balances
            if ((args[0] || '').toLowerCase() === 'reset') {
                const users = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));
                let count = 0;
                for (const uid of users) {
                    const d = econData[uid];
                    if (d.personalBank) {
                        d.personalBank.balance     = 0;
                        d.personalBank.deposits    = 0;
                        d.personalBank.withdrawals = 0;
                        d.personalBank.transactions = [];
                        count++;
                    }
                }
                saveEcon();
                return message.reply(
                    `🏦 **Personal Bank Reset**\n\n` +
                    `✅ **${count}** account balance eber (🪙0) la dhigay.\n` +
                    `📌 Account-yada weli jiraan — only Coins deleteda.\n` +
                    `🏛️ Public banks **ma taabanin.**`
                );
            }

            const target = message.mentions.users.first();
            const amount = Number((args.find(a => !isNaN(parseFloat(a))) || '').replace(/,/g, ''));
            if (!target) return message.reply('⚠️ Usage: `?admin transfer @user 5000`');
            if (!amount || isNaN(amount) || amount <= 0) return message.reply('⚠️ Coins correct type: `?admin transfer @user 5000`');
            checkEconUser(target.id);
            econData[target.id].banks        ??= { garaad: 0 };
            econData[target.id].banks.garaad ??= 0;
            econData[target.id].banks.garaad  += amount;
            saveEcon();
            return message.reply(`✅ **🪙 ${fmt(amount)}** bankiga <@${target.id}> added to.\n🏦 Bank now: **🪙 ${fmt(econData[target.id].banks.garaad)}**`);
        }

        case 'treasury':
        case 'khaznad': {
            const { topUpTreasury, setTreasury, getTreasury, deductFromTreasury, saveEcon } = require('../../../src/economy/econStore');
            const { fmt } = require('../../../src/utils/helpers');
            const sub2   = (args[0] || '').toLowerCase();
            const amount = Number((args[1] || args[0] || '').replace(/,/g, ''));

            // ?admin treasury set [amount] — set exact balance
            if (sub2 === 'set') {
                if (!args[1] || isNaN(amount) || amount < 0)
                    return message.reply('⚠️ Usage: `?admin treasury set 500000`');
                setTreasury(amount);
                saveEcon();
                const t = getTreasury();
                return message.reply(`✅ Treasury balance set to **🪙 ${fmt(t.balance)}**.`);
            }

            // ?admin treasury reduce [amount] — deduct without tracking
            if (sub2 === 'reduce') {
                if (!args[1] || isNaN(amount) || amount <= 0)
                    return message.reply('⚠️ Usage: `?admin treasury reduce 500000000`');
                const t = getTreasury();
                if (amount > t.balance) return message.reply(`⚠️ The treasury does not have enough Coins. Current balance: **🪙 ${fmt(t.balance)}**`);
                deductFromTreasury(amount);
                saveEcon();
                return message.reply(`✅ **🪙 ${fmt(amount)}** deducted from the treasury.\n🏛️ Current: **🪙 ${fmt(t.balance)}**`);
            }

            // ?admin treasury [amount] — topup (existing behaviour)
            const topAmount = Number((args[0] || '').replace(/,/g, ''));
            if (!topAmount || !Number.isFinite(topAmount) || topAmount <= 0)
                return message.reply('⚠️ Usage:\n`?admin treasury set 500000` — set balance\n`?admin treasury reduce 500000000` — reduce balance\n`?admin treasury 200000` — add Coins');
            topUpTreasury(topAmount);
            saveEcon();
            const t = getTreasury();
            return message.reply(`✅ **🪙 ${fmt(topAmount)}** treasury added to.\n🏛️ Current: **🪙 ${fmt(t.balance)}**`);
        }

        case 'vip': {
            const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
            const target = message.mentions.users.first();
            if (!target) return message.reply('⚠️ Usage: `?admin vip @user`');
            checkEconUser(target.id);
            const d = econData[target.id];
            d.vip = !d.vip;
            saveEcon();
            return message.reply(d.vip
                ? `✅ <@${target.id}> **VIP** noqday — daily cap was not found.`
                : `❌ <@${target.id}> VIP la qaatay — cap caadi ah ayuu leeyahay.`
            );
        }

        case 'help':
        default:
            return adminHelpPanel(message);
    }
};
