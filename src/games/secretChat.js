const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const { randomBytes } = require('crypto');

const INVITE_TTL_MS = 5 * 60 * 1000;
const pendingInvites = new Map();
const pendingByUser = new Map();
const activeChats = new Map();
const chatByUser = new Map();

function clearInvite(invite) {
    clearTimeout(invite.timeout);
    pendingInvites.delete(invite.id);
    pendingByUser.delete(invite.requesterId);
    pendingByUser.delete(invite.targetId);
}

async function sendPrivate(user, content, context) {
    try {
        return await user.send(content);
    } catch (error) {
        console.error(`[SecretChat] ${context}:`, error);
        return null;
    }
}

async function secretChatCommand(message) {
    if (!message.guild || message.channel.type !== ChannelType.GuildText) return;

    const botMember = message.guild.members.me;
    const permissions = botMember ? message.channel.permissionsFor(botMember) : null;
    if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
        await sendPrivate(
            message.author,
            'Si `?sec @user` aanu uga muuqan public channel-ka, bot-ku wuxuu u baahan yahay **Manage Messages** channel-kan.',
            'Unable to hide the secret-chat command',
        );
        return;
    }

    try {
        await message.delete();
    } catch (error) {
        console.error('[SecretChat] Failed to delete the public command:', error);
        await sendPrivate(
            message.author,
            'Ma aanan qarin karin amarka `?sec`. Hubi in bot-ku haysto **Manage Messages**, kadibna mar kale isku day.',
            'Unable to notify the requester after command deletion failed',
        );
        return;
    }

    const target = message.mentions.members.first();
    if (!target) {
        await sendPrivate(message.author, 'Qaabka saxda ah: `?sec @user`.', 'Unable to send command usage');
        return;
    }
    if (target.user.bot || target.id === message.author.id) {
        await sendPrivate(message.author, 'Dooro qof kale oo aan bot ahayn.', 'Unable to send target validation');
        return;
    }
    if (chatByUser.has(message.author.id) || chatByUser.has(target.id)) {
        await sendPrivate(message.author, 'Adiga ama qofka aad dooratay wuxuu hore ugu jiraa private chat.', 'Unable to send active-chat notice');
        return;
    }
    if (pendingByUser.has(message.author.id) || pendingByUser.has(target.id)) {
        await sendPrivate(message.author, 'Adiga ama qofka aad dooratay wuxuu leeyahay casuumaad private chat oo sugaysa.', 'Unable to send pending-invite notice');
        return;
    }

    const requesterMessage = await sendPrivate(
        message.author,
        `Casuumaadda private chat-ka waxaa loo dirayaa **${target.user.username}**. Sug oggolaanshihiisa; fariimaha waxaa la isugu gudbinayaa DM-yada bot-ka.`,
        'Unable to DM the requester',
    );
    if (!requesterMessage) return;

    const id = randomBytes(8).toString('hex');
    const invite = {
        id,
        requesterId: message.author.id,
        targetId: target.id,
        requesterName: message.author.username,
        guildName: message.guild.name,
        timeout: null,
    };
    invite.timeout = setTimeout(() => {
        clearInvite(invite);
        message.author.send('⏳ Casuumaadda private chat-ku way dhacday.').catch(error => {
            console.error('[SecretChat] Failed to notify the requester about an expired invite:', error);
        });
        target.user.send('⏳ Casuumaadda private chat-ku way dhacday.').catch(error => {
            console.error('[SecretChat] Failed to notify the target about an expired invite:', error);
        });
    }, INVITE_TTL_MS);
    invite.timeout.unref?.();
    pendingInvites.set(id, invite);
    pendingByUser.set(invite.requesterId, id);
    pendingByUser.set(invite.targetId, id);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sec_accept_${id}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`sec_decline_${id}`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Secondary),
    );
    try {
        await target.user.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔒 Private chat invitation')
                .setColor('#5865f2')
                .setDescription(`**${invite.requesterName}** from **${invite.guildName}** wants to start a private chat with you.\n\nIf accepted, messages you send to the bot in DMs will be relayed only to each other. The chat can be ended at any time with \`?sec end\`.`)
                .setFooter({ text: 'This invitation expires in 5 minutes.' })],
            components: [row],
        });
    } catch (error) {
        clearInvite(invite);
        console.error('[SecretChat] Failed to send the invitation:', error);
        await sendPrivate(message.author, 'Qofkaas lama gaarsiin karin casuumaadda. Waxaa laga yaabaa in DMs-kiisu xiran yihiin.', 'Unable to notify requester that invite delivery failed');
    }
}

