const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const {
  BADGE_CATALOG,
  BETA_EMOJIS,
  EVENT_ICONS,
  SEASON_LIST,
  SHINY_ICON,
  RARITY_HIERARCHY
} = require('../core/constants');
const { gameData, db, saveUsers } = require('../core/database');
const {
  isTester,
  toSmallCaps,
  getRarityIconMap,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  ensureUser,
  getClanLogoDisplay,
  formatTimeRemaining,
  addExpAndLevelUp,
  parseOddsNumber
} = require('../core/helpers');

const CORE_CMDS = [
  'start', 'rarities', 'customnn', 'profilebg', 'seasons', 'higheststats', 'help', 'status',
  'slot', 'daily', 'roll', 'drop', 'inventory', 'collections', 'shop',
  'rank', 'points', 'ranks', 'ccranks', 'tradehistory', 'trade', 'profile'
];

const PROFILE_BG_PRESETS = {
  'neon-night': { label: 'Neon Anime Night', previewUrl: null },
  'neon-anime-night': { label: 'Neon Anime Night', previewUrl: null },
  'sakura-rain': { label: 'Sakura Rain', previewUrl: null },
  'celestial-galaxy': { label: 'Celestial Galaxy', previewUrl: null },
  'cyber-grid': { label: 'Cyber Grid', previewUrl: null },
  'cozy-cafe': { label: 'Cozy Cafe', previewUrl: null }
};

const isValidHttpProfileBgUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const cleanPath = parsed.pathname.toLowerCase();
    const validExt = ['.gif', '.png', '.jpg', '.jpeg', '.webp'].some(ext => cleanPath.endsWith(ext));
    const allowedHosts = ['giphy.com', 'tenor.com', 'discordapp.com', 'discordapp.net'];
    const hostAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    return validExt || hostAllowed;
  } catch {
    return false;
  }
};

const parseProfileBgInput = (rawValue) => {
  const token = String(rawValue || '').split('|')[0].trim();
  if (!token) return null;

  if (token.toLowerCase().startsWith('preset:')) {
    const presetKey = token.slice('preset:'.length).trim().toLowerCase();
    const presetObj = PROFILE_BG_PRESETS[presetKey];
    if (!presetObj) return null;
    return {
      stored: `preset:${presetKey}`,
      kind: 'preset',
      label: presetObj.label,
      url: presetObj.previewUrl
    };
  }

  if (isValidHttpProfileBgUrl(token)) {
    return {
      stored: token,
      kind: 'url',
      label: 'Custom GIF',
      url: token
    };
  }

  return null;
};

const resolveStoredProfileBg = (storedBg) => {
  if (!storedBg || typeof storedBg !== 'string') return null;
  const trimmed = storedBg.trim();
  if (trimmed.toLowerCase().startsWith('preset:')) {
    const presetKey = trimmed.slice('preset:'.length).trim().toLowerCase();
    const presetObj = PROFILE_BG_PRESETS[presetKey];
    return {
      kind: 'preset',
      label: presetObj ? presetObj.label : presetKey,
      url: presetObj ? presetObj.previewUrl : null
    };
  }
  if (isValidHttpProfileBgUrl(trimmed)) {
    return {
      kind: 'url',
      label: 'Custom GIF',
      url: trimmed
    };
  }
  return null;
};

