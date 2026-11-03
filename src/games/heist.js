const { userData, saveData } = require('../store');
const { econData, checkEconUser, saveEcon } = require('../economy/econStore');

const activeHeists = new Map();

function getHiddenUntil(user) {
    return user.hiddenUntil && user.hiddenUntil > Date.now();
}

function createHeist(robberId, victimId) {
    const victim = userData[victimId];
    if (!victim || !victim.password) {
        return { error: 'This heist cannot start because the target has no password set.' };
    }
    if (victim.hiddenUntil && victim.hiddenUntil > Date.now()) {
        return { error: 'This player is hidden right now. You cannot rob them.' };
    }
    if (robberId === victimId) {
        return { error: 'You cannot rob yourself.' };
    }

    const password = victim.password.toString();
    if (!/^[0-9]{4}$/.test(password)) {
        return { error: 'The target does not have a valid password set.' };
    }

    checkEconUser(victimId);
    const victimCash = econData[victimId].coins || 0;
    if (victimCash <= 0) {
        return { error: 'The target has no Coins to steal.' };
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
        return { error: 'No heist is active. Start one with `?xatooyo @user`.' };
    }

    const victimUser = userData[state.victimId];
    if (!victimUser) {
        activeHeists.delete(robberId);
        return { error: 'The target could not be found. The heist was cancelled.' };
    }
    if (victimUser.hiddenUntil && victimUser.hiddenUntil > Date.now()) {
        activeHeists.delete(robberId);
        return { error: 'The target is hidden now, so the heist cannot continue.' };
    }

    if (!/^[0-9]{4}$/.test(guessCode)) {
        return { error: 'Enter a valid 4-digit code.' };
    }

    checkEconUser(robberId);
    checkEconUser(state.victimId);
    const robberEcon = econData[robberId];
    const victimEcon = econData[state.victimId];

    if (guessCode[state.revealIndex] !== state.revealedDigit) {
        state.attemptsLeft -= 1;
        if (state.attemptsLeft <= 0) {
            robberEcon.coins = Math.max(0, (robberEcon.coins || 0) - 100);
            saveEcon();
            activeHeists.delete(robberId);
            return { failure: true, attemptsLeft: 0, penalty: { cash: 100 }, message: 'Too many incorrect guesses. 100 Coins were deducted.' };
        }
        return { failure: true, attemptsLeft: state.attemptsLeft, message: `Incorrect code. ${state.attemptsLeft} attempts remaining.` };
    }

    if (guessCode !== victimUser.password) {
        state.attemptsLeft -= 1;
        if (state.attemptsLeft <= 0) {
            robberEcon.coins = Math.max(0, (robberEcon.coins || 0) - 100);
            saveEcon();
            activeHeists.delete(robberId);
            return { failure: true, attemptsLeft: 0, penalty: { cash: 100 }, message: 'Incorrect code. 100 Coins were deducted.' };
        }
        return { failure: true, attemptsLeft: state.attemptsLeft, message: `Incorrect guess. ${state.attemptsLeft} attempts remaining.` };
    }

    const stealPercent = 0.18 + Math.random() * 0.12;
    const stolenCash   = Math.max(1, Math.floor((victimEcon.coins || 0) * stealPercent));

    victimEcon.coins = Math.max(0, (victimEcon.coins || 0) - stolenCash);
    robberEcon.coins = (robberEcon.coins || 0) + stolenCash;
    saveEcon();
    activeHeists.delete(robberId);

    return {
        success: true,
        stolenCash,
        message: `The heist succeeded! You stole ${stolenCash} Coins.`,
    };
}

function getHeistState(robberId) {
    return activeHeists.get(robberId);
}

module.exports = { createHeist, guessHeist, getHeistState, activeHeists };
