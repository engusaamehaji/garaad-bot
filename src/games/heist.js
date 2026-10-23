const { userData, saveData } = require('../store');
const { econData, checkEconUser, saveEcon } = require('../economy/econStore');

const activeHeists = new Map();

function getHiddenUntil(user) {
    return user.hiddenUntil && user.hiddenUntil > Date.now();
}

function createHeist(robberId, victimId) {
    const victim = userData[victimId];
    if (!victim || !victim.password) {
        return { error: 'Ciyaartaan lama bilaabi karo. Ujeedada ma laha password.' };
    }
    if (victim.hiddenUntil && victim.hiddenUntil > Date.now()) {
        return { error: 'Calaamaddu waa qarsoon tahay. Ma xadin kartid qofkan hadda.' };
    }
    if (robberId === victimId) {
        return { error: 'Ma xadin kartid naftaada.' };
    }

    const password = victim.password.toString();
    if (!/^[0-9]{4}$/.test(password)) {
        return { error: 'Ujeedada ma laha password sax ah.' };
    }

    checkEconUser(victimId);
    const victimCash = econData[victimId].usd || 0;
    if (victimCash <= 0) {
        return { error: 'Ujeedada ma hayso lacag. Waxba ma xadi kartid.' };
    }

    const revealIndex    = Math.floor(Math.random() * 4);
    const revealedDigit  = password[revealIndex];
    const pattern        = ['?', '?', '?', '?'];
    pattern[revealIndex] = revealedDigit;

    const state = {
        victimId,
        robberId,
        revealIndex,
        revealedDigit,
        attemptsLeft: 3,
        pattern: pattern.join(''),
        createdAt: Date.now(),
    };

    activeHeists.set(robberId, state);
    return state;
}

function guessHeist(robberId, guessCode) {
    const state = activeHeists.get(robberId);
    if (!state) {
        return { error: 'Ma jiro xatooyo socda. Bilow `?xatooyo @user` marka hore.' };
    }

    const victimUser = userData[state.victimId];
    if (!victimUser) {
        activeHeists.delete(robberId);
        return { error: 'Ujeedada lama helin. Xatooyadu waa la joojiyay.' };
    }
    if (victimUser.hiddenUntil && victimUser.hiddenUntil > Date.now()) {
        activeHeists.delete(robberId);
        return { error: 'Ujeedada hadda waa qarsoon, xatooyo ma suuroobi karto.' };
    }

    if (!/^[0-9]{4}$/.test(guessCode)) {
        return { error: 'Fadlan geli 4-lambar oo sax ah si aad u qiyaasto.' };
    }

    checkEconUser(robberId);
    checkEconUser(state.victimId);
    const robberEcon = econData[robberId];
    const victimEcon = econData[state.victimId];

    if (guessCode[state.revealIndex] !== state.revealedDigit) {
        state.attemptsLeft -= 1;
        if (state.attemptsLeft <= 0) {
            robberEcon.btc = Math.max(0, (robberEcon.btc || 0) - 100);
            saveEcon();
            activeHeists.delete(robberId);
            return { failure: true, attemptsLeft: 0, penalty: { cash: 100 }, message: 'Qiyaastaada waa khalad xad dhaaf ah. 100 BTC ayaa lagaa jaray.' };
        }
        return { failure: true, attemptsLeft: state.attemptsLeft, message: `Lambarka la soo bandhigay waa khalad ama ma lahan meel sax ah. Waxaa kugu harsan ${state.attemptsLeft} isku day.` };
    }

    if (guessCode !== victimUser.password) {
        state.attemptsLeft -= 1;
        if (state.attemptsLeft <= 0) {
            robberEcon.btc = Math.max(0, (robberEcon.btc || 0) - 100);
            saveEcon();
            activeHeists.delete(robberId);
            return { failure: true, attemptsLeft: 0, penalty: { cash: 100 }, message: 'Qiyaastaada waa khalad. Waxaa lagaa jaray 100 BTC.' };
        }
        return { failure: true, attemptsLeft: state.attemptsLeft, message: `Qiyaasuhu ma aha mid sax ah. Waxaa kugu harsan ${state.attemptsLeft} isku day.` };
    }

    const stealPercent = 0.18 + Math.random() * 0.12;
    const stolenCash   = Math.max(1, Math.floor((victimEcon.btc || 0) * stealPercent));

    victimEcon.btc = Math.max(0, (victimEcon.btc || 0) - stolenCash);
    robberEcon.btc = (robberEcon.btc || 0) + stolenCash;
    saveEcon();
    activeHeists.delete(robberId);

    return {
        success: true,
        stolenCash,
        message: `Xatooyadii waa guuleysatay! Waxaad ka xaday ${stolenCash} BTC.`,
    };
}

function getHeistState(robberId) {
    return activeHeists.get(robberId);
}

module.exports = { createHeist, guessHeist, getHeistState, activeHeists };
