// =====================================================================
// GARAAD BOT - Maareynta Isdhexgalka (Interaction Handler)
// =====================================================================

const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { handleSoloAnswer, handleSoloLeaderboard, handleSoloReplay, handleSoloReplayCount } = require('../games/solo');
const { startDuelGame }     = require('../games/duel');
const { beginQuizGame, refreshLobby: refreshQuizLobby } = require('../games/quiz');
const { handleMissionClaim } = require('../../data/commands/missions');
const { beginRound, openGamePhase, sendRegistrationCode, handlePanelButton, GAME_CHANNEL_ID, ANNOUNCE_CHANNEL_ID } = require('../games/tournament');
const { deleteTournamentState } = require('../utils/tournamentPersist');
const { userData, activeQuiz, activeDuels, activeTournament, isUserBusy, tournamentRegistry } = require('../store');
const { checkUser }         = require('../utils/helpers');
const { isAdmin }           = require('../utils/admin');
const { QUIZ_MIN_PLAYERS, QUIZ_MAX_PLAYERS, DUEL_STAKE_IQ, TOURNAMENT_MIN_PLAYERS, TOURNAMENT_R1_QUESTIONS, TOURNAMENT_R2_QUESTIONS, TOURNAMENT_FINAL_QUESTIONS } = require('../config');
const { buildEduEmbed, buildEcoEmbed, buildGamesEmbed, buildPlayerEmbed, buildShopEmbed: buildHelpShopEmbed, helpRow } = require('../../data/commands/help');

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

const OWNER_ID   = '1191096205955055690';
const OWNER_PASS = '2001';

async function notifyAdmins(client, adminUser, action) {
    try {
        const { listAdmins } = require('../utils/admin');
        const recipients = new Set([OWNER_ID, ...listAdmins()]);
        recipients.delete(adminUser.id);
        const msg =
            `🔐 **Admin Action Log**\n` +
            `👤 Admin: **${adminUser.username}** (\`${adminUser.id}\`)\n` +
            `⚙️ Action: ${action}\n` +
            `🕐 ${new Date().toUTCString()}`;
        for (const uid of recipients) {
            const u = await client.users.fetch(uid).catch(() => null);
            if (u) await u.send(msg).catch(() => {});
        }
    } catch {}
}

