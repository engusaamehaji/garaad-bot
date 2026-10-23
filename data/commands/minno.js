// =====================================================================
// AMARKA: ?minno <amount>        — Solo minesweeper vs Bot
//         ?minno @user <amount>  — PvP minesweeper
// Grid: 4x2 = 8 tiles, 1 bomb hidden randomly
// Safe tiles reveal ⭕, bomb tile = 💣 LOSS
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { checkUser, fmt } = require('../../src/utils/helpers');
const { econData, checkEconUser, saveEcon } = require('../../src/economy/econStore');

const MIN_BET        = 50;
const MAX_BET        = 50_000;
const TIMEOUT_MS     = 60_000;
const WINS_PER_LEVEL = 10;
const GRID_COLS      = 4;
const GRID_ROWS      = 2;
const TOTAL_TILES    = GRID_COLS * GRID_ROWS; // 8

const soloGames = new Map();  // userId  → game
const pvpGames  = new Map();  // gameId  → game
const pending   = new Map();  // targetId → challenge

function getMinnoLevel(wins) { return Math.floor((wins || 0) / WINS_PER_LEVEL); }
function minnoWinsNeeded()   { return WINS_PER_LEVEL; }

// ── Build grid rows ───────────────────────────────────────────────────
// tiles: array of 8 — null=hidden, 'safe'=revealed, 'bomb'=exploded
function buildGrid(gameId, tiles, isSolo, bombIdx, disabled = false) {
    const rows = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        const btns = [];
        for (let c = 0; c < GRID_COLS; c++) {
            const i   = r * GRID_COLS + c;
            const t   = tiles[i];
            const revealed = t !== null;
            const label = t === 'bomb' ? '💣' : t === 'safe' ? '⭕' : '▪️';
            const style = t === 'bomb'  ? ButtonStyle.Danger
                        : t === 'safe'  ? ButtonStyle.Success
                        : ButtonStyle.Secondary;
            btns.push(new ButtonBuilder()
                .setCustomId(`minno_tile_${gameId}_${i}`)
                .setLabel(label)
                .setStyle(style)
                .setDisabled(disabled || revealed)
            );
        }
        rows.push(new ActionRowBuilder().addComponents(btns));
    }
    return rows;
}

function makeGame(amount, playerId2 = null) {
    const bombIdx = Math.floor(Math.random() * TOTAL_TILES);
    return {
        amount,
        bombIdx,
        tiles: Array(TOTAL_TILES).fill(null),
        safeRevealed: 0,
        p2: playerId2,        // null for solo
        p2Turn: false,        // solo always player turn
        done: false,
        timer: null,
    };
}

// ── Solo command ──────────────────────────────────────────────────────
async function startSolo(message, amount) {
    const uid = message.author.id;
    if (soloGames.has(uid)) return message.reply('⚠️ Game hoose ayaad haystaa!');

    const game   = makeGame(amount);
    const gameId = uid;
    soloGames.set(uid, game);

    const rows = buildGrid(gameId, game.tiles, true, game.bombIdx);
    const msg  = await message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('⭕ 💣 Minno — Tile dooro!')
            .setColor('#9b59b6')
            .setDescription(
                `💰 Sharad: **₿${fmt(amount)}**\n\n` +
                `Grid: **${GRID_COLS}×${GRID_ROWS}** — 1 bomb ku dhex jirta!\n` +
                `Riix tile kasta — ⭕ safe, 💣 bomb = LOSS\n\n` +
                `Saf haddaad dhamayso waxaad qaadataa **₿${fmt(amount)}** (double!)\n` +
                `⏳ ${TIMEOUT_MS / 1000}s`
            )],
        components: rows,
    });

    game.msgId = msg.id;
    game.channel = message.channel;

    game.timer = setTimeout(async () => {
        if (soloGames.get(uid)?.msgId === msg.id) {
            soloGames.delete(uid);
            await msg.edit({ embeds: [new EmbedBuilder().setTitle('⏰ Waqtigu wuu dhammaaday').setColor('#7f8c8d').setDescription('Game waa xidmay.')], components: [] }).catch(() => {});
        }
    }, TIMEOUT_MS);
}

