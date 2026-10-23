const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon, resetWeeklyEarnings } = require('../economy/econStore');
const { userData }     = require('../store');
const { getLevel, getDisplayTitle, checkUser, getDisplayName } = require('../utils/helpers');

const CHANNEL_IDS      = ['1504517873673048185', '1510701592708517898'];
const WEEK_MS          = 7 * 24 * 60 * 60 * 1000;
const FIRST_TICK_MS    = 30 * 1000;
const PRIZE_ECO_BTC    = 2_000;  // Top weekly earner
const PRIZE_IQ_BTC     = 1_500;  // Top IQ winner
const PRIZE_RICH_BTC   = 1_500;  // Top rich (highest BTC balance)

const MEDALS = ['🥇', '🥈', '🥉'];

function getCurrentWeekKey() {
    const d    = new Date();
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
}

async function buildEcoLines(client) {
    const week = getCurrentWeekKey();
    const entries = Object.entries(econData)
        .filter(([k]) => /^\d{17,19}$/.test(k))
        .map(([uid, d]) => ({
            uid,
            earned: (d.weeklyEarned?.week === week ? (d.weeklyEarned.btc || d.weeklyEarned.usd || 0) : 0),
        }))
        .filter(e => e.earned > 0)
        .sort((a, b) => b.earned - a.earned)
        .slice(0, 10);

    const lines = await Promise.all(entries.map(async ({ uid, earned }, i) => {
        const name = await getDisplayName(client, null, uid);
        const medal = MEDALS[i] || `**${i + 1}.**`;
        return `${medal} **${name}** — ₿ ${earned.toLocaleString()} BTC earned`;
    }));

    return { lines, winner: entries[0] || null };
}

async function buildIqLines(client) {
    const sorted = Object.entries(userData)
        .filter(([, d]) => (d.iq || 0) > 0)
        .sort(([, a], [, b]) => (b.iq || 0) - (a.iq || 0))
        .slice(0, 10);

    const lines = await Promise.all(sorted.map(async ([uid, d], i) => {
        const name = await getDisplayName(client, null, uid);
        checkUser(uid);
        const title = getDisplayTitle(uid);
        const titlePart = (title && title !== 'Bilow') ? ` [${title}]` : '';
        const lvl   = getLevel(d.iq || 0);
        const medal = MEDALS[i] || `**${i + 1}.**`;
        return `${medal} **${name}**${titlePart} — 🧠 ${(d.iq || 0).toLocaleString()} IQ · Lvl ${lvl}`;
    }));

    return { lines, winner: sorted[0] ? { uid: sorted[0][0], iq: sorted[0][1].iq || 0 } : null };
}

async function buildRichLines(client) {
    const sorted = Object.entries(econData)
        .filter(([k]) => /^\d{17,19}$/.test(k))
        .map(([uid, d]) => ({ uid, btc: (d.btc || 0) + Object.values(d.banks || {}).reduce((s, v) => s + (v || 0), 0) }))
        .filter(e => e.btc > 0)
        .sort((a, b) => b.btc - a.btc)
        .slice(0, 10);

    const lines = await Promise.all(sorted.map(async ({ uid, btc }, i) => {
        const name = await getDisplayName(client, null, uid);
        const medal = MEDALS[i] || `**${i + 1}.**`;
        return `${medal} **${name}** — ₿ ${btc.toLocaleString()} BTC`;
    }));

    return { lines, winner: sorted[0] || null };
}

