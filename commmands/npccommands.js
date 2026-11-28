const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, EmbedBuilder, MessageFlags
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
  { id: 'naruto_uzumaki', name: 'Naruto Uzumaki', icon: '<a:Naruto:1575791239821795418>', spawnWeight: 15, shiny: false },
  { id: 'inosuke_hashibara', name: 'Inosuke Hashibara', icon: '<a:Inosukee:1575791445661585498>', spawnWeight: 15, shiny: false },
  { id: 'tanjiro_kamado', name: 'Tanjiro Kamado', icon: '<a:Tanjiro:1575791497591128114>', spawnWeight: 15, shiny: false },
  { id: 'zenitsu_agatsuma', name: 'Zenitsu Agatsuma', icon: '<a:Zenitsu:1575791363960864838>', spawnWeight: 15, shiny: false },
  { id: 'madara_uchiha', name: 'Madara Uchiha', icon: '<a:Madara:1575791099648282644>', spawnWeight: 9, shiny: false },
  { id: 'hashirama_senju', name: 'Hashirama Senju', icon: '<a:Hashirama:1575791197983871167>', spawnWeight: 9, shiny: false },
  { id: 'yoriichi_rin', name: 'Yoriichi Rin', icon: '<a:Yoriichi:1575791274785644604>', spawnWeight: 9, shiny: false },
  { id: 'luffy', name: 'Luffy', icon: '<a:Luffy:1575791580680421527>', spawnWeight: 9, shiny: false },
  { id: 'saitama_bald', name: 'Saitama Bald', icon: '<a:Saitama:1575791317458362480>', spawnWeight: 1, shiny: false },
  { id: 'gojo_saturo', name: 'Gojo Saturo', icon: '<a:Gojo:1575791556819034192>', spawnWeight: 1, shiny: false },
  { id: 'sukuna', name: 'Sukuna', icon: '<a:Sukuna:1575791530239856720>', spawnWeight: 1, shiny: false },
  { id: 'shadow_megumi', name: 'Shadow Megumi', icon: '<a:MegumiY:1575793666759336047>', spawnWeight: 0.6, shiny: false },
  { id: '4th_hokage_minato', name: '4th Hokage Minato', icon: '<a:MasterMinato:1575793610669170718>', spawnWeight: 0.6, shiny: false },
  { id: 'swordman_atomic', name: 'Swordman Atomic', icon: '<a:AtomicX:1575793456939405384>', spawnWeight: 0.6, shiny: false },
  { id: 'kagami_envy', name: 'Kagami Envy', icon: '<a:KagamiEnvy:1575793794794913842>', spawnWeight: 0.6, shiny: false }
];

const SHINY_NPCS = [
  { id: 'shiny_zenitsu', name: 'Shiny Zenitsu', icon: '<a:ShinyZenitsu:1575792651720990782>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_naruto', name: 'Shiny Naruto', icon: '<a:Shinynaruto:1575793106975072316>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_tanjiro', name: 'Shiny Tanjiro', icon: '<a:ShinyTanjiro:1575792777353236480>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_inosukee', name: 'Shiny Inosukee', icon: '<a:ShinyInosukee:1575793744953868328>', spawnWeight: 0.65, shiny: true },
  { id: 'shiny_luffy', name: 'Shiny Luffy', icon: '<a:ShinyLuffy:1575793831729963148>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_madara', name: 'Shiny Madara', icon: '<a:Shinymadara:1575793063681458306>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_hashirama', name: 'Shiny Hashirama', icon: '<a:ShinyHashirama:1575793566268260392>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_yoriichi', name: 'Shiny Yoriichi', icon: '<a:ShinyYoriichi:1575792863982391336>', spawnWeight: 0.47, shiny: true },
  { id: 'shiny_saitama', name: 'Shiny Saitama', icon: '<a:Shinysaitama:1575793373900570786>', spawnWeight: 0.25, shiny: true },
  { id: 'shiny_sukuna', name: 'Shiny Sukuna', icon: '<a:Shinysukuna:1575793494839132180>', spawnWeight: 0.25, shiny: true },
  { id: 'shiny_gojo', name: 'Shiny Gojo', icon: '<a:ShinyGojo:1575793528183853096>', spawnWeight: 0.25, shiny: true }
];

