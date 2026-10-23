const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

let distube = null;

function controlRow(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_pause_${guildId}`).setLabel('⏸ Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`music_skip_${guildId}`) .setLabel('⏭ Skip') .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_stop_${guildId}`) .setLabel('⏹ Stop') .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`music_queue_${guildId}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_leave_${guildId}`).setLabel('👋 Leave').setStyle(ButtonStyle.Danger),
    );
}

function setupDisTube(client) {
    distube = new DisTube(client, {
        plugins: [new YtDlpPlugin({ update: false })],
        emitNewSongOnly: true,
        joinNewVoiceChannel: true,
        nsfw: true,
    });

    distube.on('playSong', (queue, song) => {
        queue.textChannel?.send({
            embeds: [new EmbedBuilder()
                .setColor('#1db954')
                .setTitle('🎵 Hadda Ciyaaraysa')
                .setDescription(`**[${song.name}](${song.url})**`)
                .addFields(
                    { name: '⏱ Muddada', value: song.formattedDuration, inline: true },
                    { name: '📋 Queue',   value: `${queue.songs.length - 1} gabar haray`, inline: true },
                )
                .setThumbnail(song.thumbnail)
                .setFooter({ text: 'Garaad Bot Music' })
            ],
            components: [controlRow(queue.id)],
        }).catch(() => {});
    });

    distube.on('addSong', (queue, song) => {
        queue.textChannel?.send({
            embeds: [new EmbedBuilder().setColor('#9b59b6')
                .setDescription(`➕ **[${song.name}](${song.url})** — ${song.formattedDuration} — queue **${queue.songs.length}**`)
            ]
        }).catch(() => {});
    });

    distube.on('finish', queue => {
        queue.textChannel?.send('✅ Queue dhammaatay. `?play <gabar>` ku dar.').catch(() => {});
    });

    distube.on('error', (e, queue) => {
        console.error('[DisTube]', e.message);
        queue?.textChannel?.send(`⚠️ Khalad: ${e.message.slice(0, 100)}`).catch(() => {});
    });

    console.log('[Music] DisTube + yt-dlp initialized');
    return distube;
}

function getDisTube() { return distube; }
module.exports = { setupDisTube, getDisTube, controlRow };
