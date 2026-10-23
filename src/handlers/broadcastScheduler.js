const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

const MESSAGE = [
    '📢 **U codee Garaad** si aad u hesho **abaalmarino gaar ah**.',
    '',
    'Haddii aad aragto **cilad, bug, ama qalad** ku jira bot-ka, maamulka usoo sheeg si loo hagaajiyo. Dadka caawiya hagaajinta server-ka waxay heli karaan **abaalmarin gaar ah**.',
    '',
    '🎮 **Dheelo ciyaaro aqoon iyo shaqo kuu horseedi kara** si aad u hesho faa\'iido iyo madadaalo badan.',
    '',
    '📖 **Qor `?caawin`** si aad u aragto dhammaan features-ka iyo commands-ka bot-ka.',
    '',
    '**Commands:**',
    '🛠️ **`?cilad [fariin]`** — Soo sheeg cilad ama qalad',
    '💡 **`?dm`** — U dir maamulka fikrad, talo, ama aragti',
    '',
    '**Mahadsanid isticmaalka Garaad Bot ❤️**',
    '**Kobco garaadkaaga, yeelo kormaal sare.**',
].join('\n');

function getBestChannel(guild) {
    // 1. Configured env channel inside this guild
    const envId = process.env.BROADCAST_CHANNEL_ID;
    if (envId) {
        const ch = guild.channels.cache.get(envId);
        if (ch && ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages')) return ch;
    }

    // 2. Guild system channel
    if (guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me)?.has('SendMessages'))
        return guild.systemChannel;

    // 3. Channel with common names
    const preferred = ['general', 'chat', 'main', 'bot', 'garaad', 'lobby'];
    for (const name of preferred) {
        const ch = guild.channels.cache.find(c =>
            c.isTextBased() &&
            c.name.toLowerCase().includes(name) &&
            c.permissionsFor(guild.members.me)?.has('SendMessages')
        );
        if (ch) return ch;
    }

    // 4. First writable text channel
    return guild.channels.cache.find(c =>
        c.isTextBased() &&
        c.permissionsFor(guild.members.me)?.has('SendMessages')
    ) || null;
}

async function broadcast(client) {
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setDescription(MESSAGE)
        .setFooter({ text: 'Garaad Bot • garaadkaaga kobco' });

    const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🗳️ Vote for Garaad')
            .setStyle(ButtonStyle.Link)
            .setURL('https://top.gg/bot/1495341089266073705'),
    );

    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
        try {
            const ch = getBestChannel(guild);
            if (!ch) continue;
            await ch.send({ embeds: [embed], components: [voteRow] });
            sent++;
        } catch {
            // skip guilds where send fails
        }
    }
    console.log(`[Broadcast] Sent to ${sent}/${client.guilds.cache.size} servers`);
}

module.exports = function setupBroadcastScheduler(client) {
    setTimeout(() => {
        broadcast(client);
        setInterval(() => broadcast(client), INTERVAL_MS);
    }, 3 * 60 * 1000); // first broadcast after 3 minutes, then every 4 hours

    console.log('[Broadcast] ✅ Scheduler started — first message in 3 minutes');
};
