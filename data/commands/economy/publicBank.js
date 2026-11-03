const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../../../src/economy/econStore');
const { userData } = require('../../../src/store');
const {
    getAllPublicBanks, getPublicBank, createPublicBank,
    saveBanks, hashPass, checkPass, namePrefix,
} = require('../../../src/economy/bankStore');

function computeDisplayId(bank) {
    const num = (bank.id || '').replace(/[^0-9]/g, '');
    return `${namePrefix(bank.name)}:${num}`;
}
const { checkRequirements, reqFailMessage } = require('../../../src/utils/requirements');

const CREATE_FEE        = 200_000;
const EXPIRY_MS         = 14 * 24 * 60 * 60 * 1000;
const DEPOSIT_FEE_RATE  = 0.02;   // 2% → owner profit
const WITHDRAW_FEE_RATE = 0.02;   // 2% → owner profit

function fmtCoins(n)   { return `🪙${Math.floor(n || 0).toLocaleString()}`; }
function fmtDate(ts)  { return new Date(ts).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }
function daysLeft(bank) { return Math.max(0, Math.floor((EXPIRY_MS - (Date.now() - (bank.lastActivity || bank.createdAt))) / 86400000)); }
function isExpired(bank) { return (Date.now() - (bank.lastActivity || bank.createdAt)) >= EXPIRY_MS; }

// Accumulate owner profit — owner must click Claim to receive
function creditOwnerProfit(bank, amount) {
    if (!amount || amount <= 0) return;
    bank.ownerProfit = (bank.ownerProfit || 0) + amount;
}

// ── Owner Panel embed + buttons ───────────────────────
function buildOwnerPanel(bank, userId) {
    const custCount = Object.keys(bank.customers || {}).length;
    const profit    = bank.ownerProfit || 0;
    const left      = daysLeft(bank);
    const totalDep  = Object.values(bank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);

    const embed = new EmbedBuilder()
        .setTitle(`👑 ${bank.name} — Owner Panel`)
        .setColor('#f39c12')
        .setDescription(
            profit > 0
                ? `💸 **${fmtCoins(profit)}** profit collected!\n🔘 Click **Claim** to add it to your wallet.`
                : `📊 Weli profit la'aan. Dadka Coins ha ku dhigaan!`
        )
        .addFields(
            { name: '💰 Bank Balance',  value: fmtCoins(bank.balance || 0),     inline: true },
            { name: '👥 Macaamiil',          value: `**${custCount}**`,             inline: true },
            { name: '⏳ Muda Hadhay',        value: `**${left} maalin**`,           inline: true },
            { name: '💸 Faa\'iido Pending', value: `**${fmtCoins(profit)}**`,        inline: true },
            { name: '🏦 Capital ku Shubay', value: fmtCoins(bank.ownerFund || 0),    inline: true },
            { name: '📥 Total Deposits',  value: fmtCoins(totalDep),               inline: true },
        )
        .setFooter({ text: `2% deposit fee + 2% withdraw fee → profit • ID: ${bank.id}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pubbank_claim_${bank.id}_${userId}`)
            .setLabel('💰 Claim Profit')
            .setStyle(ButtonStyle.Success)
            .setDisabled(profit <= 0),
        new ButtonBuilder()
            .setCustomId(`pubbank_fund_btn_${bank.id}_${userId}`)
            .setLabel('🏦 Fund Bank')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`close_ebank_${userId}`)
            .setLabel('✖ Close')
            .setStyle(ButtonStyle.Danger),
    );

    return { embed, components: [row] };
}

