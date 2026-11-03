// =====================================================================
// AMARKA: ?top
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData } = require('../../src/store');
const { getLevel, getDisplayTitle, checkUser, getDisplayName } = require('../../src/utils/helpers');

const TOP_N   = 15;
const MEDALS  = ['🥇', '🥈', '🥉'];
const CIRCLES = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];

function cleanTitle(disp) {
    if (!disp || disp === 'start' || disp === 'Beginner') return null;
    return disp;
}

async function buildIqLines(top, client, guild) {
    const lines = await Promise.all(top.map(async ([id, data], i) => {
        const s          = data.stats || {};
        const disp       = cleanTitle(getDisplayTitle(id));
        const titlePart  = disp ? ` ・ ${disp}` : '';
        const lvl        = getLevel(data.iq || 0);
        const soloGames = s.soloPlayed || 0;
        const quizGames = s.quizPlayed || 0;
        const duelGames = (s.duelWins || 0) + (s.duelLosses || 0) + (s.duelDraws || 0);
        const totalGames = soloGames + quizGames + duelGames;
        const medal      = i < 3 ? `${MEDALS[i]} ` : '';

        let name = await getDisplayName(client, guild, id);

        return (
            `${medal}${CIRCLES[i]} **${name}**${titlePart}\n` +
            `┆ 🧠 IQ: **${(data.iq || 0).toLocaleString()}**\n` +
            `┆ ⭐ Level: **${lvl}**\n` +
            `┆ 🎮 Games: **${totalGames}** (Solo ${soloGames} · Quiz ${quizGames} · Duel ${duelGames})\n` +
            `┆ ✅ Guulo: **${s.duelWins || 0}**\n` +
            `┆ ❌ Losses: **${s.duelLosses || 0}** · Draws: **${s.duelDraws || 0}**`
        );
    }));
    return lines.join('\n\n');
}

// ── Generic leaderboard builder ──────────────────────
async function buildTopEmbed(message, title, color, entries, lineBuilder) {
    const top   = entries.slice(0, 10);
    const lines = await Promise.all(top.map(async (e, i) => {
        const medal = i < 3 ? MEDALS[i] : `**${i + 1}.**`;
        let name = await getDisplayName(message.client, message.guild, e[0]);
        return `${medal} ${lineBuilder(e, i, name)}`;
    }));
    const embed = new EmbedBuilder()
        .setTitle(title).setColor(color)
        .setDescription(lines.join('\n\n') || '_No one was not found_')
        .setTimestamp();
    return message.reply({ embeds: [embed] });
}

// ── ?topiq ────────────────────────────────────────────
async function topIqCmd(message) {
    const entries = Object.entries(userData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (userData[id].iq || 0) > 0)
        .sort(([, a], [, b]) => (b.iq || 0) - (a.iq || 0));
    return buildTopEmbed(message, '🧠 Top IQ', '#FFBF00', entries,
        ([id, d], i, name) => `**${name}** — 🧠 **${(d.iq||0).toLocaleString()} IQ** · Lvl ${getLevel(d.iq||0)}`
    );
}

// ── ?topcoins ─────────────────────────────────────────
async function topCoinsCmd(message) {
    const { econData } = require('../../src/economy/econStore');
    const entries = Object.entries(econData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (econData[id].coins || 0) > 0)
        .sort(([, a], [, b]) => (b.coins || 0) - (a.coins || 0));
    return buildTopEmbed(message, '💰 Top Coins', '#f39c12', entries,
        ([id, d], i, name) => `**${name}** — 💰 **🪙${Math.floor(d.coins||0).toLocaleString()}**`
    );
}

// ── ?topmissions ──────────────────────────────────────
async function topMissionsCmd(message) {
    const entries = Object.entries(userData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (userData[id].stats?.missionsCompleted || 0) > 0)
        .sort(([, a], [, b]) => (b.stats?.missionsCompleted||0) - (a.stats?.missionsCompleted||0));
    return buildTopEmbed(message, '📋 Top Missions', '#2ecc71', entries,
        ([id, d], i, name) => `**${name}** — 📋 **${d.stats?.missionsCompleted||0} missions**`
    );
}

// ── ?topstreak ────────────────────────────────────────
async function topStreakCmd(message) {
    const { econData } = require('../../src/economy/econStore');
    const entries = Object.entries(econData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (econData[id].streak || 0) > 0)
        .sort(([, a], [, b]) => (b.streak||0) - (a.streak||0));
    return buildTopEmbed(message, '🔥 Top Streak', '#e74c3c', entries,
        ([id, d], i, name) => `**${name}** — 🔥 **${d.streak||0} days**`
    );
}

// ── ?topflips ─────────────────────────────────────────
async function topFlipsCmd(message) {
    const entries = Object.entries(userData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (userData[id].stats?.flipsPlayed || 0) > 0)
        .sort(([, a], [, b]) => (b.stats?.flipsPlayed||0) - (a.stats?.flipsPlayed||0));
    return buildTopEmbed(message, '🎲 Top Flips', '#9b59b6', entries,
        ([id, d], i, name) => `**${name}** — 🎲 **${d.stats?.flipsPlayed||0} flips**`
    );
}

// ── ?topduels ─────────────────────────────────────────
async function topDuelsCmd(message) {
    const entries = Object.entries(userData)
        .filter(([id]) => /^\d{17,19}$/.test(id) && (userData[id].stats?.duelWins || 0) > 0)
        .sort(([, a], [, b]) => (b.stats?.duelWins||0) - (a.stats?.duelWins||0));
    return buildTopEmbed(message, '⚔️ Top Duels', '#e67e22', entries,
        ([id, d], i, name) => `**${name}** — ⚔️ **${d.stats?.duelWins||0} wins**`
    );
}

module.exports = async function topCommand(message) {
    const userId = message.author.id;
    checkUser(userId);

    const allIq = Object.entries(userData)
        .filter(([id]) => /^\d{17,19}$/.test(id))
        .sort(([, a], [, b]) => (b.iq || 0) - (a.iq || 0));

    const top      = allIq.slice(0, TOP_N);
    const lines    = await buildIqLines(top, message.client, message.guild);
    const userRank = allIq.findIndex(([id]) => id === userId) + 1;
    const inTop    = userRank > 0 && userRank <= TOP_N;

    let userNote = '';
    if (!inTop) {
        const ud  = userData[userId] || {};
        const s   = ud.stats || {};
        const iq  = (ud.iq || 0).toLocaleString();
        const lvl = getLevel(ud.iq || 0);
        userNote  = userRank > 0
            ? `\n\n━━━━━━━━━━━━━━━━━━━━\n📍 **Your rank: #${userRank}** · 🧠 **${iq} IQ** · ⭐ Level **${lvl}** · ✅ **${s.duelWins || 0}** guul`
            : `\n\n━━━━━━━━━━━━━━━━━━━━\n📍 Wali IQ points kudo not have`;
    }

    const description = (lines || '_No one IQ points ma leh_') + userNote;

    const embed = new EmbedBuilder()
        .setTitle('🏆 TOP 15 — IQ RANKING')
        .setDescription(description)
        .setColor('#FFBF00')
        .setFooter({ text: '🧠 Garaad IQ System' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_top_${userId}`)
            .setLabel('Iska close')
            .setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [embed], components: [row] });
};

module.exports.topIqCmd       = topIqCmd;
module.exports.topCoinsCmd    = topCoinsCmd;
module.exports.topMissionsCmd = topMissionsCmd;
module.exports.topStreakCmd    = topStreakCmd;
module.exports.topFlipsCmd    = topFlipsCmd;
module.exports.topDuelsCmd    = topDuelsCmd;
