// =====================================================================
// GitHub → Bot: soo deji su'aalaha cusub (pull) oo reload garee
// Isticmaal BACKUP_REPO + BACKUP_TOKEN (ama QUESTIONS_REPO)
// =====================================================================

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { reloadQuestions, getQuestionCounts } = require('../utils/questions');

const INTERVAL_MS = 15 * 60 * 1000; // 15 daqiiqo
const GAMES = ['solo', 'duel', 'quiz', 'tournament', 'team'];
const CACHE_QUESTIONS_DIR = path.join(__dirname, '../../data/cache/questions');

function githubApiRequest(method, urlPath, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: urlPath,
            method,
            headers: {
                Authorization: `token ${token}`,
                'User-Agent':  'garaad-bot-questions-sync',
                Accept:        'application/vnd.github.v3+json',
            },
        };
        const req = https.request(options, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    return reject(new Error(`GitHub ${res.statusCode}: ${raw.slice(0, 200)}`));
                }
                try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function pullQuestionFile(repo, token, game) {
    const remote = `data/questions/${game}.json`;
    const local  = path.join(CACHE_QUESTIONS_DIR, `${game}.json`);

    const data = await githubApiRequest('GET', `/repos/${repo}/contents/${remote}`, token);
    if (!data || !data.content) return false;

    const remoteContent = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    let remoteParsed;
    try {
        remoteParsed = JSON.parse(remoteContent);
    } catch {
        console.warn(`[QuestionSync] ${game}.json GitHub — JSON khaldan`);
        return false;
    }
    if (!Array.isArray(remoteParsed) || remoteParsed.length === 0) return false;

    let localCount = 0;
    if (fs.existsSync(local)) {
        try { localCount = JSON.parse(fs.readFileSync(local, 'utf8')).length; } catch { localCount = 0; }
    } else {
        const fallback = path.join(__dirname, '../../data/questions', `${game}.json`);
        if (fs.existsSync(fallback)) {
            try { localCount = JSON.parse(fs.readFileSync(fallback, 'utf8')).length; } catch { localCount = 0; }
        }
    }

    if (remoteParsed.length <= localCount) return false;

    if (!fs.existsSync(CACHE_QUESTIONS_DIR)) {
        fs.mkdirSync(CACHE_QUESTIONS_DIR, { recursive: true });
    }
    fs.writeFileSync(local, JSON.stringify(remoteParsed, null, 2));
    console.log(`[QuestionSync] ✅ ${game}.json: ${localCount} → ${remoteParsed.length} su'aalood`);
    return true;
}

async function runQuestionSync() {
    const repo  = process.env.QUESTIONS_REPO || process.env.BACKUP_REPO;
    const token = process.env.BACKUP_TOKEN || process.env.GITHUB_TOKEN;
    if (!repo || !token) return;

    let updated = 0;
    for (const game of GAMES) {
        try {
            if (await pullQuestionFile(repo, token, game)) updated++;
        } catch (e) {
            if (!String(e.message).includes('404')) {
                console.warn(`[QuestionSync] ${game}: ${e.message}`);
            }
        }
    }

    if (updated > 0) {
        reloadQuestions();
        console.log(`[QuestionSync] 🔄 ${updated} fayl(l) cusbooneysiiyay — ${JSON.stringify(getQuestionCounts())}`);
    }
}

module.exports = function setupQuestionSync() {
    const repo  = process.env.QUESTIONS_REPO || process.env.BACKUP_REPO;
    const token = process.env.BACKUP_TOKEN || process.env.GITHUB_TOKEN;
    if (!repo || !token) {
        console.log('[QuestionSync] ⚠️  BACKUP_REPO/TOKEN lama setin — sync ma shaqaynayo');
        return;
    }

    setTimeout(() => {
        runQuestionSync();
        setInterval(runQuestionSync, INTERVAL_MS);
    }, 2 * 60 * 1000);

    console.log('[QuestionSync] ✅ Scheduler started — pull every 15 min from GitHub');
};
