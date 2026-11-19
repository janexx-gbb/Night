
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  PermissionsBitField
} = require('discord.js');
const mongoose = require('mongoose');
const {
  BADGE_CATALOG,
  BETA_EMOJIS,
  EVENT_ICONS,
  EVENT_CHIBIS_POOL
} = require('../core/constants');
const { db, saveUsers } = require('../core/database');
const {
  isTester,
  toSmallCaps,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  ensureUser,
  parseDurationToMs
} = require('../core/helpers');

const ADMIN_CMDS = [
  'addtester', 'removetester', 'testerpanel', 'testerfeatures', 'admingivebadges',
  'pubnewupd', 'testerfeature', 'ownercommands', 'oc', 'admincommands', 'ac',
  'ownerbotmaintenance', 'ownersetstatus', 'adminrestoreall', 'ownerresetdata',
  'fixadmin', 'ownersecretpanel', 'ownergivechibi', 'adminsetclanrewards',
  'owneradminpermsrem', 'prefixchange', 'enablec', 'disablec', 'removeadminperms',
  'admingivecrystal', 'adminsetlbseason', 'adminresetrank', 'adminsetnn',
  'adminban', 'adminclearlb', 'adminluckevent', 'adminsetxp', 'admingiveitem',
  'adminsetrank', 'adminsetpoints', 'admingivepermission', 'adminsetlevel'
];

