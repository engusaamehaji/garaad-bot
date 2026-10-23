// =====================================================================
// Imposter — shared helpers
// =====================================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TARGETS_PER_PAGE } = require('./constants');
const { isImposter } = require('./roles');

async function fetchName(uid, client) {
    try {
        const user = await client.users.fetch(uid);
        return user.username;
    } catch {
        return 'User';
    }
}

function alivePlayers(game) {
    return [...game.players.entries()].filter(([, player]) => player.alive);
}

function aliveCitizens(game) {
    return alivePlayers(game).filter(([, player]) => !isImposter(player.role));
}

function aliveImposters(game) {
    return alivePlayers(game).filter(([, player]) => isImposter(player.role));
}

function pageCount(targets) {
    return Math.max(1, Math.ceil(targets.length / TARGETS_PER_PAGE));
}

async function targetRows(targets, client, pickPrefix, pagePrefix, page = 0) {
    const pages = pageCount(targets);
    const safePage = Math.min(Math.max(page, 0), pages - 1);
    const visible = targets.slice(safePage * TARGETS_PER_PAGE, (safePage + 1) * TARGETS_PER_PAGE);
    const buttons = [];

    for (const [uid] of visible) {
        const name = await fetchName(uid, client);
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`${pickPrefix}_${uid}`)
                .setLabel(name.slice(0, 20))
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    if (pages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${pagePrefix}_${safePage - 1}`)
                .setLabel('◀')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(safePage === 0),
            new ButtonBuilder()
                .setCustomId(`${pagePrefix}_${safePage + 1}`)
                .setLabel('▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(safePage >= pages - 1),
        ));
    }

    return { rows, page: safePage, pages };
}

function clearTimers(game) {
    if (!game) return;
    clearTimeout(game.lobbyTimer);
    clearTimeout(game.nightTimer);
    clearTimeout(game.dayTimer);
    clearTimeout(game.voteTimer);
    game.lobbyTimer = null;
    game.nightTimer = null;
    game.dayTimer = null;
    game.voteTimer = null;
}

function tallyVotes(voteMap) {
    const tally = new Map();
    for (const targetId of voteMap.values()) {
        tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

module.exports = {
    fetchName,
    alivePlayers,
    aliveCitizens,
    aliveImposters,
    pageCount,
    targetRows,
    clearTimers,
    tallyVotes,
};
