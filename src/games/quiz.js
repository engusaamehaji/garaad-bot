// =====================================================================
// CIYAARTA QUIZ KOOX — Garaad Quiz (v2 — Time-Based Scoring)
// • ?quiz [tiro] → Lobby → Dadku waa ku biiraan → Host bilaabaa
// • Su'aal kasta: DHAMMAAN ciyaartoydu way jawaabi karaan
// • Dhibco: ku xidhan xawliga — < 5s = 40pts | 18s = 5pts
// • Dhammaadka: Leaderboard + badal IQ ama XP
// =====================================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { userData, saveData, activeQuiz, activeTournament, isUserBusy } = require('../store');

const { checkUser, stripQuestionNumber }                                 = require('../utils/helpers');
const { canHostQuiz, bumpHostQuiz }                                      = require('../utils/hostQuota');
const {
    pickQuestionsForGame,
    pickQuestionsForUsers,
    markSeenForUsersInGame,
    noQuestionsLeftEmbed,
    resetSeenQuizQuestions,
    clearReplayFlag,
} = require('../utils/questions');
const { checkEconUser, econData, saveEcon } = require('../economy/econStore');
const { markUserPlayed }   = require('../utils/reminders');
const { getAnswerOptions } = require('../utils/questionOptions');
const { createRewardSession, rewardRow, rewardSummary, POINTS_PER_REWARD, IQ_PER_REWARD, BTC_PER_REWARD } = require('../utils/gameRewards');
const {
    PREFIX,
    QUIZ_MIN_PLAYERS, QUIZ_MAX_PLAYERS,
    QUIZ_MIN_QUESTIONS, QUIZ_MAX_QUESTIONS, QUIZ_QUESTION_COUNT,
    QUIZ_LOBBY_MS, GLOBAL_WAIT_MS, SOLO_FAST_MS,
    SOLO_MAX_SCORE, SOLO_MIN_SCORE,
    HOST_DAILY_LIMIT,
    QUIZ_POINTS_TO_XP, QUIZ_POINTS_PER_IQ, QUIZ_REPLAY_BTC_PER_IQ,
} = require('../config');
const { saveQuizState, loadAllQuizStates, deleteQuizState } = require('../utils/gamePersist');

function persistQuiz(state) {
    saveQuizState(state.channelId, state).catch(() => {});
}

// ── Dhibco ku xidhan xawliga (sida solo + tartan) ────────────────────
// < 5s   → 40 dhibcood (max)
// 18s    → 5 dhibcood (min)
// dhexda → linear
function calcTimedScore(timeTakenMs) {
    if (timeTakenMs <= SOLO_FAST_MS) return SOLO_MAX_SCORE;
    const ratio = (timeTakenMs - SOLO_FAST_MS) / (GLOBAL_WAIT_MS - SOLO_FAST_MS);
    return Math.max(SOLO_MIN_SCORE, Math.round(SOLO_MAX_SCORE - (SOLO_MAX_SCORE - SOLO_MIN_SCORE) * ratio));
}

