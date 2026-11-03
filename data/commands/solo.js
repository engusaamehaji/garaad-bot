// =====================================================================
// AMARKA: ?solo  (interactive — bot wuxuu weydiinayaa tirada su'aalaha)
// Example:
//   ?solo        → bot wuxuu weydiinayaa "Imisa questions?" → user qoraa "10"
//   ?solo 10     → toos buu u bilaabmayaa 10 questions
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { isUserBusy, activeGames, userData, saveData } = require('../../src/store');
const { pickQuestionsForGame, noQuestionsLeftEmbed, resetSeenSoloQuestions, clearReplayFlag } = require('../../src/utils/questions');
const { sendQuestion } = require('../../src/games/solo');
const { checkUser } = require('../../src/utils/helpers');
const { PREFIX, SOLO_MIN_QUESTIONS, SOLO_MAX_QUESTIONS } = require('../../src/config');

function soloIntroEmbed() {
    return new EmbedBuilder()
        .setTitle('📘 Solo Game Guide')
        .setDescription(
            '**How to play:**\n' +
            '• Correct answer: **points + 10 Coins** 💰\n' +
            '• Incorrect answer or timeout: **−1 IQ** + **10 Coins** (time reward)\n' +
            '• Finish with **80+ points** to earn IQ ✅\n' +
            '• Finish with **under 80 points** to earn Coins only\n\n' +
            '**90%+ correct** = 🌟 Excellent! | **80–89%** = ✨ Great!\n\n' +
            'After you answer every question, the game restarts automatically. Replay rounds award Coins instead of IQ.'
        )
        .setColor('#3498db');
}

// Sharrax: start the game solo iyada oo la useayo tirada gaarka ah
async function startSoloGame(message, count) {
    const userId = message.author.id;

    checkUser(userId);
    const d = userData[userId];

    // Hubi the limit 30 IQ maalintiiba
    const dayKey = new Date().toISOString().slice(0, 10);
    if (d.soloIqDayKey !== dayKey) { d.soloIqDayKey = dayKey; d.soloIqToday = 0; saveData(); }
    if ((d.soloIqToday || 0) >= 30) {
        const { EmbedBuilder } = require('discord.js');
        return message.reply({ embeds: [
            new EmbedBuilder()
                .setTitle('🚫 Solo — Daily Limit Reached')
                .setDescription(
                    `✅ You have earned today's **30 IQ** from Solo.\n\n` +
                    `Play another game to earn IQ:\n` +
                    `🎓 \`${PREFIX}quiz\` — Group quiz\n` +
                    `⚔️ \`${PREFIX}duel @player\` — Challenge another player\n\n` +
                    `_Your Solo limit resets tomorrow._`
                )
                .setColor('#e74c3c'),
        ]});
    }

    if (!d.seenSoloIntro || d.iq <= 0) {
        await message.reply({ embeds: [soloIntroEmbed()] });
        if (d.iq > 0) {
            d.seenSoloIntro = true;
            saveData();
        }
    }

    const busy = isUserBusy(userId);
    if (busy) {
        return message.reply(`⚠️ You are already in a game **${busy}**! Wait for it to finish.`);
    }

    let picked = pickQuestionsForGame(userId, 'solo', count);

    // If questions dhammaan (user-ku wuu arkey dhammaan) → dib u start
    if (!picked || picked.length === 0) {
        resetSeenSoloQuestions(userId);
        await message.reply(
            `🔄 **${message.author.username}**, you have seen every Solo question. The question set has been reset!\n` +
            `⚠️ **Note:** Replay games award Coins instead of IQ.\n` +
            `💰 Earn **+10 Coins** for each question you answer.`
        );
        picked = pickQuestionsForGame(userId, 'solo', count);
        if (!picked || picked.length === 0) {
            return message.reply({ embeds: [noQuestionsLeftEmbed(message.author.username)] });
        }
    } else {
        clearReplayFlag(userId, 'soloReplaying');
    }

    // ⭐ If questions cusub ka yar yihiin tirada la codsaday → ka warbixi
    let actualCount = picked.length;
    if (actualCount < count) {
        await message.reply(
            `📚 **${message.author.username}**, only **${actualCount}** unseen questions are available (you requested ${count}).\n` +
            `This game will have **${actualCount}** questions.`
        );
    }

    activeGames.set(userId, { questions: picked, total: actualCount, originMsg: message, channelId: message.channel.id });
    sendQuestion(message, 1);
}

module.exports = async function soloCommand(message, args) {
    const userId = message.author.id;

    // 1. Hubi in user-ku ku jiro game kale
    const busy = isUserBusy(userId);
    if (busy) {
        return message.reply(`⚠️ You are already in a game **${busy}**! Wait for it to finish.`);
    }

    // 2. If user-ku tilmaamay tirada toos ah (?solo 10), start toos
    if (args[0] !== undefined) {
        const count = parseInt(args[0]);
        if (isNaN(count) || count < SOLO_MIN_QUESTIONS || count > SOLO_MAX_QUESTIONS) {
            return message.reply(
                `⚠️ The question count must be between **${SOLO_MIN_QUESTIONS}** and **${SOLO_MAX_QUESTIONS}**.\n` +
                `Example: \`${PREFIX}solo 10\``
            );
        }
        return startSoloGame(message, count);
    }

    // 3. If kale, weydii user-ka tirada (interactive)
    await message.reply(
        `🎯 **${message.author.username}**, how many questions would you like?\n` +
        `Choose a number from **${SOLO_MIN_QUESTIONS}** to **${SOLO_MAX_QUESTIONS}** (e.g. \`10\` or \`25\`).\n` +
        `_(You have 30 seconds to reply.)_`
    );

    const filter    = m => m.author.id === userId && /^\d+$/.test(m.content.trim());
    const collected = await message.channel.awaitMessages({
        filter, max: 1, time: 30000,
    });

    if (collected.size === 0) {
        return message.channel.send(`⏰ <@${userId}>, time expired. Use \`${PREFIX}solo\` to try again.`);
    }

    const reply = collected.first();
    const count = parseInt(reply.content.trim());

    if (count < SOLO_MIN_QUESTIONS || count > SOLO_MAX_QUESTIONS) {
        return reply.reply(
            `⚠️ The question count must be between **${SOLO_MIN_QUESTIONS}** and **${SOLO_MAX_QUESTIONS}**.\n` +
            `Use \`${PREFIX}solo\` to try again.`
        );
    }

    return startSoloGame(reply, count);
};
