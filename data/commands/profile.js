// =====================================================================
// AMARKA: ?profile [@user]
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData } = require('../../src/store');
const { econData, checkEconUser } = require('../../src/economy/econStore');
const { ECON_TITLES } = require('./economy/econShop');
const { checkUser, getLevel, checkAndAwardBadges } = require('../../src/utils/helpers');
const { getTier, getTierProgress } = require('../../src/utils/ranks');
const { FRAMES, BADGES } = require('../../src/utils/itemDefs');
const { LEVEL_STEP } = require('../../src/config');

function getIQRank(userId) {
    const entries = Object.entries(userData).filter(([k, v]) => /^\d{17,19}$/.test(k) && typeof v.iq === 'number');
    entries.sort(([, a], [, b]) => (b.iq || 0) - (a.iq || 0));
    const idx = entries.findIndex(([uid]) => uid === userId);
    return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
}

function progressBar(pct, len = 10) {
    const filled = Math.round((pct / 100) * len);
    return '█'.repeat(filled) + '░'.repeat(len - filled);
}

module.exports = async function profileCommand(message) {
    try {
    const target = message.mentions.users.first() || message.author;
    checkUser(target.id);
    checkEconUser(target.id);
    checkAndAwardBadges(target.id);

    // Get display name: server nickname > globalName > username
    let targetMember = null;
    try { targetMember = await message.guild?.members.fetch(target.id); } catch {}
    const displayName = targetMember?.nickname || target.globalName || target.displayName || target.username;

    const data = userData[target.id];
    const econ = econData[target.id] || {};

    const level     = getLevel(data.iq);
    const { rank, total } = getIQRank(target.id);
    const { tier, pct, needed } = getTierProgress(data.iq);
    const currentLevelIq = (data.iq || 0) % LEVEL_STEP;
    const nextLevelNeed  = LEVEL_STEP - currentLevelIq;
    const levelPct       = Math.floor((currentLevelIq / LEVEL_STEP) * 100);

    // Active frame
    const frameKey = data.activeFrame;
    const frame    = frameKey && FRAMES[frameKey] ? FRAMES[frameKey] : null;
    const frameTxt = frame ? `${frame.emoji} **${frame.name}** (${frame.rarity})` : '*None*';

    // Economy title
    let econTitle = '';
    if (econ.activeEconTitle === 'custom' && econ.customEconTitle) {
        econTitle = econ.customEconTitle;
    } else if (econ.activeEconTitle && ECON_TITLES[econ.activeEconTitle]) {
        econTitle = ECON_TITLES[econ.activeEconTitle].label;
    }
    const titlePart = econTitle ? ` / ${econTitle}` : '';

    // Badges (show first 8)
    const badgeList = (data.badges || []).slice(0, 8).map(k => {
        const b = BADGES[k];
        return b ? b.emoji : '🏅';
    });
    const badgeStr = badgeList.length ? badgeList.join(' ') : '*Wali ma gasho*';

    // Stats
    const s = data.stats || {};
    const totalGames = (s.soloPlayed || 0) + (s.duelWins || 0) + (s.duelLosses || 0) + (s.duelDraws || 0) + (s.quizPlayed || 0);

    // Active boosters
    const now = Date.now();
    const bo  = data.boosters || {};
    const boostLines = [];
    if (bo.doubleIq  > now) boostLines.push(`🧠 Double IQ (${Math.ceil((bo.doubleIq  - now) / 60000)}m)`);
    if (bo.doubleXp  > now) boostLines.push(`⭐ Double XP (${Math.ceil((bo.doubleXp  - now) / 60000)}m)`);
    if (bo.doubleBtc > now) boostLines.push(`₿ Double BTC (${Math.ceil((bo.doubleBtc - now) / 60000)}m)`);
    if (bo.iqShields > 0)  boostLines.push(`🛡️ IQ Shield ×${bo.iqShields}`);

    const tierColor = tier.color || '#9b59b6';



    // Bank only (no company)
    const { getPersonalBank, getAllPublicBanks } = require('../../src/economy/bankStore');
    const myBank    = getPersonalBank(econData, target.id);
    const ownedBank = Object.values(getAllPublicBanks()).find(b => b.ownerId === target.id);
    const bankTxt   = ownedBank ? `🏛️ **${ownedBank.name}** (Owner)` : myBank ? `🏦 Account: \`${myBank.bankId}\`` : '*None*';

    // Relationship
    const { RING_NAMES } = require('./relationship');
    const rel = data.relationship || {};
    let relTxt = '💕 **Partner:** None';
    if (rel.partnerId) {
        let pName = rel.partnerUsername || `<@${rel.partnerId}>`;
        try { const pu = await message.client.users.fetch(rel.partnerId); pName = pu.username; } catch {}
        const days    = rel.since ? Math.floor((Date.now() - rel.since) / 86400000) : 0;
        const ringTxt = RING_NAMES[rel.ringType] || '💍 Ring';
        relTxt = `💕 **Partner:** ${pName} ❤️ ${displayName} · 📅 ${days} Days · ${ringTxt}`;
    }

    const desc =
        `# 👤 ${displayName}${titlePart}\n` +
        `\n` +
        `${tier.emoji} **${tier.name} Tier**  •  🧠 **IQ:** ${data.iq}  •  📈 **Level:** ${level}\n` +
        `\`${progressBar(levelPct)}\` ${levelPct}%  *(${currentLevelIq}/${LEVEL_STEP} → Lvl ${level + 1})*\n` +
        `\n` +
        `🏆 **Rank:** #${rank ?? '—'} / ${total}\n` +
        `💰 **BTC:** ₿${(econ.btc || 0).toLocaleString()}\n` +
        `🎮 **Games:** ${totalGames}\n` +
        `⚔️ **Duel Wins:** ${s.duelWins || 0}\n` +
        `🎲 **Flips:** ${s.flipsPlayed || 0}\n` +
        `📋 **Missions:** ${s.missionsCompleted || 0}\n` +
        `🔥 **Streak:** ${econ.streak || 0} days\n` +
        `\n` +
        `${relTxt}\n` +
        `\n` +
        `🏦 **Bank:** ${bankTxt}\n` +
        `🏅 **Badges:** ${badgeStr}` +
        (boostLines.length ? `\n⚡ **Boosters:** ${boostLines.join(' • ')}` : '');

    const embed = new EmbedBuilder()
        .setDescription(desc)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setColor(tierColor);

    const viewerId = message.author.id;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_profile_${viewerId}`)
            .setLabel('✖ Xir')
            .setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error('[Profile] Error:', e.message);
        return message.reply('⚠️ Profile soo bandhigi kari waayay. Dib isku day.').catch(() => {});
    }
};
