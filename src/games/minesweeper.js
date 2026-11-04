const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isUserBusy, userData, saveData } = require('../store');
const { addXp, checkUser } = require('../utils/helpers');

const activeMinesweeperGames = new Map(); // gameId -> game state
const INVITE_TIMEOUT_MS = 60_000;
const TURN_TIMEOUT_MS = 60_000;

function randomGrid(mineCount, solo = false) {
    const grid = Array(20).fill('safe');
    const mines = new Set();
    while (mines.size < mineCount) mines.add(Math.floor(Math.random() * grid.length));
    for (const index of mines) grid[index] = 'mine';
    if (solo) {
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === 'safe') grid[i] = Math.floor(Math.random() * 8) + 3;
        }
    }
    return grid;
}

function boardEmbed(game, ended = false) {
    let gridText = '';
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
            const index = row * 5 + col;
            if (!game.revealed[index]) gridText += '⬜ ';
            else if (game.grid[index] === 'mine') gridText += '💥 ';
            else if (game.solo) gridText += `**${game.grid[index]}** `;
            else gridText += '✅ ';
        }
        gridText += '\n';
    }

    const embed = new EmbedBuilder()
        .setTitle(game.solo ? '💣 Miino — Minefield' : '💣 Miino — Two Player')
        .setColor(ended ? '#e74c3c' : '#3498db')
        .setDescription(
            gridText + '\n' +
            (game.solo
                ? `🪙 Potential XP: **${game.potentialXp}**\nSafe tiles: **${game.safeRevealed}/16** · Mines: **4**`
                : `Players: <@${game.p1}> vs <@${game.p2}>\n` +
                  `Current turn: <@${game.currentTurn}>\nMoves: **${game.moves}** · Mines: **${game.mineCount}**\n` +
                  `Winner reward: **${game.xpReward} XP**`)
        );
    return embed;
}

function tileRows(game) {
    const rows = [];
    for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
        const row = new ActionRowBuilder();
        for (let col = 0; col < 5; col++) {
            const index = rowIndex * 5 + col;
            const revealed = game.revealed[index];
            const label = revealed
                ? (game.grid[index] === 'mine' ? '💥' : game.solo ? String(game.grid[index]) : '✅')
                : '⬜';
            row.addComponents(new ButtonBuilder()
                .setCustomId(`miino_tile_${game.gameId}_${index}`)
                .setLabel(label)
                .setStyle(revealed ? (game.grid[index] === 'mine' ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Secondary)
                .setDisabled(revealed));
        }
        rows.push(row);
    }
    if (game.solo) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`miino_cash_${game.gameId}`)
                .setLabel(`Cash out (${game.potentialXp} XP)`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(game.potentialXp <= 0),
        ));
    }
    return rows;
}

function pickMinesweeperDifficultyRow(gameId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`miino_diff_easy_${gameId}`).setLabel('Easy · 4 mines · 20 XP').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`miino_diff_medium_${gameId}`).setLabel('Medium · 5 mines · 30 XP').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`miino_diff_extreme_${gameId}`).setLabel('Extreme · 7 mines · 50 XP').setStyle(ButtonStyle.Danger),
    );
}

function resetTimer(game) {
    clearTimeout(game.timer);
    game.timer = setTimeout(() => {
        handleTimeout(game).catch(() => {});
    }, TURN_TIMEOUT_MS);
}

async function finishSolo(game, message, title, description, color) {
    if (activeMinesweeperGames.get(game.gameId) !== game) return;
    clearTimeout(game.timer);
    activeMinesweeperGames.delete(game.gameId);
    game.phase = 'finished';
    const payload = {
        embeds: [boardEmbed(game, true).setTitle(title).setDescription(`${boardEmbed(game, true).data.description}\n\n${description}`).setColor(color)],
        components: tileRows(game).map(row => {
            row.components.forEach(component => component.setDisabled(true));
            return row;
        }),
    };
    if (typeof message.update === 'function') await message.update(payload).catch(() => {});
    else {
        await game.prompt?.edit(payload).catch(() => {});
        await message.channel.send(description).catch(() => {});
    }
}

async function finishDuo(game, message, winnerId, title, description, color = '#2ecc71') {
    if (activeMinesweeperGames.get(game.gameId) !== game) return;
    clearTimeout(game.timer);
    activeMinesweeperGames.delete(game.gameId);
    game.phase = 'finished';
    let rewardLine = '';
    if (winnerId) {
        checkUser(winnerId);
        addXp(winnerId, game.xpReward);
        saveData();
        rewardLine = `\n\n🏆 <@${winnerId}> wins **+${game.xpReward} XP**!`;
    }
    const payload = {
        embeds: [boardEmbed(game, true).setTitle(title).setDescription(`${boardEmbed(game, true).data.description}\n\n${description}${rewardLine}`).setColor(color)],
        components: tileRows(game).map(row => {
            row.components.forEach(component => component.setDisabled(true));
            return row;
        }),
    };
    if (typeof message.update === 'function') await message.update(payload).catch(() => {});
    else {
        await game.prompt?.edit(payload).catch(() => {});
        await message.channel.send(`${description}${rewardLine}`).catch(() => {});
    }
}

