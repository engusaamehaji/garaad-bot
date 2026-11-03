// =====================================================================
// GARAAD BOT - Maareynta Admin-ka
// =====================================================================

const fs   = require('fs');
const path = require('path');

const ADMIN_FILE = path.join(__dirname, '..', '..', 'data', 'admin.json');

let cache = { admins: [], bugs: [] };

function load() {
    try {
        if (fs.existsSync(ADMIN_FILE)) {
            cache = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
        }
        if (!cache.admins) cache.admins = [];
        if (!cache.bugs)   cache.bugs   = [];
    } catch (e) {
        console.error('[Admin] Incorrect akhrinta admin.json:', e.message);
        cache = { admins: [], bugs: [] };
    }
}

function save() {
    try {
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error('[Admin] Incorrect keydinta admin.json:', e.message);
    }
}

// ───── start: file akhri ─────
load();

// ───── Public API ─────
function isAdmin(userId) {
    return cache.admins.includes(String(userId));
}

function addAdmin(userId) {
    const id = String(userId);
    if (!cache.admins.includes(id)) {
        cache.admins.push(id);
        save();
        return true;
    }
    return false;
}

function removeAdmin(userId) {
    const id     = String(userId);
    const before = cache.admins.length;
    cache.admins = cache.admins.filter(a => a !== id);
    if (cache.admins.length !== before) {
        save();
        return true;
    }
    return false;
}

function listAdmins() {
    return [...cache.admins];
}

function logBug(userId, username, description) {
    const bug = {
        userId:    String(userId),
        username,
        description,
        timestamp: Date.now(),
        date:      new Date().toISOString(),
    };
    cache.bugs.unshift(bug); // ugu cusub waa kan ugu sare
    save();
    return bug;
}

function getBugs(limit = 50) {
    return cache.bugs.slice(0, limit);
}

function clearBugs() {
    cache.bugs = [];
    save();
}

module.exports = {
    isAdmin, addAdmin, removeAdmin, listAdmins,
    logBug, getBugs, clearBugs,
};
