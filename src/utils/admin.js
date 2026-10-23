// =====================================================================
// GARAAD BOT - Maareynta Admin-ka
// =====================================================================

const fs   = require('fs');
const path = require('path');

const ADMIN_FILE = path.join(__dirname, '..', '..', 'data', 'admin.json');

let cache = { admins: [], bugs: [], djs: [] };

function load() {
    try {
        if (fs.existsSync(ADMIN_FILE)) {
            cache = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
        }
        if (!cache.admins) cache.admins = [];
        if (!cache.bugs)   cache.bugs   = [];
        if (!cache.djs)    cache.djs    = [];
    } catch (e) {
        console.error('[Admin] Khalad akhrinta admin.json:', e.message);
        cache = { admins: [], bugs: [], djs: [] };
    }
}

function save() {
    try {
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error('[Admin] Khalad keydinta admin.json:', e.message);
    }
}

// ───── Bilow: file akhri ─────
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

function isDJ(userId) {
    return cache.djs.includes(String(userId));
}

function addDJ(userId) {
    const id = String(userId);
    if (!cache.djs.includes(id)) { cache.djs.push(id); save(); return true; }
    return false;
}

function removeDJ(userId) {
    const id = String(userId);
    const before = cache.djs.length;
    cache.djs = cache.djs.filter(d => d !== id);
    if (cache.djs.length !== before) { save(); return true; }
    return false;
}

function canPlayMusic(userId) {
    return isAdmin(String(userId)) || isDJ(String(userId));
}

module.exports = {
    isAdmin, addAdmin, removeAdmin, listAdmins,
    isDJ, addDJ, removeDJ, canPlayMusic,
    logBug, getBugs, clearBugs,
};