// ── ?createbank ───────────────────────────────────────
async function createPublicBankCmd(message, args) {
    checkEconUser(message.author.id);
    const ec = econData[message.author.id];

    const existing = Object.values(getAllPublicBanks()).find(b => b.ownerId === message.author.id);
    if (existing) return message.reply(`⚠️ You already own a bank: **${existing.name}** (\`${existing.id}\`)`);

    const { allMet, results } = checkRequirements(userData, econData, message.author.id, 'bank');
    if (!allMet) return message.reply(reqFailMessage(results, 'bank'));

    if ((ec.coins || 0) < CREATE_FEE)
        return message.reply(`⚠️ You need **${fmtCoins(CREATE_FEE)} Coins** to open a bank. Your balance: ${fmtCoins(ec.coins || 0)}`);

    const name = args.join(' ').trim();
    if (!name || name.length < 3) return message.reply('⚠️ Usage: `?createbank <Bank Name>`\nExample: `?createbank Hormuud Bank`');
    if (name.length > 30) return message.reply('⚠️ The bank name is too long (maximum 30 characters).');

    ec.coins -= CREATE_FEE;
    const { addToTreasury } = require('../../../src/economy/econStore');
    addToTreasury(CREATE_FEE);
    const bank = createPublicBank(message.author.id, message.author.username, name);
    bank.lastActivity = Date.now();
    bank.ownerProfit  = 0;
    bank.ownerFund    = 0;
    saveBanks();
    saveEcon();

    return message.reply(
        `🏛️ **${bank.name}** la createtay!\n\n` +
        `🆔 **Bank ID:** \`${bank.id}\`\n` +
        `👤 **Owner:** ${message.author.username}\n` +
        `💸 **Kharash:** ${fmtCoins(CREATE_FEE)} (Treasury u tagay)\n` +
        `📈 **Faa'iidada:** 2% marka la deposit + 2% marka la withdraw\n` +
        `⏳ **Mudada:** 2 toddobaad — nowan shaqo lahayn wuu closemaa\n\n` +
        `💡 \`?bankfund ${bank.id} <xadad>\` — Deposit Coins into the bank\n` +
        `📌 Players can deposit Coins with: \`?bank\``
    );
}

// ── ?banks ────────────────────────────────────────────
async function listPublicBanksCmd(message) {
    const all = Object.values(getAllPublicBanks()).sort((a, b) => (b.balance || 0) - (a.balance || 0));
    if (!all.length) return message.reply('📭 No public banks have been created yet. Use `?createbank <name>` to start one.');

    const lines = all.slice(0, 10).map((b, i) =>
        `**${i + 1}.** 🏛️ **${b.name}** (\`${computeDisplayId(b)}\`)\n` +
        `   👤 ${b.ownerUsername} · 💰 ${fmtCoins(b.balance)} · ⭐ ${b.reputation || 0} rep`
    );

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🏛️ Public Banks')
            .setColor('#3498db')
            .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'Use ?bankinfo <ID> to view details' })],
    });
}

// ── ?bankinfo <id> ────────────────────────────────────
async function bankInfoCmd(message, args) {
    const id   = (args[0] || '').toUpperCase();
    const bank = getPublicBank(id);
    if (!bank) return message.reply(`⚠️ Bank \`${id}\` not found. \`?banks\` View it with that command.`);

    const custCount = Object.keys(bank.customers || {}).length;
    const isOwner   = bank.ownerId === message.author.id;
    const myRec     = bank.customers?.[message.author.id];
    const myBal     = myRec ? myRec.balance || 0 : 0;

    const dId = computeDisplayId(bank);

    const baseDesc =
        `🆔 **ID:** \`${dId}\`\n` +
        `👤 **Owner:** ${bank.ownerUsername}\n` +
        `📅 **La createtay:** ${fmtDate(bank.createdAt)}\n\n` +
        `💰 **Balance bangi:** ${fmtCoins(bank.balance)}\n` +
        `👥 **Macaamiisha:** ${custCount}\n` +
        `⭐ **Reputation:** ${bank.reputation || 0}\n` +
        `📥 **Total deposits:** ${fmtCoins(bank.totalDeposits || 0)}\n` +
        (myBal > 0 ? `💼 **Adigu you have:** ${fmtCoins(myBal)}\n` : '');

    const ownerPanel = isOwner
        ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👑 **OWNER PANEL** — \`?owner\` use\n\n` +
          `💸 **Profit la Helay:** ${fmtCoins(bank.ownerProfit || 0)}\n` +
          `  └ 2% deposit + 2% withdraw\n` +
          `🏦 **Coins Aad Ku Shubday:** ${fmtCoins(bank.ownerFund || 0)}\n` +
          `📤 **Si Coins Ku Shubi:** \`?owner fund <xadad>\`\n`
        : '';

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`🏛️ ${bank.name}`)
            .setColor(isOwner ? '#f39c12' : '#3498db')
            .setDescription(baseDesc + ownerPanel)
            .setFooter({ text: `?d ${bank.name} <amount>  |  ?w ${bank.name} <amount>  •  ID: ${dId}` })],
    });
}