// ── PvP command ───────────────────────────────────────────────────────
async function startPvpChallenge(message, target, amount) {
    const cId = message.author.id;
    if (pending.has(target.id)) return message.reply(`⚠️ **${target.username}** challenge kale ayuu haystaa.`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`minno_accept_${cId}_${target.id}_${amount}`).setLabel('✅ Aqbal').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`minno_decline_${cId}_${target.id}`).setLabel('❌ Diid').setStyle(ButtonStyle.Danger),
    );

    const msg = await message.reply({
        content: `${target}`,
        embeds: [new EmbedBuilder()
            .setTitle('⭕ 💣 Minno Challenge!')
            .setColor('#f39c12')
            .setDescription(
                `**${message.author.username}** wuxuu kugu sharaday **₿${fmt(amount)}**!\n\n` +
                `Grid ${GRID_COLS}×${GRID_ROWS} — 1 bomb ku dhex jirta.\n` +
                `Labadiin waxaad riixdaan tiles.\n` +
                `Kii bomb riixay = LOSS!\n\n` +
                `⏳ ${TIMEOUT_MS / 1000}s`
            )],
        components: [row],
    });

    pending.set(target.id, { challengerId: cId, amount, msgId: msg.id });

    setTimeout(async () => {
        const p = pending.get(target.id);
        if (p && p.msgId === msg.id) {
            pending.delete(target.id);
            await msg.edit({ embeds: [new EmbedBuilder().setTitle('⏰ Waqtigu wuu dhammaaday').setColor('#7f8c8d').setDescription(`${target.username} kama jawaabin.`)], components: [] }).catch(() => {});
        }
    }, TIMEOUT_MS);
}

// ── Main command ──────────────────────────────────────────────────────
async function minnoCmd(message, args) {
    const cId = message.author.id;
    checkUser(cId); checkEconUser(cId);

    const target = message.mentions.users.first();
    const numArg = args.find(a => /^\d+$/.test(a));
    const amount = parseInt(numArg, 10);

    if (!numArg) {
        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('⭕ 💣 Minno — Minesweeper')
            .setColor('#9b59b6')
            .setDescription(
                '**Qaabka:**\n' +
                '`?minno <amount>` — Kaligaa vs Bot\n' +
                '`?minno @user <amount>` — Challenge qof kale\n\n' +
                `Grid **${GRID_COLS}×${GRID_ROWS}** — 1 bomb ku dhex jirta 8 tile!\n` +
                'Riix tile ⭕ safe — avoid 💣 bomb!\n\n' +
                `🏆 **${WINS_PER_LEVEL} guul = Minno Level Up**\n\n` +
                '`?minno 500` · `?minno @Cali 500`'
            )] });
    }

    if (!amount || amount < MIN_BET) return message.reply(`⚠️ Ugu yar **₿${MIN_BET}**`);
    if (amount > MAX_BET)            return message.reply(`⚠️ Ugu badan **₿${MAX_BET.toLocaleString()}**`);

    if (!target) {
        if ((econData[cId].btc || 0) < amount) return message.reply(`⚠️ BTC kugu filna ma lihid. Wallet: **₿${fmt(econData[cId].btc || 0)}**`);
        return startSolo(message, amount);
    }

    if (target.id === cId)  return message.reply('⚠️ Nafta kuma sharadayn kartid!');
    if (target.bot)          return message.reply('⚠️ Bot kuma sharadayn kartid!');
    checkEconUser(target.id);
    if ((econData[cId].btc || 0) < amount)         return message.reply(`⚠️ BTC kugu filna ma lihid.`);
    if ((econData[target.id].btc || 0) < amount)   return message.reply(`⚠️ **${target.username}** BTC kugu filan ma laha.`);
    return startPvpChallenge(message, target, amount);
}

