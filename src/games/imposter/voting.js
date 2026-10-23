// =====================================================================
// Imposter — day voting
// =====================================================================

const { VOTE_SECONDS } = require('./constants');
const { ROLES, roleLabel } = require('./roles');
const { fetchName, alivePlayers, targetRows, tallyVotes } = require('./utils');
const { votingPhaseEmbed, voteResultEmbed } = require('./embeds');
const { checkWin } = require('./win');

async function beginVoting(game, client, page = 0) {
    game.phase = 'vote';
    game.votes ??= new Map();

    const alive = alivePlayers(game);
    const { rows, page: safePage, pages } = await targetRows(
        alive,
        client,
        `imp_vote_${game.guildId}`,
        `imp_page_vote_${game.guildId}`,
        page
    );

    const payload = {
        embeds: [votingPhaseEmbed(game.round, safePage, pages)],
        components: rows,
    };

    if (game.voteMsg) {
        await game.voteMsg.edit(payload).catch(() => {});
    } else {
        game.voteMsg = await game.textChannel.send(payload);
        clearTimeout(game.voteTimer);
        game.voteTimer = setTimeout(() => resolveVote(game, client), VOTE_SECONDS * 1000);
    }
}

async function resolveVote(game, client) {
    const { beginNight } = require('./night');
    const { endGame } = require('./index');

    clearTimeout(game.voteTimer);
    if (game.phase !== 'vote') return;
    game.phase = 'resolving';

    if (game.voteMsg) {
        await game.voteMsg.edit({ components: [] }).catch(() => {});
    }

    const sorted = tallyVotes(game.votes || new Map());
    let desc = '🤷 No votes were cast. Moving to the next night.';

    if (sorted.length) {
        if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
            desc = '🤝 The vote is tied. Nobody is eliminated.';
        } else {
            const eliminated = sorted[0][0];
            const player = game.players.get(eliminated);
            if (player?.alive) {
                player.alive = false;
                const name = await fetchName(eliminated, client);
                desc = `🪓 **${name}** has been eliminated.\nThey were **${roleLabel(player.role)}**.`;

                try {
                    const user = await client.users.fetch(eliminated);
                    await user.send(
                        `🪓 You were voted out. You were a ${ROLES[player.role].name}.`
                    ).catch(() => {});
                } catch { /* ignore */ }
            }
        }
    }

    await game.textChannel.send({ embeds: [voteResultEmbed(desc)] });

    const result = checkWin(game);
    if (result) return endGame(game, client, result);

    game.round++;
    game.voteMsg = null;
    return beginNight(game, client);
}

module.exports = {
    beginVoting,
    resolveVote,
};