module.exports = function setupInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {

        if (interaction.isModalSubmit()) {
            const { saveData } = require('../utils/helpers');

            if (interaction.customId.startsWith('tiro_pick_modal_')) {
                return require('../games/numberGuess').handlePickSubmit(interaction);
            }
            if (interaction.customId.startsWith('sheeko_modal_')) {
                return require('../games/sheeko').handleSheekoModal(interaction);
            }

            // ── Treasury modals (admins only) ──
            if (interaction.customId.startsWith('trs_m_')) {
                const ownerId = interaction.customId.split('_').slice(3).join('_');
                if (interaction.user.id !== ownerId || !isAdmin(ownerId))
                    return interaction.reply({ content: '⛔ Admin only, and use your own treasury panel.', flags: MessageFlags.Ephemeral });
                const { getTreasury, setTreasury, topUpTreasury, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const { buildTreasuryEmbed, treasuryRow } = require('../../data/commands/economy/treasuryCmd');
                const rawAmount = interaction.fields.getTextInputValue('amount').replace(/,/g, '').trim();
                const amount    = parseFloat(rawAmount);
                const t         = getTreasury();

                if (interaction.customId.startsWith('trs_m_add_')) {
                    if (isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                    topUpTreasury(amount);
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(ownerId)] });
                    return;
                }

                if (interaction.customId.startsWith('trs_m_reduce_')) {
                    if (isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                    if (amount > t.balance)
                        return interaction.reply({ content: `⚠️ Amountas ka weyn treasury. Current: **🪙 ${fmt(t.balance)}**`, flags: MessageFlags.Ephemeral });
                    t.balance -= amount;
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(ownerId)] });
                    return;
                }

                if (interaction.customId.startsWith('trs_m_set_')) {
                    if (isNaN(amount) || amount < 0)
                        return interaction.reply({ content: '⚠️ Enter a valid amount (0 ama ka weyn).', flags: MessageFlags.Ephemeral });
                    setTreasury(amount);
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(ownerId)] });
                    return;
                }
            }


            // ── Give: amount modal submit ──
            if (interaction.customId.startsWith('eco_gvmod_')) {
                const rest     = interaction.customId.replace('eco_gvmod_', '');
                const parts    = rest.split('_');
                const ownerId  = parts[parts.length - 1];
                const targetId = parts[parts.length - 2];
                const asset    = parts[0];

                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                }

                const amount = Math.floor(Number(interaction.fields.getTextInputValue('eco_gv_amount')));
                if (!Number.isSafeInteger(amount) || amount <= 0) {
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 200).', flags: MessageFlags.Ephemeral });
                }
                if (asset !== 'coins') {
                    return interaction.reply({ content: '⚠️ This transfer panel is outdated. Coins are the only supported currency.', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser, saveEcon, recordDailyCoinTransfer, DAILY_COIN_TRANSFER_LIMIT } = require('../economy/econStore');
                const { ASSET_LABELS, closeRow } = require('../../data/commands/economy/give');
                checkEconUser(ownerId);
                checkEconUser(targetId);
                const sender = eData[ownerId];
                const recv   = eData[targetId];

                if ((sender.coins || 0) < amount) {
                    return interaction.reply({ content: `⚠️ You do not have enough Coins. Wallet balance: **${sender.coins || 0}**.`, flags: MessageFlags.Ephemeral });
                }

                const transfer = recordDailyCoinTransfer(ownerId, amount);
                if (!transfer.ok) {
                    return interaction.reply({ content: `⚠️ Daily transfer limit: **${DAILY_COIN_TRANSFER_LIMIT.toLocaleString()} Coins**. Remaining today: **🪙${transfer.remaining.toLocaleString()}**.`, flags: MessageFlags.Ephemeral });
                }

                sender.coins -= amount;
                recv.coins = (recv.coins || 0) + amount;
                saveEcon();

                return interaction.update({ embeds: [
                    new EmbedBuilder()
                        .setTitle('💸 Coins Sent')
                        .setColor('#2ecc71')
                        .setDescription(
                            `✅ Sent **${amount} ${ASSET_LABELS[asset]}** to <@${targetId}>.\n` +
                            `Your remaining balance: **${sender.coins} Coins**.`
                        )
                        .setFooter({ text: 'Garaad Economy' }),
                ], components: [closeRow(ownerId)] });
            }

            // ── Ebank: amount modal submit ──
            if (interaction.customId.startsWith('eco_ebmod_') && !interaction.customId.startsWith('eco_ebmod_transfer_')) {
                const rest     = interaction.customId.replace('eco_ebmod_', '');
                const parts    = rest.split('_');
                const ownerId  = parts[parts.length - 1];
                const bank     = parts[parts.length - 2];
                const action   = parts[0];

                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                }

                const amount = parseInt(interaction.fields.getTextInputValue('eco_eb_amount'));
                if (!amount || isNaN(amount) || amount <= 0) {
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 500).', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { closeRow } = require('../../data/commands/economy/ebank');
                checkEconUser(ownerId);
                const d         = eData[ownerId];
                const bankLabel = bank.charAt(0).toUpperCase() + bank.slice(1);

                if (action === 'deposit') {
                    if ((d.coins || 0) < amount) {
                        return interaction.reply({ content: `⚠️ Not enough Coins. Wallet: **🪙 ${(d.coins || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                    }
                    d.coins         = (d.coins || 0) - amount;
                    d.banks[bank] += amount;
                    saveEcon();
                    return interaction.update({ embeds: [new EmbedBuilder()
                        .setTitle('🏦 Deposit — Success!')
                        .setColor('#27ae60')
                        .addFields(
                            { name: '💰 Deposited',     value: `**+🪙 ${amount.toLocaleString()}**`,          inline: true },
                            { name: '🏦 Bank Balance',  value: `**🪙 ${d.banks[bank].toLocaleString()}**`,    inline: true },
                            { name: '💳 Wallet',        value: `**🪙 ${(d.coins||0).toLocaleString()}**`,      inline: true },
                        )
                        .setFooter({ text: 'Garaad Bank • 1% daily interest on deposits' }),
                    ], components: [closeRow(ownerId)] });
                } else {
                    const bankBal = d.banks?.[bank] || 0;
                    if (bankBal < amount) {
                        return interaction.reply({ content: `⚠️ Garaad Bank enough for you do not have. You have: **🪙 ${bankBal.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                    }
                    d.banks        = d.banks || {};
                    d.banks[bank] -= amount;
                    d.coins          = (d.coins || 0) + amount;
                    saveEcon();
                    return interaction.update({ embeds: [new EmbedBuilder()
                        .setTitle('🏦 Withdrawal — Success!')
                        .setColor('#2980b9')
                        .addFields(
                            { name: '💰 Withdrawn',     value: `**-🪙 ${amount.toLocaleString()}**`,          inline: true },
                            { name: '🏦 Bank Balance',  value: `**🪙 ${d.banks[bank].toLocaleString()}**`,    inline: true },
                            { name: '💳 Wallet',        value: `**🪙 ${(d.coins||0).toLocaleString()}**`,      inline: true },
                        )
                        .setFooter({ text: 'Garaad Bank • Funds available instantly' }),
                    ], components: [closeRow(ownerId)] });
                }
            }

            // ── Ebank: bank transfer modal submit ──
            if (interaction.customId.startsWith('eco_ebmod_transfer_')) {
                const ownerId  = interaction.customId.replace('eco_ebmod_transfer_garaad_', '');
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const targetInput = interaction.fields.getTextInputValue('eco_eb_target').trim();
                const bankInput   = (interaction.fields.getTextInputValue('eco_eb_bankname') || '').trim().toLowerCase();
                const amount      = parseInt(interaction.fields.getTextInputValue('eco_eb_amount'));

                if (!amount || isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 500).', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon, addToTreasury, getSpendableCoins, spendCoins } = require('../economy/econStore');
                const { addTx, getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                const { closeRow } = require('../../data/commands/economy/ebank');
                checkEconUser(ownerId);

                // Find target by username or user ID
                let targetId = null;
                const rawId = targetInput.replace(/[<@!>]/g, '');
                if (/^\d{17,19}$/.test(rawId)) {
                    targetId = rawId;
                } else {
                    const found = Object.entries(eData).find(([, d]) =>
                        d?.username?.toLowerCase() === targetInput.toLowerCase()
                    );
                    if (found) targetId = found[0];
                }
                if (!targetId)
                    return interaction.reply({ content: `⚠️ **"${targetInput}"** — player not found. Username ama ID saxan geli.`, flags: MessageFlags.Ephemeral });
                if (targetId === ownerId)
                    return interaction.reply({ content: '⚠️ Adiga nafta uma dirin kartid.', flags: MessageFlags.Ephemeral });

                checkEconUser(targetId);
                const sender = eData[ownerId];
                if ((sender.banks?.garaad || 0) < amount)
                    return interaction.reply({ content: `⚠️ Garaad Bank-kaagu is not enough. You have: **🪙${(sender.banks?.garaad || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });

                const TRANSFER_TAX = 0.05;
                const tax      = Math.max(1, Math.floor(amount * TRANSFER_TAX));
                const received = amount - tax;
                sender.banks.garaad -= amount;
                addToTreasury(tax);

                let destLabel = '';
                const receiver = eData[targetId];

                if (!bankInput || bankInput === 'garaad' || bankInput === 'garaad bank') {
                    // → Garaad Bank
                    receiver.banks ??= { garaad: 0 };
                    receiver.banks.garaad = (receiver.banks.garaad || 0) + received;
                    destLabel = '🏦 Garaad Bank';
                } else {
                    // Search personal bank
                    const persBank = receiver.personalBank;
                    if (persBank && (persBank.owner.toLowerCase() === bankInput || persBank.bankId.toLowerCase() === bankInput || bankInput === 'personal')) {
                        applyBankProfit_inline(persBank);
                        persBank.customers = persBank.customers || {};
                        persBank.customers[targetId] ??= { username: receiver.username || targetId, balance: 0, depositedAt: Date.now() };
                        persBank.customers[targetId].balance += received;
                        addTx(persBank, 'customer_deposit', received, `← transfer ${interaction.user.username}`);
                        destLabel = `🏦 ${persBank.owner}'s Bank`;
                    } else {
                        // Search public bank
                        const PUB_EXP = 14 * 24 * 60 * 60 * 1000;
                        const pubBank = Object.values(getAllPublicBanks()).find(b =>
                            (b.name || '').toLowerCase() === bankInput ||
                            (b.id   || '').toLowerCase() === bankInput
                        );
                        if (!pubBank)
                            return interaction.reply({ content: `⚠️ **"${bankInput}"** — bank not found. "garaad", personal bank ama public bank magaciisa qor.`, flags: MessageFlags.Ephemeral });
                        if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXP)
                            return interaction.reply({ content: `⚠️ **${pubBank.name}** was closed.`, flags: MessageFlags.Ephemeral });
                        pubBank.balance       = (pubBank.balance || 0) + received;
                        pubBank.totalDeposits = (pubBank.totalDeposits || 0) + received;
                        pubBank.lastActivity  = Date.now();
                        pubBank.customers     = pubBank.customers || {};
                        pubBank.customers[targetId] ??= { balance: 0, username: receiver.username || targetId, joinedAt: Date.now() };
                        pubBank.customers[targetId].balance += received;
                        saveBanks();
                        destLabel = `🏛️ ${pubBank.name}`;
                    }
                }

                saveEcon();
                let receiverName = targetId;
                try { const u = await interaction.client.users.fetch(targetId); receiverName = u.username; } catch {}

                return interaction.update({ embeds: [new EmbedBuilder()
                    .setTitle('💸 Transfer — Guul!')
                    .setColor('#27ae60')
                    .setDescription(`**${interaction.user.username}** → **${receiverName}** (${destLabel})`)
                    .addFields(
                        { name: '💰 La diray',   value: `**🪙${amount.toLocaleString()}**`,                          inline: true },
                        { name: '🏛️ Canshuur 5%', value: `**-🪙${tax.toLocaleString()}**`,                           inline: true },
                        { name: '✅ La helay',    value: `**🪙${received.toLocaleString()}**`,                        inline: true },
                        { name: '🏦 Bankaga',  value: `**🪙${(sender.banks?.garaad || 0).toLocaleString()}**`,    inline: true },
                        { name: '📍 Galay',       value: `**${destLabel}**`,                                        inline: true },
                    )
                    .setFooter({ text: 'Garaad Bank • 5% canshuur' }),
                ], components: [closeRow(ownerId)] });

                function applyBankProfit_inline(bank) {
                    const now = Date.now(); bank.lastProfitAt ??= now;
                    const days = Math.floor((now - bank.lastProfitAt) / 86400000);
                    if (days > 0) {
                        const ct = Object.values(bank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
                        const p  = Math.floor(ct * 0.02 * days);
                        if (p > 0) { bank.balance += p; bank.profitEarned = (bank.profitEarned || 0) + p; }
                        bank.lastProfitAt = now;
                    }
                }
            }

            // ── Admin: Add/Remove Admin modal submit (owner only) ──
            if (interaction.customId.startsWith('admin_m_addadmin_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const action   = (interaction.fields.getTextInputValue('action') || '').trim().toLowerCase();
                const { addAdmin, removeAdmin, listAdmins } = require('../utils/admin');
                if (action === 'add') {
                    const added = addAdmin(targetId);
                    await notifyAdmins(interaction.client, interaction.user, `Add Admin: <@${targetId}>`);
                    return interaction.reply({
                        content: added
                            ? `✅ <@${targetId}> admin-yada added to. Admins: **${listAdmins().length}**`
                            : `⚠️ <@${targetId}> horay u ahaa admin.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else if (action === 'remove') {
                    const removed = removeAdmin(targetId);
                    await notifyAdmins(interaction.client, interaction.user, `Remove Admin: <@${targetId}>`);
                    return interaction.reply({
                        content: removed
                            ? `✅ <@${targetId}> admin-yada laga saaray. Admins: **${listAdmins().length}**`
                            : `⚠️ <@${targetId}> admin ma aha.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    return interaction.reply({ content: '⚠️ Ficilka: `add` ama `remove`', flags: MessageFlags.Ephemeral });
                }
            }

            // ── Admin: Broadcast modal submit ──
            if (interaction.customId.startsWith('admin_m_broadcast_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const text = interaction.fields.getTextInputValue('msg').trim();
                if (!text) return interaction.reply({ content: '⚠️ Message maxaad qortay?', flags: MessageFlags.Ephemeral });
                const { userData: uData } = require('../store');
                const userIds = Object.keys(uData);
                await interaction.reply({ content: `📢 Message loo dirayaa **${userIds.length}** user...`, flags: MessageFlags.Ephemeral });
                const broadEmbed = new EmbedBuilder()
                    .setTitle('📢 Garaad Bot — Message Rasmi ah')
                    .setDescription(text)
                    .setColor('#3498db')
                    .setFooter({ text: 'Garaad Bot' })
                    .setTimestamp();
                let success = 0, failed = 0;
                for (const uid of userIds) {
                    try {
                        const u = await interaction.client.users.fetch(uid).catch(() => null);
                        if (!u) { failed++; continue; }
                        await u.send({ embeds: [broadEmbed] });
                        success++;
                    } catch { failed++; }
                    await new Promise(r => setTimeout(r, 200));
                }
                await notifyAdmins(interaction.client, interaction.user, `Broadcast to ${userIds.length} users: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
                return interaction.editReply({ content: `✅ La gaadhsiiyay: **${success}** | ❌ Kuma gaadhsiin: **${failed}**` });
            }

            // ── Admin: Give IQ or Coins (combined modal) ──
            if (interaction.customId.startsWith('admin_m_give_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId  = interaction.fields.getTextInputValue('target_id').trim();
                const raw       = interaction.fields.getTextInputValue('give_input').trim().toLowerCase();
                const parts     = raw.split(/\s+/);
                const type      = parts[0];
                const amount    = parseFloat(parts[1]);
                if ((type !== 'iq' && type !== 'coins') || isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Qaabka: `iq 200`  ama  `coins 500`', flags: MessageFlags.Ephemeral });

                if (type === 'iq') {
                    const { userData: uData, saveData } = require('../store');
                    const { checkUser } = require('../utils/helpers');
                    checkUser(targetId);
                    uData[targetId].iq = Math.max(0, (uData[targetId].iq || 0) + amount);
                    saveData();
                    await notifyAdmins(interaction.client, interaction.user, `Give IQ: **+${amount} IQ** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> **+${amount} IQ**. Current: **${uData[targetId].iq} IQ**`, flags: MessageFlags.Ephemeral });
                } else {
                    const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                    checkEconUser(targetId);
                    eData[targetId].coins = (eData[targetId].coins || 0) + amount;
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Give Coins: **+🪙: ${amount.toLocaleString()}** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> **+🪙: ${amount.toLocaleString()}**. Current: **🪙: ${eData[targetId].coins.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
            }

            // ── Admin: Transfer → bank modal submit ──
            if (interaction.customId.startsWith('admin_m_transfer_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount').replace(/,/g, ''));
                if (!Number.isFinite(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 5000).', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                checkEconUser(targetId);
                eData[targetId].banks        ??= { garaad: 0 };
                eData[targetId].banks.garaad ??= 0;
                eData[targetId].banks.garaad  += amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Transfer → Bank: **+🪙 ${fmt(amount)}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ <@${targetId}> bank **+🪙 ${fmt(amount)}** added to.\n🏦 Current: **🪙 ${fmt(eData[targetId].banks.garaad)}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin: Give All IQ modal submit ──
            if (interaction.customId.startsWith('admin_m_giveall_iq_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const amount = parseInt(interaction.fields.getTextInputValue('amount'), 10);
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 100).', flags: MessageFlags.Ephemeral });
                const { userData: uData, saveData: sd } = require('../store');
                const { checkUser: cu } = require('../utils/helpers');
                const users = Object.keys(uData);
                for (const uid of users) {
                    cu(uid);
                    uData[uid].iq = (uData[uid].iq || 0) + amount;
                }
                sd();
                await notifyAdmins(interaction.client, interaction.user, `Give All IQ: **+${amount} IQ** × ${users.length} players`);
                return interaction.reply({ content: `✅ **${users.length}** players each player wuxuu helay **+${amount} IQ**`, flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId.startsWith('admin_m_giveall_coins_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(parseFloat(interaction.fields.getTextInputValue('amount').replace(/,/g, '')));
                if (!Number.isFinite(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 5000).', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const users = Object.keys(eData).filter(k => /^\d{17,19}$/.test(k));
                for (const uid of users) {
                    checkEconUser(uid);
                    eData[uid].coins = (eData[uid].coins || 0) + amount;
                }
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give All Coins: **+🪙 ${amount.toLocaleString()}** × ${users.length} players`);
                return interaction.reply({ content: `✅ Each of **${users.length}** players received **🪙${amount.toLocaleString()} Coins**. Total distributed: **🪙${(amount * users.length).toLocaleString()} Coins**.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Aqoon modal: Give IQ ──
            if (interaction.customId.startsWith('admin_aq_m_giveiq_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { userData: uData, saveData } = require('../store');
                const { checkUser } = require('../utils/helpers');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseInt(interaction.fields.getTextInputValue('amount'), 10);
                if (isNaN(amount) || amount === 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                checkUser(targetId);
                uData[targetId].iq = Math.max(0, (uData[targetId].iq || 0) + amount);
                saveData();
                await notifyAdmins(interaction.client, interaction.user, `Give IQ: **${amount > 0 ? '+' : ''}${amount} IQ** → <@${targetId}>`);
                return interaction.reply({ content: `✅ <@${targetId}> wuxuu helay **${amount > 0 ? '+' : ''}${amount} IQ**. Current: **${uData[targetId].iq} IQ**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Aqoon modal: Reset All ──
            if (interaction.customId.startsWith('admin_aq_m_resetall_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const confirm = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();
                if (confirm !== 'RESET')
                    return interaction.reply({ content: '⚠️ "RESET" ayaad qori lahayd. La joojiyay.', flags: MessageFlags.Ephemeral });
                const { userData: uData, saveData: sd } = require('../store');
                const { checkUser: cu } = require('../utils/helpers');
                const users = Object.keys(uData);
                for (const uid of users) {
                    cu(uid);
                    uData[uid].iq = 0;
                    uData[uid].xp = 0;
                    uData[uid].stars = 0;
                    uData[uid].pendingQuizPoints = 0;
                    uData[uid].ownedTitles  = ['beginner'];
                    uData[uid].activeTitle  = 'beginner';
                    uData[uid].customTitle  = null;
                    uData[uid].stats = { soloPlayed:0, soloCorrect:0, soloWrong:0, duelWins:0, duelLosses:0, duelDraws:0, rushBest:0, quizWins:0, quizPlayed:0, bugsReported:0 };
                }
                sd();
                await notifyAdmins(interaction.client, interaction.user, `Reset All Aqoon — IQ, darajo, stats eber (${users.length} users)`);
                return interaction.reply({ content: `✅ **${users.length} player** aqoon reset — IQ, darajo, stats eber.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Aqoon modal: Champion ──
            if (interaction.customId.startsWith('admin_aq_m_champion_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const action   = interaction.fields.getTextInputValue('action').trim().toLowerCase();
                if (action === 'give') {
                    await notifyAdmins(interaction.client, interaction.user, `Champion Give → <@${targetId}>`);
                    const giveChampion = require('../../data/commands/admin/adminGiveChampion');
                    const fakeMsg = { author: interaction.user, mentions: { users: { first: () => ({ id: targetId }) } }, reply: (p) => interaction.reply({ ...p, flags: MessageFlags.Ephemeral }) };
                    return giveChampion(fakeMsg, []);
                } else if (action === 'remove') {
                    await notifyAdmins(interaction.client, interaction.user, `Champion Remove → <@${targetId}>`);
                    const removeChampion = require('../../data/commands/admin/adminRemoveChampion');
                    const fakeMsg = { author: interaction.user, mentions: { users: { first: () => ({ id: targetId }) } }, reply: (p) => interaction.reply({ ...p, flags: MessageFlags.Ephemeral }) };
                    return removeChampion(fakeMsg, []);
                }
                return interaction.reply({ content: '⚠️ Ficilka: `give` ama `remove`', flags: MessageFlags.Ephemeral });
            }

            // ── Admin modal: Reset (combined IQ + Eco, owner only) ──
            if (interaction.customId.startsWith('admin_m_reset_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
                const password  = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah.', flags: MessageFlags.Ephemeral });
                const rawTarget  = interaction.fields.getTextInputValue('target_id').trim().toLowerCase();
                const resetAll   = rawTarget === 'all';
                const targetId   = resetAll ? null : rawTarget;
                const resetType  = (interaction.fields.getTextInputValue('reset_type') || 'both').trim().toLowerCase();
                if (!['iq', 'eco', 'both'].includes(resetType))
                    return interaction.reply({ content: '⚠️ Reset type: `iq`, `eco`, ama `both` qor.', flags: MessageFlags.Ephemeral });

                const doResetIq = resetType === 'iq'  || resetType === 'both';
                const doResetEco = resetType === 'eco' || resetType === 'both';

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { userData: uData, saveData: sd } = require('../store');
                const { checkUser: cu } = require('../utils/helpers');

                const ecoUsers = doResetEco ? Object.keys(eData).filter(k => /^[0-9]{17,19}$/.test(k)) : [];
                const iqUsers  = doResetIq  ? Object.keys(uData) : [];
                const targets  = resetAll ? null : [targetId];

                if (doResetEco) {
                    const list = targets || ecoUsers;
                    for (const uid of list) {
                        checkEconUser(uid);
                        const d = eData[uid];
                        d.coins = 1000;
                        d.banks = { garaad: 0 };
                        d.inventory = { safety: 0, robticket: 0 };
                        d.loan = null; d.lastLoanTaken = 0;
                        d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                    }
                    saveEcon();
                }

                if (doResetIq) {
                    const list = targets || iqUsers;
                    for (const uid of list) {
                        cu(uid);
                        uData[uid].iq = 0; uData[uid].xp = 0; uData[uid].stars = 0;
                        uData[uid].pendingQuizPoints = 0;
                        uData[uid].ownedTitles = ['beginner'];
                        uData[uid].activeTitle = 'beginner';
                        uData[uid].customTitle = null;
                        uData[uid].stats = { soloPlayed:0, soloCorrect:0, soloWrong:0, duelWins:0, duelLosses:0, duelDraws:0, rushBest:0, quizWins:0, quizPlayed:0, bugsReported:0 };
                    }
                    sd();
                }

                const scope = resetAll ? 'dhammaan players' : `<@${targetId}>`;
                await notifyAdmins(interaction.client, interaction.user, `Reset **${resetType}** — ${scope}`);
                return interaction.reply({ content: `✅ **${resetType}** reset — ${scope}.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Aqoon modal: Reset (legacy) ──
            if (interaction.customId.startsWith('admin_aq_m_reset_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                await notifyAdmins(interaction.client, interaction.user, `Reset Aqoon (IQ/stats) → <@${targetId}>`);
                const reset    = require('../../data/commands/admin/adminReset');
                const fakeMsg  = { author: interaction.user, mentions: { users: { first: () => ({ id: targetId }) } }, reply: (p) => interaction.reply({ ...p, flags: MessageFlags.Ephemeral }) };
                return reset(fakeMsg, []);
            }

            // ── Admin Aqoon modal: DM User ──
            if (interaction.customId.startsWith('admin_aq_m_dm_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const msg      = interaction.fields.getTextInputValue('msg');
                const user     = await interaction.client.users.fetch(targetId).catch(() => null);
                if (!user) return interaction.reply({ content: '⚠️ User la heli waayo.', flags: MessageFlags.Ephemeral });
                await user.send(msg).catch(() => {});
                await notifyAdmins(interaction.client, interaction.user, `DM sent → <@${targetId}>: "${msg.slice(0, 80)}${msg.length > 80 ? '…' : ''}"`);
                return interaction.reply({ content: `✅ DM sent <@${targetId}>.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Coins ──
            if (interaction.customId.startsWith('admin_eco_m_givecoins_') || interaction.customId.startsWith('admin_eco_m_giveusd_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].coins = (eData[targetId].coins || 0) + amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give Coins: **+🪙: ${amount.toLocaleString()}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ **🪙: ${amount.toLocaleString()}** you sent <@${targetId}>. Current: **🪙: ${eData[targetId].coins.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Asset ──
            if (interaction.customId.startsWith('admin_eco_m_giveasset_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const asset    = interaction.fields.getTextInputValue('asset').trim().toLowerCase();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (asset !== 'coins') return interaction.reply({ content: '⚠️ Asset: `coins` only', flags: MessageFlags.Ephemeral });
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].coins = (eData[targetId].coins || 0) + amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give Asset (Coins): **+🪙: ${amount.toLocaleString()}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ **🪙: ${amount.toLocaleString()}** you sent <@${targetId}>. Current: **🪙: ${eData[targetId].coins.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Bank ──
            if (interaction.customId.startsWith('admin_eco_m_givebank_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const bank     = interaction.fields.getTextInputValue('bank').trim().toLowerCase();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (bank !== 'garaad') return interaction.reply({ content: '⚠️ Bank: `garaad` only', flags: MessageFlags.Ephemeral });
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].banks[bank] = (eData[targetId].banks[bank] || 0) + amount;
                saveEcon();
                const bankLabel = bank.charAt(0).toUpperCase() + bank.slice(1);
                await notifyAdmins(interaction.client, interaction.user, `Give Bank: **+🪙: ${amount.toLocaleString()}** → <@${targetId}> (${bankLabel} Bank)`);
                return interaction.reply({ content: `✅ **🪙: ${amount.toLocaleString()}** you u dejisay <@${targetId}> — 🏦 ${bankLabel} Bank. Current: **🪙: ${eData[targetId].banks[bank].toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Title ──
            if (interaction.customId.startsWith('admin_eco_m_givetitle_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { ECON_TITLES } = require('../../data/commands/economy/econShop');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const key      = interaction.fields.getTextInputValue('title_key').trim().toLowerCase();
                const info     = ECON_TITLES[key];
                if (!info) return interaction.reply({ content: `⚠️ Title key la garanwaayo: \`${key}\``, flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                const d = eData[targetId];
                if (!d.econTitles.includes(key)) d.econTitles.push(key);
                d.activeEconTitle = key;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give Title: **${info.label}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ <@${targetId}> waxaa given to: **${info.label}** _(now firfircoon)_`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Reset ──
            if (interaction.customId.startsWith('admin_eco_m_reset_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const targetId   = interaction.fields.getTextInputValue('target_id').trim();
                const resetWhat  = (interaction.fields.getTextInputValue('reset_what') || 'both').trim().toLowerCase();
                checkEconUser(targetId);
                const d = eData[targetId];
                let msg = '';
                if (resetWhat === 'wallet') {
                    d.coins = 1000;
                    msg = `💼 Wallet reset to **1,000 Coins**`;
                } else if (resetWhat === 'bank') {
                    d.banks = { garaad: 0 };
                    d.loan = null;
                    msg = `🏦 Bank reset to **0 Coins** (loan cleared)`;
                } else {
                    d.coins = 1000;
                    d.banks = { garaad: 0 };
                    d.inventory = { safety: 0, robticket: 0 };
                    d.loan = null; d.lastLoanTaken = 0;
                    d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                    msg = `♻️ Full economy reset — wallet **1,000 Coins**, bank **0**, loan cleared`;
                }
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Reset User Economy: <@${targetId}> — ${msg}`);
                return interaction.reply({ content: `✅ <@${targetId}> — ${msg}`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Treasury ──
            if (interaction.customId.startsWith('admin_eco_m_treasury_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood do not have.', flags: MessageFlags.Ephemeral });
                const action = interaction.fields.getTextInputValue('action').trim().toLowerCase();
                const { econData: eData, checkEconUser, saveEcon, getTreasury, deductFromTreasury } = require('../economy/econStore');
                const t = getTreasury();

                if (action === 'distribute' || action === 'qaybso' || action === 'all') {
                    const users   = Object.keys(eData).filter(k => /^[0-9]{17,19}$/.test(k));
                    const rawAmt  = interaction.fields.getTextInputValue('amount').trim().toLowerCase();
                    const amount  = rawAmt === 'all' ? t.balance : parseFloat(rawAmt);
                    if (!amount || isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ Xaddad geli ama "all" qor.', flags: MessageFlags.Ephemeral });
                    const perUser = Math.floor(amount / users.length);
                    if (perUser < 1)
                        return interaction.reply({ content: '⚠️ Amount aad yar — dadku aad baa u badan.', flags: MessageFlags.Ephemeral });
                    if (!deductFromTreasury(amount))
                        return interaction.reply({ content: `⚠️ Treasury is not enough. Current: **🪙: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                    for (const uid of users) { checkEconUser(uid); eData[uid].coins = (eData[uid].coins || 0) + perUser; }
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Distribute Treasury: **🪙: ${perUser.toLocaleString()}** × ${users.length} players`);
                    return interaction.reply({ content: `✅ **🪙: ${perUser.toLocaleString()}** × **${users.length}** players.\n🏛️ Treasury remaining: **🪙: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                }

                if (action === 'give' || action === 'sii') {
                    const targetId = interaction.fields.getTextInputValue('amount').trim().split(/\s+/)[0];
                    const amount   = parseFloat(interaction.fields.getTextInputValue('amount').trim().split(/\s+/)[1]);
                    if (!targetId || isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ `give @userID xad` qaab use.', flags: MessageFlags.Ephemeral });
                    if (!deductFromTreasury(amount))
                        return interaction.reply({ content: `⚠️ Treasury is not enough. Current: **🪙: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                    checkEconUser(targetId);
                    eData[targetId].coins = (eData[targetId].coins || 0) + amount;
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Treasury Give: **🪙: ${amount.toLocaleString()}** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ Treasury **🪙: ${amount.toLocaleString()}** waxaa laga siiyay <@${targetId}>.\n🏛️ Treasury hadhay: **🪙: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                }

                // view
                return interaction.reply({
                    content: `🏛️ **Treasury:**\n💰 Current balance: **🪙 ${fmt(t.balance || 0)}**\n📥 Total in: **🪙 ${fmt(t.totalIn || 0)}**\n📤 Total out: **🪙 ${fmt(t.totalOut || 0)}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Admin Econ modal: Top-up Treasury ──
            if (interaction.customId.startsWith('admin_eco_m_topup_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood do not have.', flags: MessageFlags.Ephemeral });
                const amount = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { topUpTreasury, getTreasury, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                topUpTreasury(amount);
                saveEcon();
                const t = getTreasury();
                await notifyAdmins(interaction.client, interaction.user, `Top-up Treasury: **+🪙: ${amount.toLocaleString()}** — balance now **🪙: ${t.balance.toLocaleString()}**`);
                return interaction.reply({ content: `✅ **🪙: ${amount.toLocaleString()}** treasury added to.\n🏛️ Current: **🪙: ${t.balance.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Tax ──
            if (interaction.customId.startsWith('admin_eco_m_tax_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood do not have.', flags: MessageFlags.Ephemeral });
                const amount = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon, addToTreasury } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const users = Object.entries(eData).filter(([k]) => /^[0-9]{17,19}$/.test(k));
                let collected = 0;
                for (const [uid] of users) {
                    checkEconUser(uid);
                    const d = eData[uid];
                    const deduct = Math.min(amount, d.coins || 0);
                    d.coins = (d.coins || 0) - deduct;
                    collected += deduct;
                }
                if (collected > 0) addToTreasury(collected);
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Tax: **🪙: ${fmt(amount)}** × ${users.length} players → Treasury **+🪙: ${fmt(collected)}**`);
                return interaction.reply({
                    content: `💸 **Tax Collected**\n**🪙: ${fmt(amount)}** ka baxday each player (${users.length} players)\n🏛️ Treasury helay: **🪙: ${fmt(collected)}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Admin Econ modal: Reset All ──
            if (interaction.customId.startsWith('admin_eco_m_resetall_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood do not have.', flags: MessageFlags.Ephemeral });
                const confirm = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();
                if (confirm !== 'RESET')
                    return interaction.reply({ content: '⚠️ "RESET" ayaad qori lahayd. La joojiyay.', flags: MessageFlags.Ephemeral });
                const { econData: eData, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const users = Object.keys(eData).filter(k => /^[0-9]{17,19}$/.test(k));
                for (const uid of users) {
                    const d = eData[uid];
                    d.banks = { garaad: 0 };
                    d.inventory = { safety: 0, robticket: 0 };
                    d.loan = null; d.lastLoanTaken = 0; d.lastWork = 0; d.lastDaily = 0; d.lastInterest = 0;
                    delete d.todayEarned;
                    d.dailyGiven = { date: '', coins: 0 };
                    d.robsToday = { date: '', count: 0 };
                    d.serviceChargesPaid = { mandeeq: 0, garaad: 0 };
                    d.interestEarned = { mandeeq: 0, garaad: 0 };
                    d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                }
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Reset All Economy — ${users.length} players`);
                return interaction.reply({ content: `✅ Reset economy bank and item data for **${users.length} players**. Wallet balances were not changed.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Reset Any (single user or all) ──
            if (interaction.customId.startsWith('admin_eco_m_resetany_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
                const password  = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood do not have.', flags: MessageFlags.Ephemeral });
                const rawTarget = interaction.fields.getTextInputValue('target_id').trim().toLowerCase();
                const resetAll  = !rawTarget || rawTarget === 'all';
                const targetId  = resetAll ? null : rawTarget;
                const resetRaw  = (interaction.fields.getTextInputValue('reset_what') || 'both').trim().toLowerCase();
                const resetWhat = (resetRaw === 'all') ? 'both' : resetRaw;
                if (!['wallet', 'bank', 'both'].includes(resetWhat))
                    return interaction.reply({ content: '⚠️ Reset: `wallet`, `bank`, ama `both` qor.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');

                function applyReset(d, what) {
                    if (what === 'wallet') {
                        d.coins = 1000;
                    } else if (what === 'bank') {
                        d.banks = { garaad: 0 };
                        d.loan = null; d.lastLoanTaken = 0;
                    } else {
                        d.coins = 1000;
                        d.banks = { garaad: 0 };
                        d.inventory = { safety: 0, robticket: 0 };
                        d.loan = null; d.lastLoanTaken = 0;
                        d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                    }
                }

                if (resetAll) {
                    const users = Object.keys(eData).filter(k => /^[0-9]{17,19}$/.test(k));
                    for (const uid of users) { checkEconUser(uid); applyReset(eData[uid], resetWhat); }
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Reset ALL Economy (${resetWhat}) — ${users.length} players`);
                    return interaction.reply({ content: `✅ **${users.length} player** dhammaan economy reset (**${resetWhat}**).`, flags: MessageFlags.Ephemeral });
                } else {
                    checkEconUser(targetId);
                    applyReset(eData[targetId], resetWhat);
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Reset Economy (${resetWhat}): <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> economy reset (**${resetWhat}**).`, flags: MessageFlags.Ephemeral });
                }
            }

            // ── Withdraw: Public Bank modal ──
            if (interaction.customId.startsWith('wd_pub_modal_')) {
                const rest   = interaction.customId.replace('wd_pub_modal_', '');
                const lastU  = rest.lastIndexOf('_');
                const bankId = rest.substring(0, lastU);
                const userId = rest.substring(lastU + 1);
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('wd_amount')));
                if (!amount || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                const { buildPubBankPanel } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
                if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
                const myRec = bank.customers?.[userId];
                if (!myRec || (myRec.balance || 0) <= 0) return interaction.reply({ content: `⚠️ **${bank.name}** Coins kuma dhigin.`, flags: MessageFlags.Ephemeral });
                if (amount > myRec.balance) return interaction.reply({ content: `⚠️ You have: 🪙${myRec.balance.toLocaleString()} only.`, flags: MessageFlags.Ephemeral });
                const wdFee      = Math.floor(amount * 0.01);
                const wdReceived = amount - wdFee;
                if (wdFee > 0) {
                    bank.ownerProfit = (bank.ownerProfit || 0) + wdFee;
                }
                myRec.balance      -= amount;
                bank.balance        = Math.max(0, (bank.balance || 0) - amount);
                ec.coins              = (ec.coins || 0) + wdReceived;
                saveBanks(); saveEcon();
                const { embed, components } = buildPubBankPanel(bank, userId);
                return interaction.update({ embeds: [embed], components,
                    content: `📤 **🪙${wdReceived.toLocaleString()}** ← 🏛️ **${bank.name}** (1% fee: 🪙${wdFee.toLocaleString()})` });
            }

            // ── Withdraw: Personal Bank modal ──
            if (interaction.customId.startsWith('wd_pers_modal_')) {
                const rest    = interaction.customId.replace('wd_pers_modal_', '');
                const lastU   = rest.lastIndexOf('_');
                const ownerId = rest.substring(0, lastU);
                const userId  = rest.substring(lastU + 1);
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('wd_amount')));
                if (!amount || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                const { buildPersBankPanel } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec    = eData[userId];
                const bank  = eData[ownerId]?.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
                const myRec = bank.customers?.[userId];
                if (!myRec || (myRec.balance || 0) <= 0) return interaction.reply({ content: `⚠️ **${bank.owner}**'s bank Coins kuma dhigin.`, flags: MessageFlags.Ephemeral });
                if (amount > myRec.balance) return interaction.reply({ content: `⚠️ You have: 🪙${myRec.balance.toLocaleString()} only.`, flags: MessageFlags.Ephemeral });
                myRec.balance -= amount;
                ec.coins         = (ec.coins || 0) + amount;
                addTx(bank, 'customer_withdraw', amount, `→ ${interaction.user.username}`);
                saveEcon();
                const { embed, components } = buildPersBankPanel(bank, ownerId, userId);
                return interaction.update({ embeds: [embed], components,
                    content: `📤 **🪙${amount.toLocaleString()}** ← 🏦 **${bank.owner}**'s Bank` });
            }

            // ── Deposit: Garaad Bank modal ──
            if (interaction.customId.startsWith('dep_garaad_modal_')) {
                const userId = interaction.customId.replace('dep_garaad_modal_', '');
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('dep_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                checkEconUser(userId);
                const d = eData[userId];
                if ((d.coins || 0) < amount)
                    return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(d.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                d.coins           = (d.coins || 0) - amount;
                d.banks         = d.banks || { garaad: 0 };
                d.banks.garaad  = (d.banks.garaad || 0) + amount;
                saveEcon();
                return interaction.reply({ content: `📥 **🪙${amount.toLocaleString()}** → 🏦 **Garaad Bank**\n💰 Bank: **🪙${d.banks.garaad.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Withdraw: Garaad Bank modal ──
            if (interaction.customId.startsWith('wd_garaad_modal_')) {
                const userId = interaction.customId.replace('wd_garaad_modal_', '');
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('wd_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                checkEconUser(userId);
                const d = eData[userId];
                const garaadBal = d.banks?.garaad || 0;
                if (garaadBal < amount)
                    return interaction.reply({ content: `⚠️ Garaad Bank enough for you do not have. You have: 🪙${garaadBal.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                d.banks.garaad -= amount;
                d.coins = (d.coins || 0) + amount;
                saveEcon();
                return interaction.reply({ content: `📤 **🪙${amount.toLocaleString()}** ← 🏦 **Garaad Bank**\n💰 Remaining bank balance: **🪙${d.banks.garaad.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Deposit: Public Bank modal ──
            if (interaction.customId.startsWith('dep_pub_modal_')) {
                const rest   = interaction.customId.replace('dep_pub_modal_', '');
                const lastU  = rest.lastIndexOf('_');
                const bankId = rest.substring(0, lastU);
                const userId = rest.substring(lastU + 1);
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('dep_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec      = eData[userId];
                const pubBank = getAllPublicBanks()[bankId.toUpperCase()] || getAllPublicBanks()[bankId];
                if (!pubBank) return interaction.reply({ content: `⚠️ Bank \`${bankId}\` not found.`, flags: MessageFlags.Ephemeral });
                if ((ec.coins || 0) < amount) return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(ec.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                const isOwnerDep = pubBank.ownerId === userId;
                ec.coins = (ec.coins || 0) - amount;
                pubBank.balance       = (pubBank.balance || 0) + amount;
                pubBank.totalDeposits = (pubBank.totalDeposits || 0) + amount;
                pubBank.lastActivity  = Date.now();
                let depFeeNote = '';
                if (isOwnerDep) {
                    pubBank.ownerFund = (pubBank.ownerFund || 0) + amount;
                } else {
                    const depFee = Math.floor(amount * 0.02);
                    if (depFee > 0) {
                        pubBank.ownerProfit = (pubBank.ownerProfit || 0) + depFee;
                        depFeeNote = `\n💸 Profit owner: 🪙${depFee.toLocaleString()} (claim: ?bankfund)`;
                    }
                    pubBank.customers = pubBank.customers || {};
                    pubBank.customers[userId] ??= { balance: 0, username: interaction.user.username, joinedAt: Date.now() };
                    pubBank.customers[userId].balance += amount;
                }
                saveBanks(); saveEcon();
                return interaction.reply({ content: `📥 **🪙${amount.toLocaleString()}** → 🏛️ **${pubBank.name}**\n💼 You have: 🪙${(pubBank.customers?.[userId]?.balance || 0).toLocaleString()}${depFeeNote}`, flags: MessageFlags.Ephemeral });
            }

            // ── Fund Public Bank modal submit ──
            if (interaction.customId.startsWith('pubbank_fund_modal_')) {
                const rest   = interaction.customId.replace('pubbank_fund_modal_', '');
                const lastU  = rest.lastIndexOf('_');
                const bankId = rest.substring(0, lastU);
                const userId = rest.substring(lastU + 1);
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('fund_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { buildOwnerPanel } = require('../../data/commands/economy/publicBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
                if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
                if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner only.', flags: MessageFlags.Ephemeral });
                if ((ec.coins || 0) < amount)
                    return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(ec.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.coins            -= amount;
                bank.balance      += amount;
                bank.ownerFund     = (bank.ownerFund || 0) + amount;
                bank.lastActivity  = Date.now();
                saveBanks(); saveEcon();
                const { embed, components } = buildOwnerPanel(bank, userId);
                return interaction.update({
                    content: `✅ **🪙${amount.toLocaleString()}** bank capital u daray!`,
                    embeds: [embed], components,
                });
            }

            // ── Deposit: Personal Bank modal ──
            if (interaction.customId.startsWith('dep_pers_modal_')) {
                const rest    = interaction.customId.replace('dep_pers_modal_', '');
                const lastU   = rest.lastIndexOf('_');
                const ownerId = rest.substring(0, lastU);
                const userId  = rest.substring(lastU + 1);
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('dep_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec = eData[userId];
                const tBank = eData[ownerId]?.personalBank;
                if (!tBank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
                if (ownerId === userId) return interaction.reply({ content: '⚠️ Bank-kaaga laftiis: `?bv` fur.', flags: MessageFlags.Ephemeral });
                if ((ec.coins || 0) < amount) return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(ec.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                const nowTs = Date.now();
                tBank.lastProfitAt ??= nowTs;
                const profDays = Math.floor((nowTs - tBank.lastProfitAt) / 86400000);
                if (profDays > 0) {
                    const ct = Object.values(tBank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
                    const profit = Math.floor(ct * 0.02 * profDays);
                    if (profit > 0) { tBank.balance += profit; tBank.profitEarned = (tBank.profitEarned || 0) + profit; addTx(tBank, 'profit', profit, `Profit (${profDays}d)`); }
                    tBank.lastProfitAt = nowTs;
                }
                ec.coins = (ec.coins || 0) - amount;
                tBank.customers = tBank.customers || {};
                tBank.customers[userId] ??= { username: interaction.user.username, balance: 0, depositedAt: Date.now() };
                tBank.customers[userId].balance += amount;
                addTx(tBank, 'customer_deposit', amount, `← ${interaction.user.username}`);
                saveEcon();
                return interaction.reply({ content: `📥 **🪙${amount.toLocaleString()}** → 🏦 **${tBank.owner}**'s Bank\n💼 You have: 🪙${tBank.customers[userId].balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });
            }

            // ── ?bank Deposit modal ──
            if (interaction.customId.startsWith('bank_all_dep_modal_')) {
                const userId   = interaction.customId.replace('bank_all_dep_modal_', '');
                const bankRef  = interaction.fields.getTextInputValue('ball_bank').trim();
                const amount   = Math.floor(Number(interaction.fields.getTextInputValue('ball_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const fakeMsg = { author: interaction.user, mentions: { users: { first: () => null } }, reply: (c) => interaction.reply({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral }) };
                const { depositAnyCmd } = require('../../data/commands/economy/personalBank');
                return depositAnyCmd({ ...fakeMsg, author: interaction.user }, [bankRef, String(amount)]);
            }

            // ── ?bank Withdraw modal ──
            if (interaction.customId.startsWith('bank_all_wd_modal_')) {
                const userId   = interaction.customId.replace('bank_all_wd_modal_', '');
                const bankRef  = interaction.fields.getTextInputValue('ball_bank').trim();
                const amount   = Math.floor(Number(interaction.fields.getTextInputValue('ball_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
                const { withdrawAnyCmd } = require('../../data/commands/economy/personalBank');
                const fakeMsg = { author: interaction.user, reply: (c) => interaction.reply({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral }) };
                return withdrawAnyCmd(fakeMsg, [bankRef, String(amount)]);
            }

            // ── Personal Bank View: own deposit modal ──
            if (interaction.customId.startsWith('pbank_own_dep_modal_')) {
                const userId = interaction.user.id;
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_own_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                const { bankViewRow } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = ec.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account not found. `?bc` use.', flags: MessageFlags.Ephemeral });
                if ((ec.coins || 0) < amount)
                    return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(ec.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });

                ec.coins          = (ec.coins || 0) - amount;
                bank.balance   += amount;
                bank.deposits   = (bank.deposits || 0) + amount;
                addTx(bank, 'deposit', amount, 'jeeb → bangi');
                saveEcon();
                return interaction.reply({
                    content: `📥 **🪙${amount.toLocaleString()}** wallet → bank\n💰 **Bangi now:** 🪙${bank.balance.toLocaleString()}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Personal Bank View: own withdraw modal ──
            if (interaction.customId.startsWith('pbank_own_wd_modal_')) {
                const userId = interaction.user.id;
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_wd_amount')));
                const pw     = (interaction.fields.getTextInputValue('pbank_wd_pw') || '').trim();
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = ec.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account not found.', flags: MessageFlags.Ephemeral });

                if (ec.accountPassword && ec.accountPassword !== pw)
                    return interaction.reply({ content: '❌ Incorrect password.', flags: MessageFlags.Ephemeral });
                if (amount > bank.balance)
                    return interaction.reply({ content: `⚠️ Insufficient bank Coins. Balance: 🪙${bank.balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });

                bank.balance     -= amount;
                bank.withdrawals  = (bank.withdrawals || 0) + amount;
                ec.coins            = (ec.coins || 0) + amount;
                addTx(bank, 'withdraw', amount, 'bangi → jeeb');
                saveEcon();
                return interaction.reply({
                    content: `📤 **🪙${amount.toLocaleString()}** bank → wallet\n💳 **Wallet now:** 🪙${ec.coins.toLocaleString()}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Bank deposit modal (personal + public) ──
            if (interaction.customId.startsWith('pbank_dep_modal_')) {
                const userId = interaction.user.id;
                const input  = interaction.fields.getTextInputValue('pbank_bank_name').trim();
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_amount')));

                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Enter a valid amount (e.g.: 1000).', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx, getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec = eData[userId];

                if ((ec.coins || 0) < amount)
                    return interaction.reply({ content: `⚠️ Your wallet has insufficient Coins. You have: 🪙${Math.floor(ec.coins || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });

                // ── 1. Search personal banks ──
                const foundPers = Object.entries(eData).find(([uid, d]) => {
                    if (!/^\d{17,19}$/.test(uid) || !d?.personalBank) return false;
                    const b = d.personalBank;
                    return b.owner.toLowerCase() === input.toLowerCase() ||
                           b.bankId.toUpperCase() === input.toUpperCase();
                });

                if (foundPers) {
                    const [targetId, targetEc] = foundPers;
                    const targetBank = targetEc.personalBank;
                    if (targetId === userId)
                        return interaction.reply({ content: '⚠️ Bank-kaaga laftiis: `?bv` fur oo Deposit taabo.', flags: MessageFlags.Ephemeral });

                    const nowTs = Date.now();
                    targetBank.lastProfitAt ??= nowTs;
                    const profDays = Math.floor((nowTs - targetBank.lastProfitAt) / 86400000);
                    if (profDays > 0) {
                        const ct = Object.values(targetBank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
                        if (ct > 0) {
                            const profit = Math.floor(ct * 0.02 * profDays);
                            if (profit > 0) {
                                targetBank.balance     += profit;
                                targetBank.profitEarned = (targetBank.profitEarned || 0) + profit;
                                addTx(targetBank, 'profit', profit, `Profit macaamiisha (${profDays} maalin)`);
                            }
                        }
                        targetBank.lastProfitAt = nowTs;
                    }
                    ec.coins = (ec.coins || 0) - amount;
                    targetBank.customers = targetBank.customers || {};
                    if (!targetBank.customers[userId])
                        targetBank.customers[userId] = { username: interaction.user.username, balance: 0, depositedAt: Date.now() };
                    targetBank.customers[userId].balance += amount;
                    addTx(targetBank, 'customer_deposit', amount, `← ${interaction.user.username}`);
                    saveEcon();
                    return interaction.reply({
                        content:
                            `📥 **🪙${amount.toLocaleString()}** → 🏦 **${targetBank.owner}**'s Bank\n` +
                            `💼 Bankas adigu you have: **🪙${targetBank.customers[userId].balance.toLocaleString()}**`,
                        flags: MessageFlags.Ephemeral,
                    });
                }

                // ── 2. Search public banks ──
                const PUB_EXPIRY = 14 * 24 * 60 * 60 * 1000;
                const allPub  = getAllPublicBanks();
                const pubBank = Object.values(allPub).find(b =>
                    (b.name || '').toLowerCase() === input.toLowerCase() ||
                    (b.id   || '').toUpperCase() === input.toUpperCase()
                );

                if (!pubBank)
                    return interaction.reply({ content: `⚠️ **"${input}"** — bank not found. Magaca ama ID-ga si correct u qor.`, flags: MessageFlags.Ephemeral });

                if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXPIRY)
                    return interaction.reply({ content: `⚠️ **${pubBank.name}** was closed (2 toddobaad shaqo la'aan).`, flags: MessageFlags.Ephemeral });

                ec.coins = (ec.coins || 0) - amount;
                pubBank.balance       = (pubBank.balance || 0) + amount;
                pubBank.totalDeposits = (pubBank.totalDeposits || 0) + amount;
                pubBank.reputation    = Math.floor((pubBank.reputation || 0) + amount / 10000);
                pubBank.lastActivity  = Date.now();
                pubBank.customers     = pubBank.customers || {};
                pubBank.customers[userId] ??= { balance: 0, username: interaction.user.username, joinedAt: Date.now() };
                pubBank.customers[userId].balance += amount;
                saveBanks();
                saveEcon();
                return interaction.reply({
                    content:
                        `📥 **🪙${amount.toLocaleString()}** → 🏛️ **${pubBank.name}**\n` +
                        `💰 Bank balance: 🪙${pubBank.balance.toLocaleString()}\n` +
                        `💼 Adiga you have: 🪙${pubBank.customers[userId].balance.toLocaleString()}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // (eco_dnmod_ and eco_dnpay_ removed — deen is now button-only, no modals)

            // ── Shop: Custom name title modal ──
            if (interaction.customId.startsWith('eco_shop_custom_mod_')) {
                const ownerId = interaction.customId.replace('eco_shop_custom_mod_', '');
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon, addToTreasury } = require('../economy/econStore');
                const { SHOP_ITEMS } = require('../../data/commands/economy/econShop');
                checkEconUser(ownerId);
                const d    = eData[ownerId];
                const item = SHOP_ITEMS['custom'];
                const name = interaction.fields.getTextInputValue('custom_title_name').trim();

                if (!name || name.length < 2)
                    return interaction.reply({ content: '⚠️ Magaca aad gaaban yahay — at least 2 xaraf.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(ownerId) < item.price)
                    return interaction.reply({ content: `⚠️ You do not have enough Coins. Qiimaha: **🪙: ${item.price.toLocaleString()}** | You have: **🪙: ${getSpendableCoins(ownerId).toLocaleString()}**`, flags: MessageFlags.Ephemeral });

                spendCoins(ownerId, item.price);
                d.customEconTitle ??= null;
                d.customEconTitle  = name;
                if (!d.econTitles.includes('custom')) d.econTitles.push('custom');
                d.activeEconTitle = 'custom';
                addToTreasury(item.price);
                saveEcon();
                return interaction.reply({ content: `✅ Custom title la sameeay: **${name}** ✍️\nTitle-kaagu now wuu firfircoon yahay! **🪙: ${item.price.toLocaleString()}** la bixiyay.`, flags: MessageFlags.Ephemeral });
            }


            return;
        }

        // ── Inventory Select Menu ──
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;
            if (id.startsWith('inv_sel_frame_') || id.startsWith('inv_sel_title_')) {
                const ownerId = id.startsWith('inv_sel_frame_') ? id.replace('inv_sel_frame_', '') : id.replace('inv_sel_title_', '');
                if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Inventory-gaagu maaha.', flags: MessageFlags.Ephemeral });
                const { userData, saveData } = require('../../src/store');
                const { econData, saveEcon }  = require('../../src/economy/econStore');
                const { FRAMES }              = require('../utils/itemDefs');
                const key = interaction.values[0];
                const d   = userData[ownerId];
                const ec  = econData[ownerId] || {};

                if (id.startsWith('inv_sel_frame_')) {
                    d.activeFrame = key;
                    saveData();
                    const f = FRAMES[key];
                    return interaction.update({ content: `✅ **${f?.emoji || ''} ${f?.name || key}** la xidh!`, embeds: [], components: [] });
                }
                if (id.startsWith('inv_sel_title_')) {
                    if ((ec.econTitles || []).includes(key)) { ec.activeEconTitle = key; saveEcon(); }
                    else { d.activeTitle = key; saveData(); }
                    return interaction.update({ content: `✅ Cinwaanka **${key}** waa la xidh!`, embeds: [], components: [] });
                }
            }
            return;
        }

        if (!interaction.isButton()) return;

        const id = interaction.customId;

        if (id.startsWith('sec_accept_') || id.startsWith('sec_decline_')) {
            return require('../games/secretChat').handleSecretChatButton(interaction);
        }
        if (id.startsWith('tiro_pick_')) {
            return require('../games/numberGuess').handlePickButton(interaction);
        }
        if (id.startsWith('miino_tile_') || id.startsWith('miino_cash_') || id.startsWith('miino_diff_')) {
            return require('../games/minesweeper').handleMiinoButton(interaction);
        }
        if (id.startsWith('fti_join_') || id.startsWith('fti_leave_') || id.startsWith('fti_start_') || id.startsWith('fti_close_') || id.startsWith('fti_role_') || id.startsWith('fti_vote_')) {
            return require('../games/findImposter').handleFindImposterButton(interaction);
        }
        if (id.startsWith('sheeko_')) {
            return require('../games/sheeko').handleSheekoButton(interaction);
        }
        if (id.startsWith('truthdare_')) {
            return require('../games/truthOrDare').handleTruthOrDareButton(interaction);
        }

        function buildPlayersPageRow(page, totalPages, ownerId) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_eco_pg_${page - 1}_${ownerId}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 0),
                new ButtonBuilder()
                    .setCustomId(`admin_eco_pg_noop_${ownerId}`)
                    .setLabel(`${page + 1} / ${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`admin_eco_pg_${page + 1}_${ownerId}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId(`close_admin_help_${ownerId}`)
                    .setLabel('✖ Close')
                    .setStyle(ButtonStyle.Danger),
            );
        }

        // ── Help tabs: Education / Economy / Other ──
        if (id.startsWith('help_edu_')) {
            const ownerId = id.replace('help_edu_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildEduEmbed(ownerId)], components: [helpRow(ownerId, 'edu')] });
        }
        if (id.startsWith('help_eco_')) {
            const ownerId = id.replace('help_eco_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildEcoEmbed()], components: [helpRow(ownerId, 'eco')] });
        }
        if (id.startsWith('help_games_')) {
            const ownerId = id.replace('help_games_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildGamesEmbed(ownerId)], components: [helpRow(ownerId, 'games')] });
        }
        if (id.startsWith('help_player_')) {
            const ownerId = id.replace('help_player_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildPlayerEmbed(ownerId)], components: [helpRow(ownerId, 'player')] });
        }
        if (id.startsWith('help_shop_')) {
            const ownerId = id.replace('help_shop_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildHelpShopEmbed()], components: [helpRow(ownerId, 'shop')] });
        }
        if (id.startsWith('solo_replaycount_')) {
            return handleSoloReplayCount(interaction);
        }

        if (id.startsWith('solo_replay_')) {
            return handleSoloReplay(interaction);
        }

        if (id.startsWith('missions_claim_')) {
            return handleMissionClaim(interaction);
        }

        // ── Inventory equip buttons ──
        if (id.startsWith('inv_equip_frame_') || id.startsWith('inv_equip_title_')) {
            const isFrame  = id.startsWith('inv_equip_frame_');
            const ownerId  = isFrame ? id.replace('inv_equip_frame_', '') : id.replace('inv_equip_title_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Inventory-gaagu maaha.', flags: MessageFlags.Ephemeral });

            const { userData } = require('../../src/store');
            const { econData }  = require('../../src/economy/econStore');
            const { FRAMES }    = require('../utils/itemDefs');
            const { ECON_TITLES } = require('../../data/commands/economy/econShop');
            const d  = userData[ownerId];
            const ec = econData[ownerId] || {};

            if (isFrame) {
                const options = (d.ownedFrames || []).map(k => {
                    const f = FRAMES[k];
                    return { label: `${f?.emoji || ''} ${f?.name || k}`, description: f?.rarity || '', value: k, default: d.activeFrame === k };
                });
                if (!options.length) return interaction.reply({ content: '⚠️ Ma lihid frames.', flags: MessageFlags.Ephemeral });
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`inv_sel_frame_${ownerId}`).setPlaceholder('Frame Choose...').addOptions(options)
                );
                return interaction.reply({ content: '🖼️ **Frame Choose:**', components: [menu], flags: MessageFlags.Ephemeral });
            } else {
                const allTitles = [...new Set([...(d.ownedTitles || []), ...(ec.econTitles || [])])];
                const options = allTitles.map(k => {
                    const et = ECON_TITLES[k];
                    const label = et ? et.label.replace(/\s*◀.*/, '') : k;
                    return { label: label.slice(0, 25), value: k, default: d.activeTitle === k || ec.activeEconTitle === k };
                });
                if (!options.length) return interaction.reply({ content: '⚠️ Ma lihid titles.', flags: MessageFlags.Ephemeral });
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`inv_sel_title_${ownerId}`).setPlaceholder('Title Choose...').addOptions(options)
                );
                return interaction.reply({ content: '🏷️ **Title Choose:**', components: [menu], flags: MessageFlags.Ephemeral });
            }
        }

        // ── Admin panel (unified — covers both aqoon + eco tab buttons) ──
        if (id.startsWith('admin_aqoon_') || (id.startsWith('admin_eco_') && !id.startsWith('admin_eco_give') && !id.startsWith('admin_eco_reset') && !id.startsWith('admin_eco_m_') && !id.startsWith('admin_eco_allplayers_') && !id.startsWith('admin_eco_loans_') && !id.startsWith('admin_eco_topup_') && !id.startsWith('admin_eco_treasury_') && !id.startsWith('admin_eco_resetall_') && !id.startsWith('admin_eco_tax_') && !id.startsWith('admin_eco_pg_'))) {
            const ownerId = id.startsWith('admin_aqoon_') ? id.replace('admin_aqoon_', '') : id.replace('admin_eco_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const { buildAdminEmbed, getRows } = require('../../data/commands/admin/adminHelpPanel');
            return interaction.update({ embeds: [buildAdminEmbed(ownerId)], components: getRows(ownerId) });
        }

        // ── Admin: Give (IQ or Coins) button → modal ──
        if (id.startsWith('admin_give_')) {
            const ownerId = id.replace('admin_give_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_give_${ownerId}`).setTitle('🎁 Give IQ or Coins');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('give_input').setLabel('iq 200  or  coins 500').setStyle(TextInputStyle.Short).setPlaceholder('iq 200   /   coins 500').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Give All IQ button → modal ──
        if (id.startsWith('admin_giveall_iq_')) {
            const ownerId = id.replace('admin_giveall_iq_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_giveall_iq_${ownerId}`).setTitle('🧠 Give IQ — All Players');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('IQ amount (each player)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Example: 100').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        if (id.startsWith('admin_giveall_coins_')) {
            const ownerId = id.replace(/^admin_giveall_coins_/, '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_giveall_coins_${ownerId}`).setTitle('🪙 Give Coins — All Players');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Coins amount (each player)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Example: 5000').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Transfer → bank button → modal ──
        if (id.startsWith('admin_transfer_')) {
            const ownerId = id.replace('admin_transfer_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_transfer_${ownerId}`).setTitle('💸 Transfer → Bank');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Coins amount').setStyle(TextInputStyle.Short).setPlaceholder('Example: 5000').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Add/Remove Admin button → modal (owner only) ──
        if (id.startsWith('admin_addadmin_')) {
            const ownerId = id.replace('admin_addadmin_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_addadmin_${ownerId}`).setTitle('👥 Admin — Add / Remove');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short)
                        .setPlaceholder('123456789012345678').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('action').setLabel('Ficil: add  ama  remove').setStyle(TextInputStyle.Short)
                        .setPlaceholder('add   /   remove').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Broadcast button → modal ──
        if (id.startsWith('admin_broadcast_')) {
            const ownerId = id.replace('admin_broadcast_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_broadcast_${ownerId}`).setTitle('📢 Broadcast — DM All Players');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('msg').setLabel('Messageta (DM dhammaan players)').setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Example: Quiz cusub tomorrow 8 PM!').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Bugs button → ephemeral reply ──
        if (id.startsWith('admin_bugs_')) {
            const ownerId = id.replace('admin_bugs_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const { getBugs } = require('../utils/admin');
            const bugs = getBugs(15);
            if (!bugs.length)
                return interaction.reply({ content: '🎉 Cilad lama soo sheegin!', flags: MessageFlags.Ephemeral });
            const bugsEmbed = new EmbedBuilder()
                .setTitle('🐛 Cilada La Soo Sheegay')
                .setColor('#e74c3c')
                .setFooter({ text: `${bugs.length} cilad` });
            bugs.forEach((b, i) => {
                const desc = b.description.length > 200 ? b.description.slice(0, 200) + '...' : b.description;
                bugsEmbed.addFields({ name: `${i + 1}. ${b.username || '?'} • ${new Date(b.timestamp).toLocaleString()}`, value: `> ${desc}\n🆔 \`${b.userId}\`` });
            });
            return interaction.reply({ embeds: [bugsEmbed], flags: MessageFlags.Ephemeral });
        }

        // ── Admin Aqoon: Give IQ button → modal (legacy) ──
        if (id.startsWith('admin_aq_giveiq_')) {
            const ownerId = id.replace('admin_aq_giveiq_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_aq_m_giveiq_${ownerId}`).setTitle('🧠 Give IQ');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount IQ').setStyle(TextInputStyle.Short).setPlaceholder('Example: 100').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Aqoon: Reset All button → confirm modal ──
        if (id.startsWith('admin_aq_resetall_')) {
            const ownerId = id.replace('admin_aq_resetall_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_aq_m_resetall_${ownerId}`).setTitle('♻️ Reset All Aqoon');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('confirm').setLabel('Xaqiiji: qor "RESET"').setStyle(TextInputStyle.Short).setPlaceholder('RESET').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Aqoon: Champion button → modal ──
        if (id.startsWith('admin_aq_champion_')) {
            const ownerId = id.replace('admin_aq_champion_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_aq_m_champion_${ownerId}`).setTitle('🏆 Champion');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('action').setLabel('Ficilka (give ama remove)').setStyle(TextInputStyle.Short).setPlaceholder('give').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Reset (combined IQ + Eco) button → modal (owner only) ──
        if (id.startsWith('admin_reset_')) {
            const ownerId = id.replace('admin_reset_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_reset_${ownerId}`).setTitle('♻️ Reset User');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('target_id').setLabel('User ID  (ama "all" = dhammaan)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('all   /   123456789012345678').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('reset_type').setLabel('Reset: iq / eco / both').setStyle(TextInputStyle.Short)
                        .setPlaceholder('iq  |  eco  |  both').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Aqoon: DM User button → modal ──
        if (id.startsWith('admin_aq_dm_')) {
            const ownerId = id.replace('admin_aq_dm_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_aq_m_dm_${ownerId}`).setTitle('💬 DM User');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Messageta').setStyle(TextInputStyle.Paragraph).setPlaceholder('Farriinta u dir the player...').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: All Players button ──
        if (id.startsWith('admin_eco_allplayers_')) {
            const ownerId = id.replace('admin_eco_allplayers_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const { buildAllPlayersEmbed } = require('../../data/commands/admin/adminEconPanel');
            const { econData: eData } = require('../economy/econStore');
            const totalPages = Math.max(1, Math.ceil(Object.keys(eData).filter(k => /^\d{17,19}$/.test(k)).length / 10));
            return interaction.update({ embeds: [await buildAllPlayersEmbed(0, interaction.guild, interaction.client)], components: [buildPlayersPageRow(0, totalPages, ownerId)] });
        }

        // ── Admin: Players page navigation ──
        if (id.startsWith('admin_eco_pg_')) {
            const parts   = id.replace('admin_eco_pg_', '').split('_');
            const page    = parseInt(parts[0]);
            const ownerId = parts.slice(1).join('_');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const { buildAllPlayersEmbed } = require('../../data/commands/admin/adminEconPanel');
            const { econData: eData } = require('../economy/econStore');
            const totalPages = Math.max(1, Math.ceil(Object.keys(eData).filter(k => /^\d{17,19}$/.test(k)).length / 10));
            return interaction.update({ embeds: [await buildAllPlayersEmbed(page, interaction.guild, interaction.client)], components: [buildPlayersPageRow(page, totalPages, ownerId)] });
        }


        // ── Admin Econ: Top-up Treasury button → modal ──
        if (id.startsWith('admin_eco_topup_')) {
            const ownerId = id.replace('admin_eco_topup_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const { getTreasury } = require('../economy/econStore');
            const { fmt } = require('../utils/helpers');
            const t = getTreasury();
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_topup_${ownerId}`).setTitle('🏛️ Treasury Top-up');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddad ku dar treasury (Coins)').setStyle(TextInputStyle.Short)
                        .setPlaceholder(`Current: 🪙: ${fmt((t.balance || 0))}`).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Tax button → modal ──
        if (id.startsWith('admin_eco_tax_')) {
            const ownerId = id.replace('admin_eco_tax_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_tax_${ownerId}`).setTitle('💸 Tax Players');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Tax per player (Coins)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Example: 5').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Reset (user or all) button → modal ──
        if (id.startsWith('admin_eco_resetany_')) {
            const ownerId = id.replace('admin_eco_resetany_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: '⛔ Owner only.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_resetany_${ownerId}`).setTitle('♻️ Reset Economy');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('target_id').setLabel('User ID  (ama "all" = dhammaan)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('all   /   123456789012345678').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('reset_what').setLabel('Reset: wallet / bank / both').setStyle(TextInputStyle.Short)
                        .setPlaceholder('wallet  |  bank  |  both').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Reset All button → confirm modal ──
        if (id.startsWith('admin_eco_resetall_')) {
            const ownerId = id.replace('admin_eco_resetall_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_resetall_${ownerId}`).setTitle('♻️ Reset All Economy');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('confirm').setLabel('Xaqiiji: qor "RESET"').setStyle(TextInputStyle.Short).setPlaceholder('RESET').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short).setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Give USD button → modal ──
        if (id.startsWith('admin_eco_givecoins_') || id.startsWith('admin_eco_giveusd_')) {
            const ownerId = id.replace(/^admin_eco_give(?:coins|usd)_/, '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_givecoins_${ownerId}`).setTitle('🪙 Give Coins');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount Coins').setStyle(TextInputStyle.Short).setPlaceholder('Example: 5000').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Give Asset button → modal ──
        if (id.startsWith('admin_eco_giveasset_')) {
            const ownerId = id.replace('admin_eco_giveasset_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_giveasset_${ownerId}`).setTitle('🪙 Give Asset');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('asset').setLabel('Asset (coins)').setStyle(TextInputStyle.Short).setPlaceholder('coins').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setPlaceholder('Example: 1').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Give Bank button → modal ──
        if (id.startsWith('admin_eco_givebank_')) {
            const ownerId = id.replace('admin_eco_givebank_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_givebank_${ownerId}`).setTitle('🏦 Give Bank');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bank').setLabel('Bank (garaad)').setStyle(TextInputStyle.Short).setPlaceholder('garaad').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount Coins').setStyle(TextInputStyle.Short).setPlaceholder('Example: 10000').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Give Title button → modal ──
        if (id.startsWith('admin_eco_givetitle_')) {
            const ownerId = id.replace('admin_eco_givetitle_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_givetitle_${ownerId}`).setTitle('🏷️ Give Economy Title');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title_key').setLabel('Title Key').setStyle(TextInputStyle.Short).setPlaceholder('ceoofbank / tycoon / manager ...').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Reset button → modal ──
        if (id.startsWith('admin_eco_reset_')) {
            const ownerId = id.replace('admin_eco_reset_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_reset_${ownerId}`).setTitle('🗑️ Reset Economy');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reset_what').setLabel('Reset: wallet / bank / both').setStyle(TextInputStyle.Short).setPlaceholder('wallet  |  bank  |  both').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin Econ: Treasury button → modal ──
        if (id.startsWith('admin_eco_treasury_')) {
            const ownerId = id.replace('admin_eco_treasury_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getTreasury } = require('../economy/econStore');
            const t = getTreasury();
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_treasury_${ownerId}`).setTitle('🏛️ Treasury');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('action').setLabel('Ficil: view | distribute | give').setStyle(TextInputStyle.Short).setPlaceholder('view  /  distribute  /  give').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddad (distribute) ama "UserID xad" (give)').setStyle(TextInputStyle.Short).setPlaceholder(`Treasury now: 🪙: ${fmt((t.balance || 0))}`).setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('password').setLabel('🔐 Owner Password').setStyle(TextInputStyle.Short).setPlaceholder('Owner password').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── IQ dhigo button → modal ──
        if (id.startsWith('iq_dhigo_btn_')) {
            const ownerId = id.replace('iq_dhigo_btn_', '');
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            const modal = new ModalBuilder()
                .setCustomId(`iq_dhigo_modal_${ownerId}`)
                .setTitle('IQ Bank Dhig');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('iq_amount')
                    .setLabel('Immisa IQ baad dhigan?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: 50')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── IQ la bax button → modal ──
        if (id.startsWith('iq_labax_btn_')) {
            const ownerId = id.replace('iq_labax_btn_', '');
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            checkUser(ownerId);
            const bal = userData[ownerId].bank.balance;
            const modal = new ModalBuilder()
                .setCustomId(`iq_labax_modal_${ownerId}`)
                .setTitle('IQ Bank Ka Bax');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('iq_amount')
                    .setLabel('Immisa IQ baad baxan? (0 = oo dhan)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Max: ${bal} IQ`)
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Bank: Bax (claim dhammaan) ──
        if (id.startsWith('bank_bax_')) {
            const ownerId = id.replace('bank_bax_', '');
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            checkUser(ownerId);
            const d = userData[ownerId];
            const bank = d.bank;
            if (bank.balance <= 0) {
                return interaction.reply({ content: '⚠️ Bank kaaga waa madhan yahay.', flags: MessageFlags.Ephemeral });
            }
            const amount = bank.balance;
            d.iq         += amount;
            bank.balance  = 0;
            bank.transactions.unshift({ type: 'withdraw', amount, at: Date.now() });
            if (bank.transactions.length > 20) bank.transactions.length = 20;
            const { saveData } = require('../utils/helpers');
            saveData();
            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setDescription(
                        `✅ **${amount} IQ** bank laga baxay\n\n` +
                        `🏦 Kaydka bank: **0 IQ**\n` +
                        `🧠 IQ-daada: **${d.iq} IQ**`
                    )
                    .setColor('#f39c12')],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`bank_bax_${ownerId}`)
                        .setLabel('Bax')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`close_bank_${ownerId}`)
                        .setLabel('Iska close')
                        .setStyle(ButtonStyle.Danger),
                )],
            });
        }

        // ── Jeeb: Refresh ──
        if (id.startsWith('jeeb_refresh_')) {
            const parts    = id.replace('jeeb_refresh_', '').split('_');
            const targetId = parts[parts.length - 1];
            const authorId = parts.slice(0, -1).join('_');
            if (interaction.user.id !== authorId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { buildJeebEmbed, jeebRow } = require('../../data/commands/economy/jeeb');
            const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
            const username   = targetUser ? targetUser.username : targetId;
            return interaction.update({ embeds: [buildJeebEmbed(targetId, username)], components: [jeebRow(authorId, targetId)] });
        }

        // ── Team Duel: lobby buttons ──
        if (id.startsWith('tduel_join_')) {
            const channelId = id.replace('tduel_join_', '');
            const { handleJoin } = require('../games/teamDuel');
            return handleJoin(interaction, channelId);
        }
        if (id.startsWith('tduel_leave_')) {
            const channelId = id.replace('tduel_leave_', '');
            const { handleLeave } = require('../games/teamDuel');
            return handleLeave(interaction, channelId);
        }
        if (id.startsWith('tduel_start_')) {
            const rest      = id.replace('tduel_start_', '');
            const lastUs    = rest.lastIndexOf('_');
            const hostId    = rest.slice(0, lastUs);
            const channelId = rest.slice(lastUs + 1);
            const { handleStart } = require('../games/teamDuel');
            return handleStart(interaction, hostId, channelId);
        }
        if (id.startsWith('tduel_cancel_')) {
            const rest      = id.replace('tduel_cancel_', '');
            const lastUs    = rest.lastIndexOf('_');
            const hostId    = rest.slice(0, lastUs);
            const channelId = rest.slice(lastUs + 1);
            const { handleCancel } = require('../games/teamDuel');
            return handleCancel(interaction, hostId, channelId);
        }
        // Team Duel answer buttons — handled by collector; block non-participants
        if (id.startsWith('tduel_ans_')) {
            const parts     = id.split('_');
            // tduel_ans_{channelId}_{qIndex}_{optIndex}_{t|f}
            const channelId = parts[2];
            const { activeTeamDuels, handleNonParticipantAnswer } = require('../games/teamDuel');
            const state = activeTeamDuels.get(channelId);
            if (state && !([...state.teams[1], ...state.teams[2]]).includes(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Game kuma jirtid — kama jawaabi kartid.', flags: MessageFlags.Ephemeral });
            }
            return; // handled by collector
        }

        // ── Admin: Eid greeting — channel only ──
        if (id.startsWith('admin_eid_')) {
            const ownerId = id.replace('admin_eid_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });

            // Reply FIRST — instant, no hang
            await interaction.reply({ content: '✅ Ciid message sent!', flags: MessageFlags.Ephemeral });

            // Send to channel in background — no await blocking interaction
            const EID_CHANNEL_ID = '1499085787361316915';
            const { buildChannelPayload } = require('../../data/commands/admin/ciidCmd');
            const eidCh = interaction.guild.channels.cache.get(EID_CHANNEL_ID);
            const target = eidCh || interaction.channel;
            target.send(buildChannelPayload()).catch(e => console.error('[Ciid]', e.message));
            return;
        }

        // ── New Shop: section navigation ──
        if (id.startsWith('shop_section_') || id === 'shop_back') {
            const { shopEmbed, shopRows } = require('../../data/commands/shopCmd');
            const { checkUser } = require('../utils/helpers');
            const userId = interaction.user.id;
            checkUser(userId);
            const section = id === 'shop_back' ? '' : id.replace('shop_section_', '');
            return interaction.update({ embeds: [shopEmbed(section, userId)], components: shopRows(section) });
        }

        // ── New Shop: buy via button ──
        if (id.startsWith('shop_buy_')) {
            const parts  = id.replace('shop_buy_', '').split('_');
            const type   = parts[0];
            const requestedKey = parts.slice(1).join('_');
            const key = requestedKey;
            const userId = interaction.user.id;

            const { checkUser } = require('../utils/helpers');
            const { userData, saveData } = require('../store');
            const { econData, checkEconUser, saveEcon, getSpendableCoins, spendCoins } = require('../economy/econStore');
            const { FRAMES, BOOSTERS, LOOT_BOXES } = require('../../src/utils/itemDefs');
            const { ECON_TITLES } = require('../../data/commands/economy/econShop');
            checkUser(userId);
            checkEconUser(userId);

            const d  = userData[userId];
            const ec = econData[userId];
            if (!ec) return interaction.reply({ content: '⚠️ Economy account was not found. `?jeeb`', flags: MessageFlags.Ephemeral });

            if (type === 'frame') {
                const frame = FRAMES[key];
                if (!frame || frame.lootOnly) return interaction.reply({ content: '⚠️ Frame loot box only.', flags: MessageFlags.Ephemeral });
                if ((d.ownedFrames || []).includes(key)) return interaction.reply({ content: '✅ Horay ayaad u lahayd.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(userId) < frame.price) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${frame.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, frame.price);
                d.ownedFrames.push(key);
                d.activeFrame = key; // auto-equip
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${frame.emoji} ${frame.name}** purchased & equipped! (-🪙${frame.price.toLocaleString()})\n\`?profile\` ku eeg.`, flags: MessageFlags.Ephemeral });
            }

            if (type === 'booster') {
                const boost = BOOSTERS[key];
                if (!boost) return interaction.reply({ content: '⚠️ Booster was not found.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(userId) < boost.price) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${boost.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, boost.price);
                if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
                else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
                else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
                else if (key === 'double_coins') d.boosters.doubleCoins = Date.now() + boost.duration;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${boost.emoji} ${boost.name}** purchased!`, flags: MessageFlags.Ephemeral });
            }

            if (type === 'loot') {
                const box = LOOT_BOXES[key];
                if (!box) return interaction.reply({ content: '⚠️ Loot box was not found.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(userId) < box.price) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${box.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, box.price);
                d.lootBoxes       ??= {};
                d.lootBoxes[key]   = (d.lootBoxes[key] || 0) + 1;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${box.emoji} ${box.name}** purchased! Fur: \`?open ${key}\``, flags: MessageFlags.Ephemeral });
            }

            if (type === 'title') {
                const title = ECON_TITLES[key];
                if (!title) return interaction.reply({ content: '⚠️ Title was not found.', flags: MessageFlags.Ephemeral });
                if ((ec.econTitles || []).includes(key)) return interaction.reply({ content: '✅ Horay ayaad u lahayd.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(userId) < title.price) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${title.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, title.price);
                ec.econTitles = ec.econTitles || [];
                ec.econTitles.push(key);
                saveEcon();
                return interaction.reply({ content: `✅ **${title.label}** purchased! \`?equip title ${key}\` si aad u xidho.`, flags: MessageFlags.Ephemeral });
            }

            // ── Rob Ticket ──
            if (id === 'shop_buy_rob_ticket') {
                const PRICE = 500;
                if (getSpendableCoins(userId) < PRICE) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${PRICE.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, PRICE);
                ec.inventory ??= {};
                ec.inventory.robticketExpiry = Date.now() + 24 * 60 * 60 * 1000;
                saveEcon();
                return interaction.reply({ content: `✅ **🔫 Rob Ticket** purchased! 24 saac active. \`?rob @user\` use.`, flags: MessageFlags.Ephemeral });
            }

            // ── Safety Shield ──
            if (id === 'shop_buy_safety_shield') {
                const PRICE = 300;
                if (getSpendableCoins(userId) < PRICE) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${PRICE.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, PRICE);
                ec.inventory ??= {};
                ec.inventory.safetyExpiry = Date.now() + 24 * 60 * 60 * 1000;
                saveEcon();
                return interaction.reply({ content: `✅ **🛡️ Safety Shield** purchased! 24h active. Rob kaa kari maysid.`, flags: MessageFlags.Ephemeral });
            }

            // ── Ring purchases ──
            if (id.startsWith('shop_buy_ring_')) {
                const { RINGS } = require('../../src/utils/itemDefs');
                const { ensureRel } = require('../../data/commands/relationship');
                const { userData, saveData } = require('../store');
                const type = id.replace('shop_buy_ring_', '');
                const ring = RINGS[type];
                if (!ring) return interaction.reply({ content: '⚠️ Ring nooc ah was not found.', flags: MessageFlags.Ephemeral });
                if (getSpendableCoins(userId) < ring.price) return interaction.reply({ content: `⚠️ You do not have enough Coins. U baahan: 🪙${ring.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                spendCoins(userId, ring.price);
                checkUser(interaction.user.id);
                ensureRel(interaction.user.id);
                userData[interaction.user.id].ownedRings ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
                userData[interaction.user.id].ownedRings[type] = (userData[interaction.user.id].ownedRings[type] || 0) + 1;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${ring.emoji} ${ring.name}** purchased! (-🪙${ring.price.toLocaleString()})\nUsage: \`?propose @user\``, flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({ content: '⚠️ Unknown purchase type.', flags: MessageFlags.Ephemeral });
        }

        // ── Treasury buttons (admins only) ──
        if (id.startsWith('trs_add_') || id.startsWith('trs_reduce_') || id.startsWith('trs_set_')) {
            const ownerId = id.split('_').slice(2).join('_');
            if (interaction.user.id !== ownerId || !isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin only, and use your own treasury panel.', flags: MessageFlags.Ephemeral });
            const { getTreasury } = require('../economy/econStore');
            const { fmt } = require('../utils/helpers');
            const t = getTreasury();
            let kind, label, placeholder;
            if (id.startsWith('trs_add_'))    { kind = 'add';    label = '📥 Ku dar Coins';     placeholder = 'Example: 1000000'; }
            if (id.startsWith('trs_reduce_')) { kind = 'reduce'; label = '📤 Ka jar Coins';     placeholder = `Max: ${fmt(t.balance)}`; }
            if (id.startsWith('trs_set_'))    { kind = 'set';    label = '🎯 Xaddad cusub set'; placeholder = `Current: ${fmt(t.balance)}`; }
            const modal = new ModalBuilder()
                .setCustomId(`trs_m_${kind}_${ownerId}`)
                .setTitle(`🏛️ Treasury — ${label}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('amount')
                        .setLabel(label)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder(placeholder)
                        .setRequired(true)
                )
            );
            return interaction.showModal(modal);
        }

        // ── Personal: view buttons ──
        if (id.startsWith('rel_view_friends_') || id.startsWith('rel_view_partner_')) {
            const ownerId = id.split('_').pop();
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { userData } = require('../store');
            const { ensureRel, RING_NAMES } = require('../../data/commands/relationship');
            checkUser(ownerId);
            ensureRel(ownerId);
            const d = userData[ownerId];

            if (id.startsWith('rel_view_friends_')) {
                const friendIds = d.friends || [];
                if (!friendIds.length)
                    return interaction.reply({ content: '📭 Saaxiib do not have weli.', flags: MessageFlags.Ephemeral });
                const names = await Promise.all(friendIds.map(async fid => {
                    try { const u = await client.users.fetch(fid); return `👤 **${u.username}**`; }
                    catch { return `👤 <@${fid}>`; }
                }));
                return interaction.reply({ content: `**👥 Saaxiibada (${friendIds.length}):**\n${names.join('\n')}`, flags: MessageFlags.Ephemeral });
            }

            if (id.startsWith('rel_view_partner_')) {
                const rel = d.relationship || {};
                if (!rel.partnerId)
                    return interaction.reply({ content: '💔 You do not have a partner.', flags: MessageFlags.Ephemeral });
                let pName = rel.partnerUsername || `<@${rel.partnerId}>`;
                try { const u = await client.users.fetch(rel.partnerId); pName = u.username; } catch {}
                const days = rel.since ? Math.floor((Date.now() - rel.since) / 86400000) : 0;
                return interaction.reply({
                    content: `💕 **Partner:** ${pName} ❤️ ${interaction.user.username}\n📅 **${days} Maalmood** wada joogaan\n${RING_NAMES[rel.ringType] || '💍'}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        // ── Relationship: Friend request ──
        if (id.startsWith('rel_af_') || id.startsWith('rel_df_')) {
            const { userData, saveData } = require('../store');
            const { ensureRel } = require('../../data/commands/relationship');
            const fromId  = id.replace('rel_af_', '').replace('rel_df_', '');
            const userId  = interaction.user.id;
            checkUser(userId);
            checkUser(fromId);
            ensureRel(userId);
            ensureRel(fromId);
            const d = userData[userId];

            if (!(d.pendingFriendReqs || []).includes(fromId))
                return interaction.reply({ content: '⚠️ Codsi saaxiibtinimo kuu jirin.', flags: MessageFlags.Ephemeral });

            d.pendingFriendReqs = d.pendingFriendReqs.filter(i => i !== fromId);

            if (id.startsWith('rel_af_')) {
                d.friends = d.friends || [];
                userData[fromId].friends = userData[fromId].friends || [];
                if (!d.friends.includes(fromId)) d.friends.push(fromId);
                if (!userData[fromId].friends.includes(userId)) userData[fromId].friends.push(userId);
                saveData();
                let fromName = fromId;
                try { const u = await client.users.fetch(fromId); fromName = u.username; } catch {}
                await interaction.message.edit({ components: [] }).catch(() => {});
                return interaction.reply({ content: `💕 **${fromName}** iyo adigu saaxiib baad noqdeen!`, flags: MessageFlags.Ephemeral });
            } else {
                saveData();
                await interaction.message.edit({ components: [] }).catch(() => {});
                return interaction.reply({ content: '❌ Codsiga saaxiibtinimada waa la diiday.', flags: MessageFlags.Ephemeral });
            }
        }

        // ── Relationship: Proposal ──
        if (id.startsWith('rel_ap_') || id.startsWith('rel_dp_')) {
            const { userData, saveData } = require('../store');
            const { ensureRel, RING_NAMES } = require('../../data/commands/relationship');
            const fromId = id.replace('rel_ap_', '').replace('rel_dp_', '');
            const userId = interaction.user.id;
            checkUser(userId);
            checkUser(fromId);
            ensureRel(userId);
            ensureRel(fromId);
            const d       = userData[userId];
            const fromD   = userData[fromId];
            const proposal = d.pendingProposal;

            if (!proposal || proposal.fromId !== fromId)
                return interaction.reply({ content: '⚠️ Codsi guur kuu jirin.', flags: MessageFlags.Ephemeral });

            d.pendingProposal = null;

            if (id.startsWith('rel_dp_')) {
                // Cancel 2-min timer — proposal already answered (declined)
                try { const { clearProposalTimer } = require('../../data/commands/relationship'); clearProposalTimer(fromId); } catch {}
                saveData();
                await interaction.message.edit({ components: [] }).catch(() => {});
                return interaction.reply({ content: '💔 Codsiga guurka waa la diiday.', flags: MessageFlags.Ephemeral });
            }

            // Accept — consume ring, create relationship
            const ringType = proposal.ringType;
            fromD.ownedRings ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
            fromD.ownedRings[ringType] = Math.max(0, (fromD.ownedRings[ringType] || 0) - 1);

            let fromName = proposal.fromUsername || fromId;
            try { const u = await client.users.fetch(fromId); fromName = u.username; } catch {}

            const now = Date.now();
            d.relationship    = { partnerId: fromId, partnerUsername: fromName,          ringType, since: now, proposerId: fromId };
            fromD.relationship = { partnerId: userId, partnerUsername: interaction.user.username, ringType, since: now, proposerId: fromId };
            // Cancel 2-min timer — proposal already answered
            try { const { clearProposalTimer } = require('../../data/commands/relationship'); clearProposalTimer(fromId); } catch {}

            // Award badges
            const awardBadge = (uid, badge) => {
                userData[uid].badges ??= [];
                if (!userData[uid].badges.includes(badge)) userData[uid].badges.push(badge);
            };
            awardBadge(userId, 'first_love'); awardBadge(userId, 'engaged');
            awardBadge(fromId, 'first_love');
            if (ringType === 'royal')  { awardBadge(userId, 'royal_couple');  awardBadge(fromId, 'royal_couple'); }
            if (ringType === 'somali') { awardBadge(userId, 'somali_couple'); awardBadge(fromId, 'somali_couple'); }

            saveData();
            await interaction.message.edit({ components: [] }).catch(() => {});
            return interaction.reply({
                content: `💍 **${fromName}** ❤️ **${interaction.user.username}** — Hambalyo! Wada noloshiinna waa la xidey!\n${RING_NAMES[ringType]}`,
            });
        }

        // ── ?bank Deposit button → bank selection panel ──
        if (id.startsWith('bank_all_dep_')) {
            const userId = id.replace('bank_all_dep_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData2 } = require('../economy/econStore');
            const { getAllPublicBanks: _gpb2 } = require('../economy/bankStore');
            const PUB_EXP = 14 * 24 * 60 * 60 * 1000;
            const pubB = Object.values(_gpb2()).filter(b => (Date.now() - (b.lastActivity || b.createdAt)) < PUB_EXP).sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 4);
            const persB = Object.entries(eData2).filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank && uid !== userId).map(([uid, d]) => ({ uid, bank: d.personalBank })).slice(0, 4);
            const btns = [
                new ButtonBuilder().setCustomId(`dep_garaad_${userId}`).setLabel('🏦 Garaad Bank').setStyle(ButtonStyle.Success),
                ...pubB.map(b => new ButtonBuilder().setCustomId(`dep_pub_${b.id}_${userId}`).setLabel(`🏛 ${b.name.slice(0, 20)}`).setStyle(ButtonStyle.Secondary)),
                ...persB.map(e => new ButtonBuilder().setCustomId(`dep_pers_${e.uid}_${userId}`).setLabel(`🏦 ${e.bank.owner.slice(0, 20)}`).setStyle(ButtonStyle.Secondary)),
            ];
            const rows = [];
            for (let i = 0; i < Math.min(btns.length, 10); i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
            return interaction.reply({ content: '**📥 Xoolo geli — bank Choose:**', components: rows, flags: MessageFlags.Ephemeral });
        }

        // ── ?bank Withdraw button → bank selection panel ──
        if (id.startsWith('bank_all_wd_')) {
            const userId = id.replace('bank_all_wd_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData3 } = require('../economy/econStore');
            const { getAllPublicBanks: _gpb3 } = require('../economy/bankStore');
            const PUB_EXP = 14 * 24 * 60 * 60 * 1000;
            const pubB = Object.values(_gpb3()).filter(b => (b.customers?.[userId]?.balance || 0) > 0 && (Date.now() - (b.lastActivity || b.createdAt)) < PUB_EXP).slice(0, 4);
            const persB = Object.entries(eData3).filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank && uid !== userId && (d.personalBank.customers?.[userId]?.balance || 0) > 0).map(([uid, d]) => ({ uid, bank: d.personalBank })).slice(0, 4);
            const garaadBal = eData3[userId]?.banks?.garaad || 0;
            const btns = [];
            if (garaadBal > 0) btns.push(new ButtonBuilder().setCustomId(`wd_garaad_${userId}`).setLabel('🏦 Garaad Bank').setStyle(ButtonStyle.Primary));
            btns.push(...pubB.map(b => new ButtonBuilder().setCustomId(`wd_pub_${b.id}_${userId}`).setLabel(`🏛 ${b.name.slice(0, 20)}`).setStyle(ButtonStyle.Secondary)));
            btns.push(...persB.map(e => new ButtonBuilder().setCustomId(`wd_pers_${e.uid}_${userId}`).setLabel(`🏦 ${e.bank.owner.slice(0, 20)}`).setStyle(ButtonStyle.Secondary)));
            if (!btns.length)
                return interaction.reply({ content: '⚠️ Wax bank ah Coins kuma dhigna.', flags: MessageFlags.Ephemeral });
            const rows = [];
            for (let i = 0; i < Math.min(btns.length, 10); i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
            return interaction.reply({ content: '**📤 Coins ka qaad — bank Choose:**', components: rows, flags: MessageFlags.Ephemeral });
        }

        // ── Back to ebank main panel ──
        if (id.startsWith('back_to_banks_') || id.startsWith('bank_view_garaad_')) {
            const userId = id.startsWith('back_to_banks_')
                ? id.replace('back_to_banks_', '')
                : id.replace('bank_view_garaad_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { applyInterest, buildMainEmbed, bankFullRow } = require('../../data/commands/economy/ebank');
            checkEconUser(userId);
            const d = eData[userId];
            applyInterest(d);
            saveEcon();
            return interaction.update({ embeds: [buildMainEmbed(d)], components: [bankFullRow(userId)] });
        }

        // ── View Public Bank from directory ──
        if (id.startsWith('bank_view_pub_') && !id.includes('modal')) {
            const rest   = id.replace('bank_view_pub_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks } = require('../economy/bankStore');
            const { buildPubBankPanel } = require('../../data/commands/economy/personalBank');
            const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
            if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
            const { embed, components } = buildPubBankPanel(bank, userId);
            return interaction.update({ embeds: [embed], components });
        }

        // ── View Personal Bank from directory ──
        if (id.startsWith('bank_view_pers_') && !id.includes('modal')) {
            const rest    = id.replace('bank_view_pers_', '');
            const lastU   = rest.lastIndexOf('_');
            const ownerId = rest.substring(0, lastU);
            const userId  = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData } = require('../economy/econStore');
            const { buildPersBankPanel } = require('../../data/commands/economy/personalBank');
            const bank = eData[ownerId]?.personalBank;
            if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
            const { embed, components } = buildPersBankPanel(bank, ownerId, userId);
            return interaction.update({ embeds: [embed], components });
        }

        // ── Withdraw from Public Bank ──
        if (id.startsWith('wd_pub_') && !id.includes('modal')) {
            const rest   = id.replace('wd_pub_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks } = require('../economy/bankStore');
            const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
            const myBal = bank?.customers?.[userId]?.balance || 0;
            const modal = new ModalBuilder()
                .setCustomId(`wd_pub_modal_${bankId}_${userId}`)
                .setTitle(`⬆️ Withdraw — ${bank?.name || bankId}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('wd_amount')
                    .setLabel(`Amount (max: 🪙${myBal.toLocaleString()})`)
                    .setPlaceholder('Example: 2000')
                    .setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Withdraw from Personal Bank ──
        if (id.startsWith('wd_pers_') && !id.includes('modal')) {
            const rest    = id.replace('wd_pers_', '');
            const lastU   = rest.lastIndexOf('_');
            const ownerId = rest.substring(0, lastU);
            const userId  = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData } = require('../economy/econStore');
            const bank  = eData[ownerId]?.personalBank;
            const myBal = bank?.customers?.[userId]?.balance || 0;
            const modal = new ModalBuilder()
                .setCustomId(`wd_pers_modal_${ownerId}_${userId}`)
                .setTitle(`⬆️ Withdraw — ${bank?.owner || 'Bank'}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('wd_amount')
                    .setLabel(`Amount (max: 🪙${myBal.toLocaleString()})`)
                    .setPlaceholder('Example: 1000')
                    .setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── All Banks button in ebank panel ──
        if (id.startsWith('eco_eb_allbanks_')) {
            const userId = id.replace('eco_eb_allbanks_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { buildBankDirectory } = require('../../data/commands/economy/personalBank');
            const { embed, components } = buildBankDirectory(userId);
            return interaction.update({ embeds: [embed], components });
        }

        // ── Back from directory to ebank main ──
        if (id.startsWith('eco_eb_back_dir_')) {
            const userId = id.replace('eco_eb_back_dir_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { applyInterest, buildMainEmbed, bankFullRow } = require('../../data/commands/economy/ebank');
            checkEconUser(userId);
            const d = eData[userId];
            applyInterest(d);
            saveEcon();
            return interaction.update({ embeds: [buildMainEmbed(d)], components: [bankFullRow(userId)] });
        }

        // ── Deposit into Garaad Bank (from directory) ──
        if (id.startsWith('dep_garaad_') && !id.includes('modal')) {
            const userId = id.replace('dep_garaad_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder()
                .setCustomId(`dep_garaad_modal_${userId}`)
                .setTitle('🏦 Garaad Bank — Deposit');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Amount Coins').setPlaceholder('Example: 5000').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Withdraw from Garaad Bank ──
        if (id.startsWith('wd_garaad_') && !id.includes('modal')) {
            const userId = id.replace('wd_garaad_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData } = require('../economy/econStore');
            const bal = eData[userId]?.banks?.garaad || 0;
            const modal = new ModalBuilder()
                .setCustomId(`wd_garaad_modal_${userId}`)
                .setTitle('🏦 Garaad Bank — Withdraw');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('wd_amount').setLabel(`Amount Coins (Max: 🪙${bal.toLocaleString()})`).setPlaceholder('Example: 5000').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Deposit into Public Bank (from directory) ──
        if (id.startsWith('dep_pub_') && !id.includes('modal')) {
            const rest   = id.replace('dep_pub_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder()
                .setCustomId(`dep_pub_modal_${bankId}_${userId}`)
                .setTitle(`🏛️ ${bankId} — Deposit`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Amount Coins').setPlaceholder('Example: 5000').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Claim owner profit from public bank ──
        if (id.startsWith('pubbank_claim_')) {
            const rest   = id.replace('pubbank_claim_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { buildOwnerPanel } = require('../../data/commands/economy/publicBank');
            const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
            if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner only.', flags: MessageFlags.Ephemeral });
            const profit = bank.ownerProfit || 0;
            if (profit <= 0) return interaction.reply({ content: '⚠️ Faa\'iido la\'aan now.', flags: MessageFlags.Ephemeral });
            checkEconUser(userId);
            eData[userId].coins  = (eData[userId].coins || 0) + profit;
            bank.ownerProfit   = 0;
            saveBanks(); saveEcon();
            const { embed, components } = buildOwnerPanel(bank, userId);
            return interaction.update({
                content: `✅ **🪙${Math.floor(profit).toLocaleString()}** profit your wallet la geeyay!`,
                embeds: [embed], components,
            });
        }

        // ── Fund public bank button → show modal ──
        if (id.startsWith('pubbank_fund_btn_')) {
            const rest   = id.replace('pubbank_fund_btn_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks } = require('../economy/bankStore');
            const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
            const modal = new ModalBuilder()
                .setCustomId(`pubbank_fund_modal_${bankId}_${userId}`)
                .setTitle(`🏦 ${bank?.name || bankId} — Capital Dar`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('fund_amount')
                    .setLabel('Amount Coins ee bank ku dari')
                    .setPlaceholder('Example: 10000')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Close public bank button → show confirmation ──
        if (id.startsWith('pubbank_close_btn_')) {
            const rest   = id.replace('pubbank_close_btn_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks } = require('../economy/bankStore');
            const { buildCloseConfirmPanel } = require('../../data/commands/economy/publicBank');
            const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId);
            if (!bank) return interaction.reply({ content: '⚠️ Bank not found.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner only ayaa tirtiri kara.', flags: MessageFlags.Ephemeral });
            const { embed, components } = buildCloseConfirmPanel(bank, userId);
            return interaction.update({ embeds: [embed], components });
        }

        // ── Close public bank CONFIRM → refund + delete ──
        if (id.startsWith('pubbank_close_confirm_')) {
            const rest   = id.replace('pubbank_close_confirm_', '');
            const lastU  = rest.lastIndexOf('_');
            const bankId = rest.substring(0, lastU);
            const userId = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const allBanks = getAllPublicBanks();
            const bank = Object.values(allBanks).find(b => b.id === bankId);
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin ama horaan la closeay.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner only ayaa tirtiri kara.', flags: MessageFlags.Ephemeral });

            const bankName = bank.name;
            let refunded = 0;
            // Refund all customer deposits
            for (const [custId, cust] of Object.entries(bank.customers || {})) {
                if (!cust.balance || cust.balance <= 0) continue;
                checkEconUser(custId);
                eData[custId].coins = (eData[custId].coins || 0) + cust.balance;
                refunded += cust.balance;
            }
            // Give owner their pending profit
            const profit = bank.ownerProfit || 0;
            if (profit > 0) {
                checkEconUser(userId);
                eData[userId].coins = (eData[userId].coins || 0) + profit;
            }
            // Delete bank
            delete allBanks[bankId];
            saveBanks();
            saveEcon();

            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('🗑️ Bank La Closeay')
                    .setColor('#e74c3c')
                    .setDescription(
                        `✅ **${bankName}** closed successfully.\n\n` +
                        `💰 Macaamiil waxaa loo celiyay: **🪙${Math.floor(refunded).toLocaleString()}**\n` +
                        (profit > 0 ? `💸 Faa'iidadaadii: **🪙${Math.floor(profit).toLocaleString()}** ayaa your wallet u galay.\n` : '') +
                        `\n_Mahadsanid useka Garaad Economy._`
                    )
                ],
                components: [],
            });
        }

        // ── Deposit into Personal Bank (from directory) ──
        if (id.startsWith('dep_pers_') && !id.includes('modal')) {
            const rest    = id.replace('dep_pers_', '');
            const lastU   = rest.lastIndexOf('_');
            const ownerId = rest.substring(0, lastU);
            const userId  = rest.substring(lastU + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData } = require('../economy/econStore');
            const ownerName = eData[ownerId]?.personalBank?.owner || ownerId;
            const modal = new ModalBuilder()
                .setCustomId(`dep_pers_modal_${ownerId}_${userId}`)
                .setTitle(`🏦 ${ownerName}'s Bank — Deposit`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Amount Coins').setPlaceholder('Example: 5000').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Personal Bank View: Deposit button (own bank) ──
        if (id.startsWith('pbank_own_dep_')) {
            const modal = new ModalBuilder()
                .setCustomId(`pbank_own_dep_modal_${interaction.user.id}`)
                .setTitle('📥 Bankaga — Coins Geli');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_own_amount')
                        .setLabel('Amount Coins (Coins)')
                        .setPlaceholder('Example: 5000')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Personal Bank View: Withdraw button (own bank) ──
        if (id.startsWith('pbank_own_wd_')) {
            const modal = new ModalBuilder()
                .setCustomId(`pbank_own_wd_modal_${interaction.user.id}`)
                .setTitle('📤 Bankaga — Coins Ka Qaad');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_wd_amount')
                        .setLabel('Amount Coins (Coins)')
                        .setPlaceholder('Example: 2000')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_wd_pw')
                        .setLabel('Password (if you dhigtay)')
                        .setPlaceholder('Enter your password, nowanay jirin — leave blank')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Personal Bank: deposit button → open modal ──
        if (id.startsWith('pbank_dep_btn_')) {
            const modal = new ModalBuilder()
                .setCustomId(`pbank_dep_modal_${interaction.user.id}`)
                .setTitle('💰 Bank — Coins Geli');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_bank_name')
                        .setLabel('Bank owner-ka magaciisa ama Bank ID')
                        .setPlaceholder('Example: Ahmed  ama  GB-12345')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_amount')
                        .setLabel('Amount Coins (Coins)')
                        .setPlaceholder('Example: 5000')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Close (Close) ──
        if (id.startsWith('close_')) {
            const parts   = id.split('_');
            const ownerId = parts[parts.length - 1];
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            return interaction.message.delete().catch(() => {});
        }

        // ── Give: Asset button → amount modal ──
        if (id.startsWith('eco_gv_')) {
            const parts    = id.split('_');
            const userId   = parts[parts.length - 1];
            const targetId = parts[parts.length - 2];
            const asset    = parts[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { ASSET_LABELS } = require('../../data/commands/economy/give');
            checkEconUser(userId);
            const balance = eData[userId][asset];

            const modal = new ModalBuilder()
                .setCustomId(`eco_gvmod_${asset}_${targetId}_${userId}`)
                .setTitle(`Coins u dir — ${ASSET_LABELS[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_gv_amount')
                    .setLabel(`Amount (You have: ${balance} ${asset.toUpperCase()})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: 200')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Ebank: navigation buttons ──
        if (id.startsWith('eco_eb_') && !id.startsWith('eco_eba_')) {
            const parts   = id.split('_');
            const userId  = parts[parts.length - 1];
            const section = parts[2]; // main | treasury | garaad

            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const {
                applyInterest,
                buildMainEmbed, buildBankEmbed, buildTreasuryEmbed,
                bankFullRow, ebCloseRow, backRow,
            } = require('../../data/commands/economy/ebank');
            checkEconUser(userId);
            const d = eData[userId];
            applyInterest(d);
            saveEcon();

            if (section === 'main') {
                return interaction.update({ embeds: [buildMainEmbed(d)], components: [bankFullRow(userId)] });
            }
            if (section === 'treasury') {
                return interaction.update({ embeds: [buildTreasuryEmbed()], components: [backRow(userId)] });
            }
            if (section === 'garaad') {
                return interaction.update({ embeds: [buildBankEmbed(d)], components: [bankFullRow(userId)] });
            }
            if (section === 'transfer') {
                const modal = new ModalBuilder()
                    .setCustomId(`eco_ebmod_transfer_garaad_${userId}`)
                    .setTitle('💸 Bank Transfer');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('eco_eb_target')
                            .setLabel('Qofka magaciisa (username)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Example: Ahmed')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('eco_eb_bankname')
                            .setLabel('Bank magaciisa (baniga Coins lagu dari)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('garaad | Kormaal Bank | GB-72957')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('eco_eb_amount')
                            .setLabel(`Amount (🪙: ${(d.banks?.garaad || 0).toLocaleString()} you have)`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('500')
                            .setRequired(true)
                    ),
                );
                return interaction.showModal(modal);
            }
        }

        // ── Ebank: Action button (deposit/withdraw) → amount modal ──
        if (id.startsWith('eco_eba_')) {
            const parts  = id.split('_');
            const userId = parts[parts.length - 1];
            const bank   = parts[parts.length - 2];
            const action = parts[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { econData: eData, checkEconUser } = require('../economy/econStore');
            checkEconUser(userId);
            const d         = eData[userId];
            const bankLabel = bank.charAt(0).toUpperCase() + bank.slice(1);
            const isDeposit = action === 'deposit';
            const maxAmt    = isDeposit ? (d.coins || 0) : (d.banks?.[bank] || 0);
            const label     = isDeposit ? `Dhig (Max: 🪙: ${maxAmt.toLocaleString()})` : `Bax (Max: 🪙: ${maxAmt.toLocaleString()})`;

            const modal = new ModalBuilder()
                .setCustomId(`eco_ebmod_${action}_${bank}_${userId}`)
                .setTitle(`${bankLabel} Bank — ${isDeposit ? 'Deposit' : 'Withdraw'}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_eb_amount')
                    .setLabel(label)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: 500')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }


        // ── Economy Shop: Buy title or item via button ──
        if (id.startsWith('eco_shop_')) {
            const key = id.replace('eco_shop_', '');
            const { econData: eData, checkEconUser, saveEcon, addToTreasury, getSpendableCoins, spendCoins } = require('../economy/econStore');
            const { SHOP_ITEMS } = require('../../data/commands/economy/econShop');
            const userId = interaction.user.id;
            checkEconUser(userId);
            const d    = eData[userId];
            const item = SHOP_ITEMS[key];
            if (!item) return interaction.reply({ content: '⚠️ Shayga la heli waayo.', flags: MessageFlags.Ephemeral });

            if (item.type === 'title') {
                if (d.econTitles.includes(key)) {
                    return interaction.reply({ content: `⚠️ **${item.label}** hormar you have.\n\`?etitle ${key}\` si aad u dhigto.`, flags: MessageFlags.Ephemeral });
                }
                if (getSpendableCoins(userId) < item.price) {
                    return interaction.reply({ content: `⚠️ You do not have enough Coins.\nQiimaha: **🪙: ${item.price.toLocaleString()}** | You have: **🪙: ${getSpendableCoins(userId).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                spendCoins(userId, item.price);
                d.econTitles.push(key);
                if (!d.activeEconTitle) d.activeEconTitle = key;
                addToTreasury(item.price);
                saveEcon();
                return interaction.reply({ content: `✅ **${item.label}** purchased successfully!\n\`?etitle ${key}\` si aad u dhigto.`, flags: MessageFlags.Ephemeral });
            }

            // Custom name title — show modal
            if (item.type === 'custom') {
                if (getSpendableCoins(userId) < item.price) {
                    return interaction.reply({ content: `⚠️ You do not have enough Coins.\nQiimaha: **🪙: ${item.price.toLocaleString()}** | You have: **🪙: ${getSpendableCoins(userId).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                const modal = new ModalBuilder()
                    .setCustomId(`eco_shop_custom_mod_${userId}`)
                    .setTitle('✍️ Magacaaga Custom Title-ka');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('custom_title_name')
                        .setLabel('Magacaaga title-ka (ugu badnaan 30 xaraf)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Example: Garaadle, Dr. Ahmed, The Shark...')
                        .setMaxLength(30)
                        .setRequired(true),
                ));
                return interaction.showModal(modal);
            }

            return interaction.reply({ content: '⚠️ Nooca shayga la garanwaayo.', flags: MessageFlags.Ephemeral });
        }

        // ── Solo Answer ──
        if (id.startsWith('q_')) return handleSoloAnswer(interaction);

        // ── Solo Leaderboard button ──
        if (id.startsWith('solo_leaderboard_')) {
            return handleSoloLeaderboard(interaction);
        }

        // ── Aqoon Register button (from ?aqoon / ?tartan panels) ──
        if (id.startsWith('aqoon_register_')) {
            const uid  = interaction.user.id;
            const code = genCode();
            tournamentRegistry.set(uid, { code, at: Date.now() });
            try {
                await interaction.user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🏁 Tartan — Code-kaaga Gaarka ah')
                        .setDescription(
                            `✅ **You won diiwaangelinta!**\n\n` +
                            `Code-gaaga waa:\n\n# \`${code}\`\n\n` +
                            `**Tillaabooyinka:**\n` +
                            `1. Wait to admin \`?tartan_bilow\` qoro\n` +
                            `2. Channel-ka tartanka u tag\n` +
                            `3. Qor: \`?gal ${code}\`\n\n` +
                            `⚠️ **Code-kan ha u shegin player kale!**`
                        )
                        .setColor('#2ecc71')],
                });
                return interaction.reply({ content: '✅ **Code-gaaga waa laguugu diray DM!** Fur farrimahaaga si aad u aragto.', flags: MessageFlags.Ephemeral });
            } catch {
                return interaction.reply({
                    content: '❌ Ma awoodin inaan kuu dirayo DM. Fur DM (Settings → Privacy → Allow DMs) ka dibna isku day mar kale.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        // ── Tournament Rules button ──
        if (id === 'tournament_rules') {
            return interaction.reply({
                flags: MessageFlags.Ephemeral,
                embeds: [new EmbedBuilder()
                    .setTitle('📖 Xeerarka Tartanka — Garaad Quiz')
                    .setColor('#3498db')
                    .setDescription(
                        `**📚 WAREEGYADA:**\n` +
                        `• Wareeg 1 — **${TOURNAMENT_R1_QUESTIONS} questions**\n` +
                        `• Wareeg 2 (Semi-Final) — **${TOURNAMENT_R2_QUESTIONS} questions**\n` +
                        `• Final 🏆 — **${TOURNAMENT_FINAL_QUESTIONS} questions**\n\n` +
                        `**⚡ points (ku xidhan speed):**\n` +
                        `• < 5 ilbiriqsi → **40 points** (max)\n` +
                        `• 18 ilbiriqsi → **5 points** (min)\n` +
                        `• Dhexda → si toos ah hoos ugu dhacaysa\n\n` +
                        `**🔀 SU'AALAHA:**\n` +
                        `• MCQ: **4 doorasho** (A, B, C, D)\n` +
                        `• True/False: **Run** (True) / **Been** (False)\n` +
                        `• Maadooyinka: Diini · Taariikh · Xisaab · Grammar · Juqraafi\n\n` +
                        `**🚫 KA-SAAR:**\n` +
                        `• Wareeg 1 → 2: 1/6 ee points hooseeya baxaan\n` +
                        `• Wareeg 2 → Final: badh (50%) ayaa baxaysa\n\n` +
                        `**🏆 ABAALMARINTA:**\n` +
                        `• the winner: **Champion 🏆** title + 500 XP\n\n` +
                        `**📋 SIDA LOO BIIRAY:**\n` +
                        `1. Guji **Register** (DM = code-kaaga)\n` +
                        `2. Wait admin inuu \`?tartan_bilow\` qoro\n` +
                        `3. Qor \`?gal CODE\` channel-ka tartanka\n` +
                        `4. Admin qoraa \`?admin_next\` — start!`
                    )
                    .setFooter({ text: 'Garaad Quiz Tournament' })],
            }).catch(() => {});
        }

        // ── Tournament Count button ──
        if (id === 'tournament_count_admin') {
            const count = tournamentRegistry?.size || 0;
            if (isAdmin(interaction.user.id)) {
                const list = [...(tournamentRegistry?.entries() || [])].slice(0, 25)
                    .map(([uid, { username }], i) => `${i + 1}. **${username || uid}** (\`${uid}\`)`)
                    .join('\n');
                return interaction.reply({
                    content: `👥 **Is-diiwaangashay:** ${count} player\n\n${list || '_Cidna weli ma diiwaangalin_'}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return interaction.reply({
                content: `👥 **Is-diiwaangashay:** ${count} player`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // ── Tournament Register button ──
        if (id === 'tournament_register') {
            const guildId = interaction.guildId;
            const state = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            if (!state || state.stage !== 'registration') {
                return interaction.reply({
                    content: '🔒 Diiwaangelinta was closed.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
            return sendRegistrationCode(interaction.user, { reply: (o) => interaction.reply(o) }, state.gameChannelId, state.vcChannelId);
        }

        // ── Tartan start: Status button ──
        if (id.startsWith('tartan_bilow_status_')) {
            const guildId = interaction.guildId;
            const state = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            const count = state ? state.players.size : 0;
            return interaction.reply({
                content: `👥 Ka qaybgalayaasha: **${count}** player`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Fur Tartanka ──
        if (id.startsWith('tartan_open_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Admins only.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const ok = await openGamePhase(interaction.client, interaction.user.id);
            if (ok) {
                return interaction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ Tartanka Waa La Furay')
                        .setColor('#2ecc71')
                        .setDescription(`Game channel waa opened → <#${GAME_CHANNEL_ID}>\nDadka waxay qori karaan \`?gal CODE\``)
                    ],
                    components: [],
                }).catch(() => {});
            }
            return interaction.reply({ content: '⚠️ Incorrect — state hubi.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Tirada ──
        if (id.startsWith('tartan_reg_count_')) {
            const count = tournamentRegistry?.size || 0;
            const list  = [...(tournamentRegistry?.entries() || [])].slice(0, 25)
                .map(([uid, { username }], i) => `${i + 1}. **${username || uid}** (\`${uid}\`)`)
                .join('\n');
            return interaction.reply({
                content: `👥 **Diiwaangeliyay:** ${count} player\n\n${list || '_Cidna weli ma diiwaangalin_'}`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Jooji ──
        if (id.startsWith('tartan_cancel_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Admins only.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const guildId = interaction.guildId;
            const state = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            if (state?._regTimer) clearTimeout(state._regTimer);
            activeTournament?.delete(guildId);
            activeTournament?.delete(GAME_CHANNEL_ID);
            deleteTournamentState(guildId).catch(() => {});
            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('🛑 Tartan Waa La Joojiyay')
                    .setColor('#e74c3c')
                    .setDescription('Admin ayaa tartanka joojiyay.')
                ],
                components: [],
            }).catch(() => {});
        }

        // ── Tartan: Admin Panel buttons ──
        if (id.startsWith('tartan_panel_')) {
            const action = id.replace('tartan_panel_', '');
            return handlePanelButton(interaction, action);
        }

        // ── Tartan start: Next (admin only) ──
        if (id.startsWith('tartan_bilow_next_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Only **admins** ayaa bilaabi kara!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const guildId = interaction.guildId;
            const state   = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            if (!state || state.stage !== 'join') {
                return interaction.reply({ content: '⚠️ Tartan lama heli karo ama mar hore wuu bilaabmay.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            if (state.players.size < TOURNAMENT_MIN_PLAYERS) {
                return interaction.reply({
                    content: `⚠️ Ugu yaraan **${TOURNAMENT_MIN_PLAYERS}** player. Current: **${state.players.size}**`,
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
            const gameChannel = state.channel || interaction.channel;
            await interaction.reply({ content: '▶️ Wareegga 1aad waa la bilaabayaa...', flags: MessageFlags.Ephemeral }).catch(() => {});
            state.survivors = new Set(state.players);
            state.roundIdx  = 1;
            state.channel   = gameChannel;
            // Disable this button to prevent double-clicks
            interaction.message.edit({ components: [] }).catch(() => {});
            return beginRound(state, gameChannel);
        }

        // ── Tournament Admin Next Button ──
        if (id.startsWith('tournament_admin_next_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Only **admins** ayaa badhankaan usei kara.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const guildId = interaction.guildId;
            const state   = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);

            if (!state) {
                return interaction.reply({
                    content: '⚠️ Tartan was not found. Ugu horreyn `?tartan_bilow` si channel-ka loo furo.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }

            if (state.stage === 'play') {
                return interaction.reply({
                    content: '⚠️ Wareeg ayaa now socda — wait to uu dhammaado.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }

            const tnGameCh = state.channel || interaction.channel;

            if (state.stage === 'join') {
                if (state.players.size < TOURNAMENT_MIN_PLAYERS) {
                    return interaction.reply({
                        content: `⚠️ Ugu yaraan **${TOURNAMENT_MIN_PLAYERS}** player ayaa loo baahan yahay. Current: **${state.players.size}** player.`,
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});
                }
                await interaction.reply({
                    content: '▶️ **Wareeg 1aad waa la bilaabayaa...**',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                state.survivors = new Set(state.players);
                state.roundIdx  = 1;
                state.channel   = tnGameCh;
                return beginRound(state, tnGameCh);
            }

            if (state.stage === 'pause') {
                const nextSurvivors = state._nextSurvivors || [];
                state.survivors     = new Set(nextSurvivors);
                state._nextSurvivors = null;
                if (state.survivors.size === 0) {
                    activeTournament.delete(guildId);
                    deleteTournamentState(guildId).catch(() => {});
                    return interaction.reply({
                        content: '❌ Cidna kuma hartay — tartan waa la joojiyay.',
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});
                }
                state.roundIdx += 1;
                const roundName = state.roundIdx === 2 ? 'Wareeg 2aad' : 'Final 🏆';
                await interaction.reply({
                    content: `▶️ **${roundName} waa la bilaabayaa...**`,
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                state.channel = tnGameCh;
                return beginRound(state, tnGameCh);
            }
        }

        // ── Duel ──
        if (id.startsWith('accept_duel_')) {
            const parts    = id.split('_');
            const authorId = parts[2];
            const targetId = parts[3];
            const count    = parseInt(parts[4] || '0');
            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: 'Adiga laguma casuumin.', flags: MessageFlags.Ephemeral });
            }
            checkUser(authorId);
            checkUser(targetId);
            if (userData[authorId].iq < DUEL_STAKE_IQ || userData[targetId].iq < DUEL_STAKE_IQ) {
                return interaction.reply({
                    content:
                        `⚠️ Duel wuxuu u baahan yahay **${DUEL_STAKE_IQ} IQ** dhig ah labadaba.\n` +
                        `<@${authorId}> **${userData[authorId].iq}** | <@${targetId}> **${userData[targetId].iq}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            const aBusy = isUserBusy(authorId);
            if (aBusy) return interaction.reply({ content: `Casuumaha mar hore wuxuu is in game **${aBusy}**.`, flags: MessageFlags.Ephemeral });
            const tBusy = isUserBusy(targetId);
            if (tBusy) return interaction.reply({ content: `You are already playing **${tBusy}**.`, flags: MessageFlags.Ephemeral });
            await interaction.update({ content: `⚔️ <@${targetId}> wuu aqbalay! Dagaalku wuu bilaabmayaa...`, embeds: [], components: [] });
            try {
                await startDuelGame(interaction.channel, authorId, targetId, count, null);
            } catch (e) {
                console.error('[Duel] startDuelGame error:', e.message);
                await interaction.channel.send(`⚠️ <@${authorId}> <@${targetId}> — Duel bilaabma kari waayay. Dib isku day.`).catch(() => {});
            }
            return;
        }

        if (id.startsWith('decline_duel_')) {
            const targetId = id.split('_')[3];
            if (interaction.user.id !== targetId) return interaction.reply({ content: 'Adiga laguma casuumin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ content: '❌ Duel waa la diiday.', embeds: [], components: [] });
        }

        // ── Quiz Lobby ──
        if (id.startsWith('quiz_join_')) {
            const channelId = id.replace('quiz_join_', '');
            const state = activeQuiz.get(channelId);
            if (!state || state.started) return interaction.reply({ content: 'Lobby was not found ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (state.players.has(interaction.user.id)) return interaction.reply({ content: 'Mar hore ayaad are in lobby-ga.', flags: MessageFlags.Ephemeral });
            if (state.players.size >= QUIZ_MAX_PLAYERS) return interaction.reply({ content: 'Lobby-gu wuu buuxsamay.', flags: MessageFlags.Ephemeral });
            const busy = isUserBusy(interaction.user.id);
            if (busy) return interaction.reply({ content: `You are already in a game **${busy}**!`, flags: MessageFlags.Ephemeral });
            state.players.add(interaction.user.id);
            state.scores[interaction.user.id] = 0;
            await interaction.deferUpdate().catch(() => {});
            return refreshQuizLobby(state);
        }

        if (id.startsWith('quiz_leave_')) {
            const channelId = id.replace('quiz_leave_', '');
            const state = activeQuiz.get(channelId);
            if (!state || state.started) return interaction.reply({ content: 'Lobby was not found ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (!state.players.has(interaction.user.id)) return interaction.reply({ content: 'Lobby kuma jirtid.', flags: MessageFlags.Ephemeral });
            const wasHost = interaction.user.id === state.hostId;
            state.players.delete(interaction.user.id);
            delete state.scores[interaction.user.id];
            if (state.players.size === 0) {
                if (state.lobbyTimer) clearTimeout(state.lobbyTimer);
                activeQuiz.delete(channelId);
                await interaction.deferUpdate().catch(() => {});
                if (state.message) await state.message.edit({ embeds: [new EmbedBuilder().setTitle('🚪 Lobby waa equipped').setDescription('Cidina kuma harin lobby-ga.').setColor('#7f8c8d')], components: [] }).catch(() => {});
                return;
            }
            if (wasHost) {
                state.hostId = [...state.players][0];
                if (state.message?.channel) await state.message.channel.send(`👑 Host cusub: <@${state.hostId}>.`).catch(() => {});
            }
            await interaction.deferUpdate().catch(() => {});
            return refreshQuizLobby(state);
        }

        if (id.startsWith('quiz_start_')) {
            const channelId = id.replace('quiz_start_', '');
            const state = activeQuiz.get(channelId);
            if (!state || state.started) return interaction.reply({ content: 'Lobby was not found ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== state.hostId) return interaction.reply({ content: 'Only the host ayaa bilaabi kara.', flags: MessageFlags.Ephemeral });
            if (state.players.size < QUIZ_MIN_PLAYERS) return interaction.reply({ content: `Ugu yaraan ${QUIZ_MIN_PLAYERS} player. Current: ${state.players.size}`, flags: MessageFlags.Ephemeral });
            await interaction.deferUpdate().catch(() => {});
            if (state.message) await state.message.edit({ embeds: [new EmbedBuilder().setTitle('✅ Lobby waa equipped').setDescription(`Quiz wuxuu ku bilaabmayaa **${state.players.size}** player.`).setColor('#2ecc71')], components: [] }).catch(() => {});
            return beginQuizGame(state);
        }

        // ── Catch-all: quiz answer buttons ──
        if (id.startsWith('quiz_a_')) {
            const parts     = id.split('_');
            const channelId = parts[2];
            const clickedQ  = parseInt(parts[3]);
            const qState    = activeQuiz.get(channelId);
            if (qState) {
                // Game is active — only let current question through to collector
                if (clickedQ === qState.currentQ) return;
                return interaction.reply({
                    content: '⚠️ Su\'aashaas waa hore — raadi su\'aasha cusub.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
            return interaction.reply({
                content: '⚠️ Quiz-kii wuu dhamaaday ama bot restart ayaa dhacay. start cusub: `?quiz`',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Catch-all: duel question buttons ──
        if (id.startsWith('duel_q_')) {
            const clickedQ = parseInt(id.split('_')[2]);
            const dState   = activeDuels.get(interaction.channelId);
            if (dState) {
                if (clickedQ === dState.currentQ) return; // let collector handle it
                return interaction.reply({
                    content: '⚠️ Su\'aashaas waa hore — raadi su\'aasha cusub.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
            return interaction.reply({
                content: '⚠️ Duel-kii wuu dhamaaday ama bot restart ayaa dhacay. start cusub: `?duel`',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Reminder opt-out ──────────────────────────────────────────────
        if (id.startsWith('reminder_optout_')) {
            const targetId = id.replace('reminder_optout_', '');
            if (interaction.user.id !== targetId)
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { userData: uData, saveData: sd } = require('../store');
            const { checkUser: cu } = require('../utils/helpers');
            cu(targetId);
            uData[targetId].reminderOptOut = true;
            sd();
            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setColor('#95a5a6')
                    .setDescription('🔕 **Xusuusinta waa la closeaa.**\nDM kuma sendin doono. Dib u fur: `?reminder on`')
                ],
                components: [],
            });
        }

        // ── Shared Access Panel ───────────────────────────────────────────
        if (id.startsWith('acc_')) {
            const parts    = id.split('_');
            const action   = parts[1];
            const targetId = parts[2];
            const callerId = parts[3] || parts[2];

            // Close
            if (action === 'close') {
                if (interaction.user.id !== callerId) return interaction.reply({ content: '⚠️', flags: MessageFlags.Ephemeral });
                return interaction.update({ embeds: [{ description: '✖ Access panel la closeaa.' }], components: [] });
            }

            // Validate session
            const sessionKey = `${callerId}_${targetId}`;
            const session    = global.accessSessions?.get(sessionKey);
            if (!session || Date.now() > session.expiresAt) {
                return interaction.reply({ content: '⏰ Access waxay dhammaysay. \`?access @user <pw>\` ku noqo.', flags: MessageFlags.Ephemeral });
            }
            if (interaction.user.id !== callerId) {
                return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { userData: uData } = require('../store');
            const { fmt: fmtH } = require('../utils/helpers');
            checkEconUser(targetId);
            checkEconUser(callerId);
            const ecT = eData[targetId];
            const ecC = eData[callerId];

            function fmtB(n) { return `🪙${Math.floor(n||0).toLocaleString()}`; }

            // Bank view
            if (action === 'bank') {
                const bank = ecT.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account does not have.', flags: MessageFlags.Ephemeral });
                let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
                return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle(`🏦 ${tName}'s Bank`)
                    .setDescription(
                        `💰 **Balance:** ${fmtB(bank.balance)}\n` +
                        `📥 **Total la geliyay:** ${fmtB(bank.deposits)}\n` +
                        `📤 **Total la bixiyay:** ${fmtB(bank.withdrawals)}`
                    )
                ]});
            }

            // Company view
            if (action === 'company') {
                const comp = ecT.company;
                if (!comp) return interaction.reply({ content: '⚠️ Company does not have.', flags: MessageFlags.Ephemeral });
                let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
                return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle(`🏢 ${comp.name}`)
                    .setDescription(
                        `👤 **Owner:** ${tName}\n` +
                        `💰 **Treasury:** ${fmtB(comp.treasury)}\n` +
                        `👥 **Employees:** ${comp.employees?.length || 0}`
                    )
                ]});
            }

            // Deposit (from caller's wallet → target's bank)
            if (action === 'deposit') {
                const bank = ecT.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account does not have.', flags: MessageFlags.Ephemeral });
                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                const modal = new ModalBuilder()
                    .setCustomId(`acc_dep_modal_${targetId}_${callerId}`)
                    .setTitle('📥 Deposit → Bank');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Amount Coins').setStyle(TextInputStyle.Short).setPlaceholder('500').setRequired(true)
                ));
                return interaction.showModal(modal);
            }

            // Withdraw (from target's bank → caller's wallet)
            if (action === 'withdraw') {
                const bank = ecT.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account does not have.', flags: MessageFlags.Ephemeral });
                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                const modal = new ModalBuilder()
                    .setCustomId(`acc_wd_modal_${targetId}_${callerId}`)
                    .setTitle('📤 Withdraw ← Bank');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Amount Coins').setStyle(TextInputStyle.Short).setPlaceholder('500').setRequired(true)
                ));
                return interaction.showModal(modal);
            }
        }

        // ── Access panel modals ────────────────────────────────────────────
        if (interaction.isModalSubmit?.() && id.startsWith('acc_dep_modal_')) {
            const parts    = id.split('_');
            const targetId = parts[3];
            const callerId = parts[4];
            const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            checkEconUser(targetId); checkEconUser(callerId);
            const ecC = eData[callerId]; const bank = eData[targetId].personalBank;
            if (!bank) return interaction.reply({ content: '⚠️ Bank does not have.', flags: MessageFlags.Ephemeral });
            if ((ecC.coins || 0) < amount) return interaction.reply({ content: `⚠️ You do not have enough Coins. You have: 🪙${(ecC.coins||0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
            ecC.coins = (ecC.coins || 0) - amount;
            bank.balance  += amount;
            bank.deposits += amount;
            saveEcon();
            let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
            return interaction.reply({ content: `📥 **🪙${amount.toLocaleString()}** you deposited **${tName}**'s bank!`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.isModalSubmit?.() && id.startsWith('acc_wd_modal_')) {
            const parts    = id.split('_');
            const targetId = parts[3];
            const callerId = parts[4];
            const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Enter a valid amount.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            checkEconUser(targetId); checkEconUser(callerId);
            const bank = eData[targetId].personalBank;
            if (!bank) return interaction.reply({ content: '⚠️ Bank does not have.', flags: MessageFlags.Ephemeral });
            if (bank.balance < amount) return interaction.reply({ content: `⚠️ Bank is not enough. Balance: 🪙${bank.balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });
            bank.balance      -= amount;
            bank.withdrawals  += amount;
            eData[callerId].coins = (eData[callerId].coins || 0) + amount;
            saveEcon();
            let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
            return interaction.reply({ content: `📤 **🪙${amount.toLocaleString()}** ka soo baxday **${tName}**'s bank — your wallet!`, flags: MessageFlags.Ephemeral });
        }

        // ── Game reward claim buttons ────────────────────────────────────
        if (id.startsWith('gr_')) {
            const { handleGameRewardChoice } = require('../utils/gameRewards');
            return handleGameRewardChoice(interaction);
        }

        // ── Rich Leaderboard Buttons ──────────────────────────────────────
        if (id.startsWith('close_rich_')) {
            const authorId = id.replace('close_rich_', '');
            if (interaction.user.id !== authorId) {
                return interaction.reply({ content: '⛔ The player who amarka bixiyay only ayaa can close.', flags: MessageFlags.Ephemeral });
            }
            return interaction.message.delete().catch(() => {});
        }

        if (id.startsWith('refresh_rich_')) {
            const authorId = id.replace('refresh_rich_', '');
            const { buildRichLeaderboard } = require('../../data/commands/economy/rich');
            const payload = await buildRichLeaderboard(interaction.client, interaction.guild, authorId);
            return interaction.update(payload).catch(() => {});
        }

        // ── Catch-all: tournament answer buttons orphaned after bot restart ──
        if (id.startsWith('tna_')) {
            const guildId = interaction.guildId;
            const tnState = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            // If a tournament is actively running, let the message collector handle it
            if (tnState && tnState.stage === 'play') return;
            return interaction.reply({
                content: '⚠️ Tartanku waa joojiyay ama bot restart ayaa dhacay. Wait wareeg cusub.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

    });
};
