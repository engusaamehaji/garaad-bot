const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { userData } = require('../../../src/store');
const { createPersonalBank, addTx, hashPass, getAllPublicBanks, namePrefix } = require('../../../src/economy/bankStore');

function computePubDisplayId(bank) {
    const num = (bank.id || '').replace(/[^0-9]/g, '');
    return `${namePrefix(bank.name)}:${num}`;
}

const PUB_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const { checkRequirements, reqFailMessage } = require('../../../src/utils/requirements');
const { getDisplayName } = require('../../../src/utils/helpers');

const PROFIT_RATE     = 0.02;
const PROFIT_INTERVAL = 24 * 60 * 60 * 1000;

function fmtBtc(n)  { const v = Math.floor(n || 0); return `₿${isNaN(v) ? 0 : v.toLocaleString()}`; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }

function getTotalCustomerDeposits(bank) {
    return Object.values(bank.customers || {}).reduce((sum, c) => sum + (c.balance || 0), 0);
}

function applyBankProfit(bank) {
    const now = Date.now();
    bank.lastProfitAt ??= now;
    const days = Math.floor((now - bank.lastProfitAt) / PROFIT_INTERVAL);
    if (days <= 0) return 0;
    const customerTotal = getTotalCustomerDeposits(bank);
    if (customerTotal <= 0) { bank.lastProfitAt = now; return 0; }
    const profit = Math.floor(customerTotal * PROFIT_RATE * days);
    if (profit <= 0) { bank.lastProfitAt = now; return 0; }
    bank.balance      += profit;
    bank.profitEarned  = (bank.profitEarned || 0) + profit;
    bank.lastProfitAt  = now;
    addTx(bank, 'profit', profit, `Faa'iido macaamiisha (${days} maalin)`);
    return profit;
}

function bankViewRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pbank_own_dep_${userId}`)
            .setLabel('📥 Deposit')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`pbank_own_wd_${userId}`)
            .setLabel('📤 Withdraw')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`close_bv_${userId}`)
            .setLabel('✖ Close')
            .setStyle(ButtonStyle.Danger),
    );
}

// ── ?bc / ?bank create ────────────────────────────────
async function bankCreateCmd(message) {
    checkEconUser(message.author.id);
    const ec = econData[message.author.id];
    const ownerDisplayName = await getDisplayName(message.client, message.guild, message.author.id, message.author);
    if (ec.personalBank)
        return message.reply(`🏦 Bank account horay baad u lahayd! ID: \`${ec.personalBank.bankId}\` — \`?bv\` si aad u aragto.`);

    const { allMet, results } = checkRequirements(userData, econData, message.author.id, 'bank');
    if (!allMet) return message.reply(reqFailMessage(results, 'bank'));

    const bank = createPersonalBank(econData, message.author.id, message.author.username);
    saveEcon();
    return message.reply(
        `✅ **Bank account la abuuray!**\n\n` +
        `🏦 **Bank ID:** \`${bank.bankId}\`\n` +
        `👤 **Owner:** ${ownerDisplayName}\n\n` +
        `📌 Password dhig: \`?bp <password>\`\n` +
        `📌 Bangigaaga arag: \`?bv\``
    );
}

// ── ?bp <password> ────────────────────────────────────
async function bankPasswordCmd(message, args) {
    checkEconUser(message.author.id);
    const ec = econData[message.author.id];
    const pw = args[0];
    if (!pw || pw.length < 6) return message.reply(
        '⚠️ Password-ka **ugu yaraan 6 xaraf** ah geli.\nTusaale: `?bp MyPass99`'
    );
    if (pw.length > 32) return message.reply('⚠️ Password-ka aad u dheer (max 32 xaraf).');
    ec.accountPassword = pw;
    if (ec.personalBank) ec.personalBank.passwordHash = hashPass(pw);
    saveEcon();
    try { await message.delete(); } catch {}
    return message.channel.send(`✅ <@${message.author.id}> **Password la dhigay.**`);
}

