const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const fetch = require('node-fetch');
const {
  BETA_EMOJIS,
  EVENT_ICONS,
  TRIVIA_BANK,
  SHINY_ICON
} = require('../core/constants');
const { gameData, db, saveUsers } = require('../core/database');
const {
  toSmallCaps,
  updateUserRank,
  evaluateAndSyncUserBadges,
  ensureUser,
  addExpAndLevelUp
} = require('../core/helpers');

const RPG_CMDS = ['cstats', 'equipteam', 'battle', 'meme', 'trivia'];

async function execute(ctx) {
  const {
    command, args, message, userId, currentPrefix, user,
    callerHasBetaView, rarityIconsMap
  } = ctx;

  if (!RPG_CMDS.includes(command)) return false;

  if (command === 'cstats') {
    if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
      return message.reply(toSmallCaps('❌ You have no chibis in your inventory!'));
    }

    const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
    const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
    const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

    const teamSlots = user.team || [null, null, null];
    const teamLines = teamSlots.map((chibiId, index) => {
      if (!chibiId) {
        return toSmallCaps(`**[${index + 1}]** *Empty Slot* (Use ${currentPrefix}equipteam [id] ${index + 1})`);
      }
      const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
      if (!chibi) {
        return toSmallCaps(`**[${index + 1}]** *Chibi missing from inventory*`);
      }

      const statConfig = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
      const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
      const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
      const defVal = statConfig.def + chibi.level * statConfig.defPer;

      const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
      const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
      const maxExp = baseExp + (chibi.level - 1) * perLvl;
      const shortId = (chibi.chibiId || chibi.id).slice(-6);

      const isEventItem = chibi.rarity === 'SSRP';
      const badgeIcon = isEventItem ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
      const shinyIconPart = chibi.isShiny ? ` ${SHINY_ICON}` : '';

      return (
        `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity] || '🌟'} ${chibi.emoji} **${chibi.name}**${shinyIconPart}${badgeIcon}\n` +
        `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
        `${hpIcon} HP: \`${hpVal}\` | ${defIcon} DEF: \`${defVal}\` | ${atkIcon} ATK: \`${atkVal}\`\n`
      );
    });

    const displayName = user.customNickname || message.author.username;
    const container = new ContainerBuilder()
      .setAccentColor(0x2ecc71)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 📜 ${displayName}'s Team Card\n\n`) +
          teamLines.join('\n') +
          toSmallCaps(`\n\n*Tip: Use ${currentPrefix}equipteam [id] [1-3] to assign chibis to your team slots!*`)
        )
      );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'equipteam') {
    const chibiIdArg = args[0];
    const slot = parseInt(args[1]);
    if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}equipteam [chibi_id or short id] [slot 1-3]\nExample: ${currentPrefix}equipteam a1b2c3 1`));
    }

    const chibi = user.inventory.chibis.find(c => {
      const uId = c.chibiId || c.id;
      return uId === chibiIdArg || uId.endsWith(chibiIdArg);
    });

    if (!chibi) return message.reply(toSmallCaps(`❌ Chibi ID not found in your inventory! Check ${currentPrefix}collections for correct IDs.`));

    const chibiUniqueId = chibi.chibiId || chibi.id;

    if (user.team.includes(chibiUniqueId)) {
      const existingSlot = user.team.indexOf(chibiUniqueId) + 1;
      if (existingSlot !== slot) {
        return message.reply(toSmallCaps(`❌ This Chibi is already equipped in Team Slot ${existingSlot}! You cannot equip the same Chibi in multiple slots.`));
      }
    }

    const wasEmpty = !user.team[slot - 1];
    user.team[slot - 1] = chibiUniqueId;
    if (slot === 1) user.equippedChibi = chibiUniqueId;

    let expMsg = '';
    if (wasEmpty) {
      const awardedExp = addExpAndLevelUp(user, chibi, 250);
      expMsg = toSmallCaps(`\n✨ Team slot bonus: +${awardedExp} EXP awarded to you and **${chibi.name}**!`);
    }
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    return message.reply(toSmallCaps('✅ Successfully equipped ') + `${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''}` + toSmallCaps(` to Team Slot ${slot}!${expMsg}`));
  }

  if (command === 'battle') {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === userId) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}battle [@user] (You cannot battle yourself or a bot)`));
    }
    ensureUser(opponent.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_battle').setLabel(toSmallCaps('Accept Clash')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('decl_battle').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
    );

    const battleMsg = await message.reply({
      content: toSmallCaps(`⚔️ <@${opponent.id}>, you have been challenged to a 3v3 Chibi Team Clash by <@${userId}>! (Accept within 5 seconds)`),
      components: [row]
    });

    const collector = battleMsg.createMessageComponentCollector({ time: 5000 });
    let handled = false;

    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== opponent.id) return i.followUp({ content: toSmallCaps('This battle challenge is not for you!'), ephemeral: true });
      handled = true;

      if (i.customId === 'accept_battle') {
        const p1User = user;
        const p2User = db.users[opponent.id];

        const getTeamChibis = (u) => {
          return (u.team || [null, null, null]).map(id => {
            if (!id) return null;
            return u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
          });
        };

        const p1Team = getTeamChibis(p1User);
        const p2Team = getTeamChibis(p2User);

        const getTeamCombatStats = (team) => {
          let totalPower = 50;
          const detailed = team.map(c => {
            if (!c) return { hp: 0, atk: 0, def: 0 };
            const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
            const hp = statCfg.hp + c.level * statCfg.hpPer;
            const atk = statCfg.atk + c.level * statCfg.atkPer;
            const def = statCfg.def + c.level * statCfg.defPer;
            totalPower += hp + atk * 3 + def * 2;
            return { hp, atk, def };
          });
          return { totalPower, detailed };
        };

        const p1Stats = getTeamCombatStats(p1Team);
        const p2Stats = getTeamCombatStats(p2Team);

        const p1Power = p1Stats.totalPower * (0.85 + Math.random() * 0.3);
        const p2Power = p2Stats.totalPower * (0.85 + Math.random() * 0.3);

        const isP1Winner = p1Power >= p2Power;
        const winner = isP1Winner ? message.author : opponent;

        const winUser = isP1Winner ? p1User : p2User;
        const loseUser = isP1Winner ? p2User : p1User;
        const winTeam = isP1Winner ? p1Team : p2Team;

        const getBattlePoints = (pts) => {
          if (pts >= 8002) return { win: Math.floor(Math.random() * 31) + 120, lose: 75 };
          if (pts >= 5501) return { win: Math.floor(Math.random() * 31) + 90, lose: 50 };
          if (pts >= 4001) return { win: Math.floor(Math.random() * 31) + 70, lose: 30 };
          if (pts >= 2501) return { win: Math.floor(Math.random() * 31) + 50, lose: 20 };
          if (pts >= 1000) return { win: Math.floor(Math.random() * 21) + 20, lose: 10 };
          return { win: Math.floor(Math.random() * 11) + 10, lose: 5 };
        };

        const winReward = getBattlePoints(winUser.points);
        const losePenalty = getBattlePoints(loseUser.points);

        winUser.points += winReward.win;
        loseUser.points = Math.max(0, loseUser.points - losePenalty.lose);

        const p1CrystalWin = Math.floor(Math.random() * 7) + 10;
        const p1CrystalLose = Math.floor(Math.random() * 7) + 2;
        const p2CrystalWin = Math.floor(Math.random() * 7) + 10;
        const p2CrystalLose = Math.floor(Math.random() * 7) + 2;

        if (!db.config.eventCrystals) db.config.eventCrystals = {};
        db.config.eventCrystals[winUser === p1User ? userId : opponent.id] = (db.config.eventCrystals[winUser === p1User ? userId : opponent.id] || 0) + (winUser === p1User ? p1CrystalWin : p2CrystalWin);
        db.config.eventCrystals[loseUser === p1User ? userId : opponent.id] = (db.config.eventCrystals[loseUser === p1User ? userId : opponent.id] || 0) + (loseUser === p1User ? p1CrystalLose : p2CrystalLose);

        const totalExpWon = addExpAndLevelUp(winUser, winTeam.find(Boolean), 400);

        updateUserRank(p1User);
        updateUserRank(p2User);
        await evaluateAndSyncUserBadges(userId, p1User, message.guild);
        await evaluateAndSyncUserBadges(opponent.id, p2User, message.guild);
        await saveUsers();

        const p1Name = user.customNickname || message.author.username;
        const p2Name = db.users[opponent.id].customNickname || opponent.username;

        const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
        const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
        const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

        const renderTeamLineWithStats = (team, isWinnerTeam) => {
          return team.map((c, idx) => {
            if (!c) return toSmallCaps(`**[${idx + 1}]** *Empty Slot*`);
            const rIcon = rarityIconsMap[c.rarity] || '📦';
            const sIcon = c.isShiny ? SHINY_ICON : '';
            const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
            const hp = statCfg.hp + c.level * statCfg.hpPer;
            const atk = statCfg.atk + c.level * statCfg.atkPer;
            const def = statCfg.def + c.level * statCfg.defPer;
            const remainingHp = isWinnerTeam ? hp : 0;
            return toSmallCaps(`**[${idx + 1}]** `) + `${rIcon}` + ` ${c.emoji} **${c.name}** ${sIcon}` + toSmallCaps(` (Lvl ${c.level}) — ${hpIcon} HP: \`${remainingHp}\` | ${atkIcon} ATK: \`${atk}\` | ${defIcon} DEF: \`${def}\``);
          }).join('\n');
        };

        const container = new ContainerBuilder()
          .setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# ⚔️ 3v3 Chibi Arena Clash Result\n\n` +
                `🏆 Winner: <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n` +
                `🛡️ ${p1Name}'s Team Lineup:\n`
              ) + renderTeamLineWithStats(p1Team, isP1Winner) +
              toSmallCaps(`\n\n🛡️ ${p2Name}'s Team Lineup:\n`) + renderTeamLineWithStats(p2Team, !isP1Winner) +
              toSmallCaps(`\n\n📊 Match Rewards: ✨ Victor earned +${winReward.win} Points, +${totalExpWon} EXP & Crystals! 💔 Loser lost -${losePenalty.lose} Points.`)
            )
          );

        await battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } else {
        await battleMsg.edit({ content: toSmallCaps(`❌ <@${opponent.id}> declined the 3v3 arena clash.`), components: [] }).catch(() => {});
      }
    });

    collector.on('end', async () => {
      if (!handled) {
        await battleMsg.edit({ content: toSmallCaps('⏳ Arena clash request timed out (5s elapsed) and was automatically cancelled.'), components: [] }).catch(() => {});
      }
    });
    return true;
  }

  if (command === 'meme') {
    const res = await fetch('https://meme-api.com/gimme');
    const data = await res.json();
    const container = new ContainerBuilder()
      .setAccentColor(0xe74c3c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(`# ${data.title}\n*(r/${data.subreddit})*`))
      );
    
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'trivia') {
    const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
    await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`));

    const filter = m => m.author.id === userId;
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', async m => {
      const userAnswer = m.content.toLowerCase().trim();
      const isCorrect = selected.a.some(ans => userAnswer.includes(ans));

      if (isCorrect) {
        const awardedPoints = Math.floor(Math.random() * 4) + 17;
        user.points += awardedPoints;
        const awardedExp = addExpAndLevelUp(user, null, 450);

        const triviaCrystals = Math.floor(Math.random() * 6) + 5;
        if (!db.config.eventCrystals) db.config.eventCrystals = {};
        db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + triviaCrystals;

        updateUserRank(user);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();
        m.reply(toSmallCaps(`🎉 Correct! You earned +${awardedPoints} Points, +${awardedExp} EXP & +${triviaCrystals} Event Crystals ${EVENT_ICONS.CRYSTAL}!`));
      } else {
        m.reply(toSmallCaps(`❌ Incorrect! The correct answer was **${selected.a[0]}**.`));
      }
    });
    return true;
  }

  return false;
}

module.exports = {
  commands: RPG_CMDS,
  execute
};