const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon, addToTreasury, getSpendableCoins, spendCoins } = require('../../../src/economy/econStore');
const { SHOP_ITEMS } = require('./econShop');

// Returns null if item not in economy shop (caller falls through to quiz buy)
module.exports = async function econBuyCmd(message, args) {
    const item = (args[0] || '').toLowerCase();
    if (!SHOP_ITEMS[item]) return null;

    const userId   = message.author.id;
    checkEconUser(userId);
    const d        = econData[userId];
    const shopItem = SHOP_ITEMS[item];
    const currency = shopItem.currency;

    if (shopItem.type === 'title') {
        if (d.econTitles.includes(item)) {
            return message.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`⚠️ You already own **${shopItem.label}**.\nUse \`?etitle ${item}\` to equip it.`)
                    .setColor('#e67e22'),
            ]});
        }
        if (getSpendableCoins(userId) < shopItem.price) {
            return message.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`⚠️ You need **${shopItem.price.toLocaleString()} Coins**.\nYour balance: **${getSpendableCoins(userId).toLocaleString()} Coins**`)
                    .setColor('#e74c3c'),
            ]});
        }
        if (currency === 'coins') spendCoins(userId, shopItem.price);
        else d[currency] -= shopItem.price;
        d.econTitles.push(item);
        if (!d.activeEconTitle) d.activeEconTitle = item;
        addToTreasury(shopItem.price);
        saveEcon();
        return message.reply({ embeds: [
            new EmbedBuilder()
                .setTitle(`🏷️ Title Purchased — ${shopItem.label}`)
                .setColor('#2ecc71')
                .setDescription(
                    `✅ You purchased **${shopItem.label}**!\n` +
                    `🪙 Remaining balance: **${getSpendableCoins(userId).toLocaleString()} Coins**\n\n` +
                    `Use **\`?etitle ${item}\`** to equip it.`
                )
                .setFooter({ text: 'Garaad Economy' }),
        ]});
    }

    if (getSpendableCoins(userId) < shopItem.price) {
        return message.reply({ embeds: [
            new EmbedBuilder()
                .setDescription(`⚠️ You need **${shopItem.price.toLocaleString()} Coins**.\nYour balance: **${getSpendableCoins(userId).toLocaleString()} Coins**`)
                .setColor('#e74c3c'),
        ]});
    }

    if (currency === 'coins') spendCoins(userId, shopItem.price);
    else d[currency] -= shopItem.price;
    d.inventory[item] += 1;
    saveEcon();

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle(`🛒 Purchase Complete — ${shopItem.label}`)
            .setColor('#2ecc71')
            .setDescription(
                `✅ You purchased **${shopItem.label}**!\n` +
                `🪙 Remaining balance: **${getSpendableCoins(userId).toLocaleString()} Coins**\n` +
                `Inventory: **${d.inventory[item]}x ${shopItem.label}**`
            )
            .setFooter({ text: 'Garaad Economy' }),
    ]});
};
