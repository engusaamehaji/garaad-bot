// =====================================================================
// AMARKA: ?q [@user]   — Player Progress Panel
// Muujiya: IQ, rank, su'aalaha la arkay game kasta, stats guud
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { userData }     = require('../../src/store');
const { checkUser }    = require('../../src/utils/helpers');
const { PREFIX }       = require('../../src/config');

const GAME_LABELS = {
    solo:       '🟡 Solo',
    duel:       '⚔️ Duel',
    quiz:       '📚 Quiz/Team',
    team:       '🤝 Team',
    tournament: '🏆 Tournament',
    rush:       '⚡ Rush',
};

function seenCount(userId, game) {
    checkUser(userId);
    const sb = userData[userId].seenByGame || {};
    return Object.keys(sb[game] || {}).length;
}

function progressBar(pct, len = 12) {
    const filled = Math.round((pct / 100) * len);
    return '`' + '█'.repeat(filled) + '░'.repeat(len - filled) + '`';
}

function getIQRank(userId) {
    const entries = Object.entries(userData)
        .filter(([k, v]) => /^\d{17,19}$/.test(k) && typeof v.iq === 'number')
        .sort(([, a], [, b]) => (b.iq || 0) - (a.iq || 0));
    const idx = entries.findIndex(([uid]) => uid === userId);
    return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
}

module.exports = async function qCommand(message) {
    try {
        const target = message.mentions.users.first() || message.author;
        checkUser(target.id);

        const d     = userData[target.id];
        const stats = d.stats || {};
        const { rank, total } = getIQRank(target.id);

        // ── Seen questions per game ──
        const seenLines = Object.entries(GAME_LABELS).map(([game, label]) => {
            const cnt = seenCount(target.id, game);
            return `${label}: **${cnt}** su'aalood`;
        }).join('\n');

        // ── Solo stats ──
        const soloPlayed  = stats.soloPlayed  || 0;
        const soloCorrect = stats.soloCorrect || 0;
        const soloWrong   = stats.soloWrong   || 0;
        const soloPct     = soloPlayed > 0 ? Math.round((soloCorrect / (soloCorrect + soloWrong)) * 100) : 0;

        // ── Duel stats ──
        const dWins   = stats.duelWins   || 0;
        const dLosses = stats.duelLosses || 0;
        const dDraws  = stats.duelDraws  || 0;
        const dTotal  = dWins + dLosses + dDraws;
        const dWinPct = dTotal > 0 ? Math.round((dWins / dTotal) * 100) : 0;

        // ── Quiz/Team stats ──
        const qWins   = stats.quizWins   || 0;
        const qPlayed = stats.quizPlayed || 0;

        // ── IQ & level ──
        const iq    = d.iq || 0;
        const level = Math.floor(iq / 100) + 1;
        const iqPct = ((iq % 100) / 100) * 100;
        const bar   = progressBar(iqPct);

        // ── Current streak (if any) ──
        const streak = d.streak || d.currentStreak || 0;

        const rankStr = rank ? `#${rank} / ${total}` : 'N/A';

        const embed = new EmbedBuilder()
            .setTitle(`📊 Horumarka — ${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .setColor(0x5865F2)
            .addFields(
                {
                    name: '🧠 IQ & Heer',
                    value: `**IQ:** ${iq} | **Heer:** ${level} | **Rank:** ${rankStr}\n${bar} ${iqPct.toFixed(0)}%`,
                    inline: false,
                },
                {
                    name: '👁 Su\'aalaha La Arkay (Game kasta)',
                    value: seenLines,
                    inline: false,
                },
                {
                    name: '🟡 Solo Stats',
                    value: `Ciyaaray: **${soloPlayed}** | ✅ **${soloCorrect}** sax | ❌ **${soloWrong}** khalad\nSaxnaan: **${soloPct}%**`,
                    inline: true,
                },
                {
                    name: '⚔️ Duel Stats',
                    value: `🏆 **${dWins}** guul | 💀 **${dLosses}** quus | 🤝 **${dDraws}** siman\nWin Rate: **${dWinPct}%**`,
                    inline: true,
                },
                {
                    name: '📚 Quiz/Team Stats',
                    value: `Ciyaaray: **${qPlayed}** | Guulaystay: **${qWins}**`,
                    inline: true,
                },
            )
            .setFooter({ text: streak > 0 ? `🔥 Streak hadda: ${streak}` : `${PREFIX}q @user — Eeg ciyaaryahankaas` });

        if (streak > 1) {
            embed.addFields({ name: '🔥 Streak', value: `**${streak}** jawaab oo isku xigta!`, inline: false });
        }

        return message.reply({ embeds: [embed] });
    } catch (err) {
        console.error('[qCmd]', err);
        return message.reply('❌ Khalad ayaa dhacay. Isku day mar kale.').catch(() => {});
    }
};