const ALL_NPCS = [...NORMAL_NPCS, ...SHINY_NPCS];
const NPC_COMMANDS = ['cnpc', 'npcinv', 'cget', 'nrebirth', 'nascend', 'nsredeem', 'nsr', 'snsredeem', 'snsr', 'redeems', 'redeem'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function weightedPick(items, key = 'weight') {
  const total = items.reduce((s, item) => s + Number(item[key] || 0), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= Number(item[key] || 0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function rollCatchLevel1to90() {
  const pool = [];
  for (let lvl = 1; lvl <= 90; lvl++) pool.push({ lvl, weight: lvl >= 60 ? 1 : 6 });
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
  const levelScale = 1 + (level - 1) * 0.02;
  const shinyMults = npc.isShiny
    ? { hp: 1.4, atk: 1.3, def: 1.25, spd: 1.15 }
    : { hp: 1, atk: 1, def: 1, spd: 1 };
  const mult = 1 + rebirths * 0.3 + ascends * 0.7;

  return {
    hp: Math.round(Number(npc.baseHp || 50) * levelScale * shinyMults.hp * mult),
    atk: Math.round(Number(npc.baseAtk || 5) * levelScale * shinyMults.atk * mult),
    def: Math.round(Number(npc.baseDef || 5) * levelScale * shinyMults.def * mult),
    spd: Math.round(Number(npc.baseSpd || 5) * levelScale * shinyMults.spd * mult)
  };
}

function applyRebirthOrAscendLogic(npc) {
  npc.rebirths = Math.max(0, Number(npc.rebirths || 0));
  npc.ascends = Math.max(0, Number(npc.ascends || 0));
  npc.xp = 0;

  if (npc.ascends >= MAX_ASCEND) {
    return { ok: false, reason: `Your NPC has already reached the maximum **Ascend ${MAX_ASCEND}** and cannot rebirth anymore!` };
  }

  npc.rebirths += 1;
  if (npc.rebirths >= MAX_REBIRTH) {
    npc.ascends = Math.min(MAX_ASCEND, npc.ascends + 1);
    npc.rebirths = 0;
  }

  npc.level = 1;
  return { ok: true, npc };
}

function reindexNpcIds(user) {
  if (Array.isArray(user?.npcs)) user.npcs.forEach((npc, i) => { npc.slotId = i + 1; });
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
  if (typeof entity.imageUrl === 'string' && entity.imageUrl.trim()) return entity.imageUrl.trim();
  const m = String(entity.icon || '').match(/^<(a)?:\w+:(\d+)>$/);
  return m ? `https://cdn.discordapp.com/emojis/${m[2]}.${m[1] ? 'gif' : 'png'}?size=512` : null;
}

function appendLargeNpcImageToContainer(container, entity, description = null) {
  const url = getNpcArtworkUrl(entity);
  if (!url || typeof MediaGalleryBuilder !== 'function' || typeof MediaGalleryItemBuilder !== 'function') return;
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (description && typeof item.setDescription === 'function') item.setDescription(String(description).slice(0, 1024));
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item));
}

function createNpcInstance(template, level = 1, nowMs = Date.now(), slotId = 1) {
  const rolled = rollTierAndBaseStats();
  return {
    slotId: Number(slotId || 1),
    uid: crypto.randomBytes(8).toString('hex'),
    npcId: template.id || template.npcId,
    name: template.name,
    icon: template.icon,
    imageUrl: template.imageUrl || null,
    isShiny: Boolean(template.shiny || template.isShiny),
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
  const newNpc = createNpcInstance(template, level, nowMs, user.npcs.length + 1);
  user.npcs.push(newNpc);
  reindexNpcIds(user);
  if (!user.selectedNpcId) user.selectedNpcId = newNpc.uid;
  return newNpc;
}

function formatObtainedDate(ms) {
  return new Date(Number(ms || Date.now())).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function buildRebirthAscendStarsLine(npc) {
  const r = Math.max(0, Math.min(MAX_REBIRTH, Number(npc.rebirths || 0)));
  const a = Math.max(0, Math.min(MAX_ASCEND, Number(npc.ascends || 0)));
  const parts = [...Array(r).fill(ICONS.rebirth), ...Array(a).fill(ICONS.ascend)];
  return parts.length ? parts.join(' ') : '—';
}

function getActiveNpc(user) {
  ensureNpcUserFields(user);
  if (!user.npcs.length) return null;
  const found = user.selectedNpcId && user.npcs.find(n => n.uid === user.selectedNpcId);
  if (found) return found;
  user.selectedNpcId = user.npcs[0].uid;
  return user.npcs[0];
}

function buildCnpcView(npc, currentPrefix) {
  const stats = computeNpcStats(npc);
  const displayName = npc.nickname ? `${npc.name} (${npc.nickname})` : npc.name;
  const shinyBadge = npc.isShiny ? ` ${ICONS.shiny}` : '';

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
    `${buildRebirthAscendStarsLine(npc)}\n\n` +
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
    new ButtonBuilder().setCustomId(`cnpc_nick_${npc.uid}`).setLabel(toSmallCaps('Set Nickname')).setStyle(ButtonStyle.Secondary),
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
  const slice = user.npcs.slice((safePage - 1) * perPage, safePage * perPage);

  const lines = slice.map(npc => {
    const flags = [
      npc.nickname ? ` *(${npc.nickname})*` : '',
      npc.isShiny ? ` ${ICONS.shiny}` : '',
      npc.favorite ? ' ★' : '',
      npc.uid === user.selectedNpcId ? ' ✅' : ''
    ].join('');
    return `**\`${npc.slotId}\`** ${npc.icon} **${npc.name}**${flags} — ` + toSmallCaps(`Lv.${npc.level} | Tier ${npc.tier}`);
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎒 ` + toSmallCaps('NPC Inventory'))
    .setDescription(`${lines.join('\n')}\n\n` + toSmallCaps(`Use \`${prefix}cnpc <id>\` to select an NPC (e.g. \`${prefix}cnpc 1\`)`))
    .setFooter({ text: `Page ${safePage}/${totalPages} • Total NPCs: ${user.npcs.length}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`npcinv_prev_${safePage}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 1),
    new ButtonBuilder().setCustomId(`npcinv_next_${safePage}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages)
  );

  return { embed, row };
}

function getNpcSpawnsMap() {
  if (!db.config) db.config = {};
  if (!db.config.npcSpawns || typeof db.config.npcSpawns !== 'object') db.config.npcSpawns = {};
  return db.config.npcSpawns;
}

const getChannelSpawnState = (id) => getNpcSpawnsMap()[id] || null;
const setChannelSpawnState = (id, obj) => { getNpcSpawnsMap()[id] = obj; };
const clearChannelSpawnState = (id) => { delete getNpcSpawnsMap()[id]; };

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
  return channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

function findNpcTemplateByName(query, pool = ALL_NPCS) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  return pool.find(n => n.name.toLowerCase() === q || n.id.toLowerCase() === q) || pool.find(n => n.name.toLowerCase().includes(q)) || null;
}

function getActiveNpcXpMultiplier() {
  const mult = Number(db.config?.globalNpcXpMultiplier || 1);
  if (!Number.isFinite(mult) || mult <= 0) return 1;
  const expires = Number(db.config?.npcXpEventExpires || 0);
  if (expires > 0 && Date.now() > expires) {
    db.config.globalNpcXpMultiplier = 1;
    db.config.npcXpEventExpires = 0;
    return 1;
  }
  return mult;
}

async function processNpcChatOrBotActivity(message, user, currentPrefix = '+') {
  if (!message || !user) return false;
  ensureNpcUserFields(user);
  const npc = getActiveNpc(user);
  if (!npc) return false;

  if (npc.level >= MAX_LEVEL) {
    npc.xp = 0;
    return false;
  }

  const baseGain = message.author?.bot ? randInt(15, 30) : randInt(20, 40);
  const xpGain = Math.max(1, Math.round(baseGain * getActiveNpcXpMultiplier()));
  npc.xp = Number(npc.xp || 0) + xpGain;

  let leveledUp = false;
  while (npc.xp >= 100 + (npc.level - 1) * 25 && npc.level < MAX_LEVEL) {
    npc.xp -= 100 + (npc.level - 1) * 25;
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

  const shinyBadge = npc.isShiny ? ` ${ICONS.shiny}` : '';
  const container = new ContainerBuilder()
    .setAccentColor(0x9b59b6)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🎉 ` + toSmallCaps('Congratulations Your ') + `**${npc.name}**${shinyBadge} ` +
        toSmallCaps('is leveling up to ') + `**${npc.level}**` + readyText
      )
    );

  appendLargeNpcImageToContainer(container, npc, `${npc.name} Lv.${npc.level}`);
  await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  return true;
}

async function handleNpcInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
  const guildPrefix = db.guildPrefixes?.[interaction.guildId] || db.config?.guildPrefixes?.[interaction.guildId] || '+';

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id.startsWith('npcinv_prev_') || id.startsWith('npcinv_next_')) {
      const page = Number.parseInt(id.replace(/^npcinv_(prev|next)_/, ''), 10) || 1;
      ensureUser(interaction.user.id);
      const user = db.users[interaction.user.id];
      const { embed, row } = buildNpcInventoryEmbedAndRow(user, id.startsWith('npcinv_next_') ? page + 1 : page - 1, guildPrefix);
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
      return true;
    }

    if (id.startsWith('cnpc_fav_')) {
      const uid = id.replace('cnpc_fav_', '');
      ensureUser(interaction.user.id);
      const user = db.users[interaction.user.id];
      const npc = user.npcs.find(n => n.uid === uid);
      if (!npc) {
        await interaction.reply({ content: toSmallCaps('❌ NPC not found in your collection.'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      npc.favorite = !npc.favorite;
      await saveUsers();
      const { container, row } = buildCnpcView(npc, guildPrefix);
      await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return true;
    }

    if (id.startsWith('cnpc_nick_')) {
      const uid = id.replace('cnpc_nick_', '');
      const modal = new ModalBuilder()
        .setCustomId(`cnpc_nick_modal_${uid}`)
        .setTitle('Set NPC Nickname')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('npc_nickname_input')
              .setLabel('Enter a new nickname (leave blank to clear)')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(32)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('cnpc_nick_modal_')) {
    const uid = interaction.customId.replace('cnpc_nick_modal_', '');
    ensureUser(interaction.user.id);
    const user = db.users[interaction.user.id];
    const npc = user.npcs.find(n => n.uid === uid);
    if (!npc) {
      await interaction.reply({ content: toSmallCaps('❌ NPC not found.'), flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    const rawNick = interaction.fields.getTextInputValue('npc_nickname_input').trim();
    npc.nickname = rawNick || null;
    await saveUsers();

    const { container, row } = buildCnpcView(npc, guildPrefix);
    const payload = { components: [container, row], flags: MessageFlags.IsComponentsV2 };
    if (interaction.isFromMessage()) await interaction.update(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
    return true;
  }

  return false;
}

async function sendNpcCard(message, npc, text, accentColor) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  appendLargeNpcImageToContainer(container, npc, npc.name);
  await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function execute({ command, args, message, userId, currentPrefix, user }) {
  const cmd = String(command || '').toLowerCase();
  if (!NPC_COMMANDS.includes(cmd)) return false;

  const uid = userId || message.author.id;
  ensureUser(uid);
  const targetUser = user || db.users[uid];
  ensureNpcUserFields(targetUser);
  const prefix = currentPrefix || '+';

  if (cmd === 'npcinv') {
    if (!targetUser.npcs.length) {
      await message.reply(toSmallCaps(`❌ Your NPC inventory is empty! Catch a spawned NPC using \`${prefix}cget <Npcname>\`.`));
      return true;
    }
    const { embed, row } = buildNpcInventoryEmbedAndRow(targetUser, Number.parseInt(args?.[0], 10) || 1, prefix);
    await message.reply({ embeds: [embed], components: [row] });
    return true;
  }

  if (cmd === 'cnpc') {
    if (args.length > 0) {
      const idx = Number.parseInt(args[0], 10);
      const match =
        targetUser.npcs.find(n => Number(n.slotId) === idx) ||
        targetUser.npcs.find(n => n.uid === args[0]) ||
        (!Number.isNaN(idx) && idx >= 1 && idx <= targetUser.npcs.length ? targetUser.npcs[idx - 1] : null);
      if (match) targetUser.selectedNpcId = match.uid;
    }

    const activeNpc = getActiveNpc(targetUser);
    if (!activeNpc) {
      await message.reply(toSmallCaps(`❌ You don't have any NPCs yet! Catch a spawned NPC using \`${prefix}cget <Npcname>\`.`));
      return true;
    }

    await saveUsers();
    const { container, row } = buildCnpcView(activeNpc, prefix);
    await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  if (cmd === 'cget') {
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
    const newNpc = addNpcToUser(targetUser, template, rollCatchLevel1to90(), Date.now());
    clearChannelSpawnState(message.channel.id);
    await saveUsers();

    const username = message.member?.displayName || message.author.username;
    const shinyTag = newNpc.isShiny ? ` ${ICONS.shiny}` : '';
    await sendNpcCard(
      message,
      newNpc,
      `🎉 ` + toSmallCaps(`Congratulations ${username}, you obtained `) +
      `**Level ${newNpc.level} ${newNpc.name}**${shinyTag} ` +
      toSmallCaps(`(Tier: **${newNpc.tier}** • ID: **${newNpc.slotId}**)`)`,
      newNpc.isShiny ? 0xf1c40f : 0x2ecc71
    );
    return true;
  }

  if (cmd === 'nrebirth' || cmd === 'nascend') {
    const activeNpc = getActiveNpc(targetUser);
    if (!activeNpc) {
      await message.reply(toSmallCaps('❌ You do not have an active NPC!'));
      return true;
    }

    if (activeNpc.level < MAX_LEVEL) {
      await message.reply(
        toSmallCaps(`❌ Your **${activeNpc.name}** must reach **Level ${MAX_LEVEL}** before using \`${prefix}${cmd}\`! (Current: Level ${activeNpc.level})`)
      );
      return true;
    }

    if (cmd === 'nascend' && activeNpc.rebirths < MAX_REBIRTH) {
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
    const promoted = activeNpc.ascends > prevAscends;
    const shinyBadge = activeNpc.isShiny ? ` ${ICONS.shiny}` : '';
    const actionLabel = promoted
      ? `${ICONS.ascend} **ASCENDED TO ASCEND ${activeNpc.ascends}!**`
      : `${ICONS.rebirth} **REBIRTHED TO REBIRTH ${activeNpc.rebirths}/${MAX_REBIRTH}!**`;

    await sendNpcCard(
      message,
      activeNpc,
      `${actionLabel}\n\n**${activeNpc.name}**${shinyBadge} ` +
      toSmallCaps('has reset to Level 1 with permanent stat boosts!') +
      `\n${buildRebirthAscendStarsLine(activeNpc)}`,
      promoted ? 0xf1c40f : 0x9b59b6
    );
    return true;
  }

  if (cmd === 'redeems' || cmd === 'redeem') {
    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎟️ ` + toSmallCaps('Your NPC Redeems') + `\n\n` +
          `${ICONS.redeem} ` + toSmallCaps('Normal Redeems: ') + `**${targetUser.redeems.toLocaleString()}**\n` +
          `${ICONS.shinyRedeem} ` + toSmallCaps('Shiny Redeems: ') + `**${targetUser.shinyRedeems.toLocaleString()}**\n\n` +
          toSmallCaps(`Use \`${prefix}nsredeem <Npcname>\` or \`${prefix}snsredeem <Npcname>\` to redeem an NPC!`)
        )
      );
    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  if (cmd === 'nsredeem' || cmd === 'nsr' || cmd === 'snsredeem' || cmd === 'snsr') {
    const isShinyRedeem = cmd === 'snsredeem' || cmd === 'snsr';
    const balanceKey = isShinyRedeem ? 'shinyRedeems' : 'redeems';
    const icon = isShinyRedeem ? ICONS.shinyRedeem : ICONS.redeem;
    const label = isShinyRedeem ? 'Shiny Redeems' : 'Normal Redeems';
    const pool = isShinyRedeem ? SHINY_NPCS : NORMAL_NPCS;

    if (targetUser[balanceKey] < 1) {
      await message.reply(toSmallCaps(`❌ You don't have any ${label} ${icon}!`));
      return true;
    }

    const query = args.join(' ').trim();
    if (!query) {
      await message.reply(toSmallCaps(`❌ Usage: \`${prefix}${cmd} <Npcname>\``));
      return true;
    }

    const template = findNpcTemplateByName(query, pool);
    if (!template) {
      await message.reply(
        toSmallCaps(isShinyRedeem ? `❌ Shiny NPC **${query}** not found! (Try e.g. \`Shiny Naruto\`)` : `❌ Normal NPC **${query}** not found!`)
      );
      return true;
    }

    targetUser[balanceKey] -= 1;
    const newNpc = addNpcToUser(targetUser, template, 1, Date.now());
    await saveUsers();

    await sendNpcCard(
      message,
      newNpc,
      `${icon} ` + toSmallCaps('Successfully redeemed ') +
      `**${newNpc.name}**${isShinyRedeem ? ` ${ICONS.shiny}` : ''} ` +
      toSmallCaps(`(Tier: **${newNpc.tier}**, Level 1 • ID: **${newNpc.slotId}**)!`),
      isShinyRedeem ? 0xf1c40f : 0x2ecc71
    );
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
  MAX_LEVEL,
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