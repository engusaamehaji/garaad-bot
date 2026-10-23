const fs   = require('fs');
const path = require('path');
const https = require('https');

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const FILES_TO_BACKUP = [
    { local: path.join(__dirname, '../../data/users.json'),   remote: 'data/users.json'   },
    { local: path.join(__dirname, '../../data/economy.json'), remote: 'data/economy.json' },
];

function githubApiRequest(method, urlPath, token, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'api.github.com',
            path: urlPath,
            method,
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent':    'garaad-bot-backup',
                'Accept':        'application/vnd.github.v3+json',
                'Content-Type':  'application/json',
            },
        };
        if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
        const req = https.request(options, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function backupFile(repo, token, file) {
    if (!fs.existsSync(file.local)) return;
    const content = fs.readFileSync(file.local, 'utf8');
    const encoded = Buffer.from(content).toString('base64');

    // Get current SHA (needed for update)
    const existing = await githubApiRequest('GET', `/repos/${repo}/contents/${file.remote}`, token);
    const sha = existing?.sha || undefined;

    const body = {
        message: `backup: ${file.remote} — ${new Date().toUTCString()}`,
        content: encoded,
    };
    if (sha) body.sha = sha;

    await githubApiRequest('PUT', `/repos/${repo}/contents/${file.remote}`, token, body);
}

async function runBackup() {
    const repo  = process.env.BACKUP_REPO;
    const token = process.env.BACKUP_TOKEN;
    if (!repo || !token) return;

    let ok = 0, fail = 0;
    for (const file of FILES_TO_BACKUP) {
        try {
            await backupFile(repo, token, file);
            ok++;
        } catch {
            fail++;
        }
    }
    if (ok || fail) console.log(`[Backup] ✅ ${ok} files saved to GitHub${fail ? ` | ❌ ${fail} failed` : ''}`);
}

module.exports = function setupBackupScheduler() {
    if (!process.env.BACKUP_REPO || !process.env.BACKUP_TOKEN) {
        console.log('[Backup] ⚠️  BACKUP_REPO ama BACKUP_TOKEN la seto (optional)');
        return;
    }

    // First backup 5 minutes after start
    setTimeout(() => {
        runBackup();
        setInterval(runBackup, INTERVAL_MS);
    }, 5 * 60 * 1000);

    console.log('[Backup] ✅ Scheduler started — first backup in 5 minutes, then every hour');
};
