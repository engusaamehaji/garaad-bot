// =====================================================================
// GARAAD BOT - Xadduuda Martiqaadka (Host Daily Limit)
// =====================================================================

const { userData }           = require('../store');
const { checkUser, todayKey } = require('./helpers');
const { HOST_DAILY_LIMIT }   = require('../config');

function canHostQuiz(userId) {
    checkUser(userId);
    const q = userData[userId].hostQuota;
    if (q.date !== todayKey()) { q.date = todayKey(); q.count = 0; }
    return q.count < HOST_DAILY_LIMIT;
}

function bumpHostQuiz(userId) {
    checkUser(userId);
    const q = userData[userId].hostQuota;
    if (q.date !== todayKey()) { q.date = todayKey(); q.count = 0; }
    q.count++;
}

module.exports = { canHostQuiz, bumpHostQuiz };
