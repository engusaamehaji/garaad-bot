// =====================================================================
// TARTAN — Tournament (New Flow)
//
// 1. Admin: ?tartan → bot weydiiyaa 3 channel ID (announce, game, vc)
// 2. Admin ku gala IDs → bot "✅ Ok" dhahaa, panel bilaabaa
// 3. Users click "📝 Diiwaan Geli" → code DM instantly
// 4. Admin panel: Bilow Registration / Bilow Toos
// 5. Bot posts in GAME channel: ?gal CODE
// 6. Users join with code, admin starts rounds
//
// Wareegyada: R1=25 | R2=20 | Final=15 su'aalood
// Dhibco: < 5s = 40pts | 18s = 5pts (timed)
// Keyed by guild ID — servers kasta tournament gaar ah
// =====================================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const { isAdmin }            = require('../utils/admin');
const {
    activeTournament,
    tournamentRegistry,
    userData,
    saveData,
} = require('../store');
const { checkUser, stripQuestionNumber } = require('../utils/helpers');
const { econData, checkEconUser, saveEcon } = require('../economy/econStore');
const { markUserPlayed }     = require('../utils/reminders');
const {
    pickQuestionsForGame,
    pickQuestionsForUsers,
    markSeenForUsersInGame,
    noQuestionsLeftEmbed,
    getAllQuestionsForGame,
} = require('../utils/questions');
const { getAnswerOptions } = require('../utils/questionOptions');
const {
    saveTournamentState,
    deleteTournamentState,
    loadTournamentStates,
} = require('../utils/tournamentPersist');
const {
    PREFIX,
    GLOBAL_WAIT_MS,
    SOLO_FAST_MS,
    SOLO_MAX_SCORE,
    SOLO_MIN_SCORE,
    TOURNAMENT_MIN_PLAYERS,
    TOURNAMENT_R1_QUESTIONS,
    TOURNAMENT_R2_QUESTIONS,
    TOURNAMENT_FINAL_QUESTIONS,
} = require('../config');

// Fallback channel IDs (used in button handlers where state key = guildId)
const ANNOUNCE_CHANNEL_ID = '1490233695624364123';
const GAME_CHANNEL_ID     = '1504430434895921193';
const VC_CHANNEL_ID       = '1504130784368525553';
const REG_DURATION_MS     = 24 * 60 * 60 * 1000;

const ROUND_LABELS = {
    1: { name: 'Wareegga 1aad',        color: '#e67e22', questions: TOURNAMENT_R1_QUESTIONS    },
    2: { name: 'Wareegga 2aad (Semi)', color: '#8e44ad', questions: TOURNAMENT_R2_QUESTIONS    },
    3: { name: 'Final 🏆',             color: '#c0392b', questions: TOURNAMENT_FINAL_QUESTIONS },
};

function calcScore(ms) {
    if (ms <= SOLO_FAST_MS) return SOLO_MAX_SCORE;
    const ratio = (ms - SOLO_FAST_MS) / (GLOBAL_WAIT_MS - SOLO_FAST_MS);
    return Math.max(SOLO_MIN_SCORE, Math.round(SOLO_MAX_SCORE - (SOLO_MAX_SCORE - SOLO_MIN_SCORE) * ratio));
}

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function roundQuestionCount(idx) {
    return ROUND_LABELS[idx]?.questions ?? TOURNAMENT_R1_QUESTIONS;
}

function computeSurvivors(survivorIds, roundScoreMap, roundIdx) {
    const list = [...survivorIds]
        .map(id => [id, roundScoreMap[id] || 0])
        .sort((a, b) => b[1] - a[1]);

    let keepCount;
    if (roundIdx === 1) {
        const eliminate = Math.max(1, Math.floor(list.length / 6));
        keepCount = Math.max(2, list.length - eliminate);
    } else {
        const eliminate = Math.max(1, Math.floor(list.length / 5));
        const afterElim = Math.max(2, list.length - eliminate);
        keepCount = Math.max(2, Math.floor(afterElim / 2));
    }
    return list.slice(0, keepCount).map(x => x[0]);
}

// Helper: get state by guildId (falls back to old GAME_CHANNEL_ID key)
function getState(guildId) {
    return activeTournament.get(guildId) || activeTournament.get(GAME_CHANNEL_ID);
}

// Persist state to MongoDB (fire-and-forget)
function persist(state) {
    if (!state?.guildId) return;
    saveTournamentState(state, tournamentRegistry).catch(() => {});
}

function persistDelete(guildId) {
    if (!guildId) return;
    deleteTournamentState(guildId).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────
// Announcement Embed & Buttons
// ─────────────────────────────────────────────────────────────────────
function buildAnnounceEmbed(deadline, regCount, closed, state) {
    const gameChId = state?.gameChannelId || GAME_CHANNEL_ID;
    const vcChId   = state?.vcChannelId   || VC_CHANNEL_ID;

    const timeLeft = Math.max(0, deadline - Date.now());
    const hours    = Math.floor(timeLeft / 3600000);
    const mins     = Math.floor((timeLeft % 3600000) / 60000);

    const regStatus = closed
        ? `🔒 **Diiwaangelintu waa la xiray** · **${regCount}** qof ayaa diiwaangeliyay`
        : `⏰ **Diiwaangelintu waxay xirmaysaa:** ${hours > 0 ? `${hours} saac ` : ''}${mins} daqiiqo gudahood\n👥 **Diiwaangeliyay:** ${regCount} qof`;

    return new EmbedBuilder()
        .setTitle('🏆 Garaad Quiz — Tartanka Rasmiga ah')
        .setColor(closed ? '#95a5a6' : '#e67e22')
        .setDescription(
            `## 🔥 Ku soo dhowaada dhammaan ka qaybgalayaasha Garaad Quiz!\n\n` +
            `Waxaa si rasmi ah loo qabanayaa **tartan weyn oo aqooneed**.\n` +
            `Haddii aad doonayso inaad ka qayb gasho, riix badhanka **📝 Diiwaan Geli** si aad u hesho **code gaar ah** oo si toos ah kuugu imaanaya fariimahaaga.\n\n` +
            `Marka maamulka furo albaabka tartanka, code-kaaga ku qor <#${gameChId}> si loo xaqiijiyo gelitaankaaga.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `## ⚔️ Qaabka Tartanka\n\n` +
            `🏁 Tartanku wuxuu ka koobnaan doonaa **3 wareeg**\n` +
            `⚡ Qofka ugu dhaqso badan\n` +
            `🧠 Jawaabaha ugu saxda badan bixiya\n` +
            `👑 Isaga ayaa noqon doona guuleystaha rasmiga ah\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `# 💰 Abaalmarinnada\n\n` +
            `🥇 **Kaalinta 1aad** — **$15** + 🏆 Champion Title\n` +
            `🥈 **Kaalinta 2aad** — **$10**\n` +
            `🥉 **Kaalinta 3aad** — **$5**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            
            `${regStatus}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `# 📝 Is Diiwaan Geli Hadda ⬇️\n\n` +
            `## 🔥 Garaad Quiz Tournament 🔥`
        )
        .setFooter({ text: 'Garaad Quiz Tournament' });
}

function buildAnnounceButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tournament_rules')
            .setLabel('📖 Xeerarka')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('tournament_register')
            .setLabel('📝 Diiwaan Geli')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
    );
}

