// =====================================================================
// ADMIN: Bank Management
// - adminbankpw @user       → Reset personal bank password
// - adminbanktax <id> <%>   → Tax public bank depositors
// - adminbankclose <id>     → Force close a public bank + refund
// - adminbankview @user     → View user's personal bank info
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon, addToTreasury } = require('../../../src/economy/econStore');
const { userData }     = require('../../../src/store');
const { getAllPublicBanks, getPublicBank, saveBanks } = require('../../../src/economy/bankStore');

function fmtBtc(n) { return `₿${Math.floor(n || 0).toLocaleString()}`; }

module.exports = async function adminBankCmd(message, args) {
    const sub = (args[0] || '').toLowerCase();

    // ── adminbankpw @user → reset/show personal bank info ──
    if (sub === 'pw' || sub === 'password') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('⚠️ `?adminbank pw @user`');
        checkEconUser(target.id);
        const ec   = econData[target.id];
        const bank = ec.personalBank;
        if (!bank) return message.reply(`⚠️ **${target.username}** personal bank ma laha.`);

        // Reset password
        bank.passwordHash = null;
        saveEcon();
        return message.reply({ embeds: [new EmbedBuilder()
            .setColor('#27ae60')
            .setTitle('🔐 Admin — Bank Password Reset')
            .setDescription(
                `✅ **${target.username}** personal bank password la tirtiray.\n\n` +
                `🏦 **Bank ID:** \`${bank.bankId}\`\n` +
                `💰 **Balance:** ${fmtBtc(bank.balance)}\n\n` +
                `User-ku hadda password la'aantood bixin karaa.\n` +
                `Password cusub ku dhig: \`?bp <password>\``
            )
        ]});
    }

    // ── adminbankview @user → view personal bank ──
    if (sub === 'view') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('⚠️ `?adminbank view @user`');
        checkEconUser(target.id);
        const ec   = econData[target.id];
        const bank = ec.personalBank;
        if (!bank) return message.reply(`⚠️ **${target.username}** personal bank ma laha.`);

        const txLines = (bank.transactions || []).slice(0, 5).map(t =>
            `${t.type === 'deposit' ? '📥' : '📤'} **${t.type}** ${fmtBtc(t.amount)} (${new Date(t.at).toLocaleDateString()})`
        );
        return message.reply({ embeds: [new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`🏦 ${target.username} — Personal Bank`)
            .setDescription(
                `💰 **Balance:** ${fmtBtc(bank.balance)}\n` +
                `🔐 **Password:** ${bank.passwordHash ? 'Haa (set)' : 'Maya (no password)'}\n` +
                `📥 **Total In:** ${fmtBtc(bank.deposits)}\n` +
                `📤 **Total Out:** ${fmtBtc(bank.withdrawals)}\n\n` +
                (txLines.length ? `**Transactions dambe:**\n${txLines.join('\n')}` : '_Transactions ma jiraan_')
            )
        ]});
    }

    // ── adminbanktax <bankID> <percent> → tax depositors ──
    if (sub === 'tax') {
        const bankId  = (args[1] || '').toUpperCase();
        const pct     = parseFloat(args[2]);
        const bank    = getPublicBank(bankId);
        if (!bank)    return message.reply(`⚠️ Bank \`${bankId}\` lama helin. \`?adminbank tax <ID> <percent>\``);
        if (isNaN(pct) || pct <= 0 || pct > 50) return message.reply('⚠️ Percent 1–50 ah geli. Tusaale: `?adminbank tax ABC123 5`');

        let totalTax = 0;
        let count    = 0;
        for (const [custId, cust] of Object.entries(bank.customers || {})) {
            if (!cust.balance || cust.balance <= 0) continue;
            const tax = Math.floor(cust.balance * (pct / 100));
            if (tax <= 0) continue;
            cust.balance      -= tax;
            bank.balance      -= tax;
            totalTax          += tax;
            count++;
        }
        if (totalTax > 0) { addToTreasury(totalTax); saveEcon(); saveBanks(); }

        return message.reply({ embeds: [new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`💸 Admin Tax — ${bank.name}`)
            .setDescription(
                `✅ **${pct}% tax** la qaatay ${count} macaamiil\n` +
                `💰 **Wadarta la qaatay:** ${fmtBtc(totalTax)}\n` +
                `🏛️ **Treasury waxaa lagu daray:** ${fmtBtc(totalTax)}`
            )
        ]});
    }

    // ── adminbankclose <bankID> → force close + refund ──
    if (sub === 'close') {
        const bankId = (args[1] || '').toUpperCase();
        const allBanks = getAllPublicBanks();
        const bank   = allBanks[bankId];
        if (!bank)   return message.reply(`⚠️ Bank \`${bankId}\` lama helin.`);

        let refunded = 0;
        for (const [custId, cust] of Object.entries(bank.customers || {})) {
            if (!cust.balance || cust.balance <= 0) continue;
            checkEconUser(custId);
            econData[custId].btc = (econData[custId].btc || 0) + cust.balance;
            refunded += cust.balance;
            try {
                const u = await message.client.users.fetch(custId);
                await u.send({ embeds: [new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setDescription(
                        `🏛️ **${bank.name}** admin ayaa la xiray.\n` +
                        `✅ **${fmtBtc(cust.balance)}** jeebkaaga ayaa loo celiyay.`
                    )
                ]}).catch(() => {});
            } catch {}
        }

        const bankName = bank.name;
        delete allBanks[bankId];
        saveBanks(); saveEcon();

        return message.reply({ embeds: [new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle(`🏛️ Bank Closed — ${bankName}`)
            .setDescription(
                `✅ **${bankName}** (\`${bankId}\`) la xiray.\n` +
                `💰 **Lacagta macaamiisha loo celiyay:** ${fmtBtc(refunded)}`
            )
        ]});
    }

    // ── adminbank rename <oldID> <newID> → rename bank ID ──
    if (sub === 'rename') {
        const oldId = (args[1] || '').trim();
        const newId = (args[2] || '').trim();
        if (!oldId || !newId)
            return message.reply('⚠️ `?adminbank rename <oldID> <newID>`\nTusaale: `?adminbank rename GB-72957 KB:72957`');

        const allBanks = getAllPublicBanks();
        const bank     = allBanks[oldId] || allBanks[oldId.toUpperCase()];
        const resolvedOld = allBanks[oldId] ? oldId : oldId.toUpperCase();

        if (!bank) return message.reply(`⚠️ Bank \`${oldId}\` lama helin.`);
        if (allBanks[newId]) return message.reply(`⚠️ ID \`${newId}\` horay u jirtaa.`);

        // Copy to new key, update internal id, delete old key
        allBanks[newId]    = { ...bank, id: newId };
        delete allBanks[resolvedOld];
        saveBanks();

        return message.reply(
            `✅ Bank ID waa la beddelay!\n` +
            `🔄 **${bank.name}:** \`${resolvedOld}\` → \`${newId}\``
        );
    }

    // ── adminbank migrate → rename all GB- banks to name-based IDs ──
    if (sub === 'migrate') {
        const { namePrefix } = require('../../../src/economy/bankStore');
        const allBanks = getAllPublicBanks();
        const oldKeys  = Object.keys(allBanks).filter(k => k.startsWith('GB-'));
        if (!oldKeys.length) return message.reply('✅ Migrate gareynta ma baahna — banks cusub ID-yo cusub leeyihiin.');

        const changes = [];
        for (const oldId of oldKeys) {
            const bank  = allBanks[oldId];
            const prefix = namePrefix(bank.name || 'GB');
            const n      = Math.floor(Math.random() * 90000) + 10000;
            let   newId  = `${prefix}:${n}`;
            while (allBanks[newId]) newId = `${prefix}:${Math.floor(Math.random() * 90000) + 10000}`;
            allBanks[newId] = { ...bank, id: newId };
            delete allBanks[oldId];
            changes.push(`\`${oldId}\` → \`${newId}\` (${bank.name})`);
        }
        saveBanks();
        return message.reply(`✅ **${changes.length} bank** migrate la sameeyay:\n${changes.join('\n')}`);
    }

    // Default: show help
    return message.reply({ embeds: [new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🏦 Admin Bank Commands')
        .setDescription(
            `\`?adminbank pw @user\` — Personal bank password reset\n` +
            `\`?adminbank view @user\` — Personal bank xog eeg\n` +
            `\`?adminbank tax <ID> <percent>\` — Macaamiisha tax qaado\n` +
            `\`?adminbank close <ID>\` — Bank xir + lacag celi\n` +
            `\`?adminbank rename <oldID> <newID>\` — Bank ID bedel\n` +
            `\`?adminbank migrate\` — GB-XXXXX → name-based IDs`
        )
    ]});
};
