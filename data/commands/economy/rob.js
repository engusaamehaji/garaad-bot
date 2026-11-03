const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');

const WINDOW_MS   = 15 * 60 * 1000;  // 15-minute window
const MAX_ROBS    = 2;               // max 2 robs per window
const ROB_MIN_Coins            = 1_000;
const MAX_STEAL_FRACTION     = 0.25;
const ROB_SUCCESS_RATE       = 0.50;

module.exports = async function robCmd(message) {
    const userId = message.author.id;
    const target = message.mentions.users.first();

    if (!target) return message.reply('⚠️ Usage: `?rob @user`');
    if (target.id === userId) return message.reply('⚠️ You cannot rob yourself.');
    if (target.bot) return message.reply('⚠️ You cannot rob a bot.');

    checkEconUser(userId);
    checkEconUser(target.id);

    const robber = econData[userId];
    const victim = econData[target.id];
    robber.lastRobTargets ??= {};
    robber.robWindow      ??= { count: 0, start: 0 };

    const now = Date.now();

    // Reset window if 15 min passed
    if (now - robber.robWindow.start >= WINDOW_MS) {
        robber.robWindow = { count: 0, start: now };
    }

    if (robber.robWindow.count >= MAX_ROBS) {
        const wait = Math.ceil((WINDOW_MS - (now - robber.robWindow.start)) / 60000);
        return message.reply(`⏳ You have used both robbery attempts for this 15-minute window. Try again in **${wait} minute(s)**.`);
    }

    const targetCooldownLeft = WINDOW_MS - (now - (robber.lastRobTargets[target.id] || 0));
    if (targetCooldownLeft > 0)
        return message.reply(`⏳ You can try robbing **${target.username}** again in **${Math.ceil(targetCooldownLeft / 60000)} minute(s)**.`);

    if ((victim.coins || 0) < ROB_MIN_Coins)
        return message.reply(`⚠️ **${target.username}** does not have enough Coins to rob. They need at least **🪙${ROB_MIN_Coins.toLocaleString()}**.`);

    if ((victim.inventory?.safetyExpiry || 0) > Date.now()) {
        const h = Math.ceil((victim.inventory.safetyExpiry - Date.now()) / 3600000);
        return message.reply(`🛡️ **${target.username}** is protected by a Safety Shield for another **${h} hour(s)**.`);
    }

    robber.lastRob = now;
    robber.lastRobTargets[target.id] = now;
    robber.robWindow.count++;

    const richRobber = (robber.coins  || 0) > 5_000;
    const richTarget = (victim.coins  || 0) >= 5_000;
    const stealFrac  = richTarget ? 0.50 : MAX_STEAL_FRACTION;
    const success    = richRobber ? false : Math.random() < ROB_SUCCESS_RATE;

    if (success) {
        const stolen = Math.floor((victim.coins || 0) * stealFrac);
        victim.coins   = (victim.coins  || 0) - stolen;
        robber.coins   = (robber.coins  || 0) + stolen;
        saveEcon();
        return message.reply(
            `🔫 **ROBBERY SUCCESSFUL!**\n\n` +
            `✅ You successfully robbed **${target.username}**!\n\n` +
            `💰 **Coins stolen:** 🪙${stolen.toLocaleString()}\n` +
            `💳 **Wallet:** 🪙${robber.coins.toLocaleString()}`
        );
    } else {
        const penaltyFrac = richRobber ? 0.25 : (richTarget ? 0.50 : 0.20);
        const penaltyPct  = richRobber ? '25%' : (richTarget ? '50%' : '20%');
        const penalty     = Math.floor((robber.coins || 0) * penaltyFrac);
        robber.coins        = Math.max(0, (robber.coins || 0) - penalty);
        saveEcon();
        return message.reply(
            `🚔 **ROBBERY FAILED!**\n\n` +
            `❌ You failed to rob **${target.username}**.\n\n` +
            `💸 **Loss:** 🪙${penalty.toLocaleString()} · 💳 **Wallet:** 🪙${robber.coins.toLocaleString()}\n` +
            `⚠️ **Penalty: ${penaltyPct}**` +
            (richRobber ? `\n💡 Players with more than 5,000 Coins cannot rob.` : '')
        );
    }
};