// ─────────────────────────────────────────────────────────────────────
// Admin Panel
// ─────────────────────────────────────────────────────────────────────
function buildAdminPanelEmbed(state) {
    const annChId  = state.announceChannelId || ANNOUNCE_CHANNEL_ID;
    const gameChId = state.gameChannelId     || GAME_CHANNEL_ID;
    const vcChId   = state.vcChannelId       || VC_CHANNEL_ID;
    const regCount  = tournamentRegistry.size;
    const joinCount = state.players?.size || 0;
    const stageText = {
        initial:      '⚙️ Heer: Diyaargarow — door habka',
        registration: `📝 Heer: Diiwaangelinta socdaa · **${regCount}** qof diiwaangeliyay`,
        join:         `🟢 Heer: Game furan · **${regCount}** diiwaangeliyay · **${joinCount}** ku biirtay`,
    }[state.stage] || state.stage;

    return new EmbedBuilder()
        .setTitle('🏆 Tartan — Admin Panel')
        .setColor('#e67e22')
        .setDescription(
            `**${stageText}**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📢 Announcement: <#${annChId}>\n` +
            `🎮 Game channel: <#${gameChId}>\n` +
            ``
        )
        .setFooter({ text: 'Garaad Quiz — Admin Control Panel' });
}

function buildAdminPanelButtons(stage, gameChId) {
    const gch = gameChId || GAME_CHANNEL_ID;
    if (stage === 'initial') {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tartan_panel_announce').setLabel('📢 Bilow Registration').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tartan_panel_quick')   .setLabel('🚀 Bilow Toos')        .setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('tartan_panel_cancel')  .setLabel('🛑 Jooji')             .setStyle(ButtonStyle.Danger),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tartan_panel_dismiss') .setLabel('❌ Iska xir')          .setStyle(ButtonStyle.Secondary),
            ),
        ];
    }
    if (stage === 'registration') {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tartan_panel_open')    .setLabel('▶️ Fur Game')          .setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('tartan_panel_count')   .setLabel('👥 Tirada')            .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tartan_panel_cancel')  .setLabel('🛑 Jooji')             .setStyle(ButtonStyle.Danger),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tartan_panel_dismiss') .setLabel('❌ Iska xir')          .setStyle(ButtonStyle.Secondary),
            ),
        ];
    }
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tartan_bilow_next_${gch}`).setLabel('🚀 Bilow Wareeg 1aad').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('tartan_panel_count')      .setLabel('👥 Players')          .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('tartan_panel_cancel')     .setLabel('🛑 Jooji')            .setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tartan_panel_dismiss').setLabel('❌ Iska xir').setStyle(ButtonStyle.Secondary),
        ),
    ];
}

async function updateAdminPanel(state) {
    if (!state.panelMsgId || !state.panelChannelId) return;
    try {
        const ch  = await state.client.channels.fetch(state.panelChannelId);
        const msg = await ch.messages.fetch(state.panelMsgId);
        await msg.edit({
            embeds:     [buildAdminPanelEmbed(state)],
            components: buildAdminPanelButtons(state.stage, state.gameChannelId),
        });
    } catch {}
}

async function handlePanelButton(interaction, action) {
    if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: '⛔ Kaliya admin.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const guildId = interaction.guildId;
    const state   = getState(guildId);
    const annChId = state?.announceChannelId || ANNOUNCE_CHANNEL_ID;

    if (action === 'announce') {
        if (!state || state.stage !== 'initial') {
            return interaction.reply({ content: '⚠️ Tartan heer khalad ah.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const announceChannel = await interaction.client.channels.fetch(annChId).catch(() => null);
        if (!announceChannel) {
            return interaction.reply({ content: '⚠️ Announcement channel-ka la heyn waayay.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const deadline = Date.now() + REG_DURATION_MS;
        tournamentRegistry.clear();
        state.registrationDeadline = deadline;
        state.stage = 'registration';

        const annMsg = await announceChannel.send({
            content:    '@everyone @here',
            embeds:     [buildAnnounceEmbed(deadline, 0, false, state)],
            components: [buildAnnounceButtons(false)],
        });
        state.announceMsgId = annMsg.id;
        state._regTimer = setTimeout(() => closeRegistration(state), REG_DURATION_MS);
        persist(state);

        return interaction.update({
            embeds:     [buildAdminPanelEmbed(state)],
            components: buildAdminPanelButtons('registration', state.gameChannelId),
        }).catch(() => {});
    }

    if (action === 'quick') {
        if (!state || state.stage !== 'initial') {
            return interaction.reply({ content: '⚠️ Tartan heer khalad ah.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        tournamentRegistry.clear();
        state.stage = 'join';

        const ok = await openGamePhase(interaction.client, interaction.user.id, state);
        if (!ok) {
            state.stage = 'initial';
            return interaction.reply({ content: '⚠️ Game channel-ka la heyn waayay.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        persist(state);

        return interaction.update({
            embeds:     [buildAdminPanelEmbed(state)],
            components: buildAdminPanelButtons('join', state.gameChannelId),
        }).catch(() => {});
    }

    if (action === 'open') {
        if (!state || (state.stage !== 'registration' && state.stage !== 'initial')) {
            return interaction.reply({ content: '⚠️ Diiwaangelinta weli ma bilaabin.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        if (state._regTimer) { clearTimeout(state._regTimer); state._regTimer = null; }
        if (state.announceMsgId) {
            try {
                const ch = await interaction.client.channels.fetch(annChId);
                const m  = await ch.messages.fetch(state.announceMsgId);
                await m.edit({
                    embeds:     [buildAnnounceEmbed(0, tournamentRegistry.size, true, state)],
                    components: [buildAnnounceButtons(true)],
                });
            } catch {}
        }
        state.stage = 'join';

        const ok = await openGamePhase(interaction.client, interaction.user.id, state);
        if (!ok) {
            return interaction.reply({ content: '⚠️ Game channel-ka la heyn waayay.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        persist(state);

        return interaction.update({
            embeds:     [buildAdminPanelEmbed(state)],
            components: buildAdminPanelButtons('join', state.gameChannelId),
        }).catch(() => {});
    }

    if (action === 'count') {
        const regCount = tournamentRegistry.size;
        const list     = [...tournamentRegistry.entries()].slice(0, 25)
            .map(([uid, { username }], i) => `${i + 1}. **${username || uid}** (\`${uid}\`)`)
            .join('\n');
        const joinCount = state?.players?.size || 0;
        const joinList  = state && joinCount > 0
            ? '\n\n**Ku biirtay game:**\n' + [...state.players].map((id, i) => `${i + 1}. <@${id}>`).join('\n')
            : '';
        return interaction.reply({
            content: `👥 **Diiwaangeliyay:** ${regCount} qof\n${list || '_Cidna weli ma diiwaangalin_'}${joinList}`,
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }

    if (action === 'cancel') {
        if (state?._regTimer) clearTimeout(state._regTimer);
        activeTournament.delete(guildId);
        activeTournament.delete(GAME_CHANNEL_ID);
        persistDelete(guildId);
        return interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle('🛑 Tartan Waa La Joojiyay')
                .setColor('#e74c3c')
                .setDescription('Admin ayaa tartanka joojiyay.')
            ],
            components: [],
        }).catch(() => {});
    }

    if (action === 'dismiss') {
        return interaction.update({ components: [] }).catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────
// Auto-close registration after 24h
// ─────────────────────────────────────────────────────────────────────
async function closeRegistration(state) {
    const key = state.guildId || GAME_CHANNEL_ID;
    if (!activeTournament.has(key)) return;
    if (state._regTimer) { clearTimeout(state._regTimer); state._regTimer = null; }
    if (state.stage !== 'registration') return;
    state.stage = 'join';

    const annChId  = state.announceChannelId || ANNOUNCE_CHANNEL_ID;
    const regCount = tournamentRegistry.size;

    try {
        const ch  = await state.client.channels.fetch(annChId);
        const msg = await ch.messages.fetch(state.announceMsgId);
        await msg.edit({
            embeds:     [buildAnnounceEmbed(0, regCount, true, state)],
            components: [buildAnnounceButtons(true)],
        });
    } catch {}

    persist(state);
    await openGamePhase(state.client, state.adminId, state).catch(() => {});
    await updateAdminPanel(state).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────
// Open game phase
// ─────────────────────────────────────────────────────────────────────
async function openGamePhase(client, adminId, state) {
    if (!state || state.stage !== 'join') return false;

    const gameChId = state.gameChannelId || GAME_CHANNEL_ID;
    const vcChId   = state.vcChannelId   || VC_CHANNEL_ID;
    const gameChannel = await client.channels.fetch(gameChId).catch(() => null);
    if (!gameChannel) return false;

    state.channel = gameChannel;
    persist(state);
    const regCount = tournamentRegistry.size;

    await gameChannel.send({
        content: '@here',
        embeds: [new EmbedBuilder()
            .setTitle('🟢 Tartanka Waa La Furay — Ku Soo Biir Hadda!')
            .setColor('#2ecc71')
            .setDescription(
                `**${regCount}** qof ayaa diiwaangeliyay — albaabku waa furan yahay.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Haddaad code-kaaga hayso, hadda ayaad gasho:\n\n` +
                `➡️ Qor: \`${PREFIX}gal CODE-KAAGA\`\n\n` +
                `Code-kaagu DM-kaaga ayuu ku jiraa — fur oo eeg.\n\n` +
                
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `_Marka dadku diyaar yihiin, admin ayaa su'aalaha bilaabi doona._`
            )
        ],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tartan_bilow_next_${gameChId}`)
                .setLabel('🚀 Bilow Wareeg 1aad (Admin Only)')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`tartan_bilow_status_${gameChId}`)
                .setLabel('👥 Tirada Hadda')
                .setStyle(ButtonStyle.Secondary),
        )],
    });
    return true;
}

// ─────────────────────────────────────────────────────────────────────
// ?tartan — collect 3 channel IDs then show panel
// ─────────────────────────────────────────────────────────────────────
async function cmdAnnounce(message) {
    if (!isAdmin(message.author.id)) {
        return message.reply('⛔ Kaliya **admin** ayaa tartan ku dhawaaqin kara.');
    }

    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    if (activeTournament.has(guildId)) {
        return message.reply(`⚠️ Tartan horeba socdaa. Jooji marka hore: \`${PREFIX}tartan_jooji\``);
    }

    const filter  = m => m.author.id === message.author.id;
    const colOpts = { filter, max: 1, time: 60_000, errors: ['time'] };

    // Step 1 — Announcement channel ID
    const q1 = await message.reply('📢 **Gali ID Announcement channel-ka:**');
    let annChId;
    try {
        const col = await message.channel.awaitMessages(colOpts);
        annChId   = col.first().content.trim().replace(/[<#>]/g, '');
        await col.first().delete().catch(() => {});
    } catch {
        return q1.edit('⏰ Waqtiga ayaa dhamaaday. Isku day mar kale.').catch(() => {});
    }
    await q1.delete().catch(() => {});

    // Step 2 — Tournament (game) channel ID
    const q2 = await message.channel.send('🎮 **Gali ID Tournament chat channel-ka:**');
    let gameChId;
    try {
        const col = await message.channel.awaitMessages(colOpts);
        gameChId  = col.first().content.trim().replace(/[<#>]/g, '');
        await col.first().delete().catch(() => {});
    } catch {
        return q2.edit('⏰ Waqtiga ayaa dhamaaday. Isku day mar kale.').catch(() => {});
    }
    await q2.delete().catch(() => {});

    // Confirm
    const ok = await message.channel.send(
        `✅ **Ok!**\n` +
        `📢 Announcement: <#${annChId}>\n` +
        `🎮 Tournament chat: <#${gameChId}>\n\n` +
        `_Shaqada waa bilaabatay..._`
    );
    setTimeout(() => ok.delete().catch(() => {}), 5000);

    const state = {
        guildId,
        announceChannelId:    annChId,
        gameChannelId:        gameChId,
        adminId:              message.author.id,
        client:               message.client,
        stage:                'initial',
        roundIdx:             0,
        players:              new Set(),
        survivors:            new Set(),
        totalScores:          {},
        roundScores:          {},
        prevRoundQuestions:   [],
        _nextSurvivors:       null,
        questions:            [],
        currentQ:             0,
        questionOffset:       0,
        channel:              null,
        registrationDeadline: null,
        announceMsgId:        null,
        panelMsgId:           null,
        panelChannelId:       message.channel.id,
        _regTimer:            null,
    };
    activeTournament.set(guildId, state);
    persist(state);

    const panelMsg = await message.channel.send({
        embeds:     [buildAdminPanelEmbed(state)],
        components: buildAdminPanelButtons('initial', gameChId),
    });
    state.panelMsgId     = panelMsg.id;
    state.panelChannelId = message.channel.id;
    persist(state);
}

// ─────────────────────────────────────────────────────────────────────
// ?tartan_bilow
// ─────────────────────────────────────────────────────────────────────
async function cmdOpen(message) {
    if (!isAdmin(message.author.id)) return message.reply('⛔ Kaliya admin.');

    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    const state   = getState(guildId);
    if (!state) return message.reply(`⚠️ Tartan ma jiro. Ugu horreyn \`${PREFIX}tartan\` qoro.`);

    if (state.stage === 'registration') {
        if (state._regTimer) { clearTimeout(state._regTimer); state._regTimer = null; }
        await closeRegistration(state);
    }

    if (state.stage !== 'join') {
        return message.reply('⚠️ Tartan heer kale ayuu ku jiraa (play ama pause).');
    }

    const ok = await openGamePhase(message.client, message.author.id, state);
    if (!ok) return message.reply('⚠️ Game channel-ka la heyn waayay.');
    return message.reply(`✅ **Game channel waa la furay!** → <#${state.gameChannelId || GAME_CHANNEL_ID}>`);
}

// ─────────────────────────────────────────────────────────────────────
// ?isdiiwaangeli / ?diiwaan
// ─────────────────────────────────────────────────────────────────────
async function cmdRegister(message) {
    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    const state   = getState(guildId);
    if (!state || state.stage !== 'registration') {
        return message.reply('⚠️ Diiwaangelinta waa la xiray ama tartan ma jiro.');
    }
    await sendRegistrationCode(message.author, { reply: (o) => message.reply(o) }, state.gameChannelId, state.vcChannelId);
}

async function sendRegistrationCode(user, replyTarget, gameChId, vcChId) {
    const uid = user.id;
    const gCh = gameChId || GAME_CHANNEL_ID;
    const vCh = vcChId  || VC_CHANNEL_ID;

    function buildDesc(code) {
        return (
            `Code-kaaga gaarka ah waa:\n\n# \`${code}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `**Sidee u gasho:**\n` +
            `**1.** Marka admin game furo, tag <#${gCh}>\n` +
            `**2.** Qor: \`${PREFIX}gal ${code}\`\n\n` +
            `⚠️ Code-kan qof kale ha siinin — adiga oo keliya ayuu u shaqeeyaa!`
        );
    }

    // Already registered — resend existing code, don't generate a new one
    if (tournamentRegistry.has(uid)) {
        const existing = tournamentRegistry.get(uid);
        try {
            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🏁 Code-kaagii hore')
                    .setDescription(`Horay ayaad u diiwaangelisay, code-kaagii hore ayaan kuu soo celiyay:\n\n` + buildDesc(existing.code))
                    .setColor('#f39c12')
                    .setFooter({ text: 'Garaad Quiz Tournament' })],
            });
        } catch {}
        return replyTarget?.reply({ content: '⚠️ Horay ayaad u diiwaangelisay — code-gaagii hore ayaa DM-kaaga laguugu soo celiyay.', flags: 64 });
    }

    const code = genCode();
    tournamentRegistry.set(uid, { code, at: Date.now(), username: user.username });
    try {
        await user.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎉 Diiwaangelintii waa lagu guuleystay!')
                .setDescription(`Ku soo dhowow tartanka! Kan hoose waa code-kaaga:\n\n` + buildDesc(code))
                .setColor('#2ecc71')
                .setFooter({ text: 'Garaad Quiz Tournament' })],
        });
        return replyTarget?.reply({ content: '✅ Code-gaaga waa laguugu diray DM! Fur farrimahaaga gaarka ah.', flags: 64 });
    } catch {
        return replyTarget?.reply({ content: '❌ DM-kaaga ma furan. Settings → Privacy → Allow DMs ka fur, ka dibna isku day.', flags: 64 });
    }
}