// ── Tile click handler (solo + pvp) ──────────────────────────────────
async function handleTilePick(interaction) {
    const parts  = interaction.customId.split('_'); // minno_tile_<gameId>_<idx>
    const gameId = parts[2];
    const idx    = parseInt(parts[3], 10);
    const uid    = interaction.user.id;

    // Detect solo vs pvp
    const isSolo = soloGames.has(gameId);
    const game   = isSolo ? soloGames.get(gameId) : pvpGames.get(gameId);
    if (!game) return interaction.reply({ content: '⚠️ Game-kan waa dhacay.', flags: 64 });

    // Solo: only owner plays
    if (isSolo && uid !== gameId)
        return interaction.reply({ content: '⚠️ Adiga kuuma ahan game-kan.', flags: 64 });

    // PvP: must be a player
    if (!isSolo && uid !== game.cId && uid !== game.tId)
        return interaction.reply({ content: '⚠️ Adiga kuuma ahan game-kan.', flags: 64 });

    // PvP: check whose turn
    if (!isSolo) {
        const isP1Turn = !game.p2Turn;
        if (isP1Turn  && uid !== game.cId) return interaction.reply({ content: `⚠️ Wakhtiga kale ayaa ah — sug!`, flags: 64 });
        if (!isP1Turn && uid !== game.tId) return interaction.reply({ content: `⚠️ Wakhtiga kale ayaa ah — sug!`, flags: 64 });
    }

    if (game.tiles[idx] !== null)
        return interaction.reply({ content: '⚠️ Tile-kan horay loo riixay!', flags: 64 });

    await interaction.deferUpdate().catch(() => {});

    const hitBomb = idx === game.bombIdx;
    game.tiles[idx] = hitBomb ? 'bomb' : 'safe';
    if (!hitBomb) game.safeRevealed++;

    if (isSolo) {
        await handleSoloTile(interaction, gameId, game, uid, hitBomb, idx);
    } else {
        await handlePvpTile(interaction, gameId, game, uid, hitBomb, idx);
    }
}

async function handleSoloTile(interaction, gameId, game, uid, hitBomb, idx) {
    checkUser(uid); checkEconUser(uid);
    const { amount } = game;

    if (hitBomb) {
        clearTimeout(game.timer);
        soloGames.delete(gameId);
        game.done = true;

        econData[uid].btc = (econData[uid].btc || 0) - amount;
        saveEcon();
        checkUser(uid);
        userData[uid].minnoLosses = (userData[uid].minnoLosses || 0) + 1;
        saveData();

        // Reveal bomb
        game.tiles[idx] = 'bomb';
        const rows = buildGrid(gameId, game.tiles, true, game.bombIdx, true);
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('💣 BOOM! Bomb-ka waxaad riixday!')
                .setColor('#e74c3c')
                .setDescription(`📉 -₿${fmt(amount)} → Wallet: **₿${fmt(econData[uid].btc || 0)}**`)],
            components: rows,
        }).catch(() => {});
    }

    // Safe — check if all safe tiles revealed (won!)
    const safeTiles = TOTAL_TILES - 1; // 7 safe tiles
    if (game.safeRevealed >= safeTiles) {
        clearTimeout(game.timer);
        soloGames.delete(gameId);
        game.done = true;

        econData[uid].btc = (econData[uid].btc || 0) + amount;
        saveEcon();
        checkUser(uid);
        userData[uid].minnoWins = (userData[uid].minnoWins || 0) + 1;
        const prevLvl  = getMinnoLevel(userData[uid].minnoWins - 1);
        const newLvl   = getMinnoLevel(userData[uid].minnoWins);
        const leveledUp = newLvl > prevLvl;
        const wins     = userData[uid].minnoWins;
        saveData();

        const rows = buildGrid(gameId, game.tiles, true, game.bombIdx, true);
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(leveledUp ? '⭕ Dhammaan tiles! LEVEL UP! 🎉' : '⭕ Dhammaan tiles! GUUL! ✅')
                .setColor(leveledUp ? '#f1c40f' : '#2ecc71')
                .setDescription(
                    `⭕ Dhammaan safe tiles waxaad samatay!\n\n` +
                    `💰 +₿${fmt(amount)} → Wallet: **₿${fmt(econData[uid].btc || 0)}**\n\n` +
                    `🏆 Minno Wins: **${wins}** (${wins % WINS_PER_LEVEL}/${WINS_PER_LEVEL} → Level ${newLvl})` +
                    (leveledUp ? `\n\n🎉 **Waa Minno Level ${newLvl}!**` : '')
                )],
            components: rows,
        }).catch(() => {});
    }

    // Continue — update grid
    const rows = buildGrid(gameId, game.tiles, true, game.bombIdx);
    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('⭕ Safe! Sii wad...')
            .setColor('#27ae60')
            .setDescription(
                `💰 Sharad: **₿${fmt(amount)}**\n` +
                `⭕ ${game.safeRevealed}/${safeTiles} safe tiles la samatay\n` +
                `💣 Haddana 1 bomb ayaa ku dhex jirta!\n\n` +
                `Sii wad riixida ama jooji:\n` +
                `**Guulayso** haddaad dhammaan safe tiles samatid!`
            )],
        components: rows,
    }).catch(() => {});
}