async function handleTimeout(game) {
    if (activeMinesweeperGames.get(game.gameId) !== game) return;
    if (game.solo) {
        return finishSolo(game, game, '⏰ Miino — Time Expired', `⏰ <@${game.p1}> ran out of time. Potential XP was lost.`, '#e74c3c');
    }
    const winnerId = game.currentTurn === game.p1 ? game.p2 : game.p1;
    return finishDuo(game, game, winnerId, '⏰ Miino — Turn Expired', `<@${game.currentTurn}> ran out of time.`, '#e74c3c');
}

async function startSolo(message) {
    const playerId = message.author.id;
    const gameId = `solo_${playerId}_${Date.now().toString(36)}`;
    const grid = randomGrid(4, true);
    const game = {
        gameId, p1: playerId, solo: true, phase: 'playing', channel: message.channel,
        grid, revealed: Array(20).fill(false), safeRevealed: 0, potentialXp: 0, timer: null,
    };
    activeMinesweeperGames.set(gameId, game);
    game.prompt = await message.reply({ embeds: [boardEmbed(game)], components: tileRows(game) }).catch(() => null);
    if (!game.prompt) {
        activeMinesweeperGames.delete(gameId);
        return;
    }
    resetTimer(game);
}

async function handleTile(interaction, gameId, tileIndex) {
    const game = activeMinesweeperGames.get(gameId);
    if (!game || game.phase !== 'playing')
        return interaction.reply({ content: 'This Miino game has ended.', ephemeral: true });
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= 20)
        return interaction.reply({ content: 'That tile is not valid.', ephemeral: true });
    if (game.revealed[tileIndex])
        return interaction.reply({ content: 'That tile is already open.', ephemeral: true });
    if (game.solo && interaction.user.id !== game.p1)
        return interaction.reply({ content: 'This is another player’s Miino board.', ephemeral: true });
    if (!game.solo && interaction.user.id !== game.currentTurn)
        return interaction.reply({ content: 'It is the other player’s turn.', ephemeral: true });

    game.revealed[tileIndex] = true;
    clearTimeout(game.timer);
    if (!game.solo) game.moves++;

    if (game.grid[tileIndex] === 'mine') {
        game.revealed.fill(true);
        if (game.solo) {
            return finishSolo(game, interaction, '💣 Miino — Bomb!', `💥 <@${game.p1}> hit a mine and lost **${game.potentialXp} potential XP**.`, '#e74c3c');
        }
        const winnerId = interaction.user.id === game.p1 ? game.p2 : game.p1;
        return finishDuo(game, interaction, winnerId, '💣 Miino — Bomb!', `<@${interaction.user.id}> hit a mine!`, '#e74c3c');
    }

    if (game.solo) {
        game.safeRevealed++;
        game.potentialXp += game.grid[tileIndex];
        if (game.safeRevealed === 16) {
            const bonusXp = 30;
            addXp(game.p1, game.potentialXp + bonusXp);
            saveData();
            const earned = game.potentialXp + bonusXp;
            return finishSolo(game, interaction, '🏆 Miino — Perfect Clear!', `🎉 All safe tiles opened. <@${game.p1}> earned **+${earned} XP** (includes +${bonusXp} bonus).`, '#f1c40f');
        }
        await interaction.update({ embeds: [boardEmbed(game)], components: tileRows(game) });
        resetTimer(game);
        return;
    }

    const safeTilesLeft = game.grid.filter((value, index) => value === 'safe' && !game.revealed[index]).length;
    if (safeTilesLeft === 0) {
        game.revealed.fill(true);
        return finishDuo(game, interaction, interaction.user.id, '🏆 Miino — Perfect Clear!', `<@${interaction.user.id}> opened every safe tile!` , '#f1c40f');
    }

    game.currentTurn = interaction.user.id === game.p1 ? game.p2 : game.p1;
    await interaction.update({ embeds: [boardEmbed(game)], components: tileRows(game) });
    resetTimer(game);
}

async function handleDifficulty(interaction, gameId, difficulty) {
    const game = activeMinesweeperGames.get(gameId);
    if (!game || game.phase !== 'difficulty')
        return interaction.reply({ content: 'This Miino challenge has expired.', ephemeral: true });
    if (interaction.user.id !== game.p1)
        return interaction.reply({ content: 'Only the challenger can select the difficulty.', ephemeral: true });
    const options = { easy: [4, 20], medium: [5, 30], extreme: [7, 50] };
    const selected = options[difficulty];
    if (!selected) return interaction.reply({ content: 'Choose a valid difficulty.', ephemeral: true });

    clearTimeout(game.timer);
    game.mineCount = selected[0];
    game.xpReward = selected[1];
    game.grid = randomGrid(game.mineCount);
    game.revealed = Array(20).fill(false);
    game.moves = 0;
    game.currentTurn = Math.random() < 0.5 ? game.p1 : game.p2;
    game.phase = 'playing';
    game.prompt = interaction.message;
    await interaction.update({ embeds: [boardEmbed(game)], components: tileRows(game) });
    resetTimer(game);
}

