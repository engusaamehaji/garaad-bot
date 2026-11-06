const { ChannelType, PermissionFlagsBits } = require('discord.js');

async function secretChatCommand(message) {
    if (!message.guild || message.channel.type !== ChannelType.GuildText) {
        return message.reply('`?sec @user` ku isticmaal text channel-ka server-ka si private thread loo sameeyo.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Qaabka saxda ah: `?sec @user`');
    if (target.user.bot) return message.reply('Bot looma diri karo farriin sir ah.');
    if (target.id === message.author.id) return message.reply('Naftaada private chat lama furi kartid.');

    const botMember = message.guild.members.me;
    const permissions = botMember && message.channel.permissionsFor(botMember);
    if (!permissions?.has([
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.ManageThreads,
    ])) {
        return message.reply('Bot-ku wuxuu u baahan yahay **Create Private Threads**, **Send Messages in Threads**, iyo **Manage Threads** si uu chat-ka gaarka ah u furo.');
    }

    let thread;
    try {
        thread = await message.channel.threads.create({
            name: 'Farriin gaar ah',
            type: ChannelType.PrivateThread,
            autoArchiveDuration: 60,
            invitable: false,
            reason: `Private chat requested by ${message.author.id}`,
        });
        await thread.members.add(message.author.id);
        await thread.members.add(target.id);
        await thread.send({
            content:
                `<@${message.author.id}> iyo <@${target.id}> — private chat-kiinnu waa diyaar.\n` +
                `Farriinta sirta ah halkan ku qor. Qoraalka halkan ku jira waxaa arki kara xubnaha thread-kan iyo maamulka server-ka ee leh Manage Threads.`,
            allowedMentions: { users: [message.author.id, target.id] },
        });
    } catch (error) {
        console.error('[SecretChat] Failed to create private chat:', error);
        if (thread) {
            try {
                await thread.setArchived(true, 'Private chat setup failed');
            } catch (archiveError) {
                console.error('[SecretChat] Failed to archive incomplete thread:', archiveError);
            }
        }
        return message.reply('Waan ku guuldarraystay furitaanka private chat-ka. Hubi permissions-ka bot-ka oo isku day mar kale.');
    }

    return message.reply(`✅ Private chat-ka adiga iyo <@${target.id}> waa la furay: <#${thread.id}>`);
}

module.exports = { secretChatCommand };
