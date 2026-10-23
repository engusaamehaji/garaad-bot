const TIERS = [
    { name: 'Bronze',   emoji: '🥉', min: 0,    color: '#cd7f32', next: 200  },
    { name: 'Silver',   emoji: '🥈', min: 200,  color: '#c0c0c0', next: 500  },
    { name: 'Gold',     emoji: '🥇', min: 500,  color: '#ffd700', next: 1000 },
    { name: 'Platinum', emoji: '💎', min: 1000, color: '#e5e4e2', next: 2000 },
    { name: 'Diamond',  emoji: '💠', min: 2000, color: '#b9f2ff', next: 4000 },
    { name: 'Master',   emoji: '🔮', min: 4000, color: '#9b59b6', next: 7000 },
    { name: 'Legend',   emoji: '👑', min: 7000, color: '#f1c40f', next: null },
];

function getTier(iq) {
    const n = iq || 0;
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (n >= TIERS[i].min) return TIERS[i];
    }
    return TIERS[0];
}

function getTierProgress(iq) {
    const tier = getTier(iq);
    if (!tier.next) return { tier, pct: 100, needed: 0 };
    const range  = tier.next - tier.min;
    const done   = (iq || 0) - tier.min;
    const pct    = Math.min(100, Math.floor((done / range) * 100));
    const needed = tier.next - (iq || 0);
    return { tier, pct, needed };
}

module.exports = { TIERS, getTier, getTierProgress };
