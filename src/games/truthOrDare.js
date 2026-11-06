const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const prompts = require('../../data/games/truth-or-dare.json');

const lastPromptByMessage = new Map();
const BUTTONS = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('truthdare_truth').setLabel('Su’aal').setEmoji('💬').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('truthdare_dare').setLabel('Xujo').setEmoji('🧩').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('truthdare_random').setLabel('Random').setEmoji('🎲').setStyle(ButtonStyle.Primary),
);

function choosePrompt(type, previous) {
    const types = type === 'random' ? ['truth', 'dare'] : [type];
    const selectedType = types[Math.floor(Math.random() * types.length)];
    const choices = prompts[selectedType].filter((text) => text !== previous?.text);
    return {
        type: selectedType,
        text: choices[Math.floor(Math.random() * choices.length)] || prompts[selectedType][0],
    };
}

function promptEmbed(user, prompt) {
    const isTruth = prompt.type === 'truth';
    const avatar = user.displayAvatarURL?.();
    const embed = new EmbedBuilder()
        .setTitle('Truth or Dare')
        .setDescription(`## ${prompt.text}`)
        .setColor(isTruth ? '#009c5b' : '#dc3545');
    if (user.username) {
        embed.setAuthor({
            name: `Requested by ${user.username}`,
            ...(avatar ? { iconURL: avatar } : {}),
        });
    }
    return embed;
}

function rememberPrompt(messageId, prompt) {
    if (lastPromptByMessage.size >= 500 && !lastPromptByMessage.has(messageId)) {
        lastPromptByMessage.delete(lastPromptByMessage.keys().next().value);
    }
    lastPromptByMessage.set(messageId, prompt);
}

async function truthOrDareCommand(message) {
    if (!message.guild) return message.reply('Ciyaartan waxaa lagu ciyaaraa channel-ka server-ka si asxaabtu u wada arkaan.');
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('Truth or Dare')
            .setDescription('Dooro **Su’aal**, **Xujo**, ama **Random**.')
            .setColor('#5865f2')],
        components: [BUTTONS],
    });
}

async function handleTruthOrDareButton(interaction) {
    const type = interaction.customId.slice('truthdare_'.length);
    if (!['truth', 'dare', 'random'].includes(type)) return;
    const previous = lastPromptByMessage.get(interaction.message.id);
    const prompt = choosePrompt(type, previous);
    rememberPrompt(interaction.message.id, prompt);
    return interaction.update({ embeds: [promptEmbed(interaction.user, prompt)], components: [BUTTONS] });
}

module.exports = { truthOrDareCommand, handleTruthOrDareButton };
