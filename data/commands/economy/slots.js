// =====================================================================
// AMARKA: ?slots <amount> — Slot Machine
// 3 reels, each with 6 symbols
// 3-match = 5x, 2-match = 1.5x, no match = loss
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const MIN_BET     = 10;
const MAX_BET     = 5150;
const COOLDOWN_MS = 8_000;
const cooldowns   = new Map();

const SYMBOLS = [
    { emoji: '🍒', weight: 30, name: 'Cherry'  },
    { emoji: '🍋', weight: 25, name: 'Lemon'   },
    { emoji: '🍊', weight: 20, name: 'Orange'  },
    { emoji: '⭐', weight: 15, name: 'Star'    },
    { emoji: '💎', weight: 7,  name: 'Diamond' },
    { emoji: '🎰', weight: 3,  name: 'Jackpot' },
];

const PAYOUTS = {
    '🎰🎰🎰': 10,   // Jackpot!
    '💎💎💎': 7,
    '⭐⭐⭐': 5,
    '🍊🍊🍊': 4,
    '🍋🍋🍋': 3,
    '🍒🍒🍒': 2.5,
};

function spin() {
    const totalWeight = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
    const reel = () => {
        let rand = Math.random() * totalWeight;
        for (const sym of SYMBOLS) {
            rand -= sym.weight;
            if (rand <= 0) return sym.emoji;
        }
        return SYMBOLS[0].emoji;
    };
    return [reel(), reel(), reel()];
}

function getMultiplier(reels) {
    const key = reels.join('');
    if (PAYOUTS[key]) return { mult: PAYOUTS[key], type: 'jackpot' };
    if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        return { mult: 1.5, type: 'pair' };
    }
    return { mult: 0, type: 'loss' };
}

module.exports = async function slotsCmd(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];

    const amount = parseInt(args[0], 10);
    if (!amount || isNaN(amount) || amount < MIN_BET)
        return message.reply(`⚠️ Ugu yar **₿${MIN_BET}** · Ugu badan **₿${MAX_BET.toLocaleString()}`);
    if (amount > MAX_BET)
        return message.reply(`⚠️ Ugu badan **₿${MAX_BET.toLocaleString()}**`);
    if ((d.btc || 0) < amount)
        return message.reply(`⚠️ BTC kugu filna ma lihid. Wallet: **₿${fmt(d.btc || 0)}**`);

    const now     = Date.now();
    const lastUse = cooldowns.get(userId) || 0;
    if (now - lastUse < COOLDOWN_MS) {
        const left = Math.ceil((COOLDOWN_MS - (now - lastUse)) / 1000);
        return message.reply(`⏳ Cooldown: Sug **${left}s** kadib.`);
    }
    cooldowns.set(userId, now);

    // Spin animation message
    const spinning = await message.reply({ embeds: [new EmbedBuilder()
        .setTitle('🎰 Slots — Socdaa...')
        .setColor('#f39c12')
        .setDescription('🎰 | 🎰 | 🎰\n\n⏳ Spinning...')] });

    await new Promise(r => setTimeout(r, 1200));

    const reels = spin();
    const { mult, type } = getMultiplier(reels);
    const display = reels.join(' | ');

    let profit = 0;
    let color  = '#e74c3c';
    let title  = '🎰 Slots — GUUL-DARRO!';
    let resultLine = `📉 -₿${fmt(amount)}`;

    if (type === 'jackpot') {
        profit = Math.floor(amount * mult) - amount;
        d.btc  = (d.btc || 0) + profit;
        color  = reels[0] === '🎰' ? '#f1c40f' : '#2ecc71';
        title  = reels[0] === '🎰' ? '🎰 JACKPOT!! 🎉🎉🎉' : '🎰 Slots — GUUL! ✅';
        resultLine = `💰 +₿${fmt(profit)} → Wallet: **₿${fmt(d.btc)}**`;
    } else if (type === 'pair') {
        profit = Math.floor(amount * mult) - amount;
        d.btc  = (d.btc || 0) + profit;
        color  = '#3498db';
        title  = '🎰 Slots — Labo isku mid! 🎯';
        resultLine = `💰 +₿${fmt(profit)} → Wallet: **₿${fmt(d.btc)}**`;
    } else {
        d.btc = (d.btc || 0) - amount;
        resultLine = `📉 -₿${fmt(amount)} → Wallet: **₿${fmt(d.btc)}**`;
    }

    saveEcon();

    const payTable =
        '```\n' +
        '🎰🎰🎰 = 10x  💎💎💎 = 7x\n' +
        '⭐⭐⭐ = 5x   🍊🍊🍊 = 4x\n' +
        '🍋🍋🍋 = 3x   🍒🍒🍒 = 2.5x\n' +
        'Labo isku mid = 1.5x\n' +
        '```';

    return spinning.edit({ embeds: [new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(
            `## ${display}\n\n` +
            `💰 **Bet:** ₿${fmt(amount)}\n` +
            `${resultLine}\n\n` +
            payTable
        )
        .setFooter({ text: 'Garaad Economy • ?slots <amount>' })] });
};