// ── ?bv — view your own bank ──────────────────────────
async function bankViewCmd(message) {
    checkEconUser(message.author.id);
    const ec   = econData[message.author.id];
    const bank = ec.personalBank;
    if (!bank) return message.reply('⚠️ Bank account ma lihid. `?bc` isticmaal.');

    const profit = applyBankProfit(bank);
    if (profit > 0) saveEcon();

    const custTotal = getTotalCustomerDeposits(bank);
    const custCount = Object.keys(bank.customers || {}).length;
    const typeIcon  = { deposit: '📥', withdraw: '📤', profit: '💰', customer_deposit: '👥📥', customer_withdraw: '👥📤', transfer: '↔️', received: '↔️' };
    const txLines   = (bank.transactions || []).slice(0, 5).map(t =>
        `${typeIcon[t.type] || '↔️'} **${t.type}** ${fmtBtc(t.amount)} — *${t.note || ''}* (${fmtDate(t.at)})`
    );

    const embed = new EmbedBuilder()
        .setTitle(`🏦 ${bank.owner}'s Bank`)
        .setColor('#2ecc71')
        .setDescription(
            `🆔 **Bank ID:** \`${bank.bankId}\`\n` +
            `👤 **Owner:** ${bank.owner}\n` +
            `📅 **La abuurtay:** ${fmtDate(bank.createdAt)}\n\n` +
            `💰 **Haraagga bangi:** ${fmtBtc(bank.balance)}\n` +
            `💳 **Jeebka:** ${fmtBtc(ec.btc || 0)}\n\n` +
            `👥 **Macaamiisha:** ${custCount} qof | 💼 **Lacagtooda:** ${fmtBtc(custTotal)}\n` +
            `📈 **Faa'iido la helay:** ${fmtBtc(bank.profitEarned || 0)}` +
            (profit > 0 ? ` _(+${fmtBtc(profit)} maanta!)_` : '') + '\n\n' +
            `📥 **Wadarta la geliyay:** ${fmtBtc(bank.deposits || 0)}\n` +
            `📤 **Wadarta la bixiyay:** ${fmtBtc(bank.withdrawals || 0)}\n\n` +
            (txLines.length ? `**📋 Khibrad dambe:**\n${txLines.join('\n')}` : '*Wali wax xaadirin ma jirto*')
        )
        .setFooter({ text: 'Garaad Bank • Deposit/Withdraw buttons isticmaal' });

    return message.reply({ embeds: [embed], components: [bankViewRow(message.author.id)] });
}

