const { econData, saveEcon, addToTreasury } = require('../economy/econStore');
const { applyInterest }                     = require('../../data/commands/economy/ebank');

const FIRST_TICK_MS     = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const WEALTH_TAX_THRESHOLD = 1_000_000;
const WEALTH_TAX_RATE      = 0.10;

module.exports = function setupBankChargeScheduler(client) {
    async function tick() {
        try {
            const users = Object.keys(econData).filter(k => /^\d{17,19}$/.test(k) && econData[k]?.banks);
            if (users.length === 0) return;

            let taxedPlayers = 0;
            let totalTaxed   = 0;

            for (const userId of users) {
                const d = econData[userId];
                applyInterest(d);

                // Wealth tax: 10% on wallet above ₿1M
                const wallet = d.btc || 0;
                if (wallet > WEALTH_TAX_THRESHOLD) {
                    const excess = wallet - WEALTH_TAX_THRESHOLD;
                    const tax    = Math.floor(excess * WEALTH_TAX_RATE);
                    if (tax > 0) {
                        d.btc -= tax;
                        addToTreasury(tax);
                        taxedPlayers++;
                        totalTaxed += tax;
                    }
                }
            }

            saveEcon();
            if (taxedPlayers > 0)
                console.log(`[BankCharge] 💸 Wealth tax: ${taxedPlayers} players, ₿${totalTaxed.toLocaleString()} treasury-ga`);
        } catch (err) {
            console.error('[BankCharge] Error:', err.message);
        }
    }

    setTimeout(() => {
        tick();
        setInterval(tick, CHECK_INTERVAL_MS);
    }, FIRST_TICK_MS);

    console.log('[BankCharge] ✅ Scheduler started (10 min → every 24 hours)');
};
