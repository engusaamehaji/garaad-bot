const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'hagbad.json');

let hagbadData = {};

async function loadHagbad() {
    const { getDB } = require('../db');
    const db = getDB();
    if (db) {
        try {
            const doc = await db.collection('economy').findOne({ _id: 'hagbad' });
            if (doc && doc.data) {
                Object.assign(hagbadData, doc.data);
                console.log('[Hagbad] ✅ hagbad.json loaded from MongoDB');
                return;
            }
        } catch (e) {
            console.error('[Hagbad] MongoDB load failed, falling back to JSON:', e.message);
        }
    }
    
    try {
        if (fs.existsSync(DATA_PATH)) {
            Object.assign(hagbadData, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
        }
    } catch (e) {
        console.error('[Hagbad] Error reading hagbad.json:', e.message);
    }
}

function saveHagbad() {
    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(hagbadData, null, 2));
    } catch (e) {
        console.error('[Hagbad] Error saving hagbad.json:', e.message);
    }
    
    const { getDB } = require('../db');
    const db = getDB();
    if (db) {
        db.collection('economy')
            .updateOne({ _id: 'hagbad' }, { $set: { data: hagbadData } }, { upsert: true })
            .catch(e => console.error('[Hagbad] MongoDB save error:', e.message));
    }
}

module.exports = {
    hagbadData,
    loadHagbad,
    saveHagbad
};
