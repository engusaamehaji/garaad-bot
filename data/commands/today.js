const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData }                = require('../../src/store');
const { checkUser }                         = require('../../src/utils/helpers');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../../src/economy/econStore');

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAILY_BTC   = 1000;
const TOPGG_URL   = 'https://top.gg/bot/1495341089266073705';

module.exports = async function todayCommand(message) {
    const userId = message.author.id;
    checkUser(userId);
    checkEconUser(userId);

    const lastDaily  = userData[userId].lastDaily || 0;
    const remaining  = COOLDOWN_MS - (Date.now() - lastDaily);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setURL(TOPGG_URL).setLabel('🗳️ Vote Garaad Bot').setStyle(ButtonStyle.Link),
        new ButtonBuilder().setCustomId(`close_today_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );

    if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const mins  = Math.floor((remaining % 3600000) / 60000);
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('⏳ Daily Reward — On Cooldown')
                .setDescription(`You already claimed today's reward.\n\nCome back in **${hours}h ${mins}m**.`)
                .setColor('#e67e22')],
            components: [row],
        });
    }

    // Update streak: consecutive if last claim was within 48h
    const prevDaily = userData[userId].lastDaily || 0;
    const hoursSinceLast = (Date.now() - prevDaily) / 3600000;
    if (prevDaily > 0 && hoursSinceLast < 48) {
        econData[userId].streak = (econData[userId].streak || 0) + 1;
    } else {
        econData[userId].streak = 1;
    }

    const iqGain = 5;
    userData[userId].iq        = (userData[userId].iq || 0) + iqGain;
    userData[userId].lastDaily = Date.now();
    econData[userId].btc       = (econData[userId].btc || 0) + DAILY_BTC;
    trackEarning(userId, DAILY_BTC);
    saveData();
    saveEcon();

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🎁 Daily Reward — Claimed!')
            .setDescription(
                `✅ Today's rewards:\n\n` +
                `🧠 **+${iqGain} IQ**\n` +
                `₿ **+₿: ${DAILY_BTC}**\n\n` +
                `Come back tomorrow!`
            )
            .setColor('#2ecc71')
            .setFooter({ text: 'Resets every 24 hours.' })],
        components: [row],
    });
};
