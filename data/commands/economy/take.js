const { EmbedBuilder } = require('discord.js');
const { userData, saveData } = require('../../../src/store');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../../../src/economy/econStore');
const { checkUser, addXp, applyIqChange } = require('../../../src/utils/helpers');

const COOLDOWN_MS = 6 * 60 * 60 * 1000;

function randomInt(min, max, random = Math.random) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function rollTakeReward(random = Math.random) {
    return {
        coins: randomInt(100, 300, random),
        xp: randomInt(10, 30, random),
        iq: randomInt(1, 3, random),
    };
}

function formatRemaining(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

module.exports = async function takeCommand(message) {
    const userId = message.author.id;
    checkUser(userId);
    checkEconUser(userId);

    const remaining = COOLDOWN_MS - (Date.now() - (econData[userId].lastTake || 0));
    if (remaining > 0) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('⏳ Take — On Cooldown')
                .setColor('#e67e22')
                .setDescription(`Abaalmarintaada xigta diyaar bay noqonaysaa **${formatRemaining(remaining)}** kadib.`)],
        });
    }

    const reward = rollTakeReward();
    const coinMultiplier = econData[userId].boosters?.doubleCoins > Date.now() ? 2 : 1;
    const coins = reward.coins * coinMultiplier;
    const previousXp = userData[userId].xp || 0;
    addXp(userId, reward.xp);
    const actualXp = userData[userId].xp - previousXp;
    const actualIq = applyIqChange(userId, reward.iq);

    econData[userId].coins = (econData[userId].coins || 0) + coins;
    econData[userId].lastTake = Date.now();
    trackEarning(userId, coins);
    saveData();
    saveEcon();

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🎁 Take — Abaalmarin La Helay!')
            .setColor('#2ecc71')
            .setDescription(
                `🪙 **+${coins.toLocaleString()} Coins**\n` +
                `✨ **+${actualXp} XP**\n` +
                `🧠 **+${actualIq} IQ**`
            )
            .setFooter({ text: 'Abaalmarin kale waxaad qaadan kartaa 6 saac kadib.' })],
    });
};

module.exports.COOLDOWN_MS = COOLDOWN_MS;
module.exports.randomInt = randomInt;
module.exports.rollTakeReward = rollTakeReward;
module.exports.formatRemaining = formatRemaining;