// ── ?bankdeposit <id> <amount> ────────────────────────
async function bankDepositCmd(message, args) {
    const id     = (args[0] || '').toUpperCase();
    const amount = Math.floor(Number(args[1]));
    const bank   = getPublicBank(id);
    if (!bank)   return message.reply(`⚠️ Bank \`${id}\` not found.`);
    if (!amount || amount <= 0) return message.reply('⚠️ Usage: `?bankdeposit <ID> <amount>`');

    checkEconUser(message.author.id);
    const ec = econData[message.author.id];
    if ((ec.coins || 0) < amount) return message.reply(`⚠️ Your wallet has insufficient Coins. You have: ${fmtCoins(ec.coins || 0)}`);

    if (isExpired(bank)) return message.reply(`⚠️ **${bank.name}** was closed after two weeks of inactivity.`);

    const isOwner = bank.ownerId === message.author.id;

    ec.coins             -= amount;
    bank.balance       += amount;
    bank.totalDeposits  = (bank.totalDeposits || 0) + amount;
    bank.reputation     = Math.floor((bank.reputation || 0) + amount / 10000);
    bank.lastActivity   = Date.now();

    if (isOwner) {
        // Owner funding — tracked separately, no fee
        bank.ownerFund = (bank.ownerFund || 0) + amount;
    } else {
        // Customer deposit — 2% fee to owner, credited instantly
        const fee = Math.floor(amount * DEPOSIT_FEE_RATE);
        if (fee > 0) {
            creditOwnerProfit(bank, fee);
        }

        bank.customers      = bank.customers || {};
        bank.customers[message.author.id] = bank.customers[message.author.id] || {
            balance: 0, username: message.author.username, joinedAt: Date.now()
        };
        bank.customers[message.author.id].balance += amount;
    }

    saveBanks();
    saveEcon();

    const left        = daysLeft(bank);
    const warningLine = left <= 3 ? `\n⚠️ Bank wuxuu closemaa **${left} maalin** gudahood!` : '';
    const feeNote     = isOwner ? `\n🏦 Capital added.` : `\n💸 Profit owner-ka: ${fmtCoins(Math.floor(amount * DEPOSIT_FEE_RATE))}`;

    return message.reply(
        `📥 **${fmtCoins(amount)}** → 🏛️ **${bank.name}**\n` +
        `💰 Bank balance: ${fmtCoins(bank.balance)}${feeNote}${warningLine}`
    );
}

// ── ?bankwithdraw <id> <amount> ───────────────────────
async function bankWithdrawCmd(message, args) {
    const id     = (args[0] || '').toUpperCase();
    const amount = Math.floor(Number(args[1]));
    const pw     = args[2];
    const bank   = getPublicBank(id);

    if (!bank)   return message.reply(`⚠️ Bank \`${id}\` not found.`);
    if (!amount || amount <= 0) return message.reply('⚠️ Usage: `?bankwithdraw <ID> <amount>`');

    const isOwner = bank.ownerId === message.author.id;

    if (!isOwner) return message.reply('⚠️ Only the bank owner can withdraw from this bank.');

    if (bank.passwordHash) {
        if (!pw) return message.reply('🔐 Enter the bank password.');
        if (!checkPass(pw, bank.passwordHash)) return message.reply('❌ Incorrect password.');
        try { await message.delete(); } catch {}
    }

    if (amount > bank.balance) return message.reply(`⚠️ Insufficient bank Coins. Balance: ${fmtCoins(bank.balance)}`);

    bank.balance -= amount;
    checkEconUser(message.author.id);
    econData[message.author.id].coins = (econData[message.author.id].coins || 0) + amount;

    saveBanks();
    saveEcon();
    return message.reply(
        `📤 **${fmtCoins(amount)}** 🏛️ **${bank.name}** → your wallet\n` +
        `💰 Bank balance: ${fmtCoins(bank.balance)}`
    );
}

