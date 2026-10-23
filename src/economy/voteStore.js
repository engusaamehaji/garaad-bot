const path = require('path');
const fs   = require('fs');
const https = require('https');

const VOTE_PATH  = path.join(__dirname, '../../data/votes.json');
const BOT_ID     = '1495341089266073705';
const COOLDOWN   = 24 * 60 * 60 * 1000; // 24 saacadood

let voteData = {};

function loadVotes() {
    if (fs.existsSync(VOTE_PATH)) {
        try { voteData = JSON.parse(fs.readFileSync(VOTE_PATH, 'utf8')); }
        catch { voteData = {}; }
    }
}

function saveVotes() {
    const dir = path.dirname(VOTE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VOTE_PATH, JSON.stringify(voteData, null, 2));
}

loadVotes();

// Ma claiméynin 24 saacadood gudahood?
function hasClaimedRecently(userId) {
    const last = voteData[userId]?.lastClaimed || 0;
    return (Date.now() - last) < COOLDOWN;
}

function getRemainingCooldown(userId) {
    const last = voteData[userId]?.lastClaimed || 0;
    return Math.max(0, COOLDOWN - (Date.now() - last));
}

function recordClaim(userId) {
    voteData[userId] = { lastClaimed: Date.now() };
    saveVotes();
}

// top.gg API: miyuu codeeyay? returns Promise<boolean>
function checkVoted(userId) {
    const token = process.env.TOPGG_TOKEN;
    if (!token) return Promise.resolve(false);

    return new Promise((resolve) => {
        const options = {
            hostname: 'top.gg',
            path:     `/api/bots/${BOT_ID}/check?userId=${userId}`,
            method:   'GET',
            headers:  { Authorization: token },
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.voted === 1);
                } catch { resolve(false); }
            });
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

module.exports = { hasClaimedRecently, getRemainingCooldown, recordClaim, checkVoted };
