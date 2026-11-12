const { randomInt } = require('node:crypto');
const { EmbedBuilder } = require('discord.js');
const {
    econData,
    checkEconUser,
    saveEcon,
    addToTreasury,
    deductFromTreasury,
    getTreasury,
    trackEarning,
} = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const MIN_BET = 10;
const MAX_BET = 50_000;
const SIDES = {
    m: { label: 'Heads', emoji: '👑' },
    x: { label: 'Tails', emoji: '🪙' },
};

module.exports = async function coinflipCmd(message, args) {
    const usage = 'Usage: `?cf <coins> <x|m>`\nExamples: `?cf 50 x` · `?cf 50 m` · `?cf x 50`\n`x` = Tails · `m` = Heads';
    const side = args.map((arg) => arg.toLowerCase()).find((arg) => SIDES[arg]);
    const amountText = args.find((arg) => /^\d[\d,]*$/.test(arg)) || '';
    const amount = Number(amountText.replace(/,/g, ''));

    if (!amountText || !Number.isSafeInteger(amount) || !SIDES[side]) return message.reply(`⚠️ ${usage}`);
    if (amount < MIN_BET) return message.reply(`⚠️ Minimum bet: **${fmt(MIN_BET)} Coins**.\n${usage}`);
    if (amount > MAX_BET) return message.reply(`⚠️ Maximum bet: **${fmt(MAX_BET)} Coins**.\n${usage}`);

    const userId = message.author.id;
    checkEconUser(userId);
    const wallet = econData[userId];
    const balance = wallet.coins || 0;

    if (balance < amount) {
        return message.reply(`⚠️ You do not have enough Coins. Wallet balance: **${fmt(balance)} Coins**.`);
    }
    const treasury = getTreasury();
    if (treasury.balance < amount) {
        const treasuryMessage = treasury.balance <= 0
            ? '🏛️ **Khaznaddu waa eber.**'
            : `🏛️ Khaznaddu waxay haysataa **${fmt(treasury.balance)} Coins** oo keliya.`;
        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('🪙 Coinflip waa hakad')
            .setDescription(`${treasuryMessage}\n\nKhaznaddu ma dabooli karto abaalmarinta **${fmt(amount)} Coins**. Wallet-kaaga waxba lagama jarin.\n\nIsku day mar kale marka khaznaddu Coins hesho.`)
            .setColor('#e74c3c')
            .setFooter({ text: 'Garaad Economy • Coinflip' })] });
    }

    const landedSide = randomInt(2) === 0 ? 'm' : 'x';
    const won = side === landedSide;
    if (won && !deductFromTreasury(amount)) {
        return message.reply('⏳ Coinflip is temporarily unavailable. Please try again later.');
    }

    wallet.coins = balance - amount;
    if (won) {
        wallet.coins += amount * 2;
        trackEarning(userId, amount);
    } else {
        addToTreasury(amount);
    }
    saveEcon();

    const chosen = SIDES[side];
    const landed = SIDES[landedSide];
    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle(won ? '🪙 Coinflip — Waad guulaysatay!' : '🪙 Coinflip — Waad khasaarisay')
        .setColor(won ? '#2ecc71' : '#e74c3c')
        .setDescription(
            `**Doorashadaada:** ${chosen.emoji} ${chosen.label}\n` +
            `**Natiijada:** ${landed.emoji} ${landed.label}\n\n` +
            (won
                ? `🎉 Waxaad ku guulaysatay **+${fmt(amount)} Coins**.\n`
                : `💸 Waxaad khasaarisay **-${fmt(amount)} Coins**.\n`) +
            `👛 **Wallet-kaaga cusub:** ${fmt(wallet.coins)} Coins`
        )
        .setFooter({ text: 'Mar kale ciyaar: ?cf 200 x • m = Madax, x = Xarash' })] });
};