// ── ?bankfund [id] [amount] — Owner panel / add capital ──
async function bankFundCmd(message, args) {
    checkEconUser(message.author.id);

    // No args: auto-find owner's bank and show panel
    if (!args[0]) {
        const ownBank = Object.values(getAllPublicBanks()).find(b => b.ownerId === message.author.id);
        if (!ownBank) return message.reply('⚠️ You do not own a public bank. Use `?createbank <name>` to start one.');
        const { embed, components } = buildOwnerPanel(ownBank, message.author.id);
        return message.reply({ embeds: [embed], components });
    }

    const id   = args[0].toUpperCase();
    const bank = getPublicBank(id);

    if (!bank) return message.reply(`⚠️ Bank \`${id}\` was not found. Use \`?bankfund\` without arguments to view your bank.`);
    if (bank.ownerId !== message.author.id) return message.reply('⚠️ Only the bank owner can add capital.');

    // ID only, no amount: show panel
    const amount = Math.floor(Number(args[1]));
    if (!amount || amount <= 0) {
        const { embed, components } = buildOwnerPanel(bank, message.author.id);
        return message.reply({ embeds: [embed], components });
    }

    const ec = econData[message.author.id];
    if ((ec.coins || 0) < amount) return message.reply(`⚠️ Your wallet has insufficient Coins. You have: ${fmtCoins(ec.coins || 0)}`);
    if (isExpired(bank)) return message.reply(`⚠️ **${bank.name}** was closed.`);

    ec.coins            -= amount;
    bank.balance      += amount;
    bank.ownerFund     = (bank.ownerFund || 0) + amount;
    bank.lastActivity  = Date.now();
    saveBanks();
    saveEcon();

    const { embed, components } = buildOwnerPanel(bank, message.author.id);
    return message.reply({
        content: `✅ Added **${fmtCoins(amount)}** to the bank's capital!`,
        embeds: [embed],
        components,
    });
}

// ── ?bankpassword <id> <password> ─────────────────────
async function bankPasswordCmd(message, args) {
    const id   = (args[0] || '').toUpperCase();
    const pw   = args[1];
    const bank = getPublicBank(id);
    if (!bank) return message.reply(`⚠️ Bank \`${id}\` not found.`);
    if (bank.ownerId !== message.author.id) return message.reply('⚠️ Only the bank owner can set a password.');
    if (!pw || pw.length < 4) return message.reply('⚠️ Passwords must be at least 4 characters. `?bankpassword <ID> <password>`');

    bank.passwordHash = hashPass(pw);
    saveBanks();
    try { await message.delete(); } catch {}
    return message.channel.send(`✅ <@${message.author.id}> 🏛️ **${bank.name}** password waa la dhigay.`);
}

// ── ?topbanks ─────────────────────────────────────────
async function topBanksCmd(message) {
    const all = Object.values(getAllPublicBanks())
        .filter(b => !isExpired(b))
        .sort((a, b) => (b.balance || 0) - (a.balance || 0))
        .slice(0, 10);
    if (!all.length) return message.reply('📭 No active banks were found.');
    const MEDALS = ['🥇','🥈','🥉'];
    const lines = all.map((b, i) => {
        const left      = daysLeft(b);
        const warning   = left <= 3 ? ` ⚠️ ${left}d` : '';
        const custCount = Object.keys(b.customers || {}).length;
        const medal     = MEDALS[i] || `**${i + 1}.**`;
        return `${medal} 🏛️ **${b.name}**${warning}\n` +
               `   👤 ${b.ownerUsername} · 💰 ${fmtCoins(b.balance)} · 👥 ${custCount} macaamiil · ⭐ ${b.reputation || 0}`;
    });
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🏆 Top Public Banks')
            .setColor('#f39c12')
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: '⚠️ = bank closes soon • 2 weeks of inactivity = closure' })],
    });
}

// ── Bank expiry check + refund ────────────────────────
async function checkAndCloseExpiredBanks(client) {
    const { addToTreasury } = require('../../../src/economy/econStore');
    const allBanks = getAllPublicBanks();
    let closed = 0;

    for (const [bankId, bank] of Object.entries(allBanks)) {
        if (!isExpired(bank)) continue;

        for (const [custId, cust] of Object.entries(bank.customers || {})) {
            if (!cust.balance || cust.balance <= 0) continue;
            checkEconUser(custId);
            econData[custId].coins = (econData[custId].coins || 0) + cust.balance;
            try {
                const u = await client.users.fetch(custId);
                await u.send({ embeds: [new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setDescription(
                        `🏛️ **${bank.name}** was closed (2 toddobaad shaqo la'aan).\n` +
                        `✅ **${fmtCoins(cust.balance)}** was refunded to your wallet.`
                    )
                ]}).catch(() => {});
            } catch {}
        }

        delete allBanks[bankId];
        closed++;
    }

    if (closed > 0) { saveBanks(); saveEcon(); }
    return closed;
}

