// =====================================================================
// Imposter — button / interaction handlers
// =====================================================================

const { EmbedBuilder, MessageFlags } = require('discord.js');
const {
    games,
    lobbyEmbed,
    lobbyRow,
    startingEmbed,
    startGame,
    beginVoting,
    targetRows,
    aliveCitizens,
    isImposter,
    nightPickEmbed,
    MIN_PLAYERS,
    MAX_PLAYERS,
} = require('./index');

function findLobbyByHost(hostId) {
    return [...games.values()].find(g => g.hostId === hostId && g.phase === 'lobby');
}

async function safeReply(interaction, content) {
    try {
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch {
        return null;
    }
}

async function handleImposterInteraction(interaction) {
    const id = interaction.customId;

    // ── Join ────────────────────────────────────────────────────────
    if (id.startsWith('imp_join_')) {
        const hostId = id.replace('imp_join_', '');
        const game = findLobbyByHost(hostId);
        if (!game) return safeReply(interaction, '⚠️ Lobby not found.');
        if (game.starting) return safeReply(interaction, '⚠️ Game is already starting.');
        if (game.players.size >= MAX_PLAYERS) {
            return safeReply(interaction, `⚠️ Lobby is full (max ${MAX_PLAYERS}).`);
        }
        if (game.players.has(interaction.user.id)) {
            return safeReply(interaction, '⚠️ You already joined.');
        }

        game.players.set(interaction.user.id, null);
        game.lobbyMsg = interaction.message;
        const embed = await lobbyEmbed(game, interaction.client);
        await interaction.update({ embeds: [embed], components: [lobbyRow(hostId)] });
        return;
    }

    // ── Leave ───────────────────────────────────────────────────────
    if (id.startsWith('imp_leave_')) {
        const hostId = id.replace('imp_leave_', '');
        const game = findLobbyByHost(hostId);
        if (!game) return safeReply(interaction, '⚠️ Lobby not found.');
        if (interaction.user.id === hostId) {
            return safeReply(interaction, '⚠️ Host cannot leave. Use `?imposter stop` (admin) to cancel.');
        }
        if (!game.players.has(interaction.user.id)) {
            return safeReply(interaction, '⚠️ You are not in this lobby.');
        }

        game.players.delete(interaction.user.id);
        game.lobbyMsg = interaction.message;
        const embed = await lobbyEmbed(game, interaction.client);
        await interaction.update({ embeds: [embed], components: [lobbyRow(hostId)] });
        return;
    }

    // ── Start (host only) ───────────────────────────────────────────
    if (id.startsWith('imp_start_')) {
        const hostId = id.replace('imp_start_', '');
        if (interaction.user.id !== hostId) {
            return safeReply(interaction, '⚠️ Only the host can start the game.');
        }
        const game = findLobbyByHost(hostId);
        if (!game) return safeReply(interaction, '⚠️ Lobby not found.');
        if (game.starting) return safeReply(interaction, '⚠️ Game is already starting.');
        if (game.players.size < MIN_PLAYERS) {
            return safeReply(interaction, 'Need at least 3 players.');
        }

        game.starting = true;
        clearTimeout(game.lobbyTimer);
        await interaction.update({ embeds: [startingEmbed()], components: [] });
        await startGame(game, interaction.client);
        return;
    }

    // ── Page navigation ─────────────────────────────────────────────
    if (id.startsWith('imp_page_')) {
        const parts = id.split('_'); // imp_page_kind_guildId_page
        const kind = parts[2];
        const guildId = parts[3];
        const page = parseInt(parts[4], 10) || 0;
        const game = games.get(guildId);
        if (!game) return safeReply(interaction, '⚠️ Game not found.');

        if (kind === 'vote') {
            if (game.phase !== 'vote') return safeReply(interaction, '⚠️ Voting is not active.');
            await beginVoting(game, interaction.client, page);
            return interaction.deferUpdate().catch(() => {});
        }

        if (kind === 'night') {
            if (game.phase !== 'night') return safeReply(interaction, '⚠️ Night phase is not active.');
            const player = game.players.get(interaction.user.id);
            if (!player || !player.alive || !isImposter(player.role)) {
                return safeReply(interaction, '⚠️ You are not an Imposter.');
            }

            const targets = aliveCitizens(game);
            const { rows, page: safePage, pages } = await targetRows(
                targets,
                interaction.client,
                `imp_night_kill_${game.guildId}`,
                `imp_page_night_${game.guildId}`,
                page
            );
            return interaction.update({
                embeds: [nightPickEmbed(safePage, pages)],
                components: rows,
            });
        }
    }

    // ── Night kill vote (DM) ────────────────────────────────────────
    if (id.startsWith('imp_night_kill_')) {
        const parts = id.split('_'); // imp_night_kill_guildId_targetId
        const guildId = parts[3];
        const targetId = parts[4];
        const game = games.get(guildId);
        if (!game || game.phase !== 'night') {
            return safeReply(interaction, '⚠️ Night phase is not active.');
        }

        const player = game.players.get(interaction.user.id);
        const target = game.players.get(targetId);
        if (!player || !player.alive || !isImposter(player.role)) {
            return safeReply(interaction, '⚠️ You are not an Imposter.');
        }
        if (!target || !target.alive || isImposter(target.role)) {
            return safeReply(interaction, '⚠️ That player cannot be targeted.');
        }

        const na = game.nightActions;
        if (!na) return safeReply(interaction, '⚠️ Night actions unavailable.');

        // Prevent double-voting spam — update is allowed once, then buttons disabled
        const already = na.imposterVotes.has(interaction.user.id);
        na.imposterVotes.set(interaction.user.id, targetId);

        let tn = targetId;
        try {
            const u = await interaction.client.users.fetch(targetId);
            tn = u.username;
        } catch { /* ignore */ }

        await interaction.update({
            embeds: [new EmbedBuilder()
                .setColor(0x9b59b6)
                .setDescription(
                    already
                        ? `🗡️ Vote updated: **${tn}**. Waiting for night to end...`
                        : `🗡️ You voted to eliminate: **${tn}**. Waiting for night to end...`
                )],
            components: [],
        });
        return;
    }

    // ── Day vote ────────────────────────────────────────────────────
    if (id.startsWith('imp_vote_')) {
        const parts = id.split('_'); // imp_vote_guildId_targetId
        const guildId = parts[2];
        const targetId = parts[3];
        const game = games.get(guildId);
        if (!game || game.phase !== 'vote') {
            return safeReply(interaction, '⚠️ Voting is not active.');
        }

        const voter = game.players.get(interaction.user.id);
        if (!voter || !voter.alive) {
            return safeReply(interaction, '⚠️ You cannot vote.');
        }
        if (interaction.user.id === targetId) {
            return safeReply(interaction, '⚠️ You cannot vote for yourself.');
        }
        if (!game.players.get(targetId)?.alive) {
            return safeReply(interaction, '⚠️ That player is not alive.');
        }

        const already = game.votes.has(interaction.user.id);
        game.votes.set(interaction.user.id, targetId);

        let tn = targetId;
        try {
            const u = await interaction.client.users.fetch(targetId);
            tn = u.username;
        } catch { /* ignore */ }

        await safeReply(
            interaction,
            already ? `✅ Vote updated: **@${tn}**` : `✅ Your vote: **@${tn}**`
        );
        return;
    }
}

module.exports = { handleImposterInteraction };
