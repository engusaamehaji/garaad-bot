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
const { buildEduEmbed, buildEcoEmbed, buildShopEmbed: buildHelpShopEmbed, buildWwEmbed, helpRow } = require('../../data/commands/help');

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

            // ── Treasury modals (owner only) ──
            if (interaction.customId.startsWith('trs_m_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
                const { getTreasury, setTreasury, topUpTreasury, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const { buildTreasuryEmbed, treasuryRow } = require('../../data/commands/economy/treasuryCmd');
                const rawAmount = interaction.fields.getTextInputValue('amount').replace(/,/g, '').trim();
                const amount    = parseFloat(rawAmount);
                const t         = getTreasury();

                if (interaction.customId.startsWith('trs_m_add_')) {
                    if (isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                    topUpTreasury(amount);
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(OWNER_ID)] });
                    return;
                }

                if (interaction.customId.startsWith('trs_m_reduce_')) {
                    if (isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                    if (amount > t.balance)
                        return interaction.reply({ content: `⚠️ Xaddadkaas ka weyn khaznadda. Hadda: **₿ ${fmt(t.balance)}**`, flags: MessageFlags.Ephemeral });
                    t.balance -= amount;
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(OWNER_ID)] });
                    return;
                }

                if (interaction.customId.startsWith('trs_m_set_')) {
                    if (isNaN(amount) || amount < 0)
                        return interaction.reply({ content: '⚠️ Xaddad sax ah geli (0 ama ka weyn).', flags: MessageFlags.Ephemeral });
                    setTreasury(amount);
                    saveEcon();
                    await interaction.update({ embeds: [buildTreasuryEmbed()], components: [treasuryRow(OWNER_ID)] });
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

                const amount = parseFloat(interaction.fields.getTextInputValue('eco_gv_amount'));
                if (!amount || isNaN(amount) || amount <= 0) {
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 200).', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { ASSET_LABELS, closeRow } = require('../../data/commands/economy/give');
                const { getPrice: gpGive } = require('../economy/market');
                checkEconUser(ownerId);
                checkEconUser(targetId);
                const sender = eData[ownerId];
                const recv   = eData[targetId];

                if (sender[asset] < amount) {
                    return interaction.reply({ content: `⚠️ ${asset.toUpperCase()} kugu filna ma lihid. Haysataa: **${sender[asset]}**`, flags: MessageFlags.Ephemeral });
                }

                // Daily BTC give limit: 5,000 BTC/day
                const GIVE_DAILY_LIMIT = 5_000;
                const btcAmount = asset === 'btc' ? amount : Math.round(amount * (gpGive(asset) || 0));
                const today = new Date().toISOString().slice(0, 10);
                sender.dailyGiven ??= { date: '', usd: 0 };
                if (sender.dailyGiven.date !== today) sender.dailyGiven = { date: today, usd: 0 };
                if (sender.dailyGiven.usd + btcAmount > GIVE_DAILY_LIMIT) {
                    const remaining = Math.max(0, GIVE_DAILY_LIMIT - sender.dailyGiven.usd);
                    return interaction.reply({ content: `⚠️ **Maalineed ₿: ${GIVE_DAILY_LIMIT.toLocaleString()} xad** — hadhay: **₿: ${remaining.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                sender.dailyGiven.usd += btcAmount;

                sender[asset] -= amount;
                recv[asset]   += amount;
                saveEcon();

                return interaction.update({ embeds: [
                    new EmbedBuilder()
                        .setTitle('💸 Lacag la Diray')
                        .setColor('#2ecc71')
                        .setDescription(
                            `✅ **${amount} ${asset.toUpperCase()}** u diray <@${targetId}>!\n` +
                            `${ASSET_LABELS[asset]}: **${sender[asset]}** (hadhay)`
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 500).', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { closeRow } = require('../../data/commands/economy/ebank');
                checkEconUser(ownerId);
                const d         = eData[ownerId];
                const bankLabel = bank.charAt(0).toUpperCase() + bank.slice(1);

                if (action === 'deposit') {
                    if ((d.btc || 0) < amount) {
                        return interaction.reply({ content: `⚠️ Not enough BTC. Wallet: **₿ ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                    }
                    d.btc         = (d.btc || 0) - amount;
                    d.banks[bank] += amount;
                    saveEcon();
                    return interaction.update({ embeds: [new EmbedBuilder()
                        .setTitle('🏦 Deposit — Success!')
                        .setColor('#27ae60')
                        .addFields(
                            { name: '💰 Deposited',     value: `**+₿ ${amount.toLocaleString()}**`,          inline: true },
                            { name: '🏦 Bank Balance',  value: `**₿ ${d.banks[bank].toLocaleString()}**`,    inline: true },
                            { name: '💳 Wallet',        value: `**₿ ${(d.btc||0).toLocaleString()}**`,      inline: true },
                        )
                        .setFooter({ text: 'Garaad Bank • 1% daily interest on deposits' }),
                    ], components: [closeRow(ownerId)] });
                } else {
                    const bankBal = d.banks?.[bank] || 0;
                    if (bankBal < amount) {
                        return interaction.reply({ content: `⚠️ Garaad Bank kugu filna ma lihid. Haysataa: **₿ ${bankBal.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                    }
                    d.banks        = d.banks || {};
                    d.banks[bank] -= amount;
                    d.btc          = (d.btc || 0) + amount;
                    saveEcon();
                    return interaction.update({ embeds: [new EmbedBuilder()
                        .setTitle('🏦 Withdrawal — Success!')
                        .setColor('#2980b9')
                        .addFields(
                            { name: '💰 Withdrawn',     value: `**-₿ ${amount.toLocaleString()}**`,          inline: true },
                            { name: '🏦 Bank Balance',  value: `**₿ ${d.banks[bank].toLocaleString()}**`,    inline: true },
                            { name: '💳 Wallet',        value: `**₿ ${(d.btc||0).toLocaleString()}**`,      inline: true },
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 500).', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon, addToTreasury } = require('../economy/econStore');
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
                    return interaction.reply({ content: `⚠️ **"${targetInput}"** — qof lama helin. Username ama ID saxan geli.`, flags: MessageFlags.Ephemeral });
                if (targetId === ownerId)
                    return interaction.reply({ content: '⚠️ Adiga nafta uma dirin kartid.', flags: MessageFlags.Ephemeral });

                checkEconUser(targetId);
                const sender = eData[ownerId];
                if ((sender.banks?.garaad || 0) < amount)
                    return interaction.reply({ content: `⚠️ Garaad Bank-kaagu ma filna. Haysataa: **₿${(sender.banks?.garaad || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });

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
                            return interaction.reply({ content: `⚠️ **"${bankInput}"** — bank lama helin. "garaad", personal bank ama public bank magaciisa qor.`, flags: MessageFlags.Ephemeral });
                        if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXP)
                            return interaction.reply({ content: `⚠️ **${pubBank.name}** waa la xiray.`, flags: MessageFlags.Ephemeral });
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
                        { name: '💰 La diray',   value: `**₿${amount.toLocaleString()}**`,                          inline: true },
                        { name: '🏛️ Canshuur 5%', value: `**-₿${tax.toLocaleString()}**`,                           inline: true },
                        { name: '✅ La helay',    value: `**₿${received.toLocaleString()}**`,                        inline: true },
                        { name: '🏦 Bangigaaga',  value: `**₿${(sender.banks?.garaad || 0).toLocaleString()}**`,    inline: true },
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

            // ── Cashflip: amount modal submit ──
            if (interaction.customId.startsWith('eco_cfmod_')) {
                const rest    = interaction.customId.replace('eco_cfmod_', '');
                const lastUnd = rest.lastIndexOf('_');
                const asset   = rest.substring(0, lastUnd);
                const ownerId = rest.substring(lastUnd + 1);

                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                }

                const amountStr = interaction.fields.getTextInputValue('eco_cf_amount');
                const amount    = parseFloat(amountStr);

                if (!amount || isNaN(amount) || amount <= 0) {
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 100).', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser, saveEcon, addToTreasury, trackEarning } = require('../economy/econStore');
                const { ASSET_LABELS, closeRow } = require('../../data/commands/economy/cashflip');
                const { getPrice } = require('../economy/market');
                checkEconUser(ownerId);
                const d = eData[ownerId];

                if (d[asset] < amount) {
                    return interaction.reply({ content: `⚠️ ${asset.toUpperCase()} kugu filna ma lihid. Haysataa: **${d[asset]}**`, flags: MessageFlags.Ephemeral });
                }

                // Show flipping animation immediately
                await interaction.update({ embeds: [
                    new EmbedBuilder()
                        .setTitle('🪙 Cashflip — La Raadinayaa...')
                        .setColor('#f39c12')
                        .setDescription(`🎰 **${amount} ${asset.toUpperCase()}** la ciyaarayaa...\n\n⏳ _Sugso xogtaada..._`)
                        .setFooter({ text: '50/50 chance • Garaad Economy' }),
                ], components: [] });

                // Wait 1.2 seconds then reveal result
                await new Promise(r => setTimeout(r, 1200));

                const { WIN_MULTI } = require('../../data/commands/economy/cashflip');
                const { fmt: cfFmt } = require('../utils/helpers');
                const win = Math.random() < 0.50;
                if (win) {
                    const profit = Math.floor(amount * WIN_MULTI);
                    d[asset] += profit;
                    const fee    = amount - profit;
                    const feeUsd = asset === 'usd' ? fee : Math.round(fee * (getPrice(asset) || 0));
                    addToTreasury(feeUsd);
                    trackEarning(ownerId, asset === 'usd' ? profit : Math.round(profit * (getPrice(asset) || 0)));
                } else {
                    d[asset] -= amount;
                    const usdLoss = asset === 'usd' ? amount : Math.round(amount * (getPrice(asset) || 0));
                    addToTreasury(usdLoss);
                }
                saveEcon();

                const profitAmt = `${cfFmt(Math.floor(amount * WIN_MULTI))} ${asset.toUpperCase()}`;
                const lossAmt   = `${cfFmt(amount)} ${asset.toUpperCase()}`;
                const balLabel  = `${cfFmt(d[asset])} ${asset.toUpperCase()}`;

                await interaction.editReply({ embeds: [
                    new EmbedBuilder()
                        .setTitle(win ? '✅ Ecoflip: Guul ✅' : '❌ Ecoflip: Guuldarro ❌')
                        .setColor(win ? '#2ecc71' : '#e74c3c')
                        .setDescription(
                            win
                                ? `Suuqa ayaa kuu shaqeeyay. 📈\n\n💸 **Faa'iido:** +${profitAmt}\n💰 **Balance Cusub:** ${balLabel}\n\n🔄 Isticmaal \`?trade\` si aad u tijaabiso mar kale.\n\n✨ **Garaad Economy**`
                                : `Suuqa kuma taageerin. 📉\n\n💸 **Qasaaro:** -${lossAmt}\n💰 **Balance Cusub:** ${balLabel}\n\n🔄 Isticmaal \`?trade\` si aad u tijaabiso fursad kale.\n\n✨ **Garaad Economy**`
                        ),
                ], components: [closeRow(ownerId)] });
            }

            // ── Trade: amount modal submit ──
            if (interaction.customId.startsWith('eco_tmod_')) {
                const rest    = interaction.customId.replace('eco_tmod_', '');
                const lastUnd = rest.lastIndexOf('_');
                const asset   = rest.substring(0, lastUnd);
                const ownerId = rest.substring(lastUnd + 1);

                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                }

                const amountStr = interaction.fields.getTextInputValue('eco_trade_amount');
                const amount    = parseFloat(amountStr);

                if (!amount || isNaN(amount) || amount <= 0) {
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 2).', flags: MessageFlags.Ephemeral });
                }

                const { econData: eData, checkEconUser } = require('../economy/econStore');
                const { getPrice }                        = require('../economy/market');
                const { buildConfirmEmbed, confirmRow }   = require('../../data/commands/economy/trade');
                checkEconUser(ownerId);
                const d     = eData[ownerId];
                const price = getPrice(asset);

                return interaction.reply({
                    embeds:     [buildConfirmEmbed(asset, amount, price, d)],
                    components: [confirmRow(asset, amount, price, ownerId)],
                });
            }

            // ── Admin: Add/Remove Admin modal submit (owner only) ──
            if (interaction.customId.startsWith('admin_m_addadmin_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const action   = (interaction.fields.getTextInputValue('action') || '').trim().toLowerCase();
                const { addAdmin, removeAdmin, listAdmins } = require('../utils/admin');
                if (action === 'add') {
                    const added = addAdmin(targetId);
                    await notifyAdmins(interaction.client, interaction.user, `Add Admin: <@${targetId}>`);
                    return interaction.reply({
                        content: added
                            ? `✅ <@${targetId}> admin-yada lagu daray. Admins: **${listAdmins().length}**`
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
                if (!text) return interaction.reply({ content: '⚠️ Fariin maxaad qortay?', flags: MessageFlags.Ephemeral });
                const { userData: uData } = require('../store');
                const userIds = Object.keys(uData);
                await interaction.reply({ content: `📢 Fariin loo dirayaa **${userIds.length}** user...`, flags: MessageFlags.Ephemeral });
                const broadEmbed = new EmbedBuilder()
                    .setTitle('📢 Garaad Bot — Fariin Rasmi ah')
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

            // ── Admin: Give IQ or BTC (combined modal) ──
            if (interaction.customId.startsWith('admin_m_give_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId  = interaction.fields.getTextInputValue('target_id').trim();
                const raw       = interaction.fields.getTextInputValue('give_input').trim().toLowerCase();
                const parts     = raw.split(/\s+/);
                const type      = parts[0];
                const amount    = parseFloat(parts[1]);
                if ((type !== 'iq' && type !== 'btc') || isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Qaabka: `iq 200`  ama  `btc 500`', flags: MessageFlags.Ephemeral });

                if (type === 'iq') {
                    const { userData: uData, saveData } = require('../store');
                    const { checkUser } = require('../utils/helpers');
                    checkUser(targetId);
                    uData[targetId].iq = Math.max(0, (uData[targetId].iq || 0) + amount);
                    saveData();
                    await notifyAdmins(interaction.client, interaction.user, `Give IQ: **+${amount} IQ** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> **+${amount} IQ**. Hadda: **${uData[targetId].iq} IQ**`, flags: MessageFlags.Ephemeral });
                } else {
                    const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                    checkEconUser(targetId);
                    eData[targetId].btc = (eData[targetId].btc || 0) + amount;
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Give BTC: **+₿: ${amount.toLocaleString()}** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> **+₿: ${amount.toLocaleString()}**. Hadda: **₿: ${eData[targetId].btc.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
            }

            // ── Admin: Transfer → bank modal submit ──
            if (interaction.customId.startsWith('admin_m_transfer_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount').replace(/,/g, ''));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 5000).', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                checkEconUser(targetId);
                eData[targetId].banks        ??= { garaad: 0 };
                eData[targetId].banks.garaad ??= 0;
                eData[targetId].banks.garaad  += amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Transfer → Bank: **+₿ ${fmt(amount)}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ <@${targetId}> bangiga **+₿ ${fmt(amount)}** lagu daray.\n🏦 Hadda: **₿ ${fmt(eData[targetId].banks.garaad)}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin: Give All IQ modal submit ──
            if (interaction.customId.startsWith('admin_m_giveall_iq_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const amount = parseInt(interaction.fields.getTextInputValue('amount'), 10);
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 100).', flags: MessageFlags.Ephemeral });
                const { userData: uData, saveData: sd } = require('../store');
                const { checkUser: cu } = require('../utils/helpers');
                const users = Object.keys(uData);
                for (const uid of users) {
                    cu(uid);
                    uData[uid].iq = (uData[uid].iq || 0) + amount;
                }
                sd();
                await notifyAdmins(interaction.client, interaction.user, `Give All IQ: **+${amount} IQ** × ${users.length} players`);
                return interaction.reply({ content: `✅ **${users.length}** players qof walba wuxuu helay **+${amount} IQ**`, flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId.startsWith('admin_m_giveall_btc_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const amount = parseFloat(interaction.fields.getTextInputValue('amount').replace(/,/g, ''));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 5000).', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const users = Object.keys(eData).filter(k => /^\d{17,19}$/.test(k));
                for (const uid of users) {
                    checkEconUser(uid);
                    eData[uid].btc = (eData[uid].btc || 0) + amount;
                }
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give All BTC: **+₿ ${amount.toLocaleString()}** × ${users.length} players`);
                return interaction.reply({ content: `✅ **${users.length}** players qof walba wuxuu helay **₿ ${amount.toLocaleString()}**. Wadarta: **₿ ${ (amount * users.length).toLocaleString() }**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Aqoon modal: Give IQ ──
            if (interaction.customId.startsWith('admin_aq_m_giveiq_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { userData: uData, saveData } = require('../store');
                const { checkUser } = require('../utils/helpers');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseInt(interaction.fields.getTextInputValue('amount'), 10);
                if (isNaN(amount) || amount === 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                checkUser(targetId);
                uData[targetId].iq = Math.max(0, (uData[targetId].iq || 0) + amount);
                saveData();
                await notifyAdmins(interaction.client, interaction.user, `Give IQ: **${amount > 0 ? '+' : ''}${amount} IQ** → <@${targetId}>`);
                return interaction.reply({ content: `✅ <@${targetId}> wuxuu helay **${amount > 0 ? '+' : ''}${amount} IQ**. Hadda: **${uData[targetId].iq} IQ**`, flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: `✅ **${users.length} qof** aqoon dib loo dejiyay — IQ, darajo, stats eber.`, flags: MessageFlags.Ephemeral });
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
                    return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
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
                        d.btc = 1000;
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
                return interaction.reply({ content: `✅ **${resetType}** dib loo dejiyay — ${scope}.`, flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: `✅ DM la diray <@${targetId}>.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give USD ──
            if (interaction.customId.startsWith('admin_eco_m_giveusd_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].btc = (eData[targetId].btc || 0) + amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give BTC: **+₿: ${amount.toLocaleString()}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ **₿: ${amount.toLocaleString()}** waxaad u diray <@${targetId}>. Hadda: **₿: ${eData[targetId].btc.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Asset ──
            if (interaction.customId.startsWith('admin_eco_m_giveasset_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const asset    = interaction.fields.getTextInputValue('asset').trim().toLowerCase();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (asset !== 'btc') return interaction.reply({ content: '⚠️ Asset: `btc` kaliya', flags: MessageFlags.Ephemeral });
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].btc = (eData[targetId].btc || 0) + amount;
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Give Asset (BTC): **+₿: ${amount.toLocaleString()}** → <@${targetId}>`);
                return interaction.reply({ content: `✅ **₿: ${amount.toLocaleString()}** waxaad u diray <@${targetId}>. Hadda: **₿: ${eData[targetId].btc.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Give Bank ──
            if (interaction.customId.startsWith('admin_eco_m_givebank_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const targetId = interaction.fields.getTextInputValue('target_id').trim();
                const bank     = interaction.fields.getTextInputValue('bank').trim().toLowerCase();
                const amount   = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (bank !== 'garaad') return interaction.reply({ content: '⚠️ Bank: `garaad` kaliya', flags: MessageFlags.Ephemeral });
                if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                checkEconUser(targetId);
                eData[targetId].banks[bank] = (eData[targetId].banks[bank] || 0) + amount;
                saveEcon();
                const bankLabel = bank.charAt(0).toUpperCase() + bank.slice(1);
                await notifyAdmins(interaction.client, interaction.user, `Give Bank: **+₿: ${amount.toLocaleString()}** → <@${targetId}> (${bankLabel} Bank)`);
                return interaction.reply({ content: `✅ **₿: ${amount.toLocaleString()}** waxaad u dejisay <@${targetId}> — 🏦 ${bankLabel} Bank. Hadda: **₿: ${eData[targetId].banks[bank].toLocaleString()}**`, flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: `✅ <@${targetId}> waxaa la siiyay: **${info.label}** _(hadda firfircoon)_`, flags: MessageFlags.Ephemeral });
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
                    d.btc = 1000;
                    msg = `💼 Wallet reset to **1,000 BTC**`;
                } else if (resetWhat === 'bank') {
                    d.banks = { garaad: 0 };
                    d.loan = null;
                    msg = `🏦 Bank reset to **0 BTC** (loan cleared)`;
                } else {
                    d.btc = 1000;
                    d.banks = { garaad: 0 };
                    d.inventory = { safety: 0, robticket: 0 };
                    d.loan = null; d.lastLoanTaken = 0;
                    d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                    msg = `♻️ Full economy reset — wallet **1,000 BTC**, bank **0**, loan cleared`;
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
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood ma lihid.', flags: MessageFlags.Ephemeral });
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
                        return interaction.reply({ content: '⚠️ Xaddadka aad yar — dadku aad baa u badan.', flags: MessageFlags.Ephemeral });
                    if (!deductFromTreasury(amount))
                        return interaction.reply({ content: `⚠️ Khaznadda ma filna. Hadda: **₿: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                    for (const uid of users) { checkEconUser(uid); eData[uid].btc = (eData[uid].btc || 0) + perUser; }
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Distribute Treasury: **₿: ${perUser.toLocaleString()}** × ${users.length} players`);
                    return interaction.reply({ content: `✅ **₿: ${perUser.toLocaleString()}** × **${users.length}** players.\n🏛️ Treasury remaining: **₿: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                }

                if (action === 'give' || action === 'sii') {
                    const targetId = interaction.fields.getTextInputValue('amount').trim().split(/\s+/)[0];
                    const amount   = parseFloat(interaction.fields.getTextInputValue('amount').trim().split(/\s+/)[1]);
                    if (!targetId || isNaN(amount) || amount <= 0)
                        return interaction.reply({ content: '⚠️ `give @userID xad` qaab isticmaal.', flags: MessageFlags.Ephemeral });
                    if (!deductFromTreasury(amount))
                        return interaction.reply({ content: `⚠️ Khaznadda ma filna. Hadda: **₿: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                    checkEconUser(targetId);
                    eData[targetId].btc = (eData[targetId].btc || 0) + amount;
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Treasury Give: **₿: ${amount.toLocaleString()}** → <@${targetId}>`);
                    return interaction.reply({ content: `✅ Khaznadda **₿: ${amount.toLocaleString()}** waxaa laga siiyay <@${targetId}>.\n🏛️ Khaznad hadhay: **₿: ${fmt((t.balance || 0))}**`, flags: MessageFlags.Ephemeral });
                }

                // view
                return interaction.reply({
                    content: `🏛️ **Khaznadda:**\n💰 Hadda: **₿: ${fmt((t.balance || 0))}**\n📥 Wadarta soo gashay: **₿: ${fmt((t.totalIn || 0))}**\n📤 La qaybiyay: **₿: ${fmt(((t.totalIn || 0) - (t.balance || 0)))}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Admin Econ modal: Top-up Treasury ──
            if (interaction.customId.startsWith('admin_eco_m_topup_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood ma lihid.', flags: MessageFlags.Ephemeral });
                const amount = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { topUpTreasury, getTreasury, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                topUpTreasury(amount);
                saveEcon();
                const t = getTreasury();
                await notifyAdmins(interaction.client, interaction.user, `Top-up Treasury: **+₿: ${amount.toLocaleString()}** — balance now **₿: ${t.balance.toLocaleString()}**`);
                return interaction.reply({ content: `✅ **₿: ${amount.toLocaleString()}** khaznadda lagu daray.\n🏛️ Hadda: **₿: ${t.balance.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Tax ──
            if (interaction.customId.startsWith('admin_eco_m_tax_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood ma lihid.', flags: MessageFlags.Ephemeral });
                const amount = parseFloat(interaction.fields.getTextInputValue('amount'));
                if (isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon, addToTreasury } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const users = Object.entries(eData).filter(([k]) => /^[0-9]{17,19}$/.test(k));
                let collected = 0;
                for (const [uid] of users) {
                    checkEconUser(uid);
                    const d = eData[uid];
                    const deduct = Math.min(amount, d.btc || 0);
                    d.btc = (d.btc || 0) - deduct;
                    collected += deduct;
                }
                if (collected > 0) addToTreasury(collected);
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Tax: **₿: ${fmt(amount)}** × ${users.length} players → Treasury **+₿: ${fmt(collected)}**`);
                return interaction.reply({
                    content: `💸 **Tax Collected**\n**₿: ${fmt(amount)}** ka baxday qof walba (${users.length} players)\n🏛️ Treasury helay: **₿: ${fmt(collected)}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Admin Econ modal: Reset All ──
            if (interaction.customId.startsWith('admin_eco_m_resetall_')) {
                if (!require('../utils/admin').isAdmin(interaction.user.id))
                    return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
                const password = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood ma lihid.', flags: MessageFlags.Ephemeral });
                const confirm = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();
                if (confirm !== 'RESET')
                    return interaction.reply({ content: '⚠️ "RESET" ayaad qori lahayd. La joojiyay.', flags: MessageFlags.Ephemeral });
                const { econData: eData, saveEcon } = require('../economy/econStore');
                const { fmt } = require('../utils/helpers');
                const users = Object.keys(eData).filter(k => /^[0-9]{17,19}$/.test(k));
                for (const uid of users) {
                    const d = eData[uid];
                    d.banks = { mandeeq: 0, garaad: 0 };
                    d.inventory = { safety: 0, robticket: 0 };
                    d.loan = null; d.lastLoanTaken = 0; d.lastWork = 0; d.lastDaily = 0; d.lastInterest = 0;
                    d.todayEarned = { date: '', usd: 0 }; d.dailyGiven = { date: '', usd: 0 };
                    d.robsToday = { date: '', count: 0 };
                    d.serviceChargesPaid = { mandeeq: 0, garaad: 0 };
                    d.interestEarned = { mandeeq: 0, garaad: 0 };
                    d.econTitles = []; d.activeEconTitle = null; d.customEconTitle = null;
                }
                saveEcon();
                await notifyAdmins(interaction.client, interaction.user, `Reset All Economy — ${users.length} players`);
                return interaction.reply({ content: `✅ **${users.length} qof** economy dib loo dejiyay.\n₿ Qof walba: **₿: ${(5000).toLocaleString()}** | Deyn, bank, assets — eber.`, flags: MessageFlags.Ephemeral });
            }

            // ── Admin Econ modal: Reset Any (single user or all) ──
            if (interaction.customId.startsWith('admin_eco_m_resetany_')) {
                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
                const password  = interaction.fields.getTextInputValue('password').trim();
                if (password !== OWNER_PASS)
                    return interaction.reply({ content: '⛔ Password qalad ah. Awood ma lihid.', flags: MessageFlags.Ephemeral });
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
                        d.btc = 1000;
                    } else if (what === 'bank') {
                        d.banks = { garaad: 0 };
                        d.loan = null; d.lastLoanTaken = 0;
                    } else {
                        d.btc = 1000;
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
                    return interaction.reply({ content: `✅ **${users.length} qof** dhammaan economy dib loo dejiyay (**${resetWhat}**).`, flags: MessageFlags.Ephemeral });
                } else {
                    checkEconUser(targetId);
                    applyReset(eData[targetId], resetWhat);
                    saveEcon();
                    await notifyAdmins(interaction.client, interaction.user, `Reset Economy (${resetWhat}): <@${targetId}>`);
                    return interaction.reply({ content: `✅ <@${targetId}> economy dib loo dejiyay (**${resetWhat}**).`, flags: MessageFlags.Ephemeral });
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
                if (!amount || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                const { buildPubBankPanel } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
                if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
                const myRec = bank.customers?.[userId];
                if (!myRec || (myRec.balance || 0) <= 0) return interaction.reply({ content: `⚠️ **${bank.name}** lacag kuma dhigin.`, flags: MessageFlags.Ephemeral });
                if (amount > myRec.balance) return interaction.reply({ content: `⚠️ Haysataa: ₿${myRec.balance.toLocaleString()} kaliya.`, flags: MessageFlags.Ephemeral });
                const wdFee      = Math.floor(amount * 0.01);
                const wdReceived = amount - wdFee;
                if (wdFee > 0) {
                    bank.ownerProfit = (bank.ownerProfit || 0) + wdFee;
                }
                myRec.balance      -= amount;
                bank.balance        = Math.max(0, (bank.balance || 0) - amount);
                ec.btc              = (ec.btc || 0) + wdReceived;
                saveBanks(); saveEcon();
                const { embed, components } = buildPubBankPanel(bank, userId);
                return interaction.update({ embeds: [embed], components,
                    content: `📤 **₿${wdReceived.toLocaleString()}** ← 🏛️ **${bank.name}** (1% fee: ₿${wdFee.toLocaleString()})` });
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
                if (!amount || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                const { buildPersBankPanel } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec    = eData[userId];
                const bank  = eData[ownerId]?.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
                const myRec = bank.customers?.[userId];
                if (!myRec || (myRec.balance || 0) <= 0) return interaction.reply({ content: `⚠️ **${bank.owner}**'s bank lacag kuma dhigin.`, flags: MessageFlags.Ephemeral });
                if (amount > myRec.balance) return interaction.reply({ content: `⚠️ Haysataa: ₿${myRec.balance.toLocaleString()} kaliya.`, flags: MessageFlags.Ephemeral });
                myRec.balance -= amount;
                ec.btc         = (ec.btc || 0) + amount;
                addTx(bank, 'customer_withdraw', amount, `→ ${interaction.user.username}`);
                saveEcon();
                const { embed, components } = buildPersBankPanel(bank, ownerId, userId);
                return interaction.update({ embeds: [embed], components,
                    content: `📤 **₿${amount.toLocaleString()}** ← 🏦 **${bank.owner}**'s Bank` });
            }

            // ── Deposit: Garaad Bank modal ──
            if (interaction.customId.startsWith('dep_garaad_modal_')) {
                const userId = interaction.customId.replace('dep_garaad_modal_', '');
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('dep_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                checkEconUser(userId);
                const d = eData[userId];
                if ((d.btc || 0) < amount)
                    return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(d.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                d.btc           = (d.btc || 0) - amount;
                d.banks         = d.banks || { garaad: 0 };
                d.banks.garaad  = (d.banks.garaad || 0) + amount;
                saveEcon();
                return interaction.reply({ content: `📥 **₿${amount.toLocaleString()}** → 🏦 **Garaad Bank**\n💰 Bank: **₿${d.banks.garaad.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
            }

            // ── Withdraw: Garaad Bank modal ──
            if (interaction.customId.startsWith('wd_garaad_modal_')) {
                const userId = interaction.customId.replace('wd_garaad_modal_', '');
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '⚠️ Adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('wd_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                checkEconUser(userId);
                const d = eData[userId];
                const garaadBal = d.banks?.garaad || 0;
                if (garaadBal < amount)
                    return interaction.reply({ content: `⚠️ Garaad Bank kugu filna ma lihid. Haysataa: ₿${garaadBal.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                d.banks.garaad -= amount;
                d.btc = (d.btc || 0) + amount;
                saveEcon();
                return interaction.reply({ content: `📤 **₿${amount.toLocaleString()}** ← 🏦 **Garaad Bank**\n💰 Bank hadhay: **₿${d.banks.garaad.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec      = eData[userId];
                const pubBank = getAllPublicBanks()[bankId.toUpperCase()] || getAllPublicBanks()[bankId];
                if (!pubBank) return interaction.reply({ content: `⚠️ Bank \`${bankId}\` lama helin.`, flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < amount) return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(ec.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                const isOwnerDep = pubBank.ownerId === userId;
                ec.btc = (ec.btc || 0) - amount;
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
                        depFeeNote = `\n💸 Faa'iido owner: ₿${depFee.toLocaleString()} (claim: ?bankfund)`;
                    }
                    pubBank.customers = pubBank.customers || {};
                    pubBank.customers[userId] ??= { balance: 0, username: interaction.user.username, joinedAt: Date.now() };
                    pubBank.customers[userId].balance += amount;
                }
                saveBanks(); saveEcon();
                return interaction.reply({ content: `📥 **₿${amount.toLocaleString()}** → 🏛️ **${pubBank.name}**\n💼 Haysataa: ₿${(pubBank.customers?.[userId]?.balance || 0).toLocaleString()}${depFeeNote}`, flags: MessageFlags.Ephemeral });
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { buildOwnerPanel } = require('../../data/commands/economy/publicBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = Object.values(getAllPublicBanks()).find(b => b.id === bankId || b.id === bankId.toUpperCase());
                if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
                if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner kaliya.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < amount)
                    return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(ec.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc            -= amount;
                bank.balance      += amount;
                bank.ownerFund     = (bank.ownerFund || 0) + amount;
                bank.lastActivity  = Date.now();
                saveBanks(); saveEcon();
                const { embed, components } = buildOwnerPanel(bank, userId);
                return interaction.update({
                    content: `✅ **₿${amount.toLocaleString()}** bangiga capital u daray!`,
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec = eData[userId];
                const tBank = eData[ownerId]?.personalBank;
                if (!tBank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
                if (ownerId === userId) return interaction.reply({ content: '⚠️ Bank-kaaga laftiis: `?bv` fur.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < amount) return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(ec.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
                const nowTs = Date.now();
                tBank.lastProfitAt ??= nowTs;
                const profDays = Math.floor((nowTs - tBank.lastProfitAt) / 86400000);
                if (profDays > 0) {
                    const ct = Object.values(tBank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
                    const profit = Math.floor(ct * 0.02 * profDays);
                    if (profit > 0) { tBank.balance += profit; tBank.profitEarned = (tBank.profitEarned || 0) + profit; addTx(tBank, 'profit', profit, `Faa'iido (${profDays}d)`); }
                    tBank.lastProfitAt = nowTs;
                }
                ec.btc = (ec.btc || 0) - amount;
                tBank.customers = tBank.customers || {};
                tBank.customers[userId] ??= { username: interaction.user.username, balance: 0, depositedAt: Date.now() };
                tBank.customers[userId].balance += amount;
                addTx(tBank, 'customer_deposit', amount, `← ${interaction.user.username}`);
                saveEcon();
                return interaction.reply({ content: `📥 **₿${amount.toLocaleString()}** → 🏦 **${tBank.owner}**'s Bank\n💼 Haysataa: ₿${tBank.customers[userId].balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });
            }

            // ── ?bank Deposit modal ──
            if (interaction.customId.startsWith('bank_all_dep_modal_')) {
                const userId   = interaction.customId.replace('bank_all_dep_modal_', '');
                const bankRef  = interaction.fields.getTextInputValue('ball_bank').trim();
                const amount   = Math.floor(Number(interaction.fields.getTextInputValue('ball_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
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
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                const { withdrawAnyCmd } = require('../../data/commands/economy/personalBank');
                const fakeMsg = { author: interaction.user, reply: (c) => interaction.reply({ ...(typeof c === 'string' ? { content: c } : c), flags: MessageFlags.Ephemeral }) };
                return withdrawAnyCmd(fakeMsg, [bankRef, String(amount)]);
            }

            // ── Personal Bank View: own deposit modal ──
            if (interaction.customId.startsWith('pbank_own_dep_modal_')) {
                const userId = interaction.user.id;
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_own_amount')));
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                const { bankViewRow } = require('../../data/commands/economy/personalBank');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = ec.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account ma lihid. `?bc` isticmaal.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < amount)
                    return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(ec.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });

                ec.btc          = (ec.btc || 0) - amount;
                bank.balance   += amount;
                bank.deposits   = (bank.deposits || 0) + amount;
                addTx(bank, 'deposit', amount, 'jeeb → bangi');
                saveEcon();
                return interaction.reply({
                    content: `📥 **₿${amount.toLocaleString()}** jeebka → bangiga\n💰 **Bangi hadda:** ₿${bank.balance.toLocaleString()}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Personal Bank View: own withdraw modal ──
            if (interaction.customId.startsWith('pbank_own_wd_modal_')) {
                const userId = interaction.user.id;
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_wd_amount')));
                const pw     = (interaction.fields.getTextInputValue('pbank_wd_pw') || '').trim();
                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec   = eData[userId];
                const bank = ec.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account ma lihid.', flags: MessageFlags.Ephemeral });

                if (ec.accountPassword && ec.accountPassword !== pw)
                    return interaction.reply({ content: '❌ Password-ka waa khalad.', flags: MessageFlags.Ephemeral });
                if (amount > bank.balance)
                    return interaction.reply({ content: `⚠️ Bangiga lacag ku filan kuma jirto. Haraagga: ₿${bank.balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });

                bank.balance     -= amount;
                bank.withdrawals  = (bank.withdrawals || 0) + amount;
                ec.btc            = (ec.btc || 0) + amount;
                addTx(bank, 'withdraw', amount, 'bangi → jeeb');
                saveEcon();
                return interaction.reply({
                    content: `📤 **₿${amount.toLocaleString()}** bangiga → jeebka\n💳 **Jeebka hadda:** ₿${ec.btc.toLocaleString()}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Bank deposit modal (personal + public) ──
            if (interaction.customId.startsWith('pbank_dep_modal_')) {
                const userId = interaction.user.id;
                const input  = interaction.fields.getTextInputValue('pbank_bank_name').trim();
                const amount = Math.floor(Number(interaction.fields.getTextInputValue('pbank_amount')));

                if (!amount || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 1000).', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { addTx, getAllPublicBanks, saveBanks } = require('../economy/bankStore');
                checkEconUser(userId);
                const ec = eData[userId];

                if ((ec.btc || 0) < amount)
                    return interaction.reply({ content: `⚠️ Jeebkaagu ma filna. Haysataa: ₿${Math.floor(ec.btc || 0).toLocaleString()}`, flags: MessageFlags.Ephemeral });

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
                                addTx(targetBank, 'profit', profit, `Faa'iido macaamiisha (${profDays} maalin)`);
                            }
                        }
                        targetBank.lastProfitAt = nowTs;
                    }
                    ec.btc = (ec.btc || 0) - amount;
                    targetBank.customers = targetBank.customers || {};
                    if (!targetBank.customers[userId])
                        targetBank.customers[userId] = { username: interaction.user.username, balance: 0, depositedAt: Date.now() };
                    targetBank.customers[userId].balance += amount;
                    addTx(targetBank, 'customer_deposit', amount, `← ${interaction.user.username}`);
                    saveEcon();
                    return interaction.reply({
                        content:
                            `📥 **₿${amount.toLocaleString()}** → 🏦 **${targetBank.owner}**'s Bank\n` +
                            `💼 Bangigaas adigu haysataa: **₿${targetBank.customers[userId].balance.toLocaleString()}**`,
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
                    return interaction.reply({ content: `⚠️ **"${input}"** — bank lama helin. Magaca ama ID-ga si sax ah u qor.`, flags: MessageFlags.Ephemeral });

                if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXPIRY)
                    return interaction.reply({ content: `⚠️ **${pubBank.name}** waa la xiray (2 toddobaad shaqo la'aan).`, flags: MessageFlags.Ephemeral });

                ec.btc = (ec.btc || 0) - amount;
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
                        `📥 **₿${amount.toLocaleString()}** → 🏛️ **${pubBank.name}**\n` +
                        `💰 Bangiga haraagga: ₿${pubBank.balance.toLocaleString()}\n` +
                        `💼 Adiga haysataa: ₿${pubBank.customers[userId].balance.toLocaleString()}`,
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
                    return interaction.reply({ content: '⚠️ Magaca aad gaaban yahay — ugu yaraan 2 xaraf.', flags: MessageFlags.Ephemeral });
                if ((d.btc || 0) < item.price)
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid. Qiimaha: **₿: ${item.price.toLocaleString()}** | Haysataa: **₿: ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });

                d.btc = (d.btc || 0) - item.price;
                d.customEconTitle ??= null;
                d.customEconTitle  = name;
                if (!d.econTitles.includes('custom')) d.econTitles.push('custom');
                d.activeEconTitle = 'custom';
                addToTreasury(item.price);
                saveEcon();
                return interaction.reply({ content: `✅ Custom title la sameeay: **${name}** ✍️\nTitle-kaagu hadda wuu firfircoon yahay! **₿: ${item.price.toLocaleString()}** la bixiyay.`, flags: MessageFlags.Ephemeral });
            }

            // ── Prediction: USD amount modal ──
            if (interaction.customId.startsWith('pred_amt_usd_')) {
                const ownerId = interaction.customId.replace('pred_amt_usd_', '');
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const { setPending }                     = require('../economy/prediction');
                const { buildPickEmbed, pickRow }         = require('../../data/commands/economy/trade');
                const { econData: eData, checkEconUser } = require('../economy/econStore');

                const raw    = interaction.fields.getTextInputValue('pred_amount');
                const amount = parseFloat(raw);
                if (!amount || isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 500).', flags: MessageFlags.Ephemeral });

                checkEconUser(ownerId);
                if ((eData[ownerId].btc || 0) < amount)
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid. Haysataa: **₿ ${(eData[ownerId].btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });

                setPending(ownerId, { asset: 'btc', stakeType: 'btc', stakeAmount: amount, stakeUsd: amount });
                return interaction.update({
                    embeds:     [buildPickEmbed(amount)],
                    components: [pickRow(ownerId)],
                });
            }

            // ── Prediction: Asset amount modal ──
            if (interaction.customId.startsWith('pred_amt_ast_')) {
                const ownerId = interaction.customId.replace('pred_amt_ast_', '');
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const { setPending, getPending } = require('../economy/prediction');
                const {
                    buildTimeEmbed, timeRow, backRow,
                } = require('../../data/commands/economy/trade');
                const { getPrice }                     = require('../economy/market');
                const { econData: eData, checkEconUser } = require('../economy/econStore');

                const raw    = interaction.fields.getTextInputValue('pred_amount');
                const amount = parseFloat(raw);
                if (!amount || isNaN(amount) || amount <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli (tusaale: 1).', flags: MessageFlags.Ephemeral });

                const pend = getPending(ownerId);
                if (!pend || !pend.asset)
                    return interaction.reply({ content: '⚠️ Xog la waayay — bilow marlabaad.', flags: MessageFlags.Ephemeral });

                const { asset } = pend;
                checkEconUser(ownerId);
                if ((eData[ownerId][asset] || 0) < amount)
                    return interaction.reply({ content: `⚠️ ${asset.toUpperCase()} kugu filna ma lihid. Haysataa: **${eData[ownerId][asset] || 0}**`, flags: MessageFlags.Ephemeral });

                const stakeUsd = Math.round(amount * (getPrice(asset) || 0));
                setPending(ownerId, { stakeType: 'asset', stakeAmount: amount, stakeUsd });
                return interaction.update({
                    embeds:     [buildTimeEmbed(asset, 'asset', amount, stakeUsd)],
                    components: [timeRow(ownerId), backRow(ownerId)],
                });
            }

            // ── Trade: sell asset modal submit ──
            if (interaction.customId.startsWith('trade_sellmod_')) {
                const rest    = interaction.customId.replace('trade_sellmod_', '');
                const lastUnd = rest.lastIndexOf('_');
                const asset   = rest.substring(0, lastUnd);
                const ownerId = rest.substring(lastUnd + 1);
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon, trackEarning } = require('../economy/econStore');
                const { getPrice: gpSell } = require('../economy/market');
                const { ASSET_LABEL: AL } = require('../economy/prediction');
                const { fmt: sfmt }        = require('../utils/helpers');
                checkEconUser(ownerId);
                const d = eData[ownerId];

                const sellAmt = parseFloat(interaction.fields.getTextInputValue('sell_amount'));
                if (!sellAmt || isNaN(sellAmt) || sellAmt <= 0)
                    return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
                if ((d[asset] || 0) < sellAmt)
                    return interaction.reply({ content: `⚠️ ${asset.toUpperCase()} kugu filna ma lihid. Haysataa: **${d[asset] || 0}**`, flags: MessageFlags.Ephemeral });

                const price   = gpSell(asset);
                const btcGain = Math.floor(sellAmt * price);
                d[asset] -= sellAmt;
                d.btc     = (d.btc || 0) + btcGain;
                saveEcon();

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`✅ Iibso — ${AL[asset]}`)
                            .setColor('#e67e22')
                            .setDescription(
                                `**${sellAmt} ${AL[asset]}** la iibiyay\n` +
                                `₿ Lacag heshay: **+₿: ${sfmt(btcGain)}** (@ ₿: ${sfmt(price)})\n` +
                                `₿ BTC-kaaga hadda: **₿: ${sfmt(d.btc)}**\n` +
                                `${AL[asset]} hadhay: **${d[asset]}**`
                            )
                            .setFooter({ text: 'Garaad Economy' }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ── Trade Shop: buy modal submit ──
            if (interaction.customId.startsWith('trade_buymod_')) {
                const rest    = interaction.customId.replace('trade_buymod_', '');
                const lastUnd = rest.lastIndexOf('_');
                const asset   = rest.substring(0, lastUnd);
                const ownerId = rest.substring(lastUnd + 1);
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

                const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
                const { getPrice }                                  = require('../economy/market');
                const { ASSET_LABEL }                               = require('../economy/prediction');
                const { buildShopEmbed, shopRow, shopBackRow }      = require('../../data/commands/economy/trade');
                checkEconUser(ownerId);
                const d = eData[ownerId];

                const units = parseInt(interaction.fields.getTextInputValue('buy_amount'));
                if (!units || isNaN(units) || units < 1)
                    return interaction.reply({ content: '⚠️ Tirada sax ah geli (tusaale: 1).', flags: MessageFlags.Ephemeral });

                const price = getPrice(asset);
                if (!price || price <= 0)
                    return interaction.reply({ content: '⚠️ Qiimaha ma heli karo.', flags: MessageFlags.Ephemeral });

                const actualCost = units * price;
                if ((d.btc || 0) < actualCost)
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid.\n💸 Kharash: **₿: ${actualCost.toLocaleString()}** | Haysataa: **₿: ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                d.btc    = (d.btc || 0) - actualCost;
                d[asset]  = (d[asset] || 0) + units;
                saveEcon();

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`✅ Iibsi Guul — ${ASSET_LABEL[asset]}`)
                            .setColor('#27ae60')
                            .setDescription(
                                `**${units} ${ASSET_LABEL[asset]}** la iibsaday\n` +
                                `💸 Kharash: **₿: ${actualCost.toLocaleString()}**\n` +
                                `₿ BTC-kaaga hadda: **₿: ${(d.btc || 0).toLocaleString()}**\n` +
                                `${ASSET_LABEL[asset]} haysataa: **${d[asset]}**`
                            )
                            .setFooter({ text: 'Garaad Economy' }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
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

        // ── Hagbad: Pay button ──
        if (id.startsWith('hag_pay_')) {
            const rest      = id.replace('hag_pay_', '');
            const firstUnd  = rest.indexOf('_');
            const userId    = rest.substring(0, firstUnd);
            const groupName = rest.substring(firstUnd + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { hagbadData, saveHagbad } = require('../economy/hagbadStore');
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { _doPay } = require('../../data/commands/economy/hagbad');
            const group = hagbadData[groupName];
            if (!group) return interaction.reply({ content: `⚠️ Koox **${groupName}** lama helin.`, flags: MessageFlags.Ephemeral });
            return _doPay(interaction, userId, groupName, group);
        }

        // ── Hagbad: Leave button ──
        if (id.startsWith('hag_leave_')) {
            const rest      = id.replace('hag_leave_', '');
            const firstUnd  = rest.indexOf('_');
            const userId    = rest.substring(0, firstUnd);
            const groupName = rest.substring(firstUnd + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { hagbadData, saveHagbad } = require('../economy/hagbadStore');
            const { buildGroupPanel } = require('../../data/commands/economy/hagbad');
            const group = hagbadData[groupName];
            if (!group) return interaction.reply({ content: `⚠️ Koox lama helin.`, flags: MessageFlags.Ephemeral });
            if (!group.members.includes(userId)) return interaction.reply({ content: `⚠️ Kooxdan kuma jirtid.`, flags: MessageFlags.Ephemeral });
            if (group.creator === userId && group.members.length > 1)
                return interaction.reply({ content: '⚠️ Abuure ma baxo hadii xubnaha kale jiraan.', flags: MessageFlags.Ephemeral });
            group.members      = group.members.filter(mid => mid !== userId);
            group.payoutQueue  = group.payoutQueue.filter(mid => mid !== userId);
            if (group.currentTurn >= group.payoutQueue.length) group.currentTurn = 0;
            if (group.members.length === 0) {
                delete hagbadData[groupName];
                saveHagbad();
                return interaction.update({ content: `🗑️ Koox **${groupName}** la tirtiray (xubno la'aan).`, embeds: [], components: [] });
            }
            saveHagbad();
            const { embed, row } = buildGroupPanel(groupName, group, userId);
            return interaction.update({ content: `✅ Koox **${groupName}** ka baxday.`, embeds: [embed], components: [row] });
        }

        // ── Hagbad: Refresh button ──
        if (id.startsWith('hag_refresh_')) {
            const rest      = id.replace('hag_refresh_', '');
            const firstUnd  = rest.indexOf('_');
            const userId    = rest.substring(0, firstUnd);
            const groupName = rest.substring(firstUnd + 1);
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { hagbadData } = require('../economy/hagbadStore');
            const { buildGroupPanel } = require('../../data/commands/economy/hagbad');
            const group = hagbadData[groupName];
            if (!group) return interaction.update({ content: `⚠️ Koox **${groupName}** lama helin.`, embeds: [], components: [] });
            const { embed, row } = buildGroupPanel(groupName, group, userId);
            return interaction.update({ embeds: [embed], components: [row] });
        }

        // ── Hagbad: Close button ──
        if (id.startsWith('close_hag_')) {
            const userId = id.replace('close_hag_', '');
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ content: '✅ La xiray.', embeds: [], components: [] });
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
        if (id.startsWith('help_shop_')) {
            const ownerId = id.replace('help_shop_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildHelpShopEmbed()], components: [helpRow(ownerId, 'shop')] });
        }
        if (id.startsWith('help_ww_')) {
            const ownerId = id.replace('help_ww_', '');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [buildWwEmbed()], components: [helpRow(ownerId, 'ww')] });
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
                    new StringSelectMenuBuilder().setCustomId(`inv_sel_frame_${ownerId}`).setPlaceholder('Frame dooro...').addOptions(options)
                );
                return interaction.reply({ content: '🖼️ **Frame dooro:**', components: [menu], flags: MessageFlags.Ephemeral });
            } else {
                const allTitles = [...new Set([...(d.ownedTitles || []), ...(ec.econTitles || [])])];
                const options = allTitles.map(k => {
                    const et = ECON_TITLES[k];
                    const label = et ? et.label.replace(/\s*◀.*/, '') : k;
                    return { label: label.slice(0, 25), value: k, default: d.activeTitle === k || ec.activeEconTitle === k };
                });
                if (!options.length) return interaction.reply({ content: '⚠️ Ma lihid titles.', flags: MessageFlags.Ephemeral });
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`inv_sel_title_${ownerId}`).setPlaceholder('Title dooro...').addOptions(options)
                );
                return interaction.reply({ content: '🏷️ **Title dooro:**', components: [menu], flags: MessageFlags.Ephemeral });
            }
        }

        // ── Music buttons ──
        if (id.startsWith('music_')) {
            let music;
            try { music = require('../../data/commands/music'); }
            catch { return interaction.reply({ content: '⚠️ Music install ma ahan.', flags: MessageFlags.Ephemeral }); }

            const action  = id.split('_')[1];
            const guildId = interaction.guild.id;

            if (action === 'pause') {
                const result = music.pauseById(guildId);
                return interaction.reply({ content: result === 'paused' ? '⏸ La joojiyay.' : result === 'resumed' ? '▶️ Sii waday.' : '⚠️ Wax ma ciyaarayo.', flags: MessageFlags.Ephemeral });
            }
            if (action === 'skip')  { music.skipById(guildId);  return interaction.reply({ content: '⏭️ La gudbay.',   flags: MessageFlags.Ephemeral }); }
            if (action === 'stop')  { music.stopById(guildId);  return interaction.reply({ content: '⏹️ La joojiyay.', flags: MessageFlags.Ephemeral }); }
            if (action === 'leave') { music.leaveById(guildId); return interaction.reply({ content: '👋 VC ka baxay.', flags: MessageFlags.Ephemeral }); }
            if (action === 'queue') {
                const q = music.getQueueObj(guildId);
                if (!q?.current && !q?.queue?.length) return interaction.reply({ content: '📭 Queue maran tahay.', flags: MessageFlags.Ephemeral });
                const lines = [];
                if (q.current) lines.push(`🎵 **Hadda:** ${q.current.title} — ${q.current.duration}`);
                q.queue.slice(0, 9).forEach((s, i) => lines.push(`**${i+1}.** ${s.title} — ${s.duration}`));
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎶 Queue').setColor('#1db954').setDescription(lines.join('\n'))], flags: MessageFlags.Ephemeral });
            }
            if (action === 'loop1') {
                const q = music.getQueueObj(guildId);
                const cur = q?.loop || 'off';
                const next = cur === 'one' ? 'off' : 'one';
                music.loopById(guildId, next);
                return interaction.reply({ content: next === 'one' ? '🔂 Loop Song — ON' : '🔂 Loop Song — OFF', flags: MessageFlags.Ephemeral });
            }
            if (action === 'loopall') {
                const q = music.getQueueObj(guildId);
                const cur = q?.loop || 'off';
                const next = cur === 'all' ? 'off' : 'all';
                music.loopById(guildId, next);
                return interaction.reply({ content: next === 'all' ? '🔁 Loop All — ON' : '🔁 Loop All — OFF', flags: MessageFlags.Ephemeral });
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

        // ── Admin: Give (IQ or BTC) button → modal ──
        if (id.startsWith('admin_give_')) {
            const ownerId = id.replace('admin_give_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_give_${ownerId}`).setTitle('🎁 Give IQ or BTC');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('give_input').setLabel('iq 200  or  btc 500').setStyle(TextInputStyle.Short).setPlaceholder('iq 200   /   btc 500').setRequired(true)),
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
                    new TextInputBuilder().setCustomId('amount').setLabel('IQ xaddadka (qof walba)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Tusaale: 100').setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        if (id.startsWith('admin_giveall_btc_')) {
            const ownerId = id.replace('admin_giveall_btc_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_m_giveall_btc_${ownerId}`).setTitle('₿ Give BTC — All Players');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('BTC xaddadka (qof walba)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Tusaale: 5000').setRequired(true)
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
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('BTC xaddadka').setStyle(TextInputStyle.Short).setPlaceholder('Tusaale: 5000').setRequired(true)),
            );
            return interaction.showModal(modal);
        }

        // ── Admin: Add/Remove Admin button → modal (owner only) ──
        if (id.startsWith('admin_addadmin_')) {
            const ownerId = id.replace('admin_addadmin_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
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
                    new TextInputBuilder().setCustomId('msg').setLabel('Fariinta (DM dhammaan players)').setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Tusaale: Quiz cusub berri 8 PM!').setRequired(true)
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
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka IQ').setStyle(TextInputStyle.Short).setPlaceholder('Tusaale: 100').setRequired(true)),
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
                return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
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
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Fariinta').setStyle(TextInputStyle.Paragraph).setPlaceholder('Farriinta u dir qofka...').setRequired(true)),
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
            return interaction.update({ embeds: [buildAllPlayersEmbed(0)], components: [buildPlayersPageRow(0, totalPages, ownerId)] });
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
            return interaction.update({ embeds: [buildAllPlayersEmbed(page)], components: [buildPlayersPageRow(page, totalPages, ownerId)] });
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
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddad ku dar khaznadda (BTC)').setStyle(TextInputStyle.Short)
                        .setPlaceholder(`Hadda: ₿: ${fmt((t.balance || 0))}`).setRequired(true)
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
                    new TextInputBuilder().setCustomId('amount').setLabel('Tax per player (BTC)').setStyle(TextInputStyle.Short)
                        .setPlaceholder('Tusaale: 5').setRequired(true)
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
                return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
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
        if (id.startsWith('admin_eco_giveusd_')) {
            const ownerId = id.replace('admin_eco_giveusd_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`admin_eco_m_giveusd_${ownerId}`).setTitle('₿ Give BTC');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka BTC').setStyle(TextInputStyle.Short).setPlaceholder('Tusaale: 5000').setRequired(true)),
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
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('asset').setLabel('Asset (btc)').setStyle(TextInputStyle.Short).setPlaceholder('btc').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka').setStyle(TextInputStyle.Short).setPlaceholder('Tusaale: 1').setRequired(true)),
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
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka BTC').setStyle(TextInputStyle.Short).setPlaceholder('Tusaale: 10000').setRequired(true)),
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
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddad (distribute) ama "UserID xad" (give)').setStyle(TextInputStyle.Short).setPlaceholder(`Khaznad hadda: ₿: ${fmt((t.balance || 0))}`).setRequired(false)
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
                    .setPlaceholder('Tusaale: 50')
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

        // ── Bank: Bax (qaado dhammaan) ──
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
                        .setLabel('Iska xir')
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

        // ── Vote: Claim BTC or Gold ──
        if (id.startsWith('vote_claim_')) {
            const parts  = id.split('_');
            const asset  = parts[2]; // btc or gold
            const userId = parts[3];
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

            const { recordClaim, hasClaimedRecently } = require('../economy/voteStore');
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const { userData: uData, saveData }  = require('../store');
            const { checkUser, fmt }             = require('../utils/helpers');

            if (hasClaimedRecently(userId))
                return interaction.reply({ content: '⚠️ Horay ayaad u claiméysay — 24 saacadood sug.', flags: MessageFlags.Ephemeral });

            checkUser(userId);
            checkEconUser(userId);
            recordClaim(userId);

            const IQ_GAIN  = 12;
            const AMT      = 250;
            uData[userId].iq  = (uData[userId].iq  || 0) + IQ_GAIN;
            eData[userId].btc = (eData[userId].btc || 0) + AMT;
            saveData();
            saveEcon();

            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ Vote Reward — Claimed!')
                    .setColor('#2ecc71')
                    .setDescription(
                        `🧠 **+${IQ_GAIN} IQ**\n` +
                        `₿ **+₿: ${fmt(AMT)}**\n\n` +
                        `Vote again in 24 hours!`
                    )
                    .setFooter({ text: 'Garaad Bot — Thank you for voting!' })],
                components: [],
            });
        }

        // ── Admin: Eid greeting — channel only ──
        if (id.startsWith('admin_eid_')) {
            const ownerId = id.replace('admin_eid_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            if (!require('../utils/admin').isAdmin(ownerId))
                return interaction.reply({ content: '⛔ Admin maahan.', flags: MessageFlags.Ephemeral });

            // Reply FIRST — instant, no hang
            await interaction.reply({ content: '✅ Ciid fariin la diray!', flags: MessageFlags.Ephemeral });

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
            const key    = parts.slice(1).join('_');
            const userId = interaction.user.id;

            const { checkUser } = require('../utils/helpers');
            const { userData, saveData } = require('../store');
            const { econData, saveEcon } = require('../economy/econStore');
            const { FRAMES, BOOSTERS, LOOT_BOXES } = require('../../src/utils/itemDefs');
            const { ECON_TITLES } = require('../../data/commands/economy/econShop');
            checkUser(userId);

            const d  = userData[userId];
            const ec = econData[userId];
            if (!ec) return interaction.reply({ content: '⚠️ Economy account ma jiro. `?jeeb`', flags: MessageFlags.Ephemeral });

            if (type === 'frame') {
                const frame = FRAMES[key];
                if (!frame || frame.lootOnly) return interaction.reply({ content: '⚠️ Frame loot box kaliya.', flags: MessageFlags.Ephemeral });
                if ((d.ownedFrames || []).includes(key)) return interaction.reply({ content: '✅ Horay ayaad u lahayd.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < frame.price) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${frame.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= frame.price;
                d.ownedFrames.push(key);
                d.activeFrame = key; // auto-equip
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${frame.emoji} ${frame.name}** la iibsaday & la xidhay! (-₿${frame.price.toLocaleString()})\n\`?profile\` ku eeg.`, flags: MessageFlags.Ephemeral });
            }

            if (type === 'booster') {
                const boost = BOOSTERS[key];
                if (!boost) return interaction.reply({ content: '⚠️ Booster ma jiro.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < boost.price) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${boost.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= boost.price;
                if (key === 'iq_shield')  d.boosters.iqShields = (d.boosters.iqShields || 0) + 1;
                else if (key === 'double_iq')  d.boosters.doubleIq  = Date.now() + boost.duration;
                else if (key === 'double_xp')  d.boosters.doubleXp  = Date.now() + boost.duration;
                else if (key === 'double_btc') d.boosters.doubleBtc = Date.now() + boost.duration;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${boost.emoji} ${boost.name}** la iibsaday!`, flags: MessageFlags.Ephemeral });
            }

            if (type === 'loot') {
                const box = LOOT_BOXES[key];
                if (!box) return interaction.reply({ content: '⚠️ Loot box ma jiro.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < box.price) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${box.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= box.price;
                d.lootBoxes       ??= {};
                d.lootBoxes[key]   = (d.lootBoxes[key] || 0) + 1;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${box.emoji} ${box.name}** la iibsaday! Fur: \`?open ${key}\``, flags: MessageFlags.Ephemeral });
            }

            if (type === 'title') {
                const title = ECON_TITLES[key];
                if (!title) return interaction.reply({ content: '⚠️ Title ma jiro.', flags: MessageFlags.Ephemeral });
                if ((ec.econTitles || []).includes(key)) return interaction.reply({ content: '✅ Horay ayaad u lahayd.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < title.price) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${title.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= title.price;
                ec.econTitles = ec.econTitles || [];
                ec.econTitles.push(key);
                saveEcon();
                return interaction.reply({ content: `✅ **${title.label}** la iibsaday! \`?equip title ${key}\` si aad u xidho.`, flags: MessageFlags.Ephemeral });
            }

            // ── Rob Ticket ──
            if (id === 'shop_buy_rob_ticket') {
                const PRICE = 500;
                if ((ec.btc || 0) < PRICE) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${PRICE.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= PRICE;
                ec.inventory ??= {};
                ec.inventory.robticketExpiry = Date.now() + 24 * 60 * 60 * 1000;
                saveEcon();
                return interaction.reply({ content: `✅ **🔫 Rob Ticket** la iibsaday! 24 saac active. \`?rob @user\` isticmaal.`, flags: MessageFlags.Ephemeral });
            }

            // ── Safety Shield ──
            if (id === 'shop_buy_safety_shield') {
                const PRICE = 300;
                if ((ec.btc || 0) < PRICE) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${PRICE.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= PRICE;
                ec.inventory ??= {};
                ec.inventory.safetyExpiry = Date.now() + 24 * 60 * 60 * 1000;
                saveEcon();
                return interaction.reply({ content: `✅ **🛡️ Safety Shield** la iibsaday! 24h active. Rob kaa kari maysid.`, flags: MessageFlags.Ephemeral });
            }

            // ── Ring purchases ──
            if (id.startsWith('shop_buy_ring_')) {
                const { RINGS } = require('../../src/utils/itemDefs');
                const { ensureRel } = require('../../data/commands/relationship');
                const { userData, saveData } = require('../store');
                const type = id.replace('shop_buy_ring_', '');
                const ring = RINGS[type];
                if (!ring) return interaction.reply({ content: '⚠️ Ring nooc ah ma jiro.', flags: MessageFlags.Ephemeral });
                if ((ec.btc || 0) < ring.price) return interaction.reply({ content: `⚠️ BTC kuu ma filna. U baahan: ₿${ring.price.toLocaleString()}`, flags: MessageFlags.Ephemeral });
                ec.btc -= ring.price;
                checkUser(interaction.user.id);
                ensureRel(interaction.user.id);
                userData[interaction.user.id].ownedRings ??= { silver: 0, diamond: 0, royal: 0, somali: 0 };
                userData[interaction.user.id].ownedRings[type] = (userData[interaction.user.id].ownedRings[type] || 0) + 1;
                saveData(); saveEcon();
                return interaction.reply({ content: `✅ **${ring.emoji} ${ring.name}** la iibsaday! (-₿${ring.price.toLocaleString()})\nIsticmaal: \`?propose @user\``, flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({ content: '⚠️ Unknown purchase type.', flags: MessageFlags.Ephemeral });
        }

        // ── Treasury buttons (owner only) ──
        if (id.startsWith('trs_add_') || id.startsWith('trs_reduce_') || id.startsWith('trs_set_')) {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: '⛔ Owner kaliya.', flags: MessageFlags.Ephemeral });
            const { getTreasury } = require('../economy/econStore');
            const { fmt } = require('../utils/helpers');
            const t = getTreasury();
            let kind, label, placeholder;
            if (id.startsWith('trs_add_'))    { kind = 'add';    label = '📥 Ku dar BTC';     placeholder = 'Tusaale: 1000000'; }
            if (id.startsWith('trs_reduce_')) { kind = 'reduce'; label = '📤 Ka jar BTC';     placeholder = `Max: ${fmt(t.balance)}`; }
            if (id.startsWith('trs_set_'))    { kind = 'set';    label = '🎯 Xaddad cusub set'; placeholder = `Hadda: ${fmt(t.balance)}`; }
            const modal = new ModalBuilder()
                .setCustomId(`trs_m_${kind}_${OWNER_ID}`)
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
                    return interaction.reply({ content: '📭 Saaxiib ma lihid weli.', flags: MessageFlags.Ephemeral });
                const names = await Promise.all(friendIds.map(async fid => {
                    try { const u = await client.users.fetch(fid); return `👤 **${u.username}**`; }
                    catch { return `👤 <@${fid}>`; }
                }));
                return interaction.reply({ content: `**👥 Saaxiibada (${friendIds.length}):**\n${names.join('\n')}`, flags: MessageFlags.Ephemeral });
            }

            if (id.startsWith('rel_view_partner_')) {
                const rel = d.relationship || {};
                if (!rel.partnerId)
                    return interaction.reply({ content: '💔 Partner ma lihid.', flags: MessageFlags.Ephemeral });
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
            return interaction.reply({ content: '**📥 Xoolo geli — bank dooro:**', components: rows, flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: '⚠️ Wax bank ah lacag kuma dhigna.', flags: MessageFlags.Ephemeral });
            const rows = [];
            for (let i = 0; i < Math.min(btns.length, 10); i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
            return interaction.reply({ content: '**📤 Lacag ka qaad — bank dooro:**', components: rows, flags: MessageFlags.Ephemeral });
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
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
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
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
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
                    .setLabel(`Xaddadka (max: ₿${myBal.toLocaleString()})`)
                    .setPlaceholder('Tusaale: 2000')
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
                    .setLabel(`Xaddadka (max: ₿${myBal.toLocaleString()})`)
                    .setPlaceholder('Tusaale: 1000')
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
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Xaddadka BTC').setPlaceholder('Tusaale: 5000').setStyle(TextInputStyle.Short).setRequired(true)
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
                new TextInputBuilder().setCustomId('wd_amount').setLabel(`Xaddadka BTC (Max: ₿${bal.toLocaleString()})`).setPlaceholder('Tusaale: 5000').setStyle(TextInputStyle.Short).setRequired(true)
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
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Xaddadka BTC').setPlaceholder('Tusaale: 5000').setStyle(TextInputStyle.Short).setRequired(true)
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
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner kaliya.', flags: MessageFlags.Ephemeral });
            const profit = bank.ownerProfit || 0;
            if (profit <= 0) return interaction.reply({ content: '⚠️ Faa\'iido la\'aan hadda.', flags: MessageFlags.Ephemeral });
            checkEconUser(userId);
            eData[userId].btc  = (eData[userId].btc || 0) + profit;
            bank.ownerProfit   = 0;
            saveBanks(); saveEcon();
            const { embed, components } = buildOwnerPanel(bank, userId);
            return interaction.update({
                content: `✅ **₿${Math.floor(profit).toLocaleString()}** faa'iido jeebkaaga la geeyay!`,
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
                    .setLabel('Xaddadka BTC ee bangiga ku dari')
                    .setPlaceholder('Tusaale: 10000')
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
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner kaliya ayaa tirtiri kara.', flags: MessageFlags.Ephemeral });
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
            if (!bank) return interaction.reply({ content: '⚠️ Bank lama helin ama horaan la xiray.', flags: MessageFlags.Ephemeral });
            if (bank.ownerId !== userId) return interaction.reply({ content: '⚠️ Owner kaliya ayaa tirtiri kara.', flags: MessageFlags.Ephemeral });

            const bankName = bank.name;
            let refunded = 0;
            // Refund all customer deposits
            for (const [custId, cust] of Object.entries(bank.customers || {})) {
                if (!cust.balance || cust.balance <= 0) continue;
                checkEconUser(custId);
                eData[custId].btc = (eData[custId].btc || 0) + cust.balance;
                refunded += cust.balance;
            }
            // Give owner their pending profit
            const profit = bank.ownerProfit || 0;
            if (profit > 0) {
                checkEconUser(userId);
                eData[userId].btc = (eData[userId].btc || 0) + profit;
            }
            // Delete bank
            delete allBanks[bankId];
            saveBanks();
            saveEcon();

            return interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle('🗑️ Bank La Xiray')
                    .setColor('#e74c3c')
                    .setDescription(
                        `✅ **${bankName}** si guul leh ayaa la xiray.\n\n` +
                        `💰 Macaamiil waxaa loo celiyay: **₿${Math.floor(refunded).toLocaleString()}**\n` +
                        (profit > 0 ? `💸 Faa'iidadaadii: **₿${Math.floor(profit).toLocaleString()}** ayaa jeebkaaga u galay.\n` : '') +
                        `\n_Mahadsanid isticmaalka Garaad Economy._`
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
                new TextInputBuilder().setCustomId('dep_amount').setLabel('Xaddadka BTC').setPlaceholder('Tusaale: 5000').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // ── Personal Bank View: Deposit button (own bank) ──
        if (id.startsWith('pbank_own_dep_')) {
            const modal = new ModalBuilder()
                .setCustomId(`pbank_own_dep_modal_${interaction.user.id}`)
                .setTitle('📥 Bangigaaga — Lacag Geli');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_own_amount')
                        .setLabel('Xaddadka lacagta (BTC)')
                        .setPlaceholder('Tusaale: 5000')
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
                .setTitle('📤 Bangigaaga — Lacag Ka Qaad');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_wd_amount')
                        .setLabel('Xaddadka lacagta (BTC)')
                        .setPlaceholder('Tusaale: 2000')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_wd_pw')
                        .setLabel('Password (haddaad dhigtay)')
                        .setPlaceholder('Password-kaaga geli, haddaanay jirin — bannaanka ka daa')
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
                .setTitle('💰 Bank — Lacag Geli');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_bank_name')
                        .setLabel('Bank owner-ka magaciisa ama Bank ID')
                        .setPlaceholder('Tusaale: Ahmed  ama  GB-12345')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pbank_amount')
                        .setLabel('Xaddadka lacagta (BTC)')
                        .setPlaceholder('Tusaale: 5000')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
            );
            return interaction.showModal(modal);
        }

        // ── Xir (Close) ──
        if (id.startsWith('close_')) {
            const parts   = id.split('_');
            const ownerId = parts[parts.length - 1];
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            return interaction.message.delete().catch(() => {});
        }

        // ── Trade: Accept disclaimer → open market ──
        // ── Prediction: Refresh market ──
        if (id.startsWith('pred_refresh_')) {
            const ownerId = id.replace('pred_refresh_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { getActivePrediction }            = require('../economy/prediction');
            const { buildMarketEmbed, buildActiveEmbed, mainRow, controlRow } = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            const active = getActivePrediction(ownerId);
            if (active) {
                return interaction.update({ embeds: [buildActiveEmbed(active)], components: [controlRow(ownerId)] });
            }
            return interaction.update({
                embeds:     [buildMarketEmbed(eData[ownerId])],
                components: [mainRow(ownerId)],
            });
        }

        // ── Prediction: Back / Cancel → market ──
        if (id.startsWith('pred_back_') || id.startsWith('pred_cancel_')) {
            const ownerId = id.startsWith('pred_back_')
                ? id.replace('pred_back_', '')
                : id.replace('pred_cancel_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { clearPending }                   = require('../economy/prediction');
            const { buildMarketEmbed, mainRow }       = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            clearPending(ownerId);
            return interaction.update({
                embeds:     [buildMarketEmbed(eData[ownerId])],
                components: [mainRow(ownerId)],
            });
        }

        // ── Prediction: Asset selected → skip stake type, go straight to modal ──
        if (id.startsWith('pred_a_')) {
            const rest    = id.replace('pred_a_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { setPending, ASSET_LABEL }        = require('../economy/prediction');
            checkEconUser(ownerId);

            // BTC button → directly show BTC amount modal (predict on BTC by default)
            if (asset === 'btc') {
                setPending(ownerId, { asset: 'btc', stakeType: 'btc' });
                const modal = new ModalBuilder()
                    .setCustomId(`pred_amt_usd_${ownerId}`)
                    .setTitle('₿ Immisa BTC baad dhigaysaa?');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('pred_amount')
                        .setLabel(`BTC (Haysataa: ${(eData[ownerId].btc || 0).toLocaleString()})`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Tusaale: 500')
                        .setRequired(true),
                ));
                return interaction.showModal(modal);
            }

            // Asset button → stakeType = asset, show asset amount modal directly
            setPending(ownerId, { asset, stakeType: 'asset' });
            const bal = eData[ownerId][asset] || 0;
            const modal = new ModalBuilder()
                .setCustomId(`pred_amt_ast_${ownerId}`)
                .setTitle(`${ASSET_LABEL[asset] || asset.toUpperCase()} Immisa baad dhigaysaa?`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('pred_amount')
                    .setLabel(`${asset.toUpperCase()} (Haysataa: ${bal})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 1')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Prediction: USD + asset selected → USD amount modal ──
        if (id.startsWith('pred_ua_')) {
            const rest    = id.replace('pred_ua_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { setPending }                     = require('../economy/prediction');
            checkEconUser(ownerId);
            setPending(ownerId, { asset, stakeType: 'btc' });
            const modal = new ModalBuilder()
                .setCustomId(`pred_amt_usd_${ownerId}`)
                .setTitle('₿ Immisa BTC baad dhigaysaa?');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('pred_amount')
                    .setLabel(`BTC (Haysataa: ${(eData[ownerId].btc || 0).toLocaleString()})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 500')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Prediction: Stake with BTC → amount modal ──
        if (id.startsWith('pred_st_usd_')) {
            const ownerId = id.replace('pred_st_usd_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            checkEconUser(ownerId);
            const modal = new ModalBuilder()
                .setCustomId(`pred_amt_usd_${ownerId}`)
                .setTitle('₿ Immisa BTC baad dhigaysaa?');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('pred_amount')
                    .setLabel(`BTC (Haysataa: ${(eData[ownerId].btc || 0).toLocaleString()})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 500')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Prediction: Stake with Asset → amount modal ──
        if (id.startsWith('pred_st_ast_')) {
            const ownerId = id.replace('pred_st_ast_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { getPending, ASSET_LABEL }        = require('../economy/prediction');
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            checkEconUser(ownerId);
            const pend = getPending(ownerId);
            if (!pend || !pend.asset)
                return interaction.reply({ content: '⚠️ Xog la waayay — bilow marlabaad.', flags: MessageFlags.Ephemeral });
            const { asset } = pend;
            const bal = eData[ownerId][asset] || 0;
            const modal = new ModalBuilder()
                .setCustomId(`pred_amt_ast_${ownerId}`)
                .setTitle(`${ASSET_LABEL[asset] || asset.toUpperCase()} Immisa baad dhigaysaa?`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('pred_amount')
                    .setLabel(`${asset.toUpperCase()} (Haysataa: ${bal})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 1')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Prediction: Direction + time combined → auto-lock ──
        if (id.startsWith('pred_go_up_') || id.startsWith('pred_go_down_')) {
            const isUp    = id.startsWith('pred_go_up_');
            const rest    = id.replace(isUp ? 'pred_go_up_' : 'pred_go_down_', '');
            const parts   = rest.split('_');
            const minutes = parseInt(parts[0]);
            const ownerId = parts.slice(1).join('_');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { setPending, lockPrediction, getActivePrediction } = require('../economy/prediction');
            const { buildActiveEmbed, controlRow }                    = require('../../data/commands/economy/trade');
            setPending(ownerId, {
                direction: isUp ? 'up' : 'down',
                minutes,
                channelId: interaction.channelId,
                messageId: interaction.message.id,
            });
            const result = await lockPrediction(ownerId, interaction.client);
            if (!result.ok)
                return interaction.reply({ content: result.msg, flags: MessageFlags.Ephemeral });
            const active = getActivePrediction(ownerId);
            return interaction.update({
                embeds:     [buildActiveEmbed(active)],
                components: [controlRow(ownerId)],
            });
        }

        // ── Trade: open sell panel ──
        if (id.startsWith('trade_sell_') && !id.startsWith('trade_sellasset_') && !id.startsWith('trade_sellmod_')) {
            const ownerId = id.replace('trade_sell_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { buildSellEmbed, sellRow } = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            return interaction.update({
                embeds:     [buildSellEmbed(eData[ownerId])],
                components: [sellRow(ownerId)],
            });
        }

        // ── Trade: select asset to sell → amount modal ──
        if (id.startsWith('trade_sellasset_')) {
            const rest    = id.replace('trade_sellasset_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { ASSET_LABEL } = require('../economy/prediction');
            const { getPrice }    = require('../economy/market');
            checkEconUser(ownerId);
            const price = getPrice(asset);
            const bal   = eData[ownerId][asset] || 0;
            const modal = new ModalBuilder()
                .setCustomId(`trade_sellmod_${asset}_${ownerId}`)
                .setTitle(`💰 Iibso ${ASSET_LABEL[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('sell_amount')
                    .setLabel(`Xaddad (Qiimaha: ₿: ${price?.toLocaleString()} | Haysataa: ${bal})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 1')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Trade Shop: open asset shop ──
        if (id.startsWith('trade_shop_')) {
            const ownerId = id.replace('trade_shop_', '');
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { buildShopEmbed, shopRow } = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            return interaction.update({
                embeds:     [buildShopEmbed(eData[ownerId])],
                components: [shopRow(ownerId)],
            });
        }

        // ── Trade Shop: buy asset → amount modal ──
        if (id.startsWith('trade_buy_')) {
            const rest    = id.replace('trade_buy_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { ASSET_LABEL }                    = require('../economy/prediction');
            const { getPrice }                       = require('../economy/market');
            checkEconUser(ownerId);
            const price   = getPrice(asset);
            const maxUnits = price > 0 ? Math.floor((eData[ownerId].btc || 0) / price) : 0;
            const modal = new ModalBuilder()
                .setCustomId(`trade_buymod_${asset}_${ownerId}`)
                .setTitle(`🛒 Iibso ${ASSET_LABEL[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('buy_amount')
                    .setLabel(`Tirada (Qiimaha: ₿: ${price?.toLocaleString()}/unit | Max: ${maxUnits})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 1')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
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
                .setTitle(`Lacag u dir — ${ASSET_LABELS[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_gv_amount')
                    .setLabel(`Xaddadka (Haysataa: ${balance} ${asset.toUpperCase()})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 200')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Ebank: navigation buttons ──
        if (id.startsWith('eco_eb_') && !id.startsWith('eco_eba_')) {
            const parts   = id.split('_');
            const userId  = parts[parts.length - 1];
            const section = parts[2]; // main | khaznad | garaad

            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });

            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            const {
                applyInterest,
                buildMainEmbed, buildBankEmbed, buildKhaznadEmbed,
                bankFullRow, ebCloseRow, backRow,
            } = require('../../data/commands/economy/ebank');
            checkEconUser(userId);
            const d = eData[userId];
            applyInterest(d);
            saveEcon();

            if (section === 'main') {
                return interaction.update({ embeds: [buildMainEmbed(d)], components: [bankFullRow(userId)] });
            }
            if (section === 'khaznad') {
                return interaction.update({ embeds: [buildKhaznadEmbed()], components: [backRow(userId)] });
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
                            .setPlaceholder('Tusaale: Ahmed')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('eco_eb_bankname')
                            .setLabel('Bank magaciisa (baniga lacagta lagu dari)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('garaad | Kormaal Bank | GB-72957')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('eco_eb_amount')
                            .setLabel(`Xaddadka (₿: ${(d.banks?.garaad || 0).toLocaleString()} haysataa)`)
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
            const maxAmt    = isDeposit ? (d.btc || 0) : (d.banks?.[bank] || 0);
            const label     = isDeposit ? `Dhig (Max: ₿: ${maxAmt.toLocaleString()})` : `Bax (Max: ₿: ${maxAmt.toLocaleString()})`;

            const modal = new ModalBuilder()
                .setCustomId(`eco_ebmod_${action}_${bank}_${userId}`)
                .setTitle(`${bankLabel} Bank — ${isDeposit ? 'Deposit' : 'Withdraw'}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_eb_amount')
                    .setLabel(label)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 500')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }


        // ── Cashflip: Asset button → amount modal (legacy) ──
        if (id.startsWith('eco_cf_')) {
            const rest    = id.replace('eco_cf_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);

            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { ASSET_LABELS } = require('../../data/commands/economy/cashflip');
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            checkEconUser(ownerId);
            const balance = eData[ownerId][asset];

            const modal = new ModalBuilder()
                .setCustomId(`eco_cfmod_${asset}_${ownerId}`)
                .setTitle(`Cashflip — ${ASSET_LABELS[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_cf_amount')
                    .setLabel(`Xaddadka (Haysataa: ${balance} ${asset.toUpperCase()})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 100')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }


        // ── Trade: Refresh market view ──
        if (id.startsWith('eco_trefresh_')) {
            const ownerId = id.replace('eco_trefresh_', '');
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { buildMarketEmbed, mainRow, tradeCloseRow } = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            return interaction.update({
                embeds:     [buildMarketEmbed(eData[ownerId])],
                components: [mainRow(ownerId), tradeCloseRow(ownerId)],
            });
        }

        // ── Trade: Back to market view ──
        if (id.startsWith('eco_tback_')) {
            const ownerId = id.replace('eco_tback_', '');
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }
            const { econData: eData, checkEconUser } = require('../economy/econStore');
            const { buildMarketEmbed, mainRow, tradeCloseRow } = require('../../data/commands/economy/trade');
            checkEconUser(ownerId);
            return interaction.update({
                embeds:     [buildMarketEmbed(eData[ownerId])],
                components: [mainRow(ownerId), tradeCloseRow(ownerId)],
            });
        }

        // ── Economy: Asset select button → amount modal ──
        if (id.startsWith('eco_tsel_')) {
            const rest    = id.replace('eco_tsel_', '');
            const lastUnd = rest.lastIndexOf('_');
            const asset   = rest.substring(0, lastUnd);
            const ownerId = rest.substring(lastUnd + 1);

            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { ASSET_LABEL } = require('../../data/commands/economy/trade');
            const { getPrice }    = require('../economy/market');
            const price           = getPrice(asset);

            const modal = new ModalBuilder()
                .setCustomId(`eco_tmod_${asset}_${ownerId}`)
                .setTitle(`Trade — ${ASSET_LABEL[asset] || asset.toUpperCase()}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eco_trade_amount')
                    .setLabel(`Xaddadka (Qiimaha: ₿: ${price.toLocaleString()} / mid)`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Tusaale: 2')
                    .setRequired(true),
            ));
            return interaction.showModal(modal);
        }

        // ── Economy: Buy / Sell asset ──
        if (id.startsWith('eco_buy_') || id.startsWith('eco_sell_')) {
            const isBuy  = id.startsWith('eco_buy_');
            const parts  = id.split('_');
            // format: eco_buy_<asset>_<amount>_<price>_<userId>
            const userId = parts[parts.length - 1];
            const price  = parseFloat(parts[parts.length - 2]);
            const amount = parseFloat(parts[parts.length - 3]);
            const asset  = parts[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { econData, checkEconUser, saveEcon, addToTreasury: atT } = require('../economy/econStore');
            const { getPrice: gp, getMarketSnapshot }  = require('../economy/market');
            const { ASSET_LABEL }   = require('../../data/commands/economy/trade');
            checkEconUser(userId);
            const d         = econData[userId];
            const totalCost = Math.round(price * amount);

            let tradeWin = true;
            if (isBuy) {
                if ((d.btc || 0) < totalCost) {
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid. Haysataa: **₿: ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                // Market-weighted win probability: rising=50%, stable=45%, falling=40%
                const mktChange = getMarketSnapshot().find(s => s.asset === asset)?.change || 0;
                const winProb   = mktChange > 1 ? 0.50 : mktChange < -1 ? 0.40 : 0.45;
                tradeWin = Math.random() < winProb;
                d.btc = (d.btc || 0) - totalCost;
                if (tradeWin) {
                    d[asset] += amount;
                } else {
                    atT(totalCost);
                }
            } else {
                if (d[asset] < amount) {
                    return interaction.reply({ content: `⚠️ ${asset.toUpperCase()} kugu filna ma lihid. Haysataa: **${d[asset]}**`, flags: MessageFlags.Ephemeral });
                }
                d[asset] -= amount;
                d.btc     = (d.btc || 0) + totalCost;
            }
            saveEcon();
            const btcP = gp('btc'), goldP = gp('gold');
            const net  = d.btc * btcP + d.gold * goldP
                       + d.banks.mandeeq + d.banks.garaad;

            const resultRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`eco_min_${isBuy ? 'buy' : 'sell'}_${asset}_${amount}_${userId}`)
                    .setLabel('📉 So yaree')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`close_trade_${userId}`)
                    .setLabel('❌ Iska xir')
                    .setStyle(ButtonStyle.Danger),
            );

            const buyTitle = tradeWin
                ? `✅ Iibsashada — ${ASSET_LABEL[asset] || asset.toUpperCase()}`
                : `📉 Khasaaro — ${ASSET_LABEL[asset] || asset.toUpperCase()}`;
            const buyDesc = tradeWin
                ? `✅ **${amount} ${asset.toUpperCase()}** iibsatay — **₿: ${totalCost.toLocaleString()}**`
                : `❌ Suuqa si xun u guuray — **₿: ${totalCost.toLocaleString()}** baad lumisay, asset ma helin.`;

            return interaction.update({ embeds: [
                new EmbedBuilder()
                    .setTitle(isBuy ? buyTitle : `₿ Iibinta — ${ASSET_LABEL[asset] || asset.toUpperCase()}`)
                    .setColor(isBuy ? (tradeWin ? '#2ecc71' : '#e74c3c') : '#3498db')
                    .setDescription(
                        `${isBuy ? buyDesc : `₿ **${amount} ${asset.toUpperCase()}** iibiyay — **₿: ${totalCost.toLocaleString()}**`}\n\n` +
                        `**📊 Jeebkaaga Hadda:**\n` +
                        `₿ BTC: **₿: ${(d.btc || 0).toLocaleString()}**\n` +
                        `🥇 Gold: **${d.gold}**\n` +
                        `🏦 Banks: **₿: ${fmt((d.banks.mandeeq + d.banks.garaad))}**\n\n` +
                        `📊 **Net Worth: ~₿: ${fmt(Math.round(net))}**`
                    )
                    .setFooter({ text: 'Garaad Economy' }),
            ], components: [resultRow] });
        }

        // ── Economy: Minimize trade result ──
        if (id.startsWith('eco_min_')) {
            const parts   = id.split('_');
            const userId  = parts[parts.length - 1];
            const action  = parts[2]; // buy or sell
            const asset   = parts[3];
            const amount  = parts[4];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '⚠️ Farriintaas adiga kuma codsanin.', flags: MessageFlags.Ephemeral });
            }

            const { econData } = require('../economy/econStore');
            const d = econData[userId] || {};

            const closeBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_trade_${userId}`)
                    .setLabel('❌ Iska xir')
                    .setStyle(ButtonStyle.Danger),
            );

            return interaction.update({ embeds: [
                new EmbedBuilder()
                    .setDescription(
                        `${action === 'buy' ? '✅ Iibsatay' : '₿ Iibiyay'} **${amount} ${asset.toUpperCase()}** • ` +
                        `₿ BTC: **₿: ${fmt((d.btc || 0))}**`
                    )
                    .setColor('#2ecc71'),
            ], components: [closeBtn] });
        }

        // ── Economy Shop: Buy title or item via button ──
        if (id.startsWith('eco_shop_')) {
            const key = id.replace('eco_shop_', '');
            const { econData: eData, checkEconUser, saveEcon, addToTreasury } = require('../economy/econStore');
            const { SHOP_ITEMS } = require('../../data/commands/economy/econShop');
            const userId = interaction.user.id;
            checkEconUser(userId);
            const d    = eData[userId];
            const item = SHOP_ITEMS[key];
            if (!item) return interaction.reply({ content: '⚠️ Shayga la heli waayo.', flags: MessageFlags.Ephemeral });

            if (item.type === 'title') {
                if (d.econTitles.includes(key)) {
                    return interaction.reply({ content: `⚠️ **${item.label}** hormar haysataa.\n\`?etitle ${key}\` si aad u dhigto.`, flags: MessageFlags.Ephemeral });
                }
                if ((d.btc || 0) < item.price) {
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid.\nQiimaha: **₿: ${item.price.toLocaleString()}** | Haysataa: **₿: ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                d.btc = (d.btc || 0) - item.price;
                d.econTitles.push(key);
                if (!d.activeEconTitle) d.activeEconTitle = key;
                addToTreasury(item.price);
                saveEcon();
                return interaction.reply({ content: `✅ **${item.label}** si guul leh ayaad u iibsatay!\n\`?etitle ${key}\` si aad u dhigto.`, flags: MessageFlags.Ephemeral });
            }

            // Custom name title — show modal
            if (item.type === 'custom') {
                if ((d.btc || 0) < item.price) {
                    return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid.\nQiimaha: **₿: ${item.price.toLocaleString()}** | Haysataa: **₿: ${(d.btc || 0).toLocaleString()}**`, flags: MessageFlags.Ephemeral });
                }
                const modal = new ModalBuilder()
                    .setCustomId(`eco_shop_custom_mod_${userId}`)
                    .setTitle('✍️ Magacaaga Custom Title-ka');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('custom_title_name')
                        .setLabel('Magacaaga title-ka (ugu badnaan 30 xaraf)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Tusaale: Garaadle, Dr. Ahmed, The Shark...')
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

        // ── Minno buttons ──
        if (id.startsWith('minno_tile_')) {
            const { handleTilePick } = require('../../data/commands/minno');
            return handleTilePick(interaction);
        }
        if (id.startsWith('minno_accept_')) {
            const { handleMinnoAccept } = require('../../data/commands/minno');
            return handleMinnoAccept(interaction);
        }
        if (id.startsWith('minno_decline_')) {
            const { handleMinnoDecline } = require('../../data/commands/minno');
            return handleMinnoDecline(interaction);
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
                            `✅ **Waxaad ku guulaysatay diiwaangelinta!**\n\n` +
                            `Code-gaaga waa:\n\n# \`${code}\`\n\n` +
                            `**Tillaabooyinka:**\n` +
                            `1. Sug ilaa admin \`?tartan_bilow\` qoro\n` +
                            `2. Channel-ka tartanka u tag\n` +
                            `3. Qor: \`?gal ${code}\`\n\n` +
                            `⚠️ **Code-kan ha u shegin qof kale!**`
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
                        `• Wareeg 1 — **${TOURNAMENT_R1_QUESTIONS} su'aalood**\n` +
                        `• Wareeg 2 (Semi-Final) — **${TOURNAMENT_R2_QUESTIONS} su'aalood**\n` +
                        `• Final 🏆 — **${TOURNAMENT_FINAL_QUESTIONS} su'aalood**\n\n` +
                        `**⚡ DHIBCO (ku xidhan xawliga):**\n` +
                        `• < 5 ilbiriqsi → **40 dhibcood** (max)\n` +
                        `• 18 ilbiriqsi → **5 dhibcood** (min)\n` +
                        `• Dhexda → si toos ah hoos ugu dhacaysa\n\n` +
                        `**🔀 SU'AALAHA:**\n` +
                        `• MCQ: **4 doorasho** (A, B, C, D)\n` +
                        `• True/False: **Run** (True) / **Been** (False)\n` +
                        `• Maadooyinka: Diini · Taariikh · Xisaab · Grammar · Juqraafi\n\n` +
                        `**🚫 KA-SAAR:**\n` +
                        `• Wareeg 1 → 2: 1/6 ee dhibcaha hooseeya baxaan\n` +
                        `• Wareeg 2 → Final: badh (50%) ayaa baxaysa\n\n` +
                        `**🏆 ABAALMARINTA:**\n` +
                        `• Guuleystaha: **Champion 🏆** title + 500 XP\n\n` +
                        `**📋 SIDA LOO BIIRAY:**\n` +
                        `1. Guji **Register** (DM = code-kaaga)\n` +
                        `2. Sug admin inuu \`?tartan_bilow\` qoro\n` +
                        `3. Qor \`?gal CODE\` channel-ka tartanka\n` +
                        `4. Admin qoraa \`?admin_next\` — bilow!`
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
                    content: `👥 **Is-diiwaangashay:** ${count} qof\n\n${list || '_Cidna weli ma diiwaangalin_'}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return interaction.reply({
                content: `👥 **Is-diiwaangashay:** ${count} qof`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // ── Tournament Register button ──
        if (id === 'tournament_register') {
            const guildId = interaction.guildId;
            const state = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            if (!state || state.stage !== 'registration') {
                return interaction.reply({
                    content: '🔒 Diiwaangelinta waa la xiray.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
            return sendRegistrationCode(interaction.user, { reply: (o) => interaction.reply(o) }, state.gameChannelId, state.vcChannelId);
        }

        // ── Tartan Bilow: Status button ──
        if (id.startsWith('tartan_bilow_status_')) {
            const guildId = interaction.guildId;
            const state = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            const count = state ? state.players.size : 0;
            return interaction.reply({
                content: `👥 Ka qaybgalayaasha: **${count}** qof`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Fur Tartanka ──
        if (id.startsWith('tartan_open_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Kaliya admin.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const ok = await openGamePhase(interaction.client, interaction.user.id);
            if (ok) {
                return interaction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ Tartanka Waa La Furay')
                        .setColor('#2ecc71')
                        .setDescription(`Game channel waa la furay → <#${GAME_CHANNEL_ID}>\nDadka waxay qori karaan \`?gal CODE\``)
                    ],
                    components: [],
                }).catch(() => {});
            }
            return interaction.reply({ content: '⚠️ Khalad — state hubi.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Tirada ──
        if (id.startsWith('tartan_reg_count_')) {
            const count = tournamentRegistry?.size || 0;
            const list  = [...(tournamentRegistry?.entries() || [])].slice(0, 25)
                .map(([uid, { username }], i) => `${i + 1}. **${username || uid}** (\`${uid}\`)`)
                .join('\n');
            return interaction.reply({
                content: `👥 **Diiwaangeliyay:** ${count} qof\n\n${list || '_Cidna weli ma diiwaangalin_'}`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

        // ── Tartan: Admin DM panel — Jooji ──
        if (id.startsWith('tartan_cancel_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Kaliya admin.', flags: MessageFlags.Ephemeral }).catch(() => {});
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

        // ── Tartan Bilow: Next (admin only) ──
        if (id.startsWith('tartan_bilow_next_')) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '⛔ Kaliya **admin** ayaa bilaabi kara!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const guildId = interaction.guildId;
            const state   = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);
            if (!state || state.stage !== 'join') {
                return interaction.reply({ content: '⚠️ Tartan lama heli karo ama mar hore wuu bilaabmay.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            if (state.players.size < TOURNAMENT_MIN_PLAYERS) {
                return interaction.reply({
                    content: `⚠️ Ugu yaraan **${TOURNAMENT_MIN_PLAYERS}** qof. Hadda: **${state.players.size}**`,
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
                return interaction.reply({ content: '⛔ Kaliya **admin** ayaa badhankaan isticmaali kara.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const guildId = interaction.guildId;
            const state   = activeTournament?.get(guildId) || activeTournament?.get(GAME_CHANNEL_ID);

            if (!state) {
                return interaction.reply({
                    content: '⚠️ Tartan ma jiro. Ugu horreyn `?tartan_bilow` si channel-ka loo furo.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }

            if (state.stage === 'play') {
                return interaction.reply({
                    content: '⚠️ Wareeg ayaa hadda socda — sug ilaa uu dhammaado.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }

            const tnGameCh = state.channel || interaction.channel;

            if (state.stage === 'join') {
                if (state.players.size < TOURNAMENT_MIN_PLAYERS) {
                    return interaction.reply({
                        content: `⚠️ Ugu yaraan **${TOURNAMENT_MIN_PLAYERS}** qof ayaa loo baahan yahay. Hadda: **${state.players.size}** qof.`,
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
            if (aBusy) return interaction.reply({ content: `Casuumaha mar hore wuxuu ku jiraa ciyaar **${aBusy}**.`, flags: MessageFlags.Ephemeral });
            const tBusy = isUserBusy(targetId);
            if (tBusy) return interaction.reply({ content: `Adigu mar hore waxaad ku jirtaa ciyaar **${tBusy}**.`, flags: MessageFlags.Ephemeral });
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
            if (!state || state.started) return interaction.reply({ content: 'Lobby ma jiro ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (state.players.has(interaction.user.id)) return interaction.reply({ content: 'Mar hore ayaad ku jirtaa lobby-ga.', flags: MessageFlags.Ephemeral });
            if (state.players.size >= QUIZ_MAX_PLAYERS) return interaction.reply({ content: 'Lobby-gu wuu buuxsamay.', flags: MessageFlags.Ephemeral });
            const busy = isUserBusy(interaction.user.id);
            if (busy) return interaction.reply({ content: `Waxaad mar hore ku jirtaa ciyaar **${busy}**!`, flags: MessageFlags.Ephemeral });
            state.players.add(interaction.user.id);
            state.scores[interaction.user.id] = 0;
            await interaction.deferUpdate().catch(() => {});
            return refreshQuizLobby(state);
        }

        if (id.startsWith('quiz_leave_')) {
            const channelId = id.replace('quiz_leave_', '');
            const state = activeQuiz.get(channelId);
            if (!state || state.started) return interaction.reply({ content: 'Lobby ma jiro ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (!state.players.has(interaction.user.id)) return interaction.reply({ content: 'Lobby kuma jirtid.', flags: MessageFlags.Ephemeral });
            const wasHost = interaction.user.id === state.hostId;
            state.players.delete(interaction.user.id);
            delete state.scores[interaction.user.id];
            if (state.players.size === 0) {
                if (state.lobbyTimer) clearTimeout(state.lobbyTimer);
                activeQuiz.delete(channelId);
                await interaction.deferUpdate().catch(() => {});
                if (state.message) await state.message.edit({ embeds: [new EmbedBuilder().setTitle('🚪 Lobby waa la xidhay').setDescription('Cidina kuma harin lobby-ga.').setColor('#7f8c8d')], components: [] }).catch(() => {});
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
            if (!state || state.started) return interaction.reply({ content: 'Lobby ma jiro ama wuu bilaabmay.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== state.hostId) return interaction.reply({ content: 'Kaliya hostku ayaa bilaabi kara.', flags: MessageFlags.Ephemeral });
            if (state.players.size < QUIZ_MIN_PLAYERS) return interaction.reply({ content: `Ugu yaraan ${QUIZ_MIN_PLAYERS} qof. Hadda: ${state.players.size}`, flags: MessageFlags.Ephemeral });
            await interaction.deferUpdate().catch(() => {});
            if (state.message) await state.message.edit({ embeds: [new EmbedBuilder().setTitle('✅ Lobby waa la xidhay').setDescription(`Quiz wuxuu ku bilaabmayaa **${state.players.size}** qof.`).setColor('#2ecc71')], components: [] }).catch(() => {});
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
                content: '⚠️ Quiz-kii wuu dhamaaday ama bot restart ayaa dhacay. Bilow cusub: `?quiz`',
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
                content: '⚠️ Duel-kii wuu dhamaaday ama bot restart ayaa dhacay. Bilow cusub: `?duel`',
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
                    .setDescription('🔕 **Xusuusinta waa la xiraa.**\nDM kuma soo dirin doono. Dib u fur: `?reminder on`')
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
                return interaction.update({ embeds: [{ description: '✖ Access panel la xiraa.' }], components: [] });
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

            function fmtB(n) { return `₿${Math.floor(n||0).toLocaleString()}`; }

            // Bank view
            if (action === 'bank') {
                const bank = ecT.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account ma laha.', flags: MessageFlags.Ephemeral });
                let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
                return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle(`🏦 ${tName}'s Bank`)
                    .setDescription(
                        `💰 **Haraagga:** ${fmtB(bank.balance)}\n` +
                        `📥 **Wadarta la geliyay:** ${fmtB(bank.deposits)}\n` +
                        `📤 **Wadarta la bixiyay:** ${fmtB(bank.withdrawals)}`
                    )
                ]});
            }

            // Company view
            if (action === 'company') {
                const comp = ecT.company;
                if (!comp) return interaction.reply({ content: '⚠️ Company ma laha.', flags: MessageFlags.Ephemeral });
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
                if (!bank) return interaction.reply({ content: '⚠️ Bank account ma laha.', flags: MessageFlags.Ephemeral });
                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                const modal = new ModalBuilder()
                    .setCustomId(`acc_dep_modal_${targetId}_${callerId}`)
                    .setTitle('📥 Deposit → Bank');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka BTC').setStyle(TextInputStyle.Short).setPlaceholder('500').setRequired(true)
                ));
                return interaction.showModal(modal);
            }

            // Withdraw (from target's bank → caller's wallet)
            if (action === 'withdraw') {
                const bank = ecT.personalBank;
                if (!bank) return interaction.reply({ content: '⚠️ Bank account ma laha.', flags: MessageFlags.Ephemeral });
                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                const modal = new ModalBuilder()
                    .setCustomId(`acc_wd_modal_${targetId}_${callerId}`)
                    .setTitle('📤 Withdraw ← Bank');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('amount').setLabel('Xaddadka BTC').setStyle(TextInputStyle.Short).setPlaceholder('500').setRequired(true)
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
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            checkEconUser(targetId); checkEconUser(callerId);
            const ecC = eData[callerId]; const bank = eData[targetId].personalBank;
            if (!bank) return interaction.reply({ content: '⚠️ Bank ma laha.', flags: MessageFlags.Ephemeral });
            if ((ecC.btc || 0) < amount) return interaction.reply({ content: `⚠️ BTC kugu filna ma lihid. Haysataa: ₿${(ecC.btc||0).toLocaleString()}`, flags: MessageFlags.Ephemeral });
            ecC.btc = (ecC.btc || 0) - amount;
            bank.balance  += amount;
            bank.deposits += amount;
            saveEcon();
            let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
            return interaction.reply({ content: `📥 **₿${amount.toLocaleString()}** waxaad gelisay **${tName}**'s bank!`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.isModalSubmit?.() && id.startsWith('acc_wd_modal_')) {
            const parts    = id.split('_');
            const targetId = parts[3];
            const callerId = parts[4];
            const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Xaddad sax ah geli.', flags: MessageFlags.Ephemeral });
            const { econData: eData, checkEconUser, saveEcon } = require('../economy/econStore');
            checkEconUser(targetId); checkEconUser(callerId);
            const bank = eData[targetId].personalBank;
            if (!bank) return interaction.reply({ content: '⚠️ Bank ma laha.', flags: MessageFlags.Ephemeral });
            if (bank.balance < amount) return interaction.reply({ content: `⚠️ Bank ma filna. Haraagga: ₿${bank.balance.toLocaleString()}`, flags: MessageFlags.Ephemeral });
            bank.balance      -= amount;
            bank.withdrawals  += amount;
            eData[callerId].btc = (eData[callerId].btc || 0) + amount;
            saveEcon();
            let tName = targetId; try { const u = await interaction.client.users.fetch(targetId); tName = u.username; } catch {}
            return interaction.reply({ content: `📤 **₿${amount.toLocaleString()}** ka soo baxday **${tName}**'s bank — jeebkaaga!`, flags: MessageFlags.Ephemeral });
        }

        // ── Game reward claim buttons ────────────────────────────────────
        if (id.startsWith('gr_')) {
            const { handleGameRewardChoice } = require('../utils/gameRewards');
            return handleGameRewardChoice(interaction);
        }

        // ── Classic Token diamond drop buttons ───────────────────────────
        if (id.startsWith('diamond_btc_')) {
            const { handleDiamondInteraction } = require('../economy/diamondDrops');
            return handleDiamondInteraction(interaction);
        }

        // ── Rich Leaderboard Buttons ──────────────────────────────────────
        if (id.startsWith('close_rich_')) {
            const authorId = id.replace('close_rich_', '');
            if (interaction.user.id !== authorId) {
                return interaction.reply({ content: '⛔ Qofkii amarka bixiyay kaliya ayaa xiri kara.', flags: MessageFlags.Ephemeral });
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
                content: '⚠️ Tartanku waa joojiyay ama bot restart ayaa dhacay. Sug wareeg cusub.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }

    });
};
