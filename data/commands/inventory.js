// =====================================================================
// ?inventory — Show all owned items
// ?equip frame <key> / ?equip title <key>
// ?sell frame <key>
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { econData, saveEcon }  = require('../../src/economy/econStore');
const { checkUser } = require('../../src/utils/helpers');
const { FRAMES, BADGES, BOOSTERS, LOOT_BOXES } = require('../../src/utils/itemDefs');
const { ECON_TITLES } = require('./economy/econShop');

function fmtBtc(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }

// ── ?inventory ──────────────────────────────────────────────────────
async function inventoryCmd(message) {
    const userId = message.author.id;
    checkUser(userId);
    const d  = userData[userId];
    const ec = econData[userId] || {};

    const framesOwned = (d.ownedFrames || []).map(k => {
        const f = FRAMES[k];
        return f ? `${f.emoji} **${f.name}** (${f.rarity})${d.activeFrame === k ? ' ◀ Equipped' : ''}` : k;
    });

    const titlesOwned = (d.ownedTitles || []).concat(ec.econTitles || []).filter(Boolean);
    const titleLines  = [...new Set(titlesOwned)].map(k => {
        if (ec.econTitles?.includes(k) && ECON_TITLES[k]) {
            const t = ECON_TITLES[k];
            return `${t.label}${ec.activeEconTitle === k ? ' ◀ Equipped' : ''}`;
        }
        return k + (d.activeTitle === k ? ' ◀ Equipped' : '');
    });

    const badgesOwned = (d.badges || []).map(k => {
        const b = BADGES[k];
        return b ? `${b.emoji} ${b.name}` : k;
    });

    const now = Date.now();
    const boostLines = [];
    const bo = d.boosters || {};
    if (bo.doubleBtc > now) boostLines.push(`₿ Double BTC — ${Math.ceil((bo.doubleBtc - now) / 60000)} min haray`);
    if (bo.iqShields > 0)   boostLines.push(`🛡️ IQ Shield × ${bo.iqShields}`);

    const lootLines = Object.entries(LOOT_BOXES)
        .map(([k, b]) => `${b.emoji} ${b.name}: **${d.lootBoxes?.[k] || 0}**`);

    const inv = d.inventory || {};
    const gameItems = [];
    if (inv.shield > 0) gameItems.push(`🛡️ Quiz Shield × ${inv.shield}`);
    if (inv.double > 0) gameItems.push(`⚡ Double Points × ${inv.double}`);
    if (inv.hint   > 0) gameItems.push(`💡 Hint × ${inv.hint}`);
    if (inv.retry  > 0) gameItems.push(`🔄 Retry × ${inv.retry}`);

    const embed = new EmbedBuilder()
        .setTitle(`🎒 ${message.author.username} — Inventory`)
        .setColor('#9b59b6')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: `🖼️ Frames (${framesOwned.length})`, value: framesOwned.length ? framesOwned.join('\n') : '*Ma lihid*',         inline: false },
            { name: `🏷️ Titles (${titleLines.length})`,  value: titleLines.length  ? titleLines.join('\n')  : '*Ma lihid*',         inline: false },
            { name: `🏅 Badges (${badgesOwned.length})`, value: badgesOwned.length ? badgesOwned.join(' • ') : '*Wali ma gasho*',   inline: false },
            { name: '⚡ Active Boosters',                value: boostLines.length   ? boostLines.join('\n')  : '*Active ma aha*',   inline: false },
            { name: '📦 Loot Boxes',                     value: lootLines.join(' • '),                                              inline: false },
        )
        .setFooter({ text: '?equip frame <key> • ?equip title <key> • ?sell frame <key>' });

    if (gameItems.length)
        embed.addFields({ name: '🎮 Game Items', value: gameItems.join('\n'), inline: false });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_equip_frame_${userId}`)
            .setLabel('⚙️ Equip Frame')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!framesOwned.length),
        new ButtonBuilder()
            .setCustomId(`inv_equip_title_${userId}`)
            .setLabel('🏷️ Equip Title')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!titleLines.length),
    );

    return message.reply({ embeds: [embed], components: [btnRow] });
}

// ── ?equip ───────────────────────────────────────────────────────────
async function equipCmd(message, args) {
    const userId = message.author.id;
    checkUser(userId);
    const d  = userData[userId];
    const ec = econData[userId] || {};

    const type = (args[0] || '').toLowerCase();
    const key  = (args[1] || '').toLowerCase();

    if (!type || !key)
        return message.reply('⚠️ Isticmaal: `?equip frame <key>` ama `?equip title <key>`\n\nFrames-kaaga eeg: `?inventory`');

    if (type === 'frame') {
        if (!d.ownedFrames.includes(key)) {
            const frame = FRAMES[key];
            return message.reply(`⚠️ **${frame?.name || key}** frame-kaaga kuma jiro. Iibso: \`?shop frames\``);
        }
        d.activeFrame = key;
        saveData();
        const f = FRAMES[key];
        return message.reply(`✅ **${f?.emoji || ''} ${f?.name || key}** frame la xidh (equipped)!`);
    }

    if (type === 'title') {
        if (!d.ownedTitles.includes(key) && !(ec.econTitles || []).includes(key))
            return message.reply(`⚠️ **${key}** cinwaankaaga kuma jiro.`);
        if ((ec.econTitles || []).includes(key)) {
            ec.activeEconTitle = key;
            saveEcon();
        } else {
            d.activeTitle = key;
            saveData();
        }
        return message.reply(`✅ Cinwaanka **${key}** waa la xidh!`);
    }

    return message.reply('⚠️ Type: `frame` ama `title` kaliya');
}

// ── ?sell ─────────────────────────────────────────────────────────────
async function sellCmd(message, args) {
    const userId = message.author.id;
    checkUser(userId);
    const d  = userData[userId];
    const ec = econData[userId];

    const type = (args[0] || '').toLowerCase();
    const key  = (args[1] || '').toLowerCase();

    if (!type || !key)
        return message.reply('⚠️ Isticmaal: `?sell frame <key>`\n\nInventory-gaaga eeg: `?inventory`');

    if (type === 'frame') {
        const frame = FRAMES[key];
        if (!frame) return message.reply('⚠️ Frame-kaas ma jiro.');
        if (!d.ownedFrames.includes(key)) return message.reply('⚠️ Frame-kaas inventory-gaaga kuma jiro.');
        if (d.activeFrame === key) return message.reply('⚠️ Frame-kaas xidhan tahay. Kale xidh marka hore: `?equip frame <other>`');

        const price = frame.sellFor || 100;
        d.ownedFrames = d.ownedFrames.filter(f => f !== key);
        if (ec) { ec.btc = (ec.btc || 0) + price; saveEcon(); }
        saveData();

        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor('#27ae60')
                .setDescription(`✅ **${frame.emoji} ${frame.name}** la iibiyay!\n💰 **+₿${price.toLocaleString()} BTC**`)
            ]
        });
    }

    return message.reply('⚠️ Hadda kaliya `?sell frame <key>` ayaa shaqeeya.');
}

module.exports = { inventoryCmd, equipCmd, sellCmd };
