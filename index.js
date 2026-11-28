const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder,
  AttachmentBuilder, MessageFlags, PermissionsBitField
} = require('discord.js');
const mongoose = require('mongoose');

const {
  BADGE_CATALOG, BETA_EMOJIS, CLAN_ROLE_HIERARCHY, CLAN_LOGOS, EVENT_ICONS, EVENT_NPCS,
  EVENT_CHIBIS_POOL, SEASON_LIST, TRIVIA_BANK, SHINY_ICON, RARITY_HIERARCHY, ALL_VALID_COMMANDS,
  TESTER_ONLY_COMMANDS
} = require('./core/constants');
const { gameData, GameState, db, initDatabase, saveUsers: rawSaveUsers } = require('./core/database');
const {
  isTester, canSeeUnreleasedBeta, toSmallCaps, getRarityIconMap, updateUserRank, updatePeakRank,
  evaluateAndSyncUserBadges, ensureUser, getClanLogoDisplay, getClanLogoImageUrl,
  getClanLogoListText, getClanMemberRole, pushClanMail, parseDurationToMs, formatTimeRemaining,
  formatTimePlayed, addExpAndLevelUp, parseOddsNumber
} = require('./core/helpers');
const { renderProfileCard, THEME_PALETTES, hasSupporterOrNitro } = require('./core/profilecard');

let saveQueue = Promise.resolve();
const saveUsers = () => {
  saveQueue = saveQueue.then(() => rawSaveUsers()).catch(err => {
    console.error('[saveUsers] Error:', err);
  });
  return saveQueue;
};

function loadCommandModule(filename) {
  const fullPath = path.join(__dirname, 'commmands', filename);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return require(fullPath);
  } catch (err) {
    console.error(`[${filename}] Failed to load module:`, err);
    return null;
  }
}

const economyModule = loadCommandModule('economycommands.js');
const npcModule = loadCommandModule('npccommands.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const cooldowns = new Map();
const channelSpawnMessageCounters = new Map();
const NPC_RANDOM_SPAWN_EVERY_N_MESSAGES = 25;

const REVAMPED_RARITY_CONFIG = [
  { key: 'C', label: 'Common', emoji: '<:Pcommon:1573802564200300687>', normalPct: 35, shinyPct: 0.0952 },
  { key: 'U', label: 'Uncommon', emoji: '<:Puncommon:1573802607561015306>', normalPct: 15, shinyPct: 0.0721 },
  { key: 'R', label: 'Rare', emoji: '<:Prare:1573802661134864464>', normalPct: 8, shinyPct: 0.0572 },
  { key: 'SR', label: 'SR', emoji: '<:Psr:1573802765459918889>', normalPct: 4, shinyPct: 0.0217 },
  { key: 'SRR', label: 'SRR', emoji: '<:Psrr:1573802796040585358>', normalPct: 1, shinyPct: 0.0137 },
  { key: 'UTR', label: 'UTR', emoji: '<a:Putr:1573802703090614342>', normalPct: 0.49, shinyPct: 0.0092 },
  { key: 'STR', label: 'STR', emoji: '<a:Pstr:1573802859491762237>', normalPct: 0.1, shinyPct: 0.0028 },
  { key: 'USRR', label: 'USRR', emoji: '<a:Pusrr:1573802908846264380>', normalPct: 0.0190, shinyPct: 0.0010 },
  { key: 'UGMR', label: 'UGMR', emoji: '<a:Pugmr:1573802950675923024>', normalPct: 0.015, shinyPct: 0.0001 }
];

const REVAMPED_RARITY_ICONS = Object.fromEntries(REVAMPED_RARITY_CONFIG.map(r => [r.key, r.emoji]));
const REVAMPED_RARITY_TIER = { SSRP: 10, UGMR: 9, USRR: 8, STR: 7, UTR: 6, SRR: 5, SR: 4, R: 3, U: 2, C: 1 };
const BATTLE_ICONS = {
  hp: '<:Hp:1572769347061940356>',
  def: '<:Def:1572769405841055784>',
  atk: '<:Swordx:1572769375318970368>'
};

const SHORTCUTS = {
  h: 'help', r: 'roll', p: 'profile', inv: 'inventory', col: 'collections', d: 'drop', t: 'trade',
  slot: 'slot', pc: 'prefixchange', ec: 'enablec', dc: 'disablec', ac: 'admincommands',
  oc: 'ownercommands', ownercommands: 'ownercommands', ownerresetdata: 'ownerresetdata',
  cnn: 'customnn', ss: 'seasons', hss: 'higheststats', ownercl: 'ownercl',
  owneradminpermsrem: 'owneradminpermsrem', th: 'tradehistory', tradehistory: 'tradehistory',
  ccr: 'ccranks', ccranks: 'ccranks', rar: 'rarities', event: 'event', eshop: 'eshop',
  es: 'eshop', cadventure: 'eadventure', ca: 'eadventure', eadventure: 'eadventure', ea: 'eadventure',
  ecrystal: 'ecrystal', ownersetstatus: 'ownersetstatus', oss: 'ownersetstatus',
  tf: 'testerfeatures', agb: 'admingivebadges', cp: 'cpromote', ced: 'ceditdesc',
  w: 'work', wg: 'working', ws: 'workshift', bal: 'balance', cs: 'casino',
  bj: 'blackjack', cf: 'coinflip', tb: 'ticketbuy', tu: 'ticketuse', lot: 'lottery',
  sell: 'csell', fns: 'fnpcspawn', nsr: 'nsredeem', snsr: 'snsredeem'
};

const RESTRICTED_EXEMPT_COMMANDS = new Set([
  'enablec', 'disablec', 'prefixchange', 'pc', 'admincommands', 'ac', 'oc', 'ownercommands',
  'ownerresetdata', 'help', 'status', 'fixadmin', 'ownercl', 'owneradminpermsrem',
  'ownersecretpanel', 'event', 'ownerbotmaintenance', 'adminrestoreall', 'ownersetstatus',
  'testerpanel', 'addtester', 'removetester', 'pubnewupd', 'testerfeatures', 'tf',
  'admingivebadges', 'agb', 'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced'
]);

const NPC_ADMIN_COMMANDS = new Set(['fnpcspawn', 'redeemgive', 'sredeemgive']);

function ensureDbShapes() {
  if (!db.config || typeof db.config !== 'object') db.config = {};
  if (!db.clans || typeof db.clans !== 'object') db.clans = {};
  if (!db.tradeHistories || typeof db.tradeHistories !== 'object') db.tradeHistories = {};
  if (!db.bannedUsers || typeof db.bannedUsers !== 'object') db.bannedUsers = {};
  if (!db.channelRestrictions || typeof db.channelRestrictions !== 'object') db.channelRestrictions = {};
  if (!db.guildPrefixes || typeof db.guildPrefixes !== 'object') db.guildPrefixes = {};
  if (!db.config.eventCrystals || typeof db.config.eventCrystals !== 'object') db.config.eventCrystals = {};
  if (!db.config.clanRewards || typeof db.config.clanRewards !== 'object') db.config.clanRewards = {};
}

const buildStatBar = (current, max, length = 10) => {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeCurrent = Math.max(0, Math.min(safeMax, Number(current) || 0));
  const filled = Math.max(0, Math.min(length, Math.round((safeCurrent / safeMax) * length)));
  return `[${'█'.repeat(filled)}${'░'.repeat(length - filled)}]`;
};

function trackPeakPoints(u) {
  if (!u) return;
  u.highestSeasonPoints = Math.max(Number(u.highestSeasonPoints) || 0, Number(u.points) || 0);
  updatePeakRank(u);
}

function resolveCatalogBadgeKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const cleaned = rawKey.trim().toLowerCase();
  if (BADGE_CATALOG?.[cleaned]) return cleaned;
  const aliases = { nitrouser: 'nitro', support: 'supporter', creator: 'developer' };
  return BADGE_CATALOG?.[aliases[cleaned]] ? aliases[cleaned] : null;
}

function formatBadgeCatalogLines(categoryName) {
  const entries = Object.values(BADGE_CATALOG || {}).filter(b => b.category === categoryName);
  return entries.length ? entries.map(b => `${b.icon} **\`${b.key}\`** — ${b.description}`).join('\n') : '*None*';
}

function buildHelpCategories(prefix) {
  return {
    rolling: {
      label: 'Rolling, Drops & Games', emoji: '🎲', title: '🎲 Rolling, Drops & Games',
      lines: [
        `\`${prefix}roll [qty] [boost]\` (\`${prefix}r\`)`, `\`${prefix}drop\` (\`${prefix}d\`)`,
        `\`${prefix}slot [bet]\``, `\`${prefix}shop\``, `\`${prefix}rarities\` (\`${prefix}rar\`)`
      ]
    },
    economy: {
      label: 'Rewards & Economy', emoji: '💰', title: '💰 Rewards & Economy',
      lines: [
        `\`${prefix}work\` (\`${prefix}w\`)`, `\`${prefix}working\` (\`${prefix}wg\`)`,
        `\`${prefix}workshift\` (\`${prefix}ws\`)`, `\`${prefix}balance\` (\`${prefix}bal\`)`,
        `\`${prefix}casino\` (\`${prefix}cs\`)`, `\`${prefix}blackjack\` (\`${prefix}bj\`)`,
        `\`${prefix}coinflip\` (\`${prefix}cf\`)`, `\`${prefix}ticketbuy\` (\`${prefix}tb\`)`,
        `\`${prefix}ticketuse\` (\`${prefix}tu\`)`, `\`${prefix}lottery\` (\`${prefix}lot\`)`,
        `\`${prefix}csell [qty] [rarity]\` (\`${prefix}sell\`)`, `\`${prefix}daily\``,
        `\`${prefix}points\``, `\`${prefix}rank\` / \`${prefix}ranks\``,
        `\`${prefix}ccranks\` (\`${prefix}ccr\`)`, `\`${prefix}customnn\` (\`${prefix}cnn\`)`,
        `\`${prefix}profilebg\``, `\`${prefix}setbg\``, `\`${prefix}seasons\` (\`${prefix}ss\`)`,
        `\`${prefix}higheststats\` (\`${prefix}hss\`)`, `\`${prefix}tradehistory\` (\`${prefix}th\`)`
      ]
    },
    npcs: {
      label: 'NPCs & Redeems', emoji: '🥷', title: '🥷 NPCs & Redeems',
      lines: [
        `\`${prefix}cnpc\``, `\`${prefix}npcinv\``, `\`${prefix}cget <Npcname>\``,
        `\`${prefix}nrebirth\``, `\`${prefix}nascend\``,
        `\`${prefix}nsredeem <NPC name>\` (\`${prefix}nsr\`)`,
        `\`${prefix}snsredeem <Shiny NPC name>\` (\`${prefix}snsr\`)`, `\`${prefix}redeems\``
      ]
    },
    event: {
      label: 'Event System', emoji: '🌟', title: '🌟 Event System',
      lines: [
        `\`${prefix}event\``, `\`${prefix}eadventure\` (\`${prefix}ca\`)`,
        `\`${prefix}eshop\` (\`${prefix}es\`)`, `\`${prefix}ecrystal\` (\`${prefix}ec\`)`
      ]
    },
    rpg: {
      label: 'RPG & Battling', emoji: '⚔️', title: '⚔️ RPG & Battling',
      lines: [`\`${prefix}cstats\``, `\`${prefix}equipteam [id] [slot]\``, `\`${prefix}battle [@user]\``]
    },
    inventory: {
      label: 'Inventory & Profile', emoji: '🎒', title: '🎒 Inventory & Profile',
      lines: [
        `\`${prefix}inventory\` (\`${prefix}inv\`)`, `\`${prefix}collections\` (\`${prefix}col\`)`,
        `\`${prefix}profile\` (\`${prefix}p\`) [@user]`, `\`${prefix}trade\` (\`${prefix}t\`) [@user]\``
      ]
    },
    clans: {
      label: 'Clans & Server', emoji: '🏛️', title: '🏛️ Clans & Server',
      lines: [
        `\`${prefix}clanlist\``, `\`${prefix}cclaninfo\``, `\`${prefix}ccreateclan\``,
        `\`${prefix}cclanjoin\``, `\`${prefix}clanleave\``, `\`${prefix}clanrename\``,
        `\`${prefix}prefixchange\``, `\`${prefix}enablec\``, `\`${prefix}disablec\``
      ]
    }
  };
}

function renderHelpContainer(prefix, selectedKey = null) {
  const categories = buildHelpCategories(prefix);
  const bodyContent = selectedKey && categories[selectedKey]
    ? toSmallCaps(`${categories[selectedKey].title}\n`) + categories[selectedKey].lines.join('\n')
    : Object.values(categories).map(cat => toSmallCaps(`${cat.title}\n`) + cat.lines.join('\n')).join('\n\n');

  const activeLabel = selectedKey && categories[selectedKey] ? categories[selectedKey].label : 'All Categories';
  return new ContainerBuilder()
    .setAccentColor(0xff77aa)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 🌸 Chibi RPG RNG — Help Center\nViewing: **${activeLabel}**\nSelect a category below:`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent));
}

function renderHelpMenuRow(selectedKey = null) {
  const categories = buildHelpCategories('');
  const options = [
    { label: 'All Categories', value: 'all', emoji: '📚', default: !selectedKey },
    ...Object.entries(categories).map(([key, cat]) => ({
      label: cat.label, value: key, emoji: cat.emoji, default: selectedKey === key
    }))
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder(toSmallCaps('Choose a help category...'))
      .addOptions(options)
  );
}

function getGuildPrefix(guildId) {
  ensureDbShapes();
  let prefix = (guildId && db.guildPrefixes[guildId]) || '+';
  return /^[a-zA-Z]$/.test(prefix) ? '+' : prefix;
}

client.on('interactionCreate', async interaction => {
  ensureDbShapes();
  if (npcModule && typeof npcModule.handleNpcInteraction === 'function') {
    const handledNpc = await npcModule.handleNpcInteraction(interaction).catch(err => {
      console.error('[npcInteraction] Error:', err);
      return false;
    });
    if (handledNpc) return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
    await interaction.deferUpdate().catch(() => {});
    const prefix = getGuildPrefix(interaction.guildId);
    const chosen = interaction.values?.[0];
    const selectedKey = chosen && chosen !== 'all' ? chosen : null;
    await interaction.message.edit({
      components: [renderHelpContainer(prefix, selectedKey), renderHelpMenuRow(selectedKey)],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => {});
  }
});

client.once('clientReady', async () => {
  ensureDbShapes();
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);

  if (!db.config.mainGuildId && client.guilds.cache.size > 0) {
    const firstGuild = client.guilds.cache.first();
    db.config.mainGuildId = firstGuild.id;
    const state = await GameState.findById('main_state').catch(() => null);
    if (state) {
      state.config = db.config;
      state.markModified('config');
      await state.save().catch(() => {});
    }
    console.log(`📌 Auto-assigned Main Server: ${firstGuild.name} (${firstGuild.id})`);
  }

  const updateStatus = () => {
    client.user.setActivity(toSmallCaps(`+help | Serving ${client.guilds.cache.size} servers`), { type: 0 });
  };
  updateStatus();
  setInterval(updateStatus, 60000);

  setInterval(async () => {
    ensureDbShapes();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    let changed = false;

    if (db.config.seasonExpires && now >= db.config.seasonExpires) {
      for (const u of Object.values(db.users)) {
        u.highestSeasonRank = u.rank;
        u.highestSeasonPoints = u.points || 0;
        updatePeakRank(u);
        u.points = 0;
        updateUserRank(u);
      }
      db.config.seasonNumber = (db.config.seasonNumber || 1) + 1;
      db.config.seasonStartedAt = now;
      db.config.seasonExpires = now + thirtyDaysMs;
      changed = true;
    }

    if (db.config.clanSeasonExpires && now >= db.config.clanSeasonExpires) {
      const sortedClans = Object.entries(db.clans).map(([name, clan]) => ({
        name,
        clan,
        totalPoints: clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0)
      })).sort((a, b) => b.totalPoints - a.totalPoints);

      for (let idx = 0; idx < sortedClans.length; idx++) {
        const rank = idx + 1;
        const { name, clan } = sortedClans[idx];
        const rewardCfg = db.config.clanRewards[rank];
        const sampleChibi = gameData.chibis.find(c => c.rarity === (rewardCfg?.rarity || 'SR')) || gameData.chibis[0];

        for (const mId of clan.members) {
          ensureUser(mId);
          pushClanMail(mId, rewardCfg ? {
            title: `Clan Season Reward (#${rank})`,
            body: `Your clan **${name}** finished Rank #${rank}! Reward: ${rewardCfg.qty}x ${rewardCfg.rarity} ${sampleChibi.emoji} ${sampleChibi.name}.`,
            category: 'Rewards',
            claimed: false,
            reward: {
              type: 'chibi', qty: rewardCfg.qty || 1, rarity: rewardCfg.rarity || 'SR',
              name: sampleChibi.name, emoji: sampleChibi.emoji
            }
          } : {
            title: `Clan Season Consolation (#${rank})`,
            body: `Your clan **${name}** finished Rank #${rank}! Reward: 100x 🎲 Dice.`,
            category: 'Rewards',
            claimed: false,
            reward: { type: 'dice', dice: 100 }
          });
        }
      }
      db.config.clanSeasonExpires = now + thirtyDaysMs;
      changed = true;
    }

    if (changed) await saveUsers();
  }, 60000);
});

