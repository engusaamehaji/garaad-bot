const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ECON_TITLES = {
    master:        { label: 'Master 🎓',          price:  5_000, currency: 'coins', type: 'title' },
    phd:           { label: 'PhD 📚',             price:  6_000, currency: 'coins', type: 'title' },
    professor:     { label: 'Professor 🏛️',      price:  7_000, currency: 'coins', type: 'title' },
    director:      { label: 'Director 📋',        price:  8_000, currency: 'coins', type: 'title' },
    theboss:       { label: 'The Boss 🕴️',        price: 10_000, currency: 'coins', type: 'title' },
    businesswomen: { label: 'Business Women 💼👩', price: 11_000, currency: 'coins', type: 'title' },
    ceo:           { label: 'CEO 🏢',             price: 12_000, currency: 'coins', type: 'title' },
    custom:        { label: 'Custom Name ✍️',     price: 20_000, currency: 'coins', type: 'custom' },
};

const SHOP_ITEMS = { ...ECON_TITLES };

function priceTag(p) {
    if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M Coins`;
    if (p >= 1_000)     return `${(p / 1_000).toFixed(1)}k Coins`.replace('.0k Coins', 'k Coins');
    return `🪙 ${p}`;
}

module.exports = async function econShopCmd(message) {
    const userId = message.author.id;

    // Row 1: Master | PhD | Professor
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('eco_shop_master')    .setLabel('🎓 Master  5k Coins')    .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('eco_shop_phd')       .setLabel('📚 PhD  6k Coins')        .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('eco_shop_professor') .setLabel('🏛️ Prof  7k Coins')      .setStyle(ButtonStyle.Primary),
    );

    // Row 2: Director | The Boss | Business Women
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('eco_shop_director')      .setLabel('📋 Director  8k Coins')      .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('eco_shop_theboss')       .setLabel('🕴️ The Boss  10k Coins')     .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('eco_shop_businesswomen') .setLabel('💼 BizWomen  11k Coins')      .setStyle(ButtonStyle.Danger),
    );

    // Row 3: CEO | Custom | Close
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('eco_shop_ceo')            .setLabel('🏢 CEO  12k Coins')          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('eco_shop_custom')         .setLabel('✍️ Custom  20k Coins')       .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`close_shop_${userId}`)    .setLabel('✖ Close')                  .setStyle(ButtonStyle.Secondary),
    );

    const titleLines = Object.entries(ECON_TITLES)
        .map(([, it]) => `${it.label} — **${priceTag(it.price)}**`)
        .join('\n');

    return message.reply({ embeds: [
        new EmbedBuilder()
            .setTitle('🛒 Garaad Economy Shop')
            .setColor('#9b59b6')
            .addFields({
                name: '🏷️ Economy Titles',
                value: titleLines,
                inline: false,
            })
            .setFooter({ text: 'Garaad Economy • ?etitle <key> to equip • Custom = your own name' }),
    ], components: [row1, row2, row3] });
};

module.exports.SHOP_ITEMS  = SHOP_ITEMS;
module.exports.ECON_TITLES = ECON_TITLES;