// ── buildBankDirectory — shared by ?bank + button ─────
function buildBankDirectory(userId) {
    const pubBanks = Object.values(getAllPublicBanks())
        .filter(b => (Date.now() - (b.lastActivity || b.createdAt)) < PUB_EXPIRY_MS)
        .sort((a, b) => (b.balance || 0) - (a.balance || 0))
        .slice(0, 4);

    const persBanks = Object.entries(econData)
        .filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank)
        .map(([uid, d]) => ({
            uid,
            bank:      d.personalBank,
            custCount: Object.keys(d.personalBank.customers || {}).length,
        }))
        .sort((a, b) => b.custCount - a.custCount)
        .slice(0, 4);

    let desc = `**🏦 Garaad Bank** — 1% faa'iido maalinlaha\n\n`;
    if (pubBanks.length) {
        desc += `**🏛️ Public Banks:**\n`;
        desc += pubBanks.map((b, i) =>
            `**${i + 1}.** 🏛️ **${b.name}** · \`${b.id}\` · 💰 ${fmtBtc(b.balance)} · 👥 ${Object.keys(b.customers || {}).length}`
        ).join('\n') + '\n\n';
    }
    if (persBanks.length) {
        desc += `**🏦 Personal Banks:**\n`;
        desc += persBanks.map((e, i) =>
            `**${i + 1}.** 🏦 **${e.bank.owner}** · \`${e.bank.bankId}\` · 💰 ${fmtBtc(e.bank.balance)} · 👥 ${e.custCount}`
        ).join('\n');
    }
    if (!pubBanks.length && !persBanks.length)
        desc += `_Wali bangi kale ma jiro. \`?createbank <name>\` isticmaal!_`;

    const embed = new EmbedBuilder()
        .setTitle('🏦 Banks — Directory')
        .setColor('#2471a3')
        .setDescription(desc)
        .setFooter({ text: 'Bank taabo → Deposit & Withdraw' });

    const components = [];
    const row1Btns = [
        new ButtonBuilder().setCustomId(`bank_view_garaad_${userId}`).setLabel('🏦 Garaad Bank').setStyle(ButtonStyle.Secondary),
        ...pubBanks.map(b =>
            new ButtonBuilder()
                .setCustomId(`bank_view_pub_${b.id}_${userId}`)
                .setLabel(`🏛 ${b.name.slice(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
    components.push(new ActionRowBuilder().addComponents(row1Btns));
    if (persBanks.length) {
        const row2Btns = persBanks.map(e =>
            new ButtonBuilder()
                .setCustomId(`bank_view_pers_${e.uid}_${userId}`)
                .setLabel(`🏦 ${e.bank.owner.slice(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(new ActionRowBuilder().addComponents(row2Btns));
    }
    components.push(new ActionRowBuilder().addComponents([
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    ]));

    return { embed, components };
}

// ── Sub-panels for public + personal banks ────────────
function buildPubBankPanel(bank, userId) {
    const myBal       = bank.customers?.[userId]?.balance || 0;
    const custCount   = Object.keys(bank.customers || {}).length;
    const totalDep    = Object.values(bank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
    const lastAct     = bank.lastActivity ? fmtDate(bank.lastActivity) : fmtDate(bank.createdAt);

    const embed = new EmbedBuilder()
        .setTitle(`🏛️ ${bank.name}`)
        .setColor('#27ae60')
        .addFields(
            { name: '🆔 Bank ID',       value: `\`${bank.id}\``,             inline: true },
            { name: '👔 CEO',           value: `**${bank.ownerUsername}**`,  inline: true },
            { name: '📈 Rate',          value: `**N/A**`,                    inline: true },
            { name: '💰 Balance',       value: fmtBtc(bank.balance || 0),    inline: true },
            { name: '👥 Customers',     value: `**${custCount}**`,           inline: true },
            { name: '📅 Last Activity', value: lastAct,                      inline: true },
            { name: '📊 Total Deposits',value: fmtBtc(totalDep),             inline: true },
            { name: '💼 Your Deposit',  value: fmtBtc(myBal),                inline: true },
        )
        .setFooter({ text: 'Deposit → lacag geli  •  Withdraw → lacagtaada ka qaad' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dep_pub_${bank.id}_${userId}`).setLabel('⬇ Deposit') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`wd_pub_${bank.id}_${userId}`) .setLabel('⬆ Withdraw').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`back_to_banks_${userId}`)     .setLabel('🔙 Back')   .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`)       .setLabel('✖ Xir')     .setStyle(ButtonStyle.Danger),
    );
    return { embed, components: [row] };
}

function buildPersBankPanel(bank, ownerId, userId) {
    const myBal     = bank.customers?.[userId]?.balance || 0;
    const custCount = Object.keys(bank.customers || {}).length;
    const custTotal = getTotalCustomerDeposits(bank);
    const profit    = bank.profitEarned || 0;

    const embed = new EmbedBuilder()
        .setTitle(`🏦 ${bank.owner}'s Bank`)
        .setColor('#2ecc71')
        .addFields(
            { name: '🆔 Bank ID',      value: `\`${bank.bankId}\``,     inline: true },
            { name: '👔 CEO',          value: `**${bank.owner}**`,      inline: true },
            { name: '📈 Rate',         value: `**+2%/day**`,            inline: true },
            { name: '💰 Balance',      value: fmtBtc(bank.balance || 0),inline: true },
            { name: '👥 Customers',    value: `**${custCount}**`,       inline: true },
            { name: '📊 Cust. Deposits',value: fmtBtc(custTotal),       inline: true },
            { name: '💸 Profit Earned',value: fmtBtc(profit),           inline: true },
            { name: '💼 Your Deposit', value: fmtBtc(myBal),            inline: true },
        )
        .setFooter({ text: 'Deposit → lacag geli  •  Withdraw → lacagtaada ka qaad' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dep_pers_${ownerId}_${userId}`).setLabel('⬇ Deposit') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`wd_pers_${ownerId}_${userId}`) .setLabel('⬆ Withdraw').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`back_to_banks_${userId}`)      .setLabel('🔙 Back')   .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`close_ebank_${userId}`)        .setLabel('✖ Xir')     .setStyle(ButtonStyle.Danger),
    );
    return { embed, components: [row] };
}

// ── ?bank — all banks panel, 3 buttons ───────────────
async function bankDirectoryCmd(message) {
    try {
        checkEconUser(message.author.id);
        const userId = message.author.id;
        const ec     = econData[userId];

        const pubBanks = Object.values(getAllPublicBanks())
            .filter(b => (Date.now() - (b.lastActivity || b.createdAt)) < PUB_EXPIRY_MS)
            .sort((a, b) => (b.balance || 0) - (a.balance || 0));

        const persBanks = Object.entries(econData)
            .filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank)
            .map(([uid, d]) => ({ uid, bank: d.personalBank }))
            .sort((a, b) => (b.bank.balance || 0) - (a.bank.balance || 0));

        // My balances
        const myGaraad  = ec.banks?.garaad || 0;
        const myWallet  = ec.btc || 0;

        // Collect all my deposits in other banks
        let myBankTotal = myGaraad;
        const myDepLines = [];
        for (const b of pubBanks) {
            const dep = b.customers?.[userId]?.balance || 0;
            if (dep > 0) { myBankTotal += dep; myDepLines.push(`  └ 🏛 **${b.name}:** ${fmtBtc(dep)}`); }
        }
        for (const e of persBanks) {
            const dep = e.bank.customers?.[userId]?.balance || 0;
            if (dep > 0) { myBankTotal += dep; myDepLines.push(`  └ 🏦 **${e.bank.owner}'s Bank:** ${fmtBtc(dep)}`); }
        }
        const myTotal = myWallet + myBankTotal;

        // New Bank Manager panel
        const garaadTotal = Object.values(econData)
            .filter(d => d && typeof d === 'object' && !d.__treasury__)
            .reduce((s, d) => s + (d.banks?.garaad || 0), 0);

        // Build HANTIDAADA lines — wallet + garaad + all pub banks player is in
        const hLines = [];
        hLines.push(`💵 Wallet         ➜ ${fmtBtc(myWallet)}`);
        hLines.push(`🏦 Garaad Bank    ➜ ${fmtBtc(myGaraad)}`);
        let runningTotal = myWallet + myGaraad;
        for (const pb of pubBanks) {
            const myDep = pb.customers?.[userId]?.balance || 0;
            runningTotal += myDep;
            const nameShort = (pb.name || 'Bank').slice(0, 14).padEnd(14);
            hLines.push(`🏛️ ${nameShort} ➜ ${fmtBtc(myDep)}`);
        }

        // Build BANKIYADA lines — all pub banks details
        const bLines = [];
        bLines.push(`💎 Garaad Bank`);
        bLines.push(`└ 💰 Kaydka Bankiga: ${fmtBtc(garaadTotal)}`);
        for (const pb of pubBanks) {
            const myDep = pb.customers?.[userId]?.balance || 0;
            const fee   = pb.depositFee != null ? pb.depositFee : 1;
            bLines.push(``);
            bLines.push(`🌐 ${pb.name}`);
            bLines.push(`└ 💰 Kaydka Bankiga: ${fmtBtc(pb.balance || 0)}`);
            bLines.push(`└ 📥 Kaydkaaga: ${fmtBtc(myDep)}`);
            bLines.push(`└ 💸 Owner Fee: ${fee}% deposit kasta`);
        }

        const desc = [
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `💰 **𝐇𝐀𝐍𝐓𝐈𝐃𝐀𝐀𝐃𝐀**`,
            ``,
            ...hLines,
            ``,
            `📊 Wadarta Guud   ➜ ${fmtBtc(runningTotal)}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `🏦 **𝐁𝐀𝐍𝐊𝐈𝐘𝐀𝐃𝐀**`,
            ``,
            ...bLines,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `⚙️ **𝐀𝐌𝐀𝐑𝐑𝐀𝐃𝐀**`,
            `Deposit   ➜ ?d (bank name) (amount)`,
            `Withdraw  ➜ ?w (bank name) (amount)`,
        ].join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🏛️ 🏦 𝐁𝐀𝐍𝐊 𝐌𝐀𝐍𝐀𝐆𝐄𝐑')
            .setColor('#1a73e8')
            .setDescription(desc)
            .setFooter({ text: '🟢 DEPOSIT   🔵 WITHDRAW   🔴 XIR' });

        const components = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bank_all_dep_${userId}`).setLabel('⬇ Deposit').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`bank_all_wd_${userId}`) .setLabel('⬆ Withdraw').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`close_ebank_${userId}`) .setLabel('✖ Xir')     .setStyle(ButtonStyle.Danger),
        )];

        return message.reply({ embeds: [embed], components });
    } catch (err) {
        console.error('[bankDirectoryCmd]', err);
        return message.reply('⚠️ Khalad ayaa dhacay. Dib u isku day.');
    }
}

