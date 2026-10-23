// =====================================================================
// GARAAD BOT - Maareynta Farriimaha (Message Handler)
// =====================================================================

const { EmbedBuilder } = require('discord.js');
const { PREFIX } = require('../config');
const { checkUser }   = require('../utils/helpers');
const { isAdmin }     = require('../utils/admin');
const { setEconUsername } = require('../economy/econStore');
const { disabledChannels, saveConfig } = require('../store');

const helpCmd         = require('../../data/commands/help');

const profileCmd      = require('../../data/commands/profile');

const topCmd          = require('../../data/commands/top');
const { topIqCmd, topBtcCmd, topMissionsCmd, topStreakCmd, topFlipsCmd, topDuelsCmd } = require('../../data/commands/top');
const todayCmd        = require('../../data/commands/today');
const levelCmd        = require('../../data/commands/level');
const showCmd         = require('../../data/commands/show');

const buyCmd          = require('../../data/commands/buy');
const soloCmd         = require('../../data/commands/solo');
const duelCmd         = require('../../data/commands/duel');
const quizCmd         = require('../../data/commands/quiz');
const ciladaCmd       = require('../../data/commands/cilada');
const adminCmd        = require('../../data/commands/admin/admin');
const broadcast       = require('../../data/commands/admin/adminBroadcast');
const djCmd           = require('../../data/commands/admin/adminDj');
const tournament      = require('../games/tournament');
const teamDuel        = require('../games/teamDuel');

// ── Economy ──

const jeebCmd         = require('../../data/commands/economy/jeeb');
const tradeCmd        = require('../../data/commands/economy/trade');
const robCmd          = require('../../data/commands/economy/rob');
const cashflipCmd     = require('../../data/commands/economy/cashflip');
const { minnoCmd }    = require('../../data/commands/minno');
const slotsCmd        = require('../../data/commands/economy/slots');
const wipeCmd         = require('../../data/commands/admin/wipe');
const investCmd       = require('../../data/commands/economy/invest');
const giveCmd         = require('../../data/commands/economy/give');
const richCmd         = require('../../data/commands/economy/rich');
const treasuryCmdFn   = require('../../data/commands/economy/treasuryCmd');
const hagbadCmd       = require('../../data/commands/economy/hagbad');

const shaqoCmd        = require('../../data/commands/economy/shaqo');
const bankListCmd     = require('../../data/commands/economy/bankList');
const econTitleCmd    = require('../../data/commands/economy/econTitle');
const ciidCmd         = require('../../data/commands/admin/ciidCmd');
const missionsCmd     = require('../../data/commands/missions');
const giveItemCmd     = require('../../data/commands/admin/giveItem');
const lootboxCmd      = require('../../data/commands/lootbox');
const shopCmd         = require('../../data/commands/shopCmd');
const { inventoryCmd, equipCmd, sellCmd } = require('../../data/commands/inventory');
const { friendCmd, unfriendCmd, friendsListCmd, proposeCmd, partnerCmd, breakupCmd } = require('../../data/commands/relationship');
const personalCmd = require('../../data/commands/personal');
const qCmd        = require('../../data/commands/q');
const qcCmd       = require('../../data/commands/qc');
const guessCmd    = require('../../data/commands/guess');
const { bankCreateCmd, bankPasswordCmd, bankViewCmd, bankDirectoryCmd, depositAnyCmd, withdrawAnyCmd, allBanksCmd, jbCmd } = require('../../data/commands/economy/personalBank');
const { createPublicBankCmd, listPublicBanksCmd, topBanksCmd, bankFundCmd, bankDepositCmd, bankWithdrawCmd, bankInfoCmd, bankOwnerCmd, bankHistoryCmd, bankCloseCmd } = require('../../data/commands/economy/publicBank');
const { getDisTube } = require('../music/disTubeSetup');
const imposterCmd     = require('../../data/commands/imposter');
const { joinCmd, leaveCmd: vcLeaveCmd } = require('../../data/commands/join');
const adminBankCmd    = require('../../data/commands/admin/adminBank');
const saversCmd       = require('../../data/commands/savers');
const setupTempVc     = require('../../data/commands/admin/tempVc');
const { vcSetupCmd, vcRemoveCmd } = require('../handlers/voiceMaster');
const { diamondSetupCmd, diamondStatusCmd, diamondTakeCmd } = require('../economy/diamondDrops');


