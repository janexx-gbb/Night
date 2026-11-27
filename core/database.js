const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { RARITY_RATES } = require('./constants');

const DATA_FILE_LOWER = path.join(__dirname, '..', 'data.json');
const DATA_FILE_UPPER = path.join(__dirname, '..', 'Data.json');
const DATA_FILE = fs.existsSync(DATA_FILE_LOWER) ? DATA_FILE_LOWER : DATA_FILE_UPPER;

const DEFAULT_STATS = {
  C:    { normal: { hp: 100, hpPer: 10, atk: 15, atkPer: 2, def: 10, defPer: 1 }, shiny: { hp: 150, hpPer: 15, atk: 24, atkPer: 3, def: 16, defPer: 2 } },
  U:    { normal: { hp: 140, hpPer: 14, atk: 22, atkPer: 3, def: 15, defPer: 2 }, shiny: { hp: 210, hpPer: 20, atk: 34, atkPer: 5, def: 24, defPer: 3 } },
  R:    { normal: { hp: 200, hpPer: 20, atk: 32, atkPer: 4, def: 22, defPer: 3 }, shiny: { hp: 300, hpPer: 30, atk: 48, atkPer: 6, def: 34, defPer: 4 } },
  SR:   { normal: { hp: 300, hpPer: 30, atk: 48, atkPer: 6, def: 32, defPer: 4 }, shiny: { hp: 450, hpPer: 45, atk: 72, atkPer: 9, def: 48, defPer: 6 } },
  SRR:  { normal: { hp: 460, hpPer: 45, atk: 72, atkPer: 9, def: 48, defPer: 6 }, shiny: { hp: 690, hpPer: 68, atk: 108, atkPer: 14, def: 72, defPer: 9 } },
  UTR:  { normal: { hp: 700, hpPer: 70, atk: 110, atkPer: 14, def: 75, defPer: 9 }, shiny: { hp: 1050, hpPer: 105, atk: 165, atkPer: 21, def: 112, defPer: 14 } },
  STR:  { normal: { hp: 1100, hpPer: 110, atk: 175, atkPer: 22, def: 115, defPer: 14 }, shiny: { hp: 1650, hpPer: 165, atk: 260, atkPer: 33, def: 172, defPer: 21 } },
  USRR: { normal: { hp: 1750, hpPer: 175, atk: 280, atkPer: 35, def: 185, defPer: 23 }, shiny: { hp: 2625, hpPer: 260, atk: 420, atkPer: 52, def: 278, defPer: 34 } },
  UGMR: { normal: { hp: 2800, hpPer: 280, atk: 450, atkPer: 56, def: 295, defPer: 36 }, shiny: { hp: 4200, hpPer: 420, atk: 675, atkPer: 84, def: 440, defPer: 55 } },
  SSRP: { normal: { hp: 3500, hpPer: 350, atk: 550, atkPer: 68, def: 360, defPer: 45 }, shiny: { hp: 5250, hpPer: 525, atk: 825, atkPer: 102, def: 540, defPer: 68 } }
};

