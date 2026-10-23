const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, getTreasury } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

const OWNER_ID = '1191096205955055690';

function buildAdminEmbed(uid) {
    const users = Object.entries(econData).filter(([k]) => /^\d{17,19}$/.test(k));
    const t     = getTreasury();
    let totalBtc = 0;
    for (const [, d] of users) {
        totalBtc += d.btc || 0;
    }
    const isOwner = uid === OWNER_ID;
    return new EmbedBuilder()
        .setTitle('⚙️ Admin Panel')
        .setColor('#8e44ad')
        .setDescription(
            `**🏛️ Treasury:** ${fmt(t.balance)} BTC\n` +
            `**👥 Players:** ${users.length} | **₿ Circulation:** ${fmt(totalBtc)} BTC\n\n` +
            `**Actions:**\n` +
            `🎁 Give User  •  🧠 Give IQ  •  ₿ Give All BTC  •  🏆 Champion\n` +
            `💬 DM  •  💸 Transfer  •  👥 Players\n` +
            `📢 Broadcast  •  🐛 Bugs` +
            (isOwner ? `\n🏛️ Top-up  •  👥 Admin  •  ♻️ Reset` : '') +
            `\n\n**🏦 Bank Commands (text):**\n` +
            `\`?adminbank pw @user\` — Personal bank password reset\n` +
            `\`?adminbank view @user\` — User bank info eeg\n` +
            `\`?adminbank tax <ID> <%>\` — Macaamiisha tax qaado\n` +
            `\`?adminbank close <ID>\` — Bank xir + lacag celi`
        )
        .setFooter({ text: 'Garaad Admin' });
}

// Row 1: Give | Give IQ | Champion
function adminRow1(uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_give_${uid}`)        .setLabel('🎁 Give User')   .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_giveall_iq_${uid}`)  .setLabel('🧠 Give IQ')     .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_giveall_btc_${uid}`) .setLabel('₿ Give All BTC') .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin_aq_champion_${uid}`) .setLabel('🏆 Champion')    .setStyle(ButtonStyle.Success),
    );
}

// Row 2: DM | Transfer | Players
function adminRow2(uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_aq_dm_${uid}`)          .setLabel('💬 DM')       .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin_transfer_${uid}`)       .setLabel('💸 Transfer') .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_eco_allplayers_${uid}`) .setLabel('👥 Players')  .setStyle(ButtonStyle.Secondary),
    );
}

// Row 3: Broadcast | Bugs
function adminRow3(uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_broadcast_${uid}`) .setLabel('📢 Broadcast') .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_bugs_${uid}`)      .setLabel('🐛 Bugs')      .setStyle(ButtonStyle.Secondary),
    );
}

// Row 4 (owner only): Top-up | Add Admin | Reset
function adminRow4(uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_eco_topup_${uid}`).setLabel('🏛️ Top-up') .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_addadmin_${uid}`) .setLabel('👥 Admin')  .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_reset_${uid}`)    .setLabel('♻️ Reset')  .setStyle(ButtonStyle.Danger),
    );
}

// Row 5: Close
function adminRow5(uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_admin_help_${uid}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );
}

function getRows(uid) {
    return uid === OWNER_ID
        ? [adminRow1(uid), adminRow2(uid), adminRow3(uid), adminRow4(uid), adminRow5(uid)]
        : [adminRow1(uid), adminRow2(uid), adminRow3(uid), adminRow5(uid)];
}

module.exports = async function adminHelpPanel(message) {
    const uid = message.author.id;
    return message.reply({ embeds: [buildAdminEmbed(uid)], components: getRows(uid) });
};

module.exports.buildAdminEmbed      = buildAdminEmbed;
module.exports.getRows              = getRows;
module.exports.adminRow1            = adminRow1;
module.exports.adminRow2            = adminRow2;
module.exports.adminRow3            = adminRow3;
module.exports.adminRow4            = adminRow4;
module.exports.adminRow5            = adminRow5;
// Legacy exports
module.exports.buildAdminAqoonEmbed = buildAdminEmbed;
module.exports.adminAqoonMainRow    = adminRow1;
module.exports.adminAqoonMidRow     = adminRow2;
module.exports.adminAqoonFooterRow  = adminRow3;
