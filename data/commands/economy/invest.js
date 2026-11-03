const { EmbedBuilder } = require('discord.js');
const { econData, checkEconUser, saveEcon } = require('../../../src/economy/econStore');
const { fmt } = require('../../../src/utils/helpers');

// ── Config ──────────────────────────────────────────────────────────
const MIN_INVEST   = 100;
const MAX_INVEST   = 500_000;
const COOLDOWN_MS  = 6 * 60 * 60 * 1000; // 6 hours

const PLANS = {
    1000:  { label: '🌱 Basic',   minHours: 1,  maxHours: 3,  minRate: 0.08, maxRate: 0.18, defaultAmt: 1000  },
    5000:  { label: '📈 Standard',minHours: 3,  maxHours: 8,  minRate: 0.15, maxRate: 0.35, defaultAmt: 5000  },
    10000: { label: '🚀 Premium', minHours: 8,  maxHours: 24, minRate: 0.25, maxRate: 0.60, defaultAmt: 10000 },
};

const investCooldowns = new Map();

function getInvestData(d) {
    d.investments = d.investments || [];
    return d.investments;
}

function buildHelpEmbed() {
    return new EmbedBuilder()
        .setTitle('📊 Garaad Invest')
        .setColor('#3498db')
        .setDescription(
            '💡 **Invest Coins to earn a return!**\n\n' +
            '**Plans:**\n' +
            '`?invest 1000` — 🌱 Basic (1–3 hours) · +8%–18%\n' +
            '`?invest 5000` — 📈 Standard (3–8 hours) · +15%–35%\n' +
            '`?invest 10000` — 🚀 Premium (8–24 hours) · +25%–60%\n\n' +
            '`?invest` — View your investments\n' +
            `💰 Minimum: **🪙${MIN_INVEST.toLocaleString()}** · Maximum: **🪙${MAX_INVEST.toLocaleString()}**`
        )
        .setFooter({ text: 'Garaad Economy • Invest si caqli leh!' });
}

module.exports = async function investCmd(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];
    const investments = getInvestData(d);
    const now = Date.now();

    // ?invest — daawo invest-kaaga socda
    if (!args || args.length === 0 || args[0] === 'daawo') {
        const active = investments.filter(inv => now < inv.readyAt);
        const ready  = investments.filter(inv => now >= inv.readyAt && !inv.claimed);

        if (active.length === 0 && ready.length === 0) {
            return message.reply({ embeds: [buildHelpEmbed()] });
        }

        const lines = [];
        for (const inv of ready) {
            lines.push(`✅ **${inv.planLabel}** — 🪙${fmt(inv.amount)} → **🪙${fmt(inv.payout)}** — Ready to collect: \`?invest collect\``);
        }
        for (const inv of active) {
            const left = Math.ceil((inv.readyAt - now) / 60000);
            const hrs  = Math.floor(left / 60);
            const mins = left % 60;
            lines.push(`⏳ **${inv.planLabel}** — 🪙${fmt(inv.amount)} → **🪙${fmt(inv.payout)}** — ${hrs > 0 ? `${hrs}h ` : ''}${mins}m remaining`);
        }

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('📊 Your Investments')
            .setColor('#3498db')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Garaad Economy • Use ?invest collect to claim your Coins' })] });
    }

    // ?invest collect — Coins diyaarka ah claim
    if (args[0] === 'collect' || args[0] === 'claim') {
        const readyInvs = investments.filter(inv => now >= inv.readyAt && !inv.claimed);
        if (readyInvs.length === 0)
            return message.reply('⚠️ You have no investments ready to collect. Use `?invest` to view your investments.');

        let total = 0;
        for (const inv of readyInvs) {
            inv.claimed = true;
            total += inv.payout;
        }
        d.coins = (d.coins || 0) + total;
        // Clean up old claimed investments
        d.investments = investments.filter(inv => !inv.claimed || (now - inv.readyAt) < 24 * 60 * 60 * 1000);
        saveEcon();

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('💰 Investment Collected!')
            .setColor('#2ecc71')
            .setDescription(
                `✅ Collected **${readyInvs.length} investment(s)**.\n\n` +
                `💰 **Coins received:** 🪙${fmt(total)}\n` +
                `👛 **Wallet:** 🪙${fmt(d.coins)}`
            )
            .setFooter({ text: 'Garaad Economy • Start another investment with ?invest' })] });
    }

    // ?invest <amount> — amount determines the plan
    const amount = parseInt(args[0], 10);
    if (!amount || isNaN(amount) || amount < MIN_INVEST)
        return message.reply({ embeds: [buildHelpEmbed()] });
    if (amount > MAX_INVEST)
        return message.reply(`⚠️ The maximum investment is **🪙${MAX_INVEST.toLocaleString()}**.`);

    // Pick plan based on amount
    let planKey = '1000';
    if (amount >= 10000) planKey = '10000';
    else if (amount >= 5000) planKey = '5000';
    const plan = PLANS[planKey];
    if ((d.coins || 0) < amount)
        return message.reply(`⚠️ You do not have enough Coins. Wallet: **🪙${fmt(d.coins || 0)}**`);

    // Cooldown check
    const lastInvest = investCooldowns.get(userId) || 0;
    if (now - lastInvest < COOLDOWN_MS) {
        const left = Math.ceil((COOLDOWN_MS - (now - lastInvest)) / 60000);
        const hrs  = Math.floor(left / 60);
        const mins = left % 60;
        return message.reply(`⏳ Investment cooldown: wait **${hrs > 0 ? `${hrs}h ` : ''}${mins}m** before investing again.`);
    }

    // Calculate payout
    const rate    = plan.minRate + Math.random() * (plan.maxRate - plan.minRate);
    const profit  = Math.floor(amount * rate);
    const payout  = amount + profit;
    const hours   = plan.minHours + Math.random() * (plan.maxHours - plan.minHours);
    const readyAt = now + Math.floor(hours * 60 * 60 * 1000);
    const hrsDisp = Math.floor(hours);
    const minsDisp = Math.round((hours - hrsDisp) * 60);

    // Deduct Coins
    d.coins = (d.coins || 0) - amount;
    d.investments = d.investments || [];
    d.investments.push({ planKey, planLabel: plan.label, amount, payout, profit, readyAt, claimed: false });
    investCooldowns.set(userId, now);
    saveEcon();

    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle(`${plan.label} Investment Started! ✅`)
        .setColor('#f39c12')
        .setDescription(
            `💰 **Invested:** 🪙${fmt(amount)}\n` +
            `📈 **Expected profit:** +🪙${fmt(profit)} (+${(rate * 100).toFixed(1)}%)\n` +
            `🏆 **Total payout:** 🪙${fmt(payout)}\n\n` +
            `⏰ **Ready in:** ${hrsDisp > 0 ? `${hrsDisp}h ` : ''}${minsDisp}m\n` +
            `👛 **Wallet balance:** 🪙${fmt(d.coins)}`
        )
        .setFooter({ text: 'Garaad Economy • Use ?invest collect when it is ready' })] });
};
