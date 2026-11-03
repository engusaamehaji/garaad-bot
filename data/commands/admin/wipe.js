const { isAdmin } = require('../../../src/utils/admin');

module.exports = async function wipeCmd(message, args) {
    if (!isAdmin(message.author.id)) {
        return message.reply('🚫 Admins only can use this command.');
    }

    if (!message.guild) {
        return message.reply('⚠️ This command can only be used in a server.');
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
            `✅ **Channel cleared** — all previous messages were deleted.\n` +
            `👤 Admin: **${message.author.username}**`
        );

        // Delete the old channel (this removes all messages instantly)
        await channel.delete(`?wipe — ${message.author.username}`);

    } catch (err) {
        return message.reply(
            `⚠️ Wipe failed.\n` +
            `Make sure the bot has **Manage Channels** permission.\n` +
            `\`${err.message}\``
        );
    }
};