// ─────────────────────────────────────────────────────────────────────
// ?gal [code]
// ─────────────────────────────────────────────────────────────────────
async function cmdJoin(message, args) {
    const guildId  = message.guild?.id || GAME_CHANNEL_ID;
    const state    = getState(guildId);
    const gameChId = state?.gameChannelId || GAME_CHANNEL_ID;
    const annChId  = state?.announceChannelId || ANNOUNCE_CHANNEL_ID;

    if (message.channel.id !== gameChId) {
        return message.reply(`⚠️ \`${PREFIX}gal\` kaliya <#${gameChId}> ku qor!`);
    }

    const code = (args[0] || '').trim().toUpperCase();
    if (!code) return message.reply(`⚠️ Code-ka qor! Tusaale: \`${PREFIX}gal ABC123\``);

    if (!state || state.stage !== 'join') {
        return message.reply(`⚠️ Albaabka tartanka weli ma furan. Sug admin.`);
    }

    const reg = tournamentRegistry.get(message.author.id);
    if (!reg || reg.code !== code) {
        return message.reply(
            `❌ **Code khalad** ama **maadan diiwaangelinin!**\n\n` +
            `• Haddii code-kaagu DM-ka ku jiro: hubi saxnimada\n` +
            `• Haddii kale: riix **📝 Diiwaan Geli** <#${annChId}>`
        );
    }
    if (state.players.has(message.author.id)) {
        return message.reply('✅ Mar hore ayaad tartanka ku jirtaa! Sug bilaabidda.');
    }

    state.players.add(message.author.id);
    state.totalScores[message.author.id] = 0;
    checkUser(message.author.id);
    persist(state);

    const list = [...state.players].map((id, i) => `${i + 1}. <@${id}>`).join('\n');
    return message.reply(
        `✅ **<@${message.author.id}> wuu ku biiray tartanka!** 🎉\n\n` +
        `**Ka qaybgalayaasha (${state.players.size}):**\n${list}`
    );
}

