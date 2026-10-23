// =====================================================================
// Imposter — roles & team balance
// =====================================================================

const ROLES = {
    imposter: {
        id: 'imposter',
        emoji: '🗡️',
        name: 'Imposter',
        color: '#8b0000',
        dm: 'At night, secretly vote with your fellow Imposters to eliminate a Citizen. Stay hidden during the day.',
    },
    citizen: {
        id: 'citizen',
        emoji: '👤',
        name: 'Citizen',
        color: '#2980b9',
        dm: 'Discuss during the day, then vote to eliminate who you think is an Imposter. Survive the nights.',
    },
};

/**
 * Imposter count by lobby size:
 * 3–5  → 1
 * 6–10 → 2
 * 11–15 → 3
 * 16–20 → 4
 * 21+  → +1 every 5 players beyond 20 (cap at floor(n/2)-1 so citizens can still win)
 */
function imposterCount(playerCount) {
    if (playerCount < 3) return 0;
    if (playerCount <= 5) return 1;
    if (playerCount <= 10) return 2;
    if (playerCount <= 15) return 3;
    if (playerCount <= 20) return 4;

    const extra = Math.floor((playerCount - 20) / 5);
    const count = 4 + extra;
    const maxSafe = Math.max(1, Math.floor(playerCount / 2) - 1);
    return Math.min(count, maxSafe);
}

function assignRoles(playerCount) {
    const imposters = imposterCount(playerCount);
    const roles = Array(imposters).fill('imposter');
    while (roles.length < playerCount) roles.push('citizen');

    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    return roles;
}

function isImposter(role) {
    return role === 'imposter';
}

function roleLabel(role) {
    const info = ROLES[role] || ROLES.citizen;
    return `${info.emoji} ${info.name}`;
}

module.exports = {
    ROLES,
    imposterCount,
    assignRoles,
    isImposter,
    roleLabel,
};
