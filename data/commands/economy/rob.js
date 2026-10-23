const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');

const WINDOW_MS   = 15 * 60 * 1000;  // 15-minute window
const MAX_ROBS    = 2;               // max 2 robs per window
const ROB_MIN_BTC            = 1_000;
const MAX_STEAL_FRACTION     = 0.25;
const ROB_SUCCESS_RATE       = 0.50;

module.exports = async function robCmd(message) {
    const userId = message.author.id;
    const target = message.mentions.users.first();

    if (!target) return message.reply('⚠️ Isticmaal: `?rob @user`');
    if (target.id === userId) return message.reply('⚠️ Adigu adiga ma dhici kartid.');
    if (target.bot) return message.reply('⚠️ Bot ma dhici kartid.');

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
        return message.reply(`⏳ **2 rob** 15 daqiiqo gudahood isticmaashay. Sug **${wait} daqiiqo**!`);
    }

    const targetCooldownLeft = WINDOW_MS - (now - (robber.lastRobTargets[target.id] || 0));
    if (targetCooldownLeft > 0)
        return message.reply(`⏳ Sug **${Math.ceil(targetCooldownLeft / 60000)} daqiiqo** kadib **${target.username}** mar kale dhacdo.`);

    if ((victim.btc || 0) < ROB_MIN_BTC)
        return message.reply(`⚠️ **${target.username}** lacag ku filan ma hayo (ugu yaraan **₿${ROB_MIN_BTC.toLocaleString()}**).`);

    if ((victim.inventory?.safetyExpiry || 0) > Date.now()) {
        const h = Math.ceil((victim.inventory.safetyExpiry - Date.now()) / 3600000);
        return message.reply(`🛡️ **${target.username}** Safety Shield waxaa ilaaliya — ${h}h haray.`);
    }

    robber.lastRob = now;
    robber.lastRobTargets[target.id] = now;
    robber.robWindow.count++;

    const richRobber = (robber.btc  || 0) > 5_000;
    const richTarget = (victim.btc  || 0) >= 5_000;
    const stealFrac  = richTarget ? 0.50 : MAX_STEAL_FRACTION;
    const success    = richRobber ? false : Math.random() < ROB_SUCCESS_RATE;

    if (success) {
        const stolen = Math.floor((victim.btc || 0) * stealFrac);
        victim.btc   = (victim.btc  || 0) - stolen;
        robber.btc   = (robber.btc  || 0) + stolen;
        saveEcon();
        return message.reply(
            `🔫 **DHAC GUULAYSATAY!**\n\n` +
            `✅ Waxaad si guul leh u dhacday **${target.username}**!\n\n` +
            `💰 **La xaday:** ₿${stolen.toLocaleString()}\n` +
            `💳 **Wallet:** ₿${robber.btc.toLocaleString()}`
        );
    } else {
        const penaltyFrac = richRobber ? 0.25 : (richTarget ? 0.50 : 0.20);
        const penaltyPct  = richRobber ? '25%' : (richTarget ? '50%' : '20%');
        const penalty     = Math.floor((robber.btc || 0) * penaltyFrac);
        robber.btc        = Math.max(0, (robber.btc || 0) - penalty);
        saveEcon();
        return message.reply(
            `🚔 **DHAC FASHILMAY!**\n\n` +
            `❌ Kuma hergelin **${target.username}**.\n\n` +
            `💸 **Loss:** ₿${penalty.toLocaleString()} · 💳 **Wallet:** ₿${robber.btc.toLocaleString()}\n` +
            `⚠️ **Ciqaab: ${penaltyPct}**` +
            (richRobber ? `\n💡 Lacagta badan tahay — ma dhici kartid.` : '')
        );
    }
};
