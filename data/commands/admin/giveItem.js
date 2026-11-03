// =====================================================================
// AMARKA ADMIN: ?giveitem @user <type> <key>
// Types: frame, loot, booster, coins
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { econData, saveEcon }  = require('../../../src/economy/econStore');
const { checkUser } = require('../../../src/utils/helpers');
const { FRAMES, BOOSTERS, LOOT_BOXES } = require('../../../src/utils/itemDefs');
const { isAdmin } = require('../../../src/utils/admin');

module.exports = async function giveItemCmd(message, args) {
    if (!isAdmin(message.author.id))
        return message.reply('⛔ Admin only.');

    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Usage: `?giveitem @user <type> <key>`\n\nTypes: `frame`, `loot`, `booster`, `coins`');

    const type = (args[1] || '').toLowerCase();
    const requestedKey = (args[2] || '').toLowerCase();
    const key = requestedKey;

    if (!type) return message.reply(
        `⚠️ **?giveitem @user <type> <key>**\n\n` +
        `**frame** keys: \`${Object.keys(FRAMES).join('`, `')}\`\n` +
        `**loot** keys: \`common\`, \`rare\`, \`legendary\`\n` +
        `**booster** keys: \`${Object.keys(BOOSTERS).join('`, `')}\`\n` +
        `**coins** amount: \`?giveitem @user coins 5000\``
    );

    checkUser(target.id);
    const d  = userData[target.id];
    const ec = econData[target.id];

    if (type === 'frame') {
        const frame = FRAMES[key];
        if (!frame) return message.reply(`⚠️ Frame was not found: \`${key}\`\n\nKeys: \`${Object.keys(FRAMES).join('`, `')}\``);
        if (!(d.ownedFrames || []).includes(key)) d.ownedFrames.push(key);
        d.activeFrame = key;
        saveData();
        return message.reply(`✅ **${frame.emoji} ${frame.name}** (${frame.rarity}) given to **${target.username}** — auto-equipped.`);
    }

    if (type === 'loot') {
        const box = LOOT_BOXES[key];
        if (!box) return message.reply(`⚠️ Loot box was not found: \`${key}\`\nKeys: \`common\`, \`rare\`, \`legendary\``);
        d.lootBoxes       ??= {};
        d.lootBoxes[key]   = (d.lootBoxes[key] || 0) + 1;
        saveData();
        return message.reply(`✅ **${box.emoji} ${box.name}** given to **${target.username}**. Total: ${d.lootBoxes[key]}`);
    }

    if (type === 'booster') {
        const boost = BOOSTERS[key];
        if (!boost) return message.reply(`⚠️ Booster was not found: \`${key}\`\nKeys: \`${Object.keys(BOOSTERS).join('`, `')}\``);
        d.boosters ??= {};
        if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
        else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
        else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
        else if (key === 'double_coins') d.boosters.doubleCoins = Date.now() + boost.duration;
        saveData();
        return message.reply(`✅ **${boost.emoji} ${boost.name}** given to **${target.username}**.`);
    }

    if (type === 'coins') {
        const amount = parseInt(key);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Usage: `?giveitem @user coins 5000`');
        if (!ec) return message.reply(`⚠️ **${target.username}** economy account does not have. \`?jeeb\` ha isticmaalo marka hore.`);
        ec.coins = (ec.coins || 0) + amount;
        saveEcon();
        return message.reply(`✅ **🪙${amount.toLocaleString()} Coins** given to **${target.username}**. Balance: 🪙${ec.coins.toLocaleString()}`);
    }

    return message.reply('⚠️ Types: `frame`, `loot`, `booster`, or `coins`');
};
