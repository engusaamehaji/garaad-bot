// =====================================================================
// AMARKA: ?duel @user [tirada]
// Tusaale:
//   ?duel @user        → bot wuxuu weydiinayaa labadooda tirada (interactive)
//   ?duel @user 10     → toos buu u dirayaa casuumad 10 su'aalood ah
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
            `⚔️ **Team Duel ${format}** — dhigga qor:\n` +
            `\`iq [xaddad]\` ama \`btc [xaddad]\`\n` +
            `_Tusaale: \`iq 10\` ama \`btc 500\`_ _(30 ilbiriqsi)_`
        );
        const collected = await message.channel.awaitMessages({
            filter: m => m.author.id === userId && /^(iq|btc)\s+\d+$/i.test(m.content.trim()),
            max: 1, time: 30_000,
        }).catch(() => null);
        await prompt.delete().catch(() => {});
        if (!collected || collected.size === 0)
            return message.reply('⏰ Waqti dhammaaday — team duel waa la joojiyay.');
        const parts = collected.first().content.trim().toLowerCase().split(/\s+/);
        await collected.first().delete().catch(() => {});
        return teamDuel.cmdTeamDuel(message, [format, parts[0], parts[1]]);
    }

    const target = message.mentions.users.first();

    if (!target)              return message.reply(`Isticmaal sidan: \`${PREFIX}duel @user\` ama \`${PREFIX}duel 2v2\``);
    if (target.bot)           return message.reply('Bot lama dagaallami karo.');
    if (target.id === userId) return message.reply('Naftaada lama dagaallami kartid.');

    checkUser(userId);
    checkUser(target.id);
    if (userData[userId].iq < DUEL_STAKE_IQ || userData[target.id].iq < DUEL_STAKE_IQ) {
        return message.reply(
            `⚠️ Duel wuxuu u baahan yahay **${DUEL_STAKE_IQ} IQ** labadaba.\n` +
            `Adiga: **${userData[userId].iq}** | <@${target.id}>: **${userData[target.id].iq}**`
        );
    }

    if (activeDuels.has(message.channel.id)) {
        return message.reply('⚠️ Channel-kan mar hore ayaa dagaal ka socda. Sug ilaa uu dhamaado.');
    }

    // Hubi labadooduba inaanan ku jirin ciyaar kale
    const issuerBusy = isUserBusy(userId);
    if (issuerBusy) {
        return message.reply(`⚠️ Waxaad mar hore ku jirtaa ciyaar **${issuerBusy}**! Sug ilaa ay dhammaato.`);
    }
    const targetBusy = isUserBusy(target.id);
    if (targetBusy) {
        return message.reply(`⚠️ <@${target.id}> wuxuu mar hore ku jiraa ciyaar **${targetBusy}**! Sug ilaa ay dhammaato.`);
    }

    // ⭐ Hubi haddii tirada toos loo qoray (?duel @user 10)
    let count = DUEL_DEFAULT_QUESTIONS;
    const numArg = args.find(a => /^\d+$/.test(a));
    if (numArg) {
        const parsed = parseInt(numArg);
        if (parsed < DUEL_MIN_QUESTIONS || parsed > DUEL_MAX_QUESTIONS) {
            return message.reply(
                `⚠️ Tirada waa inay u dhexeyso **${DUEL_MIN_QUESTIONS}** iyo **${DUEL_MAX_QUESTIONS}**.\n` +
                `Tusaale: \`${PREFIX}duel @${target.username} 10\``
            );
        }
        count = parsed;
    }

    const countLine = `**Tirada su'aalaha:** ${count}\n`;

    const embed = new EmbedBuilder()
        .setTitle('⚔️ Duel Codsi')
        .setDescription(
            `<@${userId}> wuxuu ku casuumayaa <@${target.id}> dagaal fool-ka-fool ah!\n\n` +
            countLine +
            `**Dhig:** labaduba waa inay leeyihiin **${DUEL_STAKE_IQ} IQ** ama ka badan; marka la bilaabo mid kasta wuxuu dhigayaa **${DUEL_STAKE_IQ} IQ**.\n` +
            `**Guul:** guuleystaha wuxuu helayaa **+${DUEL_WIN_IQ} IQ** (lumiyaha wuxuu lumayaa dhigii).\n` +
            `**Sida:** qofka ugu horreeya ee su'aal sax u jawaaba ayaa dhibic u helaya.\n\n` +
            `<@${target.id}>, ma aqbalaysaa? *(${GLOBAL_WAIT_MS / 1000} ilbiriqsi)*`
        )
        .setColor('#e74c3c');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`accept_duel_${userId}_${target.id}_${count}`)
            .setLabel('Aqbal ✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`decline_duel_${userId}_${target.id}`)
            .setLabel('Diid ❌')
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
                content:    '⏰ Duel codsigii waqti dhammaaday — laguma jawaabin.',
                embeds:     [],
                components: [],
            }).catch(() => {});
        } catch {}
    }, GLOBAL_WAIT_MS);
};
