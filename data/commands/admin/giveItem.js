// =====================================================================
// AMARKA ADMIN: ?giveitem @user <type> <key>
// Types: frame, loot, booster, btc
// =====================================================================

const { userData, saveData } = require('../../../src/store');
const { econData, saveEcon }  = require('../../../src/economy/econStore');
const { checkUser } = require('../../../src/utils/helpers');
const { FRAMES, BOOSTERS, LOOT_BOXES } = require('../../../src/utils/itemDefs');
const { isAdmin } = require('../../../src/utils/admin');

module.exports = async function giveItemCmd(message, args) {
    if (!isAdmin(message.author.id))
        return message.reply('⛔ Admin kaliya.');

    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Isticmaal: `?giveitem @user <type> <key>`\n\nTypes: `frame`, `loot`, `booster`, `btc`');

    const type = (args[1] || '').toLowerCase();
    const key  = (args[2] || '').toLowerCase();

    if (!type) return message.reply(
        `⚠️ **?giveitem @user <type> <key>**\n\n` +
        `**frame** keys: \`${Object.keys(FRAMES).join('`, `')}\`\n` +
        `**loot** keys: \`common\`, \`rare\`, \`legendary\`\n` +
        `**booster** keys: \`${Object.keys(BOOSTERS).join('`, `')}\`\n` +
        `**btc** amount: \`?giveitem @user btc 5000\``
    );

    checkUser(target.id);
    const d  = userData[target.id];
    const ec = econData[target.id];

    if (type === 'frame') {
        const frame = FRAMES[key];
        if (!frame) return message.reply(`⚠️ Frame ma jiro: \`${key}\`\n\nKeys: \`${Object.keys(FRAMES).join('`, `')}\``);
        if (!(d.ownedFrames || []).includes(key)) d.ownedFrames.push(key);
        d.activeFrame = key;
        saveData();
        return message.reply(`✅ **${frame.emoji} ${frame.name}** (${frame.rarity}) la siiyay **${target.username}** — auto-equipped.`);
    }

    if (type === 'loot') {
        const box = LOOT_BOXES[key];
        if (!box) return message.reply(`⚠️ Loot box ma jiro: \`${key}\`\nKeys: \`common\`, \`rare\`, \`legendary\``);
        d.lootBoxes       ??= {};
        d.lootBoxes[key]   = (d.lootBoxes[key] || 0) + 1;
        saveData();
        return message.reply(`✅ **${box.emoji} ${box.name}** la siiyay **${target.username}**. Total: ${d.lootBoxes[key]}`);
    }

    if (type === 'booster') {
        const boost = BOOSTERS[key];
        if (!boost) return message.reply(`⚠️ Booster ma jiro: \`${key}\`\nKeys: \`${Object.keys(BOOSTERS).join('`, `')}\``);
        d.boosters ??= {};
        if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
        else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
        else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
        else if (key === 'double_btc') d.boosters.doubleBtc = Date.now() + boost.duration;
        saveData();
        return message.reply(`✅ **${boost.emoji} ${boost.name}** la siiyay **${target.username}**.`);
    }

    if (type === 'btc') {
        const amount = parseInt(key);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Isticmaal: `?giveitem @user btc 5000`');
        if (!ec) return message.reply(`⚠️ **${target.username}** economy account ma laha. \`?jeeb\` ha isticmaalo marka hore.`);
        ec.btc = (ec.btc || 0) + amount;
        saveEcon();
        return message.reply(`✅ **₿${amount.toLocaleString()} BTC** la siiyay **${target.username}**. Haraaga: ₿${ec.btc.toLocaleString()}`);
    }

    return message.reply('⚠️ Type: `frame`, `loot`, `booster`, ama `btc`');
};
