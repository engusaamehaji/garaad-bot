// =====================================================================
// GARAAD BOT - Reminders System (24h DM)
// =====================================================================

const { userData, saveData } = require('../store');
const { checkUser }          = require('./helpers');
const { REMINDER_HOURS }     = require('../config');

const REMINDER_MS = REMINDER_HOURS * 60 * 60 * 1000;

// ───── Calaamadee marka user uu ciyaaray ─────
function markUserPlayed(userId) {
    if (!userId) return;
    checkUser(userId);
    userData[userId].lastPlayed = Date.now();
    saveData();
}

// ───── Calaamadee marka DM la diray ─────
function markReminderSent(userId) {
    checkUser(userId);
    userData[userId].lastReminderSent = Date.now();
    saveData();
}

// ───── Soo celi liiska user-yada xusuusin loo dirayo ─────
//
// Shuruudaha:
//   1. User-ku waa inuu ciyaaray hore (lastPlayed > 0)
//   2. Waa inay dhammeysteen 24 saac iyaga oo aan ?today qaadan
//   3. Lama dirin DM xusuusin 24 saacadood gudahooda
//
function getUsersDueForReminder() {
    const due = [];
    const now = Date.now();

    for (const userId of Object.keys(userData)) {
        const d = userData[userId];
        if (!d) continue;

        // Marna ma uusan ciyaarin
        if (!d.lastPlayed || d.lastPlayed === 0) continue;

        // User opted out
        if (d.reminderOptOut) continue;

        // Dhowaan ?today qaatay (waxba kuma muquuninayno)
        const sinceDaily = now - (d.lastDaily || 0);
        if (sinceDaily < REMINDER_MS) continue;

        // Dhowaan DM la diray (ha-soo-noqno)
        const sinceReminder = now - (d.lastReminderSent || 0);
        if (sinceReminder < REMINDER_MS) continue;

        due.push(userId);
    }

    return due;
}

module.exports = {
    markUserPlayed,
    markReminderSent,
    getUsersDueForReminder,
};
