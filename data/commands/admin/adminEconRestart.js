const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { userData, saveData } = require('../../../src/store');
const { fmt } = require('../../../src/utils/helpers');

const START_COINS = 5_000;

module.exports = async function adminEconRestart(message) {
    const users = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));

    if (!users.length) return message.reply('⚠️ No economy accounts were found.');

    for (const uid of users) {
        checkEconUser(uid);
        const d = econData[uid];
        d.coins             = START_COINS;
        delete d.usd;
        delete d.gold;
        d.banks           = { garaad: 0 };
        d.inventory       = { safety: 0, robticket: 0 };
        d.loan            = null;
        d.lastLoanTaken   = 0;
        d.lastWork        = 0;
        if (userData[uid]) userData[uid].lastDaily = 0;
        d.lastInterest    = 0;
        delete d.todayEarned;
        d.dailyGiven      = { date: '', coins: 0 };
        d.weeklyEarned    = { week: '', coins: 0 };
        d.robsToday       = { date: '', count: 0 };
        d.serviceChargesPaid = { mandeeq: 0, garaad: 0 };
        d.interestEarned     = { mandeeq: 0, garaad: 0 };
        d.econTitles      = [];
        d.activeEconTitle = null;
        d.customEconTitle = null;
    }

    saveData();
    saveEcon();

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('♻️ Economy Reset')
            .setColor('#2ecc71')
            .setDescription(
                `✅ Reset the economy for **${users.length} players**.\n\n` +
                `🪙 Each player now has **${fmt(START_COINS)} Coins**.\n` +
                `💳 All loans have been cleared.\n` +
                `🏦 Garaad Bank balances and economy inventories have been reset.`
            )
            .setFooter({ text: 'Garaad Admin • Economy Restart' }),
    ]});
};