// ── ?owner — Bank owner management panel ─────────────
async function bankOwnerCmd(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);

    const bank = Object.values(getAllPublicBanks()).find(b => b.ownerId === userId);
    if (!bank) {
        return message.reply(
            '⚠️ You do not have a personal bank.\n' +
            '`?createbank <magac>` use si aad bank u createto.'
        );
    }

    const sub = (args[0] || '').toLowerCase();

    // ?owner rename <new name>
    if (sub === 'rename' || sub === 'magac') {
        const newName = args.slice(1).join(' ').trim();
        if (!newName || newName.length < 3)
            return message.reply('⚠️ Usage: `?owner rename <new name>`\nExample: `?owner rename Hormuud Bank`');
        if (newName.length > 30)
            return message.reply('⚠️ The name is too long. Maximum 30 characters.');
        const oldName = bank.name;
        bank.name = newName;
        saveBanks();
        return message.reply(
            `✅ Bank name updated!\n` +
            `📝 **${oldName}** → **${newName}**\n` +
            `🆔 ID cusub: \`${computeDisplayId(bank)}\``
        );
    }

    // ?owner pass <new password>
    if (sub === 'pass' || sub === 'password' || sub === 'furaha') {
        const pw = args[1];
        if (!pw)
            return message.reply('⚠️ Usage: `?owner pass <password>`\nExample: `?owner pass sirta123`');
        bank.passwordHash = hashPass(pw);
        saveBanks();
        return message.reply('✅ Bank password updated. 🔐');
    }

    // ?owner claim → claim profits
    if (sub === 'claim' || sub === 'claim') {
        const profit = bank.ownerProfit || 0;
        if (profit <= 0)
        return message.reply('⚠️ There is no profit to claim yet. Wait for customers to deposit Coins.');
        checkEconUser(userId);
        econData[userId].coins   = (econData[userId].coins || 0) + profit;
        trackEarning(userId, profit);
        bank.ownerProfit = 0;
        saveBanks();
        saveEcon();
        return message.reply(
            `💰 **${fmtCoins(profit)}** your wallet u galay!\n` +
            `💼 You have: **${fmtCoins(econData[userId].coins)}**`
        );
    }

    // ?owner fund <amount>
    if (sub === 'fund' || sub === 'shub') {
        return bankFundCmd(message, [bank.id, ...args.slice(1)]);
    }

    // ?owner (no args) → show management panel
    const dId       = computeDisplayId(bank);
    const profit    = bank.ownerProfit || 0;
    const custCount = Object.keys(bank.customers || {}).length;
    const totalDep  = Object.values(bank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
    const left      = daysLeft(bank);

    const embed = new EmbedBuilder()
        .setTitle(`👑 ${bank.name} — Owner Panel`)
        .setColor('#f39c12')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `**🛠️ MANAGEMENT COMMANDS**\n\n` +
            `\`?owner rename <magac>\` — Bank magac bedel\n` +
            `\`?owner pass <password>\` — Furaha bedel\n` +
            `\`?owner fund <xadad>\` — Coins ku shub\n` +
            `\`?owner claim\` — Profit claim\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .addFields(
            { name: '🆔 Bank ID',           value: `\`${dId}\``,          inline: true },
            { name: '💰 Balance',           value: fmtCoins(bank.balance), inline: true },
            { name: '👥 Macaamiil',          value: `**${custCount}**`,   inline: true },
            { name: '💸 Faa\'iido Pending',  value: fmtCoins(profit),       inline: true },
            { name: '📥 Total Deposits',   value: fmtCoins(totalDep),     inline: true },
            { name: '⏳ Muda Hadhay',        value: `**${left} maalin**`, inline: true },
        )
        .setFooter({ text: `2% deposit + 2% withdraw → profit • ID: ${dId}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pubbank_claim_${bank.id}_${userId}`)
        .setLabel('💰 Claim Profit')
            .setStyle(ButtonStyle.Success)
            .setDisabled(profit <= 0),
        new ButtonBuilder()
            .setCustomId(`pubbank_fund_btn_${bank.id}_${userId}`)
            .setLabel('🏦 Fund Bank')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`pubbank_close_btn_${bank.id}_${userId}`)
            .setLabel('🔴 Close Bank')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`close_ebank_${userId}`)
            .setLabel('✖ Close')
            .setStyle(ButtonStyle.Secondary),
    );

    return message.reply({ embeds: [embed], components: [row] });
}