// ── ?jb — player's own bank balances ─────────────────
async function jbCmd(message) {
    checkEconUser(message.author.id);
    const userId = message.author.id;
    const ec     = econData[userId];

    const garaad = ec.banks?.garaad || 0;
    const persBank = ec.personalBank;

    // Find deposits in public/personal banks
    const deposits = [];
    for (const [uid, d] of Object.entries(econData)) {
        if (!/^\d{17,19}$/.test(uid) || !d?.personalBank || uid === userId) continue;
        const rec = d.personalBank.customers?.[userId];
        if (rec && (rec.balance || 0) > 0)
            deposits.push({ name: `🏦 ${d.personalBank.owner}'s Bank`, bal: rec.balance });
    }
    for (const b of Object.values(getAllPublicBanks())) {
        const rec = b.customers?.[userId];
        if (rec && (rec.balance || 0) > 0)
            deposits.push({ name: `🏛 ${b.name}`, bal: rec.balance });
    }

    let desc = `🏦 **Garaad Bank:** ${fmtBtc(garaad)}\n`;
    if (persBank) desc += `🏦 **${persBank.owner}'s Bank (yours):** ${fmtBtc(persBank.balance || 0)}\n`;
    if (deposits.length) {
        desc += `\n**📥 Deposits in other banks:**\n`;
        desc += deposits.map(d => `${d.name}: ${fmtBtc(d.bal)}`).join('\n');
    }
    if (!persBank && !deposits.length) desc += `\n_Wax bank ah kuma dhigin._`;

    const viewerName = await getDisplayName(message.client, message.guild, message.author.id, message.author);
    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle(`💰 ${viewerName} — Bank Balances`)
        .setColor('#2ecc71')
        .setDescription(desc)
    ]});
}

