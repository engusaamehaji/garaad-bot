// =====================================================================
// AMARKA: ?buy [shay]  |  ?buy custom <magacaaga>
// =====================================================================

const { userData, saveData } = require('../../src/store');
const { econData, saveEcon, getSpendableCoins, spendCoins } = require('../../src/economy/econStore');
const { PREFIX, SHOP_ITEMS, TITLES } = require('../../src/config');
const { checkUser } = require('../../src/utils/helpers');
const { FRAMES, BOOSTERS, LOOT_BOXES, RINGS } = require('../../src/utils/itemDefs');
const { ECON_TITLES } = require('./economy/econShop');

const CUSTOM_MAX_LEN = 24;

module.exports = async function buyCommand(message, args) {
    const userId  = message.author.id;
    checkUser(userId);
    const itemKey = (args[0] || '').toLowerCase();

    // ── ?buy safety_shield ──
    if (itemKey === 'safety_shield') {
        const PRICE = 300;
        const { checkEconUser } = require('../../src/economy/econStore');
        checkEconUser(userId);
        const ec = econData[userId];
        if (getSpendableCoins(userId) < PRICE) return message.reply(`⚠️ You do not have enough Coins. U baahan: **🪙${PRICE.toLocaleString()}**, you have: **🪙${getSpendableCoins(userId).toLocaleString()}**.`);
        spendCoins(userId, PRICE);
        ec.inventory ??= {};
        ec.inventory.safetyExpiry = Date.now() + 24 * 60 * 60 * 1000;
        saveEcon();
        return message.reply(`✅ **🛡️ Safety Shield** purchased! (-🪙${PRICE.toLocaleString()})\n24 saac rob kaa kari maysid.`);
    }

    // ── ?buy rob_ticket ──
    if (itemKey === 'rob_ticket') {
        const PRICE = 500;
        const { checkEconUser } = require('../../src/economy/econStore');
        checkEconUser(userId);
        const ec = econData[userId];
        if (getSpendableCoins(userId) < PRICE) return message.reply(`⚠️ You do not have enough Coins. U baahan: **🪙${PRICE.toLocaleString()}**, you have: **🪙${getSpendableCoins(userId).toLocaleString()}**.`);
        spendCoins(userId, PRICE);
        ec.inventory ??= {};
        ec.inventory.robticketExpiry = Date.now() + 24 * 60 * 60 * 1000;
        saveEcon();
        return message.reply(`✅ **🔫 Rob Ticket** purchased! (-🪙${PRICE.toLocaleString()})\n24 saac \`?rob @user\` use.`);
    }

    // ── ?buy ring <type> ──
    if (itemKey === 'ring') {
        const { checkEconUser } = require('../../src/economy/econStore');
        const { ensureRel } = require('./relationship');
        const type = (args[1] || '').toLowerCase();
        const ring = RINGS[type];
        if (!ring) return message.reply(`⚠️ Noocyada: \`silver\`, \`diamond\`, \`royal\`, \`somali\`\nExample: \`?buy ring diamond\``);
        checkEconUser(userId);
        ensureRel(userId);
        const ec = econData[userId];
        if (getSpendableCoins(userId) < ring.price) return message.reply(`⚠️ You do not have enough Coins. U baahan: **🪙${ring.price.toLocaleString()}**, you have: **🪙${getSpendableCoins(userId).toLocaleString()}**.`);
        spendCoins(userId, ring.price);
        userData[userId].ownedRings ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
        userData[userId].ownedRings[type] = (userData[userId].ownedRings[type] || 0) + 1;
        saveData(); saveEcon();
        return message.reply(`✅ **${ring.emoji} ${ring.name}** purchased! (-🪙${ring.price.toLocaleString()})\nUsage: \`?propose @user\``);
    }

    // ── ?buy frame <key> ──
    if (itemKey === 'frame') {
        const key = (args[1] || '').toLowerCase();
        const frame = FRAMES[key];
        if (!frame) return message.reply(`⚠️ Frame not found. View: \`?shop frames\``);
        if (frame.lootOnly) return message.reply(`⚠️ **${frame.name}** waxaa laga heli karaa only Loot Box. Buy: \`?buy loot legendary\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account not found. \`?jeeb\` to get started.');
        if (getSpendableCoins(userId) < frame.price) return message.reply(`⚠️ You do not have enough Coins. You need **🪙${frame.price.toLocaleString()}**, you have **🪙${getSpendableCoins(userId).toLocaleString()}**.`);
        if ((userData[userId].ownedFrames || []).includes(key)) return message.reply(`✅ Frame-kaas horay ayaad u lahayd.`);
        spendCoins(userId, frame.price);
        userData[userId].ownedFrames.push(key);
        userData[userId].activeFrame = key; // auto-equip
        saveData(); saveEcon();
        return message.reply(`✅ **${frame.emoji} ${frame.name}** purchased & equipped! (-🪙${frame.price.toLocaleString()})\n\`?profile\` ku eeg.`);
    }

    // ── ?buy booster <key> ──
    if (itemKey === 'booster') {
        const requestedKey = (args[1] || '').toLowerCase();
        const key = requestedKey;
        const boost = BOOSTERS[key];
        if (!boost) return message.reply(`⚠️ Booster not found. View: \`?shop boosters\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account not found.');
        if (getSpendableCoins(userId) < boost.price) return message.reply(`⚠️ You do not have enough Coins. You need **🪙${boost.price.toLocaleString()}**.`);
        spendCoins(userId, boost.price);
        const d = userData[userId];
        if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
        else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
        else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
        else if (key === 'double_coins') d.boosters.doubleCoins = Date.now() + boost.duration;
        saveData(); saveEcon();
        return message.reply(`✅ **${boost.emoji} ${boost.name}** purchased! (-🪙${boost.price.toLocaleString()})\n${boost.desc}`);
    }

    // ── ?buy loot <type> ──
    if (itemKey === 'loot') {
        const type = (args[1] || 'common').toLowerCase();
        const box  = LOOT_BOXES[type];
        if (!box) return message.reply(`⚠️ Type: \`common\`, \`rare\`, \`legendary\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account not found.');
        if (getSpendableCoins(userId) < box.price) return message.reply(`⚠️ You do not have enough Coins. You need **🪙${box.price.toLocaleString()}**.`);
        spendCoins(userId, box.price);
        userData[userId].lootBoxes       ??= {};
        userData[userId].lootBoxes[type]  = (userData[userId].lootBoxes[type] || 0) + 1;
        saveData(); saveEcon();
        return message.reply(`✅ **${box.emoji} ${box.name}** purchased! (-🪙${box.price.toLocaleString()})\nFur: \`?open ${type}\``);
    }

    // ── ?buy title <key> (Coins-based economy titles) ──
    if (itemKey === 'title') {
        const key   = (args[1] || '').toLowerCase();
        const title = ECON_TITLES[key];
        if (!title) return message.reply(`⚠️ Title-kaas was not found. View: \`?shop titles\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account not found.');
        if ((ec.econTitles || []).includes(key)) return message.reply(`✅ Title-kaas horay ayaad u lahayd.`);
        if (getSpendableCoins(userId) < title.price) return message.reply(`⚠️ You do not have enough Coins. You need **🪙${title.price.toLocaleString()}**.`);
        spendCoins(userId, title.price);
        ec.econTitles = ec.econTitles || [];
        ec.econTitles.push(key);
        if (key === 'custom') {
            const name = args.slice(2).join(' ').trim();
            if (!name) return message.reply('⚠️ Usage: `?buy title custom <magacaaga>`');
            ec.customEconTitle = name;
            ec.activeEconTitle = 'custom';
        }
        saveEcon();
        return message.reply(`✅ **${title.label}** purchased! (-🪙${title.price.toLocaleString()})\n\`?equip title ${key}\` si aad u xidho.`);
    }

    // ── Custom title: ?buy custom <magac> ──
    if (itemKey === 'custom') {
        const customName = args.slice(1).join(' ').trim();
        const price      = TITLES.custom.custom.price;

        if (!customName) {
            return message.reply(
                `✍️ **Custom Title — Sida loo useo:**\n\n` +
                `\`${PREFIX}buy custom <magacaaga>\`\n\n` +
                `**Example:** \`${PREFIX}buy custom Garaadle\`\n\n` +
                `💰 Qiimaha: **${price} XP** · XP-gaaga: **${userData[userId].xp} XP**`
            );
        }

        if (customName.length > CUSTOM_MAX_LEN) {
            return message.reply(`⚠️ Magaca aad dheer yahay! Ugu badnaan **${CUSTOM_MAX_LEN}** xaraf.`);
        }

        if (userData[userId].xp < price) {
            return message.reply(
                `⚠️ You do not have enough XP!\n\nYou need **${price} XP** · and you have **${userData[userId].xp} XP**.`
            );
        }

        // If horeba u purchased — update only sameeyaa (Coins cusub la qaadaa)
        const alreadyOwned = userData[userId].ownedTitles.includes('custom');
        if (alreadyOwned) {
            // Beddelid title cusub — XP la qaadaa mar kale
            userData[userId].xp        -= price;
            userData[userId].customTitle = customName;
            userData[userId].activeTitle = 'custom';
            saveData();
            return message.reply(`✅ Custom title-kaaga waa la cusboonaasiiyay: **${customName}** (-${price} XP)\n\nYour new title will appear next time.`);
        }

        // Iibsasho cusub
        userData[userId].xp -= price;
        userData[userId].customTitle = customName;
        userData[userId].activeTitle = 'custom';
        if (!userData[userId].ownedTitles.includes('custom')) {
            userData[userId].ownedTitles.push('custom');
        }
        saveData();
        return message.reply(`✅ Custom title purchased: **${customName}** (-${price} XP)\n\nYour new title will appear next time!`);
    }

    // ── Shayga kale: SHOP_ITEMS ama TITLES ──
    let item = SHOP_ITEMS[itemKey];
    if (!item) {
        for (const category in TITLES) {
            if (TITLES[category][itemKey]) {
                item = TITLES[category][itemKey];
                break;
            }
        }
    }

    if (!item) {
        return message.reply(`⚠️ Shay aan jirin. Use \`${PREFIX}titles\` si aad u aragto darajooyinka.`);
    }

    // Champion title — admin only
    if (itemKey === 'champion') {
        return message.reply(
            `🏆 **Champion** title-ka waa la iibsan **karin**.\n\n` +
            `Title-kan waxaa heli kara **only** major tournament wins — admin ayaa u ogolaan doona.`
        );
    }

    if (userData[userId].xp < item.price) {
        return message.reply(
            `⚠️ You do not have enough XP! You need **${item.price} XP**, and you have **${userData[userId].xp} XP**.`
        );
    }

    userData[userId].xp -= item.price;

    if (itemKey === 'shield') {
        userData[userId].inventory.shield++;
    } else if (itemKey === 'double') {
        userData[userId].doubleXpUntil = Date.now() + 60 * 60 * 1000;
    } else if (itemKey === 'hint') {
        userData[userId].inventory.hint++;
    } else if (itemKey === 'retry') {
        userData[userId].inventory.retry++;
    } else {
        if (!userData[userId].ownedTitles.includes(itemKey)) {
            userData[userId].ownedTitles.push(itemKey);
        }
        userData[userId].activeTitle = itemKey;
    }

    saveData();
    return message.reply(`✅ You purchased **${item.name}** (-${item.price} XP). Thank you!`);
};