async function handleSecretChatButton(interaction) {
    const [, action, id] = interaction.customId.split('_');
    const invite = pendingInvites.get(id);
    if (!invite) {
        return interaction.reply({ content: 'Casuumaaddani way dhacday ama mar hore ayaa laga jawaabay.', ephemeral: true });
    }
    if (interaction.user.id !== invite.targetId) {
        return interaction.reply({ content: 'Casuumaaddan qof kale ayaa helay.', ephemeral: true });
    }

    if (action === 'decline') {
        clearInvite(invite);
        await interaction.update({ content: 'Casuumaadda waa la diiday.', embeds: [], components: [] });
        try {
            const requester = await interaction.client.users.fetch(invite.requesterId);
            await requester.send('Casuumaadda private chat-ka waa la diiday.');
        } catch (error) {
            console.error('[SecretChat] Failed to notify the requester about a declined invite:', error);
        }
        return;
    }

    if (action !== 'accept') return;

    let requester;
    const target = interaction.user;
    try {
        requester = await interaction.client.users.fetch(invite.requesterId);
        await requester.send('✅ Casuumaadda waa la aqbalay. Private chat-kiinnu hadda wuu bilaabmay.');
    } catch (error) {
        console.error('[SecretChat] Failed to DM the requester after acceptance:', error);
        clearInvite(invite);
        return interaction.update({ content: 'Bot-ku ma gaarsiin karin xaqiijinta qofkii casuumay. Chat-ka lama bilaabin.', embeds: [], components: [] });
    }

    clearInvite(invite);
    const chat = { id, users: [invite.requesterId, invite.targetId] };
    activeChats.set(id, chat);
    chatByUser.set(invite.requesterId, chat);
    chatByUser.set(invite.targetId, chat);
    await interaction.update({
        content: '✅ Casuumaadda waa la aqbalay. Hadda farriimaha bot-ka ugu dir DM; chat-ka ku jooji `?sec end`.',
        embeds: [],
        components: [],
    });
    await sendPrivate(requester, `🔒 Private chat-ka **${target.username}** waa diyaar. U dir bot-ka farriimahaaga DM; ku qor \`?sec end\` si aad u joojiso.`, 'Unable to send the requester chat instructions');
}

async function handleSecretChatMessage(message) {
    if (message.guild) return false;

    const chat = chatByUser.get(message.author.id);
    if (!chat) return false;

    if (message.content.trim().toLowerCase() === '?sec end') {
        activeChats.delete(chat.id);
        for (const userId of chat.users) chatByUser.delete(userId);
        for (const userId of chat.users) {
            try {
                const user = await message.client.users.fetch(userId);
                await sendPrivate(user, '🔒 Private chat waa la joojiyay.', 'Unable to notify a user that the chat ended');
            } catch (error) {
                console.error('[SecretChat] Failed to fetch a chat participant after the chat ended:', error);
            }
        }
        return true;
    }

    const recipientId = chat.users.find(userId => userId !== message.author.id);
    const text = message.content.trim();
    const content = `**${message.author.username}:** ${text || '(attachment)'}`;
    const payload = {
        content: content.length > 2000 ? `${content.slice(0, 1997)}...` : content,
        allowedMentions: { parse: [] },
    };
    if (message.attachments.size) {
        payload.files = [...message.attachments.values()].map(({ url, name }) => ({ attachment: url, name }));
    }

    try {
        const recipient = await message.client.users.fetch(recipientId);
        await recipient.send(payload);
    } catch (error) {
        console.error('[SecretChat] Failed to relay a DM:', error);
        await sendPrivate(message.author, 'Bot-ku ma gudbin karin farriinta. Qofka kale waxaa laga yaabaa in DMs-kiisu xiran yihiin ama lifaaqu aad u weyn yahay.', 'Unable to report a relay failure');
    }
    return true;
}

module.exports = { secretChatCommand, handleSecretChatButton, handleSecretChatMessage };
