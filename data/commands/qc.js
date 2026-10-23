// =====================================================================
// AMARKA: ?qc [category]  /  ?quiz category [category]
// • ?qc           → liiska qaybaha + tirada su'aalaha
// • ?qc juqraafi  → 10 su'aalood oo filtered ah (solo-style, per-user seen)
// =====================================================================

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ComponentType,
} = require('discord.js');

const path = require('path');
const fs   = require('fs');
const { userData, saveData, activeGames } = require('../../src/store');
const { checkUser, shuffleArray }         = require('../../src/utils/helpers');
const { markSeenForGame }                 = require('../../src/utils/questions');
const { PREFIX, GLOBAL_WAIT_MS }          = require('../../src/config');

// ── Su'aalaha dhammaan 4 file-ka ku jira (cached once) ──────────────
const ALL_GAMES = ['solo', 'quiz', 'duel', 'team'];
let _allPool = null;

function getAllPool() {
    if (_allPool) return _allPool;
    _allPool = [];
    for (const g of ALL_GAMES) {
        try {
            const file = path.join(__dirname, '..', '..', 'data', 'questions', `${g}.json`);
            const qs   = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const q of qs) _allPool.push({ ...q, _srcGame: g });
        } catch {
            // ignore missing files
        }
    }
    return _allPool;
}

// ── Qaybaha la taageero ──────────────────────────────────────────────
const CATEGORIES = {
    juqraafi:   { label: '🌍 Juqraafi',    desc: 'Wadamada, magaalooyinka, gobollada' },
    diinta:     { label: '☪️ Diinta',       desc: 'Surah-yada, nabiyada, sahaabada, Islaamka' },
    taariikhda: { label: '📜 Taariikhda',   desc: 'Taariikhda adduunka iyo Soomaalida' },
    sayniska:   { label: '🔬 Sayniska',     desc: 'Cilmiga, xiddigaha, chemistry, biology' },
    ciyaaraha:  { label: '⚽ Ciyaaraha',    desc: 'Kubadda cagta, olombikada, xiddigaha' },
    luqadda:    { label: '📖 Luqadda',      desc: 'Af-Soomaali, Af-Ingiriis, vocabulary' },
};

function getCatKey(raw) {
    const r = (raw || '').toLowerCase().trim();
    if (CATEGORIES[r]) return r;
    for (const k of Object.keys(CATEGORIES)) {
        if (k.startsWith(r) || r.startsWith(k.slice(0, 3))) return k;
    }
    if (['geo','geography','land'].includes(r))   return 'juqraafi';
    if (['diin','islam','religion'].includes(r))  return 'diinta';
    if (['history','taariikh'].includes(r))       return 'taariikhda';
    if (['science','sayn'].includes(r))           return 'sayniska';
    if (['sport','sports','ciyaar'].includes(r))  return 'ciyaaraha';
    if (['language','luqad','vocab'].includes(r)) return 'luqadda';
    return null;
}

// ── Tirada su'aalaha qaybta kasta ────────────────────────────────────
function getCatCounts() {
    const pool   = getAllPool();
    const counts = {};
    for (const k of Object.keys(CATEGORIES)) counts[k] = 0;
    for (const q of pool) {
        const c = (q.category || '').toLowerCase();
        if (counts[c] !== undefined) counts[c]++;
    }
    return counts;
}

// ── Liiska qaybaha ──────────────────────────────────────────────────
function showCategoryList(message) {
    const counts = getCatCounts();
    const total  = Object.values(counts).reduce((a, b) => a + b, 0);

    const lines = Object.entries(CATEGORIES).map(([k, { label, desc }]) =>
        `${label} — **${(counts[k] || 0).toLocaleString()}** su'aalood\n*${desc}*\n\`${PREFIX}qc ${k}\``
    );

    const embed = new EmbedBuilder()
        .setTitle('📂 Qaybaha Su\'aalaha')
        .setDescription(
            `**${total.toLocaleString()}** su'aalood oo dhan ayaa la heli karaa.\n` +
            `Isticmaal \`${PREFIX}qc <qaybta>\` si aad u bilowdo.\n\n` +
            lines.join('\n\n')
        )
        .setColor(0x00b0f4)
        .setFooter({ text: `Tusaale: ${PREFIX}qc diinta` });

    return message.reply({ embeds: [embed] });
}

// ── Run a category quiz session (10 questions) ───────────────────────
async function runCatQuiz(message, catKey) {
    const userId = message.author.id;
    checkUser(userId);

    if (activeGames.has(userId)) {
        return message.reply('⚠️ Ciyaar baa socda. Dhamee ka hor aad cusub bilowdo.');
    }

    const pool  = getAllPool();
    const catQ  = pool.filter(q => (q.category || '').toLowerCase() === catKey);
    const seen  = userData[userId].seenByGame || {};
    const seenInSrc = {};
    for (const g of ALL_GAMES) seenInSrc[g] = seen[g] || {};

    const unseen = catQ.filter(q => !(q.id in (seenInSrc[q._srcGame] || {})));
    const pool10 = (unseen.length >= 10 ? unseen : catQ);

    if (pool10.length === 0) {
        return message.reply(`⚠️ Qaybta **${CATEGORIES[catKey]?.label || catKey}** su'aalo kuma jirto.`);
    }

    const questions = shuffleArray(pool10).slice(0, 10);
    const { label } = CATEGORIES[catKey];

    const embed0 = new EmbedBuilder()
        .setTitle(`${label} — 10 Su'aalood`)
        .setDescription(`Waxaad heleysaa **10 su'aalood** oo ku saabsan **${label}**.\nCiyaartu waxay bilaabaneysaa! ⬇️`)
        .setColor(0x00b0f4);

    await message.reply({ embeds: [embed0] });

    activeGames.set(userId, { type: 'qc', catKey, score: 0, idx: 0, questions });
    await askCatQuestion(message, userId, questions, 0, 0);
}