async function sendLeaderboard(client) {
    try {
        const [{ lines: ecoLines, winner: ecoWinner }, { lines: iqLines, winner: iqWinner }, { lines: richLines, winner: richWinner }] = await Promise.all([
            buildEcoLines(client),
            buildIqLines(client),
            buildRichLines(client),
        ]);

        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Award prizes
        let econChanged = false;

        let ecoPrizeLine = '';
        if (ecoWinner) {
            checkEconUser(ecoWinner.uid);
            econData[ecoWinner.uid].btc = (econData[ecoWinner.uid].btc || 0) + PRIZE_ECO_BTC;
            econChanged = true;
            ecoPrizeLine = `\n\n🏆 **Winner:** <@${ecoWinner.uid}> — **+₿ ${PRIZE_ECO_BTC.toLocaleString()} BTC** abaalmarinta!`;
        }

        let iqPrizeLine = '';
        if (iqWinner) {
            checkEconUser(iqWinner.uid);
            econData[iqWinner.uid].btc = (econData[iqWinner.uid].btc || 0) + PRIZE_IQ_BTC;
            econChanged = true;
            iqPrizeLine = `\n\n🏆 **Winner:** <@${iqWinner.uid}> — **+₿ ${PRIZE_IQ_BTC.toLocaleString()} BTC** abaalmarinta!`;
        }

        let richPrizeLine = '';
        if (richWinner) {
            checkEconUser(richWinner.uid);
            econData[richWinner.uid].btc = (econData[richWinner.uid].btc || 0) + PRIZE_RICH_BTC;
            econChanged = true;
            richPrizeLine = `\n\n🏆 **Winner:** <@${richWinner.uid}> — **+₿ ${PRIZE_RICH_BTC.toLocaleString()} BTC** abaalmarinta!`;
        }

        if (econChanged) saveEcon();

        const ecoEmbed = new EmbedBuilder()
            .setTitle('💰 TOP 10 — Weekly Earners')
            .setColor('#f39c12')
            .setDescription((ecoLines.join('\n') || '_No earnings recorded this week._') + ecoPrizeLine)
            .setFooter({ text: `Garaad Economy • ${dateStr} • Earnings reset` })
            .setTimestamp();

        const iqEmbed = new EmbedBuilder()
            .setTitle('🧠 TOP 10 — Highest IQ')
            .setColor('#3498db')
            .setDescription((iqLines.join('\n') || '_No data available._') + iqPrizeLine)
            .setFooter({ text: `Garaad IQ System • ${dateStr}` })
            .setTimestamp();

        const richEmbed = new EmbedBuilder()
            .setTitle('💎 TOP 10 — Richest Players')
            .setColor('#2ecc71')
            .setDescription((richLines.join('\n') || '_No data available._') + richPrizeLine)
            .setFooter({ text: `Garaad Economy • Wallet + Bank combined • ${dateStr}` })
            .setTimestamp();

        const payload = {
            content: '@everyone\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 **Garaad — Weekly Leaderboard**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            embeds: [ecoEmbed, iqEmbed, richEmbed],
        };

        for (const id of CHANNEL_IDS) {
            const ch = await client.channels.fetch(id).catch(() => null);
            if (!ch) { console.error('[WeeklyLB] Channel not found:', id); continue; }
            await ch.send(payload);
        }

        resetWeeklyEarnings();
        console.log('[WeeklyLB] ✅ Leaderboard posted, earnings reset');

    } catch (err) {
        console.error('[WeeklyLB] Error:', err.message);
    }
}

function getNextLeaderboardTime() {
    const now = Date.now();
    const eatNow = new Date(now + 3 * 60 * 60 * 1000);
    const nextToday = new Date(eatNow);
    nextToday.setUTCHours(19, 0, 0, 0);

    if (eatNow.getTime() <= nextToday.getTime()) {
        return nextToday.getTime() - 3 * 60 * 60 * 1000;
    }

    const day = eatNow.getUTCDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    const nextSunday = new Date(eatNow);
    nextSunday.setUTCDate(eatNow.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(16, 0, 0, 0); // 19:00 EAT = 16:00 UTC

    if (nextSunday.getTime() <= now + 3 * 60 * 60 * 1000) {
        nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
    }

    return nextSunday.getTime();
}

module.exports = function setupWeeklyLeaderboard(client) {
    // ⛔ Weekly leaderboard waa la joojiyay
    console.log('[WeeklyLB] ⛔ Disabled');
};
