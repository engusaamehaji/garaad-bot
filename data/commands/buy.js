// =====================================================================
// AMARKA: ?buy [shay]  |  ?buy custom <magacaaga>
// =====================================================================

const { userData, saveData } = require('../../src/store');
const { econData, saveEcon }  = require('../../src/economy/econStore');
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
        if ((ec.btc || 0) < PRICE) return message.reply(`⚠️ BTC kuu ma filna. U baahan: **₿${PRICE.toLocaleString()}**, haysataa: **₿${(ec.btc||0).toLocaleString()}**.`);
        ec.btc -= PRICE;
        ec.inventory ??= {};
        ec.inventory.safetyExpiry = Date.now() + 24 * 60 * 60 * 1000;
        saveEcon();
        return message.reply(`✅ **🛡️ Safety Shield** la iibsaday! (-₿${PRICE.toLocaleString()})\n24 saac rob kaa kari maysid.`);
    }

    // ── ?buy rob_ticket ──
    if (itemKey === 'rob_ticket') {
        const PRICE = 500;
        const { checkEconUser } = require('../../src/economy/econStore');
        checkEconUser(userId);
        const ec = econData[userId];
        if ((ec.btc || 0) < PRICE) return message.reply(`⚠️ BTC kuu ma filna. U baahan: **₿${PRICE.toLocaleString()}**, haysataa: **₿${(ec.btc||0).toLocaleString()}**.`);
        ec.btc -= PRICE;
        ec.inventory ??= {};
        ec.inventory.robticketExpiry = Date.now() + 24 * 60 * 60 * 1000;
        saveEcon();
        return message.reply(`✅ **🔫 Rob Ticket** la iibsaday! (-₿${PRICE.toLocaleString()})\n24 saac \`?rob @user\` isticmaal.`);
    }

    // ── ?buy ring <type> ──
    if (itemKey === 'ring') {
        const { checkEconUser } = require('../../src/economy/econStore');
        const { ensureRel } = require('./relationship');
        const type = (args[1] || '').toLowerCase();
        const ring = RINGS[type];
        if (!ring) return message.reply(`⚠️ Noocyada: \`silver\`, \`diamond\`, \`royal\`, \`somali\`\nTusaale: \`?buy ring diamond\``);
        checkEconUser(userId);
        ensureRel(userId);
        const ec = econData[userId];
        if ((ec.btc || 0) < ring.price) return message.reply(`⚠️ BTC kuu ma filna. U baahan: **₿${ring.price.toLocaleString()}**, haysataa: **₿${(ec.btc||0).toLocaleString()}**.`);
        ec.btc -= ring.price;
        userData[userId].ownedRings ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
        userData[userId].ownedRings[type] = (userData[userId].ownedRings[type] || 0) + 1;
        saveData(); saveEcon();
        return message.reply(`✅ **${ring.emoji} ${ring.name}** la iibsaday! (-₿${ring.price.toLocaleString()})\nIsticmaal: \`?propose @user\``);
    }

    // ── ?buy frame <key> ──
    if (itemKey === 'frame') {
        const key   = (args[1] || '').toLowerCase();
        const frame = FRAMES[key];
        if (!frame) return message.reply(`⚠️ Frame-kaas ma jiro. Eeg: \`?shop frames\``);
        if (frame.lootOnly) return message.reply(`⚠️ **${frame.name}** waxaa laga heli karaa kaliya Loot Box. Iibso: \`?buy loot legendary\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account-kaaga ma jiro. \`?jeeb\` ku bilow.');
        if ((ec.btc || 0) < frame.price) return message.reply(`⚠️ BTC kaa ma filna. Waxaad u baahan tahay **₿${frame.price.toLocaleString()}**, haysataa **₿${(ec.btc||0).toLocaleString()}**.`);
        if ((userData[userId].ownedFrames || []).includes(key)) return message.reply(`✅ Frame-kaas horay ayaad u lahayd.`);
        ec.btc -= frame.price;
        userData[userId].ownedFrames.push(key);
        userData[userId].activeFrame = key; // auto-equip
        saveData(); saveEcon();
        return message.reply(`✅ **${frame.emoji} ${frame.name}** la iibsaday & la xidhay! (-₿${frame.price.toLocaleString()})\n\`?profile\` ku eeg.`);
    }

    // ── ?buy booster <key> ──
    if (itemKey === 'booster') {
        const key   = (args[1] || '').toLowerCase();
        const boost = BOOSTERS[key];
        if (!boost) return message.reply(`⚠️ Booster-kaas ma jiro. Eeg: \`?shop boosters\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account-kaaga ma jiro.');
        if ((ec.btc || 0) < boost.price) return message.reply(`⚠️ BTC kaa ma filna. Waxaad u baahan tahay **₿${boost.price.toLocaleString()}**.`);
        ec.btc -= boost.price;
        const d = userData[userId];
        if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
        else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
        else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
        else if (key === 'double_btc') d.boosters.doubleBtc = Date.now() + boost.duration;
        saveData(); saveEcon();
        return message.reply(`✅ **${boost.emoji} ${boost.name}** la iibsaday! (-₿${boost.price.toLocaleString()})\n${boost.desc}`);
    }

    // ── ?buy loot <type> ──
    if (itemKey === 'loot') {
        const type = (args[1] || 'common').toLowerCase();
        const box  = LOOT_BOXES[type];
        if (!box) return message.reply(`⚠️ Nooc: \`common\`, \`rare\`, \`legendary\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account-kaaga ma jiro.');
        if ((ec.btc || 0) < box.price) return message.reply(`⚠️ BTC kaa ma filna. Waxaad u baahan tahay **₿${box.price.toLocaleString()}**.`);
        ec.btc -= box.price;
        userData[userId].lootBoxes       ??= {};
        userData[userId].lootBoxes[type]  = (userData[userId].lootBoxes[type] || 0) + 1;
        saveData(); saveEcon();
        return message.reply(`✅ **${box.emoji} ${box.name}** la iibsaday! (-₿${box.price.toLocaleString()})\nFur: \`?open ${type}\``);
    }

    // ── ?buy title <key> (BTC-based economy titles) ──
    if (itemKey === 'title') {
        const key   = (args[1] || '').toLowerCase();
        const title = ECON_TITLES[key];
        if (!title) return message.reply(`⚠️ Title-kaas ma jiro. Eeg: \`?shop titles\``);
        const ec = econData[userId];
        if (!ec) return message.reply('⚠️ Economy account-kaaga ma jiro.');
        if ((ec.econTitles || []).includes(key)) return message.reply(`✅ Title-kaas horay ayaad u lahayd.`);
        if ((ec.btc || 0) < title.price) return message.reply(`⚠️ BTC kaa ma filna. Waxaad u baahan tahay **₿${title.price.toLocaleString()}**.`);
        ec.btc -= title.price;
        ec.econTitles = ec.econTitles || [];
        ec.econTitles.push(key);
        if (key === 'custom') {
            const name = args.slice(2).join(' ').trim();
            if (!name) return message.reply('⚠️ Isticmaal: `?buy title custom <magacaaga>`');
            ec.customEconTitle = name;
            ec.activeEconTitle = 'custom';
        }
        saveEcon();
        return message.reply(`✅ **${title.label}** la iibsaday! (-₿${title.price.toLocaleString()})\n\`?equip title ${key}\` si aad u xidho.`);
    }

    // ── Custom title: ?buy custom <magac> ──
    if (itemKey === 'custom') {
        const customName = args.slice(1).join(' ').trim();
        const price      = TITLES.custom.custom.price;

        if (!customName) {
            return message.reply(
                `✍️ **Custom Title — Sida loo isticmaalo:**\n\n` +
                `\`${PREFIX}buy custom <magacaaga>\`\n\n` +
                `**Tusaale:** \`${PREFIX}buy custom Garaadle\`\n\n` +
                `💰 Qiimaha: **${price} XP** · XP-gaaga: **${userData[userId].xp} XP**`
            );
        }

        if (customName.length > CUSTOM_MAX_LEN) {
            return message.reply(`⚠️ Magaca aad dheer yahay! Ugu badnaan **${CUSTOM_MAX_LEN}** xaraf.`);
        }

        if (userData[userId].xp < price) {
            return message.reply(
                `⚠️ XP-gaagu ma filna!\n\nWaxaad u baahan tahay **${price} XP** · Waxaadse haysataa **${userData[userId].xp} XP**.`
            );
        }

        // Haddii horeba u iibsaday — update kaliya la sameeyaa (lacag cusub la qaadaa)
        const alreadyOwned = userData[userId].ownedTitles.includes('custom');
        if (alreadyOwned) {
            // Beddelid title cusub — XP la qaadaa mar kale
            userData[userId].xp        -= price;
            userData[userId].customTitle = customName;
            userData[userId].activeTitle = 'custom';
            saveData();
            return message.reply(`✅ Custom title-kaaga waa la cusboonaasiiyay: **${customName}** (-${price} XP)\n\nTitle-kaaga cusub marka xigta ayuu muuqan doonaa.`);
        }

        // Iibsasho cusub
        userData[userId].xp -= price;
        userData[userId].customTitle = customName;
        userData[userId].activeTitle = 'custom';
        if (!userData[userId].ownedTitles.includes('custom')) {
            userData[userId].ownedTitles.push('custom');
        }
        saveData();
        return message.reply(`✅ Custom title la iibsaday: **${customName}** (-${price} XP)\n\nTitle-kaaga cusub marka xigta ayuu muuqan doonaa!`);
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
        return message.reply(`⚠️ Shay aan jirin. Isticmaal \`${PREFIX}titles\` si aad u aragto darajooyinka.`);
    }

    // Champion title — admin kaliya
    if (itemKey === 'champion') {
        return message.reply(
            `🏆 **Champion** title-ka waa la iibsan **karin**.\n\n` +
            `Title-kan waxaa heli kara **kaliya** guulaha tartan weyn — admin ayaa u ogolaan doona.`
        );
    }

    if (userData[userId].xp < item.price) {
        return message.reply(
            `⚠️ XP-gaagu ma filna! Waxaad u baahan tahay **${item.price} XP**, waxaadse haysataa **${userData[userId].xp} XP**.`
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
    return message.reply(`✅ Waxaad iibsatay **${item.name}** (-${item.price} XP). Mahadsanid!`);
};