async function execute(ctx) {
  const {
    command, args, message, client, userId, currentPrefix, user, currentMs,
    callerHasBetaView, rarityIconsMap, getDisplayName
  } = ctx;

  if (!CORE_CMDS.includes(command)) return false;

  if (command === 'start') {
    if (user.started) return message.reply(toSmallCaps('⚠️ You have already started your Chibi RPG journey!'));

    if (isTester(userId)) {
      const startRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('beta_start_journey_btn')
          .setEmoji('1572796405033214043')
          .setLabel(toSmallCaps('Start Journey'))
          .setStyle(ButtonStyle.Success)
      );

      const startPromptMsg = await message.reply({
        content: toSmallCaps(`${BETA_EMOJIS.START_BTN} **Welcome to Chibi RPG RNG!**\nPress the Start button below to initialize your profile and claim your starter bundle.`),
        components: [startRow]
      });

      const startCollector = startPromptMsg.createMessageComponentCollector({ time: 30000, max: 1 });
      let pressed = false;

      startCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command user can press this Start button!'), ephemeral: true });
        }
        pressed = true;
        user.started = true;
        user.joinedDate = new Date().toLocaleDateString();
        user.dice += 50;
        if (!db.config.ownerId) db.config.ownerId = userId;
        if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
        updateUserRank(user);
        updatePeakRank(user);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();

        await startPromptMsg.edit({
          content: toSmallCaps(`🎉 **Journey Initialized!** You have been awarded **x50 Dice** ${BETA_EMOJIS.DICE} and your Chibi RPG profile is now active.`),
          components: []
        }).catch(() => {});
      });

      startCollector.on('end', async () => {
        if (!pressed && !user.started) {
          await startPromptMsg.edit({
            content: toSmallCaps(`⏳ Start button expired. Type \`${currentPrefix}start\` again to begin.`),
            components: []
          }).catch(() => {});
        }
      });
      return true;
    }

    user.started = true;
    user.joinedDate = new Date().toLocaleDateString();
    user.dice += 20;
    if (!db.config.ownerId) db.config.ownerId = userId;
    if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
    updateUserRank(user);
    updatePeakRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();
    return message.reply(toSmallCaps('🎉 Welcome to Chibi RPG RNG! You have been awarded 20x Dice 🎲 and your profile is initialized.'));
  }

  if (command === 'rarities') {
    const raritiesInfo =
      `${rarityIconsMap['SSRP'] || '🌟'} **Super Special Rare Plus (SSRP - Beta Event)**\n` +
      `• Cat Event: Normal 1 in 500B | Shiny 1 in 1Qa\n` +
      `• Doge Event: Normal 1 in 1T | Shiny 1 in 20Qa\n` +
      `• Troll Event: Normal 1 in 30T | Shiny 1 in 50Qa\n` +
      `• Frien Event: Normal 1 in 100T | Shiny 1 in 300Qa\n` +
      `• Seren Event: Normal 1 in 500T | Shiny 1 in 750Qa\n` +
      `• Hellkitty Event: Normal 1 in 5Qa | Shiny 1 in 15Qi\n` +
      `• Mezz Event: Normal 1 in 75Qa | Shiny 1 in 500Qi\n` +
      `• Ruru Event: Normal 1 in 250Qa | Shiny 1 in 10Sx\n` +
      `• Zoprb Event: Normal 1 in 1Qi | Shiny 1 in 100Sx\n` +
      `• Kazerb Event: Normal 1 in 500Qi | Shiny 1 in 50Sp\n` +
      `• Georb Event: Normal 1 in 10Sp | Shiny 1 in 50No\n\n` +
      `${rarityIconsMap['C'] || '📦'} **Common (C)**\n` +
      `• Normal Drop Rate: 20% (~1 in 2) | Shiny Drop Rate: 1%\n\n` +
      `${rarityIconsMap['U'] || '📦'} **Uncommon (U)**\n` +
      `• Normal Drop Rate: 12% | Shiny Drop Rate: 0.10%\n\n` +
      `${rarityIconsMap['R'] || '📦'} **Rare (R)**\n` +
      `• Normal Drop Rate: 7% | Shiny Drop Rate: 0.5%\n\n` +
      `${rarityIconsMap['SR'] || '📦'} **Super Rare (SR)**\n` +
      `• Normal Drop Rate: 1% | Shiny Drop Rate: 0.1%\n\n` +
      `${rarityIconsMap['SRR'] || '📦'} **Super Rare Rare (SRR)**\n` +
      `• Normal Drop Rate: 0.10% | Shiny Drop Rate: 0.0010%\n\n` +
      `${rarityIconsMap['UTR'] || '📦'} **Ultra Rare (UTR)**\n` +
      `• Normal Drop Rate: 0.001% | Shiny Drop Rate: 0.0001%`;

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps('# 📊 Chibi Rarities & Drop Rates\n\n') + raritiesInfo
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'customnn') {
    const newNickname = args.join(' ');
    if (!newNickname) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}customnn [nickname] (Max 12 characters)`));
    }
    if (newNickname.length > 12) {
      return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
    }

    user.customNickname = newNickname;
    await saveUsers();
    return message.reply(toSmallCaps(`✅ Successfully updated your custom nickname to ${newNickname}!`));
  }

  if (command === 'profilebg') {
    const input = args.join(' ').trim();
    if (!input) {
      return message.reply(
        toSmallCaps(`❌ Usage: ${currentPrefix}profilebg [preset:neon-anime-night | https://image-url] (or \`${currentPrefix}profilebg clear\` to remove)`)
      );
    }

    if (input.toLowerCase() === 'clear') {
      user.profileBg = null;
      await saveUsers();
      return message.reply(toSmallCaps('✅ Cleared your custom profile background!'));
    }

    const parsedBg = parseProfileBgInput(input);
    if (!parsedBg) {
      return message.reply(
        toSmallCaps('❌ Please provide a valid `preset:<name>` from the customizer or an `https://` direct image/GIF URL (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, or Giphy/Tenor/Discord CDN).')
      );
    }

    user.profileBg = parsedBg.stored;
    await saveUsers();
    const confirmationLabel = parsedBg.kind === 'preset' ? `Preset: ${parsedBg.label}` : 'Custom GIF URL';
    return message.reply(toSmallCaps(`✅ Successfully updated your profile background (${confirmationLabel})!`));
  }

  if (command === 'seasons') {
    const currentSeasonNum = db.config.seasonNumber || 1;
    const currentSeasonData = SEASON_LIST[currentSeasonNum] || { name: `Season ${currentSeasonNum}`, start: 'Active' };
    const timeRemainingMs = Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now());
    const seasonTimerStr = formatTimeRemaining(timeRemainingMs);

    const seasonLines = Object.entries(SEASON_LIST).map(([num, s]) => {
      const activeMarker = parseInt(num, 10) === currentSeasonNum ? ' 🟢 (Active)' : '';
      return toSmallCaps(`• ${s.name}${activeMarker}\n  Begin In: ${s.start}`);
    }).join('\n\n');

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 📅 Chibi RPG Seasons\n\n` +
            `Current Active: ${currentSeasonData.name}\n` +
            `Time Until Reset: ${seasonTimerStr}\n\n` +
            `-----------------------------------\n\n`
          ) + seasonLines
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'higheststats') {
    updatePeakRank(user);
    const peakRank = user.highestSeasonRank || '<:unranked:1571314276071907519>';
    const peakPoints = user.highestSeasonPoints || 0;
    const displayName = user.customNickname || message.author.username;

    const container = new ContainerBuilder()
      .setAccentColor(0x9b59b6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🏆 ${displayName}'s Highest Stats (Last Season)\n\n` +
            `Highest Rank Icon: `
          ) + `${peakRank}` +
          toSmallCaps(
            `\nHighest Points Reached: ${peakPoints.toLocaleString()} Points\n\n` +
            `*Stats snapshotted from previous competitive season.*`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'help') {
    const betaHelpSection = isTester(userId)
      ? toSmallCaps('🧪 **Beta Tester Exclusive Commands**\n') +
        `\`${currentPrefix}testerpanel\` — Open Beta Tester Panel\n` +
        `\`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — List active beta features\n` +
        `\`${currentPrefix}admingivebadges\` (\`${currentPrefix}agb\`) — View/grant badges\n` +
        `\`${currentPrefix}cpromote\` (\`${currentPrefix}cp\`) [@user] — Promote clan member\n` +
        `\`${currentPrefix}kick\` [@user] [reason] — Kick member from clan\n` +
        `\`${currentPrefix}cannounce\` [msg] — Announce to clan mail\n` +
        `\`${currentPrefix}ceditdesc\` (\`${currentPrefix}ced\`) [desc] — Edit clan description\n` +
        `\`${currentPrefix}cmail\` — View clan mail inbox\n\n`
      : '';

    const helpText =
      betaHelpSection +
      toSmallCaps('🎲 **Rolling, Drops & Games**\n') +
      `\`${currentPrefix}roll [qty] [boost]\` (${currentPrefix}r) — Roll Chibis\n` +
      `\`${currentPrefix}drop\` (${currentPrefix}d) — Claim free dice every 10s\n` +
      `\`${currentPrefix}slot [bet]\` — Play Chibi Slot Machine 🎰\n` +
      `\`${currentPrefix}shop\` — Buy Spray & Clover boosts\n` +
      `\`${currentPrefix}rarities\` (${currentPrefix}rar) — View Chibi drop rates\n\n` +
      toSmallCaps('🌟 **Beta Event System**\n') +
      `\`${currentPrefix}event\` — View Beta Event Hub\n` +
      `\`${currentPrefix}eadventure\` (${currentPrefix}ca) — Explore & Battle NPCs for Crystals\n` +
      `\`${currentPrefix}eshop\` (${currentPrefix}es) — Open Event Crystal Shop\n` +
      `\`${currentPrefix}ecrystal\` (${currentPrefix}ec) — Check Crystal balance\n\n` +
      toSmallCaps('🎁 **Rewards & Economy**\n') +
      `\`${currentPrefix}daily\` — Claim daily streak rewards (x5 🎲)\n` +
      `\`${currentPrefix}points\` — Check points & rank badge\n` +
      `\`${currentPrefix}rank\` / \`${currentPrefix}ranks\` — View leaderboards\n` +
      `\`${currentPrefix}ccranks\` (${currentPrefix}ccr) — Clan Leaderboard\n` +
      `\`${currentPrefix}customnn\` (${currentPrefix}cnn) — Set custom nickname\n` +
      `\`${currentPrefix}seasons\` (${currentPrefix}ss) — Season schedules\n` +
      `\`${currentPrefix}higheststats\` (${currentPrefix}hss) — Peak season stats\n` +
      `\`${currentPrefix}tradehistory\` (${currentPrefix}th) — View trade logs\n\n` +
      toSmallCaps('⚔️ **RPG & Battling**\n') +
      `\`${currentPrefix}cstats\` — Inspect team card\n` +
      `\`${currentPrefix}equipteam [id] [slot]\` — Manage team (1-3)\n` +
      `\`${currentPrefix}battle [@user]\` — 3v3 Arena Clash\n\n` +
      toSmallCaps('🎒 **Inventory & Profile**\n') +
      `\`${currentPrefix}inventory\` (${currentPrefix}inv) — Items bag\n` +
      `\`${currentPrefix}collections\` (${currentPrefix}col) — Chibi binder\n` +
      `\`${currentPrefix}profile\` (${currentPrefix}p) [@user] — User profile\n` +
      `\`${currentPrefix}trade\` (${currentPrefix}t) [@user] — 2-Player Trade\n\n` +
      toSmallCaps('🏛️ **Clans & Server**\n') +
      `\`${currentPrefix}clanlist\` — View clans\n` +
      `\`${currentPrefix}cclaninfo\` — Clan details & info\n` +
      `\`${currentPrefix}ccreateclan\` / \`${currentPrefix}cclanjoin\` / \`${currentPrefix}clanleave\` / \`${currentPrefix}clanrename\`\n` +
      `\`${currentPrefix}prefixchange\` / \`${currentPrefix}enablec\` / \`${currentPrefix}disablec\`\n` +
      `\`${currentPrefix}ping\` — Check the bot's response time`;

    const container = new ContainerBuilder()
      .setAccentColor(0xff77aa)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps('# 🌸 Chibi RPG RNG — Help Center\nExplore the categories below:'))
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(helpText)
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'status') {
    const ping = client.ws.ping;
    const uptimeSec = Math.floor(client.uptime / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            '# 🤖 Bot System Status & Info\n\n' +
            `📶 Latency / Ping: ${ping}ms\n` +
            `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
            `🌐 Connected Servers: ${client.guilds.cache.size} Servers\n` +
            `💻 Runtime: Node.js (Discord.js v14 - Components V2)\n` +
            `⚙️ Status: 🟢 Online & Operational (MongoDB Connected)`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'slot') {
    const bet = parseInt(args[0], 10);
    if (isNaN(bet) || bet <= 0) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}slot [bet_amount] (e.g. ${currentPrefix}slot 5)`));
    }
    if (user.dice < bet) {
      return message.reply(toSmallCaps(`❌ You don't have enough dice! You have ${user.dice} 🎲, but your bet is ${bet} 🎲.`));
    }

    user.dice -= bet;
    await saveUsers();

    let availableChibiEmojis = ['📦', '✨', '⭐', '🌟', '💎', '🔥', '💖'];
    if (user.inventory && user.inventory.chibis && user.inventory.chibis.length > 0) {
      availableChibiEmojis = Array.from(new Set(user.inventory.chibis.map(c => c.emoji || '📦')));
    }

    const getRandomChibiSymbol = () => availableChibiEmojis[Math.floor(Math.random() * availableChibiEmojis.length)];

    const slotMsg = await message.reply({
      content: toSmallCaps(`🎰 Spinning Chibi Slot Machine for ${bet} 🎲...\n| 🔄 | 🔄 | 🔄 |`),
    });

    for (let step = 0; step < 3; step++) {
      await new Promise(resolve => setTimeout(resolve, 600));
      const s1 = getRandomChibiSymbol();
      const s2 = getRandomChibiSymbol();
      const s3 = getRandomChibiSymbol();
      await slotMsg.edit({
        content: toSmallCaps(`🎰 Spinning...\n| ${s1} | ${s2} | ${s3} |`),
      }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    const final1 = getRandomChibiSymbol();
    const final2 = getRandomChibiSymbol();
    const final3 = getRandomChibiSymbol();

    let payoutMultiplier = 0;
    let pointsWon = 0;
    let resultText = '';

    if (final1 === final2 && final2 === final3) {
      payoutMultiplier = 10;
      pointsWon = 25;
      resultText = toSmallCaps(`🎉 CHIBI JACKPOT! TRIPLE MATCH (${final1})! (+10x Dice, +${pointsWon} Points!) 🎉`);
    } else if (final1 === final2 || final2 === final3 || final1 === final3) {
      payoutMultiplier = 2;
      pointsWon = 10;
      resultText = toSmallCaps(`✨ Partial Chibi Match! (+2x Dice, +${pointsWon} Points!) ✨`);
    } else {
      payoutMultiplier = 0;
      pointsWon = 0;
      resultText = toSmallCaps('❌ No matching chibis! Better luck next time!');
    }

    const winnings = Math.round(bet * payoutMultiplier);
    user.dice += winnings;
    user.points += pointsWon;
    updateUserRank(user);
    await saveUsers();

    const container = new ContainerBuilder()
      .setAccentColor(payoutMultiplier > 0 ? 0xf1c40f : 0xe74c3c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🎰 Chibi Slot Machine Results\n\n` +
            `| ${final1} | ${final2} | ${final3} |\n\n` +
            `${resultText}\n` +
            `💰 Dice Payout: +${winnings} 🎲 | 🏆 Points Gained: +${pointsWon} Pts\n` +
            `🎲 Total Dice: ${user.dice} | 🏆 Total Points: ${user.points}`
          )
        )
      );

    return slotMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }

  if (command === 'daily') {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const fortyEightHours = 48 * 60 * 60 * 1000;

    if (currentMs - user.lastDaily < twentyFourHours) {
      const remainingTime = Math.ceil((twentyFourHours - (currentMs - user.lastDaily)) / 1000 / 60);
      return message.reply(toSmallCaps(`⏳ You have already claimed your daily reward! Please wait another ${remainingTime} minutes.`));
    }

    if (!user.lastDaily || currentMs - user.lastDaily > fortyEightHours) {
      user.streak = 1;
    } else {
      user.streak = (user.streak || 0) + 1;
    }

    user.lastDaily = currentMs;

    let multiplier = 1;
    if (user.streak >= 100) multiplier = 5;
    else if (user.streak >= 50) multiplier = 3;
    else if (user.streak >= 10) multiplier = 2;

    const rewardDice = 1 * multiplier;
    user.dice += rewardDice;
    updateUserRank(user);
    await saveUsers();

    return message.reply(toSmallCaps(`🎁 Daily Reward Claimed!\n🔥 Streak: ${user.streak} Days\n🎲 Reward: +${rewardDice}x Dice (x${multiplier} multiplier active! Total: ${user.dice} 🎲)`));
  }

  if (command === 'roll') {
    const qty = Math.min(parseInt(args[0], 10) || 1, gameData.settings.maxRollQuantity);
    const boost = args[1] ? args[1].toLowerCase() : null;

    if (qty < 1) return message.reply(toSmallCaps('❌ Quantity must be at least 1.'));
    if (user.dice < qty) {
      return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`));
    }

    if (!user.inventory.items) {
      user.inventory.items = { spray: 0, clover: 0 };
    }

    if (boost === 'spray') {
      if ((user.inventory.items.spray || 0) <= 0) return message.reply(toSmallCaps(`❌ No Spray uses left! Buy more in ${currentPrefix}shop.`));
      user.inventory.items.spray--;
    } else if (boost === 'clover') {
      if ((user.inventory.items.clover || 0) <= 0) return message.reply(toSmallCaps(`❌ No Clover uses left! Buy more in ${currentPrefix}shop.`));
      user.inventory.items.clover--;
    }

    user.dice -= qty;
    const resultsSummary = [];
    let activeLuckMultiplier = db.config.globalLuckMultiplier || 1.0;
    if (boost === 'spray') activeLuckMultiplier *= 1.5;

    let totalExpGained = 0;
    const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (user.team[0] || user.equippedChibi));

    for (let i = 0; i < qty; i++) {
      const baseRarityChances = {
        C: { normal: 20, shiny: 1 },
        U: { normal: 12, shiny: 0.10 },
        R: { normal: 7, shiny: 0.5 },
        SR: { normal: 1, shiny: 0.1 },
        SRR: { normal: 0.10, shiny: 0.0010 },
        UTR: { normal: 0.001, shiny: 0.0001 }
      };

      const adjustedRarities = gameData.rarities.map(r => {
        const cfg = baseRarityChances[r.key] || { normal: r.weight, shiny: 0.1 };
        let normW = cfg.normal;
        let shinyW = cfg.shiny;
        if (r.key !== 'C') {
          normW *= activeLuckMultiplier;
          shinyW *= activeLuckMultiplier;
        }
        return { ...r, normW, shinyW };
      });

      const totalWeight = adjustedRarities.reduce((sum, r) => sum + r.normW, 0);
      let randW = Math.random() * totalWeight;
      let chosenRarityObj = adjustedRarities[0];

      for (const r of adjustedRarities) {
        if (randW < r.normW) {
          chosenRarityObj = r;
          break;
        }
        randW -= r.normW;
      }

      const availableChibis = gameData.chibis.filter(c => c.rarity === chosenRarityObj.key);
      const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];

      const normalVal = parseOddsNumber(chibiTemplate.odds);
      const targetShinyChance = (baseRarityChances[chosenRarityObj.key]?.shiny || 0.1) * (activeLuckMultiplier > 1 ? activeLuckMultiplier : 1);
      const isShiny = Math.random() * 100 < targetShinyChance;

      const pushChibi = () => {
        const generatedId = new mongoose.Types.ObjectId().toString();
        const newEntry = {
          id: generatedId,
          chibiId: generatedId,
          name: chibiTemplate.name,
          rarity: chibiTemplate.rarity,
          emoji: chibiTemplate.emoji,
          isShiny,
          level: 1,
          exp: 0,
          date: new Date().toLocaleDateString()
        };
        user.inventory.chibis.push(newEntry);
        return generatedId;
      };

      pushChibi();
      resultsSummary.push({ chibi: chibiTemplate, isShiny });

      if (boost === 'clover' && Math.random() < 0.5) {
        pushChibi();
        resultsSummary.push({ chibi: chibiTemplate, isShiny, duplicated: true });
      }

      const baseExpRoll = isShiny ? Math.floor(Math.random() * 251) + 50 : Math.floor(Math.random() * 141) + 10;
      totalExpGained += addExpAndLevelUp(user, primaryChibi, baseExpRoll);

      const currentTier = RARITY_HIERARCHY[chibiTemplate.rarity] || 1;
      const savedTier = user.bestRollTier || 0;
      const currentRollVal = isShiny ? (normalVal * 10) : normalVal;
      const savedRollVal = user.bestRollVal || 0;

      if (currentTier > savedTier || (currentTier === savedTier && currentRollVal > savedRollVal)) {
        user.bestRollTier = currentTier;
        user.bestRollVal = currentRollVal;
        user.bestRoll = chibiTemplate.shinyOdds || chibiTemplate.odds;
        user.bestChibi = `${rarityIconsMap[chibiTemplate.rarity]} ${chibiTemplate.emoji} ${chibiTemplate.name} ${isShiny ? SHINY_ICON : ''}`;
      }
    }

    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
    const luckNotice = activeLuckMultiplier > 1.0 ? toSmallCaps(`\n⚡ Active Luck Boost: ${activeLuckMultiplier}x`) : '';
    const container = new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# ${diceIcon} Chibi Roll Results\n\n`) +
          resultsSummary
            .map(
              r =>
                `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${
                  r.duplicated ? '(🍀 Duplicated!)' : ''
                }`
            )
            .join('\n') +
          toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!`) + luckNotice +
          toSmallCaps(`\n${diceIcon} Remaining Dice: ${user.dice}`)
        )
      );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'drop') {
    const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
    if (currentMs - user.lastDrop < cooldownMs) {
      const timeLeft = Math.ceil((cooldownMs - (currentMs - user.lastDrop)) / 1000);
      return message.reply(toSmallCaps(`⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`));
    }
    user.lastDrop = currentMs;
    user.todayDrops = (user.todayDrops || 0) + 1;

    const totalDropWeight = gameData.dropTable.reduce((sum, d) => sum + d.weight, 0);
    let randD = Math.random() * totalDropWeight;
    let chosenDrop = gameData.dropTable[0];
    for (const d of gameData.dropTable) {
      if (randD < d.weight) {
        chosenDrop = d;
        break;
      }
      randD -= d.weight;
    }

    user.dice += chosenDrop.dice;
    updateUserRank(user);
    await saveUsers();

    const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
    return message.reply(toSmallCaps(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** ${diceIcon}! Total dice: ${user.dice}`));
  }

  if (command === 'inventory') {
    if (!user.inventory.items) {
      user.inventory.items = { spray: 0, clover: 0 };
    }
    const sprays = user.inventory.items.spray || 0;
    const clovers = user.inventory.items.clover || 0;
    const displayName = user.customNickname || message.author.username;
    const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🎒 ${displayName}'s Inventory\n\n` +
            `${diceIcon} Dice: ${user.dice || 0}\n` +
            `🧴 Spray Boosts: ${sprays} Uses\n` +
            `🍀 Clover Boosts: ${clovers} Uses\n\n` +
            `*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
          )
        )
      );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'collections') {
    if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
      return message.reply(toSmallCaps(`📖 Your collection is empty! Use ${currentPrefix}roll to summon chibis.`));
    }

    let sortBy = 'rarity';
    let currentPage = 0;
    const itemsPerPage = 10;

    const getGroupedEntries = () => {
      const grouped = {};
      user.inventory.chibis.forEach(c => {
        const key = `${c.rarity}_${c.name}_${c.isShiny ? 'shiny' : 'normal'}`;
        const uniqueId = c.chibiId || c.id;
        if (!grouped[key]) {
          grouped[key] = {
            rarity: c.rarity,
            emoji: c.emoji || '✨',
            name: c.name,
            isShiny: c.isShiny,
            date: c.date || 'Unknown Date',
            count: 0,
            firstId: uniqueId ? uniqueId.slice(-6) : 'unknown'
          };
        }
        grouped[key].count++;
      });

      const entries = Object.values(grouped);
      const rarityRank = { SSRP: 1, UTR: 2, SRR: 3, SR: 4, R: 5, U: 6, C: 7 };

      if (sortBy === 'rarity') {
        entries.sort((a, b) => (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99));
      } else if (sortBy === 'alpha') {
        entries.sort((a, b) => a.name.localeCompare(b.name));
      }
      return entries;
    };

    const renderColContainer = (page) => {
      const entries = getGroupedEntries();
      const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
      if (page >= totalPages) page = totalPages - 1;

      const start = page * itemsPerPage;
      const pageItems = entries.slice(start, start + itemsPerPage);
      const formatted = pageItems
        .map((e, idx) => {
          const isEventItem = e.rarity === 'SSRP';
          const badgeIcon = isEventItem ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
          const shinyIconPart = e.isShiny ? ` ${SHINY_ICON}` : '';
          return `**${start + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}**${shinyIconPart}${badgeIcon}`;
        })
        .join('\n') || toSmallCaps('Collection page empty.');

      const displayName = user.customNickname || message.author.username;
      const colIcon = callerHasBetaView ? BETA_EMOJIS.COLLECTIONS : '📖';
      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# ${colIcon} ${displayName}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\n` +
              `Sort: ${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}\n\n`
            ) + formatted +
            toSmallCaps(`\n\n*Unique Types: ${new Set(user.inventory.chibis.map(c => c.name)).size} | Total Owned: ${user.inventory.chibis.length}*`)
          )
        );
      return { container, totalPages };
    };

    const getColRows = (page, totalPages) => {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sort_rarity').setLabel(toSmallCaps('Order by Rarity')).setStyle(sortBy === 'rarity' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('sort_alpha').setLabel(toSmallCaps('Order Alphabetical')).setStyle(sortBy === 'alpha' ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('col_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('col_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        )
      ];
    };

    const initialRender = renderColContainer(currentPage);
    const colMsg = await message.reply({
      components: [initialRender.container, ...getColRows(currentPage, initialRender.totalPages)],
      flags: MessageFlags.IsComponentsV2
    });

    const colCollector = colMsg.createMessageComponentCollector({ time: 120000 });
    colCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your collection session!'), ephemeral: true });

      if (i.customId === 'sort_rarity') {
        sortBy = 'rarity';
        currentPage = 0;
      } else if (i.customId === 'sort_alpha') {
        sortBy = 'alpha';
        currentPage = 0;
      } else if (i.customId === 'col_prev' && currentPage > 0) {
        currentPage--;
      } else if (i.customId === 'col_next') {
        currentPage++;
      }

      const updated = renderColContainer(currentPage);
      await colMsg.edit({
        components: [updated.container, ...getColRows(currentPage, updated.totalPages)],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    });
    return true;
  }

  if (command === 'shop') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('buy_spray').setLabel(toSmallCaps('Buy Spray (5 🎲)')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('buy_clover').setLabel(toSmallCaps('Buy Clover (15 🎲)')).setStyle(ButtonStyle.Success)
    );
    const container = new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            '# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n' +
            '🧴 Spray (5 🎲): Use this for Awesome Chibi boost [30 Uses]\n' +
            '🍀 Clover (15 🎲): Use this to duplicate Chibis while rolling [50 Uses]'
          )
        )
      );
    const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });

      if (!user.inventory.items) {
        user.inventory.items = { spray: 0, clover: 0 };
      }

      if (i.customId === 'buy_spray') {
        if (user.dice < 5) {
          return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
        }
        user.dice -= 5;
        user.inventory.items.spray += 30;
        updateUserRank(user);
        await saveUsers();
        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`), ephemeral: true });
      } else if (i.customId === 'buy_clover') {
        if (user.dice < 15) {
          return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
        }
        user.dice -= 15;
        user.inventory.items.clover += 50;
        updateUserRank(user);
        await saveUsers();
        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover}`), ephemeral: true });
      }
    });
    return true;
  }

  if (command === 'rank') {
    updateUserRank(user);
    await saveUsers();
    return message.reply(toSmallCaps('🏆 Your current rank icon: ') + `${user.rank}`);
  }

  if (command === 'points') {
    updateUserRank(user);
    await saveUsers();
    return message.reply(toSmallCaps(`💰 Your current points balance is: **${user.points}** (Rank: `) + `${user.rank}` + ')');
  }

  if (command === 'ranks') {
    const allSortedUsers = Object.entries(db.users)
      .map(([uId, uData]) => {
        updateUserRank(uData);
        return { uId, ...uData };
      })
      .sort((a, b) => b.points - a.points);

    const itemsPerPage = 10;
    let currentPage = 0;
    const totalPages = Math.max(1, Math.ceil(allSortedUsers.length / itemsPerPage));

    const seasonNum = db.config.seasonNumber || 1;
    const seasonMeta = SEASON_LIST[seasonNum] || { name: `Season ${seasonNum}` };
    const maxSeasonMs = 30 * 24 * 60 * 60 * 1000;
    const timeRemainingMs = Math.min(maxSeasonMs, Math.max(0, (db.config.seasonExpires || (Date.now() + maxSeasonMs)) - Date.now()));
    const seasonTimerStr = formatTimeRemaining(timeRemainingMs);

    const userGlobalIndex = allSortedUsers.findIndex(u => u.uId === userId);
    const userRankPos = userGlobalIndex !== -1 ? userGlobalIndex + 1 : 'Unranked';
    const userPointsDisplay = user.points || 0;
    const userRankIcon = user.rank || '<:unranked:1571314276071907519>';

    if (callerHasBetaView) {
      const buildBetaRanksPageContent = async (page) => {
        const start = page * itemsPerPage;
        const pageUsers = allSortedUsers.slice(start, start + itemsPerPage);

        const lines = await Promise.all(pageUsers.map(async (u, idx) => {
          const username = await getDisplayName(u.uId);
          let clanSubLine = '';
          if (u.clan && db.clans[u.clan]) {
            const clanObj = db.clans[u.clan];
            const cleanClanName = u.clan.replace(/\*/g, '');
            const logoEmoji = getClanLogoDisplay(clanObj.logoId);
            clanSubLine = `\n   ${logoEmoji} ` + toSmallCaps(cleanClanName);
          }
          return (
            toSmallCaps(`**${start + idx + 1}.** @${username} | `) +
            `${u.rank}` +
            toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${(u.points || 0).toLocaleString()}`) +
            clanSubLine
          );
        }));

        return lines.join('\n\n') || toSmallCaps('No players on the leaderboard yet.');
      };

      const getRanksRow = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
      };

      const renderBetaRanksContainer = async (page) => {
        const pageBody = await buildBetaRanksPageContent(page);
        return new ContainerBuilder()
          .setAccentColor(0xf1c40f)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${BETA_EMOJIS.CRR_TROPHY} ` +
              toSmallCaps(`**Chibi Global Leaderboard [${seasonMeta.name}]**\n`) +
              `${BETA_EMOJIS.END_SEASON}: ` +
              toSmallCaps(`${seasonTimerStr} (Page ${page + 1}/${totalPages})\n\n`) +
              pageBody +
              toSmallCaps('\n\n____________________\n\n') +
              `${BETA_EMOJIS.USERS} ` +
              toSmallCaps('Your rank: ') +
              `${userRankIcon}` +
              toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${userPointsDisplay.toLocaleString()} (#${userRankPos})`)
            )
          );
      };

      const initialContainer = await renderBetaRanksContainer(currentPage);
      const ranksMsg = await message.reply({
        components: [initialContainer, getRanksRow(currentPage)],
        flags: MessageFlags.IsComponentsV2
      });

      const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
      ranksCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });

        if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;

        const updatedContainer = await renderBetaRanksContainer(currentPage);
        await ranksMsg.edit({
          components: [updatedContainer, getRanksRow(currentPage)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return true;
    }

    const buildRanksPageContent = async (page) => {
      const start = page * itemsPerPage;
      const pageUsers = allSortedUsers.slice(start, start + itemsPerPage);

      const lines = await Promise.all(pageUsers.map(async (u, idx) => {
        const username = await getDisplayName(u.uId);
        let clanInfo = '';
        if (u.clan && db.clans[u.clan]) {
          const clanObj = db.clans[u.clan];
          const cleanClanName = u.clan.replace(/\*/g, '');
          const logoEmoji = getClanLogoDisplay(clanObj.logoId);
          clanInfo = ` | ${logoEmoji} ${cleanClanName}`.trim();
        }
        return toSmallCaps(`**${start + idx + 1}.** **${username}** — Rank: `) + `${u.rank}` + toSmallCaps(` | Points: **${u.points.toLocaleString()}**`) + clanInfo;
      }));

      return lines.join('\n') || toSmallCaps('No players on the leaderboard yet.');
    };

    const getRanksRow = (page) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
      );
    };

    const renderRanksContainer = async (page) => {
      const pageBody = await buildRanksPageContent(page);
      return new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🏆 Chibi Global Leaderboard Season ${seasonNum}\n` +
              `End Season: ${seasonTimerStr}\n\n` +
              `(Page ${page + 1}/${totalPages})\n\n`
            ) +
            pageBody +
            toSmallCaps(
              '\n\n-----------------------------------\n' +
              '👤 Your Rank: #' + `${userRankPos} | Rank: `
            ) + `${userRankIcon}` + toSmallCaps(` | Points: ${userPointsDisplay.toLocaleString()}`)
          )
        );
    };

    const initialContainer = await renderRanksContainer(currentPage);
    const ranksMsg = await message.reply({
      components: [initialContainer, getRanksRow(currentPage)],
      flags: MessageFlags.IsComponentsV2
    });

    const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
    ranksCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });

      if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
      if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;

      const updatedContainer = await renderRanksContainer(currentPage);
      await ranksMsg.edit({
        components: [updatedContainer, getRanksRow(currentPage)],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    });
    return true;
  }

  if (command === 'ccranks') {
    const clanEntries = Object.entries(db.clans).map(([name, clan]) => {
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      return { name, clan, totalPoints };
    }).sort((a, b) => b.totalPoints - a.totalPoints);

    const maxClanSeasonMs = 30 * 24 * 60 * 60 * 1000;
    const timeRemainingMs = Math.min(maxClanSeasonMs, Math.max(0, (db.config.clanSeasonExpires || (Date.now() + maxClanSeasonMs)) - Date.now()));
    const clanTimerStr = formatTimeRemaining(timeRemainingMs);

    const rewards = db.config.clanRewards || {};
    const formatReward = (rNum) => {
      const rw = rewards[rNum];
      if (!rw) return '100x 🎲 Dice (Consolation)';
      const rIcon = rarityIconsMap[rw.rarity] || '📦';
      const sampleChibi = gameData.chibis.find(c => c.rarity === rw.rarity) || gameData.chibis[0];
      const chibiEmoji = sampleChibi ? sampleChibi.emoji : rw.chibiEmoji;
      return `${rw.qty} ${rIcon} ${chibiEmoji}`;
    };

    const top10Clans = clanEntries.slice(0, 10);
    const top10Lines = await Promise.all(top10Clans.map(async (c, idx) => {
      const leaderName = await getDisplayName(c.clan.leader);
      const cleanName = c.name.replace(/\*/g, '');
      const logoEmoji = getClanLogoDisplay(c.clan.logoId);
      return toSmallCaps(`**${idx + 1}.** ${logoEmoji} ${cleanName} | Leader: **${leaderName}** | Points: **${c.totalPoints.toLocaleString()}**`);
    }));

    let userClanLine = toSmallCaps('You are not currently in a clan.');
    if (user.clan && db.clans[user.clan]) {
      const uClanObj = db.clans[user.clan];
      const uClanRankIdx = clanEntries.findIndex(c => c.name === user.clan);
      const uClanRank = uClanRankIdx !== -1 ? `#${uClanRankIdx + 1}` : 'Unranked';
      const uClanPoints = uClanObj.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      const leaderName = await getDisplayName(uClanObj.leader);
      const cleanName = user.clan.replace(/\*/g, '');
      const logoEmoji = getClanLogoDisplay(uClanObj.logoId);
      userClanLine = toSmallCaps(`${uClanRank}. ${logoEmoji} ${cleanName} | Leader: **${leaderName}** | Members: ${uClanObj.members.length} | Points: **${uClanPoints.toLocaleString()}**`);
    }

    if (callerHasBetaView) {
      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${BETA_EMOJIS.GLOBAL} ` +
            toSmallCaps('**Top 10 Global Clan Leaderboard**\n') +
            `${BETA_EMOJIS.END_SEASON}: ` +
            toSmallCaps(`${clanTimerStr}\n\n`) +
            `${BETA_EMOJIS.RANKS_POS[1]}: ${formatReward(1)}\n` +
            `${BETA_EMOJIS.RANKS_POS[2]}: ${formatReward(2)}\n` +
            `${BETA_EMOJIS.RANKS_POS[3]}: ${formatReward(3)}\n\n` +
            toSmallCaps('-----------------------------------\n\n') +
            (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
            toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') +
            userClanLine
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x9b59b6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🏛️ Top 10 Global Clan Leaderboard\n` +
            `Ends: ${clanTimerStr}\n\n` +
            `**Clan Rewards:**\n` +
            `1st: ${formatReward(1)}\n` +
            `2nd: ${formatReward(2)}\n` +
            `3rd: ${formatReward(3)}\n\n` +
            `-----------------------------------\n\n`
          ) + (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
          toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine
        )
      );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'tradehistory') {
    if (!db.tradeHistories[userId] || db.tradeHistories[userId].length === 0) {
      return message.reply(toSmallCaps('📜 You have no recorded trade history yet.'));
    }

    const logs = db.tradeHistories[userId].slice(-10).reverse();
    const historyLines = await Promise.all(logs.map(async (entry, index) => {
      const partnerName = await getDisplayName(entry.partnerId);
      const dateStr = new Date(entry.timestamp).toLocaleString();
      return toSmallCaps(`**${index + 1}.** Partner: **${partnerName}**\n   Date: ${dateStr}`);
    }));

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps('# 📜 Your Recent Trade History\n\n') + historyLines.join('\n\n')
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'trade') {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === userId) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}trade [@user]`));
    }
    ensureUser(target.id);

    const acceptRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade_accept').setLabel(toSmallCaps('Accept Trade')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trade_decline').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
    );

    const reqMsg = await message.reply({
      content: toSmallCaps(`🤝 <@${target.id}>, you have been invited to trade by <@${userId}>! (Accept within 15 seconds)`),
      components: [acceptRow]
    });

    const collector = reqMsg.createMessageComponentCollector({ time: 15000 });

    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

      if (i.user.id !== target.id) {
        return i.followUp({ content: toSmallCaps('This trade invitation is not for you!'), ephemeral: true });
      }

      if (i.customId === 'trade_decline') {
        collector.stop();
        return reqMsg.edit({ content: toSmallCaps(`❌ Trade invitation declined by <@${target.id}>.`), components: [] }).catch(() => {});
      }

      if (i.customId === 'trade_accept') {
        collector.stop();

        const p1Offer = { dice: 0, chibi: null };
        const p2Offer = { dice: 0, chibi: null };

        const getEmbed = () => {
          const getOfferText = (offer) => {
            const parts = [];
            if (offer.dice > 0) parts.push(`**${offer.dice} 🎲 Dice**`);
            if (offer.chibi) parts.push(`${rarityIconsMap[offer.chibi.rarity]} ${offer.chibi.emoji} **${offer.chibi.name}** (Lv.${offer.chibi.level})`);
            return parts.length > 0 ? parts.join(' + ') : '*Empty*';
          };

          const p1Txt = getOfferText(p1Offer);
          const p2Txt = getOfferText(p2Offer);

          return {
            color: 0xf1c40f,
            title: toSmallCaps('🤝 Active Trade Session'),
            description: toSmallCaps(
              `<@${userId}> Offers:\n${p1Txt}\n\n` +
              '------------------\n\n' +
              `<@${target.id}> Offers:\n${p2Txt}`
            )
          };
        };

        const tradeRows = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('trade_offer_dice').setLabel(toSmallCaps('Offer Dice [Qty] 🎲')).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('trade_offer_chibi').setLabel(toSmallCaps('Offer Chibi 🐾')).setStyle(ButtonStyle.Success)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('trade_confirm').setLabel(toSmallCaps('Confirm Trade ✅')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('trade_cancel').setLabel(toSmallCaps('Cancel ❌')).setStyle(ButtonStyle.Danger)
          )
        ];

        await reqMsg.edit({
          content: '',
          embeds: [getEmbed()],
          components: tradeRows
        }).catch(() => {});

        const tradeCollector = reqMsg.createMessageComponentCollector({ time: 60000 });

        tradeCollector.on('collect', async ti => {
          if (!ti.deferred && !ti.replied) await ti.deferUpdate().catch(() => {});

          const isP1 = ti.user.id === userId;
          const isP2 = ti.user.id === target.id;
          const currentOffer = isP1 ? p1Offer : p2Offer;

          if (!isP1 && !isP2) {
            return ti.followUp({ content: toSmallCaps('Not your trade session!'), ephemeral: true });
          }

          if (ti.customId === 'trade_cancel') {
            tradeCollector.stop();
            return reqMsg.edit({ content: toSmallCaps(`❌ Trade cancelled by <@${ti.user.id}>.`), embeds: [], components: [] }).catch(() => {});
          }

          if (ti.customId === 'trade_offer_dice') {
            await ti.followUp({ content: toSmallCaps('🎲 Type the amount of Dice you want to offer in chat (e.g. 50):'), ephemeral: true });
            const msgs = await ti.channel.awaitMessages({ filter: m => m.author.id === ti.user.id, max: 1, time: 20000 }).catch(() => null);
            const m = msgs?.first();
            if (!m) return;

            const amt = parseInt(m.content, 10);
            const uObj = db.users[ti.user.id];
            await m.delete().catch(() => {});

            if (isNaN(amt) || amt <= 0) {
              return ti.followUp({ content: toSmallCaps('❌ Invalid dice amount!'), ephemeral: true });
            }
            if (uObj.dice < amt) {
              return ti.followUp({ content: toSmallCaps(`❌ You don't have enough dice! You have ${uObj.dice} 🎲.`), ephemeral: true });
            }

            currentOffer.dice = amt;
            return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
          }

          if (ti.customId === 'trade_offer_chibi') {
            const uObj = db.users[ti.user.id];
            if (!uObj.inventory.chibis || uObj.inventory.chibis.length === 0) {
              return ti.followUp({ content: toSmallCaps('❌ You have no chibis in your inventory to offer!'), ephemeral: true });
            }

            const options = uObj.inventory.chibis.slice(0, 25).map(c => ({
              label: `${c.name} (${c.rarity}) Lv.${c.level}`.slice(0, 100),
              value: c.chibiId || c.id
            }));

            const menuRow = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('trade_select_chibi')
                .setPlaceholder(toSmallCaps('Select a Chibi to offer'))
                .addOptions(options)
            );

            await ti.followUp({
              content: toSmallCaps('Choose a chibi from your inventory below:'),
              components: [menuRow],
              ephemeral: true
            });

            const selectFilter = int => int.user.id === ti.user.id && int.customId === 'trade_select_chibi';
            const selection = await ti.channel.awaitMessageComponent({ filter: selectFilter, time: 25000 }).catch(() => null);

            if (!selection) return;
            if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

            const chosenId = selection.values[0];
            const chosenChibi = uObj.inventory.chibis.find(c => (c.chibiId || c.id) === chosenId);

            if (chosenChibi) {
              currentOffer.chibi = chosenChibi;
              return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
            }
            return;
          }

          if (ti.customId === 'trade_confirm') {
            const u1 = db.users[userId];
            const u2 = db.users[target.id];

            const p1HasSomething = p1Offer.dice > 0 || p1Offer.chibi !== null;
            const p2HasSomething = p2Offer.dice > 0 || p2Offer.chibi !== null;

            if (!p1HasSomething || !p2HasSomething) {
              return ti.followUp({ content: toSmallCaps('❌ Both players must offer at least something (dice or chibi) before confirming!'), ephemeral: true });
            }

            if (u1.dice < p1Offer.dice || u2.dice < p2Offer.dice) {
              return ti.followUp({ content: toSmallCaps('❌ One of the players no longer has enough dice for this trade!'), ephemeral: true });
            }

            if (p1Offer.dice > 0) {
              u1.dice -= p1Offer.dice;
              u2.dice += p1Offer.dice;
            }
            if (p1Offer.chibi) {
              const idx = u1.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p1Offer.chibi.chibiId || p1Offer.chibi.id));
              if (idx !== -1) {
                const [transferred] = u1.inventory.chibis.splice(idx, 1);
                u2.inventory.chibis.push(transferred);
              }
            }

            if (p2Offer.dice > 0) {
              u2.dice -= p2Offer.dice;
              u1.dice += p2Offer.dice;
            }
            if (p2Offer.chibi) {
              const idx = u2.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p2Offer.chibi.chibiId || p2Offer.chibi.id));
              if (idx !== -1) {
                const [transferred] = u2.inventory.chibis.splice(idx, 1);
                u1.inventory.chibis.push(transferred);
              }
            }

            if (!db.tradeHistories[userId]) db.tradeHistories[userId] = [];
            if (!db.tradeHistories[target.id]) db.tradeHistories[target.id] = [];
            const tradeTimestamp = Date.now();
            db.tradeHistories[userId].push({ partnerId: target.id, timestamp: tradeTimestamp });
            db.tradeHistories[target.id].push({ partnerId: userId, timestamp: tradeTimestamp });

            updateUserRank(u1);
            updateUserRank(u2);
            await evaluateAndSyncUserBadges(userId, u1, message.guild);
            await evaluateAndSyncUserBadges(target.id, u2, message.guild);
            await saveUsers();
            tradeCollector.stop();

            return reqMsg.edit({
              content: toSmallCaps(`✅ Trade successfully completed between <@${userId}> and <@${target.id}>!`),
              embeds: [getEmbed()],
              components: []
            }).catch(() => {});
          }
        });
      }
    });
    return true;
  }

  if (command === 'profile') {
    const targetUserMention = message.mentions.users.first();
    const targetUserId = targetUserMention ? targetUserMention.id : userId;
    ensureUser(targetUserId);
    const targetUserData = db.users[targetUserId];
    updateUserRank(targetUserData);

    if (targetUserData.inventory && targetUserData.inventory.chibis && targetUserData.inventory.chibis.length > 0) {
      let highestChibi = null;
      let highestTier = 0;
      let highestVal = 0;

      for (const c of targetUserData.inventory.chibis) {
        const tier = RARITY_HIERARCHY[c.rarity] || 1;
        const allChibisPool = [...(gameData.chibis || []), ...(gameData.eventChibis || [])];
        const template = allChibisPool.find(t => t.name === c.name && t.rarity === c.rarity);
        const oddsStr = template ? (c.isShiny ? template.shinyOdds : template.odds) : '1 in 1';
        const val = parseOddsNumber(oddsStr);

        if (tier > highestTier || (tier === highestTier && val > highestVal)) {
          highestTier = tier;
          highestVal = val;
          highestChibi = { chibi: c, oddsStr };
        }
      }

      if (highestChibi && (
        targetUserData.bestRoll === '1 in 1' ||
        highestTier > (targetUserData.bestRollTier || 0) ||
        (highestTier === (targetUserData.bestRollTier || 0) && highestVal > (targetUserData.bestRollVal || 0))
      )) {
        targetUserData.bestRollTier = highestTier;
        targetUserData.bestRollVal = highestVal;
        targetUserData.bestRoll = highestChibi.oddsStr;
        targetUserData.bestChibi = `${rarityIconsMap[highestChibi.chibi.rarity] || '🌟'} ${highestChibi.chibi.emoji} ${highestChibi.chibi.isShiny ? SHINY_ICON : ''}`;
        await saveUsers();
      }
    }

    const targetMember = targetUserMention || message.author;
    const avatarUrl = targetMember.displayAvatarURL({ extension: 'png', size: 256 });
    const resolvedBg = resolveStoredProfileBg(targetUserData.profileBg);

    const allSortedUsers = Object.entries(db.users)
      .map(([uId, uData]) => ({ uId, points: uData.points || 0 }))
      .sort((a, b) => b.points - a.points);
    const globalIndex = allSortedUsers.findIndex(u => u.uId === targetUserId);
    const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';

    let clanDisplayStr = 'NONE';
    if (targetUserData.clan && db.clans[targetUserData.clan]) {
      const cObj = db.clans[targetUserData.clan];
      const cleanName = targetUserData.clan.replace(/\*/g, '');
      const logoEmoji = getClanLogoDisplay(cObj.logoId);
      clanDisplayStr = `${logoEmoji} ${cleanName}`;
    }

    const joinedDateStr = targetUserData.joinedDate || 'N/A';
    const displayName = targetUserData.customNickname || targetMember.username;

    if ((isTester(userId) && isTester(targetUserId)) || Boolean(db.config.featuresPublished)) {
      const syncedBadges = await evaluateAndSyncUserBadges(targetUserId, targetUserData, message.guild);
      await saveUsers();

      const badgeIconsRow = syncedBadges.length > 0
        ? syncedBadges.map(bKey => BADGE_CATALOG[bKey]?.icon).filter(Boolean).join(' ')
        : '*None*';

      const rarityCounts = { SSRP: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
      if (targetUserData.inventory && targetUserData.inventory.chibis) {
        targetUserData.inventory.chibis.forEach(c => {
          if (rarityCounts[c.rarity] !== undefined) {
            rarityCounts[c.rarity]++;
          }
        });
      }

      const cIcon = BETA_EMOJIS.RARITIES.C;
      const uIcon = BETA_EMOJIS.RARITIES.U;
      const rIcon = BETA_EMOJIS.RARITIES.R;
      const srIcon = BETA_EMOJIS.RARITIES.SR;
      const srrIcon = rarityIconsMap['SRR'] || '📦';
      const utrIcon = BETA_EMOJIS.RARITIES.UTR;
      const ssrpIcon = BETA_EMOJIS.RARITIES.SSRP;

      const bgFooterLine = resolvedBg
        ? toSmallCaps(`\n\n🎞️ Backdrop: **${resolvedBg.label}** (GIF Active)`)
        : '';

      const betaHeader =
        `${BETA_EMOJIS.USERS} **@${displayName}**\n` +
        toSmallCaps(`[${joinedDateStr}]\n\n`) +
        `${BETA_EMOJIS.TOTAL_BADGE} ` + toSmallCaps('User Badges\n') +
        `${badgeIconsRow}\n\n`;

      const boxedStats =
        '```\n' +
        'USER STATS | RANK STATS\n' +
        '```\n' +
        `${BETA_EMOJIS.STATS} ` + toSmallCaps('User Status\n') +
        `${BETA_EMOJIS.DICE} ` + toSmallCaps(`Dice: **${(targetUserData.dice || 0).toLocaleString()}**\n`) +
        `${BETA_EMOJIS.CASH} ` + toSmallCaps('Cash: **0**\n') +
        `${BETA_EMOJIS.STREAK} ` + toSmallCaps(`Streak: **${targetUserData.streak || 0}D**\n`) +
        `${BETA_EMOJIS.EXP} ` + toSmallCaps(`Level: **${targetUserData.userLevel || 1}**\n\n`) +
        `${BETA_EMOJIS.RANK} ` + toSmallCaps('Rank Stats\n') +
        `${BETA_EMOJIS.RANK} ` + toSmallCaps('Rank: ') + `${targetUserData.rank}\n` +
        `${BETA_EMOJIS.TROPHY_PTS} ` + toSmallCaps(`Points: **${(targetUserData.points || 0).toLocaleString()}**\n`) +
        `${BETA_EMOJIS.GLOBAL} ` + toSmallCaps(`Leaderboard: **${leaderboardPos}**\n`) +
        `${BETA_EMOJIS.CLAN_BADGE} ` + toSmallCaps(`Clan: **${clanDisplayStr}**\n\n`);

      const betaCollections =
        `${BETA_EMOJIS.INV} ` + toSmallCaps('Collections Rarities\n') +
        `${cIcon} ` + toSmallCaps(`Common: **${rarityCounts.C}**\n`) +
        `${uIcon} ` + toSmallCaps(`Uncommon: **${rarityCounts.U}**\n`) +
        `${rIcon} ` + toSmallCaps(`Rare: **${rarityCounts.R}**\n`) +
        `${srIcon} ` + toSmallCaps(`SR: **${rarityCounts.SR}**\n`) +
        `${srrIcon} ` + toSmallCaps(`SRR: **${rarityCounts.SRR}**\n`) +
        `${utrIcon} ` + toSmallCaps(`UTR: **${rarityCounts.UTR}**\n`) +
        `${ssrpIcon} ` + toSmallCaps(`SSRP: **${rarityCounts.SSRP}**`) +
        bgFooterLine;

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(betaHeader + boxedStats + betaCollections)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl)
        );

      const container = new ContainerBuilder()
        .setAccentColor(0x1abc9c)
        .addSectionComponents(section);

      if (resolvedBg && resolvedBg.url) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(resolvedBg.url)
          )
        );
      }

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const mainRarityIconsMap = getRarityIconMap(false);
    const rarityCounts = { SSRP: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
    if (targetUserData.inventory && targetUserData.inventory.chibis) {
      targetUserData.inventory.chibis.forEach(c => {
        if (rarityCounts[c.rarity] !== undefined) {
          rarityCounts[c.rarity]++;
        }
      });
    }

    const targetUserMaxExp = gameData.settings.userExpBase + (targetUserData.userLevel - 1) * gameData.settings.userExpPerLevel;
    const bestRollIconPart = targetUserData.bestChibi ? targetUserData.bestChibi : 'NONE';
    const bestRollOddsPart = targetUserData.bestRoll && targetUserData.bestRoll !== 'None' ? `1 IN ${targetUserData.bestRoll}` : 'NONE';

    let customStatusDisplay = '';
    if (targetUserData.customStatus && targetUserData.customStatus.text) {
      const elapsedMs = Date.now() - targetUserData.customStatus.timestamp;
      const totalSecs = Math.floor(elapsedMs / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      const timeFormatted = hrs > 0
        ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${mins}:${String(secs).padStart(2, '0')}`;

      customStatusDisplay = toSmallCaps(`\n🎮 **${targetUserData.customStatus.text}**\n🎮 ${timeFormatted}\n`);
    }

    const bgFooterLine = resolvedBg
      ? toSmallCaps(`\n\n🎞️ **BACKDROP:** ${resolvedBg.label}`)
      : '';

    const profileHeader = toSmallCaps(`👤 **! ${displayName}**\n@${targetMember.username}  •  JOINED ${joinedDateStr}\n`) + customStatusDisplay + '\n';

    const statsSection = toSmallCaps(
      '## 📊 STATS\n\n' +
      'RANKS: '
    ) + `${targetUserData.rank}` + toSmallCaps(`  |  🎲: **${targetUserData.dice || 0}**\n`) +
    toSmallCaps(
      `POINTS: **${targetUserData.points.toLocaleString()}**  |  GLOBAL RANK: **${leaderboardPos}**\n` +
      `STREAK: **${targetUserData.streak || 0}D**  |  CLAN: **${clanDisplayStr}**\n` +
      `LEVEL: **${targetUserData.userLevel}** (${targetUserData.userExp}/${targetUserMaxExp})\n\n`
    );

    const collectionSection = toSmallCaps(
      '## 📦 COLLECTIONS\n\n' +
      `${mainRarityIconsMap['C'] || '📦'} C: **${rarityCounts.C}**  |  ${mainRarityIconsMap['UTR'] || '📦'} UTR: **${rarityCounts.UTR}**\n` +
      `${mainRarityIconsMap['U'] || '📦'} U: **${rarityCounts.U}**  |  ${mainRarityIconsMap['SSRP'] || '🌟'} SSRP: **${rarityCounts.SSRP}**\n` +
      `${mainRarityIconsMap['R'] || '📦'} R: **${rarityCounts.R}**\n` +
      `${mainRarityIconsMap['SR'] || '📦'} SR: **${rarityCounts.SR}**\n` +
      `${mainRarityIconsMap['SRR'] || '📦'} SRR: **${rarityCounts.SRR}**\n\n` +
      `🎲 **BEST ROLL:** ${bestRollIconPart} & ${bestRollOddsPart}`
    ) + bgFooterLine;

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(profileHeader + statsSection + collectionSection)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarUrl)
      );

    const container = new ContainerBuilder()
      .setAccentColor(0x36393f)
      .addSectionComponents(section);

    if (resolvedBg && resolvedBg.url) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(resolvedBg.url)
        )
      );
    }

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  return false;
}

module.exports = {
  commands: CORE_CMDS,
  execute
};