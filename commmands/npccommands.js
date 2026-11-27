const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const crypto = require('crypto');

const { db } = require('../core/database');
const { toSmallCaps, saveUsers } = require('../core/helpers');

const ICONS = {
  rebirth: '<a:Rebirth:1575788405076267079>',
  ascend: '<a:Ascend:1575788457199145070>',
  shiny: '<a:Shinyy:157588508608462919>',
  redeem: '<:Redeem:1575864911383498762>',
  shinyRedeem: '<:Shinyredeem:1575865671248777327>'
};

const MAX_REBIRTH = 5;
const MAX_ASCEND = 5;
const MAX_LEVEL = 100;

const NPC_TIERS = [
  { name: '神级', weight: 0.01, hp: [300, 950], atk: [40, 75], def: [32, 46], spd: [30, 50] },
  { name: 'SSS', weight: 0.1, hp: [265, 670], atk: [32, 53], def: [28, 37], spd: [28, 36] },
  { name: 'S+', weight: 1, hp: [225, 505], atk: [24, 48], def: [23, 34], spd: [25, 32] },
  { name: 'S-', weight: 3, hp: [205, 460], atk: [20, 42], def: [19, 30], spd: [21, 29] },
  { name: 'S', weight: 5, hp: [180, 415], atk: [17, 32], def: [15, 26], spd: [18, 25] },
  { name: 'A+', weight: 8, hp: [150, 380], atk: [14, 29], def: [12, 22], spd: [15, 21] },
  { name: 'A-', weight: 12, hp: [120, 310], atk: [11, 26], def: [10, 22], spd: [13, 19] },
  { name: 'A', weight: 15, hp: [105, 275], atk: [9, 23], def: [8, 19], spd: [10, 17] },
  { name: 'B', weight: 30, hp: [90, 220], atk: [7, 18], def: [6, 11], spd: [8, 14] },
  { name: 'C', weight: 50, hp: [75, 195], atk: [5, 15], def: [4, 9], spd: [6, 11] },
  { name: 'D', weight: 75, hp: [50, 120], atk: [4, 12], def: [2, 7], spd: [4, 9] }
];

const NORMAL_NPCS = [
  // 15% pool
  { id: 'naruto_uzumaki', name: 'Naruto Uzumaki', icon: '<a:Naruto:1575791239821795418>', spawnWeight: 15, shiny: false },
  { id: 'inosuke_hashibara', name: 'Inosuke Hashibara', icon: '<a:Inosukee:1575791445661585498>', spawnWeight: 15, shiny: false },
  { id: 'tanjiro_kamado', name: 'Tanjiro Kamado', icon: '<a:Tanjiro:1575791497591128114>', spawnWeight: 15, shiny: false },
  { id: 'zenitsu_agatsuma', name: 'Zenitsu Agatsuma', icon: '<a:Zenitsu:1575791363960864838>', spawnWeight: 15, shiny: false },

  // 9% pool
  { id: 'madara_uchiha', name: 'Madara Uchiha', icon: '<a:Madara:1575791099648282644>', spawnWeight: 9, shiny: false },
  { id: 'hashirama_senju', name: 'Hashirama Senju', icon: '<a:Hashirama:1575791197983871167>', spawnWeight: 9, shiny: false },
  { id: 'yoriichi_rin', name: 'Yoriichi Rin', icon: '<a:Yoriichi:1575791274785644604>', spawnWeight: 9, shiny: false },
  { id: 'luffy', name: 'Luffy', icon: '<a:Luffy:1575791580680421527>', spawnWeight: 9, shiny: false },

  // 1% pool
  { id: 'saitama_bald', name: 'Saitama Bald', icon: '<a:Saitama:1575791317458362480>', spawnWeight: 1, shiny: false },
  { id: 'gojo_saturo', name: 'Gojo Saturo', icon: '<a:Gojo:1575791556819034192>', spawnWeight: 1, shiny: false },
  { id: 'sukuna', name: 'Sukuna', icon: '<a:Sukuna:1575791530239856720>', spawnWeight: 1, shiny: false },

  // 0.60% pool
  { id: 'shadow_megumi', name: 'Shadow Megumi', icon: '<a:MegumiY:1575793666759336047>', spawnWeight: 0.6, shiny: false },
  { id: '4th_hokage_minato', name: '4th Hokage Minato', icon: '<a:MasterMinato:1575793610669170718>', spawnWeight: 0.6, shiny: false },
  { id: 'swordman_atomic', name: 'Swordman Atomic', icon: '<a:AtomicX:1575793456939405384>', spawnWeight: 0.6, shiny: false },
  { id: 'kagami_envy', name: 'Kagami Envy', icon: '<a:KagamiEnvy:1575793794794913842>', spawnWeight: 0.6, shiny: false }
];

