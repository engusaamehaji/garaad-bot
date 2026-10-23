const { getLevel } = require('./helpers');

const BANK_REQ = {
    iq:       50,
    btc:      100_000,
    missions: 5,
};

const COMPANY_REQ = {
    level:     35,
    iq:        500,
    btc:       1_000_000,
    missions:  250,
    streak:    14,
    duelWins:  50,
};

function checkRequirements(userData, econData, userId, type) {
    const d  = userData[userId]  || {};
    const ec = econData[userId]  || {};
    const req = type === 'bank' ? BANK_REQ : COMPANY_REQ;

    const level      = getLevel(d.iq || 0);
    const iq         = d.iq || 0;
    const btc        = ec.btc || 0;
    const missions   = d.stats?.missionsCompleted || 0;
    const streak     = ec.streak || 0;
    const duelWins   = d.stats?.duelWins || 0;

    const results = [];
    if (req.level    != null) results.push({ label: `Level ${req.level}+`,           met: level    >= req.level,    have: `Level ${level}` });
    if (req.iq       != null) results.push({ label: `${req.iq}+ IQ`,                 met: iq       >= req.iq,       have: `${iq} IQ` });
    if (req.btc      != null) results.push({ label: `₿${req.btc.toLocaleString()}+`, met: btc      >= req.btc,      have: `₿${Math.floor(btc).toLocaleString()}` });
    if (req.missions != null) results.push({ label: `${req.missions} Missions`,       met: missions >= req.missions, have: `${missions} done` });
    if (req.streak   != null) results.push({ label: `${req.streak}-Day Streak`,       met: streak   >= req.streak,   have: `${streak} days` });

    if (type === 'company') {
        if (req.duelWins != null) results.push({ label: `${req.duelWins}+ Duel Wins`, met: duelWins >= req.duelWins, have: `${duelWins} wins` });
    }

    const allMet = results.every(r => r.met);
    return { allMet, results, req };
}

function reqFailMessage(results, type) {
    const name = type === 'bank' ? '🏦 Bank' : '🏢 Company';
    const lines = results.map(r => `${r.met ? '✅' : '❌'} ${r.label} — *${r.have}*`);
    return (
        `**${name} — Shuruudaha:**\n\n` +
        lines.join('\n') +
        `\n\n_Sii ciyaar si aad u xaliso shuruudaha._`
    );
}

module.exports = { checkRequirements, reqFailMessage, BANK_REQ, COMPANY_REQ };
