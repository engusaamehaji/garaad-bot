// =====================================================================
// AF-SOOMAALIGA — Qaamuuska iyo Hagaajinta (Spell-check + Auto-correct)
// =====================================================================

const fs   = require('fs');
const path = require('path');

const ERAYO_PATH = path.join(__dirname, '..', 'data', 'erayo.json');

let _data = null;

function loadData() {
    if (_data) return _data;
    try {
        _data = JSON.parse(fs.readFileSync(ERAYO_PATH, 'utf8'));
    } catch {
        _data = { badal: {}, erayo: [] };
    }
    return _data;
}

/** Ka badal erayga qaldan si toos (word level) */
function saxEray(eray) {
    const { badal } = loadData();
    const low = eray.toLowerCase();
    return badal[low] || badal[eray] || eray;
}

/**
 * Ka badal dhammaan erayada qaldan ee jumladda
 * @param {string} text
 * @returns {string} text hagaajisan
 */
function saxSomali(text) {
    if (!text) return text;
    const { badal } = loadData();

    // Try multi-word phrases first
    let result = text;
    for (const [wrong, correct] of Object.entries(badal)) {
        if (wrong.includes(' ')) {
            const re = new RegExp('\\b' + wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
            result = result.replace(re, correct);
        }
    }

    // Single word replacement
    result = result.split(' ').map(word => {
        const low = word.toLowerCase();
        const sax = badal[low] || badal[word];
        if (!sax) return word;
        // Preserve capitalisation if original was capitalised
        if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
            return sax.charAt(0).toUpperCase() + sax.slice(1);
        }
        return sax;
    }).join(' ');

    return result;
}

/**
 * Hubi haddii eraygu yahay mid saxan
 * Returns { saxan: bool, talobixin: string|null }
 */
function hubiBadal(eray) {
    const { badal } = loadData();
    const low = eray.toLowerCase();
    if (badal[low]) {
        return { saxan: false, talobixin: badal[low] };
    }
    // Check if this is a known correct word
    const correct = Object.values(badal);
    if (correct.includes(eray) || correct.includes(low)) {
        return { saxan: true, talobixin: null };
    }
    return { saxan: null, talobixin: null }; // unknown
}

/** Raadi erayga qaamuuska */
function raadEray(eray) {
    const { erayo } = loadData();
    const low = eray.toLowerCase();
    return erayo.find(e => e.eray.toLowerCase() === low) || null;
}

/** Raadi dhammaan erayada nooc gaar ah */
function raadNooc(nooc) {
    const { erayo } = loadData();
    return erayo.filter(e => e.nooc === nooc);
}

/** Admin: ku dar badal cusub */
function kuDarBadal(qalad, sax) {
    const data = loadData();
    data.badal[qalad.toLowerCase()] = sax;
    fs.writeFileSync(ERAYO_PATH, JSON.stringify(data, null, 2));
    _data = null; // reset cache
}

/** Admin: ku dar eray cusub qaamuuska */
function kuDarEray(eray, nooc, tusaale) {
    const data = loadData();
    const exists = data.erayo.findIndex(e => e.eray.toLowerCase() === eray.toLowerCase());
    if (exists >= 0) {
        data.erayo[exists] = { eray, nooc, tusaale };
    } else {
        data.erayo.push({ eray, nooc, tusaale });
    }
    fs.writeFileSync(ERAYO_PATH, JSON.stringify(data, null, 2));
    _data = null;
}

/** Admin: tir badal ama eray */
function tirEray(eray) {
    const data = loadData();
    const low = eray.toLowerCase();
    let removed = false;
    if (data.badal[low]) {
        delete data.badal[low];
        removed = true;
    }
    const idx = data.erayo.findIndex(e => e.eray.toLowerCase() === low);
    if (idx >= 0) {
        data.erayo.splice(idx, 1);
        removed = true;
    }
    if (removed) {
        fs.writeFileSync(ERAYO_PATH, JSON.stringify(data, null, 2));
        _data = null;
    }
    return removed;
}

/** Tirada erayada qaamuuska */
function tirada() {
    const { badal, erayo } = loadData();
    return {
        badal: Object.keys(badal).length,
        erayo: erayo.length,
    };
}

module.exports = { saxEray, saxSomali, hubiBadal, raadEray, raadNooc, kuDarBadal, kuDarEray, tirEray, tirada };
