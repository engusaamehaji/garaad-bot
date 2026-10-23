// =====================================================================
// Classic Token Diamond Drops
// 3 diamonds every 40 minutes, claimable for 60 seconds.
// =====================================================================

const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    ChannelType,
    Routes,
} = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('./econStore');

const DATA_FILE = path.join(__dirname, '../../data/diamondDrops.json');
const DROP_DIAMONDS = 3;
const DROP_INTERVAL_MS = 40 * 60 * 1000;
const CLAIM_WINDOW_MS = 60 * 1000;
const BTC_REWARD = 3_000;

let config = { guilds: {} };
const activeDrops = new Map(); // guildId -> drop
const timers = new Map(); // guildId -> timeout
let started = false;

function loadConfig() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            config = { guilds: saved.guilds || {} };
            // Old versions stored a manually selected channel. Automatic mode
            // deliberately ignores it and starts a fresh 40-minute schedule.
            let migrated = false;
            for (const entry of Object.values(config.guilds)) {
                if (entry.channelId) {
                    delete entry.channelId;
                    entry.nextDropAt = Date.now() + DROP_INTERVAL_MS;
                    migrated = true;
                }
            }
            if (migrated) saveConfig();
        }
    } catch (error) {
        console.error('[DiamondDrops] Config load failed:', error.message);
        config = { guilds: {} };
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('[DiamondDrops] Config save failed:', error.message);
    }
}

function dropKey(guildId) {
    return guildId;
}

function formatCountdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.ceil(seconds / 60)} daqiiqo`;
}

function humanMembers(channel) {
    return [...(channel.members?.values() || [])].filter(member => !member.user?.bot);
}

function canUseTextChannel(channel, guild) {
    if (!channel?.isTextBased?.() || !channel.send) return false;
    const me = guild.members.me;
    if (!me) return true;
    const permissions = channel.permissionsFor(me);
    return Boolean(
        permissions?.has('ViewChannel') &&
        permissions?.has('SendMessages') &&
        permissions?.has('EmbedLinks')
    );
}

function findDropChannel(client, guild) {
    const channels = [...guild.channels.cache.values()];
    const activeVoice = channels
        .filter(channel =>
            (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) &&
            humanMembers(channel).length > 0
        )
        .sort((a, b) => humanMembers(b).length - humanMembers(a).length);

    // Voice-channel text chat is sent through the Discord REST route below.
    // It does not expose .send() on every discord.js version, so select it
    // first and let sendToChannel handle the transport.
    if (activeVoice[0]) return activeVoice[0];

    const textChannels = channels
        .filter(channel => channel.type === ChannelType.GuildText)
        .sort((a, b) => {
            if (a.id === guild.systemChannelId) return -1;
            if (b.id === guild.systemChannelId) return 1;
            return a.position - b.position;
        });
    return textChannels.find(channel => canUseTextChannel(channel, guild)) || null;
}

function buildDropEmbed(drop, status = 'open') {
    const isOpen = status === 'open';
    const isClaimed = status === 'claimed' || status === 'claimed_rewarded';
    const embed = new EmbedBuilder()
        .setColor(isOpen ? 0x66d9ef : isClaimed ? 0x57f287 : 0x7f8c8d)
        .setTitle(
            isOpen
                ? '💎 Classic Token — Diamond Drop'
                : isClaimed
                    ? '🎉 Diamond Drop waa la qaatay'
                    : '⏰ Diamond Drop wuu dhacay'
        )
        .setDescription(
            isOpen
                ? `Classic Token wuxuu soo diray **${DROP_DIAMONDS} diamonds**!\n\n` +
                  `Qofka ugu horreeya ee qora \`?take\` ayaa heli kara. ` +
                  `Hadiyadda waxaa si toos ah loogu beddelayaa **₿${BTC_REWARD.toLocaleString()} Bitcoin**.`
                : isClaimed
                    ? `Qofka ugu horreeya ee \`?take\` qoray ayaa helay fursadda qaadashada.\n` +
                      `Riix button-ka **Bitcoin** si wallet-kaaga loogu daro abaalmarinta.`
                : 'Hal daqiiqo ayaa dhammaatay, cidina ma qaadan hadiyadda.'
        )
        .addFields(
            { name: '💎 Hadiyad', value: `${DROP_DIAMONDS} diamonds`, inline: true },
            { name: '⏱️ Waqtiga', value: isOpen || isClaimed ? formatCountdown(drop.expiresAt - Date.now()) : 'Dhacday', inline: true },
        )
        .setFooter({ text: 'Classic Token • 40 daqiiqo kasta' })
        .setTimestamp();

    if (drop.claimedBy) {
        embed.addFields({ name: '🎉 Qaatay', value: `<@${drop.claimedBy}>`, inline: false });
    }
    return embed;
}

