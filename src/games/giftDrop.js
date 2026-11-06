const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { disabledChannels, userData, saveData } = require('../store');
const { checkUser, addXp, applyIqChange } = require('../utils/helpers');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../economy/econStore');

const DROP_DELAY_MIN_MS = 15 * 60 * 1000;
const DROP_DELAY_MAX_MS = 45 * 60 * 1000;
const DROP_LIFETIME_MS = 60 * 1000;
const activeDrops = new Map();
const recentlyActiveChannels = new Map();
let dropTimer = null;
let schedulerStarted = false;

function randomInt(min, max, random = Math.random) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function rollDropReward(random = Math.random) {
    return {
        coins: randomInt(100, 300, random),
        xp: randomInt(10, 30, random),
        iq: randomInt(1, 3, random),
    };
}

function trackActiveChannel(message) {
    if (!message.guild || message.author.bot || !message.channel.isTextBased()) return;
    if (!recentlyActiveChannels.has(message.guild.id)) recentlyActiveChannels.set(message.guild.id, new Set());
    recentlyActiveChannels.get(message.guild.id).add(message.channel.id);
}

function canPostDrop(channel) {
    const botMember = channel.guild.members.me;
    const permissions = botMember && channel.permissionsFor(botMember);
    return permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ]);
}

function dropEmbed(reward, status = null) {
    const embed = new EmbedBuilder()
        .setTitle('🎁 Hadiyad ayaa dhacday!')
        .setColor(status ? '#7f8c8d' : '#f1c40f')
        .setDescription(status ||
            `Qofkii ugu horreeya ee \`?take\` ku qora channel-kan ayaa qaadanaya:\n\n` +
            `🪙 **${reward.coins} Coins** · ✨ **${reward.xp} XP** · 🧠 **${reward.iq} IQ**\n\n` +
            '⏳ Waxaad haysataa **1 daqiiqo**!');
    return embed;
}

async function postDrop(client, guildId, channelIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const eligibleIds = [...channelIds].filter(id => !disabledChannels.has(id));
    while (eligibleIds.length) {
        const index = randomInt(0, eligibleIds.length - 1);
        const [channelId] = eligibleIds.splice(index, 1);
        const channel = await guild.channels.fetch(channelId).catch(error => {
            console.error(`[GiftDrop] Could not fetch channel ${channelId}:`, error);
            return null;
        });
        if (!channel?.isTextBased() || !canPostDrop(channel)) continue;
        if (activeDrops.has(channel.id)) continue;

        const reward = rollDropReward();
        let dropMessage;
        try {
            dropMessage = await channel.send({ embeds: [dropEmbed(reward)] });
        } catch (error) {
            console.error(`[GiftDrop] Could not post a drop in channel ${channel.id}:`, error);
            continue;
        }

        const drop = { channel, message: dropMessage, reward, timer: null };
        drop.timer = setTimeout(() => {
            if (activeDrops.get(channel.id) !== drop) return;
            activeDrops.delete(channel.id);
            drop.message.edit({ embeds: [dropEmbed(reward, '⏳ Hadiyaddan waqtigii ayaa dhammaaday; mar kale nasiib tijaabi!')] })
                .catch(error => console.error(`[GiftDrop] Could not mark drop ${dropMessage.id} expired:`, error));
        }, DROP_LIFETIME_MS);
        drop.timer.unref?.();
        activeDrops.set(channel.id, drop);
        return;
    }
}

async function runDropCycle(client) {
    const activeByGuild = [...recentlyActiveChannels.entries()];
    recentlyActiveChannels.clear();

    for (const [guildId, channelIds] of activeByGuild) {
        try {
            await postDrop(client, guildId, channelIds);
        } catch (error) {
            console.error(`[GiftDrop] Drop cycle failed for server ${guildId}:`, error);
        }
    }

    scheduleNextDrop(client);
}

function scheduleNextDrop(client) {
    const delay = randomInt(DROP_DELAY_MIN_MS, DROP_DELAY_MAX_MS);
    dropTimer = setTimeout(() => runDropCycle(client).catch(error => {
            console.error('[GiftDrop] Drop cycle failed:', error);
            scheduleNextDrop(client);
    }), delay);
    dropTimer.unref?.();
}

function setupGiftDropScheduler(client) {
    if (schedulerStarted) return;
    schedulerStarted = true;
    client.on('messageCreate', trackActiveChannel);
    scheduleNextDrop(client);
    console.log('[GiftDrop] Scheduler started — drops every 15–45 minutes in recently active chat channels.');
}

async function claimGiftDrop(message) {
    if (!message.guild || !message.channel.isTextBased()) {
        return message.reply('Hadiyadda waxaad ku qabsan kartaa chat-ka channel-ka ay ku dhacday oo keliya.');
    }

    const drop = activeDrops.get(message.channel.id);
    if (!drop) return message.reply('🎁 Hadiyad hadda channel-kan kuma taal. Sug tan xigta!');

    activeDrops.delete(message.channel.id);
    clearTimeout(drop.timer);

    const userId = message.author.id;
    checkUser(userId);
    checkEconUser(userId);

    const coinMultiplier = econData[userId].boosters?.doubleCoins > Date.now() ? 2 : 1;
    const coins = drop.reward.coins * coinMultiplier;
    const previousXp = userData[userId].xp || 0;
    addXp(userId, drop.reward.xp);
    const xp = userData[userId].xp - previousXp;
    const iq = applyIqChange(userId, drop.reward.iq);
    econData[userId].coins = (econData[userId].coins || 0) + coins;
    trackEarning(userId, coins);
    saveData();
    saveEcon();

    const claimedEmbed = new EmbedBuilder()
        .setTitle('🎁 Hadiyadda waa la qaatay!')
        .setColor('#2ecc71')
        .setDescription(
            `Hambalyo <@${userId}>! Adiga ayaa ugu horreeyay.\n\n` +
            `🪙 **+${coins.toLocaleString()} Coins**\n` +
            `✨ **+${xp} XP**\n` +
            `🧠 **+${iq} IQ**`
        )
        .setTimestamp();
    try {
        await drop.message.edit({ embeds: [claimedEmbed] });
    } catch (error) {
        console.error(`[GiftDrop] Could not mark drop ${drop.message.id} claimed:`, error);
    }
    return message.reply({ embeds: [claimedEmbed] });
}

module.exports = {
    DROP_DELAY_MIN_MS,
    DROP_DELAY_MAX_MS,
    DROP_LIFETIME_MS,
    rollDropReward,
    setupGiftDropScheduler,
    claimGiftDrop,
};
