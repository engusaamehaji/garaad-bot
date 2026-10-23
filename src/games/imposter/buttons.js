// =====================================================================
// Imposter — button builders
// =====================================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function lobbyRow(hostId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`imp_join_${hostId}`)
            .setLabel('Join')
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`imp_leave_${hostId}`)
            .setLabel('Leave')
            .setEmoji('🔴')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`imp_start_${hostId}`)
            .setLabel('Start Game')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary),
    );
}

/** Disable every button on every row (spam / post-action safety). */
function disableRows(rows) {
    if (!rows?.length) return [];
    return rows.map(row => {
        const next = ActionRowBuilder.from(row);
        for (const component of next.components) {
            component.setDisabled(true);
        }
        return next;
    });
}

module.exports = {
    lobbyRow,
    disableRows,
};