function buildClaimButtons(drop) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`diamond_btc_${drop.id}_${drop.claimedBy}`)
            .setLabel(`₿ Qaado ${BTC_REWARD.toLocaleString()} BTC`)
            .setStyle(ButtonStyle.Success),
    );
}

function serializePayload(payload) {
    return {
        ...payload,
        embeds: payload.embeds?.map(embed => typeof embed.toJSON === 'function' ? embed.toJSON() : embed),
        components: payload.components?.map(row => typeof row.toJSON === 'function' ? row.toJSON() : row),
    };
}

async function sendToChannel(client, channelId, payload) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.send) return channel.send(payload);

    // Discord voice-channel text chat can be message-capable even when
    // discord.js does not expose .send() on the VoiceChannel object.
    const raw = await client.rest.post(Routes.channelMessages(channelId), {
        body: serializePayload(payload),
    });
    return {
        id: raw.id,
        channelId,
        edit: async editPayload => client.rest.patch(
            Routes.channelMessage(channelId, raw.id),
            { body: serializePayload(editPayload) },
        ),
    };
}

async function editDropMessage(client, drop, status = 'open') {
    if (!drop.messageId || !drop.channelId) return;
    try {
        const channel = await client.channels.fetch(drop.channelId);
        const message = await Promise.resolve(channel?.messages?.fetch?.(drop.messageId)).catch(() => null);
        const payload = {
            embeds: [buildDropEmbed(drop, status)],
            components: status === 'claimed' ? [buildClaimButtons(drop)] : [],
        };
        if (message?.edit) {
            await message.edit(payload);
        } else {
            await client.rest.patch(
                Routes.channelMessage(drop.channelId, drop.messageId),
                { body: serializePayload(payload) },
            );
        }
    } catch (error) {
        console.error('[DiamondDrops] Message update failed:', error.message);
    }
}

async function expireDrop(client, guildId, dropId) {
    const drop = activeDrops.get(dropKey(guildId));
    if (!drop || drop.id !== dropId || !['open', 'claimed'].includes(drop.status)) return;
    drop.status = 'expired';
    activeDrops.delete(dropKey(guildId));
    await editDropMessage(client, drop, 'expired');

    // Expiry announcement removed to avoid spam:
    // await sendToChannel(client, drop.channelId, {
    //     content: '⏰ **Hadiyaddii way dhacday** — cidina ma qaadan 3-da diamonds.',
    // }).catch(() => {});
}

async function spawnDrop(client, guildId) {
    const entry = config.guilds[guildId];
    const guild = client.guilds.cache.get(guildId);
    if (!entry || !guild) return null;

    const oldDrop = activeDrops.get(dropKey(guildId));
    if (oldDrop?.status === 'open') return oldDrop;

    const targetChannel = findDropChannel(client, guild);
    if (!targetChannel) {
        console.warn(`[DiamondDrops] No usable channel in guild ${guildId}; retrying next cycle`);
        entry.nextDropAt = Date.now() + DROP_INTERVAL_MS;
        saveConfig();
        return null;
    }

    const drop = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        guildId,
        channelId: targetChannel.id,
        messageId: null,
        status: 'open',
        claimedBy: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + CLAIM_WINDOW_MS,
    };

    let message = await sendToChannel(client, targetChannel.id, {
        embeds: [buildDropEmbed(drop)],
        components: [],
    }).catch(error => {
        console.error('[DiamondDrops] Drop send failed:', error.message);
        return null;
    });
    // If an active VC's chat is unavailable, fall back to a normal text chat.
    if (!message && (targetChannel.type === ChannelType.GuildVoice || targetChannel.type === ChannelType.GuildStageVoice)) {
        const fallback = [...guild.channels.cache.values()]
            .filter(channel => channel.type === ChannelType.GuildText)
            .find(channel => canUseTextChannel(channel, guild));
        if (fallback) {
            drop.channelId = fallback.id;
            message = await sendToChannel(client, fallback.id, {
                embeds: [buildDropEmbed(drop)],
                components: [],
            }).catch(error => {
                console.error('[DiamondDrops] Text fallback failed:', error.message);
                return null;
            });
        }
    }
    if (!message) return null;

    drop.messageId = message.id;
    activeDrops.set(dropKey(guildId), drop);
    setTimeout(() => expireDrop(client, guildId, drop.id), CLAIM_WINDOW_MS + 250);
    entry.nextDropAt = Date.now() + DROP_INTERVAL_MS;
    saveConfig();
    return drop;
}