client.on('guildCreate', async guild => {
  ensureDbShapes();
  if (!db.config.mainGuildId) {
    db.config.mainGuildId = guild.id;
    const state = await GameState.findById('main_state').catch(() => null);
    if (state) {
      state.config = db.config;
      state.markModified('config');
      await state.save().catch(() => {});
    }
    console.log(`📌 Main/First Server registered: ${guild.name} (${guild.id})`);
  }
});

client.on('messageCreate', async message => {
  if (!message.author || message.author.id === client.user?.id) return;
  ensureDbShapes();

  const guildId = message.guild ? message.guild.id : 'DM';
  const currentPrefix = getGuildPrefix(guildId);

  if (npcModule && message.guild && !message.content.startsWith(currentPrefix)) {
    const actorUser = db.users?.[message.author.id];
    if (actorUser?.started && typeof npcModule.processNpcChatOrBotActivity === 'function') {
      await npcModule.processNpcChatOrBotActivity(message, actorUser, currentPrefix).catch(() => {});
    }
    if (!message.author.bot && typeof npcModule.spawnNpcInChannel === 'function') {
      const nextCount = (channelSpawnMessageCounters.get(message.channel.id) || 0) + 1;
      if (nextCount >= NPC_RANDOM_SPAWN_EVERY_N_MESSAGES) {
        channelSpawnMessageCounters.set(message.channel.id, 0);
        await npcModule.spawnNpcInChannel(message.channel, currentPrefix, null).catch(() => {});
      } else {
        channelSpawnMessageCounters.set(message.channel.id, nextCount);
      }
    }
  }

  if (message.author.bot || !message.content.startsWith(currentPrefix)) return;
  const afterPrefix = message.content.slice(currentPrefix.length);
  if (!afterPrefix || afterPrefix.startsWith(' ')) return;

  const args = afterPrefix.trim().split(/ +/);
  let command = (args.shift() || '').toLowerCase();
  if (!command) return;
  if (SHORTCUTS[command]) command = SHORTCUTS[command];

  const isEconomyCmd = Array.isArray(economyModule?.commands) && economyModule.commands.includes(command);
  const isNpcCmd = Array.isArray(npcModule?.commands) && npcModule.commands.includes(command);
  const isNpcAdminCmd = NPC_ADMIN_COMMANDS.has(command);

  if (!ALL_VALID_COMMANDS.has(command) && !isEconomyCmd && !isNpcCmd && !isNpcAdminCmd) return;

  const userId = message.author.id;
  const isOwner = () => {
    if (!db.config.ownerId) db.config.ownerId = userId;
    return userId === db.config.ownerId;
  };

  if (TESTER_ONLY_COMMANDS.has(command) && !isTester(userId)) {
    return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
  }
  if (db.config.maintenanceMode && !isOwner()) {
    return message.reply(toSmallCaps('The bot currently under maintenance.'));
  }

  const banInfo = db.bannedUsers[userId];
  if (banInfo) {
    if (banInfo.expires === 'permanent' || Date.now() < banInfo.expires) {
      return message.reply(toSmallCaps('❌ You are banned from using bot commands.'));
    }
    delete db.bannedUsers[userId];
    await saveUsers();
  }

  const restrictedChannels = db.channelRestrictions[guildId] || [];
  if (restrictedChannels.includes(message.channel.id) && !RESTRICTED_EXEMPT_COMMANDS.has(command)) {
    return;
  }

  const cooldownAmount = 6000;
  const nowTime = Date.now();
  if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
  const timestamps = cooldowns.get(userId);
  if (timestamps.has(command) && nowTime < timestamps.get(command) + cooldownAmount) {
    const timeLeft = ((timestamps.get(command) + cooldownAmount - nowTime) / 1000).toFixed(1);
    return message.reply(toSmallCaps(`⏳ Please wait ${timeLeft} more seconds before using ${currentPrefix}${command} again.`));
  }
  timestamps.set(command, nowTime);
  setTimeout(() => {
    timestamps.delete(command);
    if (timestamps.size === 0) cooldowns.delete(userId);
  }, cooldownAmount);

  ensureUser(userId);
  const user = db.users[userId];
  if (typeof user.cash !== 'number' || Number.isNaN(user.cash)) user.cash = 0;

  const callerHasBetaView = canSeeUnreleasedBeta(userId) || Boolean(db.config.featuresPublished);
  const rarityIconsMap = { ...getRarityIconMap(callerHasBetaView), ...REVAMPED_RARITY_ICONS };

  const getDisplayName = async (uId) => {
    if (db.users[uId]?.customNickname) return db.users[uId].customNickname;
    try {
      const fetched = await client.users.fetch(uId);
      if (fetched) return fetched.username;
    } catch {}
    return 'Unknown User';
  };

  const buildProfileAttachmentForUser = async (targetUId, targetMemberObj, syncedBadgesList) => {
    ensureUser(targetUId);
    const tData = db.users[targetUId];
    updateUserRank(tData);

    const allSortedUsers = Object.entries(db.users)
      .map(([uId, uData]) => ({ uId, points: uData.points || 0 }))
      .sort((a, b) => b.points - a.points);
    const globalIndex = allSortedUsers.findIndex(u => u.uId === targetUId);
    const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';
    const joinedDateStr = tData.joinedDate || 'N/A';
    const timePlayedStr = formatTimePlayed(tData.firstPlayedAt || joinedDateStr);
    const displayName = tData.customNickname || targetMemberObj?.username || 'Player';

    const rarityCounts = { SSRP: 0, UGMR: 0, USRR: 0, STR: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
    for (const c of tData.inventory?.chibis || []) {
      if (rarityCounts[c.rarity] !== undefined) rarityCounts[c.rarity]++;
    }

    const canUsePerk = hasSupporterOrNitro(tData, syncedBadgesList);
    const activeThemeKey = canUsePerk && tData.profileBgTheme && THEME_PALETTES[tData.profileBgTheme]
      ? tData.profileBgTheme
      : 'crystal';

    const cardBuffer = await renderProfileCard({
      targetUserData: {
        ...tData,
        profileBg: null,
        clanLogoId: tData.clan && db.clans[tData.clan] ? db.clans[tData.clan].logoId : null
      },
      targetMember: targetMemberObj,
      displayName,
      joinedDateStr,
      timePlayedStr,
      leaderboardPos,
      syncedBadges: syncedBadgesList,
      rarityCounts,
      rarityIconsMap,
      betaEmojis: BETA_EMOJIS,
      useBetaStyle: Boolean(callerHasBetaView),
      themeKey: activeThemeKey,
      customBgUrl: tData.customBg || null
    });

    return new AttachmentBuilder(cardBuffer, { name: 'profile-card.png' });
  };

  try {
    const currentMs = Date.now();
    let eventChanged = false;
    if (db.config.luckEventExpires && currentMs > db.config.luckEventExpires) {
      db.config.globalLuckMultiplier = 1.0;
      db.config.luckEventExpires = 0;
      eventChanged = true;
    }
    if (db.config.xpEventExpires && currentMs > db.config.xpEventExpires) {
      db.config.globalXpMultiplier = 1.0;
      db.config.xpEventExpires = 0;
      eventChanged = true;
    }
    if (eventChanged) await saveUsers();

    if (command === 'start') {
      if (user.started) return message.reply(toSmallCaps('⚠️ You have already started your Chibi RPG journey!'));

      const initProfile = async (starterDice) => {
        const nowInit = Date.now();
        user.started = true;
        user.joinedDate = new Date(nowInit).toLocaleDateString();
        if (!user.firstPlayedAt) user.firstPlayedAt = nowInit;
        user.dice = Number(user.dice || 0) + starterDice;
        if (!db.config.ownerId) db.config.ownerId = userId;
        if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
        updateUserRank(user);
        updatePeakRank(user);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();
      };

      if (isTester(userId)) {
        const startRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('beta_start_journey_btn').setEmoji('1572796405033214043')
            .setLabel(toSmallCaps('Start Journey')).setStyle(ButtonStyle.Success)
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
          await initProfile(50);
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
        return;
      }

      await initProfile(20);
      return message.reply(toSmallCaps('🎉 Welcome to Chibi RPG RNG! You have been awarded 20x Dice 🎲 and your profile is initialized.'));
    }

    if (!user.started && command !== 'help' && command !== 'status') {
      return message.reply(toSmallCaps(`❌ You must type ${currentPrefix}start before using any bot commands!`));
    }

    const isAdmin = () => isOwner() || user.permissions === true;

    if (isNpcAdminCmd && npcModule) {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ This command is for admins only!'));
      if (command === 'fnpcspawn') {
        const query = args.join(' ').trim();
        const template = query ? npcModule.findNpcTemplateByName(query) : null;
        if (query && !template) return message.reply(toSmallCaps(`❌ Could not find NPC "${query}".`));
        await npcModule.spawnNpcInChannel(message.channel, currentPrefix, template || null);
        return;
      }
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}${command} @user [quantity]\``));
      const qty = Math.max(1, parseInt(args[1], 10) || 1);
      ensureUser(targetUser.id);
      npcModule.ensureNpcUserFields(db.users[targetUser.id]);
      if (command === 'redeemgive') db.users[targetUser.id].redeems += qty;
      else db.users[targetUser.id].shinyRedeems += qty;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Gave **${qty}x** ${command === 'redeemgive' ? 'Redeem' : 'Shiny Redeem'} to **${targetUser.username}**!`));
    }

    if (isNpcCmd && typeof npcModule?.execute === 'function') {
      const handledByNpc = await npcModule.execute({
        command, args, message, client, userId, guildId, currentPrefix, user,
        currentMs, callerHasBetaView, rarityIconsMap, getDisplayName, saveUsers, trackPeakPoints
      });
      if (handledByNpc) return;
    }

    if (typeof economyModule?.execute === 'function') {
      const handledByEconomy = await economyModule.execute({
        command, args, message, client, userId, guildId, currentPrefix, user,
        currentMs, callerHasBetaView, rarityIconsMap, getDisplayName, saveUsers, trackPeakPoints
      });
      if (handledByEconomy) return;
    }

    if (command === 'addtester') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}addtester [@user]`));
      ensureUser(target.id);
      if (!Array.isArray(db.config.testers)) db.config.testers = [];
      if (!db.config.testers.includes(target.id)) {
        db.config.testers.push(target.id);
        db.config.pendingUpdatesCount = (db.config.pendingUpdatesCount || 0) + 1;
        await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`✅ Successfully added <@${target.id}> to the Beta Tester roster!`));
    }

    if (command === 'removetester') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removetester [@user]`));
      if (Array.isArray(db.config.testers)) {
        db.config.testers = db.config.testers.filter(id => id !== target.id);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`❌ Successfully removed <@${target.id}> from the Beta Tester roster.`));
    }

    if (command === 'testerpanel') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ You do not have access to the tester panel.'));
      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🧪 Exclusive Beta Tester Panel\n\n` +
          `Welcome to the testing grounds! Here are your active preview controls & sandbox tools:\n` +
          `• \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — View all features active on beta users\n` +
          `• \`${currentPrefix}testerfeature\` — Test unreleased experimental mechanics\n` +
          `• \`${currentPrefix}profile\` (\`${currentPrefix}p\`) — Revamped Beta Profile + Badges System\n` +
          `• \`${currentPrefix}cpromote\` (\`${currentPrefix}cp\`) / \`${currentPrefix}kick\` / \`${currentPrefix}cannounce\` / \`${currentPrefix}cmail\` / \`${currentPrefix}ceditdesc\` — Beta Clan Suite\n` +
          `• Status: **TESTER BUILD ACTIVE** 🔬`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'testerfeatures') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🧪 Active Beta Tester Features List\n\n` +
          `1. **Revamped Beta Profile (\`${currentPrefix}p\` / \`${currentPrefix}profile\`)**\n` +
          `2. **Revamped Leaderboards (\`${currentPrefix}ranks\` & \`${currentPrefix}ccranks\` / \`${currentPrefix}ccr\`)**\n` +
          `3. **Beta Clan Commands (\`${currentPrefix}cclaninfo\`, \`${currentPrefix}cpromote\`/\`${currentPrefix}cp\`, \`${currentPrefix}kick\`, \`${currentPrefix}cannounce\`, \`${currentPrefix}cmail\`, \`${currentPrefix}ceditdesc\`)**\n` +
          `4. **Interactive Start Button (\`${currentPrefix}start\`)**\n` +
          `5. **Badge System & Owner Grant (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)**`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'admingivebadges') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only the bot owner or admins can use this command!'));
      const target = message.mentions.users.first();
      const badgeKeyArg = args[1]?.toLowerCase() || null;

      if (!target || !badgeKeyArg) {
        const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 🏅 Available Badges Catalog (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)\n\n**Usage:** \`${currentPrefix}admingivebadges [@user] [badge_key]\`\n\n**Obtainable Badges:**\n`) +
            formatBadgeCatalogLines('Obtainable Badges') +
            toSmallCaps('\n\n**Utility Badges:**\n') +
            formatBadgeCatalogLines('Utility Badges') +
            toSmallCaps('\n\n**Event Badges:**\n') +
            formatBadgeCatalogLines('Event Badges')
          )
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const resolvedKey = resolveCatalogBadgeKey(badgeKeyArg);
      const badgeDef = resolvedKey ? BADGE_CATALOG[resolvedKey] : null;
      if (!badgeDef) {
        return message.reply(toSmallCaps(`❌ Unknown badge key \`${badgeKeyArg}\`! Type \`${currentPrefix}agb\` with no arguments to see all valid badge keys.`));
      }

      ensureUser(target.id);
      const targetData = db.users[target.id];
      if (!Array.isArray(targetData.badges)) targetData.badges = [];

      const exists = targetData.badges.includes(badgeDef.key);
      targetData.badges = exists
        ? targetData.badges.filter(k => k !== badgeDef.key)
        : [...targetData.badges, badgeDef.key];

      await evaluateAndSyncUserBadges(target.id, targetData, message.guild);
      await saveUsers();
      return message.reply(toSmallCaps(`✅ ${exists ? 'Removed' : 'Granted'} ${badgeDef.icon} **${badgeDef.name}** ${exists ? 'from' : 'to'} <@${target.id}>!`));
    }

    if (command === 'pubnewupd') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only the bot owner or admins can publish updates!'));
      const pendingCount = db.config.pendingUpdatesCount || 0;
      if (db.config.featuresPublished === true && pendingCount === 0) {
        return message.reply(toSmallCaps('ℹ️ There is no new code or updates to publish right now. Everything is already fully up-to-date and live for public production!'));
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pubnewupd_confirm_yes').setLabel(toSmallCaps('Yes')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pubnewupd_confirm_no').setLabel(toSmallCaps('No')).setStyle(ButtonStyle.Danger)
      );
      const confirmMsg = await message.reply({
        content: toSmallCaps('⚠️ **Publish Confirmation**\nAre you sure you want to publish new updates to public production?'),
        components: [confirmRow]
      });

      const pubCollector = confirmMsg.createMessageComponentCollector({ time: 20000, max: 1 });
      let decided = false;

      pubCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command sender can confirm publishing updates!'), ephemeral: true });
        }
        decided = true;
        if (i.customId === 'pubnewupd_confirm_no') {
          return confirmMsg.edit({ content: toSmallCaps('❌ Update publishing cancelled. Unreleased features remain exclusive to beta testers.'), components: [] }).catch(() => {});
        }
        db.config.featuresPublished = true;
        db.config.pendingUpdatesCount = 0;
        await saveUsers();
        const container = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(
            `# 🚀 New Updates Published Successfully!\n\n` +
            `All recent tester features and updates have been automatically pushed to public production.\n` +
            `• Status: **LIVE FOR ALL USERS** 🟢\n• Published by: <@${userId}>`
          ))
        );
        await confirmMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });

      pubCollector.on('end', async () => {
        if (!decided) await confirmMsg.edit({ content: toSmallCaps('⏳ Publish confirmation timed out.'), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'testerfeature') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ Restricted to testers.'));
      return message.reply(toSmallCaps('🧪 Experimental Sandbox Feature: Working as intended!'));
    }

    if (command === 'ownercommands' || command === 'oc') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the primary bot owner can access owner commands!'));
      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 👑 Owner Control Center\n\n` +
          `• \`${currentPrefix}ownerbotmaintenance\` — Toggle bot maintenance mode\n` +
          `• \`${currentPrefix}ownersetstatus [@user] [status]\` — Set custom user status\n` +
          `• \`${currentPrefix}addtester [@user]\` / \`${currentPrefix}removetester [@user]\` — Manage beta testers\n` +
          `• \`${currentPrefix}testerpanel\` & \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`)\n` +
          `• \`${currentPrefix}admingivebadges [@user] [key]\` (\`${currentPrefix}agb\`) — Manage user badges\n` +
          `• \`${currentPrefix}pubnewupd\` — Publish updates to public production\n` +
          `• \`${currentPrefix}ownerresetdata\` — Reset all user data\n` +
          `• \`${currentPrefix}ownersecretpanel\` — View secret system statistics\n` +
          `• \`${currentPrefix}owneradminpermsrem\` — Revoke admin permissions\n` +
          `• \`${currentPrefix}ownergivechibi [@user]\` — Gift exclusive SSRP event chibis\n` +
          `• \`${currentPrefix}adminsetclanrewards\` — Configure seasonal clan rewards\n` +
          `• \`${currentPrefix}fixadmin\` — Assign yourself as main owner & server`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'admincommands' || command === 'ac') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ You do not have administrator permissions to access this panel!'));
      const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🛡️ Administrator Operations Panel\n\n` +
          `• \`${currentPrefix}adminrestoreall\` — Restore and sync all user data profiles\n` +
          `• \`${currentPrefix}admingivebadges [@user] [key]\` (\`${currentPrefix}agb\`) — View/grant/remove badges\n` +
          `• \`${currentPrefix}admingivecrystal [@user] [qty]\` — Grant Event Crystals\n` +
          `• \`${currentPrefix}adminsetlbseason [num]\` — Set active leaderboard season\n` +
          `• \`${currentPrefix}adminresetrank\` — Reset all points and ranks\n` +
          `• \`${currentPrefix}adminban [@user] [duration]\` — Ban user from bot\n` +
          `• \`${currentPrefix}adminluckevent [mult] [time]\` — Set global luck event\n` +
          `• \`${currentPrefix}adminsetxp [mult] [time]\` — Set global XP event\n` +
          `• \`${currentPrefix}admingiveitem [@user] [item] [qty]\` — Grant items or dice\n` +
          `• \`${currentPrefix}adminsetnn [@user] [name]\` — Set custom user nickname\n` +
          `• \`${currentPrefix}adminclearlb\` — Clear leaderboard data\n` +
          `• \`${currentPrefix}fnpcspawn\` (\`${currentPrefix}fns\`) [name] — Force spawn NPC\n` +
          `• \`${currentPrefix}redeemgive [@user] [qty]\` / \`${currentPrefix}sredeemgive [@user] [qty]\`\n` +
          `• \`${currentPrefix}admingivepermission [@user]\` — Grant admin rights *(Owner only)*`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ownerbotmaintenance') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can toggle maintenance mode!'));
      db.config.maintenanceMode = !db.config.maintenanceMode;
      await saveUsers();
      return message.reply(toSmallCaps(`🛠️ Maintenance mode successfully updated: ${db.config.maintenanceMode ? 'ENABLED 🔴' : 'DISABLED 🟢'}`));
    }

    if (command === 'ownersetstatus') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can use ownersetstatus!'));
      const target = message.mentions.users.first();
      const statusText = args.slice(1).join(' ');
      if (!target || !statusText) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownersetstatus [@user] [status text]`));
      }
      ensureUser(target.id);
      db.users[target.id].customStatus = { text: statusText, timestamp: Date.now() };
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully set custom status for <@${target.id}> to **${statusText}**!`));
    }

    if (command === 'adminrestoreall') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only administrators can restore all user data!'));
      let restoredCount = 0;
      for (const [uId, uData] of Object.entries(db.users)) {
        ensureUser(uId);
        updateUserRank(uData);
        updatePeakRank(uData);
        await evaluateAndSyncUserBadges(uId, uData, message.guild);
        restoredCount++;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`🔄 Successfully restored and synchronized data profiles for all **${restoredCount}** registered users!`));
    }

    if (command === 'ownerresetdata') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can execute data resets!'));
      const resetNow = Date.now();
      for (const uId of Object.keys(db.users)) {
        db.users[uId] = {
          started: false, joinedDate: new Date(resetNow).toLocaleDateString(), firstPlayedAt: resetNow,
          dice: 10, cash: 0, points: 0, rank: '<:unranked:1571314276071907519>', clan: null,
          customNickname: null, highestSeasonRank: '<:unranked:1571314276071907519>',
          highestSeasonPoints: 0, inventory: { chibis: [], items: { spray: 0, clover: 0 } },
          team: [null, null, null], equippedChibi: null, equippedDice: null, bestRoll: 'None',
          bestRollTier: 0, bestRollVal: 0, bestChibi: null, userLevel: 1, userExp: 0,
          lastDrop: 0, todayDrops: 0, lastDaily: 0, streak: 0,
          permissions: uId === db.config.ownerId, customStatus: null, badges: [],
          clanMail: [], customBg: null, profileBg: null, profileBgTheme: 'crystal'
        };
      }
      db.clans = {};
      db.tradeHistories = {};
      db.config.eventCrystals = {};
      await saveUsers();
      return message.reply(toSmallCaps('⚠️ OWNER NOTICE: All user data, inventories, teams, and stats have been completely reset! All users must use `+start` again.'));
    }

    if (command === 'event') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ The Beta Event is currently inactive!'));
      const crystals = db.config.eventCrystals[userId] || 0;
      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 📦 BETA EVENT HUB & INFORMATION\n\n` +
          `${EVENT_ICONS.TIPS} **DESCRIPTION:**\nWelcome to the official Chibi RPG Beta Event! Battle wandering NPCs, clash with rival players in 3v3 battles, and exchange crystals for exclusive event chibis.\n\n` +
          `-----------------------------------\n` +
          `🎯 **HOW TO PARTICIPATE:**\n` +
          `• \`${currentPrefix}eadventure\` (\`${currentPrefix}ca\`) — Explore and battle wandering event NPCs\n` +
          `• \`${currentPrefix}battle [@user]\` — Clash against other players in 3v3 arena battles\n` +
          `• \`${currentPrefix}eshop\` (\`${currentPrefix}es\`) — Trade your crystals in the event shop\n\n` +
          `YOUR CRYSTALS: **${crystals}** ${EVENT_ICONS.CRYSTAL}`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ecrystal') {
      const crystals = db.config.eventCrystals[userId] || 0;
      return message.reply(toSmallCaps(`💎 You currently have **${crystals}** Event Crystals ${EVENT_ICONS.CRYSTAL}.`));
    }

    if (command === 'eadventure') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      const randomNpc = EVENT_NPCS[Math.floor(Math.random() * EVENT_NPCS.length)];
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_npc_fight').setLabel(toSmallCaps('Fight NPC ⚔️')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline_npc_fight').setLabel(toSmallCaps('Run Away 🏃')).setStyle(ButtonStyle.Secondary)
      );
      const advMsg = await message.reply({
        content: toSmallCaps(`${randomNpc.icon} **${randomNpc.name}**\n\n<@${userId}> You spotted an NPC and they want to fight you! Do you want to accept this challenge? (Expires in 10s)`),
        components: [row]
      });

      const collector = advMsg.createMessageComponentCollector({ time: 10000 });
      let handled = false;

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your adventure encounter!'), ephemeral: true });
        handled = true;
        collector.stop();

        if (i.customId === 'decline_npc_fight') {
          return advMsg.edit({ content: toSmallCaps(`🏃 You fled from ${randomNpc.name}. Safe travels!`), components: [] }).catch(() => {});
        }

        const npcAtk = Math.floor(Math.random() * 36) + 10;
        const npcHp = Math.floor(Math.random() * 1329) + 400;
        const npcDef = Math.floor(Math.random() * 66) + 40;
        const npcRandomChibi = EVENT_CHIBIS_POOL[Math.floor(Math.random() * EVENT_CHIBIS_POOL.length)];

        const userTeam = (user.team || [null, null, null]).map(id => id && user.inventory?.chibis?.find(c => (c.chibiId || c.id) === id));
        let userPower = 50;
        for (const c of userTeam) {
          if (c) {
            const statCfg = gameData.stats?.[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, atk: 20, def: 10, hpPer: 10, atkPer: 2, defPer: 1 };
            userPower += (statCfg.hp + c.level * statCfg.hpPer) + (statCfg.atk + c.level * statCfg.atkPer) * 3;
          }
        }

        const isUserWinner = userPower >= (npcHp + npcAtk * 3 + npcDef * 2) * (0.85 + Math.random() * 0.3);
        const rewardCrystal = isUserWinner ? 17 : 8;
        db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + rewardCrystal;

        let npcDropText = isUserWinner ? 'NO SHINY DROP (0.1% CHANCE)' : 'DEFEATED (NO DROP)';
        if (isUserWinner && Math.random() * 100 <= 0.1) {
          const dropped = EVENT_CHIBIS_POOL[Math.floor(Math.random() * EVENT_CHIBIS_POOL.length)];
          const generatedId = new mongoose.Types.ObjectId().toString();
          user.inventory.chibis.push({
            id: generatedId, chibiId: generatedId, name: dropped.name, rarity: 'SSRP',
            emoji: dropped.emoji, isShiny: true, level: 1, exp: 0, date: new Date().toLocaleDateString()
          });
          npcDropText = `RECEIVED SHINY ${SHINY_ICON} ${dropped.emoji} ${dropped.name}`;
        }

        const awardedExp = addExpAndLevelUp(user, userTeam.find(Boolean), 350);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();

        const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
        const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '⚔️';
        const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

        const resultContainer = new ContainerBuilder().setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(
            `# ⚔️ ADVENTURE BATTLE RESULT\n\n` +
            `OPPONENT: ${randomNpc.icon} ${randomNpc.name}\n` +
            `NPC CHIBI: ${npcRandomChibi.emoji} ${npcRandomChibi.name}\n` +
            `NPC STATS -> ${atkIcon} ATK: ${npcAtk} | ${hpIcon} HP: ${npcHp} | ${defIcon} DEF: ${npcDef}\n\n` +
            `${isUserWinner ? '🏆 VICTORY! YOU DEFEATED THE NPC!' : '💔 DEFEATED BY THE NPC!'}\n` +
            `💎 CRYSTALS EARNED: +${rewardCrystal} ${EVENT_ICONS.CRYSTAL}\n` +
            `🎁 NPC DROP: ${npcDropText}\n✨ EXP GAINED: +${awardedExp}`
          ))
        );
        await advMsg.edit({ content: '', components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });

      collector.on('end', async () => {
        if (!handled) await advMsg.edit({ content: toSmallCaps(`⏳ Encounter with ${randomNpc.name} timed out.`), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'eshop') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      const crystals = db.config.eventCrystals[userId] || 0;
      const shopItems = Object.values(db.config.eventShop || {}).sort((a, b) => a.cost - b.cost);
      if (!shopItems.length) return message.reply(toSmallCaps('❌ There are no items available in the Event Crystal Shop right now.'));

      const shopLines = shopItems.map((item, idx) =>
        toSmallCaps(`**[${idx + 1}]** ${item.emoji} **${item.name}** — **${item.cost.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`)
      ).join('\n');

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('eshop_buy_select')
          .setPlaceholder(toSmallCaps('Select an event chibi to purchase'))
          .addOptions(shopItems.slice(0, 25).map(item => ({ label: `${item.name} (${item.cost} Crystals)`.slice(0, 100), value: item.id })))
      );

      const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 💎 Beta Event Crystal Shop\n\nYour Crystal Balance: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n`) + shopLines
        )
      );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your eshop session!'), ephemeral: true });
        if (i.customId !== 'eshop_buy_select') return;

        const item = db.config.eventShop[i.values[0]];
        const userCrystals = db.config.eventCrystals[userId] || 0;
        if (!item) return i.followUp({ content: toSmallCaps('❌ Item not found!'), ephemeral: true });
        if (userCrystals < item.cost) {
          return i.followUp({ content: toSmallCaps(`❌ You need **${item.cost}** ${EVENT_ICONS.CRYSTAL}, but you only have **${userCrystals}** ${EVENT_ICONS.CRYSTAL}!`), ephemeral: true });
        }

        db.config.eventCrystals[userId] -= item.cost;
        const generatedId = new mongoose.Types.ObjectId().toString();
        user.inventory.chibis.push({
          id: generatedId, chibiId: generatedId, name: item.name, rarity: 'SSRP',
          emoji: item.emoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
        });
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();
        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased ${item.emoji} **${item.name}**!`), ephemeral: true });
      });
      collector.on('end', async () => {
        await shopMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'rarities') {
      const revampedLines = REVAMPED_RARITY_CONFIG.map(r =>
        `${r.emoji} **${r.label} (${r.key})**\n• Normal Chance: **${r.normalPct}%** | Shiny Chance: **${r.shinyPct}%**`
      ).join('\n\n');

      const eventSection =
        `${rarityIconsMap['SSRP'] || '🌟'} **Super Special Rare Plus (SSRP - Beta Event)**\n` +
        `• Cat Event: Normal 1 in 500B | Shiny 1 in 1Qa\n• Doge Event: Normal 1 in 1T | Shiny 1 in 20Qa\n` +
        `• Troll Event: Normal 1 in 30T | Shiny 1 in 50Qa\n• Frien Event: Normal 1 in 100T | Shiny 1 in 300Qa\n` +
        `• Seren Event: Normal 1 in 500T | Shiny 1 in 750Qa\n• Hellkitty Event: Normal 1 in 5Qa | Shiny 1 in 15Qi\n` +
        `• Mezz Event: Normal 1 in 75Qa | Shiny 1 in 500Qi\n• Ruru Event: Normal 1 in 250Qa | Shiny 1 in 10Sx\n` +
        `• Zoprb Event: Normal 1 in 1Qi | Shiny 1 in 100Sx\n• Kazerb Event: Normal 1 in 500Qi | Shiny 1 in 50Sp\n` +
        `• Georb Event: Normal 1 in 10Sp | Shiny 1 in 50No`;

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps('# 📊 Revamped Chibi Rarities & Drop Rates\n\n') + revampedLines +
          toSmallCaps('\n\n-----------------------------------\n\n') + eventSection
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'customnn') {
      const newNickname = args.join(' ').trim();
      if (!newNickname) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}customnn [nickname] (Max 12 characters)`));
      if (newNickname.length > 12) return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
      user.customNickname = newNickname;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated your custom nickname to ${newNickname}!`));
    }

    if (command === 'profilebg') {
      const syncedBadges = await evaluateAndSyncUserBadges(userId, user, message.guild);
      const canUseBgPerk = hasSupporterOrNitro(user, syncedBadges);
      const input = args.join(' ').trim();

      if (!input) {
        const currentTheme = user.profileBgTheme && THEME_PALETTES[user.profileBgTheme] ? user.profileBgTheme : 'crystal';
        const availableThemes = Object.keys(THEME_PALETTES).map(k => `\`${k}\``).join(', ');
        return message.reply(toSmallCaps(
          `🎨 **Profile Background Customizer (Supporter & Nitro Perk)**\n` +
          `Current Theme: **${currentTheme}** | Status: ${canUseBgPerk ? '✅ Unlocked' : '🔒 Locked'}\n` +
          `Themes: ${availableThemes}\nUsage: \`${currentPrefix}profilebg <theme>\` or \`${currentPrefix}profilebg clear\``
        ));
      }

      if (['clear', 'reset'].includes(input.toLowerCase())) {
        user.profileBg = null;
        user.profileBgTheme = 'crystal';
        await saveUsers();
        return message.reply(toSmallCaps('✅ Cleared your custom profile background and reset to default!'));
      }

      if (!canUseBgPerk) {
        return message.reply(toSmallCaps('❌ Customizing your profile background is only available for users with the **Supporter** or **Nitro** badge!'));
      }

      const chosenTheme = input.toLowerCase();
      if (!THEME_PALETTES[chosenTheme]) {
        const validThemes = Object.keys(THEME_PALETTES).map(k => `\`${k}\``).join(', ');
        return message.reply(toSmallCaps(`❌ Unknown theme! Choose from: ${validThemes} or use \`${currentPrefix}profilebg clear\`.`));
      }

      user.profileBg = null;
      user.profileBgTheme = chosenTheme;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated your profile background theme to **${chosenTheme}**!`));
    }

    if (command === 'setbg') {
      const syncedBadges = await evaluateAndSyncUserBadges(userId, user, message.guild);
      if (!hasSupporterOrNitro(user, syncedBadges)) {
        return message.reply(toSmallCaps('❌ Custom profile image backgrounds are exclusively for **Beta Supporter** and **Nitro** badge holders!'));
      }

      const subArg = (args[0] || '').trim().toLowerCase();
      if (['clear', 'reset', 'remove'].includes(subArg)) {
        user.customBg = null;
        await saveUsers();
        return message.reply(toSmallCaps('✅ Cleared your custom profile background image!'));
      }

      const downloadAttachmentAsDataUri = async (attachment) => {
        try {
          const res = await fetch(attachment.url, { headers: { 'User-Agent': 'Mozilla/5.0 DiscordBot' } });
          if (!res.ok) return attachment.url;
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length || buf.length > 2.5 * 1024 * 1024) return attachment.url;
          let mime = (res.headers.get('content-type') || attachment.contentType || '').split(';')[0].trim().toLowerCase();
          if (!mime.startsWith('image/')) {
            const extMatch = (attachment.name || attachment.url || '').match(/\.(png|jpe?g|webp|gif)(\?.*)?$/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
            mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          }
          return `data:${mime};base64,${buf.toString('base64')}`;
        } catch {
          return attachment.url;
        }
      };

      const resolveImageFromAttachmentOrUrl = async (attachment, rawUrl) => {
        if (attachment) {
          const isImage = attachment.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(attachment.name || attachment.url || '');
          if (!isImage) return { error: toSmallCaps('❌ Please upload a valid image file (`.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif`).') };
          return { url: await downloadAttachmentAsDataUri(attachment) };
        }

        let parsedUrl;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          return { error: toSmallCaps('❌ Please provide a valid image URL (`https://...`), attach an image, or click **Upload File**!') };
        }

        if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
          return { error: toSmallCaps('❌ Image URL must start with `http://` or `https://`.') };
        }

        let finalImageUrl = parsedUrl.toString();
        if (!/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(parsedUrl.pathname)) {
          try {
            const pageRes = await fetch(finalImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const contentType = pageRes.headers.get('content-type') || '';
            if (contentType.startsWith('image/')) {
              finalImageUrl = pageRes.url || finalImageUrl;
            } else {
              const html = await pageRes.text();
              const ogMatch =
                html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                html.match(/https:\/\/i\.ibb\.co\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)/i);
              const extractedUrl = ogMatch ? (ogMatch[1] || ogMatch[0]).trim() : null;
              if (!extractedUrl) {
                return { error: toSmallCaps('❌ Could not find a direct image at that link. Use a direct image URL or click **Upload File**!') };
              }
              finalImageUrl = extractedUrl;
            }
          } catch {
            return { error: toSmallCaps('❌ Could not load that link. Use a direct image URL or click **Upload File**!') };
          }
        }
        return { url: finalImageUrl };
      };

      const attachPreviewButtonToMessage = async (targetMsg) => {
        const previewRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setbg_preview_card_btn').setLabel(toSmallCaps('Preview Card')).setStyle(ButtonStyle.Success)
        );
        await targetMsg.edit({
          content: toSmallCaps(`✅ Custom profile background saved! Click **Preview Card** below or run \`${currentPrefix}p\`.`),
          components: [previewRow]
        }).catch(() => {});

        const previewCollector = targetMsg.createMessageComponentCollector({ time: 60000, max: 1 });
        let previewed = false;
        previewCollector.on('collect', async pi => {
          if (!pi.deferred && !pi.replied) await pi.deferUpdate().catch(() => {});
          if (pi.user.id !== userId) {
            return pi.followUp({ content: toSmallCaps('❌ Only the command sender can preview this card!'), ephemeral: true });
          }
          previewed = true;
          await targetMsg.edit({ components: [] }).catch(() => {});
          const cardAtt = await buildProfileAttachmentForUser(userId, message.author, syncedBadges);
          await message.channel.send({ files: [cardAtt] }).catch(() => {});
        });
        previewCollector.on('end', async () => {
          if (!previewed) await targetMsg.edit({ components: [] }).catch(() => {});
        });
      };

      const directAttachment = message.attachments?.first();
      if (directAttachment || subArg) {
        const resolved = await resolveImageFromAttachmentOrUrl(directAttachment, args[0]?.trim());
        if (resolved.error) return message.reply(resolved.error);
        user.customBg = resolved.url;
        await saveUsers();
        const savedMsg = await message.reply(toSmallCaps('✅ Saving custom profile background...'));
        await attachPreviewButtonToMessage(savedMsg);
        return;
      }

      const uploadRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setbg_upload_file_btn').setLabel(toSmallCaps('Upload File')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setbg_clear_btn').setLabel(toSmallCaps('Clear BG')).setStyle(ButtonStyle.Secondary)
      );
      const promptMsg = await message.reply({
        content: toSmallCaps(
          `🖼️ **Custom Profile Background (Supporter & Nitro Perk)**\n` +
          `Current BG: ${user.customBg ? 'Set ✅' : 'None'}\nClick **Upload File** below, attach an image with \`${currentPrefix}setbg\`, or pass an image URL.`
        ),
        components: [uploadRow]
      });

      const btnCollector = promptMsg.createMessageComponentCollector({ time: 30000, max: 1 });
      let clicked = false;

      btnCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command sender can use these buttons!'), ephemeral: true });
        }
        clicked = true;

        if (i.customId === 'setbg_clear_btn') {
          user.customBg = null;
          await saveUsers();
          return promptMsg.edit({ content: toSmallCaps('✅ Cleared your custom profile background image!'), components: [] }).catch(() => {});
        }

        await promptMsg.edit({
          content: toSmallCaps('📤 **Upload File Mode Active:** Please send or attach your background image in this channel within **30 seconds** (or type `cancel`).'),
          components: []
        }).catch(() => {});

        const msgCollector = message.channel.createMessageCollector({
          filter: m => m.author.id === userId && (m.attachments.size > 0 || m.content.trim().toLowerCase() === 'cancel'),
          time: 30000, max: 1
        });
        let received = false;

        msgCollector.on('collect', async m => {
          received = true;
          if (m.content.trim().toLowerCase() === 'cancel') {
            await m.delete().catch(() => {});
            return promptMsg.edit({ content: toSmallCaps('❌ Background upload cancelled.'), components: [] }).catch(() => {});
          }
          const resolved = await resolveImageFromAttachmentOrUrl(m.attachments.first(), null);
          await m.delete().catch(() => {});
          if (resolved.error) return promptMsg.edit({ content: resolved.error, components: [] }).catch(() => {});
          user.customBg = resolved.url;
          await saveUsers();
          await attachPreviewButtonToMessage(promptMsg);
        });

        msgCollector.on('end', async () => {
          if (!received) {
            await promptMsg.edit({ content: toSmallCaps(`⏳ Upload timed out. Run \`${currentPrefix}setbg\` again to try once more.`), components: [] }).catch(() => {});
          }
        });
      });

      btnCollector.on('end', async () => {
        if (!clicked) await promptMsg.edit({ components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'seasons') {
      const currentSeasonNum = db.config.seasonNumber || 1;
      const currentSeasonData = SEASON_LIST[currentSeasonNum] || { name: `Season ${currentSeasonNum}`, start: 'Active' };
      const seasonTimerStr = formatTimeRemaining(Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now()));
      const seasonLines = Object.entries(SEASON_LIST).map(([num, s]) =>
        toSmallCaps(`• ${s.name}${parseInt(num, 10) === currentSeasonNum ? ' 🟢 (Active)' : ''}\n  Begin In: ${s.start}`)
      ).join('\n\n');

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 📅 Chibi RPG Seasons\n\nCurrent Active: ${currentSeasonData.name}\nTime Until Reset: ${seasonTimerStr}\n\n-----------------------------------\n\n`) + seasonLines
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'higheststats') {
      updatePeakRank(user);
      const displayName = user.customNickname || message.author.username;
      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 🏆 ${displayName}'s Highest Stats (Last Season)\n\nHighest Rank Icon: `) +
          `${user.highestSeasonRank || '<:unranked:1571314276071907519>'}` +
          toSmallCaps(`\nHighest Points Reached: ${(user.highestSeasonPoints || 0).toLocaleString()} Points\n\n*Stats snapshotted from previous competitive season.*`)
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'help') {
      let selectedCategory = null;
      const helpMsg = await message.reply({
        components: [renderHelpContainer(currentPrefix, selectedCategory), renderHelpMenuRow(selectedCategory)],
        flags: MessageFlags.IsComponentsV2
      });

      const helpCollector = helpMsg.createMessageComponentCollector({ time: 120000 });
      helpCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command user can use this help menu!'), ephemeral: true });
        }
        if (i.customId === 'help_category_select') {
          const val = i.values?.[0];
          selectedCategory = val && val !== 'all' ? val : null;
          await helpMsg.edit({
            components: [renderHelpContainer(currentPrefix, selectedCategory), renderHelpMenuRow(selectedCategory)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
        }
      });

      helpCollector.on('end', async () => {
        await helpMsg.edit({
          components: [renderHelpContainer(currentPrefix, selectedCategory)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return;
    }

    if (command === 'status') {
      const uptimeSec = Math.floor(client.uptime / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🤖 Bot System Status & Info\n\n` +
          `📶 Latency / Ping: ${client.ws.ping}ms\n` +
          `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
          `🌐 Connected Servers: ${client.guilds.cache.size} Servers\n` +
          `💻 Runtime: Node.js (Discord.js v14 - Components V2)\n` +
          `⚙️ Status: 🟢 Online & Operational (MongoDB Connected)`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'slot') {
      const bet = parseInt(args[0], 10);
      if (isNaN(bet) || bet <= 0) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}slot [bet_amount] (e.g. ${currentPrefix}slot 5)`));
      if (user.dice < bet) return message.reply(toSmallCaps(`❌ You don't have enough dice! You have ${user.dice} 🎲, but your bet is ${bet} 🎲.`));

      user.dice -= bet;
      await saveUsers();

      const availableChibiEmojis = user.inventory?.chibis?.length
        ? Array.from(new Set(user.inventory.chibis.map(c => c.emoji || '📦')))
        : ['📦', '✨', '⭐', '🌟', '💎', '🔥', '💖'];
      const spinSymbol = () => availableChibiEmojis[Math.floor(Math.random() * availableChibiEmojis.length)];

      const slotMsg = await message.reply({ content: toSmallCaps(`🎰 Spinning Chibi Slot Machine for ${bet} 🎲...\n| 🔄 | 🔄 | 🔄 |`) });
      for (let step = 0; step < 3; step++) {
        await new Promise(r => setTimeout(r, 600));
        await slotMsg.edit({ content: toSmallCaps(`🎰 Spinning...\n| ${spinSymbol()} | ${spinSymbol()} | ${spinSymbol()} |`) }).catch(() => {});
      }

      await new Promise(r => setTimeout(r, 800));
      const [s1, s2, s3] = [spinSymbol(), spinSymbol(), spinSymbol()];
      let payoutMultiplier = 0;
      let pointsWon = 0;
      let resultText = toSmallCaps('❌ No matching chibis! Better luck next time!');

      if (s1 === s2 && s2 === s3) {
        payoutMultiplier = 10;
        pointsWon = 25;
        resultText = toSmallCaps(`🎉 CHIBI JACKPOT! TRIPLE MATCH (${s1})! (+10x Dice, +${pointsWon} Points!) 🎉`);
      } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        payoutMultiplier = 2;
        pointsWon = 10;
        resultText = toSmallCaps(`✨ Partial Chibi Match! (+2x Dice, +${pointsWon} Points!) ✨`);
      }

      const winnings = Math.round(bet * payoutMultiplier);
      user.dice = Number(user.dice || 0) + winnings;
      user.points = Number(user.points || 0) + pointsWon;
      trackPeakPoints(user);
      updateUserRank(user);
      await saveUsers();

      const container = new ContainerBuilder().setAccentColor(payoutMultiplier > 0 ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🎰 Chibi Slot Machine Results\n\n| ${s1} | ${s2} | ${s3} |\n\n` +
          `${resultText}\n💰 Dice Payout: +${winnings} 🎲 | 🏆 Points Gained: +${pointsWon} Pts\n` +
          `🎲 Total Dice: ${user.dice} | 🏆 Total Points: ${user.points}`
        ))
      );
      return slotMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (command === 'daily') {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const fortyEightHours = 48 * 60 * 60 * 1000;
      if (currentMs - (user.lastDaily || 0) < twentyFourHours) {
        const remainingTime = Math.ceil((twentyFourHours - (currentMs - user.lastDaily)) / 1000 / 60);
        return message.reply(toSmallCaps(`⏳ You have already claimed your daily reward! Please wait another ${remainingTime} minutes.`));
      }
      user.streak = (!user.lastDaily || currentMs - user.lastDaily > fortyEightHours) ? 1 : (user.streak || 0) + 1;
      user.lastDaily = currentMs;
      const multiplier = user.streak >= 100 ? 5 : user.streak >= 50 ? 3 : user.streak >= 10 ? 2 : 1;
      const rewardDice = multiplier;
      user.dice = Number(user.dice || 0) + rewardDice;
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`🎁 Daily Reward Claimed!\n🔥 Streak: ${user.streak} Days\n🎲 Reward: +${rewardDice}x Dice (x${multiplier} multiplier active! Total: ${user.dice} 🎲)`));
    }

    if (command === 'roll') {
      const qty = Math.min(Math.max(1, parseInt(args[0], 10) || 1), gameData.settings.maxRollQuantity);
      const boost = args[1]?.toLowerCase() || null;

      if (user.dice < qty) return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`));
      if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };

      if (boost === 'spray') {
        if ((user.inventory.items.spray || 0) <= 0) return message.reply(toSmallCaps(`❌ No Spray uses left! Buy more in ${currentPrefix}shop.`));
        user.inventory.items.spray--;
      } else if (boost === 'clover') {
        if ((user.inventory.items.clover || 0) <= 0) return message.reply(toSmallCaps(`❌ No Clover uses left! Buy more in ${currentPrefix}shop.`));
        user.inventory.items.clover--;
      }

      user.dice = Number(user.dice || 0) - qty;
      const resultsSummary = [];
      const activeLuckMultiplier = (db.config.globalLuckMultiplier || 1.0) * (boost === 'spray' ? 1.5 : 1.0);
      const shinyBoostMultiplier = boost === 'spray' ? 1.15 : 1.0;

      let totalExpGained = 0;
      const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (user.team?.[0] || user.equippedChibi));

      for (let i = 0; i < qty; i++) {
        const adjusted = REVAMPED_RARITY_CONFIG.map(r => ({
          ...r,
          effectiveNormalPct: r.key === 'C' ? r.normalPct : r.normalPct * activeLuckMultiplier,
          effectiveShinyPct: Math.min(100, r.shinyPct * shinyBoostMultiplier)
        }));

        const totalWeight = adjusted.reduce((sum, r) => sum + r.effectiveNormalPct, 0);
        let randW = Math.random() * totalWeight;
        let chosenRarityObj = adjusted[0];
        for (const r of adjusted) {
          if (randW < r.effectiveNormalPct) {
            chosenRarityObj = r;
            break;
          }
          randW -= r.effectiveNormalPct;
        }

        const matchingChibis = (gameData.chibis || []).filter(c => c.rarity === chosenRarityObj.key);
        const template = matchingChibis.length
          ? matchingChibis[Math.floor(Math.random() * matchingChibis.length)]
          : {
              name: `${chosenRarityObj.label} Chibi`,
              rarity: chosenRarityObj.key,
              emoji: chosenRarityObj.emoji,
              odds: `1 in ${Math.max(1, Math.round(100 / Math.max(0.0001, chosenRarityObj.normalPct)))}`
            };

        const normalVal = parseOddsNumber(template.odds);
        const isShiny = (Math.random() * 100) < chosenRarityObj.effectiveShinyPct;

        const pushChibi = () => {
          const generatedId = new mongoose.Types.ObjectId().toString();
          user.inventory.chibis.push({
            id: generatedId, chibiId: generatedId, name: template.name,
            rarity: chosenRarityObj.key, emoji: template.emoji || chosenRarityObj.emoji,
            isShiny, level: 1, exp: 0, date: new Date().toLocaleDateString()
          });
        };

        pushChibi();
        resultsSummary.push({ chibi: template, rarityKey: chosenRarityObj.key, isShiny, duplicated: false });

        if (boost === 'clover' && Math.random() < 0.5) {
          pushChibi();
          resultsSummary.push({ chibi: template, rarityKey: chosenRarityObj.key, isShiny, duplicated: true });
        }

        const baseExpRoll = isShiny ? Math.floor(Math.random() * 251) + 50 : Math.floor(Math.random() * 141) + 10;
        totalExpGained += addExpAndLevelUp(user, primaryChibi, baseExpRoll);

        const currentTier = REVAMPED_RARITY_TIER[chosenRarityObj.key] || RARITY_HIERARCHY[chosenRarityObj.key] || 1;
        const currentRollVal = isShiny ? normalVal * 10 : normalVal;
        if (currentTier > (user.bestRollTier || 0) || (currentTier === (user.bestRollTier || 0) && currentRollVal > (user.bestRollVal || 0))) {
          user.bestRollTier = currentTier;
          user.bestRollVal = currentRollVal;
          user.bestRoll = isShiny ? `${chosenRarityObj.shinyPct}% Shiny` : `${chosenRarityObj.normalPct}%`;
          user.bestChibi = `${rarityIconsMap[chosenRarityObj.key]} ${template.emoji || chosenRarityObj.emoji} ${template.name} ${isShiny ? SHINY_ICON : ''}`;
        }
      }

      updateUserRank(user);
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();

      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
      const luckNotice = activeLuckMultiplier > 1.0 ? toSmallCaps(`\n⚡ Active Luck Boost: ${activeLuckMultiplier}x`) : '';
      const container = new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# ${diceIcon} Chibi Roll Results\n\n`) +
          resultsSummary.map(r => `${rarityIconsMap[r.rarityKey] || '📦'} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${r.duplicated ? '(🍀 Duplicated!)' : ''}`).join('\n') +
          toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!`) + luckNotice +
          toSmallCaps(`\n${diceIcon} Remaining Dice: ${user.dice}`)
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'drop') {
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      if (currentMs - (user.lastDrop || 0) < cooldownMs) {
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

      user.dice = Number(user.dice || 0) + Number(chosenDrop.dice || 0);
      updateUserRank(user);
      await saveUsers();

      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
      return message.reply(toSmallCaps(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** ${diceIcon}! Total dice: ${user.dice}`));
    }

    if (command === 'inventory') {
      const sprays = user.inventory?.items?.spray || 0;
      const clovers = user.inventory?.items?.clover || 0;
      const displayName = user.customNickname || message.author.username;
      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🎒 ${displayName}'s Inventory\n\n` +
          `${diceIcon} Dice: ${user.dice || 0}\n🧴 Spray Boosts: ${sprays} Uses\n🍀 Clover Boosts: ${clovers} Uses\n\n` +
          `*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'collections') {
      if (!user.inventory?.chibis?.length) {
        return message.reply(toSmallCaps(`📖 Your collection is empty! Use ${currentPrefix}roll to summon chibis.`));
      }
      let sortBy = 'rarity';
      let currentPage = 0;
      const itemsPerPage = 10;

      const getGroupedEntries = () => {
        const grouped = {};
        for (const c of user.inventory.chibis) {
          const key = `${c.rarity}_${c.name}_${c.isShiny ? 'shiny' : 'normal'}`;
          const uniqueId = c.chibiId || c.id;
          if (!grouped[key]) {
            grouped[key] = {
              rarity: c.rarity, emoji: c.emoji || '✨', name: c.name, isShiny: c.isShiny,
              count: 0, firstId: uniqueId ? uniqueId.slice(-6) : 'unknown'
            };
          }
          grouped[key].count++;
        }
        const entries = Object.values(grouped);
        const rarityRank = { SSRP: 0, UGMR: 1, USRR: 2, STR: 3, UTR: 4, SRR: 5, SR: 6, R: 7, U: 8, C: 9 };
        if (sortBy === 'rarity') entries.sort((a, b) => (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99));
        else if (sortBy === 'alpha') entries.sort((a, b) => a.name.localeCompare(b.name));
        return entries;
      };

      const renderColContainer = (page) => {
        const entries = getGroupedEntries();
        const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
        const safePage = Math.min(page, totalPages - 1);
        const pageItems = entries.slice(safePage * itemsPerPage, (safePage + 1) * itemsPerPage);
        const formatted = pageItems.map((e, idx) => {
          const badgeIcon = e.rarity === 'SSRP' ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
          const shinyIconPart = e.isShiny ? ` ${SHINY_ICON}` : '';
          return `**${safePage * itemsPerPage + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}**${shinyIconPart}${badgeIcon}`;
        }).join('\n') || toSmallCaps('Collection page empty.');

        const displayName = user.customNickname || message.author.username;
        const colIcon = callerHasBetaView ? BETA_EMOJIS.COLLECTIONS : '📖';
        const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# ${colIcon} ${displayName}'s Chibi Collection (Page ${safePage + 1}/${totalPages})\n\nSort: ${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}\n\n`) +
            formatted +
            toSmallCaps(`\n\n*Unique Types: ${new Set(user.inventory.chibis.map(c => c.name)).size} | Total Owned: ${user.inventory.chibis.length}*`)
          )
        );
        return { container, totalPages, safePage };
      };

      const getColRows = (page, totalPages) => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sort_rarity').setLabel(toSmallCaps('Order by Rarity')).setStyle(sortBy === 'rarity' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('sort_alpha').setLabel(toSmallCaps('Order Alphabetical')).setStyle(sortBy === 'alpha' ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('col_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('col_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        )
      ];

      const initial = renderColContainer(currentPage);
      const colMsg = await message.reply({
        components: [initial.container, ...getColRows(initial.safePage, initial.totalPages)],
        flags: MessageFlags.IsComponentsV2
      });

      const colCollector = colMsg.createMessageComponentCollector({ time: 120000 });
      colCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your collection session!'), ephemeral: true });
        if (i.customId === 'sort_rarity') { sortBy = 'rarity'; currentPage = 0; }
        else if (i.customId === 'sort_alpha') { sortBy = 'alpha'; currentPage = 0; }
        else if (i.customId === 'col_prev' && currentPage > 0) currentPage--;
        else if (i.customId === 'col_next') currentPage++;

        const updated = renderColContainer(currentPage);
        currentPage = updated.safePage;
        await colMsg.edit({ components: [updated.container, ...getColRows(updated.safePage, updated.totalPages)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'shop') {
      const directItem = args[0]?.toLowerCase();
      const directQty = Math.max(1, parseInt(args[1], 10) || 1);

      if (directItem === 'buy' && args[1]) {
        const diceObj = (gameData.shopDice || []).find(d => d.id.toLowerCase() === args[1].toLowerCase() || d.name.toLowerCase().includes(args[1].toLowerCase()));
        if (!diceObj) return message.reply(toSmallCaps('❌ Dice not found in shop!'));
        if (diceObj.restriction === 'cash' && user.cash < diceObj.cost) {
          return message.reply(toSmallCaps(`❌ Need ${diceObj.costDisplay} Cash!`));
        }
        if (diceObj.restriction === 'cash') user.cash -= diceObj.cost;
        user.equippedDice = diceObj.id;
        await saveUsers();
        return message.reply(toSmallCaps(`✅ Equipped ${diceObj.emoji} **${diceObj.name}** (+${diceObj.luckPercent}% Luck)!`));
      }

      if (directItem === 'dice') {
        const totalCost = 10 * directQty;
        if ((user.points || 0) < totalCost) {
          return message.reply(toSmallCaps(`❌ You need **${totalCost} Points** to buy **${directQty}x Dice**, but you only have **${user.points || 0} Points**!`));
        }
        user.points = Number(user.points || 0) - totalCost;
        user.dice = Number(user.dice || 0) + directQty;
        updateUserRank(user);
        await saveUsers();
        return message.reply(toSmallCaps(`✅ Purchased **+${directQty}x Dice 🎲** for **${totalCost} Points**! Total Dice: **${user.dice} 🎲**`));
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_dice_10').setLabel(toSmallCaps('+10 Dice 🎲 (100 Pts)')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('buy_spray').setLabel(toSmallCaps('Buy Spray (5 🎲)')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('buy_clover').setLabel(toSmallCaps('Buy Clover (15 🎲)')).setStyle(ButtonStyle.Success)
      );
      const diceList = (gameData.shopDice || []).map(d => `${d.emoji} **${d.name}** (\`${d.id}\`) — ${d.costDisplay} | +${d.luckPercent}%`).join('\n');
      const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n` +
          `🎲 +10 Dice (100 Pts): Stacks directly onto your Dice balance (or use \`${currentPrefix}shop dice [qty]\`)\n` +
          `🧴 Spray (5 🎲): Use this for Awesome Chibi boost [30 Uses]\n` +
          `🍀 Clover (15 🎲): Use this to duplicate Chibis while rolling [50 Uses]\n\n**Shop Dice** (\`${currentPrefix}shop buy <id>\`):\n`) + diceList
        )
      );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });
        if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };

        if (i.customId === 'buy_dice_10') {
          if ((user.points || 0) < 100) return i.followUp({ content: toSmallCaps(`❌ Not enough points! You need 100 Points, you have ${user.points || 0}.`), ephemeral: true });
          user.points -= 100;
          user.dice = Number(user.dice || 0) + 10;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Purchased **+10x Dice 🎲**! Stacked Dice Balance: **${user.dice} 🎲**`), ephemeral: true });
        }
        if (i.customId === 'buy_spray') {
          if (user.dice < 5) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
          user.dice -= 5;
          user.inventory.items.spray = Number(user.inventory.items.spray || 0) + 30;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray} | Remaining Dice: ${user.dice} 🎲`), ephemeral: true });
        }
        if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
          user.dice -= 15;
          user.inventory.items.clover = Number(user.inventory.items.clover || 0) + 50;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover} | Remaining Dice: ${user.dice} 🎲`), ephemeral: true });
        }
      });
      return;
    }

    if (command === 'cstats') {
      if (!user.inventory?.chibis?.length) return message.reply(toSmallCaps('❌ You have no chibis in your inventory!'));
      const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
      const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
      const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

      const teamLines = (user.team || [null, null, null]).map((chibiId, index) => {
        if (!chibiId) return toSmallCaps(`**[${index + 1}]** *Empty Slot* (Use ${currentPrefix}equipteam [id] ${index + 1})`);
        const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
        if (!chibi) return toSmallCaps(`**[${index + 1}]** *Chibi missing from inventory*`);

        const statConfig = gameData.stats?.[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
        const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
        const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
        const defVal = statConfig.def + chibi.level * statConfig.defPer;
        const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
        const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
        const maxExp = baseExp + (chibi.level - 1) * perLvl;
        const shortId = (chibi.chibiId || chibi.id).slice(-6);
        const badgeIcon = chibi.rarity === 'SSRP' ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
        const shinyIconPart = chibi.isShiny ? ` ${SHINY_ICON}` : '';

        return (
          `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity] || '🌟'} ${chibi.emoji} **${chibi.name}**${shinyIconPart}${badgeIcon}\n` +
          `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
          `${hpIcon} HP: \`${hpVal}\` | ${defIcon} DEF: \`${defVal}\` | ${atkIcon} ATK: \`${atkVal}\`\n`
        );
      });

      const displayName = user.customNickname || message.author.username;
      const container = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 📜 ${displayName}'s Team Card\n\n`) + teamLines.join('\n') +
          toSmallCaps(`\n\n*Tip: Use ${currentPrefix}equipteam [id] [1-3] to assign chibis to your team slots!*`)
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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
      const allSortedUsers = Object.entries(db.users).map(([uId, uData]) => {
        updateUserRank(uData);
        return { uId, ...uData };
      }).sort((a, b) => b.points - a.points);

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

      const getRanksRow = (page) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
      );

      const renderRanksContainer = async (page) => {
        const start = page * itemsPerPage;
        const lines = await Promise.all(allSortedUsers.slice(start, start + itemsPerPage).map(async (u, idx) => {
          const username = await getDisplayName(u.uId);
          const clanObj = u.clan && db.clans[u.clan];
          const clanPart = clanObj ? (callerHasBetaView ? `\n   ${getClanLogoDisplay(clanObj.logoId)} ` + toSmallCaps(u.clan.replace(/\*/g, '')) : ` | ${getClanLogoDisplay(clanObj.logoId)} ${u.clan.replace(/\*/g, '')}`.trim()) : '';
          if (callerHasBetaView) {
            return toSmallCaps(`**${start + idx + 1}.** @${username} | `) + `${u.rank}` + toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${(u.points || 0).toLocaleString()}`) + clanPart;
          }
          return toSmallCaps(`**${start + idx + 1}.** **${username}** — Rank: `) + `${u.rank}` + toSmallCaps(` | Points: **${(u.points || 0).toLocaleString()}**`) + clanPart;
        }));
        const body = lines.join(callerHasBetaView ? '\n\n' : '\n') || toSmallCaps('No players on the leaderboard yet.');
        const header = callerHasBetaView
          ? `${BETA_EMOJIS.CRR_TROPHY} ` + toSmallCaps(`**Chibi Global Leaderboard [${seasonMeta.name}]**\n`) + `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${seasonTimerStr} (Page ${page + 1}/${totalPages})\n\n`)
          : toSmallCaps(`# 🏆 Chibi Global Leaderboard Season ${seasonNum}\nEnd Season: ${seasonTimerStr}\n\n(Page ${page + 1}/${totalPages})\n\n`);
        const footer = callerHasBetaView
          ? toSmallCaps('\n\n____________________\n\n') + `${BETA_EMOJIS.USERS} ` + toSmallCaps('Your rank: ') + `${userRankIcon}` + toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${userPointsDisplay.toLocaleString()} (#${userRankPos})`)
          : toSmallCaps('\n\n-----------------------------------\n👤 Your Rank: #') + `${userRankPos} | Rank: ` + `${userRankIcon}` + toSmallCaps(` | Points: ${userPointsDisplay.toLocaleString()}`);

        return new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(new TextDisplayBuilder().setContent(header + body + footer));
      };

      const ranksMsg = await message.reply({ components: [await renderRanksContainer(currentPage), getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 });
      const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
      ranksCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });
        if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;
        await ranksMsg.edit({ components: [await renderRanksContainer(currentPage), getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'ccranks') {
      const clanEntries = Object.entries(db.clans).map(([name, clan]) => ({
        name, clan, totalPoints: clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0)
      })).sort((a, b) => b.totalPoints - a.totalPoints);

      const maxClanSeasonMs = 30 * 24 * 60 * 60 * 1000;
      const clanTimerStr = formatTimeRemaining(Math.min(maxClanSeasonMs, Math.max(0, (db.config.clanSeasonExpires || (Date.now() + maxClanSeasonMs)) - Date.now())));

      const formatReward = (rNum) => {
        const rw = db.config.clanRewards[rNum];
        if (!rw) return '100x 🎲 Dice (Consolation)';
        const sampleChibi = gameData.chibis.find(c => c.rarity === rw.rarity) || gameData.chibis[0];
        return `${rw.qty} ${rarityIconsMap[rw.rarity] || '📦'} ${sampleChibi ? sampleChibi.emoji : rw.chibiEmoji}`;
      };

      const top10Lines = await Promise.all(clanEntries.slice(0, 10).map(async (c, idx) => {
        const leaderName = await getDisplayName(c.clan.leader);
        return toSmallCaps(`**${idx + 1}.** ${getClanLogoDisplay(c.clan.logoId)} ${c.name.replace(/\*/g, '')} | Leader: **${leaderName}** | Points: **${c.totalPoints.toLocaleString()}**`);
      }));

      let userClanLine = toSmallCaps('You are not currently in a clan.');
      if (user.clan && db.clans[user.clan]) {
        const uClanObj = db.clans[user.clan];
        const uClanRankIdx = clanEntries.findIndex(c => c.name === user.clan);
        const uClanPoints = uClanObj.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        const leaderName = await getDisplayName(uClanObj.leader);
        userClanLine = toSmallCaps(`${uClanRankIdx !== -1 ? `#${uClanRankIdx + 1}` : 'Unranked'}. ${getClanLogoDisplay(uClanObj.logoId)} ${user.clan.replace(/\*/g, '')} | Leader: **${leaderName}** | Members: ${uClanObj.members.length} | Points: **${uClanPoints.toLocaleString()}**`);
      }

      const content = callerHasBetaView
        ? `${BETA_EMOJIS.GLOBAL} ` + toSmallCaps('**Top 10 Global Clan Leaderboard**\n') + `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${clanTimerStr}\n\n`) +
          `${BETA_EMOJIS.RANKS_POS[1]}: ${formatReward(1)}\n${BETA_EMOJIS.RANKS_POS[2]}: ${formatReward(2)}\n${BETA_EMOJIS.RANKS_POS[3]}: ${formatReward(3)}\n\n` +
          toSmallCaps('-----------------------------------\n\n') + (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
          toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine
        : toSmallCaps(`# 🏛️ Top 10 Global Clan Leaderboard\nEnds: ${clanTimerStr}\n\n**Clan Rewards:**\n1st: ${formatReward(1)}\n2nd: ${formatReward(2)}\n3rd: ${formatReward(3)}\n\n-----------------------------------\n\n`) +
          (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
          toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine;

      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (command === 'equipteam') {
      const chibiIdArg = args[0];
      const slot = parseInt(args[1], 10);
      if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}equipteam [chibi_id or short id] [slot 1-3]\nExample: ${currentPrefix}equipteam a1b2c3 1`));
      }
      const chibi = user.inventory.chibis.find(c => {
        const uId = c.chibiId || c.id;
        return uId === chibiIdArg || uId.endsWith(chibiIdArg);
      });
      if (!chibi) return message.reply(toSmallCaps(`❌ Chibi ID not found in your inventory! Check ${currentPrefix}collections for correct IDs.`));

      const chibiUniqueId = chibi.chibiId || chibi.id;
      const existingSlot = user.team.indexOf(chibiUniqueId) + 1;
      if (existingSlot > 0 && existingSlot !== slot) {
        return message.reply(toSmallCaps(`❌ This Chibi is already equipped in Team Slot ${existingSlot}! You cannot equip the same Chibi in multiple slots.`));
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
        collector.stop();

        if (i.customId !== 'accept_battle') {
          return battleMsg.edit({ content: toSmallCaps(`❌ <@${opponent.id}> declined the 3v3 arena clash.`), components: [] }).catch(() => {});
        }

        const p1User = user;
        const p2User = db.users[opponent.id];
        const getTeamChibis = (u) => (u.team || [null, null, null]).map(id => id && (u.inventory?.chibis || []).find(c => (c.chibiId || c.id) === id) || null);
        const p1Team = getTeamChibis(p1User);
        const p2Team = getTeamChibis(p2User);

        const getTeamPower = (team) => {
          let power = 50;
          for (const c of team) {
            if (!c) continue;
            const statCfg = gameData.stats?.[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
            const hp = Math.max(1, (statCfg.hp || 100) + (Number(c.level) || 1) * (statCfg.hpPer || 10));
            const atk = Math.max(0, (statCfg.atk || 20) + (Number(c.level) || 1) * (statCfg.atkPer || 2));
            const def = Math.max(0, (statCfg.def || 10) + (Number(c.level) || 1) * (statCfg.defPer || 1));
            power += hp + atk * 3 + def * 2;
          }
          return power;
        };

        const isP1Winner = getTeamPower(p1Team) * (0.85 + Math.random() * 0.3) >= getTeamPower(p2Team) * (0.85 + Math.random() * 0.3);
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

        const winReward = getBattlePoints(winUser.points || 0);
        const losePenalty = getBattlePoints(loseUser.points || 0);
        winUser.points = (winUser.points || 0) + winReward.win;
        loseUser.points = Math.max(0, (loseUser.points || 0) - losePenalty.lose);
        trackPeakPoints(winUser);

        const winnerId = isP1Winner ? userId : opponent.id;
        const loserId = isP1Winner ? opponent.id : userId;
        db.config.eventCrystals[winnerId] = (db.config.eventCrystals[winnerId] || 0) + Math.floor(Math.random() * 7) + 10;
        db.config.eventCrystals[loserId] = (db.config.eventCrystals[loserId] || 0) + Math.floor(Math.random() * 7) + 2;

        const totalExpWon = addExpAndLevelUp(winUser, winTeam.find(Boolean), 400);
        updateUserRank(p1User);
        updateUserRank(p2User);
        await evaluateAndSyncUserBadges(userId, p1User, message.guild);
        await evaluateAndSyncUserBadges(opponent.id, p2User, message.guild);
        await saveUsers();

        const renderTeamLineWithStats = (team, isWinnerTeam) => team.map((c, idx) => {
          if (!c) return toSmallCaps(`**[${idx + 1}]** *Empty Slot*`);
          const statCfg = gameData.stats?.[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
          const lvl = Math.max(1, Number(c.level) || 1);
          const maxHp = Math.max(1, (statCfg.hp || 100) + lvl * (statCfg.hpPer || 10));
          const atk = Math.max(0, (statCfg.atk || 20) + lvl * (statCfg.atkPer || 2));
          const def = Math.max(0, (statCfg.def || 10) + lvl * (statCfg.defPer || 1));
          const maxDef = Math.max(def, 220);
          const currentHp = isWinnerTeam ? maxHp : 0;
          const rarityBadge = rarityIconsMap[c.rarity] || '📦';
          const shinyTag = c.isShiny ? ` ${SHINY_ICON}` : '';
          const eventTag = c.rarity === 'SSRP' && EVENT_ICONS?.EVENT_BADGE ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';

          return (
            `**[${idx + 1}]** ${rarityBadge} ${c.emoji || '✨'} **${c.name}**${shinyTag}${eventTag} (Lvl ${lvl})\n` +
            `${BATTLE_ICONS.hp} ${buildStatBar(currentHp, maxHp, 10)} ${currentHp}/${maxHp}\n` +
            `${BATTLE_ICONS.def} ${buildStatBar(def, maxDef, 10)} ${def}/${maxDef}\n` +
            `${BATTLE_ICONS.atk}  ${atk}`
          );
        }).join('\n\n');

        const p1Name = p1User.customNickname || message.author.username;
        const p2Name = p2User.customNickname || opponent.username;
        const container = new ContainerBuilder().setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# ⚔️ 3v3 Chibi Arena Clash Result\n\n🏆 Winner: <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n🛡️ ${p1Name}'s Team Lineup:\n\n`) +
            renderTeamLineWithStats(p1Team, isP1Winner) +
            toSmallCaps(`\n\n🛡️ ${p2Name}'s Team Lineup:\n\n`) +
            renderTeamLineWithStats(p2Team, !isP1Winner) +
            toSmallCaps(`\n\n📊 Match Rewards: ✨ Victor earned +${winReward.win} Points, +${totalExpWon} EXP & Crystals! 💔 Loser lost -${losePenalty.lose} Points.`)
          )
        );
        await battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });

      collector.on('end', async () => {
        if (!handled) await battleMsg.edit({ content: toSmallCaps('⏳ Arena clash request timed out (5s elapsed) and was automatically cancelled.'), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'meme') {
      try {
        const res = await fetch('https://meme-api.com/gimme');
        if (!res.ok) return message.reply(toSmallCaps('❌ Could not fetch a meme right now. Please try again later.'));
        const data = await res.json();
        const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# ${data?.title || 'Random Meme'}\n*(r/${data?.subreddit || 'memes'})*`))
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch {
        return message.reply(toSmallCaps('❌ Failed to load meme API. Please try again later.'));
      }
    }

    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`));
      let answered = false;
      const collector = message.channel.createMessageCollector({ filter: m => m.author.id === userId, time: 15000, max: 1 });

      collector.on('collect', async m => {
        answered = true;
        const userAnswer = m.content.toLowerCase().trim();
        if (selected.a.some(ans => userAnswer.includes(ans))) {
          const awardedPoints = Math.floor(Math.random() * 4) + 17;
          user.points = Number(user.points || 0) + awardedPoints;
          trackPeakPoints(user);
          const awardedExp = addExpAndLevelUp(user, null, 450);
          const triviaCrystals = Math.floor(Math.random() * 6) + 5;
          db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + triviaCrystals;
          updateUserRank(user);
          await evaluateAndSyncUserBadges(userId, user, message.guild);
          await saveUsers();
          await m.reply(toSmallCaps(`🎉 Correct! You earned +${awardedPoints} Points, +${awardedExp} EXP & +${triviaCrystals} Event Crystals ${EVENT_ICONS.CRYSTAL}!`));
        } else {
          await m.reply(toSmallCaps(`❌ Incorrect! The correct answer was **${selected.a[0]}**.`));
        }
      });

      collector.on('end', async () => {
        if (!answered) await message.channel.send(toSmallCaps(`⏳ Time's up! The answer was **${selected.a[0]}**.`)).catch(() => {});
      });
      return;
    }

    if (command === 'profile') {
      const targetUserMention = message.mentions.users.first();
      const targetUserId = targetUserMention ? targetUserMention.id : userId;
      ensureUser(targetUserId);
      const targetUserData = db.users[targetUserId];
      updateUserRank(targetUserData);

      if (targetUserData.inventory?.chibis?.length) {
        let highestChibi = null;
        let highestTier = 0;
        let highestVal = 0;
        const allChibisPool = [...(gameData.chibis || []), ...(gameData.eventChibis || [])];

        for (const c of targetUserData.inventory.chibis) {
          const tier = REVAMPED_RARITY_TIER[c.rarity] || RARITY_HIERARCHY[c.rarity] || 1;
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
          !targetUserData.bestRoll ||
          ['None', '1 in 1'].includes(targetUserData.bestRoll) ||
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

      const syncedBadges = await evaluateAndSyncUserBadges(targetUserId, targetUserData, message.guild);
      await saveUsers();
      const attachment = await buildProfileAttachmentForUser(targetUserId, targetUserMention || message.author, syncedBadges);
      return message.reply({ files: [attachment] });
    }

    if (command === 'clanlist') {
      const clanNames = Object.keys(db.clans);
      if (!clanNames.length) return message.reply(toSmallCaps('🏛️ There are currently no clans available.'));
      let sortBy = 'points';

      const renderClanContainer = async () => {
        const entries = await Promise.all(clanNames.map(async name => {
          const clan = db.clans[name];
          return {
            name,
            leaderName: await getDisplayName(clan.leader),
            totalPoints: clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0),
            memberCount: clan.members.length,
            logoId: clan.logoId || '1'
          };
        }));
        entries.sort((a, b) => sortBy === 'points' ? b.totalPoints - a.totalPoints : b.memberCount - a.memberCount);
        const clanListText = entries.map((c, idx) =>
          toSmallCaps(`${idx + 1}. ${getClanLogoDisplay(c.logoId)} ${c.name.replace(/\*/g, '')} | Leader: ${c.leaderName} | Points: 🏆 ${c.totalPoints.toLocaleString()} | Members: 👥 ${c.memberCount}`)
        ).join('\n');
        return new ContainerBuilder().setAccentColor(0x34495e).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# 🏛️ Available Clans\n\nSorted by: ${sortBy === 'points' ? 'Total Points' : 'Member Count'}\n\n`) + clanListText)
        );
      };

      const getClanRows = () => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sort_points').setLabel(toSmallCaps('Sort by Points 🏆')).setStyle(sortBy === 'points' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sort_members').setLabel(toSmallCaps('Sort by Members 👥')).setStyle(sortBy === 'members' ? ButtonStyle.Success : ButtonStyle.Secondary)
      )];

      const clanMsg = await message.reply({ components: [await renderClanContainer(), ...getClanRows()], flags: MessageFlags.IsComponentsV2 });
      const clanCollector = clanMsg.createMessageComponentCollector({ time: 120000 });
      clanCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your clan list session!'), ephemeral: true });
        if (i.customId === 'sort_points') sortBy = 'points';
        if (i.customId === 'sort_members') sortBy = 'members';
        await clanMsg.edit({ components: [await renderClanContainer(), ...getClanRows()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'ccreateclan') {
      const clanName = args[0]?.replace(/\*/g, '');
      const logoArg = args[1];
      if (!clanName || !logoArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ccreateclan [ClanName] [Logo ID 1-12]\n\nAvailable Clan Logos:\n` + getClanLogoListText()));
      }
      if (!CLAN_LOGOS[logoArg]) {
        return message.reply(toSmallCaps('❌ Invalid Logo ID! Please pick a number from 1 to 12.\n\nAvailable Clan Logos:\n' + getClanLogoListText()));
      }
      if (clanName.length > 12) return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      if (db.clans[clanName]) return message.reply(toSmallCaps('❌ A clan with this name already exists!'));
      if (user.dice < 100) {
        return message.reply(toSmallCaps(`❌ You do not have enough dice to create a clan! You need **100 🎲 Dice**, but you only have **${user.dice} 🎲**.`));
      }

      user.dice -= 100;
      db.clans[clanName] = {
        name: clanName, leader: userId, viceLeader: null, members: [userId],
        roles: { [userId]: 'Leader' }, description: '', logoId: logoArg, renameCount: 0
      };
      user.clan = clanName;
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully created and joined clan ${getClanLogoDisplay(logoArg)} **${clanName}**! (Cost: 100 🎲 Dice)`));
    }

    if (command === 'cclanjoin') {
      const clanName = args.join(' ').replace(/\*/g, '');
      if (!db.clans[clanName]) return message.reply(toSmallCaps('❌ Clan does not exist!'));
      if (db.clans[clanName].members.includes(userId)) return message.reply(toSmallCaps('⚠️ You are already in this clan!'));
      if (!db.clans[clanName].roles) db.clans[clanName].roles = {};
      db.clans[clanName].members.push(userId);
      db.clans[clanName].roles[userId] = 'Member';
      user.clan = clanName;
      pushClanMail(userId, {
        title: `Joined Clan ${clanName}`,
        body: `Welcome to **${clanName}**! Use \`${currentPrefix}cclaninfo\` to view members and \`${currentPrefix}cmail\` for clan notices.`,
        category: 'Status'
      });
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully joined clan ${clanName}!`));
    }

    if (command === 'clanleave') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      const clanName = user.clan;
      const clanObj = db.clans[clanName];
      if (clanObj.leader === userId && clanObj.members.length > 1) {
        return message.reply(toSmallCaps('❌ As the clan leader, you must transfer leadership or disband the clan before leaving!'));
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_leave').setLabel(toSmallCaps('Confirm Leave')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_leave').setLabel(toSmallCaps('Cancel')).setStyle(ButtonStyle.Secondary)
      );
      const leaveMsg = await message.reply({ content: toSmallCaps(`⚠️ Are you sure you want to leave your clan **${clanName}**?`), components: [confirmRow] });
      const leaveCollector = leaveMsg.createMessageComponentCollector({ time: 15000 });

      leaveCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your confirmation!'), ephemeral: true });
        leaveCollector.stop();

        if (i.customId === 'confirm_leave') {
          const targetClan = db.clans[clanName];
          if (targetClan) {
            targetClan.members = targetClan.members.filter(id => id !== userId);
            if (targetClan.roles) delete targetClan.roles[userId];
            if (!targetClan.members.length) delete db.clans[clanName];
          }
          user.clan = null;
          await saveUsers();
          return leaveMsg.edit({ content: toSmallCaps(`✅ Successfully left the clan **${clanName}**.`), components: [] }).catch(() => {});
        }
        return leaveMsg.edit({ content: toSmallCaps('❌ Clan leave request cancelled.'), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'clanrename') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      const clanObj = db.clans[user.clan];
      if (clanObj.leader !== userId) return message.reply(toSmallCaps('❌ Only the clan leader can rename or change the clan logo!'));
      const currentRenameCount = clanObj.renameCount || 0;
      if (currentRenameCount >= 3) return message.reply(toSmallCaps('❌ Your clan has already reached the maximum limit of 3 renames/logo updates!'));

      const newNameArg = args[0]?.replace(/\*/g, '');
      const newLogoArg = args[1];
      if (!newNameArg || !newLogoArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}clanrename [NewClanName] [Logo ID 1-12]\n*(Renames left: ${3 - currentRenameCount}/3)*\n\nAvailable Clan Logos:\n` + getClanLogoListText()));
      }
      if (!CLAN_LOGOS[newLogoArg]) {
        return message.reply(toSmallCaps('❌ Invalid Logo ID! Please pick a number from 1 to 12.\n\nAvailable Clan Logos:\n' + getClanLogoListText()));
      }
      if (newNameArg.length > 12) return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      if (db.clans[newNameArg] && newNameArg !== user.clan) return message.reply(toSmallCaps('❌ A clan with this name already exists!'));

      const oldName = user.clan;
      db.clans[newNameArg] = { ...clanObj, name: newNameArg, logoId: newLogoArg, renameCount: currentRenameCount + 1 };
      if (oldName !== newNameArg) delete db.clans[oldName];
      for (const mId of db.clans[newNameArg].members) {
        if (db.users[mId]) db.users[mId].clan = newNameArg;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated clan! Name: **${newNameArg}**, Logo: ${getClanLogoDisplay(newLogoArg)}\n*(Renames/Updates used: ${currentRenameCount + 1}/3)*`));
    }

    if (command === 'ceditdesc') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clanObj = db.clans[user.clan];
      if ((CLAN_ROLE_HIERARCHY[getClanMemberRole(clanObj, userId)] || 0) < CLAN_ROLE_HIERARCHY['Co-Leader']) {
        return message.reply(toSmallCaps('❌ Only the Clan Leader or Co-Leader can edit the clan description!'));
      }
      const newDesc = args.join(' ').trim();
      if (!newDesc) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ceditdesc [description text] (or \`clear\` to reset)`));
      if (newDesc.length > 160) return message.reply(toSmallCaps('❌ Clan description cannot exceed 160 characters!'));

      clanObj.description = newDesc.toLowerCase() === 'clear' ? '' : newDesc;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Updated clan description for **${clanObj.name}**:\n`) + `${BETA_EMOJIS.CLAN_DESC}: ` + toSmallCaps(clanObj.description || 'No Description of the clan'));
    }

    if (command === 'cpromote') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      const actorTier = CLAN_ROLE_HIERARCHY[actorRole] || 0;
      if (actorTier < CLAN_ROLE_HIERARCHY.Officer) return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can promote members!'));

      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}cpromote [@user] (or \`${currentPrefix}cp [@user]\`)`));
      if (!clanObj.members.includes(target.id)) return message.reply(toSmallCaps('❌ That user is not a member of your clan!'));
      if (target.id === clanObj.leader) return message.reply(toSmallCaps('❌ You cannot change the Clan Leader role!'));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('cpromote_select_role').setPlaceholder(toSmallCaps('Select which position to promote to')).addOptions([
          { label: 'Co-Leader', description: 'Can kick members below Co-Leader (Officer & Deputy)', value: 'Co-Leader' },
          { label: 'Officer', description: 'Can kick members below Officer (Deputy & Member)', value: 'Officer' },
          { label: 'Deputy', description: 'Official clan member rank', value: 'Deputy' }
        ])
      );
      const promptMsg = await message.reply({
        content: toSmallCaps(`🎖️ **Clan Promotion UI**\nTarget: <@${target.id}> (Current: **${getClanMemberRole(clanObj, target.id)}**)\nChoose which position you want to assign below:`),
        components: [row]
      });

      const collector = promptMsg.createMessageComponentCollector({ time: 25000, max: 1 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Only the command sender can select the position!'), ephemeral: true });
        const chosenRole = i.values[0];
        if (actorRole !== 'Leader' && (CLAN_ROLE_HIERARCHY[chosenRole] || 0) >= actorTier) {
          return i.followUp({ content: toSmallCaps('❌ You cannot assign a position equal to or higher than your own rank!'), ephemeral: true });
        }
        if (!clanObj.roles) clanObj.roles = {};
        clanObj.roles[target.id] = chosenRole;
        clanObj.viceLeader = chosenRole === 'Co-Leader' ? target.id : (clanObj.viceLeader === target.id ? null : clanObj.viceLeader);
        pushClanMail(target.id, {
          title: `Clan Promotion in ${clanObj.name}`,
          body: `You have been assigned the position **${chosenRole}** in **${clanObj.name}**!`,
          category: 'Status'
        });
        await saveUsers();
        await promptMsg.edit({ content: toSmallCaps(`✅ <@${target.id}> has been set to **${chosenRole}** in clan **${clanObj.name}**!`), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'kick') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      const actorTier = CLAN_ROLE_HIERARCHY[actorRole] || 0;
      if (actorTier < CLAN_ROLE_HIERARCHY.Officer) return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can kick clan members!'));

      const target = message.mentions.users.first();
      const reason = args.slice(1).join(' ') || 'No reason provided';
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}kick [@user] [reason]`));
      if (target.id === userId) return message.reply(toSmallCaps('❌ You cannot kick yourself!'));
      if (!clanObj.members.includes(target.id)) return message.reply(toSmallCaps('❌ That user is not in your clan!'));
      if (target.id === clanObj.leader) return message.reply(toSmallCaps('❌ You cannot kick the Clan Leader!'));

      const targetRole = getClanMemberRole(clanObj, target.id);
      if (actorRole !== 'Leader' && (CLAN_ROLE_HIERARCHY[targetRole] || 0) >= actorTier) {
        return message.reply(toSmallCaps(`❌ Your position (**${actorRole}**) cannot kick **${targetRole}**! You can only kick members below your rank.`));
      }

      const clanName = clanObj.name;
      clanObj.members = clanObj.members.filter(id => id !== target.id);
      if (clanObj.roles) delete clanObj.roles[target.id];
      if (clanObj.viceLeader === target.id) clanObj.viceLeader = null;
      if (db.users[target.id]) db.users[target.id].clan = null;

      pushClanMail(target.id, {
        title: `Removed from Clan ${clanName}`,
        body: `You were kicked from **${clanName}** by <@${userId}>.\n**Reason:** ${reason}`,
        category: 'Kick Notice'
      });
      await saveUsers();
      return message.reply(toSmallCaps(`👢 Kicked <@${target.id}> from **${clanName}**! Reason: **${reason}**`));
    }

    if (command === 'cannounce') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      if ((CLAN_ROLE_HIERARCHY[actorRole] || 0) < CLAN_ROLE_HIERARCHY.Officer) {
        return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can post clan announcements!'));
      }
      const announcementText = args.join(' ').trim();
      if (!announcementText) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}cannounce [message]`));

      for (const mId of clanObj.members) {
        pushClanMail(mId, {
          title: `Announcement from ${clanObj.name}`,
          body: `${announcementText}\n*(Sent by <@${userId}> • ${actorRole})*`,
          category: 'Announcement'
        });
      }
      await saveUsers();
      return message.reply(toSmallCaps(`📢 Clan announcement sent to **${clanObj.members.length}** member(s)! Members can read it via \`${currentPrefix}cmail\`.`));
    }

    if (command === 'cmail') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      const claimRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cmail_claim_rewards_btn').setEmoji('1572814245848940707')
          .setLabel(toSmallCaps('Claim')).setStyle(ButtonStyle.Success)
      );

      const renderMailContainer = () => {
        const currentMails = Array.isArray(user.clanMail) ? user.clanMail : [];
        if (!currentMails.length) {
          return new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(toSmallCaps('# 📬 Clan Mail Inbox\n\n*No clan mail yet. Announcements, season rewards, and clan status notices will appear here.*'))
          );
        }
        const mailText = currentMails.slice(0, 6).map((m, idx) => {
          const rewardTag = m.reward ? (m.claimed ? ' *(Claimed)*' : ' *(Claimable Reward)*') : '';
          return toSmallCaps(`**[${idx + 1}] [${m.category}] ${m.title}** *(${new Date(m.timestamp).toLocaleDateString()})*`) + rewardTag + '\n' + toSmallCaps(`${m.body}`);
        }).join('\n\n-----------------------------------\n\n');
        return new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# 📬 Clan Mail Inbox (${currentMails.length})\n\n`) + mailText)
        );
      };

      const mailMsg = await message.reply({ components: [renderMailContainer(), claimRow], flags: MessageFlags.IsComponentsV2 });
      const mailCollector = mailMsg.createMessageComponentCollector({ time: 60000 });

      mailCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Not your clan mail inbox!'), ephemeral: true });
        if (i.customId !== 'cmail_claim_rewards_btn') return;

        const claimableMails = (Array.isArray(user.clanMail) ? user.clanMail : []).filter(m => m?.reward && !m.claimed);
        if (!claimableMails.length) {
          return i.followUp({ content: 'There is no claimable rewards in the mail.', ephemeral: true });
        }

        if (!user.inventory) user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
        if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];

        const claimedSummaries = [];
        for (const mailEntry of claimableMails) {
          const rw = mailEntry.reward;
          if (rw.type === 'chibi') {
            const qty = Math.max(1, parseInt(rw.qty, 10) || 1);
            const rarity = rw.rarity || 'SR';
            const sampleChibi = gameData.chibis.find(c => c.name === rw.name && c.rarity === rarity)
              || gameData.chibis.find(c => c.rarity === rarity) || gameData.chibis[0];
            const chibiName = rw.name || sampleChibi.name;
            const chibiEmoji = rw.emoji || sampleChibi.emoji;

            for (let q = 0; q < qty; q++) {
              const generatedId = new mongoose.Types.ObjectId().toString();
              user.inventory.chibis.push({
                id: generatedId, chibiId: generatedId, name: chibiName, rarity,
                emoji: chibiEmoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
              });
            }
            claimedSummaries.push(`${qty}x ${rarityIconsMap[rarity] || ''} ${chibiEmoji} ${chibiName}`);
          } else if (rw.type === 'dice') {
            const diceAmt = Math.max(1, parseInt(rw.dice, 10) || 0);
            user.dice = Number(user.dice || 0) + diceAmt;
            claimedSummaries.push(`${diceAmt}x ${BETA_EMOJIS.DICE} Dice`);
          }
          mailEntry.claimed = true;
        }

        updateUserRank(user);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();
        await mailMsg.edit({ components: [renderMailContainer(), claimRow], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return i.followUp({ content: toSmallCaps(`✅ Claimed mail rewards: ${claimedSummaries.join(', ')}!`), ephemeral: true });
      });
      return;
    }

    if (command === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clan = db.clans[user.clan];
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      const cleanClanName = clan.name.replace(/\*/g, '');
      const leaderName = await getDisplayName(clan.leader);

      if (callerHasBetaView) {
        const clanTotals = Object.entries(db.clans).map(([cName, cData]) => ({
          cName, pts: cData.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0)
        })).sort((a, b) => b.pts - a.pts);
        const clanRankIdx = clanTotals.findIndex(c => c.cName === user.clan);
        const globalRankStatus = clanRankIdx !== -1 ? `#${clanRankIdx + 1}` : 'Unranked';
        const clanDescText = clan.description?.trim() || 'No Description of the clan';

        const memberLines = await Promise.all(clan.members.map(async (mId, idx) => {
          const mUser = db.users[mId];
          if (mUser) updateUserRank(mUser);
          return toSmallCaps(`**${idx + 1}.** @${await getDisplayName(mId)} | ${getClanMemberRole(clan, mId)} | ${BETA_EMOJIS.TROPHY_PTS}: ${(mUser?.points || 0).toLocaleString()}`);
        }));

        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            toSmallCaps(`**CLAN : ${cleanClanName}**\n\n`) +
            `${BETA_EMOJIS.C_LEADER}: ` + toSmallCaps(`${leaderName}\n`) +
            `${BETA_EMOJIS.TROPHY_PTS}: ` + toSmallCaps(`${totalPoints.toLocaleString()}\n`) +
            `${BETA_EMOJIS.GLOBAL}: ` + toSmallCaps(`${globalRankStatus}\n`) +
            `${BETA_EMOJIS.CLAN_DESC}: ` + toSmallCaps(`${clanDescText}\n\n`) +
            memberLines.join('\n')
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(getClanLogoImageUrl(clan.logoId)));
        return message.reply({ components: [new ContainerBuilder().setAccentColor(0x1abc9c).addSectionComponents(section)], flags: MessageFlags.IsComponentsV2 });
      }

      const memberLines = await Promise.all(clan.members.map(async (mId, idx) => {
        const mUser = db.users[mId];
        if (mUser) updateUserRank(mUser);
        return toSmallCaps(`${idx + 1}. ${await getDisplayName(mId)} [${getClanMemberRole(clan, mId)}] `) + `${mUser?.rank || '<:unranked:1571314276071907519>'}` + toSmallCaps(` | Points: ${mUser?.points || 0}`);
      }));

      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# CLAN: ${cleanClanName}   `) + `${getClanLogoDisplay(clan.logoId)}\n\n` +
          toSmallCaps(`LEADER: ${leaderName}\nTOTAL POINTS: ${totalPoints.toLocaleString()}\nRENAME USES LEFT: ${3 - (clan.renameCount || 0)}/3\n\nMEMBERS:\n`) +
          memberLines.join('\n')
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'tradehistory') {
      if (!db.tradeHistories[userId]?.length) return message.reply(toSmallCaps('📜 You have no recorded trade history yet.'));
      const historyLines = await Promise.all(db.tradeHistories[userId].slice(-10).reverse().map(async (entry, idx) =>
        toSmallCaps(`**${idx + 1}.** Partner: **${await getDisplayName(entry.partnerId)}**\n   Date: ${new Date(entry.timestamp).toLocaleString()}`)
      ));
      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps('# 📜 Your Recent Trade History\n\n') + historyLines.join('\n\n'))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'trade') {
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === userId) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}trade [@user]`));
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
        if (i.user.id !== target.id) return i.followUp({ content: toSmallCaps('This trade invitation is not for you!'), ephemeral: true });
        collector.stop();

        if (i.customId !== 'trade_accept') {
          return reqMsg.edit({ content: toSmallCaps(`❌ Trade invitation declined by <@${target.id}>.`), components: [] }).catch(() => {});
        }

        const p1Offer = { dice: 0, chibi: null };
        const p2Offer = { dice: 0, chibi: null };

        const getEmbed = () => {
          const getOfferText = (offer) => {
            const parts = [];
            if (offer.dice > 0) parts.push(`**${offer.dice} 🎲 Dice**`);
            if (offer.chibi) parts.push(`${rarityIconsMap[offer.chibi.rarity]} ${offer.chibi.emoji} **${offer.chibi.name}** (Lv.${offer.chibi.level})`);
            return parts.length ? parts.join(' + ') : '*Empty*';
          };
          return {
            color: 0xf1c40f,
            title: toSmallCaps('🤝 Active Trade Session'),
            description: toSmallCaps(`<@${userId}> Offers:\n${getOfferText(p1Offer)}\n\n------------------\n\n<@${target.id}> Offers:\n${getOfferText(p2Offer)}`)
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
        await reqMsg.edit({ content: '', embeds: [getEmbed()], components: tradeRows }).catch(() => {});

        const tradeCollector = reqMsg.createMessageComponentCollector({ time: 60000 });
        tradeCollector.on('collect', async ti => {
          if (!ti.deferred && !ti.replied) await ti.deferUpdate().catch(() => {});
          const isP1 = ti.user.id === userId;
          const isP2 = ti.user.id === target.id;
          if (!isP1 && !isP2) return ti.followUp({ content: toSmallCaps('Not your trade session!'), ephemeral: true });
          const currentOffer = isP1 ? p1Offer : p2Offer;

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
            if (isNaN(amt) || amt <= 0) return ti.followUp({ content: toSmallCaps('❌ Invalid dice amount!'), ephemeral: true });
            if (uObj.dice < amt) return ti.followUp({ content: toSmallCaps(`❌ You don't have enough dice! You have ${uObj.dice} 🎲.`), ephemeral: true });
            currentOffer.dice = amt;
            return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
          }

          if (ti.customId === 'trade_offer_chibi') {
            const uObj = db.users[ti.user.id];
            if (!uObj.inventory?.chibis?.length) {
              return ti.followUp({ content: toSmallCaps('❌ You have no chibis in your inventory to offer!'), ephemeral: true });
            }
            const menuRow = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId('trade_select_chibi').setPlaceholder(toSmallCaps('Select a Chibi to offer')).addOptions(
                uObj.inventory.chibis.slice(0, 25).map(c => ({ label: `${c.name} (${c.rarity}) Lv.${c.level}`.slice(0, 100), value: c.chibiId || c.id }))
              )
            );
            await ti.followUp({ content: toSmallCaps('Choose a chibi from your inventory below:'), components: [menuRow], ephemeral: true });
            const selection = await ti.channel.awaitMessageComponent({
              filter: int => int.user.id === ti.user.id && int.customId === 'trade_select_chibi', time: 25000
            }).catch(() => null);
            if (!selection) return;
            if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});
            const chosenChibi = uObj.inventory.chibis.find(c => (c.chibiId || c.id) === selection.values[0]);
            if (chosenChibi) {
              currentOffer.chibi = chosenChibi;
              return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
            }
            return;
          }

          if (ti.customId === 'trade_confirm') {
            const u1 = db.users[userId];
            const u2 = db.users[target.id];
            if ((!p1Offer.dice && !p1Offer.chibi) || (!p2Offer.dice && !p2Offer.chibi)) {
              return ti.followUp({ content: toSmallCaps('❌ Both players must offer at least something (dice or chibi) before confirming!'), ephemeral: true });
            }
            if (u1.dice < p1Offer.dice || u2.dice < p2Offer.dice) {
              return ti.followUp({ content: toSmallCaps('❌ One of the players no longer has enough dice for this trade!'), ephemeral: true });
            }

            const transferOffer = (fromU, toU, offer) => {
              if (offer.dice > 0) {
                fromU.dice -= offer.dice;
                toU.dice = Number(toU.dice || 0) + offer.dice;
              }
              if (offer.chibi) {
                const movedId = offer.chibi.chibiId || offer.chibi.id;
                const idx = fromU.inventory.chibis.findIndex(c => (c.chibiId || c.id) === movedId);
                if (idx !== -1) {
                  toU.inventory.chibis.push(fromU.inventory.chibis.splice(idx, 1)[0]);
                  fromU.team = (fromU.team || [null, null, null]).map(slotId => (slotId === movedId ? null : slotId));
                  if (fromU.equippedChibi === movedId) fromU.equippedChibi = fromU.team[0] || null;
                }
              }
            };

            transferOffer(u1, u2, p1Offer);
            transferOffer(u2, u1, p2Offer);

            const tradeTimestamp = Date.now();
            (db.tradeHistories[userId] ||= []).push({ partnerId: target.id, timestamp: tradeTimestamp });
            (db.tradeHistories[target.id] ||= []).push({ partnerId: userId, timestamp: tradeTimestamp });

            updateUserRank(u1);
            updateUserRank(u2);
            await evaluateAndSyncUserBadges(userId, u1, message.guild);
            await evaluateAndSyncUserBadges(target.id, u2, message.guild);
            await saveUsers();
            tradeCollector.stop();

            return reqMsg.edit({
              content: toSmallCaps(`✅ Trade successfully completed between <@${userId}> and <@${target.id}>!`),
              embeds: [getEmbed()], components: []
            }).catch(() => {});
          }
        });
      });
      return;
    }

    if (command === 'fixadmin') {
      db.config.ownerId = userId;
      if (message.guild) db.config.mainGuildId = message.guild.id;
      user.permissions = true;
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin override successful! You are now set as the Bot Owner & Admin, and this server (${message.guild ? message.guild.name : 'DM'}) is locked as the Main Server.`));
    }

    if (command === 'ownersecretpanel') {
      if (!isOwner()) return;
      const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🕵️‍♂️ Secret Owner Control Panel\n\n` +
          `• Total Registered Users: ${Object.keys(db.users).length}\n• Total Active Clans: ${Object.keys(db.clans).length}\n• Connected Guilds: ${client.guilds.cache.size}`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ownergivechibi') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can use this command!'));
      const target = message.mentions.users.first();
      const rarityArg = args[1]?.toUpperCase();
      if (!target || !rarityArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownergivechibi [@user] [rarity] (e.g. ${currentPrefix}ownergivechibi @user SSRP)`));
      }
      ensureUser(target.id);

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('owner_give_chibi_select').setPlaceholder(toSmallCaps('Select chibi to give')).addOptions(
          EVENT_CHIBIS_POOL.map(c => ({ label: `${c.name} (${c.rarity})`.slice(0, 100), value: c.id }))
        )
      );
      const promptMsg = await message.reply({ content: toSmallCaps(`🎁 Select which event chibi to gift to <@${target.id}>:`), components: [row] });

      const selection = await message.channel.awaitMessageComponent({
        filter: int => int.user.id === userId && int.customId === 'owner_give_chibi_select', time: 25000
      }).catch(() => null);
      if (!selection) return promptMsg.edit({ content: toSmallCaps('❌ Chibi giveaway timed out.'), components: [] }).catch(() => {});
      if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

      const template = EVENT_CHIBIS_POOL.find(c => c.id === selection.values[0]);
      if (!template) return promptMsg.edit({ content: toSmallCaps('❌ Selected chibi not found.'), components: [] }).catch(() => {});
      const generatedId = new mongoose.Types.ObjectId().toString();
      (db.users[target.id].inventory.chibis ||= []).push({
        id: generatedId, chibiId: generatedId, name: template.name, rarity: 'SSRP',
        emoji: template.emoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
      });
      await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
      await saveUsers();
      return promptMsg.edit({ content: toSmallCaps(`✅ Successfully gifted ${template.emoji} **${template.name}** (SSRP) to <@${target.id}>!`), components: [] }).catch(() => {});
    }

    if (command === 'adminsetclanrewards') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can configure clan rewards!'));
      const rankPos = parseInt(args[0], 10);
      const qty = parseInt(args[1], 10);
      const rarity = args[2]?.toUpperCase();
      const emoji = args[3];
      if (![1, 2, 3].includes(rankPos) || isNaN(qty) || !rarity || !emoji) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetclanrewards [1|2|3] [qty] [rarity] [Emoji]\nExample: ${currentPrefix}adminsetclanrewards 1 5 UTR 🌟`));
      }
      db.config.clanRewards[rankPos] = { qty, rarity, chibiEmoji: emoji };
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated Rank ${rankPos} clan reward to ${qty}x ${rarity} (${emoji})!`));
    }

    if (command === 'owneradminpermsrem') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can execute this command!'));
      let count = 0;
      for (const [uId, uData] of Object.entries(db.users)) {
        if (uData.permissions === true && uId !== db.config.ownerId) {
          uData.permissions = false;
          count++;
        }
      }
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Successfully removed admin permissions from all ${count} authorized users.`));
    }

    if (command === 'prefixchange') {
      if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You must have Administrator permissions to change the bot prefix for this server.'));
      }
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 5 || /^[a-zA-Z]$/.test(newPrefix)) {
        return message.reply(toSmallCaps(`❌ Please provide a valid symbol prefix (max 5 chars, single letters like 's' or 'a' are not allowed). Usage: ${currentPrefix}prefixchange [new_prefix]`));
      }
      db.guildPrefixes[guildId] = newPrefix;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated server prefix to \`${newPrefix}\`! Use ${newPrefix}help for commands.`));
    }

    if (command === 'enablec' || command === 'disablec') {
      if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You must have Administrator permissions to manage channel restrictions.'));
      }
      const list = (db.channelRestrictions[guildId] ||= []);
      const idx = list.indexOf(message.channel.id);
      if (command === 'enablec') {
        if (idx !== -1) {
          list.splice(idx, 1);
          await saveUsers();
        }
        return message.reply(toSmallCaps(`✅ Chibi bot commands are now enabled in <#${message.channel.id}>.`));
      }
      if (idx === -1) {
        list.push(message.channel.id);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`❌ Chibi bot commands are now disabled in <#${message.channel.id}>.`));
    }

    if (command === 'removeadminperms') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can remove admin permissions!'));
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removeadminperms [@user]`));
      ensureUser(target.id);
      db.users[target.id].permissions = false;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin permissions successfully removed from <@${target.id}>.`));
    }

    if (command.startsWith('admin')) {
      const inMainServer = Boolean(message.guild) &&
        (userId === (db.config.ownerId || userId) || user.permissions === true) &&
        message.guild.id === (db.config.mainGuildId || message.guild.id);
      if (!db.config.ownerId) db.config.ownerId = userId;
      if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;

      if (!inMainServer) {
        return message.reply('You cannot use this Admin power in your own server, you must in the main server to run this.');
      }

      if (command === 'admingivecrystal') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1], 10);
        if (!target || isNaN(amount)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivecrystal [@user] [amount]`));
        ensureUser(target.id);
        db.config.eventCrystals[target.id] = (db.config.eventCrystals[target.id] || 0) + amount;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully granted ${amount.toLocaleString()} Event Crystals ${EVENT_ICONS.CRYSTAL} to <@${target.id}>.`));
      }

      if (command === 'adminsetlbseason') {
        const seasonNum = parseInt(args[0], 10);
        if (isNaN(seasonNum) || seasonNum < 1) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlbseason [season_number]`));
        db.config.seasonNumber = seasonNum;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Leaderboard season successfully set to Season ${seasonNum}!`));
      }

      if (command === 'adminresetrank') {
        for (const u of Object.values(db.users)) {
          u.points = 0;
          updateUserRank(u);
        }
        await saveUsers();
        return message.reply(toSmallCaps('🛡️ Successfully reset all user ranks and points! Leaderboard season remains active.'));
      }

      if (command === 'adminsetnn') {
        const target = message.mentions.users.first();
        const newNN = args.slice(1).join(' ').trim();
        if (!target || !newNN) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetnn [@user] [nickname]`));
        if (!db.users[target.id]?.started) return message.reply(toSmallCaps('❌ User does not have Chibi RNG data or has not started yet!'));
        if (newNN.length > 12) return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
        db.users[target.id].customNickname = newNN;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin successfully set custom nickname for <@${target.id}> to ${newNN}!`));
      }

      if (command === 'adminban') {
        const target = message.mentions.users.first();
        const durationArg = args[1]?.toLowerCase();
        if (!target || !durationArg) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminban [@user] [duration or permanent] (e.g. 1d, 2h, permanent)`));
        let banExpires = 'permanent';
        if (durationArg !== 'permanent') {
          const ms = parseDurationToMs(durationArg);
          if (!ms) return message.reply(toSmallCaps('❌ Invalid duration format! Use e.g. `1d`, `12h`, `30m`, or `permanent`.'));
          banExpires = Date.now() + ms;
        }
        db.bannedUsers[target.id] = { expires: banExpires, bannedAt: Date.now() };
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully banned <@${target.id}> from bot commands (${durationArg}).`));
      }

      if (command === 'adminclearlb') {
        for (const u of Object.values(db.users)) {
          u.points = 0;
          u.highestSeasonPoints = 0;
          updatePeakRank(u);
          u.customNickname = null;
          updateUserRank(u);
        }
        await saveUsers();
        return message.reply(toSmallCaps('⚠️ Admin Warning: All names, ranks, and points in the leaderboard have been completely cleared!'));
      }

      if (command === 'adminluckevent') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);
        if (isNaN(mult) || !durationMs) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminluckevent [multiplier] [duration] (e.g. ${currentPrefix}adminluckevent 2.0 30m)`));
        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        await saveUsers();
        return message.reply(toSmallCaps(`🍀 Admin Event Activated! Global Luck Multiplier is now **${mult}x** for **${durationStr}**!`));
      }

      if (command === 'adminsetxp') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);
        if (isNaN(mult) || !durationMs) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetxp [multiplier] [duration] (e.g. ${currentPrefix}adminsetxp 2.0 1h)`));
        db.config.globalXpMultiplier = mult;
        db.config.xpEventExpires = Date.now() + durationMs;
        await saveUsers();
        return message.reply(toSmallCaps(`📈 Admin Event Activated! Global EXP Multiplier is now **${mult}x** for **${durationStr}**!`));
      }

      if (command === 'admingiveitem') {
        const target = message.mentions.users.first();
        const item = args[1]?.toLowerCase();
        const amount = parseInt(args[2], 10);
        if (!target || !item || isNaN(amount)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingiveitem [@user] [item_name] [amount] (e.g. dice, spray, clover)`));
        ensureUser(target.id);
        const tUser = db.users[target.id];
        if (!tUser.inventory.items) tUser.inventory.items = { spray: 0, clover: 0 };

        if (item === 'dice') tUser.dice = Number(tUser.dice || 0) + amount;
        else if (item === 'spray' || item === 'clover') tUser.inventory.items[item] = Number(tUser.inventory.items[item] || 0) + amount;
        else return message.reply(toSmallCaps('❌ Unknown item! Available items: `dice`, `spray`, `clover`.'));

        updateUserRank(tUser);
        await evaluateAndSyncUserBadges(target.id, tUser, message.guild);
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin granted **${amount}x ${item}** to <@${target.id}>!`));
      }

      if (command === 'admingivepermission') {
        if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can grant admin permissions to other users!'));
        const target = message.mentions.users.first();
        if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivepermission [@user]`));
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully granted bot Admin permissions to <@${target.id}>!`));
      }
    }
  } catch (err) {
    console.error('Command Execution Error:', err);
    return message.reply(toSmallCaps('❌ An unexpected error occurred while processing your command.'));
  }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable is not set! Please configure it before starting the bot.');
  process.exit(1);
}

initDatabase().then(() => {
  client.login(TOKEN);
}).catch(err => {
  console.error('❌ Failed to start bot due to database initialization error:', err);
  process.exit(1);
});