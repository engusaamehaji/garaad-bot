// =====================================================================
// VoiceMaster — Auto-create personal VCs when user joins "Join to Create"
// =====================================================================

const { ChannelType, PermissionFlagsBits } = require('discord.js');

// guildId → joinChannelId  (the "Join to Create" trigger channel)
const joinChannels = new Map();

// channelId → ownerId  (temp VCs created by VoiceMaster)
const tempChannels = new Map();

// Persistence file
const fs   = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '../../data/voiceMasterConfig.json');

function loadConfig() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            for (const [guildId, channelId] of Object.entries(raw.joinChannels || {})) {
                joinChannels.set(guildId, channelId);
            }
        }
    } catch {}
}

function saveConfig() {
    const obj = { joinChannels: Object.fromEntries(joinChannels) };
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

loadConfig();

// ── Setup command: ?vcsetup [category name or ID] ──
async function vcSetupCmd(message, args) {
    const { isAdmin } = require('../utils/admin');
    if (!isAdmin(message.author.id)) {
        return message.reply('🚫 Admin kaliya ayaa amarkan isticmaali kara.');
    }
    if (!message.guild) {
        return message.reply('⚠️ Server-ka dhexdiisa kaliya.');
    }

    const guild = message.guild;

    // Find or create category
    let category = null;
    const catName = args.join(' ') || 'VoiceMaster';
    category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catName.toLowerCase()
    );
    if (!category) {
        category = await guild.channels.create({
            name: catName,
            type: ChannelType.GuildCategory,
        }).catch(() => null);
    }

    // Create the "Join to Create" trigger VC
    const joinCh = await guild.channels.create({
        name: '➕ Join to Create',
        type: ChannelType.GuildVoice,
        parent: category?.id || null,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
            },
        ],
    });

    joinChannels.set(guild.id, joinCh.id);
    saveConfig();

    return message.reply(
        `✅ **VoiceMaster waa la dejiyay!**\n` +
        `📢 Channel: ${joinCh}\n\n` +
        `_User-ku ${joinCh} ku biiraan — VC u gaar ah ayaa si toos ah loo sameyaa.\n` +
        `Qofku baxaan, VC-giisii waa la tirtiraa._`
    );
}

// ── Teardown command: ?vcremove ──
async function vcRemoveCmd(message) {
    const { isAdmin } = require('../utils/admin');
    if (!isAdmin(message.author.id)) return message.reply('🚫 Admin kaliya.');
    if (!message.guild) return;

    const channelId = joinChannels.get(message.guild.id);
    if (channelId) {
        const ch = message.guild.channels.cache.get(channelId);
        if (ch) await ch.delete('VoiceMaster removed').catch(() => {});
        joinChannels.delete(message.guild.id);
        saveConfig();
    }
    return message.reply('✅ VoiceMaster waa la joojiyay.');
}

// ── voiceStateUpdate handler ──
async function handleVoiceState(oldState, newState) {
    const guild = newState.guild || oldState.guild;

    // User joined a channel
    if (newState.channelId) {
        const joinChId = joinChannels.get(guild.id);

        // Joined the "Join to Create" channel
        if (newState.channelId === joinChId) {
            const member = newState.member;
            const joinCh = newState.channel;

            let vcName = member.nickname || member.user.globalName || member.user.username;
            vcName = `${vcName}'s channel`;

            try {
                const tempVc = await guild.channels.create({
                    name: vcName,
                    type: ChannelType.GuildVoice,
                    parent: joinCh.parentId || null,
                    userLimit: 0,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone,
                            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: member.id,
                            allow: [
                                PermissionFlagsBits.Connect,
                                PermissionFlagsBits.Speak,
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.MuteMembers,
                                PermissionFlagsBits.DeafenMembers,
                                PermissionFlagsBits.MoveMembers,
                                PermissionFlagsBits.ManageChannels,
                            ],
                        },
                    ],
                });

                tempChannels.set(tempVc.id, member.id);

                // Move member to their new channel
                await member.voice.setChannel(tempVc).catch(() => {});
            } catch (err) {
                console.error('[VoiceMaster] VC sameysi khalad:', err.message);
            }
        }
    }

    // User left a channel — check if it was a temp VC and is now empty
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const oldCh = oldState.channel;
        if (oldCh && oldCh.members.size === 0) {
            await oldCh.delete('VoiceMaster — channel madow').catch(() => {});
            tempChannels.delete(oldState.channelId);
        }
    }
}

module.exports = { vcSetupCmd, vcRemoveCmd, handleVoiceState };
