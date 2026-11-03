// =====================================================================
// AMARKA: ?duel @user [tirada]
// Example:
//   ?duel @user        → bot wuxuu weydiinayaa labadooda tirada (interactive)
//   ?duel @user 10     → toos buu u dirayaa casuumad 10 questions ah
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { activeDuels, isUserBusy, userData } = require('../../src/store');
const { checkUser } = require('../../src/utils/helpers');
const {
    PREFIX,
    GLOBAL_WAIT_MS,
    DUEL_MIN_QUESTIONS,
    DUEL_MAX_QUESTIONS,
    DUEL_DEFAULT_QUESTIONS,
    DUEL_STAKE_IQ,
    DUEL_WIN_IQ,
} = require('../../src/config');
const teamDuel = require('../../src/games/teamDuel');

module.exports = async function duelCommand(message, args) {
    const userId = message.author.id;

    // ── Team Duel: ?duel 2v2 / ?duel 3v3 ──
    const teamArg = (args[0] || '').toLowerCase();
    const teamMap = { '2v2': '2v2', '2vs2': '2v2', '3v3': '3v3', '3vs3': '3v3' };
    if (teamMap[teamArg]) {
        const format = teamMap[teamArg];
        const prompt = await message.reply(
            `⚔️ **Team Duel ${format}** — enter the stake:\n` +
            `\`iq [amount]\` or \`coins [amount]\`\n` +
            `_Example: \`iq 10\` or \`coins 500\`_ _(30 seconds)_`
        );
        const collected = await message.channel.awaitMessages({
            filter: m => m.author.id === userId && /^(iq|coins)\s+\d+$/i.test(m.content.trim()),
            max: 1, time: 30_000,
        }).catch(() => null);
        await prompt.delete().catch(() => {});
        if (!collected || collected.size === 0)
            return message.reply('⏰ Time expired — the team duel was cancelled.');
        const parts = collected.first().content.trim().toLowerCase().split(/\s+/);
        await collected.first().delete().catch(() => {});
        return teamDuel.cmdTeamDuel(message, [format, parts[0], parts[1]]);
    }

    const target = message.mentions.users.first();

    if (!target)              return message.reply(`Use this format: \`${PREFIX}duel @user\` or \`${PREFIX}duel 2v2\`.`);
    if (target.bot)           return message.reply('You cannot duel a bot.');
    if (target.id === userId) return message.reply('You cannot duel yourself.');

    checkUser(userId);
    checkUser(target.id);
    if (userData[userId].iq < DUEL_STAKE_IQ || userData[target.id].iq < DUEL_STAKE_IQ) {
        return message.reply(
            `⚠️ Both players need at least **${DUEL_STAKE_IQ} IQ** to duel.\n` +
            `You: **${userData[userId].iq}** | <@${target.id}>: **${userData[target.id].iq}**`
        );
    }

    if (activeDuels.has(message.channel.id)) {
        return message.reply('⚠️ A duel is already active in this channel. Wait for it to finish.');
    }

    // Hubi labadooduba inaanan ku jirin game kale
    const issuerBusy = isUserBusy(userId);
    if (issuerBusy) {
        return message.reply(`⚠️ You are already in a game **${issuerBusy}**! Wait for it to finish.`);
    }
    const targetBusy = isUserBusy(target.id);
    if (targetBusy) {
        return message.reply(`⚠️ <@${target.id}> is already playing **${targetBusy}**. Wait for that game to finish.`);
    }

    // ⭐ Hubi if tirada toos loo qoray (?duel @user 10)
    let count = DUEL_DEFAULT_QUESTIONS;
    const numArg = args.find(a => /^\d+$/.test(a));
    if (numArg) {
        const parsed = parseInt(numArg);
        if (parsed < DUEL_MIN_QUESTIONS || parsed > DUEL_MAX_QUESTIONS) {
            return message.reply(
                `⚠️ The question count must be between **${DUEL_MIN_QUESTIONS}** and **${DUEL_MAX_QUESTIONS}**.\n` +
                `Example: \`${PREFIX}duel @${target.username} 10\``
            );
        }
        count = parsed;
    }

    const countLine = `**Questions:** ${count}\n`;

    const embed = new EmbedBuilder()
        .setTitle('⚔️ Duel Challenge')
        .setDescription(
            `<@${userId}> challenged <@${target.id}> to a duel!\n\n` +
            countLine +
            `**Stake:** Both players need at least **${DUEL_STAKE_IQ} IQ**; each stakes **${DUEL_STAKE_IQ} IQ** to start.\n` +
            `**Prize:** The winner earns **+${DUEL_WIN_IQ} IQ**. The loser forfeits their stake.\n` +
            `**How to win:** Be the first player to answer a question correctly.\n\n` +
            `<@${target.id}>, do you accept? *(${GLOBAL_WAIT_MS / 1000} seconds)*`
        )
        .setColor('#e74c3c');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`accept_duel_${userId}_${target.id}_${count}`)
            .setLabel('Accept ✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`decline_duel_${userId}_${target.id}`)
            .setLabel('Decline ❌')
            .setStyle(ButtonStyle.Danger),
    );

    const sent = await message.reply({
        content:    `${target}`,
        embeds:     [embed],
        components: [row],
        fetchReply: true,
    });

    setTimeout(async () => {
        try {
            const fresh = await sent.fetch().catch(() => null);
            if (!fresh || fresh.components.length === 0) return;
            await sent.edit({
                content:    '⏰ The duel challenge expired without a response.',
                embeds:     [],
                components: [],
            }).catch(() => {});
        } catch {}
    }, GLOBAL_WAIT_MS);
};