async function handlePvpTile(interaction, gameId, game, uid, hitBomb, idx) {
    const { cId, tId, amount } = game;
    checkUser(cId); checkUser(tId);
    checkEconUser(cId); checkEconUser(tId);

    let cUser, tUser;
    try { cUser = await interaction.client.users.fetch(cId); } catch {}
    try { tUser = await interaction.client.users.fetch(tId); } catch {}
    const cName = cUser?.globalName || cUser?.username || 'P1';
    const tName = tUser?.globalName || tUser?.username || 'P2';

    if (hitBomb) {
        clearTimeout(game.timer);
        pvpGames.delete(gameId);

        const loserId  = uid;
        const winnerId = uid === cId ? tId : cId;
        const lName    = uid === cId ? cName : tName;
        const wName    = uid === cId ? tName : cName;

        econData[winnerId].btc = (econData[winnerId].btc || 0) + amount;
        econData[loserId].btc  = (econData[loserId].btc  || 0) - amount;
        saveEcon();
        userData[winnerId].minnoWins  = (userData[winnerId].minnoWins  || 0) + 1;
        userData[loserId].minnoLosses = (userData[loserId].minnoLosses || 0) + 1;
        const prevLvl  = getMinnoLevel(userData[winnerId].minnoWins - 1);
        const newLvl   = getMinnoLevel(userData[winnerId].minnoWins);
        const leveledUp = newLvl > prevLvl;
        const wins     = userData[winnerId].minnoWins;
        saveData();

        game.tiles[idx] = 'bomb';
        const rows = buildGrid(gameId, game.tiles, false, game.bombIdx, true);
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(leveledUp ? `💣 BOOM! ${wName} LEVEL UP! 🎉` : `💣 BOOM! ${wName} ayaa guulaystay!`)
                .setColor(leveledUp ? '#f1c40f' : '#e74c3c')
                .setDescription(
                    `💣 **${lName}** bomb-ka ayuu riixay!\n\n` +
                    `⭕ **${wName}** +₿${fmt(amount)} → ₿${fmt(econData[winnerId].btc || 0)}\n` +
                    `💥 **${lName}** -₿${fmt(amount)} → ₿${fmt(econData[loserId].btc || 0)}\n\n` +
                    `🏆 Minno Wins: **${wins}** (${wins % WINS_PER_LEVEL}/${WINS_PER_LEVEL} → Level ${newLvl})` +
                    (leveledUp ? `\n\n🎉 **${wName} waa Minno Level ${newLvl}!**` : '')
                )],
            components: rows,
        }).catch(() => {});
    }

    // Safe — switch turns
    game.p2Turn = !game.p2Turn;
    const nextName = game.p2Turn ? tName : cName;
    const rows = buildGrid(gameId, game.tiles, false, game.bombIdx);
    const safeTiles = TOTAL_TILES - 1;

    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('⭕ Safe! Turn-ka beddelay...')
            .setColor('#27ae60')
            .setDescription(
                `**${cName}** vs **${tName}**\n` +
                `💰 Sharad: **₿${fmt(amount)}**\n\n` +
                `⭕ ${game.safeRevealed}/${safeTiles} safe\n` +
                `💣 Bomb wali ku dhex jirta!\n\n` +
                `➡️ **${nextName}** turn-kiisa!`
            )],
        components: rows,
    }).catch(() => {});
}

