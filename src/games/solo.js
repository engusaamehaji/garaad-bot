// =====================================================================
// CIYAARTA SOLO — Garaad Quiz
// Dhibco: ku xidhan xawliga (5s = max 40, 18s = min 5)
// Streak: jawaabo sax oo isku xigta → bonus dhibcood
// Dhammaadka: IQ leaderboard + goobta aad ku jirtid
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData, activeGames } = require('../store');
const { checkUser, getLevel, stripQuestionNumber } = require('../utils/helpers');
const { econData, checkEconUser, saveEcon } = require('../economy/econStore');

const { markSeenForGame, resetSeenSoloQuestions, pickQuestionsForGame } = require('../utils/questions');
const { markUserPlayed } = require('../utils/reminders');
const {
    GLOBAL_WAIT_MS,
    SOLO_FAST_MS,
    SOLO_MAX_SCORE,
    SOLO_MIN_SCORE,
    SOLO_DEFAULT_QUESTIONS,
    STREAK_BONUS_2,
    STREAK_BONUS_5,
    STREAK_BONUS_10,
} = require('../config');
const { getAnswerOptions } = require('../utils/questionOptions');
const { createRewardSession, rewardRow, rewardSummary, POINTS_PER_REWARD, IQ_PER_REWARD, BTC_PER_REWARD } = require('../utils/gameRewards');
const {
    saveSoloState,
    loadSoloState,
    loadAllSoloStates,
    deleteSoloState,
} = require('../utils/gamePersist');

function persistSolo(userId) {
    const game = activeGames.get(userId);
    if (!game) return;
    saveSoloState(userId, game).catch(() => {});
}

// ── Xisaabi dhibcaha ku xidhan xawliga ──────────────────────────────
// < 5s   → max 40 dhibcood
// 18s    → min 5 dhibcood
// dhexda → linear
function calcTimedScore(timeTakenMs) {
    if (timeTakenMs <= SOLO_FAST_MS) return SOLO_MAX_SCORE;
    const ratio = (timeTakenMs - SOLO_FAST_MS) / (GLOBAL_WAIT_MS - SOLO_FAST_MS);
    return Math.max(SOLO_MIN_SCORE, Math.round(SOLO_MAX_SCORE - (SOLO_MAX_SCORE - SOLO_MIN_SCORE) * ratio));
}

// ── Streak bonus ─────────────────────────────────────────────────────
function getStreakBonus(streak) {
    if (streak >= 10) return STREAK_BONUS_10;
    if (streak >= 5)  return STREAK_BONUS_5;
    if (streak >= 2)  return STREAK_BONUS_2;
    return 0;
}

// ── IQ Leaderboard (ka dib game) ─────────────────────────────────────
function buildLeaderboardEmbed(userId, totalPoints, questionsCount) {
    const allUsers = Object.entries(userData)
        .filter(([, d]) => typeof d.iq === 'number')
        .map(([id, d]) => ({ id, iq: d.iq || 0 }))
        .sort((a, b) => b.iq - a.iq);

    const myIq  = userData[userId]?.iq || 0;
    const rank  = allUsers.findIndex(u => u.id === userId) + 1;
    const total = allUsers.length;

    const top10 = allUsers.slice(0, 10).map((u, i) => {
        const medal  = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const isMe   = u.id === userId ? ' ← **Adiga**' : '';
        return `${medal} <@${u.id}> — **${u.iq} IQ**${isMe}`;
    }).join('\n');

    let rankLine = '';
    if (rank > 10) {
        rankLine = `\n\n📍 **Goobtagaadu waa:** #${rank} / ${total} — **${myIq} IQ**`;
    }

    return new EmbedBuilder()
        .setTitle('🏆 IQ Leaderboard — Tartanka Guud')
        .setDescription(
            `**10-ka ugu IQ-da sarreeya:**\n\n${top10 || '_Ma jiraan ciyaaryahanno_'}${rankLine}`
        )
        .setColor('#f39c12')
        .setFooter({ text: `?top — liis buuxa · ?profile — xaaladda kuu gaar ah` });
}

