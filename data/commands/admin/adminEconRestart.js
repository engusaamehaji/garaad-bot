const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const START_CASH = 5_000;

module.exports = async function adminEconRestart(message) {
    const users = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));

    if (!users.length) return message.reply('⚠️ Wax user ah ma jiraan.');

    for (const uid of users) {
        const d = econData[uid];
        d.btc             = START_CASH;
        d.usd             = 0;
        d.gold            = 0;
        d.banks           = { mandeeq: 0, garaad: 0 };
        d.inventory       = { safety: 0, robticket: 0 };
        d.loan            = null;
        d.lastLoanTaken   = 0;
        d.lastWork        = 0;
        d.lastDaily       = 0;
        d.lastInterest    = 0;
        d.todayEarned     = { date: '', usd: 0 };
        d.dailyGiven      = { date: '', usd: 0 };
        d.robsToday       = { date: '', count: 0 };
        d.serviceChargesPaid = { mandeeq: 0, garaad: 0 };
        d.interestEarned     = { mandeeq: 0, garaad: 0 };
        d.econTitles      = [];
        d.activeEconTitle = null;
        d.customEconTitle = null;
    }

    saveEcon();

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('♻️ Economy — Dib Bilow')
            .setColor('#2ecc71')
            .setDescription(
                `✅ **${users.length} qof** economy dib loo dejiyay.\n\n` +
                `₿ Qof walba wuxuu hadda leeyahay: **${fmt(START_CASH)} BTC**\n` +
                `💳 Dhamaan deynihii waa la cafiyay.\n` +
                `🏦 Bangiyada iyo assets dhamaan eber.`
            )
            .setFooter({ text: 'Garaad Admin • Economy Restart' }),
    ]});
};
