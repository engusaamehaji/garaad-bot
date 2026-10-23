// =====================================================================
// GARAAD BOT - Reminder Scheduler (24h DM)
// =====================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUsersDueForReminder, markReminderSent } = require('../utils/reminders');
const { PREFIX } = require('../config');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 saac

module.exports = function setupReminderScheduler(client) {
    async function tick() {
        try {
            const due = getUsersDueForReminder();
            if (due.length === 0) return;

            console.log(`[Reminder] ${due.length} user oo loo dirayo DM xusuusin...`);

            let success = 0, failed = 0;

            for (const userId of due) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (!user) { failed++; continue; }

                    const embed = new EmbedBuilder()
                        .setTitle('🔔 Garaad — Xusuusin')
                        .setDescription(
                            `Ku soo dhawoow! Wakhti badan ayaad ka maqnayd.\n\n` +
                            `🎁 **\`${PREFIX}today\`** ku qor server-kii Garaad si aad u qaadato dhibcahaaga maalinlaha ah!\n\n` +
                            `🧠 Sidoo kale, su'aalo cusub ayaa ku sugaya \`${PREFIX}solo\``
                        )
                        .setColor('#3498db')
                        .setFooter({ text: 'Garaad Bot — Mahadsanid' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`reminder_optout_${userId}`)
                            .setLabel('🔕 Iska xir xusuusinta')
                            .setStyle(ButtonStyle.Secondary),
                    );

                    await user.send({ embeds: [embed], components: [row] });
                    markReminderSent(userId);
                    success++;
                } catch {
                    failed++;
                    markReminderSent(userId);
                }
                await new Promise(r => setTimeout(r, 250));
            }

            console.log(`[Reminder] ✅ ${success} la diray | ❌ ${failed} guuldaray`);
        } catch (err) {
            console.error('[Reminder] Khalad scheduler-ka:', err);
        }
    }

    setTimeout(() => {
        tick();
        setInterval(tick, CHECK_INTERVAL_MS);
    }, 5 * 60 * 1000);

    console.log('[Reminder] ✅ Scheduler-ka 24h waa la bilaabay');
};