// ── Dhibcaha yabooh muuji ─────────────────────────────────────────────
function pointsDisplay(pts, bonus, streak) {
    let line = `🕐 **+${pts}** dhibcood`;
    if (bonus > 0) {
        line += ` + **+${bonus}** streak bonus (${streak}🔥)`;
    }
    return line;
}

// ── Su'aal dir ────────────────────────────────────────────────────────
async function sendQuestion(messageOrInteraction, qNumber, currentMsg = null) {
    const isInteraction = !!(messageOrInteraction.isButton && messageOrInteraction.isButton());
    const userId        = isInteraction ? messageOrInteraction.user.id : messageOrInteraction.author.id;
    const game          = activeGames.get(userId);
    const total         = game ? game.total : SOLO_DEFAULT_QUESTIONS;

    if (!game || qNumber > total) {
        const originMsg = game?.originMsg ?? null;
        activeGames.delete(userId);
        deleteSoloState(userId).catch(() => {}); // clean up DB
        checkUser(userId);
        markUserPlayed(userId);

        const d          = userData[userId];
        const totalPts   = game ? (game.totalPoints || 0) : 0;
        const streak     = game ? (game.bestStreak  || 0) : 0;
        const correct    = game ? (game.correctCount || 0) : 0;
        const wrong      = total - correct;
        // Xukun: wanaagsan 90+, fiican 80-89, hoos 80
        let gradeText = '';
        const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        if (pct >= 90)      gradeText = '🌟 **Aad u fiican!** (90%+) — Tayada su\'aalaha waa hagaag!';
        else if (pct >= 80) gradeText = '✨ **Wanaagsan!** (80%+) — IQ aad u heeshay!';
        else                gradeText = `📈 **${pct}%** — IQ luma, wax ka baadi.`;

        const finishEmbed = new EmbedBuilder()
            .setTitle('🏁 Ciyaarta Waa Dhamaaday!')
            .setDescription(
                `### 📊 Natiijadaada — <@${userId}>\n\n` +
                `✅ Sax: **${correct}** | ❌ Qalad: **${wrong}** | Su'aalo: **${total}** (${pct}%)\n` +
                `🔥 Streak ugu dheer: **${streak}** sax oo isku xigta\n` +
                `${gradeText}\n\n` +
                `🧠 IQ hadda: **${d.iq || 0}** | Heer **${getLevel(d.iq || 0)}**`
            )
            .setColor(pct >= 90 ? '#f39c12' : pct >= 80 ? '#2ecc71' : '#e74c3c');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`solo_replay_${userId}`)
                .setLabel('🎮 Ciyaar mar kale')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`close_solo_${userId}`)
                .setLabel('Iska xir')
                .setStyle(ButtonStyle.Danger),
        );
        if (currentMsg) await currentMsg.delete().catch(() => {});
        const fc = messageOrInteraction.channel;
        const finishReply = originMsg ? { reply: { messageReference: originMsg.id, failIfNotExists: false } } : {};
        if (fc) {
            await fc.send({ embeds: [finishEmbed], components: [row], ...finishReply });
        } else {
            await messageOrInteraction.reply({ embeds: [finishEmbed], components: [row] });
        }

        return;
    }

    const q = game.questions[qNumber - 1];
    game.currentQ = qNumber;
    // Persist: if bot restarts while this question is showing, resume here
    persistSolo(userId);

    markSeenForGame(userId, 'solo', q._idx);
    saveData();

    const entries = getAnswerOptions(q);
    if (entries.length === 0) {
        activeGames.delete(userId);
        deleteSoloState(userId).catch(() => {});
        return messageOrInteraction.reply?.({ content: '⚠️ Su\'aal aan la fahmin (faylka su\'aalahooda).' });
    }

    // Streak iyo score muuji
    const streak     = game.currentStreak || 0;
    const streakLine = streak >= 2 ? `🔥 Streak: **${streak}** — bonus **+${getStreakBonus(streak)}**` : '';

    const isTF = (q.type || '').toLowerCase() === 'tf' ||
                 (q.type || '').toLowerCase() === 'truefalse' ||
                 (q.type || '').toLowerCase() === 'bool';

    const scoreHint = isTF
        ? `⏱️ 18s — **5 → 40 dhibcood** (Run / Been)`
        : `⏱️ 18s — **< 5s = 40pts · 18s = 5pts**`;

    const embed = new EmbedBuilder()
        .setTitle(`📊 Su'aal ${qNumber}/${total}`)
        .setDescription(
            `## ${stripQuestionNumber(q.question)}\n\n` +
            `${scoreHint}\n` +
            (streakLine ? `${streakLine}\n` : '') +
            `🏆 Dhibco hadda: **${game.totalPoints || 0}** pts`
        )
        .setColor(streak >= 5 ? '#e67e22' : streak >= 2 ? '#f39c12' : '#0099ff');

    const buttons = entries.map((e, index) =>
        new ButtonBuilder()
            .setCustomId(`q_${qNumber}_${index}_${userId}_${e.isCorrect}`)
            .setLabel(e.label.slice(0, 80))
            .setStyle(ButtonStyle.Primary),
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const channel  = messageOrInteraction.channel;
    const replyOpt = game?.originMsg ? { reply: { messageReference: game.originMsg.id, failIfNotExists: false } } : {};

    let activeMsg;
    if (currentMsg) {
        activeMsg = await currentMsg.edit({ embeds: [embed], components: [row] });
    } else {
        activeMsg = await messageOrInteraction.reply({ embeds: [embed], components: [row], fetchReply: true });
    }

    const filter = i => i.user.id === userId;
    const collector = activeMsg.createMessageComponentCollector({ filter, time: GLOBAL_WAIT_MS, max: 1 });

    collector.on('end', (collected) => {
        if (collected.size !== 0) return;
        // Guard: if the player already answered this question via an old button (on-demand restore path),
        // game.currentQ will have advanced — skip this timeout to avoid double-processing
        const g = activeGames.get(userId);
        if (!g || g.currentQ !== qNumber) return;

        checkUser(userId);
        g.currentStreak = 0;
        userData[userId].stats.soloWrong++;
        userData[userId].iq = Math.max(0, (userData[userId].iq || 0) - 1);
        saveData();
        // Advance before next question so guard works
        g.currentQ = qNumber + 1;
        persistSolo(userId);

        const timeoutEmbed = EmbedBuilder.from(embed)
            .setFields({ name: 'Natiijo', value: '⏰ Wakhti dhammaaday — **−1 IQ** · Streak: 0' });
        activeMsg.delete().catch(() => {});
        channel.send({ embeds: [timeoutEmbed], ...replyOpt })
            .then(nm => setTimeout(() => sendQuestion(messageOrInteraction, qNumber + 1, nm), 2000))
            .catch(() => setTimeout(() => sendQuestion(messageOrInteraction, qNumber + 1, null), 2000));
    });
}

