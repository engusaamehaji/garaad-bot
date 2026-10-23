const path = require('path');
const { spawn } = require('child_process');
const {
    joinVoiceChannel, createAudioPlayer, createAudioResource,
    AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection,
    StreamType,
} = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { canPlayMusic, isAdmin } = require('../../src/utils/admin');

// ffmpeg path for @discordjs/voice transcoding
try {
    const bin = require('ffmpeg-static');
    if (bin) process.env.FFMPEG_PATH = bin;
} catch {}

// yt-dlp binary — uses the one bundled with @distube/yt-dlp
const YTDLP = (() => {
    try {
        const main = require.resolve('@distube/yt-dlp');
        const exe  = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        return path.join(path.dirname(main), '..', 'bin', exe);
    } catch { return 'yt-dlp'; }
})();

const queues = new Map();

function fmtDur(sec) {
    if (!sec) return '?:??';
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function controlRow(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_pause_${guildId}`).setLabel('⏸ Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`music_skip_${guildId}`) .setLabel('⏭ Skip') .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_stop_${guildId}`) .setLabel('⏹ Stop') .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`music_queue_${guildId}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_leave_${guildId}`).setLabel('👋 Leave').setStyle(ButtonStyle.Danger),
    );
}

function loopRow(guildId, loop) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_loop1_${guildId}`)  .setLabel('🔂 Loop Song').setStyle(loop === 'one' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_loopall_${guildId}`).setLabel('🔁 Loop All') .setStyle(loop === 'all' ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
}

function nowPlayingComponents(guildId, loop) {
    return [controlRow(guildId), loopRow(guildId, loop || 'off')];
}

function playNext(guildId) {
    const q = queues.get(guildId);
    if (!q) return;

    // Handle loop before consuming next song
    if (q.current) {
        if (q.loop === 'one')  q.queue.unshift(q.current);
        else if (q.loop === 'all') q.queue.push(q.current);
    }

    if (!q.queue.length) { q.current = null; return; }
    const song = q.queue.shift();
    q.current = song;

    const proc = spawn(YTDLP, [
        '-f', 'bestaudio/best',
        '-o', '-',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        song.url,
    ]);

    let failed = false;
    proc.stderr.on('data', d => console.error('[yt-dlp]', d.toString().trim()));
    proc.on('error', err => {
        if (failed) return; failed = true;
        console.error('[Music spawn]', err.message);
        q.textChannel?.send(`⚠️ "${song.title}" - yt-dlp khalad: ${err.message.slice(0,60)}`).catch(() => {});
        setTimeout(() => playNext(guildId), 1000);
    });
    proc.on('close', code => {
        if (code !== 0 && !failed) console.error('[yt-dlp] exit', code);
    });

    try {
        const res = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary });
        q.player.play(res);
        const loopLabel = q.loop === 'one' ? ' 🔂' : q.loop === 'all' ? ' 🔁' : '';
        q.textChannel?.send({
            embeds: [new EmbedBuilder().setColor('#1db954').setTitle(`🎵 Hadda Ciyaaraysa${loopLabel}`)
                .setDescription(`**[${song.title}](${song.url})**`)
                .addFields(
                    { name: '⏱', value: song.duration, inline: true },
                    { name: '📋', value: `${q.queue.length} haray`, inline: true },
                )
                .setThumbnail(song.thumbnail)],
            components: nowPlayingComponents(guildId, q.loop),
        }).catch(() => {});
    } catch (e) {
        console.error('[Music]', e.message);
        q.textChannel?.send(`⚠️ "${song.title}" - khalad: ${e.message.slice(0,80)}`).catch(() => {});
        proc.kill();
        setTimeout(() => playNext(guildId), 1000);
    }
}

function ytdlpInfo(query) {
    const isUrl = /^https?:\/\//.test(query);
    const searchArg = isUrl ? query : `ytsearch1:${query}`;
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [
            '--dump-json', '--no-playlist',
            '--quiet', '--no-warnings',
            searchArg,
        ]);
        let out = '';
        proc.stdout.on('data', d => { out += d; });
        proc.stderr.on('data', d => console.error('[yt-dlp info]', d.toString().trim()));
        proc.on('close', code => {
            const line = out.trim().split('\n')[0];
            if (!line) return reject(new Error('yt-dlp: xog lama helin'));
            try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
        });
        proc.on('error', reject);
    });
}

