// =====================================================================
// AMARKA: ?cilada [sharaxaad]
// =====================================================================

const { EmbedBuilder }       = require('discord.js');
const { userData, saveData } = require('../../src/store');
const { checkUser }          = require('../../src/utils/helpers');
const { logBug, listAdmins } = require('../../src/utils/admin');
const { PREFIX }             = require('../../src/config');

module.exports = async function ciladaCommand(message, args) {
    const userId      = message.author.id;
    const description = args.join(' ').trim();

    if (!description) {
        return message.reply(
            `⚠️ Fadlan sharax cilada.\n` +
            `**Tusaale:** \`${PREFIX}cilada Bet-ku ma siiyo dhibco markii sax la jawaabay\``
        );
    }
    if (description.length < 10) {
        return message.reply('⚠️ Sharaxaad gaaban — fadlan sii faahfaahin (ugu yaraan 10 xaraf).');
    }
    if (description.length > 1000) {
        return message.reply('⚠️ Sharaxaad aad u dheer (ugu badnaan 1000 xaraf).');
    }

    checkUser(userId);

    // Kaydi cilada
    const bug = logBug(userId, message.author.tag, description);
    userData[userId].stats.bugsReported++;
    saveData();

    // U dir admin kasta DM ahaan
    const admins   = listAdmins();
    let delivered  = 0;

    const adminEmbed = new EmbedBuilder()
        .setTitle('🐛 Cilad Cusub')
        .setDescription(`> ${description}`)
        .addFields(
            { name: '👤 Soo qoray', value: `<@${userId}> (${message.author.tag})`, inline: true },
            { name: '🆔 User ID',   value: userId,                                  inline: true },
            { name: '🕐 Wakhti',    value: new Date(bug.timestamp).toLocaleString(), inline: false },
            { name: '🌐 Server',    value: message.guild ? message.guild.name : 'DM', inline: true },
            { name: '#️⃣ Channel',  value: message.channel.name ? `#${message.channel.name}` : '—', inline: true },
        )
        .setColor('#e74c3c')
        .setFooter({ text: `Tirada cilada user-kani soo qoray: ${userData[userId].stats.bugsReported}` });

    for (const adminId of admins) {
        try {
            const admin = await message.client.users.fetch(adminId).catch(() => null);
            if (!admin) continue;
            await admin.send({ embeds: [adminEmbed] });
            delivered++;
        } catch (e) {
            // Admin wuxuu xidhay DM-yada
        }
    }

    // Xaqiijin user-ka
    const userEmbed = new EmbedBuilder()
        .setTitle('✅ Cilada waa la diray')
        .setDescription(
            `Mahadsanid in aad ina caawisay!\n\n` +
            `**Cilada aad qortay:**\n> ${description.length > 200 ? description.slice(0, 200) + '...' : description}\n\n` +
            (delivered > 0
                ? `📨 La gaadhsiiyay **${delivered}** admin.`
                : `⚠️ Cilada waa la kaydiyay laakiin DM admin lama gaarsiin (waa la eegi doonaa).`)
        )
        .setColor('#2ecc71');

    return message.reply({ embeds: [userEmbed] });
};
