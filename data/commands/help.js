const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PREFIX } = require('../../src/config');
const { isUserBusy } = require('../../src/store');

function helpRow(userId, active) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_edu_${userId}`)
            .setLabel('🎓 Education')
            .setStyle(active === 'edu' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`help_eco_${userId}`)
            .setLabel('💰 Economy')
            .setStyle(active === 'eco' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`close_help_${userId}`)
            .setLabel('✖ Close')
            .setStyle(ButtonStyle.Danger),
    );
}

const GAME_LABELS = { solo: '🎯 Solo', duel: '⚔️ Duel', quiz: '📝 Quiz', tiro: '🔢 Number Guess', tournament: '🏆 Tournament' };

function buildEduEmbed(userId) {
    const activeGame = userId ? isUserBusy(userId) : null;
    const statusLine = activeGame
        ? `\n🟢 **Playing now:** ${GAME_LABELS[activeGame] || activeGame}\n`
        : '\n⚪ **No active game**\n';

    return new EmbedBuilder()
        .setTitle('🎓 Education & Games')
        .setColor('#2ecc71')
        .setDescription(
            statusLine +
            `\n**Games**\n` +
            `\`${PREFIX}solo\` — Answer questions to earn IQ\n` +
            `\`${PREFIX}duel @user\` — Challenge a player\n` +
            `\`${PREFIX}tiro @user\` — Fair 1–100 number guessing game\n` +
            `\`${PREFIX}duel 2v2\` — Start a team duel\n` +
            `\`${PREFIX}quiz\` — Join a group quiz\n\n` +
            `**Profile & Rewards**\n` +
            `\`${PREFIX}profile\` — View your stats and profile\n` +
            `\`${PREFIX}top\` — View the IQ leaderboard\n` +
            `\`${PREFIX}today\` — Claim daily Coins and IQ\n` +
            `\`${PREFIX}missions\` — View and claim missions\n` +
            `\`${PREFIX}cd\` — Check your cooldowns\n\n` +
            `**More**\n` +
            `\`${PREFIX}personal\`, \`${PREFIX}propose @user\`, \`${PREFIX}partner\`, \`${PREFIX}breakup\` — Relationship commands\n` +
            `\`${PREFIX}cilada [message]\` — Report a problem\n` +
            `\`${PREFIX}champion\` — View the current champion`
        )
        .setFooter({ text: `Prefix: ${PREFIX} • ⚙️ Admin commands are restricted` });
}

function buildEcoEmbed() {
    return new EmbedBuilder()
        .setTitle('💰 Economy')
        .setColor('#f39c12')
        .setDescription(
            `**Wallet & Earnings**\n` +
            `\`${PREFIX}jeeb\` — Deposit wallet Coins into Garaad Bank and view balances\n` +
            `\`${PREFIX}work\` (\`${PREFIX}shaqo\`) — Earn Coins every 8 hours\n` +
            `\`${PREFIX}today\` — Claim daily Coins and IQ\n` +
            `\`${PREFIX}rich\` — View the richest players\n\n` +
            `**Banks**\n` +
            `\`${PREFIX}bank\` — Open the bank menu · \`${PREFIX}banks\` — List banks\n` +
            `\`${PREFIX}d <bank> <amount>\` — Deposit · \`${PREFIX}w <bank> <amount>\` — Withdraw\n` +
            `Example: \`${PREFIX}d garaad 500\` · \`${PREFIX}w garaad 200\`\n` +
            `\`${PREFIX}cb <name>\` — Create a public bank\n\n` +
            `**Games & Transfers**\n` +
            `\`${PREFIX}cf <coins> <m|x>\` — Coinflip (m = heads, x = tails)\n` +
            `\`${PREFIX}rob @user\` — Try to rob a player\n` +
            `\`${PREFIX}give @user <amount>\` — Send Coins to a player\n\n` +
            `**Other**\n` +
            `\`${PREFIX}etitle\` — Manage your economy title · \`${PREFIX}khaznad\` — Admin treasury panel\n` +
            `\`${PREFIX}bp <password>\` — Set a bank password`
        )
        .setFooter({ text: 'All wallet, bank, and reward balances use Coins.' });
}

function buildShopEmbed() {
    return new EmbedBuilder()
        .setTitle('🛒 Shop & Items')
        .setColor('#9b59b6')
        .setDescription(
            `\`${PREFIX}shop\` — Browse frames, boosters, loot boxes, and titles\n` +
            `\`${PREFIX}buy frame <key>\` — Buy a frame\n` +
            `\`${PREFIX}buy booster <key>\` — Buy a booster\n` +
            `\`${PREFIX}buy loot <type>\` — Buy a loot box\n` +
            `\`${PREFIX}buy title <key>\` — Buy a title\n` +
            `\`${PREFIX}open <type>\` — Open a loot box\n` +
            `\`${PREFIX}inventory\` — View your items\n` +
            `\`${PREFIX}equip <type> <key>\` — Equip a frame or title\n` +
            `\`${PREFIX}sell frame <key>\` — Sell a frame for Coins`
        )
        .setFooter({ text: `Use ${PREFIX}profile to view your equipped items.` });
}

module.exports = async function helpCommand(message) {
    const userId = message.author.id;
    return message.reply({ embeds: [buildEduEmbed(userId)], components: [helpRow(userId, 'edu')] });
};

module.exports.buildEduEmbed  = buildEduEmbed;
module.exports.buildEcoEmbed  = buildEcoEmbed;
module.exports.buildShopEmbed = buildShopEmbed;
module.exports.helpRow        = helpRow;
