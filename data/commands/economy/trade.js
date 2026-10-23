const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { econData, checkEconUser }     = require('../../../src/economy/econStore');
const { getMarketSnapshot, getPrice } = require('../../../src/economy/market');
const { getMarketState }              = require('../../../src/economy/marketEngine');
const {
    getActivePrediction, hasPrediction,
    setPending, lockPrediction,
    WIN_MULTI, ASSET_LABEL,
} = require('../../../src/economy/prediction');
const { fmt } = require('../../../src/utils/helpers');
const pfmt = n => Math.round(n).toLocaleString();

// ── Embed: Market overview ─────────────────────────────────────────

function buildMarketEmbed(d) {
    const snap     = getMarketSnapshot();
    const btcEntry = snap.find(s => s.asset === 'btc');
    const ind      = btcEntry
        ? (btcEntry.change > 0 ? `🟢 +${btcEntry.change.toFixed(1)}%` : btcEntry.change < 0 ? `🔴 ${btcEntry.change.toFixed(1)}%` : '⬜ 0.0%')
        : '';
    const spark  = btcEntry?.spark ?? '';
    const price  = btcEntry?.price ?? getPrice('btc');
    const mstate = getMarketState();

    return new EmbedBuilder()
        .setTitle('📊 Garaad Predict')
        .setColor('#1a1a2e')
        .addFields(
            { name: '₿ BTC Price',  value: `**${pfmt(price)}** ${ind}`,              inline: true },
            { name: '💳 Wallet',    value: `**₿ ${pfmt(d.btc || 0)}**`,              inline: true },
            { name: `${mstate.icon} Market`, value: `**${mstate.label}**`,            inline: true },
        )
        .setDescription(`\`${spark}\`\n\nClick **Predict** or use \`?trade 500 u 10\``)
        .setFooter({ text: 'Garaad Predict • Win = +80% profit • Lose = −100% stake' });
}

// ── Embed: Pick direction + duration (after amount entered) ────────

function buildPickEmbed(stakeAmount) {
    const price  = getPrice('btc');
    const profit = Math.floor(stakeAmount * (WIN_MULTI - 1));
    const mstate = getMarketState();
    return new EmbedBuilder()
        .setTitle('🎯 Choose Direction & Duration')
        .setColor('#8e44ad')
        .addFields(
            { name: '₿ Current Price',     value: `**${pfmt(price)}**`,          inline: true },
            { name: '💰 Stake',            value: `**₿ ${pfmt(stakeAmount)}**`,  inline: true },
            { name: `${mstate.icon} Market`, value: `**${mstate.label}**`,        inline: true },
            { name: '✅ If WIN',           value: `**+₿ ${pfmt(profit)}**`,      inline: true },
            { name: '❌ If LOSE',          value: `**-₿ ${pfmt(stakeAmount)}**`, inline: true },
        )
        .setFooter({ text: 'Garaad Predict • Pick UP or DOWN and your duration' });
}

// ── Embed: Active prediction ──────────────────────────────────────

function buildActiveEmbed(pred) {
    const remaining = Math.max(0, pred.endTime - Date.now());
    const mins      = Math.floor(remaining / 60000);
    const secs      = Math.floor((remaining % 60000) / 1000);
    const dirLabel  = pred.direction === 'up' ? '⬆️ UP' : '⬇️ DOWN';
    const profit    = Math.floor(pred.stakeUsd * (WIN_MULTI - 1));
    return new EmbedBuilder()
        .setTitle('⏳ Prediction — Active')
        .setColor('#f39c12')
        .addFields(
            { name: '🎯 Direction',   value: `**${dirLabel}**`,                  inline: true },
            { name: '📊 Entry Price', value: `**${pfmt(pred.entryPrice)}**`,      inline: true },
            { name: '💰 Stake',       value: `**₿ ${pfmt(pred.stakeUsd)}**`,      inline: true },
            { name: '✅ Win Profit',  value: `**+₿ ${pfmt(profit)}**`,            inline: true },
            { name: '⏱️ Time Left',   value: `**${mins}m ${secs}s**`,             inline: true },
        )
        .setFooter({ text: 'Garaad Predict • Result posted in this channel' });
}

// ── Rows ──────────────────────────────────────────────────────────

function mainRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pred_a_btc_${userId}`).setLabel('📊 Predict BTC').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pred_refresh_${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`close_trade_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );
}

function pickRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pred_go_up_10_${userId}`)  .setLabel('⬆️ UP  10m') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pred_go_up_30_${userId}`)  .setLabel('⬆️ UP  30m') .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pred_go_down_10_${userId}`).setLabel('⬇️ DOWN 10m').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`pred_go_down_30_${userId}`).setLabel('⬇️ DOWN 30m').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`close_trade_${userId}`)    .setLabel('✖ Cancel')   .setStyle(ButtonStyle.Secondary),
    );
}

function controlRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pred_refresh_${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`close_trade_${userId}`) .setLabel('✖ Close')   .setStyle(ButtonStyle.Danger),
    );
}

function tradeCloseRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_trade_${userId}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
    );
}

// ── Command entry ─────────────────────────────────────────────────

module.exports = async function tradeCmd(message, args) {
    const userId = message.author.id;
    checkEconUser(userId);
    const d = econData[userId];

    // ── Active prediction: show status ──
    const active = getActivePrediction(userId);
    if (active) {
        return message.reply({
            embeds:     [buildActiveEmbed(active)],
            components: [controlRow(userId)],
        });
    }

    // ── Inline: ?trade 500 u 10 ──
    if (args && args.length >= 2) {
        const amount  = parseFloat(args[0]);
        const dirArg  = (args[1] || '').toLowerCase();
        const direction = (dirArg === 'u' || dirArg === 'up')   ? 'up'
                        : (dirArg === 'd' || dirArg === 'down') ? 'down' : null;
        const minutes = [5, 10, 15, 30].includes(parseInt(args[2])) ? parseInt(args[2]) : 10;

        if (!amount || isNaN(amount) || amount <= 0 || !direction)
            return message.reply(`⚠️ Isticmaal: \`?trade 500 u 10\` ama \`?trade 500 d 30\``);
        if ((d.btc || 0) < amount)
            return message.reply(`⚠️ BTC kugu filna ma lihid. Wallet: **₿ ${pfmt(d.btc || 0)}**`);

        setPending(userId, {
            asset: 'btc', stakeType: 'btc',
            stakeAmount: amount, stakeUsd: amount,
            minutes, direction,
            channelId: message.channel.id,
            messageId: null,
        });
        const result = await lockPrediction(userId, message.client);
        if (!result.ok) return message.reply(result.msg || '⚠️ Failed.');
        const locked = getActivePrediction(userId);
        return message.reply({ embeds: [buildActiveEmbed(locked)], components: [controlRow(userId)] });
    }

    // ── Button flow ──
    return message.reply({
        embeds:     [buildMarketEmbed(d)],
        components: [mainRow(userId)],
    });
};

module.exports.buildMarketEmbed = buildMarketEmbed;
module.exports.buildPickEmbed   = buildPickEmbed;
module.exports.buildActiveEmbed = buildActiveEmbed;
module.exports.mainRow          = mainRow;
module.exports.pickRow          = pickRow;
module.exports.controlRow       = controlRow;
module.exports.tradeCloseRow    = tradeCloseRow;