let _music = null;
let _musicErr = '';
function getMusic() {
    if (!_music) {
        try {
            _music = require('../../data/commands/music');
            _musicErr = '';
        } catch (e) {
            _musicErr = e.message;
            console.error('[Music] Load error:', e.message);
        }
    }
    return _music;
}

module.exports = function setupMessageHandler(client) {
    const { tempVcCmd } = setupTempVc(client);

    // ── Rate limiter: max 6 economy commands per 10s per user ──
    const _econRateMap = new Map();
    const ECON_CMDS    = new Set(['shaqo','work','jeeb','trade','ecoflip','ef','give','rich','ebank','bank','etitle']);
    function econRateLimited(userId) {
        const now    = Date.now();
        const bucket = _econRateMap.get(userId) || { count: 0, reset: now + 10_000 };
        if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + 10_000; }
        bucket.count++;
        _econRateMap.set(userId, bucket);
        return bucket.count > 6;
    }

    client.on('messageCreate', async (message) => {
        if (message.author.bot)                  return;

        // ── Imposter Night Chat: DM relay between alive Imposters ──
        if (!message.guild && !message.content.startsWith(PREFIX)) {
            try {
                const { games: impGames, isImposter, aliveImposters } = require('../games/imposter');
                for (const game of impGames.values()) {
                    if (game.phase !== 'night') continue;
                    const player = game.players.get(message.author.id);
                    if (!player || !player.alive || !isImposter(player.role)) continue;

                    const team = aliveImposters(game).filter(([uid]) => uid !== message.author.id);
                    if (!team.length) {
                        await message.reply('🗡️ You are the only living Imposter — no one else is in the chat.').catch(() => {});
                        return;
                    }

                    let senderName = message.author.username;
                    try {
                        const member = await game.guild?.members.fetch(message.author.id);
                        senderName = member?.nickname || message.author.globalName || message.author.username;
                    } catch {}

                    for (const [uid] of team) {
                        try {
                            const user = await client.users.fetch(uid);
                            await user.send(`🗡️ **${senderName}:** ${message.content}`).catch(() => {});
                        } catch {}
                    }
                    await message.react('✅').catch(() => {});
                    return;
                }
            } catch (e) { console.error('[ImposterChat] Error:', e.message); }
        }

        if (!message.content.startsWith(PREFIX)) return;
        if (disabledChannels.has(message.channel.id) && !isAdmin(message.author.id))
            return message.reply('🔕 **Channel-kan bot waa la joojiyay.** Admin kala xiriir.').catch(() => {});

        const args    = message.content.slice(PREFIX.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();
        const userId  = message.author.id;

        // DM-ka: admin wax walba, players ?caawin kaliya
        if (!message.guild && !isAdmin(userId)) {
            if (command !== 'caawin' && command !== 'caaawin' && command !== 'help') {
                return message.reply(
                    `⛔ Amarkan DM-ka kama shaqeeyo.\n\n` +
                    `📍 Tag **server-kaaga** oo halkaas ku isticmaal, ama ku biir server-kan:\n` +
                    `🔗 **https://discord.gg/FyNKRyAKc9**\n\n` +
                    `_(Haddaad u baahan tahay caawimad, isticmaal \`?caawin\`)_`
                ).catch(() => {});
            }
        }

        checkUser(userId);

        if (ECON_CMDS.has(command)) setEconUsername(userId, message.author.username);

        if (ECON_CMDS.has(command) && !isAdmin(userId) && econRateLimited(userId))
            return message.reply('⏳ Aad u dhaqso. Daqiiqad yar sug.').catch(() => {});

        switch (command) {
            // ── Caawinaad ──
            case 'caawin':
            case 'caaawin':
            case 'help':
                return helpCmd(message);

            // ── Profile & Stats ──
            case 'profile':
            case 'p':
                return profileCmd(message);

            case 'q':
                return qCmd(message);

            case 'qc':
            case 'quiz_category':
                return qcCmd(message, args);

            case 'guess':
            case 'gues':
            case 'country':
                return guessCmd(message, args);



            case 'top':
            case 'topiq':
                return (command === 'topiq') ? topIqCmd(message) : topCmd(message, args);

            case 'topbtc':        return topBtcCmd(message);
            case 'topmissions':   return topMissionsCmd(message);
            case 'topstreak':     return topStreakCmd(message);
            case 'topflips':      return topFlipsCmd(message);
            case 'topduels':      return topDuelsCmd(message);

            case 'today':
                return todayCmd(message);

            case 'level':
                return levelCmd(message);

            case 'show':
            case 'cooldown':
            case 'cooldowns':
                return showCmd(message);

            case 'buy':
                return buyCmd(message, args);

            // ── Ciyaaraha Aqoonta ──
            case 'solo':
                return soloCmd(message, args);

            case 'duel':
                return duelCmd(message, args);

            case 'quiz':
                // ?quiz category <cat> → redirect to qcCmd
                if (args[0] && args[0].toLowerCase() === 'category') {
                    return qcCmd(message, args.slice(1));
                }
                return quizCmd(message, args);
            case 'team':
                return quizCmd(message, args);

            // ── Economy ──
            case 'shaqo':
            case 'work':
                return shaqoCmd(message);

            case 'hagbad':
                return hagbadCmd(message, args);

            case 'jeeb':
                return jeebCmd(message, args);


            case 'rob':
                return robCmd(message);

            case 'trade':
                return tradeCmd(message, args);

            case 'ecoflip':
            case 'ef':
                return cashflipCmd(message, args);

            case 'minno':
                return minnoCmd(message, args);

            case 'slots':
                return slotsCmd(message, args);

            case 'wipe':
                return wipeCmd(message, args);

            case 'invest':
                return investCmd(message, args);

            case 'give':
                return giveCmd(message, args);

            case 'rich':
                return richCmd(message);

            case 'list':
                return bankListCmd(message);

            case 'etitle':
                return econTitleCmd(message, args);

            case 'ebank':
                return bankDirectoryCmd(message);


            // ── Personal Bank ──
            case 'bank':
                return bankDirectoryCmd(message);


            case 'jb':
                return jbCmd(message);

            case 'deposit':
            case 'd':
                return depositAnyCmd(message, args);

            case 'withdraw':
            case 'w':
                return withdrawAnyCmd(message, args);

            // ── Public Banks ──
            case 'banks':
                return allBanksCmd(message);

            case 'cb':
            case 'createbank':
                return createPublicBankCmd(message, args);

            case 'bankinfo':
            case 'bi':
                return bankInfoCmd(message, args);

            case 'bankdeposit':
            case 'bd':
                return bankDepositCmd(message, args);

            case 'bankwithdraw':
            case 'bw':
                return bankWithdrawCmd(message, args);

            case 'bankfund':
            case 'bf':
                return bankFundCmd(message, args);

            case 'owner':
                return bankOwnerCmd(message, args);

            case 'bankclose':
            case 'closebank':
                return bankCloseCmd(message);

            case 'bankhistory':
            case 'bhistory':
            case 'bh':
                return bankHistoryCmd(message, args);

            // ── Classic Token Diamond Drop ──
            case 'take':
                return diamondTakeCmd(message);

            case 'diamondsetup':
            case 'diamonddrop':
                return diamondSetupCmd(message, args, message.client);

            case 'diamondstatus':
                return diamondStatusCmd(message);

            case 'topbanks':
                return topBanksCmd(message);

            case 'treasury':
            case 'khaznad':
                return treasuryCmdFn(message);

            case 'ciid':
                return ciidCmd.sendEidToChannel(message);

            // ── Shop & Items ──
            case 'shop':
                return shopCmd(message, args);

            case 'open':
                return lootboxCmd(message, args);

            case 'inventory':
            case 'inv':
                return inventoryCmd(message);

            case 'equip':
                return equipCmd(message, args);

            case 'sell':
                return sellCmd(message, args);

            // ── Personal / Relationship ──
            case 'personal':
                return personalCmd(message);
            case 'propose':
                return proposeCmd(message);
            case 'partner':
                return partnerCmd(message);
            case 'breakup':
                return breakupCmd(message);

            // ── Missions ──
            case 'missions':
            case 'mission':
            case 'm':
            case 'hawl':
                return missionsCmd(message, args);

            case 'mc1':
            case 'mc2':
            case 'mc3':
                return missionsCmd(message, ['claim', command.slice(2)]);

            // ── Admin: Give item ──
            case 'giveitem':
            case 'giveframe':
                return giveItemCmd(message, args);

            // ── Music ──
            case 'play': { const m = getMusic(); return m ? m.joinCmd(message, args) : message.reply(`⚠️ Music khalad: \`${_musicErr || 'unknown'}\``); }
            case 'skip':  { const m = getMusic(); if (m) m.skipMsgCmd(message);  return; }
            case 'stop':  { const m = getMusic(); if (m) m.stopMsgCmd(message);  return; }
            case 'leave': { const m = getMusic(); if (m) m.leaveMsgCmd(message); return; }
            case 'queue': { const m = getMusic(); if (m) m.queueMsgCmd(message); return; }



            // ── Kale ──
            case 'cilada':
            case 'cilad':
            case 'bug':
                return ciladaCmd(message, args);

            case 'dj':
                return djCmd(message, args);

            case 'admin':
                return adminCmd(message, args);

            case 'adall': {
                if (!isAdmin(userId)) {
                    return message.reply('⛔ **Adigu admin maaha.**');
                }
                return broadcast(message, args);
            }

            case 'savers':
            case 'servers':
            case 'serverlist': {
                if (!isAdmin(userId)) {
                    return message.reply('⛔ Admin kaliya ayaa arki kara servers-ka bot-ku ku jiro.');
                }
                return saversCmd(message);
            }

            // ── Tartan (Tournament) ──
            case 'isdiiwaangeli':
            case 'diiwaan':
                return tournament.cmdRegister(message);

            case 'tartan':
                return tournament.cmdAnnounce(message);

            case 'tartan_bilow':
                return tournament.cmdOpen(message);

            case 'gal':
                return tournament.cmdJoin(message, args);

            case 'admin_next':
                return tournament.cmdAdminNext(message);

            case 'tartan_status':
                return tournament.cmdStatus(message);

            case 'tartan_jooji':
            case 'tartan_stop':
                return tournament.cmdStop(message);

            // ── Team Duel ──
            case 'deul':
            case 'tduel':
                return teamDuel.cmdTeamDuel(message, args);

            case '2v2':
            case '2vs2':
                return teamDuel.cmd2v2(message, args);

            case '3v3':
            case '3vs3':
                return teamDuel.cmd3v3(message, args);

            case 'r':
            case 'remove':
            case 'tremove':
                return teamDuel.cmdTeamRemove(message);



            case 'adminbank': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                return adminBankCmd(message, args);
            }

            case 'off': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                const chId = args[0] || message.channel.id;
                disabledChannels.add(chId);
                saveConfig();
                return message.reply(`🔕 Channel \`${chId}\` bot waa la joojiyay.`);
            }

            case 'on': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                const chId = args[0] || message.channel.id;
                disabledChannels.delete(chId);
                saveConfig();
                return message.reply(`🔔 Channel \`${chId}\` bot waa la furay.`);
            }

            case 'reminder':
            case 'xusuusin': {
                checkUser(userId);
                const d   = require('../store').userData[userId];
                const sub = (args[0] || '').toLowerCase();
                if (sub === 'off' || sub === 'jooji') {
                    d.reminderOptOut = true;
                    require('../store').saveData();
                    return message.reply('🔕 **Xusuusinta waa la joojiyay.** Dib u fur: `?reminder on`');
                }
                if (sub === 'on' || sub === 'fur') {
                    d.reminderOptOut = false;
                    require('../store').saveData();
                    return message.reply('🔔 **Xusuusinta waa la furay.** DM ayaa la soo diri doonaa haddaad maqnaato.');
                }
                const status = d.reminderOptOut ? '🔕 Joojisan' : '🔔 Firfircoon';
                return message.reply(`**Xusuusinta:** ${status}\n\`?reminder off\` — Jooji\n\`?reminder on\` — Fur`);
            }

            // ── Voice ──
            case 'join':
            case 'jion':
                return joinCmd(message);
            case 'vcleave':
            case 'vleave':
                return vcLeaveCmd(message);

            case 'tvc':
            case 'tempvc': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                return tempVcCmd(message, args);
            }

            case 'vcsetup': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                return vcSetupCmd(message, args);
            }

            case 'vcremove':
            case 'vcstop': {
                if (!isAdmin(userId)) return message.reply('⛔ Admin maahan.');
                return vcRemoveCmd(message);
            }

            // ── Imposter (aliases: mafia, mafio) ──
            case 'imposter':
            case 'mafia':
            case 'mafio': {
                if (args[0] === 'stop' && isAdmin(userId)) {
                    const { games: impG, cancelGame } = require('../games/imposter');
                    const g = impG.get(message.guild.id);
                    if (!g) return message.reply('⚠️ No Find the Imposter game is running.');
                    cancelGame(message.guild.id);
                    return message.reply('🛑 Find the Imposter game stopped.');
                }
                return imposterCmd(message);
            }
        }
    });
};
