const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

// Keep one connection per guild
const connections = new Map();

async function joinCmd(message) {
    const channel = message.member?.voice?.channel;
    if (!channel)
        return message.reply('⚠️ Marka hore VC channel ku gal, kadib `?join` isticmaal.');

    // Already connected to same channel
    const existing = connections.get(message.guild.id);
    if (existing && existing.joinConfig?.channelId === channel.id)
        return message.reply(`✅ Horay waan ku jiraa **${channel.name}**!`);

    try {
        const conn = joinVoiceChannel({
            channelId:      channel.id,
            guildId:        channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf:       true,
            selfMute:       true,
        });

        // Reconnect automatically if disconnected
        conn.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(conn, VoiceConnectionStatus.Signalling,   5_000),
                    entersState(conn, VoiceConnectionStatus.Connecting,   5_000),
                ]);
            } catch {
                try {
                    const ch = message.guild.channels.cache.get(channel.id);
                    if (ch) {
                        const newConn = joinVoiceChannel({
                            channelId:      ch.id,
                            guildId:        ch.guild.id,
                            adapterCreator: ch.guild.voiceAdapterCreator,
                            selfDeaf:       true,
                            selfMute:       true,
                        });
                        connections.set(message.guild.id, newConn);
                    }
                } catch {}
            }
        });

        connections.set(message.guild.id, conn);
        await entersState(conn, VoiceConnectionStatus.Ready, 10_000);
        return message.reply(`✅ **${channel.name}** waan ku biray — 24/7 ayaan joogaa!`);
    } catch (err) {
        console.error('[Join]', err);
        return message.reply('⚠️ VC-ga laguma biray. Bot-ka permissions hubi (Connect).');
    }
}

async function leaveCmd(message) {
    const conn = connections.get(message.guild.id);
    if (!conn)
        return message.reply('⚠️ Wax VC ah kuma jiro.');
    conn.destroy();
    connections.delete(message.guild.id);
    return message.reply('👋 VC-ga waa laga baxay.');
}

module.exports = { joinCmd, leaveCmd };