// ── ?bd <bank name/id> <amount> ───────────────────────
async function bankDepositTextCmd(message, args) {
    if (args.length < 2) return message.reply('⚠️ Isticmaal: `?bd <bank name/ID> <amount>`\nTusaale: `?bd Kormaal Bank 5000`');
    const amount  = Math.floor(Number(args[args.length - 1]));
    const bankRef = args.slice(0, -1).join(' ').trim().toLowerCase();
    if (!amount || amount <= 0) return message.reply('⚠️ Xaddad sax ah geli. Tusaale: `?bd Kormaal Bank 5000`');

    checkEconUser(message.author.id);
    const ec = econData[message.author.id];
    if ((ec.btc || 0) < amount) return message.reply(`⚠️ Jeebkaagu ma filna. Haysataa: ${fmtBtc(ec.btc || 0)}`);

    // Check Garaad Bank
    if (bankRef === 'garaad' || bankRef === 'garaad bank' || bankRef === 'ebank') {
        ec.banks        = ec.banks        || { garaad: 0 };
        ec.banks.garaad = (ec.banks.garaad || 0) + amount;
        ec.btc          = (ec.btc || 0) - amount;
        saveEcon();
        return message.reply(`📥 **${fmtBtc(amount)}** → 🏦 **Garaad Bank**\n💰 Bank hadda: **${fmtBtc(ec.banks.garaad)}**`);
    }

    // Search personal banks
    const foundPers = Object.entries(econData).find(([uid, d]) => {
        if (!/^\d{17,19}$/.test(uid) || !d?.personalBank) return false;
        const b = d.personalBank;
        return b.owner.toLowerCase() === bankRef || b.bankId.toLowerCase() === bankRef;
    });
    if (foundPers) {
        const [tId, tEc] = foundPers;
        if (tId === message.author.id) return message.reply('⚠️ Bank-kaaga laftiis: `?bv` fur.');
        const tBank = tEc.personalBank;
        applyBankProfit(tBank);
        ec.btc = (ec.btc || 0) - amount;
        tBank.customers = tBank.customers || {};
        tBank.customers[message.author.id] ??= { username: message.author.username, balance: 0, depositedAt: Date.now() };
        tBank.customers[message.author.id].balance += amount;
        addTx(tBank, 'customer_deposit', amount, `← ${message.author.username}`);
        saveEcon();
        return message.reply(`📥 **${fmtBtc(amount)}** → 🏦 **${tBank.owner}**'s Bank\n💼 Haysataa: **${fmtBtc(tBank.customers[message.author.id].balance)}**`);
    }

    // Search public banks
    const { getAllPublicBanks: _gpb, saveBanks } = require('../../../src/economy/bankStore');
    const pubBank = Object.values(_gpb()).find(b =>
        (b.name || '').toLowerCase() === bankRef || (b.id || '').toLowerCase() === bankRef
    );
    if (!pubBank) return message.reply(`⚠️ **"${bankRef}"** — bank lama helin. \`?bank\` ka eeg liiska.`);
    if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXPIRY_MS)
        return message.reply(`⚠️ **${pubBank.name}** waa la xiray.`);

    // 2% deposit fee → ownerProfit (owner must Claim to receive)
    const feeRate  = 0.02;
    const fee      = Math.max(1, Math.floor(amount * feeRate));
    const credited = amount - fee;

    ec.btc = (ec.btc || 0) - amount;
    pubBank.balance       = (pubBank.balance || 0) + credited;
    pubBank.totalDeposits = (pubBank.totalDeposits || 0) + credited;
    pubBank.lastActivity  = Date.now();
    pubBank.customers     = pubBank.customers || {};
    pubBank.customers[message.author.id] ??= { balance: 0, username: message.author.username, joinedAt: Date.now() };
    pubBank.customers[message.author.id].balance += credited;

    // Accumulate fee as claimable ownerProfit
    pubBank.ownerProfit = (pubBank.ownerProfit || 0) + fee;

    saveBanks();
    saveEcon();
    return message.reply(
        `📥 **${fmtBtc(amount)}** → 🏛️ **${pubBank.name}**\n` +
        `💰 Kaydkaaga: **${fmtBtc(pubBank.customers[message.author.id].balance)}**\n` +
        `💸 Fee: **${fmtBtc(fee)}** (2%) → owner profit`
    );
}