// ─────────────────────────────────────────────────────────────────────
// ?quiz — Bilow Lobby
// ─────────────────────────────────────────────────────────────────────
async function startQuizLobby(message, args) {
    const userId    = message.author.id;
    const channelId = message.channel.id;

    if (activeQuiz.has(channelId)) {
        return message.reply('⚠️ Channel-kan mar hore ayaa quiz koox uu ka socda. Sug ilaa uu dhamaado.');
    }
    if (activeTournament.has(channelId)) {
        return message.reply('⚠️ Channel-kan tartan ayaa ka socda. Sug ilaa uu dhamaado.');
    }
    const busy = isUserBusy(userId);
    if (busy) {
        return message.reply(`⚠️ Waxaad mar hore ku jirtaa ciyaar **${busy}**! Sug ilaa ay dhammaato.`);
    }
    if (!canHostQuiz(userId)) {
        return message.reply(`⚠️ Maalintan waad gaartay xadka **${HOST_DAILY_LIMIT}** ciyaar oo martigeli karto. Sug berri.`);
    }

    // Hel tirada su'aalaha
    let questionCount = 0;
    if (args[0] !== undefined) {
        questionCount = parseInt(args[0]);
        if (isNaN(questionCount) || questionCount < QUIZ_MIN_QUESTIONS || questionCount > QUIZ_MAX_QUESTIONS) {
            return message.reply(
                `⚠️ Tirada su'aalaha waa inay u dhexeyso **${QUIZ_MIN_QUESTIONS}** iyo **${QUIZ_MAX_QUESTIONS}**.\n` +
                `Tusaale: \`${PREFIX}quiz 10\``
            );
        }
    } else {
        await message.reply(
            `📊 **${message.author.username}**, imisa su'aalood ayaad rabtaa Quiz koox?\n` +
            `Qor lambar **${QUIZ_MIN_QUESTIONS}** ilaa **${QUIZ_MAX_QUESTIONS}** (tusaale: \`10\` ama \`20\`).\n` +
            `_(30 ilbiriqsi ayaad heysataa)_`
        );
        const filter    = m => m.author.id === userId && /^\d+$/.test(m.content.trim());
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
        if (collected.size === 0) {
            return message.channel.send(`⏰ <@${userId}>, wakhti dhammaaday — \`${PREFIX}quiz\` mar kale isku day.`);
        }
        questionCount = parseInt(collected.first().content.trim());
        if (questionCount < QUIZ_MIN_QUESTIONS || questionCount > QUIZ_MAX_QUESTIONS) {
            return collected.first().reply(
                `⚠️ Tirada waa inay u dhexeyso **${QUIZ_MIN_QUESTIONS}** iyo **${QUIZ_MAX_QUESTIONS}**.\n` +
                `\`${PREFIX}quiz\` mar kale isku day.`
            );
        }
    }

    // Hubi su'aalo cusub — haddii dhammaadeen, dib u bilow (replay)
    let available = pickQuestionsForGame(userId, 'quiz', questionCount);
    if (!available || available.length === 0) {
        resetSeenQuizQuestions(userId);
        await message.reply(
            `🔄 **${message.author.username}**, dhammaan su'aalaha quiz waad arkey — si toos ah ayaa dib loo bilaabay!\n` +
            `⚠️ **Xasuusnow:** Ciyaarkan cusub **IQ laguma siin doono** — waxaad heshaa **BTC yar** halkii IQ.\n` +
            `💰 Top 3: **${QUIZ_REPLAY_BTC_PER_IQ} BTC** halkii 90 dhibcood.`
        );
        available = pickQuestionsForGame(userId, 'quiz', questionCount);
        if (!available || available.length === 0) {
            return message.reply({ embeds: [noQuestionsLeftEmbed(message.author.username)] });
        }
    } else {
        clearReplayFlag(userId, 'quizReplaying');
    }
    if (available.length < questionCount) {
        await message.reply(
            `📚 **${message.author.username}**, waxaa kuu hadhay **${available.length}** su'aalood cusub kaliya (adigoo codsaday ${questionCount}).\n` +
            `Quiz-ku wuxuu noqonayaa **${available.length}** su'aalood.`
        );
        questionCount = available.length;
    }

    const state = {
        hostId:        userId,
        channelId,
        questionCount,
        players:       new Set([userId]),
        scores:        { [userId]: 0 },
        started:       false,
        questions:     null,
        currentQ:      0,
        message:       null,
        lobbyTimer:    null,
        originMsg:     message,
    };
    activeQuiz.set(channelId, state);

    const lobbyMsg = await message.reply({
        embeds:     [buildLobbyEmbed(state)],
        components: [buildLobbyButtons(state)],
        fetchReply: true,
    });
    state.message = lobbyMsg;

    state.lobbyTimer = setTimeout(async () => {
        const cur = activeQuiz.get(channelId);
        if (!cur || cur.started) return;
        activeQuiz.delete(channelId);
        await lobbyMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle('⌛ Lobby waqti dhammaaday')
                .setDescription('Quiz lobby ayaa joojiyay — waqtigii ayaa dhammaaday inta lagu sugayo ciyaartoyda.')
                .setColor('#7f8c8d')],
            components: [],
        }).catch(() => {});
    }, QUIZ_LOBBY_MS);
}

