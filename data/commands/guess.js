// =====================================================================
// AMARKA: ?guess [tiro]
// Ciyaar qiyaas waddanka ah (calanka iyo magaalo madaxda)
// =====================================================================

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { activeGames, isUserBusy, userData, saveData } = require('../../src/store');
const { checkUser, shuffleArray } = require('../../src/utils/helpers');
const { econData, checkEconUser, saveEcon } = require('../../src/economy/econStore');
const { PREFIX } = require('../../src/config');

async function finishGuessGame(message, userId, score, total) {
    activeGames.delete(userId);

    const pct = Math.round((score / total) * 100);
    let comment = '';
    if (pct >= 80) {
        comment = '🌟 **Aad u fiican!** Aqoontaada juqraafiga waa mid heer sare ah!';
    } else if (pct >= 50) {
        comment = '👍 **Wanaagsan!** Wax badan waad ka garatay wadamada.';
    } else {
        comment = '📚 **Sii dedaal!** Waxaad u baahan tahay inaad wax badan ka barato wadamada.';
    }

    const embed = new EmbedBuilder()
        .setTitle('🏁 Ciyaartii waa dhammaatay!')
        .setDescription(
            `### Ciyaaryahan: <@${userId}>\n\n` +
            `📊 **Natiijadaada:** **${score} / ${total}** (${pct}%)\n` +
            `${comment}\n\n` +
            `Qor \`${PREFIX}guess\` mar kale si aad u ciyaarto.`
        )
        .setColor(pct >= 80 ? 0x2ecc71 : pct >= 50 ? 0xf1c40f : 0xe74c3c);

    await message.channel.send({ embeds: [embed] }).catch(() => {});
    saveData();
}

async function askGuessQuestion(message, userId, questions, idx, score) {
    const q = questions[idx];
    if (!q) {
        return finishGuessGame(message, userId, score, questions.length);
    }

    const buttons = q.options.map((opt, i) => {
        const isCorrect = opt === q.correct;
        return new ButtonBuilder()
            .setCustomId(`guess_${idx}_${i}_${isCorrect ? 't' : 'f'}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary);
    });

    const embed = new EmbedBuilder()
        .setTitle(`🌍 Su'aal ${idx + 1} / ${questions.length}`)
        .setDescription(
            `## Qiyaas waddankan:\n\n` +
            `🚩 **Calanka:** ${q.flag}\n` +
            `🏛️ **Magaalo madaxda:** ${q.capital}\n\n` +
            `Guji badhanka hoose ee saxda ah! ⬇️`
        )
        .setColor(0x3498db)
        .setFooter({ text: `Dhibcahaaga hadda: ${score}/${questions.length} · ⏱️ 18s` });

    const row = new ActionRowBuilder().addComponents(buttons);
    const sent = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (!sent) {
        activeGames.delete(userId);
        return;
    }

    const filter = i => i.user.id === userId && i.customId.startsWith(`guess_${idx}_`);
    let collector;
    try {
        collector = sent.createMessageComponentCollector({
            filter,
            componentType: ComponentType.Button,
            time: 18000,
            max: 1
        });
    } catch (e) {
        activeGames.delete(userId);
        return;
    }

    let answered = false;

    collector.on('collect', async interaction => {
        answered = true;
        collector.stop();

        const isRight = interaction.customId.endsWith('_t');
        const correctLabel = q.correct;
        
        let newScore = score;
        let resultMsg = '';

        checkUser(userId);
        checkEconUser(userId);

        if (isRight) {
            newScore++;
            userData[userId].iq = (userData[userId].iq || 0) + 1;
            econData[userId].btc = (econData[userId].btc || 0) + 15;
            saveData();
            saveEcon();

            resultMsg = `✅ **SAXSAC!** Waa **${correctLabel}**.\n🏆 **+1 IQ** | 💰 **+15 BTC**`;
        } else {
            resultMsg = `❌ **KHALAD!** Jawaabta saxda ahayd waa **${correctLabel}**.`;
        }

        const resultEmbed = new EmbedBuilder()
            .setDescription(resultMsg)
            .setColor(isRight ? 0x2ecc71 : 0xe74c3c);

        await interaction.update({ embeds: [resultEmbed], components: [] }).catch(() => {});

        setTimeout(() => {
            askGuessQuestion(message, userId, questions, idx + 1, newScore);
        }, 1800);
    });

    collector.on('end', async (collected, reason) => {
        if (answered) return;

        // Timeout
        const correctLabel = q.correct;
        const toEmbed = new EmbedBuilder()
            .setDescription(`⏰ **Wakhtigii wuu dhammaaday!**\nJawaabta saxda ahayd waa **${correctLabel}**.`)
            .setColor(0xe74c3c);

        await sent.edit({ embeds: [toEmbed], components: [] }).catch(() => {});

        setTimeout(() => {
            askGuessQuestion(message, userId, questions, idx + 1, score);
        }, 2000);
    });
}

module.exports = async function guessCommand(message, args) {
    const userId = message.author.id;
    
    // Check if user is already busy
    const busy = isUserBusy(userId);
    if (busy) {
        return message.reply(`⚠️ Waxaad mar hore ku jirtaa ciyaar **${busy}**! Sug ilaa ay dhammaato.`);
    }

    // Load country list
    const file = path.join(__dirname, '..', '..', 'data', 'questions', 'guess.json');
    let pool = [];
    try {
        pool = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return message.reply('⚠️ Faylka su\'aalaha wadamada lama helin.');
    }

    if (pool.length === 0) {
        return message.reply('⚠️ Ma jiraan su\'aalo waddan ah oo la heli karo.');
    }

    let count = 5;
    if (args[0] !== undefined) {
        const input = parseInt(args[0]);
        if (!isNaN(input) && input >= 3 && input <= 15) {
            count = input;
        } else {
            return message.reply('⚠️ Fadlan dooro tiro u dhexaysa **3** ilaa **15** su\'aalood (tusaale: `?guess 5`).');
        }
    }

    // Pick random count questions
    const shuffled = shuffleArray(pool);
    const questions = shuffled.slice(0, Math.min(count, shuffled.length));

    // Register active game
    activeGames.set(userId, { type: 'guess' });

    const introEmbed = new EmbedBuilder()
        .setTitle('🌍 Qiyaas Waddanka (Guess the Country)')
        .setDescription(
            `Ku soo dhawaada ciyaarta Qiyaas Waddanka! 🏁\n` +
            `Waxaad heleysaa **${questions.length} su'aalood**.\n` +
            `Jawaab kasta oo sax ah: **+1 IQ** iyo **+15 BTC** 💰\n` +
            `Ma jiro wax IQ oo lagaa jarayo haddii aad qaldid.\n\n` +
            `Ciyaartu waxay bilaabaneysaa hadda! ⬇️`
        )
        .setColor(0x2ecc71);

    await message.reply({ embeds: [introEmbed] }).catch(() => {});

    await askGuessQuestion(message, userId, questions, 0, 0);
};