async function miinoCommand(message) {
    const challengerId = message.author.id;
    const target = message.mentions.users.first();
    const challengerBusy = isUserBusy(challengerId);
    if (challengerBusy) return message.reply(`You are already playing **${challengerBusy}**.`);

    if (!target) return startSolo(message);
    if (target.bot) return message.reply('Bots cannot play Miino.');
    if (target.id === challengerId) return message.reply('You cannot challenge yourself.');
    const targetBusy = isUserBusy(target.id);
    if (targetBusy) return message.reply(`<@${target.id}> is already playing **${targetBusy}**.`);

    const gameId = `duo_${message.channel.id}_${Date.now().toString(36)}`;
    const game = { gameId, p1: challengerId, p2: target.id, solo: false, phase: 'pending', channel: message.channel };
    activeMinesweeperGames.set(gameId, game);
    const sent = await message.reply({
        content: `${target}`,
        embeds: [new EmbedBuilder()
            .setTitle('💣 Miino — Challenge')
            .setColor('#3498db')
            .setDescription(`<@${challengerId}> challenged <@${target.id}> to a turn based minefield game. Select safe tiles and avoid the bombs.`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`miino_accept_${gameId}`).setLabel('Accept ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`miino_decline_${gameId}`).setLabel('Decline ❌').setStyle(ButtonStyle.Danger),
        )],
        fetchReply: true,
    }).catch(() => null);
    if (!sent) {
        activeMinesweeperGames.delete(gameId);
        return;
    }
    const collector = sent.createMessageComponentCollector({
        filter: interaction => interaction.customId === `miino_accept_${gameId}` || interaction.customId === `miino_decline_${gameId}`,
        time: INVITE_TIMEOUT_MS,
    });
    collector.on('collect', async interaction => {
        if (interaction.user.id !== game.p2)
            return interaction.reply({ content: 'This challenge is for the mentioned player only.', ephemeral: true }).catch(() => {});
        if (interaction.customId === `miino_decline_${gameId}`) {
            activeMinesweeperGames.delete(gameId);
            game.phase = 'finished';
            collector.stop('declined');
            return interaction.update({ content: '❌ Miino challenge declined.', embeds: [], components: [] }).catch(() => {});
        }
        game.phase = 'difficulty';
        collector.stop('accepted');
        await interaction.update({
            content: `✅ <@${game.p2}> accepted! <@${game.p1}> choose difficulty:`,
            embeds: [],
            components: [pickMinesweeperDifficultyRow(gameId)],
        }).catch(() => {});
        game.timer = setTimeout(() => {
            activeMinesweeperGames.delete(gameId);
            game.phase = 'finished';
            sent.edit({ content: '⏰ Miino difficulty selection expired.', embeds: [], components: [] }).catch(() => {});
        }, INVITE_TIMEOUT_MS);
    });
    collector.on('end', async (_collected, reason) => {
        if (reason !== 'time' || activeMinesweeperGames.get(gameId) !== game) return;
        activeMinesweeperGames.delete(gameId);
        game.phase = 'finished';
        await sent.edit({ content: '⏰ Miino challenge expired.', embeds: [], components: [] }).catch(() => {});
    });
}

async function handleMiinoButton(interaction) {
    const id = interaction.customId;
    if (id.startsWith('miino_diff_')) {
        const [, , difficulty, ...rest] = id.split('_');
        return handleDifficulty(interaction, rest.join('_'), difficulty);
    }
    if (id.startsWith('miino_tile_')) {
        const rest = id.slice('miino_tile_'.length);
        const split = rest.lastIndexOf('_');
        const gameId = rest.slice(0, split);
        return handleTile(interaction, gameId, Number(rest.slice(split + 1)));
    }
    if (id.startsWith('miino_cash_')) {
        const gameId = id.slice('miino_cash_'.length);
        const game = activeMinesweeperGames.get(gameId);
        if (!game || !game.solo || game.phase !== 'playing')
            return interaction.reply({ content: 'This Miino game has ended.', ephemeral: true });
        if (interaction.user.id !== game.p1)
            return interaction.reply({ content: 'This is another player’s Miino board.', ephemeral: true });
        if (game.potentialXp <= 0)
            return interaction.reply({ content: 'Open a safe tile before cashing out.', ephemeral: true });
        addXp(game.p1, game.potentialXp);
        saveData();
        return finishSolo(game, interaction, '💣 Miino — Cashed Out!', `<@${game.p1}> secured **+${game.potentialXp} XP** from ${game.safeRevealed} safe tiles.`, '#2ecc71');
    }
    return interaction.reply({ content: 'This Miino button is no longer active.', ephemeral: true });
}

module.exports = { miinoCommand, activeMinesweeperGames, handleMiinoButton };