// ── Jawaabta handle ─────────────────────────────────────────────────
async function handleSoloAnswer(interaction) {
    const parts   = interaction.customId.split('_');
    const qNum    = parseInt(parts[1]);
    const ownerId = parts[3];
    const result  = parts[4];

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: 'Ciyaartaada qoro!', flags: 64 });
    }

    checkUser(ownerId);
    let game = activeGames.get(ownerId);

    if (!game) {
        // On-demand restore from DB (fallback when startup restore didn't run or failed)
        const saved = await loadSoloState(ownerId);
        if (!saved || Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) {
            return interaction.reply({
                content: '⚠️ Ciyaartii waa dhacday — bot restart ayaa dhacay. Bilow mar kale: `?solo`',
                flags: 64,
            }).catch(() => {});
        }
        game = {
            questions:     saved.questions     || [],
            total:         saved.total         || 0,
            currentQ:      saved.currentQ      || 1,
            totalPoints:   saved.totalPoints   || 0,
            correctCount:  saved.correctCount  || 0,
            bestStreak:    saved.bestStreak    || 0,
            currentStreak: saved.currentStreak || 0,
            channelId:     saved.channelId,
            originMsg:     null,
        };
        activeGames.set(ownerId, game);
    }

    // Guard: reject stale buttons (old question after restart or double-click)
    if (qNum !== game.currentQ) {
        return interaction.reply({
            content: '⚠️ Su\'aal hore ayaad riixday — raadi su\'aasha cusub.',
            flags: 64,
        }).catch(() => {});
    }

    await interaction.deferUpdate();
    const timeTaken = Date.now() - (interaction.message.createdTimestamp || Date.now());
    let   msg       = '';

    // ── BTC reward yar su'aal kasta (waqtiga la galiyay awgeed) ──
    const BTC_PER_QUESTION = 10;
    checkEconUser(ownerId);
    econData[ownerId].btc = (econData[ownerId].btc || 0) + BTC_PER_QUESTION;
    saveEcon();

    if (result === 'true') {
        // ── Sax: +1 IQ toos ah ──
        const pts      = calcTimedScore(Math.min(timeTaken, GLOBAL_WAIT_MS));
        const streak   = (game.currentStreak || 0) + 1;
        const bonus    = getStreakBonus(streak);
        const totalPts = pts + bonus;

        game.currentStreak = streak;
        game.bestStreak    = Math.max(game.bestStreak || 0, streak);
        game.totalPoints   = (game.totalPoints || 0) + totalPts;
        game.correctCount  = (game.correctCount || 0) + 1;

        userData[ownerId].stats.soloCorrect++;
        userData[ownerId].iq = (userData[ownerId].iq || 0) + 1;
        msg = `✅ **SAX!** +1 IQ\n⏱️ ${(timeTaken/1000).toFixed(1)}s | 💰 **+${BTC_PER_QUESTION} BTC**`;
    } else {
        // ── Qalad: 2 qalad = -1 IQ ──
        game.currentStreak = 0;
        game.wrongCount    = (game.wrongCount || 0) + 1;
        userData[ownerId].stats.soloWrong++;

        let iqMsg = '';
        if (game.wrongCount % 2 === 0) {
            userData[ownerId].iq = Math.max(0, (userData[ownerId].iq || 0) - 1);
            iqMsg = '**−1 IQ**';
        } else {
            iqMsg = `_1/2 qalad — ${2 - (game.wrongCount % 2)} kale 1 IQ kaa jari doona_`;
        }
        msg = `❌ **QALAD** — ${iqMsg} | 💰 **+${BTC_PER_QUESTION} BTC** (waqti awgeed)`;
    }

    userData[ownerId].stats.soloPlayed++;
    saveData();

    // Advance currentQ before next sendQuestion so the timeout guard works correctly
    game.currentQ = qNum + 1;
    persistSolo(ownerId);

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields({ name: 'Natiijo', value: msg });

    const channel   = interaction.channel;
    const originMsg = game?.originMsg;
    const replyOpt  = originMsg ? { reply: { messageReference: originMsg.id, failIfNotExists: false } } : {};
    await interaction.message.delete().catch(() => {});
    const resultMsg = await channel.send({ embeds: [updatedEmbed], ...replyOpt }).catch(() => null);

    setTimeout(() => sendQuestion(interaction, qNum + 1, resultMsg), 1800);
}