// ── PvP Accept ────────────────────────────────────────────────────────
async function handleMinnoAccept(interaction) {
    const parts  = interaction.customId.split('_');
    const cId    = parts[2];
    const tId    = parts[3];
    const amount = parseInt(parts[4], 10);

    if (interaction.user.id !== tId)
        return interaction.reply({ content: '⚠️ Adiga kuuma ahan.', flags: 64 });

    const p = pending.get(tId);
    if (!p || p.challengerId !== cId)
        return interaction.reply({ content: '⚠️ Challenge-kan waa dhacay.', flags: 64 });

    pending.delete(tId);
    checkEconUser(cId); checkEconUser(tId);

    if ((econData[cId].btc || 0) < amount || (econData[tId].btc || 0) < amount)
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('⚠️ BTC kugu filna ma jiro').setColor('#e74c3c')], components: [] }).catch(() => {});

    await interaction.deferUpdate().catch(() => {});

    const gameId = `${cId}_${tId}_${Date.now()}`;
    const game   = makeGame(amount, tId);
    game.cId = cId; game.tId = tId;
    pvpGames.set(gameId, game);

    let cUser, tUser;
    try { cUser = await interaction.client.users.fetch(cId); } catch {}
    try { tUser = await interaction.client.users.fetch(tId); } catch {}
    const cName = cUser?.globalName || cUser?.username || 'P1';
    const tName = tUser?.globalName || tUser?.username || 'P2';

    const rows = buildGrid(gameId, game.tiles, false, game.bombIdx);
    const msg  = await interaction.editReply({
        content: `${cUser} ${tUser}`,
        embeds: [new EmbedBuilder()
            .setTitle('⭕ 💣 Minno PvP — Bilaabay!')
            .setColor('#9b59b6')
            .setDescription(
                `**${cName}** vs **${tName}**\n` +
                `💰 Sharad: **₿${fmt(amount)}** — Winner qaataa **₿${fmt(amount * 2)}**\n\n` +
                `Grid **${GRID_COLS}×${GRID_ROWS}** — 1 bomb!\n` +
                `Kii bomb riixay = LOSS!\n\n` +
                `➡️ **${cName}** ayaa hormaraya!\n` +
                `⏳ ${TIMEOUT_MS / 1000}s`
            )],
        components: rows,
    }).catch(() => null);

    if (msg) game.msgId = msg.id;

    game.timer = setTimeout(async () => {
        if (pvpGames.has(gameId)) {
            pvpGames.delete(gameId);
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⏰ Waqtigu wuu dhammaaday').setColor('#7f8c8d')], components: [] }).catch(() => {});
        }
    }, TIMEOUT_MS);
}

// ── PvP Decline ───────────────────────────────────────────────────────
async function handleMinnoDecline(interaction) {
    const parts = interaction.customId.split('_');
    const tId   = parts[3];
    if (interaction.user.id !== tId)
        return interaction.reply({ content: '⚠️ Adiga kuuma ahan.', flags: 64 });
    pending.delete(tId);
    return interaction.update({
        embeds: [new EmbedBuilder().setTitle('❌ Minno — La Diiday').setColor('#e74c3c').setDescription(`<@${tId}> wuu diiday.`)],
        components: [],
    }).catch(() => {});
}

module.exports = {
    minnoCmd,
    handleTilePick,
    handleMinnoAccept,
    handleMinnoDecline,
    getMinnoLevel,
    minnoWinsNeeded,
};