// ─────────────────────────────────────────────────────────────────────
// ?admin_next
// ─────────────────────────────────────────────────────────────────────
async function cmdAdminNext(message) {
    if (!isAdmin(message.author.id)) return message.reply('⛔ Kaliya admin.');
    message.delete().catch(() => {});

    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    const state   = getState(guildId);
    if (!state) return message.channel.send(`⚠️ Tartan ma jiro.`);

    if (state.prevRoundQuestions?.length > 0) {
        const recap  = state.prevRoundQuestions.map((q, i) => `**${i + 1}.** ${stripQuestionNumber(q.question)}\n↳ ✅ **${q.correct}**`).join('\n\n');
        const chunks = [];
        let cur      = '';
        for (const line of recap.split('\n\n')) {
            if ((cur + '\n\n' + line).length > 3800) { chunks.push(cur); cur = line; }
            else { cur = cur ? cur + '\n\n' + line : line; }
        }
        if (cur) chunks.push(cur);
        for (let i = 0; i < chunks.length; i++) {
            await message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋 ${ROUND_LABELS[state.roundIdx]?.name || 'Wareeg'} — Su'aalihii & Jawaabihii${chunks.length > 1 ? ` (${i+1}/${chunks.length})` : ''}`)
                    .setDescription(chunks[i])
                    .setColor('#7f8c8d')],
            });
        }
        state.prevRoundQuestions = [];
    }

    const gameChannel = state.channel || await message.client.channels.fetch(state.gameChannelId || GAME_CHANNEL_ID).catch(() => null);
    if (!gameChannel) return message.channel.send('⚠️ Game channel-ka la heyn waayay.');

    if (state.stage === 'join') {
        if (state.players.size < TOURNAMENT_MIN_PLAYERS) {
            return gameChannel.send(`⚠️ Ugu yaraan **${TOURNAMENT_MIN_PLAYERS}** qof. Hadda: **${state.players.size}**`);
        }
        state.survivors = new Set(state.players);
        state.roundIdx  = 1;
        state.channel   = gameChannel;
        return beginRound(state, gameChannel);
    }
    if (state.stage === 'pause') {
        const next           = state._nextSurvivors || [];
        state.survivors      = new Set(next);
        state._nextSurvivors = null;
        if (state.survivors.size === 0) {
            activeTournament.delete(guildId);
            persistDelete(guildId);
            return gameChannel.send('❌ Cidna kuma hartay — tartan waa la joojiyay.');
        }
        state.roundIdx += 1;
        state.channel   = gameChannel;
        return beginRound(state, gameChannel);
    }
    return message.channel.send('⚠️ Hadda admin_next looma isticmaali karo — sug wareeggu dhammaado.');
}

