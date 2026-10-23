const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData } = require('../../src/store');
const { checkUser } = require('../../src/utils/helpers');
const { ensureRel, RING_NAMES } = require('./relationship');

module.exports = async function personalCmd(message) {
    const userId = message.author.id;
    checkUser(userId);
    ensureRel(userId);

    const d   = userData[userId];
    const rel = d.relationship || {};

    // Partner info
    let partnerTxt = '*None*';
    if (rel.partnerId) {
        let pName = rel.partnerUsername || `<@${rel.partnerId}>`;
        try { const u = await message.client.users.fetch(rel.partnerId); pName = u.username; } catch {}
        const days = rel.since ? Math.floor((Date.now() - rel.since) / 86400000) : 0;
        partnerTxt = `${pName} ❤️ ${message.author.username}\n📅 ${days} Maalmood · ${RING_NAMES[rel.ringType] || '💍'}`;
    }

    // Friends count
    const friendCount = (d.friends || []).length;

    // Pending requests
    const pendingIn  = (d.pendingFriendReqs || []).length;
    const pendingOut = rel.partnerId ? 0 : 0;

    const embed = new EmbedBuilder()
        .setTitle(`💕 ${message.author.username} — Personal`)
        .setColor('#e91e8c')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setDescription(
            `**💕 Partner:**\n${partnerTxt}\n\n` +
            `**👥 Saaxiibada:** ${friendCount}${pendingIn > 0 ? ` *(${pendingIn} codsi cusub)*` : ''}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `**📋 Amarrada:**\n` +
            `\`?friend @user\` — Saaxiib codsi dir\n` +
            `\`?unfriend @user\` — Saaxiib ka saar\n` +
            `\`?friends\` — Saaxiibada list\n` +
            `\`?propose @user\` — Guur u soo jed\n` +
            `\`?partner\` — Partner eeg\n` +
            `\`?breakup\` — Relationship dhamaystir\n\n` +
            `\`?shop rings\` — Ring iibso`
        )
        .setFooter({ text: 'Garaad Bot • Personal' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rel_view_friends_${userId}`).setLabel('👥 Saaxiibada').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rel_view_partner_${userId}`).setLabel('💕 Partner').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`close_personal_${userId}`).setLabel('✖ Xir').setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [embed], components: [row] });
};
