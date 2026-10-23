// =====================================================================
// CIID (EID) COMMAND — send Eid greeting + image to channel or DM all
// =====================================================================

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { userData }  = require('../../../src/store');
const { econData }  = require('../../../src/economy/econStore');
const path = require('path');
const fs   = require('fs');

const EID_IMG_PATH = path.join(__dirname, '..', '..', 'images', 'eid.png');

const EID_DESC =
    `🌙 Ciiddaan ha idiin noqoto mid ay ka buuxaan farxad, nabad, iyo waqtiyo qurux badan ` +
    `oo aad la qaadataan qoyska iyo asxaabta. Waxaan idiin rajeynaynaa guul iyo barako aan ` +
    `dhammaad lahayn. ✨\n\n` +
    `🎮 Dhamaan players-ka **Garaad Bot** Discord Game, mahadsanidiin taageeradiinna iyo ` +
    `ciyaartiinna joogtada ah. Ciid wanaagsan, ciyaarta sii wada, kuna raaxaysta madadaalada ` +
    `iyo tartanka saaxiibbadiin. 🏆\n\n` +
    `**Garaad Bot Community • Ciid Mubaarak Dhamaan Players-ka**`;

function hasImage() {
    return fs.existsSync(EID_IMG_PATH);
}

function buildEidEmbed(withAttachment = false) {
    const embed = new EmbedBuilder()
        .setTitle('🌙 Ciid Wanaagsan — Eid Mubarak! 🌙')
        .setColor('#1a7a4a')
        .setDescription(EID_DESC)
        .setFooter({ text: 'Garaad Bot Community • Ciid Mubaarak Dhamaan Players-ka' });
    if (withAttachment) embed.setImage('attachment://eid.png');
    return embed;
}

function buildEidPayload() {
    const useImg = hasImage();
    const payload = { embeds: [buildEidEmbed(useImg)] };
    if (useImg) payload.files = [new AttachmentBuilder(EID_IMG_PATH, { name: 'eid.png' })];
    return payload;
}

// Channel payload includes @everyone ping
function buildChannelPayload() {
    const useImg = hasImage();
    const payload = { content: '@everyone', embeds: [buildEidEmbed(useImg)] };
    if (useImg) payload.files = [new AttachmentBuilder(EID_IMG_PATH, { name: 'eid.png' })];
    return payload;
}

// Send to current channel (for ?ciid command)
async function sendEidToChannel(message) {
    return message.channel.send(buildChannelPayload());
}

// DM every guild member (including admin/owner), sequential with delay
// guild param: interaction.guild — most complete source of users in the server
async function dmAllPlayersEid(client, guild) {
    // Primary: all non-bot guild members
    let userIds = [];
    if (guild) {
        try {
            const members = await guild.members.fetch();
            userIds = [...members.filter(m => !m.user.bot).keys()];
        } catch {
            // fallback to databases if guild fetch fails
        }
    }
    // Fallback / supplement: database users not in guild list
    if (userIds.length === 0) {
        const econIds = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k));
        userIds = [...new Set([...Object.keys(userData), ...econIds])];
    }

    const imgBuf = hasImage() ? fs.readFileSync(EID_IMG_PATH) : null;
    let success = 0, failed = 0;

    for (const uid of userIds) {
        try {
            const user = await client.users.fetch(uid).catch(() => null);
            if (!user || user.bot) { failed++; continue; }

            const payload = { embeds: [buildEidEmbed(!!imgBuf)] };
            if (imgBuf) payload.files = [new AttachmentBuilder(imgBuf, { name: 'eid.png' })];

            await user.send(payload);
            success++;
        } catch {
            failed++;
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return { success, failed, total: userIds.length };
}

module.exports = { sendEidToChannel, dmAllPlayersEid, buildEidEmbed, buildEidPayload, buildChannelPayload, EID_IMG_PATH };
