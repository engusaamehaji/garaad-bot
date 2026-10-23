const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const BANKS_PATH     = path.join(__dirname, '..', '..', 'data', 'banks.json');
const COMPANIES_PATH = path.join(__dirname, '..', '..', 'data', 'companies.json');

let banksData     = {};
let companiesData = {};

// ── Load ──────────────────────────────────────────────
function loadBanks() {
    try { if (fs.existsSync(BANKS_PATH)) banksData = JSON.parse(fs.readFileSync(BANKS_PATH, 'utf8')); } catch {}
}
function loadCompanies() {
    try { if (fs.existsSync(COMPANIES_PATH)) companiesData = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf8')); } catch {}
}

// ── Save ──────────────────────────────────────────────
function saveBanks() {
    try { fs.writeFileSync(BANKS_PATH, JSON.stringify(banksData, null, 2)); } catch (e) { console.error('[BankStore] Save error:', e.message); }
}
function saveCompanies() {
    try { fs.writeFileSync(COMPANIES_PATH, JSON.stringify(companiesData, null, 2)); } catch (e) { console.error('[CompanyStore] Save error:', e.message); }
}

// ── Hashing ───────────────────────────────────────────
function hashPass(pw) {
    return crypto.createHash('sha256').update(pw + 'garaad_bank_2025').digest('hex');
}
function checkPass(pw, hash) { return hashPass(pw) === hash; }

// ── ID generators ─────────────────────────────────────
function namePrefix(str) {
    // "Kormaal Bank" → "KB"  |  "hawo" → "HWB"  |  "ahmed" → "AHB"
    const words = str.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return words.map(w => w[0].toUpperCase()).join('').slice(0, 4);
    }
    // Single word: first letter + first consonant after pos 0 + B
    const upper     = str.toUpperCase().replace(/[^A-Z]/g, '');
    const first     = upper[0] || 'X';
    const rest      = upper.slice(1);
    const consonant = rest.split('').find(c => !'AEIOU'.includes(c)) || rest[0] || 'B';
    return (first + consonant + 'B').slice(0, 4);
}

function genPublicBankId(name) {
    const prefix = namePrefix(name);
    const n = Math.floor(Math.random() * 90000) + 10000;
    return `${prefix}:${n}`;
}

function genPersonalBankId(username) {
    const prefix = namePrefix(username);
    const n = Math.floor(Math.random() * 90000) + 10000;
    return `${prefix}:${n}`;
}

function genCompanyId() {
    const n = Math.floor(Math.random() * 90000) + 10000;
    return `GC-${n}`;
}

// ── Personal bank helpers ──────────────────────────────
function getPersonalBank(econData, userId) { return econData[userId]?.personalBank || null; }

function createPersonalBank(econData, userId, username) {
    if (econData[userId].personalBank) return null;
    let bankId;
    do { bankId = genPersonalBankId(username); } while (Object.values(econData).some(d => d.personalBank?.bankId === bankId));
    econData[userId].personalBank = {
        bankId,
        owner: username,
        balance:      0,
        passwordHash: null,
        deposits:     0,
        withdrawals:  0,
        transactions: [],
        sharedWith:   [],
        createdAt:    Date.now(),
    };
    return econData[userId].personalBank;
}

function addTx(bank, type, amount, note) {
    bank.transactions = bank.transactions || [];
    bank.transactions.unshift({ type, amount, note, at: Date.now() });
    if (bank.transactions.length > 50) bank.transactions = bank.transactions.slice(0, 50);
}

// ── Public bank helpers ────────────────────────────────
function getPublicBank(id) {
    if (banksData[id]) return banksData[id];
    // Also accept display IDs like "KB:72957" that match stored "GB-72957"
    const up = (id || '').toUpperCase();
    return Object.values(banksData).find(b => {
        const num = (b.id || '').replace(/[^0-9]/g, '');
        return `${namePrefix(b.name)}:${num}`.toUpperCase() === up;
    }) || null;
}
function getAllPublicBanks() { return banksData; }

function createPublicBank(ownerId, ownerUsername, name) {
    let id;
    do { id = genPublicBankId(name); } while (banksData[id]);
    banksData[id] = {
        id, name, ownerId, ownerUsername,
        balance:      0,
        passwordHash: null,
        customers:    {},
        reputation:   0,
        totalDeposits: 0,
        createdAt:    Date.now(),
    };
    return banksData[id];
}

// ── Company helpers ────────────────────────────────────
function getCompany(id) { return companiesData[id] || null; }
function getAllCompanies() { return companiesData; }
function getUserCompany(userId) {
    return Object.values(companiesData).find(c => c.ownerId === userId || c.employees?.[userId]) || null;
}
function getUserOwnedCompany(userId) {
    return Object.values(companiesData).find(c => c.ownerId === userId) || null;
}

const COMPANY_LEVELS = [
    { name: 'Startup',         min: 0 },
    { name: 'Small Business',  min: 500_000 },
    { name: 'Growing Business',min: 2_000_000 },
    { name: 'Corporation',     min: 10_000_000 },
    { name: 'Enterprise',      min: 50_000_000 },
    { name: 'Mega Corporation',min: 200_000_000 },
];

function getCompanyLevel(treasury) {
    let level = COMPANY_LEVELS[0];
    for (const l of COMPANY_LEVELS) { if (treasury >= l.min) level = l; }
    return level.name;
}

function createCompany(ownerId, ownerUsername, name, industry) {
    let id;
    do { id = genCompanyId(); } while (companiesData[id]);
    companiesData[id] = {
        id, name, industry, ownerId, ownerUsername,
        treasury:     0,
        passwordHash: null,
        employees:    { [ownerId]: { role: 'Founder', username: ownerUsername, joinedAt: Date.now() } },
        createdAt:    Date.now(),
    };
    return companiesData[id];
}

module.exports = {
    loadBanks, loadCompanies, saveBanks, saveCompanies,
    hashPass, checkPass, namePrefix,
    getPersonalBank, createPersonalBank, addTx,
    getPublicBank, getAllPublicBanks, createPublicBank,
    getCompany, getAllCompanies, getUserCompany, getUserOwnedCompany,
    getCompanyLevel, createCompany,
    banksData, companiesData,
};
