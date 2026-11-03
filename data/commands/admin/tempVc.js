const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../../../src/utils/admin');

// Track active temp VCs: channelId → { timer, guildId, name }
const activeTempVCs = new Map();

// Auto-delete when VC becomes empty
function watchVcEmpty(client, channelId, guildId, timeoutMs) {
    const check = async () => {
        try {
            const guild   = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return;
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel) { activeTempVCs.delete(channelId); return; }

            if (channel.members.size === 0) {
                await channel.delete('Temp VC — marnaba player ma joogin').catch(() => {});
                activeTempVCs.delete(channelId);
            }
        } catch {}
    };
    // Check every 30 seconds if VC is empty
    const interval = setInterval(check, 30_000);
    return interval;
}

module.exports = function setupTempVc(client) {
    async function tempVcCmd(message, args) {
        if (!isAdmin(message.author.id)) {
            return message.reply('🚫 Admins only can use this command.');
        }
        if (!message.guild) {
            return message.reply('⚠️ This command can only be used in a server.');
        }

        // ?tvc [name] [minutes]
        // e.g. ?tvc Game 60  or  ?tvc 30
        let name    = 'Temp VC';
        let minutes = 60;

        if (args.length > 0) {
            const last = parseInt(args[args.length - 1], 10);
            if (!isNaN(last)) {
                minutes = Math.min(Math.max(last, 1), 1440); // 1 min → 24 hrs
                const nameParts = args.slice(0, -1);
                if (nameParts.length > 0) name = nameParts.join(' ');
            } else {
                name = args.join(' ');
            }
        }

        // Find parent category from the message channel if possible
        const parent = message.channel.parentId || null;

        let vc;
        try {
            vc = await message.guild.channels.create({
                name:       `🔊 ${name}`,
                type:       ChannelType.GuildVoice,
                parent,
                userLimit:  0, // unlimited
                permissionOverwrites: [
                    {
                        id:    message.guild.roles.everyone,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel],
                    },
                ],
            });
        } catch (err) {
            return message.reply(`⚠️ Could not create the voice channel. Make sure the bot has **Manage Channels** permission.\n\`${err.message}\``);
        }

        const expiresAt = Date.now() + minutes * 60_000;

        // Auto-delete timer
        const deleteTimer = setTimeout(async () => {
            const entry = activeTempVCs.get(vc.id);
            if (entry) clearInterval(entry.interval);
            activeTempVCs.delete(vc.id);
            await vc.delete('Temp VC waqtigu dhacay').catch(() => {});
            message.channel.send(`🗑️ **${name}** temp VC waqtigiisii dhacay oo deleted.`).catch(() => {});
        }, minutes * 60_000);

        // Empty-watcher
        const interval = watchVcEmpty(client, vc.id, message.guild.id, minutes * 60_000);

        activeTempVCs.set(vc.id, { timer: deleteTimer, interval, name, guildId: message.guild.id });

        const embed = new EmbedBuilder()
            .setTitle('🔊 Temp VC Created')
            .setColor('#3498db')
            .setDescription(
                `**Channel:** ${vc}\n` +
                `**Magac:** 🔊 ${name}\n` +
                `**Waqtiga:** ${minutes} daqiiqo\n` +
                `**Expires:** <t:${Math.floor(expiresAt / 1000)}:R>\n\n` +
                `_The temporary voice channel is deleted when empty or when its timer expires._`
            )
            .setFooter({ text: `Garaad Admin • ${message.author.username}` });

        return message.reply({ embeds: [embed] });
    }

    return { tempVcCmd, activeTempVCs };
};