// ── ?w <bank> <amount> — withdraw from any bank ──────
async function withdrawAnyCmd(message, args) {
    if (args.length < 2)
        return message.reply('⚠️ Isticmaal: `?w <bank> <amount>`\nTusaale: `?w garaad 500`  ama  `?w Kormaal Bank 200`');

    const amount  = Math.floor(Number(args[args.length - 1]));
    const bankRef = args.slice(0, -1).join(' ').trim().toLowerCase();
    if (!amount || amount <= 0) return message.reply('⚠️ Xaddad sax ah geli.');

    checkEconUser(message.author.id);
    const ec = econData[message.author.id];

    // Garaad Bank
    if (bankRef === 'garaad' || bankRef === 'garaad bank' || bankRef === 'ebank') {
        if ((ec.banks?.garaad || 0) < amount)
            return message.reply(`⚠️ Garaad Bank kugu filna ma lihid. Haysataa: ${fmtBtc(ec.banks?.garaad || 0)}`);
        ec.banks        = ec.banks || { garaad: 0 };
        ec.banks.garaad -= amount;
        ec.btc           = (ec.btc || 0) + amount;
        saveEcon();
        return message.reply(`📤 **${fmtBtc(amount)}** ← 🏦 **Garaad Bank**\n💰 Bank hadhay: **${fmtBtc(ec.banks.garaad)}**`);
    }

    // Personal banks
    const foundPers = Object.entries(econData).find(([uid, d]) => {
        if (!/^\d{17,19}$/.test(uid) || !d?.personalBank) return false;
        const b = d.personalBank;
        return b.owner.toLowerCase() === bankRef ||
               b.bankId.toLowerCase() === bankRef ||
               b.bankId.toLowerCase().replace(':', '') === bankRef.replace(':', '');
    });
    if (foundPers) {
        const [ownerId, tEc] = foundPers;
        const tBank   = tEc.personalBank;
        const myRec   = tBank.customers?.[message.author.id];
        if (!myRec || (myRec.balance || 0) <= 0)
            return message.reply(`⚠️ **${tBank.owner}**'s bank lacag kuma dhigin.`);
        if (amount > myRec.balance)
            return message.reply(`⚠️ Haysataa: ${fmtBtc(myRec.balance)} kaliya.`);
        const fee    = Math.max(1, Math.floor(amount * 0.02));
        const payout = amount - fee;
        myRec.balance -= amount;
        ec.btc         = (ec.btc || 0) + payout;
        // 2% fee → owner wallet directly
        checkEconUser(ownerId);
        econData[ownerId].btc = (econData[ownerId].btc || 0) + fee;
        addTx(tBank, 'customer_withdraw', amount, `→ ${message.author.username} (2% fee: ${fmtBtc(fee)})`);
        saveEcon();
        return message.reply(
            `📤 **${fmtBtc(payout)}** ← 🏦 **${tBank.owner}**'s Bank\n` +
            `💸 Fee: **${fmtBtc(fee)}** (2%) → owner\n` +
            `💼 Hadhay: **${fmtBtc(myRec.balance)}**`
        );
    }

    // Public banks
    const { saveBanks } = require('../../../src/economy/bankStore');
    const pubBank = Object.values(getAllPublicBanks()).find(b =>
        (b.name || '').toLowerCase() === bankRef ||
        (b.id   || '').toLowerCase() === bankRef ||
        (b.id   || '').toLowerCase().replace(':', '') === bankRef.replace(':', '')
    );
    if (!pubBank) return message.reply(`⚠️ **"${bankRef}"** — bank lama helin. \`?banks\` ka eeg.`);
    const myRec = pubBank.customers?.[message.author.id];
    if (!myRec || (myRec.balance || 0) <= 0)
        return message.reply(`⚠️ **${pubBank.name}** lacag kuma dhigin.`);
    if (amount > myRec.balance)
        return message.reply(`⚠️ Haysataa: ${fmtBtc(myRec.balance)} kaliya.`);
    const wFee    = Math.max(1, Math.floor(amount * 0.02));
    const wPayout = amount - wFee;
    myRec.balance       -= amount;
    pubBank.balance      = Math.max(0, (pubBank.balance || 0) - amount);
    pubBank.ownerProfit  = (pubBank.ownerProfit || 0) + wFee;
    ec.btc               = (ec.btc || 0) + wPayout;
    saveBanks();
    saveEcon();
    return message.reply(
        `📤 **${fmtBtc(wPayout)}** ← 🏛️ **${pubBank.name}**\n` +
        `💸 Fee: **${fmtBtc(wFee)}** (2%) → owner profit\n` +
        `💼 Hadhay: **${fmtBtc(myRec.balance)}**`
    );
}