// ─────────────────────────────────────────────────────────────────────
// ?tartan_jooji
// ─────────────────────────────────────────────────────────────────────
async function cmdStop(message) {
    if (!isAdmin(message.author.id)) return message.reply('⛔ Kaliya admin.');
    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    const state   = getState(guildId);
    if (!state) return message.reply('⚠️ Tartan ma jiro.');
    if (state?._regTimer) clearTimeout(state._regTimer);
    activeTournament.delete(guildId);
    activeTournament.delete(GAME_CHANNEL_ID);
    persistDelete(guildId);
    return message.reply('🛑 **Tartan-ka waa la joojiyay.**');
}

// ─────────────────────────────────────────────────────────────────────
// ?tartan_status
// ─────────────────────────────────────────────────────────────────────
async function cmdStatus(message) {
    const guildId = message.guild?.id || GAME_CHANNEL_ID;
    const state   = getState(guildId);
    if (!state) return message.reply('⚠️ Hadda ma jiro tartan soconaya.');

    const stageLabels = {
        registration: '📝 Diiwaangelinta socotaa (24h)',
        join:         '🟢 Albaabka furan — `?gal CODE`',
        play:         '🔴 Wareeggu socdaa',
        pause:        '🟡 Joog — admin sug `?admin_next`',
    };
    const regCount = tournamentRegistry.size;

    const sorted = [...state.survivors]
        .map(id => [id, state.totalScores[id] || 0])
        .sort((a, b) => b[1] - a[1]);

    const board = sorted.slice(0, 8).map(([id, sc], i) => {
        const icon = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        return `${icon} <@${id}> — **${sc}pts**`;
    }).join('\n') || '_Ma jiraan ka qaybgalayaal_';

    const totalQ   = state.questions?.length || 0;
    const answered = state.currentQ || 0;

    await message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('📊 Tartan — Xaaladda Hadda')
            .setDescription(
                `**Xaaladda:** ${stageLabels[state.stage] || state.stage}\n` +
                `**Wareeg:** ${ROUND_LABELS[state.roundIdx]?.name || '—'}\n` +
                `**Diiwaangeliyay:** ${regCount} qof\n` +
                `**Tartamayaasha:** ${state.survivors.size || state.players.size} qof\n` +
                (totalQ > 0 ? `**Su'aalo hadhay:** ${Math.max(0, totalQ - answered)} / ${totalQ}\n\n` : '\n') +
                `**🏅 Dhibcaha:**\n${board}`
            )
            .setColor('#3498db')
            .setFooter({ text: 'Garaad Quiz — Tartan Status' })],
    });
}

// ─────────────────────────────────────────────────────────────────────
// beginRound
// ─────────────────────────────────────────────────────────────────────
async function beginRound(state, channel) {
    state.channel = channel;
    const n    = roundQuestionCount(state.roundIdx);
    const meta = ROUND_LABELS[state.roundIdx];

    const pool = getAllQuestionsForGame('tournament');
    if (!pool.length) {
        const guildId = state.guildId || GAME_CHANNEL_ID;
        activeTournament.delete(guildId);
        return channel.send({ embeds: [noQuestionsLeftEmbed('Admin')] });
    }

    // Pick unseen questions for all survivors combined
    const survivorIds = [...state.survivors];
    const useN = n;
    let picked = pickQuestionsForUsers(survivorIds, 'tournament', useN);

    // If not enough unseen questions, fall back to offset cycling (no crash)
    if (!picked || picked.length < useN) {
        if (!state.questionOffset) state.questionOffset = 0;
        const fallback = Array.from({ length: useN }, (_, i) => {
            const idx = (state.questionOffset + i) % pool.length;
            return { ...pool[idx], _idx: idx };
        });
        state.questionOffset = (state.questionOffset + useN) % pool.length;
        picked = fallback;
    }

    state.questions          = picked;
    state.prevRoundQuestions = [];
    state.currentQ           = 0;
    state.roundScores        = {};
    for (const id of state.survivors) state.roundScores[id] = 0;
    state.stage = 'play';
    persist(state);

    for (const id of state.survivors) markUserPlayed(id);

    let elimInfo = '';
    if (state.roundIdx === 1) {
        const toElim = Math.max(1, Math.floor(state.survivors.size / 6));
        const toKeep = Math.max(2, state.survivors.size - toElim);
        elimInfo = `⚠️ Dhammaadka: **${toElim}** qof baxayaa — **${toKeep}** qof Wareeg 2-da galeysa`;
    } else if (state.roundIdx === 2) {
        const toElim = Math.max(1, Math.floor(state.survivors.size / 5));
        const afterE = Math.max(2, state.survivors.size - toElim);
        const toFin  = Math.max(2, Math.floor(afterE / 2));
        elimInfo = `⚠️ Dhammaadka: **${toFin}** qof kaliya Final-ka galeysa`;
    } else {
        elimInfo = `🏆 **Final** — Guuleystaha hal qof! **Champion 🏆** title!`;
    }

    const playersList = [...state.survivors].map((id, i) => `${i + 1}. <@${id}>`).join('\n');

    await channel.send({
        embeds: [new EmbedBuilder()
            .setTitle(`🔥 ${meta.name} — Bilaabmay!`)
            .setDescription(
                `${state.survivors.size} qof ayaa tartamaya · ${useN} su'aalood\n` +
                `⚡ Xawliga ayaa dhibcaha go'aamiya — hore u bixi!\n\n` +
                `${elimInfo}\n\n` +
                `**Tartamayaasha:**\n${playersList}\n\n` +
                `_Su'aalaha waxay bilaabmayaan 3 ilbiriqsi gudahood — diyaar noqo!_`
            )
            .setColor(meta.color)],
    });

    setTimeout(() => sendQuestion(state), 3000);
}

