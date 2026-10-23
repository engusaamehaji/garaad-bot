// =====================================================================
//
//   ██████╗  █████╗ ██████╗  █████╗  █████╗ ██████╗     ██████╗  ██████╗ ████████╗
//  ██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗    ██╔══██╗██╔═══██╗╚══██╔══╝
//  ██║  ███╗███████║██████╔╝███████║███████║██║  ██║    ██████╔╝██║   ██║   ██║
//  ██║   ██║██╔══██║██╔══██╗██╔══██║██╔══██║██║  ██║    ██╔══██╗██║   ██║   ██║
//  ╚██████╔╝██║  ██║██║  ██║██║  ██║██║  ██║██████╔╝    ██████╔╝╚██████╔╝   ██║
//   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝     ╚═════╝  ╚═════╝    ╚═╝
//
//  Garaad Bot v2 — Discord Quiz Bot (Af-Soomaali)
//  =====================================================================

require('dotenv').config();

// Suppress known harmless deprecation warnings from discord.js internals on Node.js 25
process.on('warning', w => { if (w.code === 'DEP0180') return; console.warn(w); });

const http = require('http');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

function getBotToken() {
    return process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN || '';
}

function startPortHealthServerIfNeeded() {
    const raw = process.env.PORT;
    if (raw === undefined || raw === '') return;
    const port = Number(raw);
    if (!Number.isFinite(port)) return;

    const server = http.createServer((req, res) => {
        // ── top.gg vote webhook ──
        if (req.method === 'POST' && req.url === '/topgg-vote') {
            const auth = req.headers.authorization || '';
            if (process.env.TOPGG_AUTH && auth !== process.env.TOPGG_AUTH) {
                res.writeHead(401);
                return res.end('Unauthorized');
            }
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.user && data.type === 'upvote') {
                        const { setPendingVote } = require('./src/economy/voteStore');
                        setPendingVote(data.user);
                        console.log(`[Vote] ${data.user} wuu codeeyay top.gg`);
                    }
                } catch {}
                res.writeHead(200);
                res.end('ok');
            });
            return;
        }
        // ── Health check ──
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[Health] Dhagaysan ${port} (Railway / PaaS)`);
    });
}

const setupMessageHandler      = require('./src/handlers/messageHandler');
const setupInteractionHandler  = require('./src/handlers/interactionHandler');
const { handleVoiceState }     = require('./src/handlers/voiceMaster');
const { setupDisTube }         = require('./src/music/disTubeSetup');
const setupReminderScheduler   = require('./src/handlers/reminderScheduler');
const setupBankChargeScheduler  = require('./src/handlers/bankChargeScheduler');
const setupWeeklyLeaderboard    = require('./src/handlers/weeklyLeaderboard');
const setupBroadcastScheduler   = require('./src/handlers/broadcastScheduler');
const setupBackupScheduler      = require('./src/handlers/backupScheduler');
const setupQuestionSync         = require('./src/handlers/questionSyncScheduler');
const setupAutoUpdate           = require('./src/handlers/autoUpdateScheduler');
const { restoreTournaments }    = require('./src/games/tournament');
const { restoreSoloGames }      = require('./src/games/solo');
const { restoreQuizGames }      = require('./src/games/quiz');
const { restoreDuelGames }      = require('./src/games/duel');
const { connectDB }             = require('./src/db');
const { loadData, loadConfig }  = require('./src/store');
const { loadEcon }              = require('./src/economy/econStore');
const { loadHagbad }            = require('./src/economy/hagbadStore');
const { restorePredictions }    = require('./src/economy/prediction');
const { tickMarket }            = require('./src/economy/market');
const { loadMarketState, startMarketEngine } = require('./src/economy/marketEngine');
const { loadBanks, loadCompanies } = require('./src/economy/bankStore');
const { startDiamondDrops } = require('./src/economy/diamondDrops');

// ───── Client ─────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message],
});

// ───── Handlers ─────
setupDisTube(client);
setupMessageHandler(client);
setupInteractionHandler(client);
client.on('voiceStateUpdate', handleVoiceState);

// ───── Ready ─────
client.once('ready', () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log(`║  ✅  Garaad Bot v2 — SHAQAYNAYA      ║`);
    console.log(`║  🤖  ${client.user.tag.padEnd(32)}║`);
    console.log(`║  📊  ${String(client.guilds.cache.size + ' server').padEnd(32)}║`);
    console.log('╚══════════════════════════════════════╝');
    console.log('');

    setupReminderScheduler(client);
    setupBankChargeScheduler(client);
    setupWeeklyLeaderboard(client);
    // setupBroadcastScheduler(client); // disabled
    setupAutoUpdate();
    setupBackupScheduler();
    setupQuestionSync();
    // startDiamondDrops(client); // disabled: automatic channel drops turned off
    restorePredictions(client);
    restoreTournaments(client).catch(e => console.error('[Tournament] Restore failed:', e.message));
    restoreSoloGames(client).catch(e => console.error('[Solo] Restore failed:', e.message));
    restoreQuizGames(client).catch(e => console.error('[Quiz] Restore failed:', e.message));
    restoreDuelGames(client).catch(e => console.error('[Duel] Restore failed:', e.message));

    // Dynamic market engine (6 states, time-based transitions)
    startMarketEngine();

    // Market auto-tick: update prices every 60s
    tickMarket();
    setInterval(tickMarket, 60 * 1000);

    // Bank expiry check — daily
    const { checkAndCloseExpiredBanks } = require('./data/commands/economy/publicBank');
    async function runBankExpiryCheck() {
        const closed = await checkAndCloseExpiredBanks(client);
        if (closed > 0) console.log(`[BankExpiry] ${closed} bank(s) la xiray, lacagta macaamiisha loo celiyay`);
    }
    runBankExpiryCheck();
    setInterval(runBankExpiryCheck, 24 * 60 * 60 * 1000);

    // Activity status: ?caawin | X servers
    function updateStatus() {
        const count = client.guilds.cache.size;
        client.user.setActivity(`?caawin | ${count} servers`, { type: 3 }); // 3 = Watching
    }
    updateStatus();
    client.on('guildCreate', updateStatus);
    client.on('guildDelete', updateStatus);

    // No restart announcement — bot silently comes back online
});

// ───── Khaladaad aan la filanayn — bot ha joojin ─────
client.on('error', err => console.error('[Bot Error]', err));

// Unhandled promise rejection — log oo sii socon (ha joojin)
process.on('unhandledRejection', err => {
    console.error('[Unhandled Rejection]', err?.message || err);
});

// Uncaught exception — log oo sii socon (ha joojin)
process.on('uncaughtException', err => {
    console.error('[Uncaught Exception]', err?.message || err);
});

// Discord disconnect — dib u xidh
client.on('shardDisconnect', (event, id) => {
    console.warn(`[Disconnect] Shard ${id} wuu goostay — dib u xidhmaya...`);
});
client.on('shardReconnecting', id => {
    console.log(`[Reconnect] Shard ${id} wuu isku dayaa...`);
});
client.on('shardResume', (id, replayed) => {
    console.log(`[Resume] Shard ${id} wuu soo noqday (${replayed} events)`);
});

// ───── Login ─────
startPortHealthServerIfNeeded();

const token = getBotToken();
if (!token) {
    console.error('❌ KHALAD: TOKEN lama helin. Ku dar Railway → Variables: TOKEN=<bot token>');
    console.error('   (sidoo kale waxaa la aqbalaa: DISCORD_TOKEN ama DISCORD_BOT_TOKEN)');
    process.exit(1);
}

// Connect to MongoDB then load data before login
(async () => {
    await connectDB();
    await loadData();
    loadConfig();
    await loadEcon();
    await loadHagbad();
    loadBanks();
    loadCompanies();
    await loadMarketState();
        client.login(token).catch((err) => {
            console.error('❌ Login Discord ma guulaysan:', err.message);
            process.exit(1);
        });
})();