// ── ?deposit / ?d <bank name> <amount> ───────────────
async function depositAnyCmd(message, args) {
    if (args.length < 2)
        return message.reply('⚠️ Isticmaal: `?deposit <bank> <amount>`\nTusaale: `?d Kormaal Bank 100`  ama  `?d garaad 500`');

    const amount  = Math.floor(Number(args[args.length - 1]));
    const bankRef = args.slice(0, -1).join(' ').trim().toLowerCase();

    if (!amount || amount <= 0)
        return message.reply('⚠️ Xaddad sax ah geli. Tusaale: `?d garaad 500`');

    checkEconUser(message.author.id);
    const ec = econData[message.author.id];

    if ((ec.btc || 0) < amount)
        return message.reply(`⚠️ Jeebkaagu ma filna. Haysataa: ${fmtBtc(ec.btc || 0)}`);

    // Garaad Bank
    if (bankRef === 'garaad' || bankRef === 'garaad bank' || bankRef === 'ebank') {
        ec.banks         = ec.banks || { garaad: 0 };
        ec.banks.garaad  = (ec.banks.garaad || 0) + amount;
        ec.btc           = (ec.btc || 0) - amount;
        saveEcon();
        return message.reply(`📥 **${fmtBtc(amount)}** → 🏦 **Garaad Bank**\n💰 Bank: **${fmtBtc(ec.banks.garaad)}**`);
    }

    // Personal bank
    const foundPers = Object.entries(econData).find(([uid, d]) => {
        if (!/^\d{17,19}$/.test(uid) || !d?.personalBank) return false;
        const b = d.personalBank;
        return b.owner.toLowerCase() === bankRef ||
               b.bankId.toLowerCase() === bankRef ||
               b.bankId.toLowerCase().replace(':', '') === bankRef.replace(':', '');
    });
    if (foundPers) {
        const [tId, tEc] = foundPers;
        if (tId === message.author.id) return message.reply('⚠️ Bank-kaaga laftiis: `?bv` fur.');
        const tBank = tEc.personalBank;
        applyBankProfit(tBank);
        ec.btc = (ec.btc || 0) - amount;
        tBank.customers = tBank.customers || {};
        tBank.customers[message.author.id] ??= { username: message.author.username, balance: 0, depositedAt: Date.now() };
        tBank.customers[message.author.id].balance += amount;
        addTx(tBank, 'customer_deposit', amount, `← ${message.author.username}`);
        saveEcon();
        return message.reply(`📥 **${fmtBtc(amount)}** → 🏦 **${tBank.owner}**'s Bank (\`${tBank.bankId}\`)\n💼 Haysataa: **${fmtBtc(tBank.customers[message.author.id].balance)}**`);
    }

    // Public bank
    const { saveBanks } = require('../../../src/economy/bankStore');
    const pubBank = Object.values(getAllPublicBanks()).find(b =>
        (b.name || '').toLowerCase() === bankRef ||
        (b.id   || '').toLowerCase() === bankRef ||
        (b.id   || '').toLowerCase().replace(':', '') === bankRef.replace(':', '')
    );
    if (!pubBank) return message.reply(`⚠️ **"${bankRef}"** — bank lama helin. \`?banks\` ka eeg liiska.`);
    if ((Date.now() - (pubBank.lastActivity || pubBank.createdAt)) >= PUB_EXPIRY_MS)
        return message.reply(`⚠️ **${pubBank.name}** waa la xiray.`);

    ec.btc = (ec.btc || 0) - amount;
    pubBank.balance       = (pubBank.balance || 0) + amount;
    pubBank.totalDeposits = (pubBank.totalDeposits || 0) + amount;
    pubBank.lastActivity  = Date.now();
    pubBank.customers     = pubBank.customers || {};
    pubBank.customers[message.author.id] ??= { balance: 0, username: message.author.username, joinedAt: Date.now() };
    pubBank.customers[message.author.id].balance += amount;
    saveBanks();
    saveEcon();
    return message.reply(`📥 **${fmtBtc(amount)}** → 🏛️ **${pubBank.name}** (\`${pubBank.id}\`)\n💼 Haysataa: **${fmtBtc(pubBank.customers[message.author.id].balance)}**`);
}