// ── Close confirmation panel (shared by cmd + button) ─
function buildCloseConfirmPanel(bank, userId) {
    const custCount = Object.keys(bank.customers || {}).length;
    const refundTotal = Object.values(bank.customers || {}).reduce((s, c) => s + (c.balance || 0), 0);
    const profit = bank.ownerProfit || 0;
    const embed = new EmbedBuilder()
        .setTitle('🔴 Close Bank — Confirm')
        .setColor('#e74c3c')
        .setDescription(
            `⚠️ **Hubin:** Bank **${bank.name}** will be permanently closed!\n\n` +
            `Tani waxay macnaheedahay:\n` +
            `• 👥 **${custCount}** macaamiil waxaa loo celin Coinstooda\n` +
            `• 💸 Faa'iidadaada **${fmtCoins(profit)}** your wallet u tegi\n` +
            `• 🗑️ Bank all data will be deleted\n\n` +
            `**Ma hubtaa?**`
        )
        .addFields(
            { name: '💰 Coins La Celin',  value: fmtCoins(refundTotal), inline: true },
            { name: '💸 Faa\'iidadaada',  value: fmtCoins(profit),      inline: true },
            { name: '👥 Macaamiil',       value: `**${custCount}**`,  inline: true },
        )
        .setFooter({ text: 'This action cannot be undone!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pubbank_close_confirm_${bank.id}_${userId}`)
            .setLabel('✅ Yes, Close Bank')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`close_ebank_${userId}`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary),
    );
    return { embed, components: [row] };
}

// ── ?bankclose — owner closes their bank ─────────────
async function bankCloseCmd(message) {
    const userId = message.author.id;
    checkEconUser(userId);
    const bank = Object.values(getAllPublicBanks()).find(b => b.ownerId === userId);
    if (!bank) return message.reply('⚠️ You do not have a personal bank.');
    const { embed, components } = buildCloseConfirmPanel(bank, userId);
    return message.reply({ embeds: [embed], components });
}

// ── ?bankhistory <id> ─────────────────────────────────
async function bankHistoryCmd(message, args) {
    const ref  = (args[0] || '').toUpperCase();
    if (!ref) return message.reply('⚠️ Usage: `?bankhistory <bank ID or name>`');

    const bank = getPublicBank(ref)
        || Object.values(getAllPublicBanks()).find(b =>
            (b.name || '').toLowerCase() === args.join(' ').trim().toLowerCase()
        );
    if (!bank) return message.reply(`⚠️ Bank **"${args.join(' ')}"** not found. \`?banks\` View it with that command.`);

    const txs = (bank.transactions || []).slice(0, 10);
    const dId = computeDisplayId(bank);

    const TYPE_ICON = {
        deposit:           '📥',
        withdraw:          '📤',
        profit:            '💹',
        customer_deposit:  '👥📥',
        customer_withdraw: '👥📤',
        transfer:          '↔️',
        received:          '↔️',
        fund:              '🏦',
    };

    const lines = txs.length
        ? txs.map((tx, i) => {
            const icon  = TYPE_ICON[tx.type] || '🔹';
            const sign  = tx.type.includes('withdraw') ? '−' : '+';
            const date  = new Date(tx.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const note  = tx.note ? ` · _${tx.note}_` : '';
            return `**${i + 1}.** ${icon} \`${sign}${fmtCoins(tx.amount)}\`${note}\n   ⏰ ${date}`;
        }).join('\n\n')
        : '_Weli transaction was not found._';

    const isOwner   = bank.ownerId === message.author.id;
    const custCount = Object.keys(bank.customers || {}).length;

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`📋 ${bank.name} — Coin History`)
            .setColor(isOwner ? '#f39c12' : '#3498db')
            .setDescription(lines)
            .addFields(
                { name: '🆔 Bank ID',    value: `\`${dId}\``,          inline: true },
                { name: '💰 Balance',   value: fmtCoins(bank.balance),  inline: true },
                { name: '👥 Macaamiil',  value: `**${custCount}**`,    inline: true },
            )
            .setFooter({ text: `Latest 10 transactions · ?bankhistory ${dId}` })
        ],
    });
}

module.exports = {
    createPublicBankCmd, listPublicBanksCmd, bankInfoCmd,
    bankDepositCmd, bankWithdrawCmd, bankPasswordCmd, topBanksCmd,
    bankFundCmd, bankOwnerCmd, bankHistoryCmd, checkAndCloseExpiredBanks,
    buildOwnerPanel, buildCloseConfirmPanel,
    bankCloseCmd,
    DEPOSIT_FEE_RATE, WITHDRAW_FEE_RATE, creditOwnerProfit,
};