// ── Ask one question ─────────────────────────────────────────────────
async function askCatQuestion(message, userId, questions, idx, score) {
    const q = questions[idx];
    if (!q) return finishCatQuiz(message, userId, score, questions.length);

    const opts = q.options || [];
    // FIX: embed isCorrect (t/f) in button customId — never compare A/B/C/D to correct text
    const buttons = opts.map((opt, i) => {
        const isCorrect = opt === q.correct;
        return new ButtonBuilder()
            .setCustomId(`qc_${idx}_${i}_${isCorrect ? 't' : 'f'}`)
            .setLabel(String(opt).slice(0, 80))
            .setStyle(ButtonStyle.Primary);
    });

    const correctLabel = q.correct;
    const desc = opts.map((o, i) => `**${i + 1}.** ${o}`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`❓ Su'aal ${idx + 1} / ${questions.length}`)
        .setDescription(`**${q.question}**\n\n${desc}`)
        .setColor(0xfee75c)
        .setFooter({ text: `⏱ ${GLOBAL_WAIT_MS / 1000}s | Dhibcaha: ${score}` });

    const row = new ActionRowBuilder().addComponents(buttons);
    const sent = await message.channel.send({ embeds: [embed], components: [row] });

    const startMs = Date.now();
    const filter  = i => i.user.id === userId && i.customId.startsWith(`qc_${idx}_`);

    let collector;
    try {
        collector = sent.createMessageComponentCollector({
            filter,
            componentType: ComponentType.Button,
            time: GLOBAL_WAIT_MS,
        });
    } catch {
        activeGames.delete(userId);
        return;
    }

    let answered = false;

    collector.on('collect', async interaction => {
        if (answered) return;
        answered = true;
        collector.stop();

        // FIX: read isCorrect from customId suffix (t/f), not by comparing to correct text
        const isRight = interaction.customId.endsWith('_t');

        // Mark seen in source game
        if (q._srcGame && q.id !== undefined) {
            markSeenForGame(userId, q._srcGame, q.id);
        }

        const newScore = score + (isRight ? 1 : 0);
        activeGames.set(userId, { type: 'qc', score: newScore, idx: idx + 1, questions });

        const resultEmbed = new EmbedBuilder()
            .setColor(isRight ? 0x57f287 : 0xed4245)
            .setDescription(isRight
                ? `✅ **Saxsax!** — ${correctLabel}`
                : `❌ **Khalad!** Jawaabta saxda: **${correctLabel}**`
            );

        await interaction.update({ embeds: [resultEmbed], components: [] }).catch(() => {});

        setTimeout(() => {
            if (!activeGames.has(userId)) return;
            askCatQuestion(message, userId, questions, idx + 1, newScore);
        }, 1200);
    });

    collector.on('end', async (_, reason) => {
        if (answered) return;
        // Timeout
        if (!activeGames.has(userId)) return;

        if (q._srcGame && q.id !== undefined) {
            markSeenForGame(userId, q._srcGame, q.id);
        }

        const toEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(`⏱ **Waqtigii dhacay!** Jawaabta saxda: **${correctLabel}**`);
        await sent.edit({ embeds: [toEmbed], components: [] }).catch(() => {});

        activeGames.set(userId, { type: 'qc', score, idx: idx + 1, questions });

        setTimeout(() => {
            if (!activeGames.has(userId)) return;
            askCatQuestion(message, userId, questions, idx + 1, score);
        }, 1500);
    });
}

// ── Dhammaadka ───────────────────────────────────────────────────────
async function finishCatQuiz(message, userId, score, total) {
    activeGames.delete(userId);

    const pct   = Math.round((score / total) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '😓';

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} Ciyaarta Waa Dhammaysay!`)
        .setDescription(
            `Dhibcahaaga: **${score} / ${total}** (${pct}%)\n\n` +
            (pct >= 80 ? '🌟 Aad baad u wanaagsan tahay!' :
             pct >= 50 ? '👍 Waa hagaag, sii wad dhaqanka.' :
             '📚 Barasho dheeraad ah ayaa loo baahan yahay.')
        )
        .setColor(pct >= 80 ? 0x57f287 : pct >= 50 ? 0xfee75c : 0xed4245)
        .setFooter({ text: `${PREFIX}qc — Bilow qaybta kale` });

    await message.channel.send({ embeds: [embed] });
    saveData();
}

// ── Entry point ──────────────────────────────────────────────────────
function invalidatePoolCache() {
    _allPool = null;
}

async function qcCommand(message, args) {
    try {
        const catRaw = args.join(' ').trim();
        if (!catRaw) return showCategoryList(message);

        const catKey = getCatKey(catRaw);
        if (!catKey) {
            return message.reply(
                `❓ Qaybta **"${catRaw}"** lama garanin.\n` +
                `Isticmaal \`${PREFIX}qc\` si aad u aragto liiska.\n` +
                `**Qaybaha:** ${Object.keys(CATEGORIES).join(', ')}`
            );
        }

        return runCatQuiz(message, catKey);
    } catch (err) {
        console.error('[qcCmd]', err);
        return message.reply('❌ Khalad ayaa dhacay. Isku day mar kale.').catch(() => {});
    }
};

qcCommand.invalidatePoolCache = invalidatePoolCache;
module.exports = qcCommand;