// ── ?banks — dhammaan banks + qiyamkooda ─────────────
async function allBanksCmd(message) {
    const garaadTotal = Object.values(econData)
        .filter(d => d && typeof d === 'object' && !d.__treasury__)
        .reduce((sum, d) => sum + (d.banks?.garaad || 0), 0);

    const pubBanks = Object.values(getAllPublicBanks())
        .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const persBanks = Object.entries(econData)
        .filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank)
        .map(([, d]) => ({ owner: d.personalBank.owner, bankId: d.personalBank.bankId, balance: d.personalBank.balance || 0 }))
        .sort((a, b) => b.balance - a.balance);

    let desc = `🏦 **Garaad Bank** — ${fmtBtc(garaadTotal)}\n`;

    if (pubBanks.length) {
        desc += `\n**🏛️ Public Banks:**\n`;
        desc += pubBanks.map((b, i) =>
            `**${i + 1}.** 🏛️ **${b.name}** · \`${computePubDisplayId(b)}\` · ${fmtBtc(b.balance || 0)}`
        ).join('\n');
    }

    if (persBanks.length) {
        desc += `\n\n**🏦 Personal Banks:**\n`;
        desc += persBanks.map((b, i) =>
            `**${i + 1}.** 🏦 **${b.owner}** · \`${b.bankId}\` · ${fmtBtc(b.balance)}`
        ).join('\n');
    }

    if (!pubBanks.length && !persBanks.length)
        desc += '\n_Wali banks kale ma jiraan._';

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🏦 All Banks — Qiyamkooda')
            .setColor('#2471a3')
            .setDescription(desc)
            .setFooter({ text: `${pubBanks.length} public · ${persBanks.length} personal` })],
    });
}

// ── getBankButtons — bank buttons for ebank panel ─────
function getBankButtons(userId) {
    const pubBanks = Object.values(getAllPublicBanks())
        .filter(b => (Date.now() - (b.lastActivity || b.createdAt)) < PUB_EXPIRY_MS)
        .sort((a, b) => (b.balance || 0) - (a.balance || 0))
        .slice(0, 5);

    const persBanks = Object.entries(econData)
        .filter(([uid, d]) => /^\d{17,19}$/.test(uid) && d?.personalBank)
        .map(([uid, d]) => ({ uid, bank: d.personalBank }))
        .slice(0, 5);

    const allBtns = [
        ...pubBanks.map(b =>
            new ButtonBuilder()
                .setCustomId(`bank_view_pub_${b.id}_${userId}`)
                .setLabel(`🏛 ${b.name.slice(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
        ),
        ...persBanks.map(e =>
            new ButtonBuilder()
                .setCustomId(`bank_view_pers_${e.uid}_${userId}`)
                .setLabel(`🏦 ${e.bank.owner.slice(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
        ),
    ];

    const rows = [];
    for (let i = 0; i < Math.min(allBtns.length, 10); i += 5) {
        rows.push(new ActionRowBuilder().addComponents(allBtns.slice(i, i + 5)));
    }
    return rows;
}

module.exports = {
    bankCreateCmd, bankPasswordCmd, bankViewCmd, bankDirectoryCmd,
    depositAnyCmd, withdrawAnyCmd, allBanksCmd, jbCmd,
    buildBankDirectory, buildPubBankPanel, buildPersBankPanel,
    getBankButtons,
    getTotalCustomerDeposits, applyBankProfit, bankViewRow,
};
