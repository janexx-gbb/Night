const { Client, GatewayIntentBits } = require('discord.js');

const { ALL_VALID_COMMANDS, COMMAND_ALIASES, TESTER_ONLY_COMMANDS } = require('./core/constants');
const { GameState, db, initDatabase, saveUsers } = require('./core/database');
const { isTester, canSeeUnreleasedBeta, toSmallCaps, getRarityIconMap, ensureUser } = require('./core/helpers');
const { checkSeasonRollovers } = require('./core/seasons');

const COMMAND_MODULES = [
  require('./commmands/corecommands'),
  require('./commmands/eventcommands'),
  require('./commmands/rpgcommands'),
  require('./commmands/clancommands'),
  require('./commmands/admincommands'),
  require('./commmands/pingcommand')
];

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_PREFIX = '+';
const COMMAND_COOLDOWN_MS = 6000;
const ONE_MINUTE_MS = 60 * 1000;

// Commands a player can use before typing +start.
const PRE_START_COMMANDS = new Set(['start', 'help', 'status', 'ping']);

// Commands that still work in channels where the bot has been disabled.
const CHANNEL_RESTRICTION_EXEMPT = new Set([
  'enablec', 'disablec', 'prefixchange', 'admincommands', 'ownercommands', 'ownerresetdata',
  'help', 'status', 'fixadmin', 'ownercl', 'owneradminpermsrem', 'ownersecretpanel', 'event',
  'ownerbotmaintenance', 'adminrestoreall', 'ownersetstatus', 'testerpanel', 'addtester',
  'removetester', 'pubnewupd', 'testerfeatures', 'admingivebadges',
  'cpromote', 'cannounce', 'kick', 'cmail', 'ceditdesc'
]);

// command name -> module that handles it
const commandHandlers = new Map();
for (const mod of COMMAND_MODULES) {
  for (const name of mod.commands) commandHandlers.set(name, mod);
}

// ─── Client ──────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const cooldowns = new Map(); // userId -> Map(command -> last used timestamp)

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);

  if (!db.config.mainGuildId && client.guilds.cache.size > 0) {
    await setMainGuild(client.guilds.cache.first(), 'Auto-assigned Main Server');
  }

  updateStatus();
  setInterval(updateStatus, ONE_MINUTE_MS);
  setInterval(checkSeasonRollovers, ONE_MINUTE_MS);
});

client.on('guildCreate', async guild => {
  if (!db.config.mainGuildId) {
    await setMainGuild(guild, 'Main/First Server registered');
  }
});

client.on('messageCreate', handleMessage);

initDatabase().then(() => client.login(process.env.DISCORD_TOKEN));

// ─── Startup helpers ─────────────────────────────────────────────────────────

function updateStatus() {
  const serverCount = client.guilds.cache.size;
  client.user.setActivity(toSmallCaps(`+help | Serving ${serverCount} servers`), { type: 0 });
}

async function setMainGuild(guild, logLabel) {
  db.config.mainGuildId = guild.id;
  const state = await GameState.findById('main_state');
  if (state) {
    state.config = db.config;
    state.markModified('config');
    await state.save();
  }
  console.log(`📌 ${logLabel}: ${guild.name} (${guild.id})`);
}

// ─── Message handling ────────────────────────────────────────────────────────

