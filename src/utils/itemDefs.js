// =====================================================================
// Item definitions: Frames, Badges, Boosters, Loot Boxes
// =====================================================================

const FRAMES = {
    // ── Hidden (existing owners keep, no longer buyable) ──
    basic_blue:     { name: 'Blue Frame',       emoji: '🔵', rarity: 'Common',    price: 800,   sellFor: 200,   lootOnly: true },
    basic_green:    { name: 'Green Frame',      emoji: '🟢', rarity: 'Common',    price: 800,   sellFor: 200,   lootOnly: true },
    basic_red:      { name: 'Red Frame',        emoji: '🔴', rarity: 'Common',    price: 800,   sellFor: 200,   lootOnly: true },
    gold_ring:      { name: 'Gold Ring',        emoji: '🌕', rarity: 'Rare',      price: 2500,  sellFor: 800,   lootOnly: true },
    silver_shine:   { name: 'Silver Shine',     emoji: '⚪', rarity: 'Rare',      price: 3000,  sellFor: 900,   lootOnly: true },
    neon_purple:    { name: 'Neon Purple',      emoji: '💜', rarity: 'Rare',      price: 3500,  sellFor: 1000,  lootOnly: true },
    dragon_fire:    { name: 'Dragon Fire',      emoji: '🔥', rarity: 'Epic',      price: 6000,  sellFor: 2000,  lootOnly: true },
    ice_crystal:    { name: 'Ice Crystal',      emoji: '❄️', rarity: 'Epic',      price: 7000,  sellFor: 2500,  lootOnly: true },
    galaxy:         { name: 'Galaxy Frame',     emoji: '🌌', rarity: 'Epic',      price: 8000,  sellFor: 3000,  lootOnly: true },
    champion_gold:  { name: 'Champion Gold',    emoji: '🏆', rarity: 'Legendary', price: 15000, sellFor: 6000,  lootOnly: true },
    legend_aura:    { name: 'Legend Aura',      emoji: '✨', rarity: 'Mythic',    price: 0,     sellFor: 10000, lootOnly: true },
    garaad_crown:   { name: 'Garaad Crown',     emoji: '👑', rarity: 'Mythic',    price: 0,     sellFor: 12000, lootOnly: true },
    // ── Buyable ──
    somali_flag:    { name: 'Somali',            emoji: '⭐', rarity: 'Legendary', price: 12000, sellFor: 5000 },
};

const BADGES = {
    first_win:   { name: 'First Win',     emoji: '🎯', desc: 'Win your first duel' },
    streak_5:    { name: 'Streak Master', emoji: '🔥', desc: 'Get 5 solo correct answers in a row' },
    iq_100:      { name: 'IQ 100+',       emoji: '🧠', desc: 'Reach 100 IQ' },
    iq_500:      { name: 'IQ 500+',       emoji: '💡', desc: 'Reach 500 IQ' },
    iq_1000:     { name: 'IQ 1000+',      emoji: '🔬', desc: 'Reach 1,000 IQ' },
    iq_3000:     { name: 'IQ 3000+',      emoji: '🧬', desc: 'Reach 3,000 IQ' },
    duel_10:     { name: 'Duelist',       emoji: '⚔️',  desc: 'Win 10 duels' },
    duel_50:     { name: 'Duel Master',   emoji: '🗡️',  desc: 'Win 50 duels' },
    duel_100:    { name: 'Duel Legend',   emoji: '⚡',  desc: 'Win 100 duels' },
    quiz_10:     { name: 'Quiz Player',   emoji: '📝', desc: 'Play 10 quizzes' },
    quiz_champ:  { name: 'Quiz Champion', emoji: '🏅', desc: 'Win 20 quizzes' },
    rich_100k:   { name: 'Rich',          emoji: '💰', desc: 'Earn 100,000 BTC total' },
    rich_1m:     { name: 'Millionaire',   emoji: '💎', desc: 'Earn 1,000,000 BTC total' },
    legend_rank: { name: 'Legend Tier',   emoji: '👑', desc: 'Reach Legend rank (7000+ IQ)' },
    daily_7:     { name: 'Week Streak',   emoji: '📅', desc: '7 consecutive daily logins' },
    daily_30:    { name: 'Month Streak',  emoji: '🗓️', desc: '30 consecutive daily logins' },
    loot_opener:    { name: 'Loot Addict',    emoji: '📦', desc: 'Open 10 loot boxes' },
    // ── Relationship badges ──
    first_love:     { name: 'First Love',     emoji: '💕', desc: 'Get your first partner' },
    engaged:        { name: 'Engaged',        emoji: '💍', desc: 'Accept a proposal' },
    royal_couple:   { name: 'Royal Couple',   emoji: '👑', desc: 'Propose with Royal Ring' },
    somali_couple:  { name: 'Somali Couple',  emoji: '🇸🇴', desc: 'Propose with Somali Ring' },
};

