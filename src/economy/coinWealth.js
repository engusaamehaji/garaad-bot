function addAmount(totals, userId, amount) {
    if (!/^\d{17,19}$/.test(userId || '')) return;
    const value = Number(amount) || 0;
    if (value > 0) totals[userId] = (totals[userId] || 0) + value;
}

function getCoinWealthByUser(econData, publicBanks = {}) {
    const totals = {};

    for (const [userId, data] of Object.entries(econData || {})) {
        if (!/^\d{17,19}$/.test(userId) || !data || typeof data !== 'object') continue;
        addAmount(totals, userId, data.coins);
        const accountBalances = Object.values(data.banks || {})
            .reduce((sum, amount) => sum + (Number(amount) > 0 ? Number(amount) : 0), 0);
        addAmount(totals, userId, accountBalances);
        addAmount(totals, userId, data.personalBank?.balance);

        const personalBank = data.personalBank;
        if (personalBank) {
            for (const [customerId, account] of Object.entries(personalBank.customers || {})) {
                addAmount(totals, customerId, account?.balance);
            }
        }
    }

    for (const bank of Object.values(publicBanks || {})) {
        if (!bank) continue;
        addAmount(totals, bank.ownerId, bank.ownerFund);
        addAmount(totals, bank.ownerId, bank.ownerProfit);
        for (const [customerId, account] of Object.entries(bank.customers || {})) {
            addAmount(totals, customerId, account?.balance);
        }
    }

    return totals;
}

module.exports = { getCoinWealthByUser };