const SHINY_NPCS = [
  // 0.65% pool
  { id: 'shiny_zenitsu', name: 'Shiny Zenitsu', icon: '<a:ShinyZenitsu:1575792651720990782>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_naruto', name: 'Shiny Naruto', icon: '<a:Shinynaruto:1575793106975072316>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_tanjiro', name: 'Shiny Tanjiro', icon: '<a:ShinyTanjiro:1575792777353236480>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_inosukee', name: 'Shiny Inosukee', icon: '<a:ShinyInosukee:1575793744953868328>', spawnWeight: 0.65, shiny: true },

  // 0.47% pool
  { id: 'shiny_luffy', name: 'Shiny Luffy', icon: '<a:ShinyLuffy:1575793831729963148>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_madara', name: 'Shiny Madara', icon: '<a:Shinymadara:1575793063681458306>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_hashirama', name: 'Shiny Hashirama', icon: '<a:ShinyHashirama:1575793566268260392>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_yoriichi', name: 'Shiny Yoriichi', icon: '<a:ShinyYoriichi:1575792863982391336>', spawnWeight: 0.47, shiny: true },

  // 0.25% pool
  { id: 'shiny_saitama', name: 'Shiny Saitama', icon: '<a:Shinysaitama:1575793373900570786>', spawnWeight: 0.25, shiny: true },
  { id: 'shiny_sukuna', name: 'Shiny Sukuna', icon: '<a:Shinysukuna:1575793494839132180>', spawnWeight: 0.25, shiny: true },
  { id: 'shiny_gojo', name: 'Shiny Gojo', icon: '<a:ShinyGojo:1575793528183853096>', spawnWeight: 0.25, shiny: true }
];

const ALL_NPCS = [...NORMAL_NPCS, ...SHINY_NPCS];

