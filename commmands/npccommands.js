const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const crypto = require('crypto');

const { db, saveUsers } = require('../core/database');
const { toSmallCaps, ensureUser } = require('../core/helpers');

const ICONS = {
  rebirth: '<a:Rebirth:1575788405076267079>',
  ascend: '<a:Ascend:1575788457199145070>',
  shiny: '<a:Shinyy:1575788508608462919>',
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
  'npcinv',
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
    return {
      ok: false,
      reason: `Your NPC has already reached the maximum **Ascend ${MAX_ASCEND}** and cannot rebirth anymore!`
    };
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

function reindexNpcIds(user) {
  if (!user || !Array.isArray(user.npcs)) return;
  user.npcs.forEach((npc, idx) => {
    npc.slotId = idx + 1;
  });
}

function ensureNpcUserFields(user) {
  if (!user || typeof user !== 'object') return;
  if (!Array.isArray(user.npcs)) user.npcs = [];
  reindexNpcIds(user);
  if (typeof user.selectedNpcId !== 'string') user.selectedNpcId = null;
  if (typeof user.redeems !== 'number' || Number.isNaN(user.redeems)) user.redeems = 0;
  if (typeof user.shinyRedeems !== 'number' || Number.isNaN(user.shinyRedeems)) user.shinyRedeems = 0;
}

function getNpcArtworkUrl(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (entity.imageUrl && typeof entity.imageUrl === 'string' && entity.imageUrl.trim()) {
    return entity.imageUrl.trim();
  }
  const match = String(entity.icon || '').match(/^<(a)?:\w+:(\d+)>$/);
  if (!match) return null;
  const ext = match[1] ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${match[2]}.${ext}?size=512`;
}

function appendLargeNpcImageToContainer(container, entity, description = null) {
  const url = getNpcArtworkUrl(entity);
  if (!url) return;
  if (typeof MediaGalleryBuilder === 'function' && typeof MediaGalleryItemBuilder === 'function') {
    const item = new MediaGalleryItemBuilder().setURL(url);
    if (description && typeof item.setDescription === 'function') {
      item.setDescription(String(description).slice(0, 1024));
    }
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item));
  }
}

function createNpcInstance(template, level = 1, nowMs = Date.now(), slotId = 1) {
  const rolled = rollTierAndBaseStats();
  const isShiny = Boolean(template.shiny || template.isShiny);
  return {
    slotId: Number(slotId || 1),
    uid: crypto.randomBytes(8).toString('hex'),
    npcId: template.id || template.npcId,
    name: template.name,
    icon: template.icon,
    imageUrl: template.imageUrl || null,
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

function addNpcToUser(user, template, level = 1, nowMs = Date.now()) {
  ensureNpcUserFields(user);
  const nextSlot = user.npcs.length + 1;
  const newNpc = createNpcInstance(template, level, nowMs, nextSlot);
  user.npcs.push(newNpc);
  reindexNpcIds(user);
  if (!user.selectedNpcId) {
    user.selectedNpcId = newNpc.uid;
  }
  return newNpc;
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
    toSmallCaps('Name: ') + `**${displayName}**${shinyBadge}\n` +
    toSmallCaps('Tier: ') + `**${npc.tier}**\n` +
    toSmallCaps('Level: ') + `**${npc.level}**\n` +
    `${starsLine}\n\n` +
    `❤️ ` + toSmallCaps('HP: ') + `**${stats.hp.toLocaleString()}**\n` +
    `⚔️ ` + toSmallCaps('Atk: ') + `**${stats.atk.toLocaleString()}**\n` +
    `🛡️ ` + toSmallCaps('Def: ') + `**${stats.def.toLocaleString()}**\n` +
    `⚡ ` + toSmallCaps('Spd: ') + `**${stats.spd.toLocaleString()}**\n\n` +
    toSmallCaps('ID : ') + `\`${npc.slotId}\` ` +
    toSmallCaps('First Obtain : ') + `**${formatObtainedDate(npc.obtainedAt)}**` +
    readyNotice;

  const container = new ContainerBuilder()
    .setAccentColor(npc.isShiny ? 0xf1c40f : 0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  appendLargeNpcImageToContainer(container, npc, displayName);

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

function buildNpcInventoryEmbedAndRow(user, page = 1, prefix = '+') {
  ensureNpcUserFields(user);
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(user.npcs.length / perPage));
  const safePage = Math.max(1, Math.min(totalPages, Number(page || 1)));
  const startIdx = (safePage - 1) * perPage;
  const slice = user.npcs.slice(startIdx, startIdx + perPage);

  const lines = slice.map(npc => {
    const isActive = npc.uid === user.selectedNpcId ? ' ✅' : '';
    const fav = npc.favorite ? ' ★' : '';
    const shiny = npc.isShiny ? ` ${ICONS.shiny}` : '';
    const nick = npc.nickname ? ` *(${npc.nickname})*` : '';
    return `**\`${npc.slotId}\`** ${npc.icon} **${npc.name}**${nick}${shiny}${fav}${isActive} — ` +
      toSmallCaps(`Lv.${npc.level} | Tier ${npc.tier}`);
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎒 ` + toSmallCaps('NPC Inventory'))
    .setDescription(
      lines.join('\n') +
      `\n\n` +
      toSmallCaps(`Use \`${prefix}cnpc <id>\` to select an NPC (e.g. \`${prefix}cnpc 1\`)`)
    )
    .setFooter({ text: `Page ${safePage}/${totalPages} • Total NPCs: ${user.npcs.length}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`npcinv_prev_${safePage}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`npcinv_next_${safePage}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages)
  );

  return { embed, row };
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
    imageUrl: template.imageUrl || null,
    isShiny: Boolean(template.shiny || template.isShiny),
    spawnedAt: Date.now()
  };

  setChannelSpawnState(channel.id, spawnData);
  await saveUsers();

  const content =
    `# ` + toSmallCaps('A NPC Has Appeared') + `\n\n` +
    toSmallCaps('Type ') + `\`${prefix}cget ${template.name}\` ` + toSmallCaps('to obtain this npc');

  const container = new ContainerBuilder()
    .setAccentColor(spawnData.isShiny ? 0xf39c12 : 0x2ecc71)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  appendLargeNpcImageToContainer(container, spawnData, template.name);

  return channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

function findNpcTemplateByName(query, pool = ALL_NPCS) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  return (
    pool.find(n => n.name.toLowerCase() === q || n.id.toLowerCase() === q) ||
    pool.find(n => n.name.toLowerCase().includes(q)) ||
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
  let requiredXp = 100 + (npc.level - 1) * 25;
  let leveledUp = false;

  while (npc.xp >= requiredXp && npc.level < MAX_LEVEL) {
    npc.xp -= requiredXp;
    npc.level += 1;
    leveledUp = true;
    requiredXp = 100 + (npc.level - 1) * 25;
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

  const shinyBadge = npc.isShiny ? ` ${ICONS.shiny}` : '';
  const levelMsg =
    `🎉 ` + toSmallCaps('Congratulations Your ') + `**${npc.name}**${shinyBadge} ` +
    toSmallCaps('is leveling up to ') + `**${npc.level}**` +
    readyText;

  const container = new ContainerBuilder()
    .setAccentColor(0x9b59b6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(levelMsg));

  appendLargeNpcImageToContainer(container, npc, `${npc.name} Lv.${npc.level}`);

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  }).catch(() => {});

  return true;
}

// Handle button & modal interactions for +cnpc and +npcinv
async function handleNpcInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id.startsWith('npcinv_prev_') || id.startsWith('npcinv_next_')) {
      const isNext = id.startsWith('npcinv_next_');
      const currentPage = Number.parseInt(id.replace(/^npcinv_(prev|next)_/, ''), 10) || 1;
      ensureUser(interaction.user.id);
      const user = db.users[interaction.user.id];
      ensureNpcUserFields(user);

      const guildPrefix = db.guildPrefixes?.[interaction.guildId] || db.config?.guildPrefixes?.[interaction.guildId] || '+';
      const { embed, row } = buildNpcInventoryEmbedAndRow(user, isNext ? currentPage + 1 : currentPage - 1, guildPrefix);
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
      return true;
    }

    if (id.startsWith('cnpc_fav_')) {
      const uid = id.replace('cnpc_fav_', '');
      ensureUser(interaction.user.id);
      const user = db.users[interaction.user.id];
      ensureNpcUserFields(user);

      const npc = user.npcs.find(n => n.uid === uid);
      if (!npc) {
        await interaction.reply({
          content: toSmallCaps('❌ NPC not found in your collection.'),
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
      }

      npc.favorite = !npc.favorite;
      await saveUsers();

      const guildPrefix = db.guildPrefixes?.[interaction.guildId] || db.config?.guildPrefixes?.[interaction.guildId] || '+';
      const { container, row } = buildCnpcView(npc, guildPrefix);
      await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return true;
    }

    if (id.startsWith('cnpc_nick_')) {
      const uid = id.replace('cnpc_nick_', '');
      ensureUser(interaction.user.id);
      const user = db.users[interaction.user.id];
      ensureNpcUserFields(user);

      const npc = user.npcs.find(n => n.uid === uid);
      if (!npc) {
        await interaction.reply({
          content: toSmallCaps('❌ NPC not found in your collection.'),
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
      }

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
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('cnpc_nick_modal_')) {
    const uid = interaction.customId.replace('cnpc_nick_modal_', '');
    ensureUser(interaction.user.id);
    const user = db.users[interaction.user.id];
    ensureNpcUserFields(user);

    const npc = user.npcs.find(n => n.uid === uid);
    if (!npc) {
      await interaction.reply({
        content: toSmallCaps('❌ NPC not found.'),
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
      return true;
    }

    const rawNick = interaction.fields.getTextInputValue('npc_nickname_input').trim();
    npc.nickname = rawNick.length > 0 ? rawNick : null;
    await saveUsers();

    const guildPrefix = db.guildPrefixes?.[interaction.guildId] || db.config?.guildPrefixes?.[interaction.guildId] || '+';
    const { container, row } = buildCnpcView(npc, guildPrefix);

    if (interaction.isFromMessage()) {
      await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else {
      await interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
    return true;
  }

  return false;
}

async function execute({ command, args, message, userId, currentPrefix, user }) {
  const normalizedCmd = String(command || '').toLowerCase();
  if (!NPC_COMMANDS.includes(normalizedCmd)) return false;

  const uid = userId || message.author.id;
  ensureUser(uid);
  const targetUser = user || db.users[uid];
  ensureNpcUserFields(targetUser);
  const prefix = currentPrefix || '+';

  // +npcinv [page] — list all owned NPCs with IDs 1, 2, 3...
  if (normalizedCmd === 'npcinv') {
    if (targetUser.npcs.length === 0) {
      await message.reply(
        toSmallCaps(`❌ Your NPC inventory is empty! Catch a spawned NPC using \`${prefix}cget <Npcname>\`.`)
      );
      return true;
    }

    const pageArg = Number.parseInt(args?.[0], 10) || 1;
    const { embed, row } = buildNpcInventoryEmbedAndRow(targetUser, pageArg, prefix);
    await message.reply({ embeds: [embed], components: [row] });
    return true;
  }

  // +cnpc [id] — view current NPC or select by numeric ID (1, 2, 3...)
  if (normalizedCmd === 'cnpc') {
    if (args.length > 0) {
      const targetIndex = Number.parseInt(args[0], 10);
      const bySlot = targetUser.npcs.find(n => Number(n.slotId) === targetIndex);
      const byUid = targetUser.npcs.find(n => n.uid === args[0]);
      if (bySlot) {
        targetUser.selectedNpcId = bySlot.uid;
      } else if (byUid) {
        targetUser.selectedNpcId = byUid.uid;
      } else if (!Number.isNaN(targetIndex) && targetIndex >= 1 && targetIndex <= targetUser.npcs.length) {
        targetUser.selectedNpcId = targetUser.npcs[targetIndex - 1].uid;
      }
    }

    const activeNpc = getActiveNpc(targetUser);
    if (!activeNpc) {
      await message.reply(
        toSmallCaps(`❌ You don't have any NPCs yet! Catch a spawned NPC using \`${prefix}cget <Npcname>\`.`)
      );
      return true;
    }

    await saveUsers();
    const { container, row } = buildCnpcView(activeNpc, prefix);
    await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  // +cget <Npcname> — catch appeared NPC
  if (normalizedCmd === 'cget') {
    const spawn = getChannelSpawnState(message.channel.id);
    if (!spawn) {
      await message.reply(toSmallCaps('❌ There is no NPC spawned in this channel right now.'));
      return true;
    }

    const guess = args.join(' ').trim().toLowerCase();
    if (!guess) {
      await message.reply(toSmallCaps(`❌ Usage: \`${prefix}cget <Npcname>\``));
      return true;
    }

    const targetNameLower = String(spawn.name || '').toLowerCase();
    if (guess !== targetNameLower && !targetNameLower.includes(guess)) {
      await message.reply(toSmallCaps(`❌ Wrong NPC name! Try again with \`${prefix}cget <Npcname>\`.`));
      return true;
    }

    const template = ALL_NPCS.find(n => n.id === spawn.npcId) || spawn;
    const catchLevel = rollCatchLevel1to90();
    const newNpc = addNpcToUser(targetUser, template, catchLevel, Date.now());

    clearChannelSpawnState(message.channel.id);
    await saveUsers();

    const username = message.member?.displayName || message.author.username;
    const shinyTag = newNpc.isShiny ? ` ${ICONS.shiny}` : '';

    const catchContainer = new ContainerBuilder()
      .setAccentColor(newNpc.isShiny ? 0xf1c40f : 0x2ecc71)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `🎉 ` +
          toSmallCaps(`Congratulations ${username}, you obtained `) +
          `**Level ${newNpc.level} ${newNpc.name}**${shinyTag} ` +
          toSmallCaps(`(Tier: **${newNpc.tier}** • ID: **${newNpc.slotId}**)`)
        )
      );

    appendLargeNpcImageToContainer(catchContainer, newNpc, newNpc.name);

    await message.reply({ components: [catchContainer], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  // +nrebirth & +nascend — Rebirth / Ascend active Level 100 NPC
  if (normalizedCmd === 'nrebirth' || normalizedCmd === 'nascend') {
    const activeNpc = getActiveNpc(targetUser);
    if (!activeNpc) {
      await message.reply(toSmallCaps('❌ You do not have an active NPC!'));
      return true;
    }

    if (activeNpc.level < MAX_LEVEL) {
      await message.reply(
        toSmallCaps(`❌ Your **${activeNpc.name}** must reach **Level ${MAX_LEVEL}** before using \`${prefix}${normalizedCmd}\`! (Current: Level ${activeNpc.level})`)
      );
      return true;
    }

    if (normalizedCmd === 'nascend' && activeNpc.rebirths < MAX_REBIRTH) {
      await message.reply(
        toSmallCaps(`❌ Your **${activeNpc.name}** needs **${MAX_REBIRTH} Rebirths** before ascending! (Current: ${activeNpc.rebirths}/${MAX_REBIRTH})`)
      );
      return true;
    }

    const prevAscends = Number(activeNpc.ascends || 0);
    const result = applyRebirthOrAscendLogic(activeNpc);
    if (!result.ok) {
      await message.reply(toSmallCaps(`❌ ${result.reason}`));
      return true;
    }

    await saveUsers();

    const promotedToAscend = activeNpc.ascends > prevAscends;
    const shinyBadge = activeNpc.isShiny ? ` ${ICONS.shiny}` : '';
    const actionLabel = promotedToAscend
      ? `${ICONS.ascend} **ASCENDED TO ASCEND ${activeNpc.ascends}!**`
      : `${ICONS.rebirth} **REBIRTHED TO REBIRTH ${activeNpc.rebirths}/${MAX_REBIRTH}!**`;

    const progressContainer = new ContainerBuilder()
      .setAccentColor(promotedToAscend ? 0xf1c40f : 0x9b59b6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${actionLabel}\n\n` +
          `**${activeNpc.name}**${shinyBadge} ` +
          toSmallCaps('has reset to Level 1 with permanent stat boosts!') +
          `\n${buildRebirthAscendStarsLine(activeNpc)}`
        )
      );

    appendLargeNpcImageToContainer(progressContainer, activeNpc, activeNpc.name);

    await message.reply({ components: [progressContainer], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  // +redeems / +redeem — Check Redeem & Shiny Redeem balance
  if (normalizedCmd === 'redeems' || normalizedCmd === 'redeem') {
    const redeemContainer = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎟️ ` + toSmallCaps('Your NPC Redeems') + `\n\n` +
          `${ICONS.redeem} ` + toSmallCaps('Normal Redeems: ') + `**${targetUser.redeems.toLocaleString()}**\n` +
          `${ICONS.shinyRedeem} ` + toSmallCaps('Shiny Redeems: ') + `**${targetUser.shinyRedeems.toLocaleString()}**\n\n` +
          toSmallCaps(`Use \`${prefix}nsredeem <Npcname>\` or \`${prefix}snsredeem <Npcname>\` to redeem an NPC!`)
        )
      );

    await message.reply({ components: [redeemContainer], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  // +nsredeem / +nsr <Npcname> — Redeem a Normal NPC
  if (normalizedCmd === 'nsredeem' || normalizedCmd === 'nsr') {
    if (targetUser.redeems < 1) {
      await message.reply(toSmallCaps(`❌ You don't have any Normal Redeems ${ICONS.redeem}!`));
      return true;
    }

    const query = args.join(' ').trim();
    if (!query) {
      await message.reply(toSmallCaps(`❌ Usage: \`${prefix}nsredeem <Npcname>\``));
      return true;
    }

    const template = findNpcTemplateByName(query, NORMAL_NPCS);
    if (!template) {
      await message.reply(toSmallCaps(`❌ Normal NPC **${query}** not found!`));
      return true;
    }

    targetUser.redeems -= 1;
    const newNpc = addNpcToUser(targetUser, template, 1, Date.now());
    await saveUsers();

    const container = new ContainerBuilder()
      .setAccentColor(0x2ecc71)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${ICONS.redeem} ` +
          toSmallCaps('Successfully redeemed ') +
          `**${newNpc.name}** ` +
          toSmallCaps(`(Tier: **${newNpc.tier}**, Level 1 • ID: **${newNpc.slotId}**)!`)
        )
      );

    appendLargeNpcImageToContainer(container, newNpc, newNpc.name);

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  // +snsredeem / +snsr <Npcname> — Redeem a Shiny NPC
  if (normalizedCmd === 'snsredeem' || normalizedCmd === 'snsr') {
    if (targetUser.shinyRedeems < 1) {
      await message.reply(toSmallCaps(`❌ You don't have any Shiny Redeems ${ICONS.shinyRedeem}!`));
      return true;
    }

    const query = args.join(' ').trim();
    if (!query) {
      await message.reply(toSmallCaps(`❌ Usage: \`${prefix}snsredeem <Npcname>\``));
      return true;
    }

    const template = findNpcTemplateByName(query, SHINY_NPCS);
    if (!template) {
      await message.reply(toSmallCaps(`❌ Shiny NPC **${query}** not found! (Try e.g. \`Shiny Naruto\`)`));
      return true;
    }

    targetUser.shinyRedeems -= 1;
    const newNpc = addNpcToUser(targetUser, template, 1, Date.now());
    await saveUsers();

    const container = new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${ICONS.shinyRedeem} ` +
          toSmallCaps('Successfully redeemed ') +
          `**${newNpc.name}** ${ICONS.shiny} ` +
          toSmallCaps(`(Tier: **${newNpc.tier}**, Level 1 • ID: **${newNpc.slotId}**)!`)
        )
      );

    appendLargeNpcImageToContainer(container, newNpc, newNpc.name);

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  return false;
}

module.exports = {
  commands: NPC_COMMANDS,
  NORMAL_NPCS,
  SHINY_NPCS,
  ALL_NPCS,
  NPC_TIERS,
  ICONS,
  ensureNpcUserFields,
  reindexNpcIds,
  createNpcInstance,
  addNpcToUser,
  computeNpcStats,
  getActiveNpc,
  spawnNpcInChannel,
  findNpcTemplateByName,
  processNpcChatOrBotActivity,
  handleNpcInteraction,
  execute
};