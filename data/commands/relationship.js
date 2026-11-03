const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { checkUser } = require('../../src/utils/helpers');
const { econData, checkEconUser, saveEcon } = require('../../src/economy/econStore');

const RING_NAMES = {
    silver:  '💍 Silver Ring',
    diamond: '💎 Diamond Ring',
    royal:   '👑 Royal Ring',
    somali:  '🇸🇴 Somali Ring',
};

const RING_PRICES = {
    silver:  5000,
    diamond: 15000,
    royal:   30000,
    somali:  50000,
};

const RING_DISPLAY = {
    silver:  { emoji: '💍', label: 'Silver Ring',  desc: 'Qurux fudud oo xushmad leh',    color: '#bdc3c7' },
    diamond: { emoji: '💎', label: 'Diamond Ring', desc: 'Qiimo sarreeya — jaceyl dhabta', color: '#85c1e9' },
    royal:   { emoji: '👑', label: 'Royal Ring',   desc: 'Boqornimada jaceylka',           color: '#f1c40f' },
    somali:  { emoji: '🇸🇴', label: 'Somali Ring',  desc: 'Dhaqanka iyo jaceylka',          color: '#4CAF50' },
};

// Active proposal timers: proposerId → { timer, msgRef, targetId }
const _proposalTimers = new Map();

function ensureRel(userId) {
    const d = userData[userId];
    d.relationship      ??= { partnerId: null, partnerUsername: null, ringType: null, since: null, proposerId: null };
    d.friends           ??= [];
    d.pendingFriendReqs ??= [];
    d.pendingProposal   ??= null;
    d.ownedRings        ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
}

// ── ?friend @user ──────────────────────────────────────
async function friendCmd(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Usage: `?friend @user`');
    if (target.id === message.author.id) return message.reply('⚠️ You cannot add yourself as a friend.');
    if (target.bot) return message.reply('⚠️ You cannot add bots as friends.');

    checkUser(message.author.id);
    checkUser(target.id);
    ensureRel(message.author.id);
    ensureRel(target.id);

    const sender   = userData[message.author.id];
    const recipient = userData[target.id];

    if ((sender.friends || []).includes(target.id))
        return message.reply(`💕 **${target.username}** is already your friend.`);

    if ((recipient.pendingFriendReqs || []).includes(message.author.id))
        return message.reply(`⏳ You already sent a friend request to **${target.username}**.`);

    recipient.pendingFriendReqs.push(message.author.id);
    saveData();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rel_af_${message.author.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rel_df_${message.author.id}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );

    return message.reply({
        content: `💌 <@${target.id}> — **${message.author.username}** wuxuu kuu dirayaa codsiga saaxiibtinimada!`,
        components: [row],
    });
}

// ── ?unfriend @user ────────────────────────────────────
async function unfriendCmd(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Usage: `?unfriend @user`');

    checkUser(message.author.id);
    ensureRel(message.author.id);
    ensureRel(target.id);

    const d = userData[message.author.id];
    if (!(d.friends || []).includes(target.id))
        return message.reply(`⚠️ **${target.username}** is not on your friends list.`);

    d.friends = d.friends.filter(id => id !== target.id);
    const td = userData[target.id];
    if (td) td.friends = (td.friends || []).filter(id => id !== message.author.id);
    saveData();

    return message.reply(`💔 **${target.username}** was removed from your friends list.`);
}

// ── ?friends ───────────────────────────────────────────
async function friendsListCmd(message) {
    checkUser(message.author.id);
    ensureRel(message.author.id);
    const friendIds = userData[message.author.id].friends || [];

    if (!friendIds.length)
        return message.reply('📭 You do not have any friends yet. `?friend @user` to get started.');

    const names = await Promise.all(friendIds.map(async id => {
        try { const u = await message.client.users.fetch(id); return `👤 **${u.username}**`; }
        catch { return `👤 <@${id}>`; }
    }));

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`💕 ${message.author.username} — Friends`)
            .setColor('#e91e8c')
            .setDescription(names.join('\n'))
            .setFooter({ text: `${friendIds.length} saaxiib` })],
    });
}

