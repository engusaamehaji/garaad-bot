// =====================================================================
// AMARKA: ?savers
// Shows all servers/guilds where the bot is installed.
// =====================================================================

const { EmbedBuilder } = require('discord.js');

const SERVERS_PER_EMBED = 20;

module.exports = async function saversCmd(message) {
    const guilds = [...message.client.guilds.cache.values()]
        .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

    if (!guilds.length) {
        return message.reply('⚠️ Bot-ku server ma hayo hadda.');
    }

    const chunks = [];
    for (let i = 0; i < guilds.length; i += SERVERS_PER_EMBED) {
        chunks.push(guilds.slice(i, i + SERVERS_PER_EMBED));
    }

    const totalMembers = guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
    const botName = message.client.user?.username || 'Garaad Bot';

    for (let i = 0; i < chunks.length; i++) {
        const start = i * SERVERS_PER_EMBED;
        const lines = chunks[i].map((guild, index) =>
            `**${start + index + 1}. ${guild.name}** — ${(guild.memberCount || 0).toLocaleString()} members`
        );

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`🌐 Servers-ka ${botName} (${guilds.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({
                text: `Wadarta: ${guilds.length} server • ${totalMembers.toLocaleString()} members • Page ${i + 1}/${chunks.length}`,
            });

        if (i === 0) await message.reply({ embeds: [embed] });
        else await message.channel.send({ embeds: [embed] });
    }
};