function scheduleGuild(client, guildId, delayMs = DROP_INTERVAL_MS) {
    if (timers.has(guildId)) clearTimeout(timers.get(guildId));
    const delay = Math.max(1_000, delayMs);
    timers.set(guildId, setTimeout(async () => {
        timers.delete(guildId);
        await spawnDrop(client, guildId);
        scheduleGuild(client, guildId, DROP_INTERVAL_MS);
    }, delay));
}

function startDiamondDrops(client) {
    // Feature disabled: stop sending automatic drops and expiration messages into channel chats.
    return;
}

async function diamondSetupCmd(message) {
    return message.reply('ℹ️ **Diamond Drop feature-ka waa la joojiyay.** Bot-ku dib ugu soo diri maayo fariimaha drop-ka channel chats-ka.');
}

async function diamondStatusCmd(message) {
    return message.reply('ℹ️ **Diamond Drop feature-ka waa la joojiyay.** Bot-ku dib ugu soo diri maayo fariimaha drop-ka channel chats-ka.');
}

async function diamondTakeCmd(message) {
    return message.reply('⏰ Hadda **diamond drop** furan ma jiro (feature-ka waa la joojiyay).');
}

async function handleDiamondInteraction(interaction) {
    const parts = interaction.customId.split('_');
    const choice = parts[1];
    const dropId = parts[2];
    const claimedBy = parts[3];
    const drop = [...activeDrops.values()].find(item => item.id === dropId);

    if (!drop || drop.status !== 'claimed' || drop.id !== dropId) {
        return interaction.reply({ content: '⏰ Diamond drop-kan wuu dhacay.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== claimedBy || drop.claimedBy !== interaction.user.id) {
        return interaction.reply({ content: '⚠️ Qofkii ugu horreeyay ee `?take` qoray ayaa dooran kara hadiyadda.', flags: MessageFlags.Ephemeral });
    }
    if (Date.now() >= drop.expiresAt) {
        drop.status = 'expired';
        activeDrops.delete(dropKey(drop.guildId));
        return interaction.reply({ content: '⏰ Waqtigii doorashada wuu dhammaaday.', flags: MessageFlags.Ephemeral });
    }

    checkEconUser(interaction.user.id);
    if (choice === 'btc') {
        econData[interaction.user.id].btc = (econData[interaction.user.id].btc || 0) + BTC_REWARD;
        saveEcon();
        drop.status = 'claimed_rewarded';
        activeDrops.delete(dropKey(drop.guildId));
        await interaction.update({
            embeds: [buildDropEmbed(drop, 'claimed')],
            components: [],
        });
        return interaction.followUp({
            content: `✅ <@${interaction.user.id}> waxaad qaadatay **${DROP_DIAMONDS} diamonds → +₿${BTC_REWARD.toLocaleString()} Bitcoin**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
    return interaction.reply({ content: '⚠️ Doorashada lama fahmin.', flags: MessageFlags.Ephemeral });
}

module.exports = {
    startDiamondDrops,
    diamondSetupCmd,
    diamondStatusCmd,
    diamondTakeCmd,
    handleDiamondInteraction,
    DROP_DIAMONDS,
    DROP_INTERVAL_MS,
    CLAIM_WINDOW_MS,
};