async function joinCmd(message, args) {
    if (!canPlayMusic(message.author.id)) return message.reply('⛔ Ma haysatid fasax. Admin-ku wuxuu kuu siinayaa DJ fasaxa: `?dj @adigu`');
    const query = args.join(' ').trim();
    if (!query) return message.reply('⚠️ `?play <magaca gabar ama YouTube URL>`');
    const vc = message.member?.voice?.channel;
    if (!vc) return message.reply('⚠️ Marka hore VC ku biir.');

    const msg = await message.reply('🔍 Raadinaya...');
    try {
        const info = await ytdlpInfo(query);
        const song = {
            title:     info.title || query,
            url:       info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
            duration:  fmtDur(info.duration),
            thumbnail: info.thumbnail || null,
        };

        const guildId = message.guild.id;
        if (queues.has(guildId)) {
            queues.get(guildId).queue.push(song);
            return msg.edit({ content: '', embeds: [new EmbedBuilder().setColor('#9b59b6').setDescription(`➕ **${song.title}** — ${song.duration}`)] });
        }

        const conn = joinVoiceChannel({ channelId: vc.id, guildId, adapterCreator: message.guild.voiceAdapterCreator, selfDeaf: false });
        const player = createAudioPlayer();
        conn.subscribe(player);
        queues.set(guildId, { connection: conn, player, queue: [song], current: null, textChannel: message.channel, loop: 'off' });

        player.on(AudioPlayerStatus.Idle, () => playNext(guildId));
        player.on('error', e => { console.error('[Music player]', e.message); playNext(guildId); });
        conn.on(VoiceConnectionStatus.Disconnected, async () => {
            try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5_000), entersState(conn, VoiceConnectionStatus.Connecting, 5_000)]); }
            catch { conn.destroy(); queues.delete(guildId); }
        });

        await msg.edit({ content: `✅ VC **${vc.name}** ku biray!`, embeds: [] });
        playNext(guildId);
    } catch (e) {
        console.error('[Music]', e.message);
        msg.edit(`❌ Khalad: ${e.message.slice(0, 100)}`).catch(() => {});
    }
}

function skipMsgCmd(m)  { if (!canPlayMusic(m.author.id)) return m.reply('⛔'); queues.get(m.guild.id)?.player.stop(); m.reply('⏭️'); }
function stopMsgCmd(m)  { if (!isAdmin(m.author.id)) return m.reply('⛔'); const q=queues.get(m.guild.id); if(q){q.queue=[];q.player.stop();q.connection.destroy();queues.delete(m.guild.id);} m.reply('⏹️'); }
function leaveMsgCmd(m) { if (!isAdmin(m.author.id)) return m.reply('⛔'); getVoiceConnection(m.guild.id)?.destroy(); queues.delete(m.guild.id); m.reply('👋'); }
function queueMsgCmd(m) {
    const q = queues.get(m.guild.id);
    if (!q?.current && !q?.queue.length) return m.reply('📭 Queue maran.');
    const lines = [];
    if (q.current) lines.push(`🎵 **Hadda:** ${q.current.title} — ${q.current.duration}`);
    q.queue.slice(0,9).forEach((s,i)=>lines.push(`**${i+1}.** ${s.title} — ${s.duration}`));
    m.reply({ embeds:[new EmbedBuilder().setTitle('🎶 Queue').setColor('#1db954').setDescription(lines.join('\n'))] });
}
function npMsgCmd(m) {
    const q = queues.get(m.guild.id);
    if (!q?.current) return m.reply('⚠️ Wax ma ciyaarayo.');
    m.reply({ embeds:[new EmbedBuilder().setColor('#1db954').setTitle('🎵 Hadda').setDescription(`**${q.current.title}**\n⏱ ${q.current.duration}`)] });
}

function loopById(g, mode) { const q = queues.get(g); if (q) q.loop = mode; }
function getQueueObj(g) { return queues.get(g); }
function skipById(g)    { queues.get(g)?.player.stop(); }
function stopById(g)    { const q=queues.get(g); if(q){q.queue=[];q.player.stop();q.connection.destroy();queues.delete(g);} }
function pauseById(g)   { const q=queues.get(g); if(!q)return null; const s=q.player.state.status; if(s===AudioPlayerStatus.Paused){q.player.unpause();return'resumed';}q.player.pause();return'paused'; }
function leaveById(g)   { getVoiceConnection(g)?.destroy(); queues.delete(g); }

module.exports = { joinCmd, skipMsgCmd, stopMsgCmd, leaveMsgCmd, queueMsgCmd, npMsgCmd, getQueueObj, skipById, stopById, pauseById, leaveById, loopById };