// ── Leaderboard button handler ────────────────────────────────────────
async function handleSoloLeaderboard(interaction) {
    const ownerId = interaction.customId.replace('solo_leaderboard_', '');
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: 64 });
    }
    const lbEmbed = buildLeaderboardEmbed(ownerId, 0, 0);
    return interaction.reply({ embeds: [lbEmbed], flags: 64 });
}

// ── Startup restore: reload all saved solo games and resend current question ──
async function restoreSoloGames(client) {
    const docs = await loadAllSoloStates().catch(() => []);
    if (!docs.length) return;

    let restored = 0;
    for (const doc of docs) {
        // Skip stale games (>24h)
        if (Date.now() - doc.savedAt > 24 * 60 * 60 * 1000) {
            deleteSoloState(doc.userId).catch(() => {});
            continue;
        }
        if (activeGames.has(doc.userId)) continue;
        if (!doc.channelId || !doc.questions?.length) {
            deleteSoloState(doc.userId).catch(() => {});
            continue;
        }

        const game = {
            questions:     doc.questions     || [],
            total:         doc.total         || 0,
            currentQ:      doc.currentQ      || 1,
            totalPoints:   doc.totalPoints   || 0,
            correctCount:  doc.correctCount  || 0,
            bestStreak:    doc.bestStreak    || 0,
            currentStreak: doc.currentStreak || 0,
            channelId:     doc.channelId,
            originMsg:     null,
        };
        activeGames.set(doc.userId, game);

        const channel = await client.channels.fetch(doc.channelId).catch(() => null);
        if (!channel) {
            activeGames.delete(doc.userId);
            continue;
        }

        // Fake message object so sendQuestion can use channel.send
        const fakeMsg = {
            channel,
            author:   { id: doc.userId },
            isButton: () => false,
            reply:    async (opts) => channel.send(opts),
        };

        await sendQuestion(fakeMsg, game.currentQ).catch(e => {
            console.error(`[Solo Restore] Failed for ${doc.userId}:`, e.message);
            activeGames.delete(doc.userId);
        });
        restored++;
        console.log(`[Solo] ✅ Restored game for user ${doc.userId} at Q${game.currentQ}/${game.total}`);
    }
    if (restored > 0) console.log(`[Solo] ✅ ${restored} solo game(s) restored from database`);
}