// ── ?propose @user ─────────────────────────────────────
async function proposeCmd(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Usage: `?propose @user`');
    if (target.id === message.author.id) return message.reply('⚠️ You cannot marry yourself.');
    if (target.bot) return message.reply('⚠️ You cannot marry a bot.');

    checkUser(message.author.id);
    checkUser(target.id);
    ensureRel(message.author.id);
    ensureRel(target.id);

    const sender   = userData[message.author.id];
    const recipient = userData[target.id];

    if (sender.relationship?.partnerId)
        return message.reply('💔 You must end your current relationship first. `?breakup` use.');
    if (recipient.relationship?.partnerId)
        return message.reply(`💔 **${target.username}** is already married.`);

    if (_proposalTimers.has(message.author.id))
        return message.reply('⏳ You already sent a proposal. Wait for a response.');

    const rings = sender.ownedRings || {};
    const ringType = rings.somali > 0 ? 'somali'
        : rings.royal   > 0 ? 'royal'
        : rings.diamond > 0 ? 'diamond'
        : rings.silver  > 0 ? 'silver'
        : null;

    if (!ringType)
        return message.reply('💍 You do not own a ring. Buy one with `?shop rings`.');

    recipient.pendingProposal = { fromId: message.author.id, fromUsername: message.author.username, ringType };
    saveData();

    const ring  = RING_DISPLAY[ringType];
    const price = RING_PRICES[ringType];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rel_ap_${message.author.id}`).setLabel('💍 Haa, Waan I Accept!').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rel_dp_${message.author.id}`).setLabel('💔 No').setStyle(ButtonStyle.Danger),
    );

    const proposerAvatarUrl = message.author.displayAvatarURL({ size: 128 });

    const embed = new EmbedBuilder()
        .setColor(ring.color)
        .setTitle('💍 Marriage Proposal')
        .setThumbnail(proposerAvatarUrl)
        .setDescription(
            `**${message.author.username}** proposed to **${target.username}**! 💝\n\n` +
            `\`\`\`\n` +
            `  ╔══════════════════════════════╗\n` +
            `  ║  ${ring.emoji}  ${ring.label.padEnd(20)}${ring.emoji}  ║\n` +
            `  ║  ✨ ${ring.desc.padEnd(26)}  ║\n` +
            `  ║  💰 Qiime: 🪙${String(price.toLocaleString()).padEnd(18)}║\n` +
            `  ╚══════════════════════════════╝\n` +
            `\`\`\`\n` +
            `_Will you accept my proposal?_ 💌`
        )
        .addFields(
            { name: '⏱️ Time limit', value: 'Reply within 2 minutes', inline: true },
            { name: '👤 From', value: message.author.username, inline: true },
        )
        .setFooter({ text: `${message.author.username} → ${target.username}  •  ⏳ expires in 2 min` })
        .setTimestamp();

    const sent = await message.reply({
        content: `<@${target.id}>`,
        embeds: [embed],
        components: [row],
    });

    // ── 2-minute auto-cancel timer ──────────────────────
    const timer = setTimeout(async () => {
        _proposalTimers.delete(message.author.id);

        // Only fire if proposal is STILL pending (not yet accepted/declined)
        const rd = userData[target.id];
        if (!rd || rd.pendingProposal?.fromId !== message.author.id) return; // already answered — skip

        rd.pendingProposal = null;
        saveData();

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rel_ap_${message.author.id}`).setLabel('💍 Haa, Waan I Accept!').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`rel_dp_${message.author.id}`).setLabel('💔 No').setStyle(ButtonStyle.Danger).setDisabled(true),
        );

        await sent.edit({
            embeds: [new EmbedBuilder()
                .setColor('#7f8c8d')
                .setTitle('💍 Marriage Proposal — Waqtigu finished')
                .setDescription(`⌛ **${target.username}** did not respond in time.\nThe proposal was cancelled.`)
                .setFooter({ text: `${message.author.username} → ${target.username}  •  Expired` })],
            components: [disabledRow],
        }).catch(() => {});

        await message.channel.send(
            `⌛ <@${message.author.id}> — **${target.username}** did not respond in time. The proposal was cancelled.`
        ).catch(() => {});

    }, 2 * 60 * 1000);

    _proposalTimers.set(message.author.id, { timer, msgRef: sent, targetId: target.id });
}

// Clear timer when proposal is answered (called from interactionHandler on accept OR decline)
function clearProposalTimer(fromId) {
    const entry = _proposalTimers.get(fromId);
    if (entry) {
        clearTimeout(entry.timer);
        _proposalTimers.delete(fromId);
    }
}

// ── ?partner ───────────────────────────────────────────
async function partnerCmd(message) {
    checkUser(message.author.id);
    ensureRel(message.author.id);
    const rel = userData[message.author.id].relationship || {};

    if (!rel.partnerId)
        return message.reply('💔 You do not have a partner. `?propose @user` use.');

    let partnerName = rel.partnerUsername || `<@${rel.partnerId}>`;
    try { const u = await message.client.users.fetch(rel.partnerId); partnerName = u.username; } catch {}

    const days    = rel.since ? Math.floor((Date.now() - rel.since) / 86400000) : 0;
    const ringTxt = RING_NAMES[rel.ringType] || '💍 Ring';
    const price   = RING_PRICES[rel.ringType] || 0;
    const refund  = Math.floor(price / 3);
    const iAmProposer = (rel.proposerId === message.author.id);

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('💕 Partner')
            .setColor('#e91e8c')
            .setDescription(
                `💕 **Partner:**\n${partnerName} ❤️ ${message.author.username}\n\n` +
                `📅 **Together for:**\n${days} days\n\n` +
                `${ringTxt}\n\n` +
                iAmProposer
                    ? `_You paid for the ring. Coins will not be refunded if you end the relationship._`
                    : `_If your partner ends the relationship: 🪙${refund.toLocaleString()} you may receive Coins_`
            )],
    });
}

// ── ?breakup ───────────────────────────────────────────
async function breakupCmd(message) {
    checkUser(message.author.id);
    ensureRel(message.author.id);
    const d = userData[message.author.id];

    if (!d.relationship?.partnerId)
        return message.reply('💔 You do not have a partner.');

    const partnerId   = d.relationship.partnerId;
    const partnerName = d.relationship.partnerUsername || `<@${partnerId}>`;
    const ringType    = d.relationship.ringType;
    // proposerId = the player who paid for the ring (proposer)
    const proposerId  = d.relationship.proposerId || null;

    // Adiga ended the relationship mise your partner?
    // Nowan anigu proposer ahayn → ANIGU ended the relationship proposer-ka (ring purchaser) → refund sii
    // Nowan anigu proposer ahay → Anigu ended the relationship — Coins will not be refunded
    const iAmProposer = (proposerId === message.author.id);

    // Clear both relationships
    d.relationship = { partnerId: null, partnerUsername: null, ringType: null, since: null, proposerId: null };
    const pd = userData[partnerId];
    if (pd) {
        ensureRel(partnerId);
        pd.relationship = { partnerId: null, partnerUsername: null, ringType: null, since: null, proposerId: null };
    }

    let refundMsg = '';

    if (!iAmProposer && proposerId && ringType && RING_PRICES[ringType]) {
        // Adigu (recipient) ayaad ended the relationship → ring purchaser (proposerId) Coins la celiyaa
        const price  = RING_PRICES[ringType];
        const refund = Math.floor(price / 3);
        if (refund > 0) {
            checkEconUser(proposerId);
            econData[proposerId].coins = (econData[proposerId].coins || 0) + refund;
            saveEcon();
            refundMsg = `\n💰 <@${proposerId}> — 🪙${refund.toLocaleString()} Coins was refunded to you (ring qiimihiisa ÷ 3).`;
        }
    } else {
        refundMsg = `\n_(You ended the relationship — Coins will not be refunded)_`;
    }

    saveData();
    return message.reply(`💔 **${partnerName}** the relationship has ended.${refundMsg}`);
}

module.exports = {
    friendCmd, unfriendCmd, friendsListCmd,
    proposeCmd, partnerCmd, breakupCmd,
    ensureRel, RING_NAMES, RING_PRICES, RING_DISPLAY,
    clearProposalTimer,
};