async function handleMessage(message) {
  if (message.author.bot) return;

  const guildId = message.guild?.id ?? 'DM';
  const prefix = getPrefix(guildId);
  const parsed = parseCommand(message.content, prefix);
  if (!parsed) return;

  const { command, args } = parsed;
  const userId = message.author.id;

  // The first person to trigger an owner check becomes the bot owner.
  const isOwner = () => {
    if (!db.config.ownerId) db.config.ownerId = userId;
    return userId === db.config.ownerId;
  };

  const blockedReason = await getBlockedReason(command, userId, isOwner);
  if (blockedReason) return message.reply(toSmallCaps(blockedReason));

  if (isChannelRestricted(guildId, message.channel.id, command)) return;

  const secondsLeft = useCooldown(userId, command);
  if (secondsLeft > 0) {
    return message.reply(toSmallCaps(`⏳ Please wait ${secondsLeft.toFixed(1)} more seconds before using ${prefix}${command} again.`));
  }

  ensureUser(userId);
  const user = db.users[userId];
  const callerHasBetaView = canSeeUnreleasedBeta(userId) || Boolean(db.config.featuresPublished);

  try {
    const currentMs = Date.now();
    await expireGlobalEvents(currentMs);

    if (!user.started && !PRE_START_COMMANDS.has(command)) {
      return message.reply(toSmallCaps(`❌ You must type ${prefix}start before using any bot commands!`));
    }

    await commandHandlers.get(command)?.execute({
      command,
      args,
      message,
      client,
      userId,
      guildId,
      currentPrefix: prefix,
      user,
      currentMs,
      isOwner,
      isAdmin: () => isOwner() || user.permissions === true,
      getDisplayName,
      callerHasBetaView,
      rarityIconsMap: getRarityIconMap(callerHasBetaView)
    });
  } catch (err) {
    console.error(err);
    message.reply(toSmallCaps('❌ An error occurred while executing this command.'));
  }
}

function getPrefix(guildId) {
  const saved = db.guildPrefixes?.[guildId];
  // A single-letter prefix would fire on ordinary chat, so fall back to the default.
  return saved && !/^[a-zA-Z]$/.test(saved) ? saved : DEFAULT_PREFIX;
}

// Returns { command, args } for a valid command message, otherwise null.
function parseCommand(content, prefix) {
  if (!content.startsWith(prefix)) return null;

  const afterPrefix = content.slice(prefix.length);
  // Ignore messages like "+ hello" where the prefix is followed by a space.
  if (!afterPrefix || afterPrefix.startsWith(' ')) return null;

  const [rawCommand, ...args] = afterPrefix.trim().split(/ +/);
  const typed = rawCommand.toLowerCase();
  const command = COMMAND_ALIASES.get(typed) ?? typed;

  return ALL_VALID_COMMANDS.has(command) ? { command, args } : null;
}

// Returns a message explaining why the user can't run this command, or null if they can.
async function getBlockedReason(command, userId, isOwner) {
  if (TESTER_ONLY_COMMANDS.has(command) && !isTester(userId)) {
    return '❌ This command is restricted to authorized beta testers only!';
  }

  if (db.config.maintenanceMode && !isOwner()) {
    return 'The bot currently under maintenance.';
  }

  const ban = db.bannedUsers?.[userId];
  if (ban) {
    if (ban.expires === 'permanent' || Date.now() < ban.expires) {
      return '❌ You are banned from using bot commands.';
    }
    delete db.bannedUsers[userId]; // ban has expired
    await saveUsers();
  }

  return null;
}

function isChannelRestricted(guildId, channelId, command) {
  const restrictedChannels = db.channelRestrictions[guildId] || [];
  return restrictedChannels.includes(channelId) && !CHANNEL_RESTRICTION_EXEMPT.has(command);
}

// Records this use and returns 0, or returns the seconds left if still on cooldown.
function useCooldown(userId, command) {
  if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
  const timestamps = cooldowns.get(userId);

  const now = Date.now();
  const lastUsed = timestamps.get(command);
  if (lastUsed !== undefined && now < lastUsed + COMMAND_COOLDOWN_MS) {
    return (lastUsed + COMMAND_COOLDOWN_MS - now) / 1000;
  }

  timestamps.set(command, now);
  setTimeout(() => timestamps.delete(command), COMMAND_COOLDOWN_MS);
  return 0;
}

// Turns off admin-triggered luck/XP boosts once their timer runs out.
async function expireGlobalEvents(now) {
  if (db.config.luckEventExpires && now > db.config.luckEventExpires) {
    db.config.globalLuckMultiplier = 1.0;
    db.config.luckEventExpires = 0;
    await saveUsers();
  }
  if (db.config.xpEventExpires && now > db.config.xpEventExpires) {
    db.config.globalXpMultiplier = 1.0;
    db.config.xpEventExpires = 0;
    await saveUsers();
  }
}

async function getDisplayName(uId) {
  const nickname = db.users[uId]?.customNickname;
  if (nickname) return nickname;
  try {
    const fetched = await client.users.fetch(uId);
    if (fetched) return fetched.username;
  } catch {}
  return 'Unknown User';
}