// ── "Ciyaar mar kale" → muuji doorashada tirada su'aalaha ─────────────
async function handleSoloReplay(interaction) {
    const userId = interaction.customId.replace('solo_replay_', '');
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'Ciyaartaada qoro!', flags: 64 });
    }
    const busy = require('../store').isUserBusy(userId);
    if (busy) {
        return interaction.reply({ content: `⚠️ Waxaad ku jirtaa ciyaar **${busy}**!`, flags: 64 });
    }

    // Muuji 4 baadhan oo tirada su'aalaha ah
    const countRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`solo_replaycount_10_${userId}`)
            .setLabel('10 Su\'aalood')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`solo_replaycount_15_${userId}`)
            .setLabel('15 Su\'aalood')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`solo_replaycount_20_${userId}`)
            .setLabel('20 Su\'aalood')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`solo_replaycount_25_${userId}`)
            .setLabel('25 Su\'aalood')
            .setStyle(ButtonStyle.Primary),
    );

    return interaction.reply({
        content: `🎮 **Imisa su'aalood ayaad rabtaa?** Dooro hoos:`,
        components: [countRow],
        flags: 64,
    });
}

// ── Qofku doortay tirada su'aalaha → bilow ciyaarta ───────────────────
async function handleSoloReplayCount(interaction) {
    // customId: solo_replaycount_<count>_<userId>
    const parts  = interaction.customId.split('_');
    // parts: ['solo','replaycount','<count>','<userId>']
    const count  = parseInt(parts[2]);
    const userId = parts[3];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'Ciyaartaada qoro!', flags: 64 });
    }
    const busy = require('../store').isUserBusy(userId);
    if (busy) {
        return interaction.reply({ content: `⚠️ Waxaad ku jirtaa ciyaar **${busy}**!`, flags: 64 });
    }

    resetSeenSoloQuestions(userId);
    const picked = pickQuestionsForGame(userId, 'solo', count);
    if (!picked || picked.length === 0) {
        return interaction.reply({
            content: '⚠️ Su\'aalo ma jiraan — sug admin inuu ku daro.',
            flags: 64,
        });
    }

    const { activeGames } = require('../store');
    activeGames.set(userId, {
        questions: picked,
        total: picked.length,
        originMsg: null,
        channelId: interaction.channel.id,
    });

    // Tirtir baadhanada doorashada
    await interaction.update({ content: `✅ **${count} su'aalood** la doortay — bilaabaysa! 🎯`, components: [] }).catch(() => {});
    await interaction.followUp({
        content: `🔄 **Dib-u-ciyaar** bilaabatay — **${picked.length}** su'aalood. IQ ma heli doontid, BTC kaliya! 💰`,
    }).catch(() => {});

    const fakeMsg = {
        channel: interaction.channel,
        author:  { id: userId },
        isButton: () => false,
        reply:   async (opts) => interaction.channel.send(opts),
    };
    sendQuestion(fakeMsg, 1);
}

module.exports = { sendQuestion, handleSoloAnswer, handleSoloLeaderboard, handleSoloReplay, handleSoloReplayCount, restoreSoloGames };
