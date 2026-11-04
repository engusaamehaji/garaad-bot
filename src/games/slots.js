const { EmbedBuilder } = require('discord.js');
const {
    econData,
    checkEconUser,
    saveEcon,
    addToTreasury,
    deductFromTreasury,
    getTreasury,
    trackEarning,
} = require('../economy/econStore');
const { fmt } = require('../utils/helpers');

const MIN_BET = 10;
const MAX_BET = 50_000;
const COOLDOWN_MS = 15_000;
const cooldowns = new Map();
const processing = new Set();
const LOSS_REELS = ['🍋', '🍊', '🍍', '🔔', '🌙', '🍜'];

function randomLossReels() {
    let reels;
    do {
        reels = Array.from({ length: 3 }, () => LOSS_REELS[Math.floor(Math.random() * LOSS_REELS.length)]);
    } while (reels.every((reel) => reel === reels[0]));
    return reels;
}

module.exports = async function slotsCommand(message, args = []) {
    const amountText = (args[0] || '').replace(/,/g, '');
    const bet = Number(amountText);
    if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(bet)) {
        return message.reply('🎰 Usage: `?slots <coins>` — bet **10–50,000 Coins** (example: `?slots 100`).');
    }
    if (bet < MIN_BET || bet > MAX_BET) {
        return message.reply(`⚠️ Bet must be between **${fmt(MIN_BET)} and ${fmt(MAX_BET)} Coins**.`);
    }

    const userId = message.author.id;
    if (processing.has(userId)) return message.reply('⏳ Your slot spin is still being processed.');
    checkEconUser(userId);
    const wallet = econData[userId];
    if ((wallet.coins || 0) < bet) {
        return message.reply(`⚠️ Not enough Coins. Wallet balance: **${fmt(wallet.coins || 0)} Coins**.`);
    }
    const secondsLeft = Math.ceil((COOLDOWN_MS - (Date.now() - (cooldowns.get(userId) || 0))) / 1000);
    if (secondsLeft > 0) return message.reply(`⏳ Wait **${secondsLeft}s** before spinning again.`);

    // Keep the same treasury reserve rule as Nasiib's 10x maximum slot payout.
    if (getTreasury().balance < bet * 10) {
        return message.reply(`⏳ Slots is paused: the treasury needs **${fmt(bet * 10)} Coins** to cover this bet's maximum prize. No Coins were taken.`);
    }

    processing.add(userId);
    cooldowns.set(userId, Date.now());
    try {
        const roll = Math.random();
        let reels;
        let prize = 0;
        let label;
        let color;
        if (roll < 0.76) {
            reels = randomLossReels();
            label = 'No match — you lost your bet.';
            color = '#e74c3c';
            wallet.coins -= bet;
            addToTreasury(bet);
        } else if (roll < 0.96) {
            reels = ['🍒', '🍒', '🍒'];
            prize = bet;
            label = 'Cherry match — 2× payout!';
            color = '#2ecc71';
        } else if (roll < 0.99) {
            reels = ['⭐', '⭐', '⭐'];
            prize = bet * 4;
            label = 'Star match — 5× payout!';
            color = '#f39c12';
        } else {
            reels = ['💎', '💎', '💎'];
            prize = bet * 9;
            label = 'Jackpot — 10× payout!';
            color = '#f1c40f';
        }

        if (prize > 0) {
            if (!deductFromTreasury(prize)) {
                cooldowns.delete(userId);
                return message.reply('⏳ The treasury changed before the prize could be paid. No Coins were taken; please try again.');
            }
            wallet.coins = (wallet.coins || 0) + prize;
            trackEarning(userId, prize);
        }
        saveEcon();

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle(prize ? '🎰 Slots — You Won!' : '🎰 Slots')
            .setColor(color)
            .setDescription(`## ${reels.join('  ')}\n\n${label}`)
            .addFields(
                { name: 'Bet', value: `${fmt(bet)} Coins`, inline: true },
                { name: prize ? 'Prize' : 'Loss', value: `${prize ? '+' : '-'}${fmt(prize || bet)} Coins`, inline: true },
                { name: 'Wallet', value: `${fmt(wallet.coins || 0)} Coins`, inline: true },
            )
            .setFooter({ text: 'Play again in 15 seconds • ?slots <coins>' })] });
    } finally {
        processing.delete(userId);
    }
};