const NPC_COMMANDS = [
  'cnpc',
  'cget',
  'nrebirth',
  'nascend',
  'nsredeem',
  'nsr',
  'snsredeem',
  'snsr',
  'redeems',
  'redeem'
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(items, weightKey = 'weight') {
  const total = items.reduce((sum, item) => sum + Number(item[weightKey] || 0), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= Number(item[weightKey] || 0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// Random level 1-90 with lower chance for 60+
function rollCatchLevel1to90() {
  const pool = [];
  for (let lvl = 1; lvl <= 90; lvl++) {
    const weight = lvl >= 60 ? 1 : 6;
    pool.push({ lvl, weight });
  }
  return weightedPick(pool, 'weight').lvl;
}

function rollTierAndBaseStats() {
  const tier = weightedPick(NPC_TIERS, 'weight');
  return {
    tier: tier.name,
    baseHp: randInt(tier.hp[0], tier.hp[1]),
    baseAtk: randInt(tier.atk[0], tier.atk[1]),
    baseDef: randInt(tier.def[0], tier.def[1]),
    baseSpd: randInt(tier.spd[0], tier.spd[1])
  };
}

function computeNpcStats(npc) {
  const level = Math.max(1, Number(npc.level || 1));
  const rebirths = Math.max(0, Number(npc.rebirths || 0));
  const ascends = Math.max(0, Number(npc.ascends || 0));
  const isShiny = Boolean(npc.isShiny);

  const levelScale = 1 + (level - 1) * 0.02;
  const shinyHpMult = isShiny ? 1.4 : 1;
  const shinyAtkMult = isShiny ? 1.3 : 1;
  const shinyDefMult = isShiny ? 1.25 : 1;
  const shinySpdMult = isShiny ? 1.15 : 1;

  // Each rebirth gives +30% all stats; each ascend gives +70% all stats
  const progressionMult = 1 + rebirths * 0.3 + ascends * 0.7;

  return {
    hp: Math.round(Number(npc.baseHp || 50) * levelScale * shinyHpMult * progressionMult),
    atk: Math.round(Number(npc.baseAtk || 5) * levelScale * shinyAtkMult * progressionMult),
    def: Math.round(Number(npc.baseDef || 5) * levelScale * shinyDefMult * progressionMult),
    spd: Math.round(Number(npc.baseSpd || 5) * levelScale * shinySpdMult * progressionMult)
  };
}

function applyRebirthOrAscendLogic(npc) {
  npc.rebirths = Math.max(0, Number(npc.rebirths || 0));
  npc.ascends = Math.max(0, Number(npc.ascends || 0));
  npc.level = Math.max(1, Number(npc.level || 1));
  npc.xp = 0;

  if (npc.ascends >= MAX_ASCEND) {
    return { ok: false, reason: `Your NPC has already reached the maximum **Ascend ${MAX_ASCEND}** and cannot rebirth anymore!` };
  }

  npc.rebirths += 1;

  // If NPC reaches 5 rebirths, automatically promote to Ascend +1 and reset rebirths to 0
  if (npc.rebirths >= MAX_REBIRTH) {
    if (npc.ascends < MAX_ASCEND) {
      npc.ascends += 1;
      npc.rebirths = 0;
    } else {
      npc.rebirths = MAX_REBIRTH;
    }
  }

  npc.level = 1;
  return { ok: true, npc };
}

function ensureNpcUserFields(user) {
  if (!Array.isArray(user.npcs)) user.npcs = [];
  if (typeof user.selectedNpcId !== 'string') user.selectedNpcId = null;
  if (typeof user.redeems !== 'number' || Number.isNaN(user.redeems)) user.redeems = 0;
  if (typeof user.shinyRedeems !== 'number' || Number.isNaN(user.shinyRedeems)) user.shinyRedeems = 0;
}

function createNpcInstance(template, level = 1, nowMs = Date.now()) {
  const rolled = rollTierAndBaseStats();
  const isShiny = Boolean(template.shiny || template.isShiny);
  return {
    uid: crypto.randomBytes(8).toString('hex'),
    npcId: template.id,
    name: template.name,
    icon: template.icon,
    isShiny,
    tier: rolled.tier,
    level: Math.max(1, Math.min(MAX_LEVEL, Number(level || 1))),
    xp: 0,
    rebirths: 0,
    ascends: 0,
    baseHp: rolled.baseHp,
    baseAtk: rolled.baseAtk,
    baseDef: rolled.baseDef,
    baseSpd: rolled.baseSpd,
    nickname: null,
    favorite: false,
    obtainedAt: nowMs
  };
}

function formatObtainedDate(ms) {
  const d = new Date(Number(ms || Date.now()));
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function buildRebirthAscendStarsLine(npc) {
  const rebirths = Math.max(0, Math.min(MAX_REBIRTH, Number(npc.rebirths || 0)));
  const ascends = Math.max(0, Math.min(MAX_ASCEND, Number(npc.ascends || 0)));
  const parts = [];
  for (let i = 0; i < rebirths; i++) parts.push(ICONS.rebirth);
  for (let i = 0; i < ascends; i++) parts.push(ICONS.ascend);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function getActiveNpc(user) {
  ensureNpcUserFields(user);
  if (user.npcs.length === 0) return null;
  if (user.selectedNpcId) {
    const found = user.npcs.find(n => n.uid === user.selectedNpcId);
    if (found) return found;
  }
  user.selectedNpcId = user.npcs[0].uid;
  return user.npcs[0];
}

function buildCnpcView(npc, currentPrefix) {
  const stats = computeNpcStats(npc);
  const displayName = npc.nickname ? `${npc.name} (${npc.nickname})` : npc.name;
  const shinyBadge = npc.isShiny ? ` ${ICONS.shiny}` : '';
  const starsLine = buildRebirthAscendStarsLine(npc);

  let readyNotice = '';
  if (npc.level >= MAX_LEVEL && npc.rebirths >= MAX_REBIRTH && npc.ascends < MAX_ASCEND) {
    readyNotice = `\n\n⚡ **Your NPC Is ready for Rebirth/Ascending** — Use \`${currentPrefix}nrebirth\` or \`${currentPrefix}nascend\`!`;
  } else if (npc.level >= MAX_LEVEL && npc.ascends < MAX_ASCEND) {
    readyNotice = `\n\n⚡ **Your NPC Is ready for Rebirth/Ascending** — Use \`${currentPrefix}nrebirth\`!`;
  }

  const content =
    toSmallCaps(`Name: `) + `**${displayName}**${shinyBadge}\n` +
    toSmallCaps(`Tier: `) + `**${npc.tier}**\n` +
    toSmallCaps(`Level: `) + `**${npc.level}**\n` +
    `${starsLine}\n\n` +
    `❤️ ` + toSmallCaps(`HP: `) + `**${stats.hp.toLocaleString()}**\n` +
    `⚔️ ` + toSmallCaps(`Atk: `) + `**${stats.atk.toLocaleString()}**\n` +
    `🛡️ ` + toSmallCaps(`Def: `) + `**${stats.def.toLocaleString()}**\n` +
    `⚡ ` + toSmallCaps(`Spd: `) + `**${stats.spd.toLocaleString()}**\n\n` +
    `${npc.icon}\n\n` +
    toSmallCaps(`ID : `) + `\`${npc.uid}\`\n` +
    toSmallCaps(`First Obtain : `) + `**${formatObtainedDate(npc.obtainedAt)}**` +
    readyNotice;

  const container = new ContainerBuilder()
    .setAccentColor(npc.isShiny ? 0xf1c40f : 0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cnpc_nick_${npc.uid}`)
      .setLabel(toSmallCaps('Set Nickname'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cnpc_fav_${npc.uid}`)
      .setLabel(toSmallCaps(npc.favorite ? 'Favorited ★' : 'Favorite'))
      .setStyle(npc.favorite ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  return { container, row };
}

function getChannelSpawnState(channelId) {
  if (!db.config) db.config = {};
  if (!db.config.npcSpawns || typeof db.config.npcSpawns !== 'object') {
    db.config.npcSpawns = {};
  }
  return db.config.npcSpawns[channelId] || null;
}

function setChannelSpawnState(channelId, spawnObj) {
  if (!db.config) db.config = {};
  if (!db.config.npcSpawns || typeof db.config.npcSpawns !== 'object') {
    db.config.npcSpawns = {};
  }
  db.config.npcSpawns[channelId] = spawnObj;
}

function clearChannelSpawnState(channelId) {
  if (db.config && db.config.npcSpawns) {
    delete db.config.npcSpawns[channelId];
  }
}

async function spawnNpcInChannel(channel, prefix = '+', forcedTemplate = null) {
  const template = forcedTemplate || weightedPick(ALL_NPCS, 'spawnWeight');
  const spawnData = {
    npcId: template.id,
    name: template.name,
    icon: template.icon,
    isShiny: Boolean(template.shiny || template.isShiny),
    spawnedAt: Date.now()
  };

  setChannelSpawnState(channel.id, spawnData);
  await saveUsers();

  const content =
    `# ` + toSmallCaps(`A NPC Has Appeared`) + `\n\n` +
    toSmallCaps(`Type `) + `\`${prefix}cget ${template.name}\` ` + toSmallCaps(`to obtain this npc`) + `\n\n` +
    `${template.icon}`;

  const container = new ContainerBuilder()
    .setAccentColor(spawnData.isShiny ? 0xf39c12 : 0x2ecc71)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

function findNpcTemplateByName(query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  return (
    ALL_NPCS.find(n => n.name.toLowerCase() === q || n.id === q) ||
    ALL_NPCS.find(n => n.name.toLowerCase().includes(q)) ||
    null
  );
}

// Call this from your chat / other-bot message listener to level up active NPCs
async function processNpcChatOrBotActivity(message, user, currentPrefix = '+') {
  if (!message || !user) return false;
  ensureNpcUserFields(user);
  const npc = getActiveNpc(user);
  if (!npc) return false;

  const isFromBot = Boolean(message.author?.bot);
  const xpGain = isFromBot ? randInt(15, 30) : randInt(20, 40);

  if (npc.level >= MAX_LEVEL) {
    npc.xp = 0;
    return false;
  }

  npc.xp = Number(npc.xp || 0) + xpGain;
  const requiredXp = 100 + (npc.level - 1) * 25;
  let leveledUp = false;

  while (npc.xp >= requiredXp && npc.level < MAX_LEVEL) {
    npc.xp -= requiredXp;
    npc.level += 1;
    leveledUp = true;
  }

  if (npc.level >= MAX_LEVEL) {
    npc.level = MAX_LEVEL;
    npc.xp = 0;
  }

  if (!leveledUp) return false;

  await saveUsers();

  let readyText = '';
  if (npc.level >= MAX_LEVEL && npc.rebirths >= MAX_REBIRTH && npc.ascends < MAX_ASCEND) {
    readyText = `\n\n⚡ **Your NPC Is ready for Rebirth/Ascending** (\`${currentPrefix}nascend\`)`;
  } else if (npc.level >= MAX_LEVEL && npc.ascends < MAX_ASCEND) {
    readyText = `\n\n⚡ **Your NPC Is ready for Rebirth/Ascending** (\`${currentPrefix}nrebirth\`)`;
  }

  const levelMsg =
    `🎉 ` + toSmallCaps(`Congratulations Your `) + `**${npc.name}** ` +
    toSmallCaps(`is leveling up to `) + `**${npc.level}**\n\n` +
    `${npc.icon}` +
    readyText;

  const container = new ContainerBuilder()
    .setAccentColor(0x9b59b6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(levelMsg));

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  }).catch(() => {});

  return true;
}

// Handle button & modal interactions for +cnpc
async function handleNpcInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith('cnpc_fav_')) {
      const uid = id.replace('cnpc_fav_', '');
      const user = db.users?.[interaction.user.id];
      if (!user) return true;
      ensureNpcUserFields(user);

      const npc = user.npcs.find(n => n.uid === uid);
      if (!npc) {
        await interaction.reply({ content: toSmallCaps('❌ NPC not found in your collection.'), ephemeral: true });
        return true;
      }

      npc.favorite = !npc.favorite;
      await saveUsers();

      const guildPrefix = db.config?.guildPrefixes?.[interaction.guildId] || '+';
      const { container, row } = buildCnpcView(npc, guildPrefix);
      await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    if (id.startsWith('cnpc_nick_')) {
      const uid = id.replace('cnpc_nick_', '');
      const modal = new ModalBuilder()
        .setCustomId(`cnpc_nick_modal_${uid}`)
        .setTitle('Set NPC Nickname');

      const input = new TextInputBuilder()
        .setCustomId('npc_nickname_input')
        .setLabel('Enter a new nickname (leave blank to clear)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(32)
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('cnpc_nick_modal_')) {
    const uid = interaction.customId.replace('cnpc_nick_modal_', '');
    const user = db.users?.[interaction.user.id];
    if (!user) return true;
    ensureNpcUserFields(user);

    const npc = user.npcs.find(n => n.uid === uid);
    if (!npc) {
      await interaction.reply({ content: toSmallCaps('❌ NPC not found.'), ephemeral: true });
      return true;
    }

    const rawNick = interaction.fields.getTextInputValue('npc_nickname_input').trim();
    npc.nickname = rawNick.length > 0 ? rawNick : null;
    await saveUsers();

    const guildPrefix = db.config?.guildPrefixes?.[interaction.guildId] || '+';
    const { container, row } = buildCnpcView(npc, guildPrefix);
    await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  return false;
}

async function execute({ command, args, message, userId, currentPrefix, user }) {
  if (!NPC_COMMANDS.includes(command)) return false;

  ensureNpcUserFields(user);
  const prefix = currentPrefix || '+';

  // +cnpc — view current NPC of user
  if (command === 'cnpc') {
    if (args.length > 0) {
      const targetIndex = Number.parseInt(args[0], 10);
      const byUid = user.npcs.find(n => n.uid === args[0]);
      if (byUid) {
        user.selectedNpcId = byUid.uid;
      } else if (!Number.isNaN(targetIndex) && targetIndex >= 1 && targetIndex <= user.npcs.length) {
        user.selectedNpcId = user.npcs[targetIndex - 1].uid;
      }
    }

    const activeNpc = getActiveNpc(user);
    if (!activeNpc) {
      return message.reply(toSmallCaps(`❌ You don't have any NPCs yet! Catch a spawned NPC using \`${prefix}cget <Npcname>\`.`));
    }

    await saveUsers();
    const { container, row } = buildCnpcView(activeNpc, prefix);
    return message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  }

  // +cget <Npcname> — catch appeared NPC
  if (command === 'cget') {
    const spawn = getChannelSpawnState(message.channel.id);
    if (!spawn) {
      return message.reply(toSmallCaps(`❌ There is no NPC spawned in this channel right now.`));
    }

    const guess = args.join(' ').trim().toLowerCase();
    if (!guess) {
      return message.reply(toSmallCaps(`❌ Usage: \`${prefix}cget <Npcname>\``));
    }

    const targetNameLower = spawn.name.toLowerCase();
    if (guess !== targetNameLower && !targetNameLower.includes(guess)) {
      return message.reply(toSmallCaps(`❌ Wrong NPC name! Try again with \`${prefix}cget <Npcname>\`.`));
    }

    const template = ALL_NPCS.find(n => n.id === spawn.npcId) || spawn;
    const catchLevel = rollCatchLevel1to90();
    const newNpc = createNpcInstance(template, catchLevel, Date.now());

    user.npcs.push(newNpc);
    if (!user.selectedNpcId) user.selectedNpcId = newNpc.uid;

    clearChannelSpawnState(message.channel.id);
    await saveUsers();

    const username = message.member?.displayName || message.author.username;
    return message.reply(
      toSmallCaps(`Congratulations `) +
      `**@${username}** ` +
      toSmallCaps(`You caught `) +
      `**${newNpc.name}** ` +
      toSmallCaps(`[${newNpc.level}] check your `) +
      `\`${prefix}cnpc\` ` +
      toSmallCaps(`to see your npc`)
    );
  }

  // +nrebirth — rebirth active NPC (requires level 100; max 5 rebirths -> Ascend 1)
  if (command === 'nrebirth') {
    const npc = getActiveNpc(user);
    if (!npc) {
      return message.reply(toSmallCaps(`❌ You don't have an active NPC.`));
    }
    if (npc.level < MAX_LEVEL) {
      return message.reply(toSmallCaps(`❌ **${npc.name}** must reach **Level ${MAX_LEVEL}** to Rebirth (Current: **Level ${npc.level}**).`));
    }

    const res = applyRebirthOrAscendLogic(npc);
    if (!res.ok) {
      return message.reply(toSmallCaps(`❌ ${res.reason}`));
    }

    await saveUsers();
    const stars = buildRebirthAscendStarsLine(npc);
    return message.reply(
      toSmallCaps(`✨ **${npc.name}** Rebirth/Ascend updated! `) +
      `${stars} ` +
      toSmallCaps(`(Rebirths: **${npc.rebirths}/${MAX_REBIRTH}**, Ascends: **${npc.ascends}/${MAX_ASCEND}**, Level: **${npc.level}**)`)
    );
  }

  // +nascend — ascend active NPC (requires 5 rebirths / max level)
  if (command === 'nascend') {
    const npc = getActiveNpc(user);
    if (!npc) {
      return message.reply(toSmallCaps(`❌ You don't have an active NPC.`));
    }
    if (npc.ascends >= MAX_ASCEND) {
      return message.reply(toSmallCaps(`❌ **${npc.name}** has already reached maximum **Ascend ${MAX_ASCEND}**!`));
    }
    if (npc.rebirths < MAX_REBIRTH && npc.level < MAX_LEVEL) {
      return message.reply(toSmallCaps(`❌ **${npc.name}** requires **5 Rebirths** (or **Level ${MAX_LEVEL}** at Rebirth 5) to Ascend.`));
    }

    if (npc.rebirths >= MAX_REBIRTH) {
      npc.ascends += 1;
      npc.rebirths = 0;
      npc.level = 1;
      npc.xp = 0;
    } else {
      const res = applyRebirthOrAscendLogic(npc);
      if (!res.ok) return message.reply(toSmallCaps(`❌ ${res.reason}`));
    }

    await saveUsers();
    const stars = buildRebirthAscendStarsLine(npc);
    return message.reply(
      toSmallCaps(`🌟 **${npc.name}** Ascended! `) +
      `${stars} ` +
      toSmallCaps(`(Ascends: **${npc.ascends}/${MAX_ASCEND}**, Rebirths: **${npc.rebirths}/${MAX_REBIRTH}**)`)
    );
  }

  // Check redeem counts when running +redeem or +redeems with no args
  if ((command === 'redeem' || command === 'redeems') && args.length === 0) {
    const content =
      `${ICONS.redeem} - **${user.redeems.toLocaleString()}**\n` +
      `${ICONS.shinyRedeem} - **${user.shinyRedeems.toLocaleString()}**`;
    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  // +nsredeem or +nsr <NPC name> — normal NPC redeem spawn
  if (command === 'nsredeem' || command === 'nsr') {
    if (user.redeems < 1) {
      return message.reply(toSmallCaps(`❌ You don't have any ${ICONS.redeem} Redeems!`));
    }
    const query = args.join(' ').trim();
    if (!query) {
      return message.reply(toSmallCaps(`❌ Usage: \`${prefix}${command} <NPC name>\``));
    }
    const template = NORMAL_NPCS.find(n =>
      n.name.toLowerCase() === query.toLowerCase() || n.name.toLowerCase().includes(query.toLowerCase())
    );
    if (!template) {
      return message.reply(toSmallCaps(`❌ Normal NPC not found matching "${query}".`));
    }

    user.redeems -= 1;
    await saveUsers();
    await spawnNpcInChannel(message.channel, prefix, template);
    return true;
  }

  // +snsredeem or +snsr <Shiny NPC Names> — shiny NPC redeem spawn
  if (command === 'snsredeem' || command === 'snsr') {
    if (user.shinyRedeems < 1) {
      return message.reply(toSmallCaps(`❌ You don't have any ${ICONS.shinyRedeem} Shiny Redeems!`));
    }
    const query = args.join(' ').trim();
    if (!query) {
      return message.reply(toSmallCaps(`❌ Usage: \`${prefix}${command} <Shiny NPC name>\``));
    }
    const template = SHINY_NPCS.find(n =>
      n.name.toLowerCase() === query.toLowerCase() || n.name.toLowerCase().includes(query.toLowerCase())
    );
    if (!template) {
      return message.reply(toSmallCaps(`❌ Shiny NPC not found matching "${query}".`));
    }

    user.shinyRedeems -= 1;
    await saveUsers();
    await spawnNpcInChannel(message.channel, prefix, template);
    return true;
  }

  return false;
}

module.exports = {
  commands: NPC_COMMANDS,
  execute,
  handleNpcInteraction,
  processNpcChatOrBotActivity,
  spawnNpcInChannel,
  findNpcTemplateByName,
  ensureNpcUserFields,
  ALL_NPCS,
  NORMAL_NPCS,
  SHINY_NPCS,
  ICONS
};