async function execute(ctx) {
  const {
    command, args, message, client, userId, guildId, currentPrefix, user,
    isOwner, isAdmin
  } = ctx;

  if (!ADMIN_CMDS.includes(command)) return false;

  if (command === 'addtester') {
    if (!isOwner() && !user.permissions) {
      return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}addtester [@user]`));

    ensureUser(target.id);
    if (!db.config.testers) db.config.testers = [];
    if (!db.config.testers.includes(target.id)) {
      db.config.testers.push(target.id);
      db.config.pendingUpdatesCount = (db.config.pendingUpdatesCount || 0) + 1;
      await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
      await saveUsers();
    }
    return message.reply(toSmallCaps(`✅ Successfully added <@${target.id}> to the Beta Tester roster!`));
  }

  if (command === 'removetester') {
    if (!isOwner() && !user.permissions) {
      return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removetester [@user]`));

    if (db.config.testers) {
      db.config.testers = db.config.testers.filter(id => id !== target.id);
      await saveUsers();
    }
    return message.reply(toSmallCaps(`❌ Successfully removed <@${target.id}> from the Beta Tester roster.`));
  }

  if (command === 'testerpanel') {
    if (!isTester(userId)) {
      return message.reply(toSmallCaps('❌ You do not have access to the tester panel.'));
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x1abc9c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🧪 Exclusive Beta Tester Panel\n\n` +
            `Welcome to the testing grounds! Here are your active preview controls & sandbox tools:\n` +
            `• \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — View all features active on beta users\n` +
            `• \`${currentPrefix}testerfeature\` — Test unreleased experimental mechanics\n` +
            `• \`${currentPrefix}profile\` (\`${currentPrefix}p\`) — Revamped Beta Profile + Badges System\n` +
            `• \`${currentPrefix}cpromote\` (\`${currentPrefix}cp\`) / \`${currentPrefix}kick\` / \`${currentPrefix}cannounce\` / \`${currentPrefix}cmail\` / \`${currentPrefix}ceditdesc\` — Beta Clan Suite\n` +
            `• Status: **TESTER BUILD ACTIVE** 🔬\n\n` +
            `*Thank you for helping test and refine Chibi RPG features before public release!*`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'testerfeatures') {
    if (!isTester(userId)) {
      return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x1abc9c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 🧪 Active Beta Tester Features List\n\n` +
            `1. **Revamped Beta Profile (\`${currentPrefix}p\` / \`${currentPrefix}profile\`)**\n` +
            `   • Clean User Status (Dice, Cash = 0, Streak, Level), Rank Stats, Badges & Collections Rarities\n` +
            `2. **Revamped Leaderboards (\`${currentPrefix}ranks\` & \`${currentPrefix}ccranks\` / \`${currentPrefix}ccr\`)**\n` +
            `   • Clean Global & Clan leaderboards with season end timers & automatic clan rewards\n` +
            `3. **Beta Clan Commands (\`${currentPrefix}cclaninfo\`, \`${currentPrefix}cpromote\`/\`${currentPrefix}cp\`, \`${currentPrefix}kick\`, \`${currentPrefix}cannounce\`, \`${currentPrefix}cmail\`, \`${currentPrefix}ceditdesc\`)**\n` +
            `   • Role hierarchy (Co-Leader, Officer, Deputy), member kicks, clan announcements, description & mail inbox\n` +
            `4. **Interactive Start Button (\`${currentPrefix}start\`)**\n` +
            `   • Pressable ${BETA_EMOJIS.START_BTN} Start button awarding **x50 Dice**\n` +
            `5. **Badge System & Owner Grant (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)**\n` +
            `   • Discord & Event/Stats badges with automatic requirement unlocks`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'admingivebadges') {
    if (!isOwner() && !user.permissions) {
      return message.reply(toSmallCaps('❌ Only the bot owner or admins can use this command!'));
    }

    const target = message.mentions.users.first();
    const badgeKeyArg = args[1] ? args[1].toLowerCase() : null;

    if (!target || !badgeKeyArg) {
      const discordLines = Object.values(BADGE_CATALOG)
        .filter(b => b.category === 'Discord Category')
        .map(b => `${b.icon} **\`${b.key}\`** — ${b.description}`)
        .join('\n');

      const eventLines = Object.values(BADGE_CATALOG)
        .filter(b => b.category === 'Event & Stats Category')
        .map(b => `${b.icon} **\`${b.key}\`** — ${b.description}`)
        .join('\n');

      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🏅 Available Badges Catalog (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)\n\n` +
              `**Usage:** \`${currentPrefix}admingivebadges [@user] [badge_key]\`\n\n` +
              `**Discord Category:**\n`
            ) + discordLines +
            toSmallCaps(`\n\n**Event & Stats Category:**\n`) + eventLines
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const badgeDef = BADGE_CATALOG[badgeKeyArg];
    if (!badgeDef) {
      return message.reply(toSmallCaps(`❌ Unknown badge key \`${badgeKeyArg}\`! Type \`${currentPrefix}agb\` with no arguments to see all valid badge keys.`));
    }

    ensureUser(target.id);
    const targetData = db.users[target.id];
    if (!Array.isArray(targetData.badges)) targetData.badges = [];

    let actionText = '';
    if (targetData.badges.includes(badgeDef.key)) {
      targetData.badges = targetData.badges.filter(k => k !== badgeDef.key);
      actionText = `Removed ${badgeDef.icon} **${badgeDef.name}** from <@${target.id}>.`;
    } else {
      targetData.badges.push(badgeDef.key);
      actionText = `Granted ${badgeDef.icon} **${badgeDef.name}** to <@${target.id}>!`;
    }

    await saveUsers();
    return message.reply(toSmallCaps(`✅ ${actionText}`));
  }

  if (command === 'pubnewupd') {
    if (!isOwner() && !user.permissions) {
      return message.reply(toSmallCaps('❌ Only the bot owner or admins can publish updates!'));
    }

    const pendingCount = db.config.pendingUpdatesCount || 0;
    if (db.config.featuresPublished === true && pendingCount === 0) {
      return message.reply(toSmallCaps('ℹ️ There is no new code or updates to publish right now. Everything is already fully up-to-date and live for public production!'));
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pubnewupd_confirm_yes')
        .setLabel(toSmallCaps('Yes'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('pubnewupd_confirm_no')
        .setLabel(toSmallCaps('No'))
        .setStyle(ButtonStyle.Danger)
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
        await confirmMsg.edit({
          content: toSmallCaps('❌ Update publishing cancelled. Unreleased features remain exclusive to beta testers.'),
          components: []
        }).catch(() => {});
        return;
      }

      if (i.customId === 'pubnewupd_confirm_yes') {
        db.config.featuresPublished = true;
        db.config.pendingUpdatesCount = 0;
        await saveUsers();

        const container = new ContainerBuilder()
          .setAccentColor(0x2ecc71)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 🚀 New Updates Published Successfully!\n\n` +
                `All recent tester features and updates have been automatically pushed to public production.\n` +
                `• Status: **LIVE FOR ALL USERS** 🟢\n` +
                `• Published by: <@${userId}>`
              )
            )
          );
        await confirmMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    });

    pubCollector.on('end', async () => {
      if (!decided) {
        await confirmMsg.edit({
          content: toSmallCaps('⏳ Publish confirmation timed out.'),
          components: []
        }).catch(() => {});
      }
    });
    return true;
  }

  if (command === 'testerfeature') {
    if (!isTester(userId)) {
      return message.reply(toSmallCaps('❌ Restricted to testers.'));
    }
    return message.reply(toSmallCaps('🧪 Experimental Sandbox Feature: Working as intended!'));
  }

  if (command === 'ownercommands' || command === 'oc') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the primary bot owner can access owner commands!'));
    }
    const container = new ContainerBuilder()
      .setAccentColor(0x9b59b6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 👑 Owner Control Center\n\n` +
            `• \`${currentPrefix}ownerbotmaintenance\` — Toggle bot maintenance mode\n` +
            `• \`${currentPrefix}ownersetstatus [@user] [status]\` — Set custom user game/activity status\n` +
            `• \`${currentPrefix}addtester [@user]\` — Add beta tester\n` +
            `• \`${currentPrefix}removetester [@user]\` — Remove beta tester\n` +
            `• \`${currentPrefix}testerpanel\` — Open beta tester panel\n` +
            `• \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — List beta features\n` +
            `• \`${currentPrefix}admingivebadges [@user] [key]\` (\`${currentPrefix}agb\`) — Manage user badges\n` +
            `• \`${currentPrefix}pubnewupd\` — Publish new updates to public production\n` +
            `• \`${currentPrefix}ownerresetdata\` — Wipe all user data and reset everyone\n` +
            `• \`${currentPrefix}ownersecretpanel\` — View secret system statistics\n` +
            `• \`${currentPrefix}owneradminpermsrem\` — Revoke admin permissions from all users\n` +
            `• \`${currentPrefix}ownergivechibi [@user]\` — Gift exclusive SSRP event chibis\n` +
            `• \`${currentPrefix}adminsetclanrewards\` — Configure seasonal clan rewards\n` +
            `• \`${currentPrefix}fixadmin\` — Assign yourself as main owner & server`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'admincommands' || command === 'ac') {
    if (!isAdmin()) {
      return message.reply(toSmallCaps('❌ You do not have administrator permissions to access this panel!'));
    }
    const container = new ContainerBuilder()
      .setAccentColor(0xe74c3c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
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
            `• \`${currentPrefix}admingivepermission [@user]\` — Grant admin rights *(Owner only)*`
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (command === 'ownerbotmaintenance') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can toggle maintenance mode!'));
    }
    db.config.maintenanceMode = !db.config.maintenanceMode;
    await saveUsers();
    const statusText = db.config.maintenanceMode ? 'ENABLED 🔴 (Bot locked for maintenance)' : 'DISABLED 🟢 (Bot is fully operational)';
    return message.reply(toSmallCaps(`🛠️ Maintenance mode successfully updated: ${statusText}`));
  }

  if (command === 'ownersetstatus') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can use ownersetstatus!'));
    }
    const target = message.mentions.users.first();
    const statusText = args.slice(1).join(' ');
    if (!target || !statusText) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownersetstatus [@user] [status text]\nExample: ${currentPrefix}ownersetstatus @user VALORANT`));
    }
    ensureUser(target.id);
    db.users[target.id].customStatus = {
      text: statusText,
      timestamp: Date.now()
    };
    await saveUsers();
    return message.reply(toSmallCaps(`✅ Successfully set custom status for <@${target.id}> to **${statusText}**!`));
  }

  if (command === 'adminrestoreall') {
    if (!isAdmin()) {
      return message.reply(toSmallCaps('❌ Only administrators can restore all user data!'));
    }
    let restoredCount = 0;
    for (const uId of Object.keys(db.users)) {
      ensureUser(uId);
      updateUserRank(db.users[uId]);
      updatePeakRank(db.users[uId]);
      await evaluateAndSyncUserBadges(uId, db.users[uId], message.guild);
      restoredCount++;
    }
    await saveUsers();
    return message.reply(toSmallCaps(`🔄 Successfully restored and synchronized data profiles for all **${restoredCount}** registered users!`));
  }

  if (command === 'ownerresetdata') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can execute data resets!'));
    }

    for (const uId of Object.keys(db.users)) {
      db.users[uId] = {
        started: false,
        joinedDate: new Date().toLocaleDateString(),
        dice: 10,
        points: 0,
        rank: '<:unranked:1571314276071907519>',
        clan: null,
        customNickname: null,
        highestSeasonRank: '<:unranked:1571314276071907519>',
        highestSeasonPoints: 0,
        inventory: { chibis: [], items: { spray: 0, clover: 0 } },
        team: [null, null, null],
        equippedChibi: null,
        bestRoll: 'None',
        bestRollTier: 0,
        bestRollVal: 0,
        bestChibi: null,
        userLevel: 1,
        userExp: 0,
        lastDrop: 0,
        todayDrops: 0,
        lastDaily: 0,
        streak: 0,
        permissions: (uId === db.config.ownerId ? true : false),
        customStatus: null,
        badges: [],
        clanMail: []
      };
    }
    db.clans = {};
    db.tradeHistories = {};
    if (db.config.eventCrystals) db.config.eventCrystals = {};
    await saveUsers();

    return message.reply(toSmallCaps('⚠️ OWNER NOTICE: All user data, inventories, teams, and stats have been completely reset! All users must use `+start` again.'));
  }

  if (command === 'fixadmin') {
    db.config.ownerId = userId;
    if (message.guild) {
      db.config.mainGuildId = message.guild.id;
    }
    user.permissions = true;
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();
    return message.reply(toSmallCaps(`🛡️ Admin override successful! You are now set as the Bot Owner & Admin, and this server (${message.guild ? message.guild.name : 'DM'}) is locked as the Main Server.`));
  }

  if (command === 'ownersecretpanel') {
    if (!isOwner()) {
      return true;
    }

    const container = new ContainerBuilder()
      .setAccentColor(0xe74c3c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            '# 🕵️‍♂️ Secret Owner Control Panel\n\n' +
            'Welcome, Supreme Master. Here are your hidden master controls:\n' +
            `• Total Registered Users: ${Object.keys(db.users).length}\n` +
            `• Total Active Clans: ${Object.keys(db.clans).length}\n` +
            `• Connected Guilds: ${client.guilds.cache.size}\n\n` +
            'Use your designated admin/owner commands safely.'
          )
        )
      );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
  }

  if (command === 'ownergivechibi') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can use this command!'));
    }
    const target = message.mentions.users.first();
    const rarityArg = args[1]?.toUpperCase();

    if (!target || !rarityArg) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownergivechibi [@user] [rarity] (e.g. ${currentPrefix}ownergivechibi @user SSRP)`));
    }
    ensureUser(target.id);

    const options = EVENT_CHIBIS_POOL.map(c => ({
      label: `${c.name} (${c.rarity})`.slice(0, 100),
      value: c.id
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('owner_give_chibi_select')
      .setPlaceholder(toSmallCaps('Select chibi to give'))
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    const promptMsg = await message.reply({
      content: toSmallCaps(`🎁 Select which event chibi to gift to <@${target.id}>:`),
      components: [row]
    });

    const selectFilter = int => int.user.id === userId && int.customId === 'owner_give_chibi_select';
    const selection = await message.channel.awaitMessageComponent({ filter: selectFilter, time: 25000 }).catch(() => null);

    if (!selection) return promptMsg.edit({ content: toSmallCaps('❌ Chibi giveaway timed out.'), components: [] }).catch(() => {});
    if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

    const chosenId = selection.values[0];
    const template = EVENT_CHIBIS_POOL.find(c => c.id === chosenId);
    const generatedId = new mongoose.Types.ObjectId().toString();

    if (!db.users[target.id].inventory.chibis) db.users[target.id].inventory.chibis = [];
    db.users[target.id].inventory.chibis.push({
      id: generatedId,
      chibiId: generatedId,
      name: template.name,
      rarity: 'SSRP',
      emoji: template.emoji,
      isShiny: false,
      level: 1,
      exp: 0,
      date: new Date().toLocaleDateString()
    });
    await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
    await saveUsers();

    return promptMsg.edit({
      content: toSmallCaps(`✅ Successfully gifted ${template.emoji} **${template.name}** (SSRP) to <@${target.id}>!`),
      components: []
    }).catch(() => {});
  }

  if (command === 'adminsetclanrewards') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can configure clan rewards!'));
    }
    const rankPos = parseInt(args[0]);
    const qty = parseInt(args[1]);
    const rarity = args[2]?.toUpperCase();
    const emoji = args[3];

    if (![1, 2, 3].includes(rankPos) || isNaN(qty) || !rarity || !emoji) {
      return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetclanrewards [1|2|3] [qty] [rarity] [Emoji]\nExample: ${currentPrefix}adminsetclanrewards 1 5 UTR 🌟`));
    }

    if (!db.config.clanRewards) db.config.clanRewards = {};
    db.config.clanRewards[rankPos] = { qty, rarity, chibiEmoji: emoji };
    await saveUsers();

    return message.reply(toSmallCaps(`✅ Successfully updated Rank ${rankPos} clan reward to ${qty}x ${rarity} (${emoji})!`));
  }

  if (command === 'owneradminpermsrem') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can execute this command!'));
    }

    let count = 0;
    for (const uId of Object.keys(db.users)) {
      if (db.users[uId].permissions === true && uId !== db.config.ownerId) {
        db.users[uId].permissions = false;
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

  if (command === 'enablec') {
    if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(toSmallCaps('❌ You must have Administrator permissions to manage channel restrictions.'));
    }

    if (!db.channelRestrictions[guildId]) db.channelRestrictions[guildId] = [];
    const index = db.channelRestrictions[guildId].indexOf(message.channel.id);
    if (index !== -1) {
      db.channelRestrictions[guildId].splice(index, 1);
      await saveUsers();
    }
    return message.reply(toSmallCaps(`✅ Chibi bot commands are now enabled in <#${message.channel.id}>.`));
  }

  if (command === 'disablec') {
    if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(toSmallCaps('❌ You must have Administrator permissions to manage channel restrictions.'));
    }

    if (!db.channelRestrictions[guildId]) db.channelRestrictions[guildId] = [];
    if (!db.channelRestrictions[guildId].includes(message.channel.id)) {
      db.channelRestrictions[guildId].push(message.channel.id);
      await saveUsers();
    }
    return message.reply(toSmallCaps(`❌ Chibi bot commands are now disabled in <#${message.channel.id}>.`));
  }

  if (command === 'removeadminperms') {
    if (!isOwner()) {
      return message.reply(toSmallCaps('❌ Only the bot owner can remove admin permissions!'));
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removeadminperms [@user]`));
    ensureUser(target.id);
    db.users[target.id].permissions = false;
    await saveUsers();
    return message.reply(toSmallCaps(`🛡️ Admin permissions successfully removed from <@${target.id}>.`));
  }

  if (command.startsWith('admin')) {
    if (!message.guild) {
      return message.reply('You cannot use this Admin power in your own server, you must in the main server to run this.');
    }
    if (!db.config.ownerId) db.config.ownerId = userId;
    if (!db.config.mainGuildId) db.config.mainGuildId = message.guild.id;

    const isUserOwner = userId === db.config.ownerId || user.permissions === true;
    const isMainServer = message.guild.id === db.config.mainGuildId;
    if (!isUserOwner || !isMainServer) {
      return message.reply('You cannot use this Admin power in your own server, you must in the main server to run this.');
    }

    if (command === 'admingivecrystal') {
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount)) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivecrystal [@user] [amount]`));
      }
      ensureUser(target.id);
      if (!db.config.eventCrystals) db.config.eventCrystals = {};
      db.config.eventCrystals[target.id] = (db.config.eventCrystals[target.id] || 0) + amount;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Successfully granted ${amount.toLocaleString()} Event Crystals ${EVENT_ICONS.CRYSTAL} to <@${target.id}>.`));
    }

    if (command === 'adminsetlbseason') {
      const seasonNum = parseInt(args[0]);
      if (isNaN(seasonNum) || seasonNum < 1) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlbseason [season_number]`));
      }
      db.config.seasonNumber = seasonNum;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Leaderboard season successfully set to Season ${seasonNum}!`));
    }

    if (command === 'adminresetrank') {
      for (const uId of Object.keys(db.users)) {
        db.users[uId].points = 0;
        updateUserRank(db.users[uId]);
      }
      await saveUsers();
      return message.reply(toSmallCaps('🛡️ Successfully reset all user ranks and points! Leaderboard season remains active.'));
    }

    if (command === 'adminsetnn') {
      if (!isAdmin()) {
        return message.reply(toSmallCaps('❌ Only administrators can use this command!'));
      }
      const target = message.mentions.users.first();
      const newNN = args.slice(1).join(' ');
      if (!target || !newNN) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetnn [@user] [nickname]`));
      }
      if (!db.users[target.id] || !db.users[target.id].started) {
        return message.reply(toSmallCaps('❌ User does not have Chibi RNG data or has not started yet!'));
      }
      if (newNN.length > 12) {
        return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
      }

      db.users[target.id].customNickname = newNN;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin successfully set custom nickname for <@${target.id}> to ${newNN}!`));
    }

    if (command === 'adminban') {
      const target = message.mentions.users.first();
      const durationArg = args[1]?.toLowerCase();
      if (!target || !durationArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminban [@user] [duration or permanent] (e.g. 1d, 2h, permanent)`));
      }

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
      if (!isAdmin()) {
        return message.reply(toSmallCaps('❌ Only administrators can clear the leaderboard!'));
      }

      for (const uId of Object.keys(db.users)) {
        db.users[uId].points = 0;
        db.users[uId].highestSeasonPoints = 0;
        db.users[uId].customNickname = null;
        updateUserRank(db.users[uId]);
      }
      await saveUsers();
      return message.reply(toSmallCaps('⚠️ Admin Warning: All names, ranks, and points in the leaderboard have been completely cleared!'));
    }

    if (command === 'adminluckevent') {
      const mult = parseFloat(args[0]);
      const durationStr = args[1];
      const durationMs = parseDurationToMs(durationStr);

      if (isNaN(mult) || !durationMs) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminluckevent [multiplier] [duration] (e.g. ${currentPrefix}adminluckevent 2.0 30m)`));
      }

      db.config.globalLuckMultiplier = mult;
      db.config.luckEventExpires = Date.now() + durationMs;
      await saveUsers();

      return message.reply(toSmallCaps(`⚡ Global Luck Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
    }

    if (command === 'adminsetxp') {
      const mult = parseFloat(args[0]);
      const durationStr = args[1];
      const durationMs = parseDurationToMs(durationStr);

      if (isNaN(mult) || !durationMs) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetxp [multiplier] [duration] (e.g. ${currentPrefix}adminsetxp 1.5 1h)`));
      }

      db.config.globalXpMultiplier = mult;
      db.config.xpEventExpires = Date.now() + durationMs;
      await saveUsers();

      return message.reply(toSmallCaps(`✨ Global XP Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
    }

    if (command === 'admingiveitem') {
      const target = message.mentions.users.first();
      const itemType = args[1]?.toLowerCase();
      const quantity = parseInt(args[2]);

      if (!target || !['dice', 'spray', 'clover'].includes(itemType) || isNaN(quantity)) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingiveitem [@user] [dice|spray|clover] [quantity]`));
      }
      ensureUser(target.id);

      if (!db.users[target.id].inventory.items) {
        db.users[target.id].inventory.items = { spray: 0, clover: 0 };
      }

      if (itemType === 'dice') db.users[target.id].dice += quantity;
      else if (itemType === 'spray') db.users[target.id].inventory.items.spray += quantity;
      else if (itemType === 'clover') db.users[target.id].inventory.items.clover += quantity;

      updateUserRank(db.users[target.id]);
      await saveUsers();

      return message.reply(toSmallCaps(`🎁 Admin granted ${quantity}x ${itemType} to <@${target.id}>.`));
    }

    if (command === 'adminsetrank') {
      const target = message.mentions.users.first();
      const newRank = args.slice(1).join(' ');
      if (!target || !newRank) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetrank [@user] [rank title]`));
      ensureUser(target.id);
      db.users[target.id].rank = newRank;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin updated rank icon for <@${target.id}>.`));
    }

    if (command === 'adminsetpoints') {
      const target = message.mentions.users.first();
      const pts = parseInt(args[1]);
      if (!target || isNaN(pts)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetpoints [@user] [points]`));
      ensureUser(target.id);
      db.users[target.id].points = pts;
      updateUserRank(db.users[target.id]);
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin set points for <@${target.id}> to **${pts}** (Rank icon auto-updated).`));
    }

    if (command === 'admingivepermission') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can assign admin permissions!'));
      }
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivepermission [@user]`));
      ensureUser(target.id);
      db.users[target.id].permissions = true;
      await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin permissions granted to <@${target.id}>.`));
    }

    if (command === 'adminsetlevel') {
      const target = message.mentions.users.first();
      const lvl = parseInt(args[1]);
      if (!target || isNaN(lvl) || lvl < 1) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlevel [@user] [level]`));
      }
      ensureUser(target.id);
      db.users[target.id].userLevel = lvl;
      db.users[target.id].userExp = 0;
      await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin set user level for <@${target.id}> to Level ${lvl}.`));
    }
  }

  return false;
}

module.exports = {
  commands: ADMIN_CMDS,
  execute
};