// ─────────────────────────────────────────────────────────────────────
// sendQuestion
// ─────────────────────────────────────────────────────────────────────
async function sendQuestion(state) {
    const guildId  = state.guildId || GAME_CHANNEL_ID;
    const gameChId = state.gameChannelId || GAME_CHANNEL_ID;
    if (!activeTournament.has(guildId) && !activeTournament.has(GAME_CHANNEL_ID)) return;
    if (state.stage !== 'play') return;
    const totalQ = state.questions.length;

    if (state.currentQ >= totalQ) {
        for (const id of state.survivors) {
            state.totalScores[id] = (state.totalScores[id] || 0) + (state.roundScores[id] || 0);
        }
        if (state.roundIdx === 3) return finishTournament(state);
        return endRoundPause(state);
    }

    const channel = state.channel;
    if (!channel) { activeTournament.delete(guildId); return; }

    const q         = state.questions[state.currentQ];
    const playerIds = [...state.survivors];
    markSeenForUsersInGame(playerIds, 'tournament', q._idx);
    saveData();

    state.prevRoundQuestions.push({ question: q.question, correct: q.correct });

    const answeredBy     = new Set();
    const correctAnswers = [];
    const startTime      = Date.now();

    const meta    = ROUND_LABELS[state.roundIdx];
    const isTF    = ['tf', 'truefalse', 'bool'].includes((q.type || '').toLowerCase());
    const typeTag = isTF ? '🔀 **Run / Been**' : '📝 **ABCD**';

    const embed = new EmbedBuilder()
        .setTitle(`🏁 ${meta.name} — Su'aal ${state.currentQ + 1}/${totalQ}`)
        .setDescription(
            `## ${stripQuestionNumber(q.question)}\n\n` +
            `${typeTag} · ⏱️ ${GLOBAL_WAIT_MS / 1000}s\n` +
            `⚡ < 5s = **40pts** · 18s = **5pts** — tartamayaasha: **${state.survivors.size}**`
        )
        .setColor(meta.color);

    const qEntries = getAnswerOptions(q);
    if (qEntries.length === 0) {
        state.currentQ++;
        setTimeout(() => sendQuestion(state), 400);
        return;
    }

    const correctLabel = qEntries.find(e => e.isCorrect)?.label ?? String(q.correct);

    const buttons = qEntries.map((e, index) =>
        new ButtonBuilder()
            .setCustomId(`tna_${gameChId}_${state.roundIdx}_${state.currentQ}_${index}_${e.isCorrect ? 't' : 'f'}`)
            .setLabel(e.label.slice(0, 80))
            .setStyle(isTF
                ? (e.label === 'Run' ? ButtonStyle.Success : ButtonStyle.Danger)
                : ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);
    const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (!msg) { activeTournament.delete(guildId); return; }

    const prefix    = `tna_${gameChId}_${state.roundIdx}_${state.currentQ}_`;
    const filter    = (i) => i.customId.startsWith(prefix);
    const collector = msg.createMessageComponentCollector({ filter, time: GLOBAL_WAIT_MS });

    collector.on('collect', async (interaction) => {
        const uid = interaction.user.id;
        if (!state.survivors.has(uid)) {
            return interaction.reply({ content: '⚠️ Tartankan kuma jirtid — jawaabi kari mayside.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        if (answeredBy.has(uid)) {
            return interaction.reply({ content: '⚠️ Mar hore ayaad jawaab bixisay!', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        answeredBy.add(uid);
        const isCorrect = interaction.customId.endsWith('_t');
        const timeTaken = Date.now() - startTime;

        if (isCorrect) {
            const pts  = calcScore(timeTaken);
            const rank = correctAnswers.length + 1;
            correctAnswers.push({ uid, timeMs: timeTaken, pts });
            const medal = ['🥇', '🥈', '🥉'][rank - 1] || `${rank}aad`;
            await interaction.reply({
                content: `✅ **SAX!** ${medal} — **+${pts} pts** (${(timeTaken / 1000).toFixed(1)}s)`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Khalad. Isku day su\'aasha xiga!', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });

    collector.on('end', async () => {
        for (const { uid, pts } of correctAnswers) {
            state.roundScores[uid] = (state.roundScores[uid] || 0) + pts;
        }

        let resultLine;
        if (correctAnswers.length === 0) {
            resultLine = `⏰ Cidna si sax ah uma jawaabin.\n✅ Jawaabta saxda: **${correctLabel}**`;
        } else {
            const topList = correctAnswers.slice(0, 5)
                .map(({ uid, timeMs, pts }, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
                    return `${medal} <@${uid}> — ${(timeMs / 1000).toFixed(1)}s → **+${pts}pts**`;
                }).join('\n');
            resultLine = `✅ Jawaabta saxda: **${correctLabel}**\n\n${topList}`;
        }

        const board = [...state.survivors]
            .map(id => [id, state.roundScores[id] || 0])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([id, sc], i) => `${i + 1}. <@${id}> — **${sc}pts**`)
            .join('\n');

        const sumEmbed = EmbedBuilder.from(embed)
            .setDescription(`## ${stripQuestionNumber(q.question)}\n\n${resultLine}\n\n📊 **Dhibcaha Wareegga:**\n${board || '—'}`);

        await msg.edit({ embeds: [sumEmbed], components: [] }).catch(() => {});
        state.currentQ += 1;
        persist(state);
        setTimeout(() => sendQuestion(state), 2500);
    });
}

// ─────────────────────────────────────────────────────────────────────
// endRoundPause — 1 daqiiqad discussion, kadibna toos bilaab
// ─────────────────────────────────────────────────────────────────────
async function endRoundPause(state) {
    const channel        = state.channel;
    const nextSurvivors  = computeSurvivors(state.survivors, state.roundScores, state.roundIdx);
    state._nextSurvivors = nextSurvivors;
    state.stage          = 'pause';
    state.roundScores    = {};
    persist(state);
    if (!channel) return;

    const eliminated = [...state.survivors].filter(id => !nextSurvivors.includes(id));
    const remaining  = nextSurvivors;

    const totalBoard = [...state.survivors]
        .map(id => [id, state.totalScores[id] || 0])
        .sort((a, b) => b[1] - a[1])
        .map(([id, sc], i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
            const tag   = eliminated.includes(id) ? '❌ Eliminated' : '✅ Qualified';
            return `${medal} <@${id}> — **${sc}pts** · ${tag}`;
        }).join('\n');

    const nextRoundName = state.roundIdx === 1
        ? `Wareegga 2aad (${TOURNAMENT_R2_QUESTIONS} su'aalood)`
        : `Final 🏆 (${TOURNAMENT_FINAL_QUESTIONS} su'aalood)`;

    const remainingList  = remaining.map((id, i) => `🔥 ${i + 1}. <@${id}>`).join('\n');
    const eliminatedList = eliminated.length > 0
        ? eliminated.map(id => `❌ <@${id}>`).join('\n')
        : '_Cidna ma bixin_';

    const vcChId = state.vcChannelId || VC_CHANNEL_ID;

    // Results + discussion countdown
    await channel.send({
        embeds: [new EmbedBuilder()
            .setTitle(`⏸️ ${ROUND_LABELS[state.roundIdx].name} — Waa Dhamaaday`)
            .setColor('#f39c12')
            .setDescription(
                `**Dhibcaha Guud:**\n${totalBoard}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                (eliminated.length > 0
                    ? `**Baxay (${eliminated.length}):**\n${eliminatedList}\n\n`
                    : '') +
                `**Wareega soo socda — ${nextRoundName}:**\n${remainingList}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                
                `⏰ Wareegga xiga wuxuu bilaabmayaa **1 daqiiqad gudahood** — ha moodin!`
            )
            .setFooter({ text: 'Toos ayuu bilaabmayaa' })],
    });

    // Auto-advance after 60 seconds
    setTimeout(async () => {
        const guildId = state.guildId || GAME_CHANNEL_ID;
        if (!activeTournament.has(guildId) && !activeTournament.has(GAME_CHANNEL_ID)) return;
        if (state.stage !== 'pause') return;

        const next = state._nextSurvivors || [];
        state.survivors      = new Set(next);
        state._nextSurvivors = null;

        if (state.survivors.size === 0) {
            activeTournament.delete(guildId);
            return channel.send('❌ Cidna kuma hartay — tartan waa la joojiyay.');
        }

        state.roundIdx += 1;

        // Encourage message before starting
        const encourageList = [...state.survivors].map(id => `<@${id}>`).join(' ');
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`🚀 ${ROUND_LABELS[state.roundIdx]?.name || 'Wareeg Cusub'} — Diyaar noqda!`)
                .setColor('#2ecc71')
                .setDescription(
                    `${encourageList}\n\n` +
                    `Waxaad gaartay halkan — guusha waxay kaa fog tahay su'aal! Sii wad xoogga.\n\n` +
                    `_Su'aalaha waxay bilaabmayaan 3 ilbiriqsi gudahood..._`
                )],
        });

        await beginRound(state, channel);
    }, 60_000);
}

// ─────────────────────────────────────────────────────────────────────
// finishTournament
// ─────────────────────────────────────────────────────────────────────
async function finishTournament(state) {
    const channel = state.channel;
    const guildId = state.guildId || GAME_CHANNEL_ID;
    activeTournament.delete(guildId);
    activeTournament.delete(GAME_CHANNEL_ID);
    persistDelete(guildId);

    const sorted = [...state.survivors]
        .map(id => [id, state.totalScores[id] || 0])
        .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        if (channel) await channel.send({ embeds: [new EmbedBuilder().setTitle('🏁 Tartan').setDescription('Cidna kuma hadhin.').setColor('#95a5a6')] });
        return;
    }

    const [winId, winScore] = sorted[0];

    checkUser(winId);
    if (!userData[winId].ownedTitles) userData[winId].ownedTitles = [];
    if (!userData[winId].ownedTitles.includes('champion')) userData[winId].ownedTitles.push('champion');
    userData[winId].activeTitle = 'champion';
    checkEconUser(winId);
    saveEcon();
    saveData();

    const prizes = ['$15', '$10', '$5'];
    const allScores = sorted.map(([id, sc], i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const prize = prizes[i] ? ` · **${prizes[i]}**` : '';
        const extra = i === 0 ? ' 👑' : '';
        return `${medal} <@${id}> — **${sc}pts**${prize}${extra}`;
    }).join('\n');

    if (channel) {
        await channel.send({
            content: '@everyone',
            embeds: [new EmbedBuilder()
                .setTitle('🏆 Tartanka Waa Dhamaaday!')
                .setDescription(
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `👑 **Guuleystaha**\n` +
                    `## <@${winId}>\n` +
                    `Hambalyo! 🏆 **Champion** title ayaa kuu galay.\n` +
                    `Dhibcahaaga guud: **${winScore}pts** · Abaalmarintaada: **$15**\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `**Natiijada Guud:**\n\n${allScores}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Mahadsanid dhammaan ka qaybgalay! Tartanka xiga idinla kulannaa. 🎉`
                )
                .setColor('#FFD700')
                .setFooter({ text: 'Garaad Quiz Tournament' })],
        });
    }

    try {
        const winUser = await state.client.users.fetch(winId);
        await winUser.send({
            embeds: [new EmbedBuilder()
                .setTitle('🏆 Hambalyo!')
                .setColor('#FFD700')
                .setDescription(
                    `Adiga ayaa tartanka ku guulaysatay — taas waa wax weyn! 👑\n\n` +
                    `🏆 **Champion** title ayaa kuu galay\n` +
                    `📊 Dhibcahaaga guud: **${winScore}pts**\n` +
                    `💵 Abaalmarintaada **$15** — admin ayaa kula xiriiri doona dhow.\n\n` +
                    `Mahadsanid ka qaybgalashadaada. 🎉`
                )
            ],
        });
    } catch {}

    const dmPrizes = ['$10', '$5'];
    const dmColors = ['#95a5a6', '#cd7f32'];
    const dmMedals = ['🥈', '🥉'];
    for (const [idx, [pid, sc]] of sorted.slice(1).entries()) {
        const place = idx + 2;
        const prize = dmPrizes[idx] ? `💵 Abaalmarintaada **${dmPrizes[idx]}** — admin ayaa kula xiriiri doona.\n` : '';
        const medal = dmMedals[idx] || `${place}aad`;
        const color = dmColors[idx] || '#7f8c8d';
        try {
            const u = await state.client.users.fetch(pid);
            await u.send({
                embeds: [new EmbedBuilder()
                    .setTitle(`${medal} Tartanka — Aad baad u fiicnaatay!`)
                    .setColor(color)
                    .setDescription(
                        `Mahadsanid ka qaybgalashadaada — si fiican ayaad u tartantay! 🎉\n\n` +
                        `📊 Heerkaaga: **${place}aad** · Dhibcahaaga: **${sc}pts**\n` +
                        `${prize}\n` +
                        `Tartanka xiga sug — weli xoog baad leedahay!`
                    )
                ],
            });
        } catch {}
    }
}

// ─────────────────────────────────────────────────────────────────────
// Restore tournaments from MongoDB after bot restart
// ─────────────────────────────────────────────────────────────────────
async function restoreTournaments(client) {
    let docs;
    try {
        docs = await loadTournamentStates();
    } catch (e) {
        console.error('[Tournament] Restore load error:', e.message);
        return;
    }
    if (!docs || docs.length === 0) return;

    let restored = 0;
    for (const doc of docs) {
        if (!doc.guildId || !doc.stage) continue;

        // Rebuild registry for this guild
        if (Array.isArray(doc.registry)) {
            for (const [uid, entry] of doc.registry) {
                if (!tournamentRegistry.has(uid)) {
                    tournamentRegistry.set(uid, entry);
                }
            }
        }

        const state = {
            guildId:              doc.guildId,
            announceChannelId:    doc.announceChannelId    || ANNOUNCE_CHANNEL_ID,
            gameChannelId:        doc.gameChannelId        || GAME_CHANNEL_ID,
            vcChannelId:          doc.vcChannelId          || VC_CHANNEL_ID,
            adminId:              doc.adminId              || null,
            panelChannelId:       doc.panelChannelId       || null,
            panelMsgId:           doc.panelMsgId           || null,
            announceMsgId:        doc.announceMsgId        || null,
            registrationDeadline: doc.registrationDeadline || null,
            stage:                doc.stage,
            roundIdx:             doc.roundIdx             || 0,
            currentQ:             doc.currentQ             || 0,
            questionOffset:       doc.questionOffset       || 0,
            players:              new Set(doc.players      || []),
            survivors:            new Set(doc.survivors    || []),
            totalScores:          doc.totalScores          || {},
            roundScores:          doc.roundScores          || {},
            prevRoundQuestions:   doc.prevRoundQuestions   || [],
            _nextSurvivors:       doc._nextSurvivors       || null,
            questions:            doc.questions            || [],
            channel:              null,
            _regTimer:            null,
            client,
        };

        // Fetch the game channel
        if (state.gameChannelId) {
            state.channel = await client.channels.fetch(state.gameChannelId).catch(() => null);
        }

        if (state.stage === 'registration') {
            const remaining = state.registrationDeadline
                ? state.registrationDeadline - Date.now()
                : 0;
            if (remaining > 0) {
                // Restart registration timer for remaining time
                state._regTimer = setTimeout(() => closeRegistration(state), remaining);
                console.log(`[Tournament] ↩️  Registration timer restarted (${Math.round(remaining / 60000)}min left)`);
            } else {
                // Deadline passed during downtime — close registration
                state.stage = 'join';
            }
        }

        if (state.stage === 'play') {
            // Can't resume mid-round (collectors dead) — convert to pause then auto-resume
            state.stage = 'pause';
            // All survivors advance from the interrupted round (no unfair elimination)
            if (!state._nextSurvivors) {
                state._nextSurvivors = [...state.survivors];
            }
            // Roll back Final so it re-runs (roundIdx += 1 happens on advance)
            if (state.roundIdx === 3) state.roundIdx = 2;

            if (state.channel) {
                await state.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ Bot Wuu Dib Bilaabmay — Wareeggu Wuu Joojiyay')
                        .setColor('#e74c3c')
                        .setDescription(
                            `Bot restart ayaa dhacay ciyaarta dhex maraysay.\n\n` +
                            `**Wareegga:** ${ROUND_LABELS[state.roundIdx]?.name || `Wareeg ${state.roundIdx}`}\n` +
                            `**Tartamayaasha:** ${state.survivors.size} qof\n\n` +
                            `⏳ Wareegga xiga wuxuu si toos ah u bilaabmayaa **30 ilbiriqsi gudahood**!`
                        )
                    ],
                }).catch(() => {});
            }

            // Auto-resume: advance to next round after 30s without requiring admin
            const autoState  = state;
            const autoGuildId = doc.guildId;
            setTimeout(async () => {
                const cur = activeTournament.get(autoGuildId);
                if (!cur || cur.stage !== 'pause') return;
                const next = cur._nextSurvivors || [];
                cur.survivors      = new Set(next);
                cur._nextSurvivors = null;
                if (cur.survivors.size === 0) {
                    activeTournament.delete(autoGuildId);
                    persistDelete(autoGuildId);
                    if (cur.channel) cur.channel.send('❌ Cidna kuma hartay — tartan waa la joojiyay.').catch(() => {});
                    return;
                }
                cur.roundIdx += 1;
                if (cur.channel) {
                    const encourageList = [...cur.survivors].map(id => `<@${id}>`).join(' ');
                    await cur.channel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle(`🚀 ${ROUND_LABELS[cur.roundIdx]?.name || 'Wareeg Cusub'} — Dib u bilaabmay!`)
                            .setColor('#2ecc71')
                            .setDescription(
                                `${encourageList}\n\n` +
                                `Bot wuu dib bilaabmay — wareegu si toos ah ayuu u sii wadaa!\n\n` +
                                `_Su'aalaha waxay bilaabmayaan 3 ilbiriqsi gudahood..._`
                            )],
                    }).catch(() => {});
                    await beginRound(cur, cur.channel).catch(e => {
                        console.error('[Tournament Auto-Resume]', e.message);
                    });
                }
            }, 30_000);
        }

        activeTournament.set(doc.guildId, state);
        restored++;

        // Refresh admin panel so it shows current state
        await updateAdminPanel(state).catch(() => {});
        // Re-persist with updated stage
        persist(state);

        console.log(`[Tournament] ✅ Restored guild ${doc.guildId} — stage: ${state.stage}, round: ${state.roundIdx}, survivors: ${state.survivors.size}`);
    }

    if (restored > 0) {
        console.log(`[Tournament] ✅ ${restored} tournament(s) restored from database`);
    }
}

module.exports = {
    cmdAnnounce,
    cmdRegister,
    cmdOpen,
    cmdJoin,
    cmdAdminNext,
    cmdStop,
    cmdStatus,
    beginRound,
    openGamePhase,
    sendRegistrationCode,
    handlePanelButton,
    restoreTournaments,
    GAME_CHANNEL_ID,
    ANNOUNCE_CHANNEL_ID,
};