// ─────────────────────────────────────────────────────────────────────
// Lobby UI
// ─────────────────────────────────────────────────────────────────────
function buildLobbyEmbed(state) {
    const playersText = [...state.players].map((id, i) => `${i + 1}. <@${id}>`).join('\n') || '—';
    return new EmbedBuilder()
        .setTitle('👥 Quiz Koox — Lobby')
        .setDescription(
            `**Host:** <@${state.hostId}>\n` +
            `**Su'aalo:** ${state.questionCount}\n` +
            `**Ciyaartoy:** ${state.players.size} _(ugu yaraan ${QUIZ_MIN_PLAYERS} si la bilaabo)_\n\n` +
            `Riix **Ku biir** si aad u gasho.\n` +
            `Marka **${QUIZ_MIN_PLAYERS}** la gaaro, **hostku kaliya** ayaa riixi kara **Bilaw**.\n\n` +
            `**Ciyaartoyda:**\n${playersText}\n\n` +
            `⚡ Dhibco: **< 5s = 40pts · 18s = 5pts** (ku xidhan xawliga)\n` +
            `Dhammaan ciyaartoydu waxay jawaabi karaan — kii ugu dhakhsaha badan helaa!\n\n` +
            `⏳ Lobby wuxuu joogsan doonaa 3 daqiiqo haddii aan la bilaabin.`
        )
        .setColor('#3498db');
}

function buildLobbyButtons(state) {
    const canStart = state.players.size >= QUIZ_MIN_PLAYERS;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quiz_join_${state.channelId}`)
            .setLabel('Ku biir ✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`quiz_leave_${state.channelId}`)
            .setLabel('Ka bax')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`quiz_start_${state.channelId}`)
            .setLabel('Bilaw 🚀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!canStart),
    );
}

async function refreshLobby(state) {
    if (!state.message) return;
    await state.message.edit({
        embeds:     [buildLobbyEmbed(state)],
        components: [buildLobbyButtons(state)],
    }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────
// Bilow Ciyaarta
// ─────────────────────────────────────────────────────────────────────
async function beginQuizGame(state) {
    if (state.started) return;
    state.started = true;
    if (state.lobbyTimer) clearTimeout(state.lobbyTimer);

    bumpHostQuiz(state.hostId);
    saveData();

    let totalQ  = state.questionCount || QUIZ_QUESTION_COUNT;
    let picked = pickQuestionsForUsers([...state.players], 'quiz', totalQ);
    if (!picked || picked.length === 0) {
        for (const pid of state.players) resetSeenQuizQuestions(pid);
        picked = pickQuestionsForUsers([...state.players], 'quiz', totalQ);
        if (!picked || picked.length === 0) {
            activeQuiz.delete(state.channelId);
            if (state.message) {
                await state.message.edit({ embeds: [noQuestionsLeftEmbed('Dhammaan ciyaartoyda')], components: [] }).catch(() => {});
            }
            return;
        }
        state.quizReplaying = true;
    }
    if (picked.length < totalQ) {
        totalQ = picked.length;
        state.questionCount = totalQ;
    }
    state.questions = picked;
    state.currentQ  = 0;

    for (const pid of state.players) markUserPlayed(pid);

    const channel = state.message?.channel;
    if (!channel) { activeQuiz.delete(state.channelId); return; }

    await channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('🚀 Quiz Koox — Wuu Bilaabmay!')
            .setDescription(
                `**Hostka:** <@${state.hostId}>\n` +
                `**Ciyaartoy:** ${state.players.size}\n` +
                `**Su'aalo:** ${totalQ}\n` +
                `**Wakhti:** ${GLOBAL_WAIT_MS / 1000} ilbiriqsi mid kasta\n\n` +
                `⚡ **Dhibco:** Kii ugu dhakhsaha sax ah badan helaa!\n` +
                `◾ < 5s → **40 pts** (max)\n` +
                `◾ 18s  → **5 pts** (min)\n` +
                `◾ Khalad ama waa dhaafay → **0 pts**`
            )
            .setColor('#9b59b6')],
    });

    setTimeout(() => sendQuizQuestion(state), 3000);
}

