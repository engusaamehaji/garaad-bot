const { EmbedBuilder } = require('discord.js');
const { userData } = require('../../src/store');
const { checkUser } = require('../../src/utils/helpers');
const { LEVEL_STEP } = require('../../src/config');

module.exports = async function levelCommand(message) {
    const userId = message.author.id;
    checkUser(userId);

    const iq = userData[userId].iq || 0;
    
    const level = Math.floor(iq / LEVEL_STEP);
    const nextLevelIq = (level + 1) * LEVEL_STEP;
    const progressIq = iq % LEVEL_STEP;
    const progressPercent = Math.floor((progressIq / LEVEL_STEP) * 100);
    
    // Create a simple progress bar
    const filledBlocks = Math.floor(progressPercent / 10);
    const emptyBlocks = 10 - filledBlocks;
    const progressBar = '🟩'.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Level Profile: ${message.author.username}`)
        .setColor('#3498db')
        .addFields(
            { name: '🧠 Current IQ', value: `${iq}`, inline: true },
            { name: '🎖️ Current Level', value: `${level}`, inline: true },
            { name: `📈 Progress to Level ${level + 1}`, value: `${progressBar} ${progressPercent}%\n(${progressIq}/${LEVEL_STEP} IQ needed for next level)`, inline: false }
        )
        .setFooter({ text: `Every ${LEVEL_STEP} IQ = 1 Level!` });

    return message.reply({ embeds: [embed] });
};