const DEFAULT_CONFIG = {
  ownerId: '',
  mainGuildId: '',
  globalLuckMultiplier: 1.0,
  luckEventExpires: 0,
  globalXpMultiplier: 1.0,
  xpEventExpires: 0,
  seasonNumber: 1,
  seasonStartedAt: Date.now(),
  seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000),
  clanSeasonExpires: Date.now() + (7 * 24 * 60 * 60 * 1000),
  maintenanceMode: false,
  testers: [],
  featuresPublished: false,
  pendingUpdatesCount: 0,
  clanRewards: {
    1: { qty: 5, rarity: 'UTR', chibiEmoji: '<a:Putr:1573802703090614342>' },
    2: { qty: 3, rarity: 'SRR', chibiEmoji: '<:Psrr:1573802796040585358>' },
    3: { qty: 2, rarity: 'SR', chibiEmoji: '<:Psr:1573802765459918889>' }
  },
  eventActive: true,
  eventCrystals: {},
  eventShop: {
    cat_event: { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>', cost: 100 },
    doge_event: { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>', cost: 120 },
    troll_event: { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>', cost: 200 },
    frien_event: { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>', cost: 350 },
    seren_event: { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>', cost: 550 },
    hellkitty_event: { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>', cost: 650 },
    mezz_event: { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>', cost: 750 },
    ruru_event: { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>', cost: 1000 },
    zoprb_event: { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>', cost: 3000 },
    kazerb_event: { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>', cost: 4500 },
    georb_event: { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>', cost: 5000 }
  }
};

function normalizeGameData(raw) {
  const data = raw && typeof raw === 'object' ? { ...raw } : {};
  data.settings = {
    maxRollQuantity: 25,
    dropCooldownSeconds: 10,
    normalChibiExpBase: 100,
    normalChibiExpPerLevel: 50,
    shinyChibiExpBase: 200,
    shinyChibiExpPerLevel: 100,
    ...(data.settings && typeof data.settings === 'object' ? data.settings : {})
  };
  data.rarities = Array.isArray(data.rarities) && data.rarities.length > 0 ? data.rarities : [];
  data.rarityRates = Array.isArray(data.rarityRates) && data.rarityRates.length > 0
    ? data.rarityRates
    : RARITY_RATES;
  data.shopDice = Array.isArray(data.shopDice) ? data.shopDice : [];
  data.weatherEvents = Array.isArray(data.weatherEvents) ? data.weatherEvents : [];
  data.dropTable = Array.isArray(data.dropTable) && data.dropTable.length > 0
    ? data.dropTable
    : [
        { name: 'Small Dice Pouch', emoji: '🎲', dice: 3, weight: 60 },
        { name: 'Medium Dice Bag', emoji: '🎒', dice: 6, weight: 28 },
        { name: 'Golden Dice Chest', emoji: '🧰', dice: 12, weight: 10 },
        { name: 'Mythic Dice Jackpot', emoji: '💎', dice: 25, weight: 2 }
      ];
  data.chibis = Array.isArray(data.chibis)
    ? data.chibis.filter(c => c && typeof c === 'object' && String(c.name || '').toLowerCase() !== 'str_aegis')
    : [];
  data.eventChibis = Array.isArray(data.eventChibis)
    ? data.eventChibis.filter(c => c && typeof c === 'object')
    : [];

  const mergedStats = { ...DEFAULT_STATS };
  if (data.stats && typeof data.stats === 'object') {
    for (const [tierKey, tierVal] of Object.entries(data.stats)) {
      if (!tierVal || typeof tierVal !== 'object') continue;
      const baseTier = DEFAULT_STATS[tierKey] || DEFAULT_STATS.C;
      mergedStats[tierKey] = {
        normal: { ...baseTier.normal, ...(tierVal.normal && typeof tierVal.normal === 'object' ? tierVal.normal : {}) },
        shiny: { ...baseTier.shiny, ...(tierVal.shiny && typeof tierVal.shiny === 'object' ? tierVal.shiny : {}) }
      };
    }
  }
  data.stats = mergedStats;

  return data;
}

function loadGameData() {
  const targetFile = fs.existsSync(DATA_FILE_LOWER)
    ? DATA_FILE_LOWER
    : (fs.existsSync(DATA_FILE_UPPER) ? DATA_FILE_UPPER : null);

  if (!targetFile) {
    throw new Error('data.json (or Data.json) is missing! Please make sure it is in the root directory.');
  }

  const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
  return normalizeGameData(parsed);
}

const gameData = loadGameData();

const GameStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'main_state' },
  users: { type: Object, default: {} },
  clans: { type: Object, default: {} },
  guildPrefixes: { type: Object, default: {} },
  channelRestrictions: { type: Object, default: {} },
  bannedUsers: { type: Object, default: {} },
  tradeHistories: { type: Object, default: {} },
  config: { type: Object, default: () => JSON.parse(JSON.stringify(DEFAULT_CONFIG)) }
});

const GameState = mongoose.models.GameState || mongoose.model('GameState', GameStateSchema);

const db = {
  users: {},
  clans: {},
  guildPrefixes: {},
  channelRestrictions: {},
  bannedUsers: {},
  tradeHistories: {},
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG))
};

function sanitizeUserInventories(usersObj) {
  let anyChanged = false;
  for (const u of Object.values(usersObj || {})) {
    if (!u || typeof u !== 'object') continue;
    const chibis = u.inventory?.chibis;
    if (Array.isArray(chibis)) {
      let userChanged = false;
      const removedIds = new Set();
      const filtered = chibis.filter(c => {
        if (!c || typeof c !== 'object') return true;
        if (String(c.name || '').toLowerCase() === 'str_aegis') {
          if (c.chibiId) removedIds.add(c.chibiId);
          if (c.id) removedIds.add(c.id);
          userChanged = true;
          return false;
        }
        return true;
      });
      if (userChanged) {
        anyChanged = true;
        u.inventory.chibis = filtered;
        if (Array.isArray(u.team)) {
          u.team = u.team.map(slotId => (slotId && removedIds.has(slotId) ? null : slotId));
        }
        if (u.equippedChibi && removedIds.has(u.equippedChibi)) {
          u.equippedChibi = null;
        }
      }
    }
  }
  return anyChanged;
}

async function initDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is missing!');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully!');

    let state = await GameState.findById('main_state');
    if (!state) {
      state = await GameState.create({
        _id: 'main_state',
        users: {},
        clans: {},
        guildPrefixes: {},
        channelRestrictions: {},
        bannedUsers: {},
        tradeHistories: {},
        config: JSON.parse(JSON.stringify(DEFAULT_CONFIG))
      });
    }

    const baseConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    const savedConfig = state.config && typeof state.config === 'object' ? state.config : {};

    db.users = state.users && typeof state.users === 'object' ? state.users : {};
    db.clans = state.clans && typeof state.clans === 'object' ? state.clans : {};
    db.guildPrefixes = state.guildPrefixes && typeof state.guildPrefixes === 'object' ? state.guildPrefixes : {};
    db.channelRestrictions = state.channelRestrictions && typeof state.channelRestrictions === 'object' ? state.channelRestrictions : {};
    db.bannedUsers = state.bannedUsers && typeof state.bannedUsers === 'object' ? state.bannedUsers : {};
    db.tradeHistories = state.tradeHistories && typeof state.tradeHistories === 'object' ? state.tradeHistories : {};
    db.config = {
      ...baseConfig,
      ...savedConfig,
      testers: Array.isArray(savedConfig.testers) ? savedConfig.testers : baseConfig.testers,
      clanRewards: {
        ...baseConfig.clanRewards,
        ...(savedConfig.clanRewards && typeof savedConfig.clanRewards === 'object' ? savedConfig.clanRewards : {})
      },
      eventCrystals: {
        ...baseConfig.eventCrystals,
        ...(savedConfig.eventCrystals && typeof savedConfig.eventCrystals === 'object' ? savedConfig.eventCrystals : {})
      },
      eventShop: {
        ...baseConfig.eventShop,
        ...(savedConfig.eventShop && typeof savedConfig.eventShop === 'object' ? savedConfig.eventShop : {})
      }
    };

    let needsSave = sanitizeUserInventories(db.users);
    for (const [gId, pref] of Object.entries(db.guildPrefixes)) {
      if (typeof pref === 'string' && /^[a-zA-Z]$/.test(pref)) {
        delete db.guildPrefixes[gId];
        needsSave = true;
      }
    }
    if (needsSave) {
      await saveUsers();
    }
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
}

async function saveUsers() {
  try {
    let state = await GameState.findById('main_state');
    if (!state) {
      state = new GameState({ _id: 'main_state' });
    }
    state.users = db.users;
    state.clans = db.clans;
    state.guildPrefixes = db.guildPrefixes;
    state.channelRestrictions = db.channelRestrictions;
    state.bannedUsers = db.bannedUsers;
    state.tradeHistories = db.tradeHistories;
    state.config = db.config;

    state.markModified('users');
    state.markModified('clans');
    state.markModified('guildPrefixes');
    state.markModified('channelRestrictions');
    state.markModified('bannedUsers');
    state.markModified('tradeHistories');
    state.markModified('config');

    await state.save();
  } catch (err) {
    console.error('Failed to save data to MongoDB:', err);
  }
}

module.exports = {
  DATA_FILE,
  gameData,
  GameState,
  db,
  initDatabase,
  saveUsers
};