// ─────────────────────────────────────────────────────────────────────
// Su'aal kasta — dadka oo dhan way jawaabi karaan, dhibco = xawliga
// ─────────────────────────────────────────────────────────────────────
async function sendQuizQuestion(state) {
    if (!activeQuiz.has(state.channelId)) return;
    const totalQ = state.questionCount || QUIZ_QUESTION_COUNT;
    if (state.currentQ >= totalQ) return finishQuiz(state);
    // Persist before sending so bot restart can resume from this question
    persistQuiz(state);

    const channel = state.message?.channel;
    if (!channel) { activeQuiz.delete(state.channelId); return; }

    const q         = state.questions[state.currentQ];
    const playerIds = [...state.players];
    markSeenForUsersInGame(playerIds, 'quiz', q._idx);
    saveData();

    const qEntries = getAnswerOptions(q);
    if (qEntries.length === 0) {
        state.currentQ++;
        setTimeout(() => sendQuizQuestion(state), 500);
        return;
    }

    const correctLabel    = qEntries.find(e => e.isCorrect)?.label ?? String(q.correct);
    const questionStartMs = Date.now();

    const answeredBy = new Set();
    const correctMap = {};

    const embed = new EmbedBuilder()
        .setTitle(`👥 Quiz Koox — Su'aal ${state.currentQ + 1}/${totalQ}`)
        .setDescription(
            `## ${stripQuestionNumber(q.question)}\n\n` +
            `⏱️ **${GLOBAL_WAIT_MS / 1000}s** — Dhammaan waxay jawaabi karaan!\n` +
            `⚡ Kii ugu dhakhsaha sax ah badan helaa dhibco.\n` +
            `Ciyaartoy: **${state.players.size}**`
        )
        .setColor('#9b59b6');

    const buttons = qEntries.map((e, i) =>
        new ButtonBuilder()
            .setCustomId(`quiz_a_${state.channelId}_${state.currentQ}_${i}_${e.isCorrect ? 't' : 'f'}`)
            .setLabel(e.label.slice(0, 80))
            .setStyle(ButtonStyle.Primary),
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const qIndex = state.currentQ;

    const qOpt = state.originMsg ? { reply: { messageReference: state.originMsg.id, failIfNotExists: false } } : {};
    const activeMsg = await channel.send({ embeds: [embed], components: [row], ...qOpt }).catch(() => null);
    if (!activeMsg) { activeQuiz.delete(state.channelId); return; }

    const filter = i =>
        i.customId.startsWith(`quiz_a_${state.channelId}_${qIndex}_`) &&
        state.players.has(i.user.id);

    const collector = activeMsg.createMessageComponentCollector({ filter, time: GLOBAL_WAIT_MS });

    collector.on('collect', async interaction => {
        const uid = interaction.user.id;
        if (answeredBy.has(uid)) {
            return interaction.reply({ content: '⚠️ Mar hore ayaad jawaab bixisay!', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        answeredBy.add(uid);

        const isCorrect   = interaction.customId.endsWith('_t');
        const timeTakenMs = Date.now() - questionStartMs;

        if (isCorrect) {
            const pts = calcTimedScore(timeTakenMs);
            state.scores[uid] = (state.scores[uid] || 0) + pts;
            correctMap[uid]   = { pts, timeTakenMs };
            const secs = (timeTakenMs / 1000).toFixed(1);
            checkUser(uid);
            userData[uid].iq = (userData[uid].iq || 0) + 1;
            userData[uid].wrongStreak = 0;
            saveData();
            await interaction.reply({ content: `✅ **Sax!** +**${pts}** dhibcood · **+1 IQ** · ⏱️ ${secs}s`, flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            checkUser(uid);
            userData[uid].wrongStreak = (userData[uid].wrongStreak || 0) + 1;
            let iqMsg = '';
            if (userData[uid].wrongStreak % 2 === 0) {
                userData[uid].iq = Math.max(0, (userData[uid].iq || 0) - 1);
                iqMsg = '**−1 IQ**';
            } else {
                iqMsg = '_1/2 qalad_';
            }
            saveData();
            await interaction.reply({ content: `❌ **Khalad.** Jawaabta sax ma ahayn · ${iqMsg} · 0 dhibcood`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (answeredBy.size >= state.players.size) collector.stop('all_answered');
    });

    collector.on('end', async () => {
        const timedOut = [...state.players].filter(id => !answeredBy.has(id));
        for (const id of timedOut) {
            checkUser(id);
            userData[id].wrongStreak = (userData[id].wrongStreak || 0) + 1;
            if (userData[id].wrongStreak % 2 === 0) {
                userData[id].iq = Math.max(0, (userData[id].iq || 0) - 1);
            }
        }
        if (timedOut.length > 0) saveData();

        const correctEntries = Object.entries(correctMap)
            .sort(([, a], [, b]) => b.pts - a.pts || a.timeTakenMs - b.timeTakenMs);

        let resultLines = '';
        if (correctEntries.length === 0) {
            resultLines = `⏰ Cidna si sax ah uma jawaabin.`;
        } else {
            resultLines = correctEntries.slice(0, 5).map(([id, { pts, timeTakenMs }], i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
                const secs  = (timeTakenMs / 1000).toFixed(1);
                return `${medal} <@${id}> — **+${pts}** pts · ${secs}s`;
            }).join('\n');
        }

        const timeoutLine = timedOut.length > 0
            ? `\n⏰ **Timeout −1 IQ:** ${timedOut.map(id => `<@${id}>`).join(', ')}`
            : '';

        const leaderboard = Object.entries(state.scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([id, sc], i) => `${i + 1}. <@${id}> — **${sc}** pts`)
            .join('\n') || '—';

        const sumEmbed = new EmbedBuilder()
            .setTitle(`👥 Quiz Koox — Su'aal ${qIndex + 1}/${totalQ}`)
            .setDescription(
                `## ${stripQuestionNumber(q.question)}\n\n` +
                `📌 Jawaabta saxda ah: **${correctLabel}**\n\n` +
                `**Su'aashaas natiijadeeda:**\n${resultLines}${timeoutLine}\n\n` +
                `📊 **Dhibcaha guud (top 5):**\n${leaderboard}`
            )
            .setColor(correctEntries.length > 0 ? '#2ecc71' : '#e74c3c');

        await activeMsg.delete().catch(() => {});
        const rOpt = state.originMsg ? { reply: { messageReference: state.originMsg.id, failIfNotExists: false } } : {};
        await channel.send({ embeds: [sumEmbed], ...rOpt }).catch(() => {});

        state.currentQ++;
        setTimeout(() => sendQuizQuestion(state), 2500);
    });
}

// ─────────────────────────────────────────────────────────────────────
// Dhammaadka — Leaderboard + IQ/XP exchange
// ─────────────────────────────────────────────────────────────────────
async function finishQuiz(state) {
    activeQuiz.delete(state.channelId);
    deleteQuizState(state.channelId).catch(() => {});
    const channel = state.message?.channel;
    if (!channel) return;

    const sorted      = Object.entries(state.scores).sort(([, a], [, b]) => b - a);
    const playerCount = state.players.size;

    const isReplay = !!state.quizReplaying;

    sorted.forEach(([id, sc], i) => {
        checkUser(id);
        userData[id].stats.quizPlayed++;
        if (sc > 0) {
        }
        if (i === 0 && sc > 0) userData[id].stats.quizWins++;
        const replaying = isReplay || userData[id].quizReplaying;
        if (replaying) userData[id].quizReplaying = false;
    });
    saveData();

    const medalMap = ['🥇', '🥈', '🥉'];
    const rewardSessionId = createRewardSession('Quiz', Object.fromEntries(sorted.map(([id, sc]) => [id, sc])));
    const top3Lines = sorted.slice(0, Math.min(3, sorted.length)).map(([id, sc], i) => {
        return `${medalMap[i]} <@${id}> — **${rewardSummary(sc)}**`;
    }).join('\n') || '—';

    const restLines = sorted.slice(3).map(([id, sc], i) =>
        `${i + 4}. <@${id}> — **${sc}** pts`
    ).join('\n');

    const winner = sorted[0];
    const winnerLine = winner && winner[1] > 0
        ? `🏆 **Guuleystaha:** <@${winner[0]}> — ${winner[1]} pts`
        : `🤝 Ciyaartoydu dhibco la'aan ah ayay ku dhammaysteen.`;

    const embed = new EmbedBuilder()
        .setTitle('🏁 Quiz Koox — Dhamaaday!')
        .setColor('#f1c40f')
        .setDescription(
            `${winnerLine}\n\n` +
            `**Hostka:** <@${state.hostId}> · **Ciyaartoy:** ${playerCount}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `**🏆 Top 3 — Abaalmarinta:**\n${top3Lines}\n` +
            (restLines ? `\n**Kale:**\n${restLines}\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🎁 Doorasho: **IQ** ama **BTC**\n` +
            `**${POINTS_PER_REWARD} dhibcood = ${IQ_PER_REWARD} IQ ama ${BTC_PER_REWARD} BTC**`
        )
        .setFooter({ text: `Garaad Quiz • ${PREFIX}profile — arag dhibcahaaga` });

    const exchRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_quiz_${state.hostId}`)
            .setLabel('❌ Iska xir')
            .setStyle(ButtonStyle.Danger),
    );

    const fOpt = state.originMsg ? { reply: { messageReference: state.originMsg.id, failIfNotExists: false } } : {};
    await channel.send({ embeds: [embed], components: [rewardRow(rewardSessionId), exchRow], ...fOpt });
}

// ── Startup restore: reload all saved quiz games and resend current question ──
async function restoreQuizGames(client) {
    const docs = await loadAllQuizStates().catch(() => []);
    if (!docs.length) return;

    let restored = 0;
    for (const doc of docs) {
        // Skip stale games (>6h — quiz games are short-lived)
        if (Date.now() - doc.savedAt > 6 * 60 * 60 * 1000) {
            deleteQuizState(doc.channelId).catch(() => {});
            continue;
        }
        if (activeQuiz.has(doc.channelId)) continue;
        if (!doc.channelId || !doc.questions?.length) {
            deleteQuizState(doc.channelId).catch(() => {});
            continue;
        }

        const channel = await client.channels.fetch(doc.channelId).catch(() => null);
        if (!channel) {
            deleteQuizState(doc.channelId).catch(() => {});
            continue;
        }

        const state = {
            hostId:        doc.hostId,
            channelId:     doc.channelId,
            questionCount: doc.questionCount,
            players:       new Set(doc.players || []),
            scores:        doc.scores          || {},
            questions:     doc.questions        || [],
            currentQ:      doc.currentQ         || 0,
            started:       true,
            message:       { channel },
            lobbyTimer:    null,
            originMsg:     null,
        };
        activeQuiz.set(doc.channelId, state);

        await sendQuizQuestion(state).catch(e => {
            console.error(`[Quiz Restore] Failed for channel ${doc.channelId}:`, e.message);
            activeQuiz.delete(doc.channelId);
        });
        restored++;
        console.log(`[Quiz] ✅ Restored quiz in channel ${doc.channelId} at Q${doc.currentQ}`);
    }
    if (restored > 0) console.log(`[Quiz] ✅ ${restored} quiz game(s) restored from database`);
}

module.exports = { startQuizLobby, refreshLobby, beginQuizGame, buildLobbyButtons, buildLobbyEmbed, restoreQuizGames };