const BOOSTERS = {
    double_btc: { name: 'Double BTC',  emoji: '₿',  duration: 60 * 60 * 1000, price: 2500, desc: '2x BTC earnings for 1 hour',     sellFor: 800  },
    iq_shield:  { name: 'IQ Shield',   emoji: '🛡️', duration: 0,              price: 1500, desc: 'Block next IQ loss (1 use)',      sellFor: 500  },
    safety_shield: { name: 'Safety Shield', emoji: '🔒', duration: 24 * 60 * 60 * 1000, price: 300, desc: 'Rob-ka kaaga ilaaliya 24h', sellFor: 100 },
};

const LOOT_BOXES = {
    common:    { name: 'Common Box',    emoji: '📦', price: 2000,  color: '#95a5a6' },
    rare:      { name: 'Rare Box',      emoji: '🎁', price: 5000,  color: '#3498db' },
    legendary: { name: 'Legendary Box', emoji: '💎', price: 15000, color: '#f39c12' },
};

// Loot table: [itemType, itemKey, weight]
const LOOT_TABLES = {
    common: [
        ['btc',     200,          30],
        ['btc',     500,          20],
        ['btc',     1000,         10],
        ['frame',   'basic_blue',  8],
        ['frame',   'basic_green', 8],
        ['frame',   'basic_red',   8],
        ['booster', 'double_xp',   8],
        ['booster', 'double_btc',  5],
        ['frame',   'gold_ring',   2],
        ['badge',   'loot_opener', 1],
    ],
    rare: [
        ['btc',     1000,          15],
        ['btc',     2500,          10],
        ['frame',   'gold_ring',   15],
        ['frame',   'silver_shine',15],
        ['frame',   'neon_purple', 12],
        ['booster', 'double_iq',   12],
        ['booster', 'double_btc',  10],
        ['frame',   'dragon_fire',  6],
        ['frame',   'ice_crystal',  3],
        ['frame',   'galaxy',       2],
    ],
    legendary: [
        ['btc',     5000,           10],
        ['frame',   'dragon_fire',  15],
        ['frame',   'ice_crystal',  15],
        ['frame',   'galaxy',       12],
        ['frame',   'somali_flag',  12],
        ['frame',   'champion_gold',10],
        ['booster', 'double_iq',    10],
        ['frame',   'legend_aura',   8],
        ['frame',   'garaad_crown',  8],
    ],
};

function rollLoot(boxType) {
    const table = LOOT_TABLES[boxType] || LOOT_TABLES.common;
    const total = table.reduce((s, row) => s + row[2], 0);
    let roll = Math.random() * total;
    for (const [type, key, weight] of table) {
        roll -= weight;
        if (roll <= 0) return { type, key };
    }
    return { type: table[0][0], key: table[0][1] };
}

const RINGS = {
    silver:  { name: 'Silver Ring',  emoji: '💍', price: 5_000,  sellFor: 2_000 },
    diamond: { name: 'Diamond Ring', emoji: '💎', price: 15_000, sellFor: 6_000 },
    royal:   { name: 'Royal Ring',   emoji: '👑', price: 30_000, sellFor: 12_000 },
    somali:  { name: 'Somali Ring',  emoji: '🇸🇴', price: 50_000, sellFor: 20_000 },
};

module.exports = { FRAMES, BADGES, BOOSTERS, LOOT_BOXES, LOOT_TABLES, rollLoot, RINGS };
