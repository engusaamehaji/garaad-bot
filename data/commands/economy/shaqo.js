const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser, saveEcon, trackEarning } = require('../../../src/economy/econStore');

const WORK_COOLDOWN = 8 * 60 * 60 * 1000;
const WORK_BTC      = 150;

const JOBS = [
    { title: 'Software Developer',  emoji: '💻', desc: 'Built and deployed a new app. Clean code, zero bugs.' },
    { title: 'Data Analyst',        emoji: '📊', desc: 'Analyzed market data and delivered key insights.' },
    { title: 'Web Designer',        emoji: '🌐', desc: 'Designed and launched a clean responsive website.' },
    { title: 'App Tester',          emoji: '📱', desc: 'Ran a full QA cycle and filed detailed bug reports.' },
    { title: 'IT Support',          emoji: '🛠️', desc: 'Fixed network issues across the office. All green.' },
    { title: 'UI/UX Designer',      emoji: '🎨', desc: 'Delivered polished mockups. Approved on first pass.' },
    { title: 'Security Analyst',    emoji: '🔐', desc: 'Found and patched three critical vulnerabilities.' },
    { title: 'Cloud Engineer',      emoji: '☁️', desc: 'Migrated infrastructure to cloud. 40% cost reduction.' },
];

module.exports = async function shaqoCmd(message) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];
    d.lastWork ??= 0;

    const elapsed = Date.now() - d.lastWork;

    if (elapsed < WORK_COOLDOWN) {
        const rem   = WORK_COOLDOWN - elapsed;
        const hours = Math.floor(rem / 3600000);
        const mins  = Math.floor((rem % 3600000) / 60000);
        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('⏳ Work — On Cooldown')
            .setColor('#e74c3c')
            .setDescription(`You need to rest before working again.\n\n🕐 Come back in **${hours}h ${mins}m**.`)
            .setFooter({ text: 'Garaad Economy • Every 8 hours' })] });
    }

    d.btc      = (d.btc || 0) + WORK_BTC;
    d.lastWork = Date.now();
    trackEarning(userId, WORK_BTC);
    saveEcon();

    const job = JOBS[Math.floor(Math.random() * JOBS.length)];

    return message.reply({ embeds: [new EmbedBuilder()
        .setTitle(`${job.emoji} ${job.title}`)
        .setColor('#2ecc71')
        .setDescription(job.desc)
        .addFields(
            { name: '💰 Earned',      value: `**+₿ ${WORK_BTC.toLocaleString()}**`,  inline: true },
            { name: '💳 Wallet',      value: `**₿ ${d.btc.toLocaleString()}**`,      inline: true },
            { name: '⏳ Next Shift',  value: '**In 8 hours**',                        inline: true },
        )
        .setFooter({ text: 'Garaad Economy • Work every 8 hours' })],
    components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_shaqo_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    )]});
};
