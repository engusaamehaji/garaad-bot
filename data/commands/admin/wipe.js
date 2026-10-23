const { isAdmin } = require('../../../src/utils/admin');

module.exports = async function wipeCmd(message, args) {
    if (!isAdmin(message.author.id)) {
        return message.reply('🚫 Admin kaliya ayaa amarkan isticmaali kara.');
    }

    if (!message.guild) {
        return message.reply('⚠️ Amarkan kaliya server-ka dhexdiisa ayaa lagu isticmaali karaa.');
    }

    const channel = message.channel;

    try {
        // Clone the channel with identical settings (name, topic, position, parent, permissions)
        const newChannel = await channel.clone({
            reason: `?wipe — ${message.author.username}`,
        });

        // Move cloned channel to same position
        await newChannel.setPosition(channel.position).catch(() => {});

        // Confirm in the new channel
        await newChannel.send(
            `✅ **Channel waa la nadiifiyay** — fariimihii hore oo dhan waa la tirtiray.\n` +
            `👤 Admin: **${message.author.username}**`
        );

        // Delete the old channel (this removes all messages instantly)
        await channel.delete(`?wipe — ${message.author.username}`);

    } catch (err) {
        return message.reply(
            `⚠️ Wipe ma guulaysan.\n` +
            `Bot-ka hubi inuu leeyahay **Manage Channels** permission.\n` +
            `\`${err.message}\``
        );
    }
};
