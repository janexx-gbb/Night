const { PermissionsBitField } = require('discord.js');
const { BADGE_CATALOG, BETA_EMOJIS, CLAN_LOGOS } = require('./constants');
const { gameData, db } = require('./database');

const SHOP_DICE_MAP = {
  zenith: { id: 'zenith', name: 'Zenith Dice', emoji: '<:Zenithdice:1573808579042087044>', cost: 1_000_000, luckPercent: 1_000, restriction: 'cash' },
  archangel: { id: 'archangel', name: 'Archangel Dice', emoji: '<:Archangeldice:1573808666040209580>', cost: 10_000_000, luckPercent: 5_000, restriction: 'cash' },
  galactic: { id: 'galactic', name: 'Galactic Dice', emoji: '<:Galacticdice:1573808816397750282>', cost: 50_000_000, luckPercent: 15_000, restriction: 'cash' },
  inferno: { id: 'inferno', name: 'Inferno Dice', emoji: '<:Infernodice:1573809040322986027>', cost: 200_000_000, luckPercent: 30_000, restriction: 'cash' },
  demigod: { id: 'demigod', name: 'Demigod Dice', emoji: '<:Demigoddice:1573809108543340638>', cost: 500_000_000, luckPercent: 45_000, restriction: 'cash' },
  rainbow: { id: 'rainbow', name: 'Rainbow Dice', emoji: '<:Rainbowdice:1573809197542285412>', cost: 2_000_000_000, luckPercent: 60_000, restriction: 'cash' },
  gradient: { id: 'gradient', name: 'Gradient Dice', emoji: '<:Gardientdice:1573809254891003954>', cost: 10_000_000_000, luckPercent: 100_000, restriction: 'cash' },
  hacker: { id: 'hacker', name: 'Hacker Dice', emoji: '<:Hackerdice:1573809319420367028>', cost: 25_000_000_000, luckPercent: 500_000, restriction: 'cash' },
  nosleep: { id: 'nosleep', name: 'NoSleep Dice', emoji: '<:Nosleepdice:1573809380569120800>', cost: 50_000_000_000, luckPercent: 1_000_000, restriction: 'cash' },
  supporter: { id: 'supporter', name: 'Supporter Dice', emoji: '<:Supporterdice:1573809498299048070>', cost: 0, luckPercent: 3_500_000, restriction: 'supporter' },
  glitch: { id: 'glitch', name: 'Glitch Dice', emoji: '<:Glitchdice:1573809577298886836>', cost: 500_000_000_000, luckPercent: 25_000_000, restriction: 'cash' },
  developer: { id: 'developer', name: 'Developer Dice', emoji: '<:Developerdice:1573809636543434932>', cost: 0, luckPercent: 1, restriction: 'developer' }
};

const WEATHER_EVENT_POOL = [
  { id: 'blue_luck', name: 'Blue Luck', emoji: '<:Blueluck:1573809712041038035>', chancePercent: 35, luckBonusPercent: 30, description: 'A calm azure breeze settles over the roll arena, granting +30% of your current luck.' },
  { id: 'purple_luck', name: 'Purple Luck', emoji: '<:Purpleluck:1573809925874786507>', chancePercent: 20, luckBonusPercent: 50, description: 'Violet rift sparks drift across the dice table, granting +50% of your current luck.' },
  { id: 'yellow_luck', name: 'Yellow Luck', emoji: '<:Yellowluck:1573809988646735952>', chancePercent: 10, luckBonusPercent: 70, description: 'Golden sunbeams charge the atmosphere with fortune, granting +70% of your current luck.' },
  { id: 'gradient_luck', name: 'Gradient Luck', emoji: '<:Gardientlucl:1573810062365827237>', chancePercent: 1, luckBonusPercent: 100, description: 'Prismatic waves surge through the realm, granting +100% of your current luck.' },
  { id: 'rainbow_luck', name: 'Rainbow Luck', emoji: '<:Rainbowlucl:1573810125632831498>', chancePercent: 0.1, luckBonusPercent: 500, description: 'A rare celestial rainbow erupts across the sky, granting +500% of your current luck.' }
];

const COMPACT_UNITS = [
  { value: 1e60, suffix: 'UVGT' }, { value: 1e57, suffix: 'TTG' }, { value: 1e54, suffix: 'Qiund' },
  { value: 1e51, suffix: 'Qaind' }, { value: 1e48, suffix: 'Spnd' }, { value: 1e45, suffix: 'Sxnd' },
  { value: 1e42, suffix: 'Suvg' }, { value: 1e39, suffix: 'Trvg' }, { value: 1e36, suffix: 'Uvg' },
  { value: 1e33, suffix: 'Rvg' }, { value: 1e30, suffix: 'No' }, { value: 1e27, suffix: 'Sp' },
  { value: 1e24, suffix: 'Sx' }, { value: 1e21, suffix: 'Qi' }, { value: 1e18, suffix: 'Qa' },
  { value: 1e15, suffix: 'T' }, { value: 1e12, suffix: 'B' }, { value: 1e9, suffix: 'M' },
  { value: 1e6, suffix: 'K' }
];

const ODDS_MULTIPLIERS = {
  K: 1e3, M: 1e6, B: 1e9, T: 1e12, Qa: 1e15, Qi: 1e18,
  Sx: 1e21, Sp: 1e24, No: 1e30, Rvg: 1e33, Uvg: 1e36, Trvg: 1e39
};

function formatCompactValue(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1_000_000) {
    if (abs >= 1_000) {
      const kVal = abs / 1_000;
      return `${sign}${Number.isInteger(kVal) ? kVal : kVal.toFixed(2).replace(/\.?0+$/, '')}K`;
    }
    return `${sign}${Number.isInteger(abs) ? abs : abs.toFixed(2).replace(/\.?0+$/, '')}`;
  }
  for (const unit of COMPACT_UNITS) {
    if (abs >= unit.value) {
      const scaled = abs / unit.value;
      const formatted = scaled >= 100
        ? scaled.toFixed(0)
        : scaled >= 10
          ? scaled.toFixed(1).replace(/\.0$/, '')
          : scaled.toFixed(2).replace(/\.?0+$/, '');
      return `${sign}${formatted}${unit.suffix}`;
    }
  }
  return `${sign}${Math.floor(abs)}`;
}

function formatCompactNumber(num) {
  return formatCompactValue(num);
}

function isTester(userId) {
  if (!userId || !db?.config) return false;
  if (!db.config.ownerId) db.config.ownerId = userId;
  return userId === db.config.ownerId || (Array.isArray(db.config.testers) && db.config.testers.includes(userId));
}

function canSeeUnreleasedBeta(userId) {
  return isTester(userId);
}

function toSmallCaps(str) {
  if (!str) return '';
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
    k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ',
    u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
    A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ', J: 'ᴊ',
    K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ', S: 'ꜱ', T: 'ᴛ',
    U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
  };
  return String(str).split(/(<a?:\w+:\d+>)/g).map(part =>
    (part.startsWith('<') && part.endsWith('>')) ? part : part.split('').map(ch => map[ch] || ch).join('')
  ).join('');
}

function getRarityIconMap(useBetaEmojis = false) {
  const map = {
    SRR: '<:Newsrr1:1573559263627055164>',
    UTR: '<:Newutr1:1573559322527662090>',
    STR: '<:Str:1573559367339614348>',
    SSRP: useBetaEmojis ? BETA_EMOJIS?.RARITIES?.SSRP : '<a:Ssrp:1572096279545126985>',
    UGMR: '<:What:1573806040644980917>'
  };
  (gameData.rarities || []).forEach(r => {
    if (!r || !r.key) return;
    if (!map[r.key]) {
      map[r.key] = (useBetaEmojis && BETA_EMOJIS?.RARITIES?.[r.key]) ? BETA_EMOJIS.RARITIES[r.key] : r.emoji;
    }
  });
  return map;
}

function getEquippedDiceInfo(user) {
  const rawKey = String(user?.equippedDice || user?.activeDice || user?.diceType || 'zenith').toLowerCase();
  return SHOP_DICE_MAP[rawKey] || SHOP_DICE_MAP.zenith;
}

function getActiveWeatherEvent() {
  if (!db.weather || typeof db.weather !== 'object') {
    db.weather = { current: null, updatedAt: 0, nextUpdateAt: Date.now() + 30 * 60 * 1000 };
  }
  return db.weather.current || null;
}

function rollWeatherEvent(nowMs = Date.now()) {
  const pool = Array.isArray(gameData.weatherEvents) && gameData.weatherEvents.length > 0
    ? gameData.weatherEvents
    : WEATHER_EVENT_POOL;
  const intervalMin = Number(gameData?.settings?.weatherIntervalMinutes) || 30;
  const intervalMs = Math.max(1, intervalMin) * 60 * 1000;

  const rollVal = Math.random() * 100;
  let cumulative = 0;
  let selected = null;
  for (const ev of pool) {
    if (!ev) continue;
    cumulative += Number(ev.chancePercent) || 0;
    if (rollVal <= cumulative) {
      selected = ev;
      break;
    }
  }
  if (!db.weather || typeof db.weather !== 'object') db.weather = {};
  db.weather.current = selected ? { ...selected } : null;
  db.weather.updatedAt = nowMs;
  db.weather.nextUpdateAt = nowMs + intervalMs;
  return db.weather.current;
}

function getUserRollLuckPercent(user) {
  const diceInfo = getEquippedDiceInfo(user);
  const baseDiceLuck = Number(diceInfo.luckPercent) || 0;
  const activeWeather = getActiveWeatherEvent();
  const weatherBonusPct = activeWeather ? (Number(activeWeather.luckBonusPercent) || 0) : 0;
  const weatherBonusLuck = baseDiceLuck * (weatherBonusPct / 100);
  const totalLuckPercent = baseDiceLuck + weatherBonusLuck;
  return {
    diceInfo,
    baseDiceLuck,
    activeWeather,
    weatherBonusLuck,
    totalLuckPercent,
    luckMultiplier: 1 + totalLuckPercent / 100
  };
}

function resolveRankByPoints(pts) {
  const p = Number(pts) || 0;
  if (p >= 50500) return '<:Umythic:1573805848696717383>';
  if (p >= 30500) return '<:Legend1:1573805667737804950>';
  if (p >= 20500) return '<:Legend2:1573805583474098306>';
  if (p >= 10000) return '<:Legend3:1573805501240705094>';
  if (p >= 8002) return '<:Infernoo:1573805416964685894>';
  if (p >= 5501) return '<:Obsidian:1573805351487410196>';
  if (p >= 4001) return '<:Archangell:1573805219618357360>';
  if (p >= 2501) return '<:Zenith:1573805173468303461>';
  if (p >= 1000) return '<:Astral:1573804916198088785>';
  return '<:Unranked:1573804757322178772>';
}

function updateUserRank(user) {
  if (!user || typeof user !== 'object') return;
  user.rank = resolveRankByPoints(user.points || 0);
}

function updatePeakRank(user) {
  if (!user || typeof user !== 'object') return;
  user.highestSeasonRank = resolveRankByPoints(user.highestSeasonPoints || 0);
}

async function evaluateAndSyncUserBadges(targetUserId, targetUserData, guild = null) {
  if (!targetUserData || typeof targetUserData !== 'object') return [];
  const badgeSet = new Set(
    Array.isArray(targetUserData.badges)
      ? targetUserData.badges.filter(k => Boolean(BADGE_CATALOG?.[k]))
      : []
  );

  const level = Number(targetUserData.userLevel) || 1;
  if (level >= 50) badgeSet.add('lvl50');
  if (level >= 100) badgeSet.add('lvl100');

  const nowDate = new Date();
  const firstPlayedMs = Number(targetUserData.firstPlayedAt) || Date.parse(targetUserData.joinedDate || '') || nowDate.getTime();
  if (Math.floor(Math.max(0, nowDate.getTime() - firstPlayedMs) / 86400000) >= 100) {
    badgeSet.add('days100');
  }

  const eligibleCatalog = new Set(
    (gameData.chibis || [])
      .filter(c => c && c.name && String(c.rarity || '').toUpperCase() !== 'SSRP')
      .map(c => c.name)
  );
  const ownedEligible = new Set(
    (targetUserData.inventory?.chibis || [])
      .filter(c => c && c.name && String(c.rarity || '').toUpperCase() !== 'SSRP')
      .map(c => c.name)
  );
  if (eligibleCatalog.size > 0 && eligibleCatalog.size === ownedEligible.size) {
    badgeSet.add('collections');
  }

  const ownedDiceSet = new Set(Array.isArray(targetUserData.ownedDice) ? targetUserData.ownedDice : []);
  if (ownedDiceSet.has('hacker') || targetUserData.equippedDice === 'hacker') badgeSet.add('hacker');
  if (ownedDiceSet.has('archangel') || targetUserData.equippedDice === 'archangel') badgeSet.add('archangel');

  if (
    targetUserData.rolledUmgr ||
    (targetUserData.inventory?.chibis || []).some(c => c && String(c.rarity || '').toUpperCase() === 'UGMR')
  ) {
    badgeSet.add('ugmr');
  }

  if (Number(targetUserData.gamblingEarnings || targetUserData.gamblingWon || 0) >= 1_000_000_000_000) {
    badgeSet.add('gamblingod');
  }
  if (targetUserData.foughtDev3v3) badgeSet.add('devvsplayer');
  if (targetUserId === db?.config?.ownerId || isTester(targetUserId)) badgeSet.add('developer');
  if (targetUserData.permissions === true) badgeSet.add('admin');
  if (targetUserData.supporter === true || targetUserData.betaSupporter === true) badgeSet.add('supporter');

  const month = nowDate.getUTCMonth() + 1;
  const year = nowDate.getUTCFullYear();
  if (year === 2026 && (month === 12 || targetUserData.playedXmas2026)) badgeSet.add('xmas2026');
  if (year === 2026 && (month === 10 || targetUserData.playedHalloween2026)) badgeSet.add('halloween2026');

  if (guild) {
    try {
      const member = await guild.members.fetch(targetUserId).catch(() => null);
      if (member) {
        if (member.premiumSinceTimestamp) {
          badgeSet.add('booster');
          badgeSet.add('nitro');
        }
        if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) badgeSet.add('admin');
        if (
          member.permissions?.has(PermissionsBitField.Flags.ModerateMembers) ||
          member.permissions?.has(PermissionsBitField.Flags.ManageMessages)
        ) {
          badgeSet.add('mods');
        }
      }
    } catch {}
  }

  targetUserData.badges = Array.from(badgeSet).filter(k => Boolean(BADGE_CATALOG?.[k]));
  return targetUserData.badges;
}

function isValidProfileBgUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' && (
      /\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(parsed.pathname) ||
      ['giphy.com', 'tenor.com', 'discordapp.com', 'discordapp.net'].some(h => parsed.hostname.includes(h))
    );
  } catch {
    return false;
  }
}

function ensureUser(userId) {
  if (!userId) return;
  if (!db.users || typeof db.users !== 'object') db.users = {};
  const now = Date.now();

  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      joinedDate: new Date(now).toLocaleDateString(),
      firstPlayedAt: now,
      dice: 10,
      cash: 0,
      equippedDice: 'zenith',
      ownedDice: ['zenith'],
      gamblingEarnings: 0,
      rolledUmgr: false,
      foughtDev3v3: false,
      points: 0,
      rank: '<:Unranked:1573804757322178772>',
      clan: null,
      customNickname: null,
      profileBg: null,
      profileBgTheme: 'crystal',
      profileAccentColor: null,
      highestSeasonRank: '<:Unranked:1573804757322178772>',
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
      permissions: false,
      customStatus: null,
      badges: [],
      clanMail: []
    };
    updateUserRank(db.users[userId]);
    updatePeakRank(db.users[userId]);
  } else {
    const u = db.users[userId];
    if (!u.joinedDate) u.joinedDate = new Date(now).toLocaleDateString();
    if (!u.firstPlayedAt) {
      const parsedJoined = Date.parse(u.joinedDate);
      u.firstPlayedAt = !Number.isNaN(parsedJoined) && parsedJoined > 0 ? parsedJoined : now;
    }
    if (!u.equippedDice) u.equippedDice = 'zenith';
    if (!Array.isArray(u.ownedDice)) u.ownedDice = [u.equippedDice];
    if (typeof u.gamblingEarnings !== 'number') u.gamblingEarnings = 0;
    if (typeof u.rolledUmgr !== 'boolean') u.rolledUmgr = false;
    if (typeof u.foughtDev3v3 !== 'boolean') u.foughtDev3v3 = false;
    if (!u.bestRoll) u.bestRoll = 'None';
    if (!Array.isArray(u.badges)) u.badges = [];
    if (!Array.isArray(u.clanMail)) u.clanMail = [];
    if (typeof u.profileBg !== 'string') u.profileBg = null;
    if (!u.profileBgTheme || typeof u.profileBgTheme !== 'string') u.profileBgTheme = 'crystal';
    if (typeof u.profileAccentColor !== 'number') u.profileAccentColor = null;
    if (!u.inventory || typeof u.inventory !== 'object') {
      u.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
    }
    if (!Array.isArray(u.inventory.chibis)) u.inventory.chibis = [];
    if (!u.inventory.items || typeof u.inventory.items !== 'object') {
      u.inventory.items = { spray: 0, clover: 0 };
    }
    if (!Array.isArray(u.team)) u.team = [null, null, null];
    updateUserRank(u);
    updatePeakRank(u);
  }
}

function getClanLogoDisplay(logoId) {
  return (logoId && CLAN_LOGOS[String(logoId)]) || CLAN_LOGOS['1'];
}

function getClanLogoImageUrl(logoId) {
  const match = getClanLogoDisplay(logoId).match(/^<(a)?:\w+:(\d+)>$/);
  if (!match) return 'https://cdn.discordapp.com/emojis/1572057180704604261.gif?size=256';
  return `https://cdn.discordapp.com/emojis/${match[2]}.${match[1] ? 'gif' : 'png'}?size=256`;
}

function getClanLogoListText() {
  return Object.entries(CLAN_LOGOS).map(([id, emoji]) => `[${id}] - ${emoji}`).join('\n');
}

function getClanMemberRole(clanObj, memberId) {
  if (!clanObj) return 'Member';
  if (clanObj.leader === memberId) return 'Leader';
  if (clanObj.roles?.[memberId]) return clanObj.roles[memberId];
  return clanObj.viceLeader === memberId ? 'Co-Leader' : 'Member';
}

function pushClanMail(userId, mailItem) {
  ensureUser(userId);
  if (!Array.isArray(db.users[userId].clanMail)) db.users[userId].clanMail = [];
  db.users[userId].clanMail.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: mailItem.title || 'Clan Notice',
    body: mailItem.body || '',
    category: mailItem.category || 'Status',
    reward: mailItem.reward || null,
    claimed: Boolean(mailItem.claimed),
    timestamp: Date.now()
  });
  if (db.users[userId].clanMail.length > 25) {
    db.users[userId].clanMail = db.users[userId].clanMail.slice(0, 25);
  }
}

function parseDurationToMs(durationStr) {
  const match = String(durationStr || '').match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return mult[match[2].toLowerCase()] ? val * mult[match[2].toLowerCase()] : null;
}

function formatTimeRemaining(ms) {
  if (ms <= 0) return toSmallCaps('Ended');
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return toSmallCaps(d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`);
}

function formatTimePlayed(startInput, nowMs = Date.now()) {
  const startMs = typeof startInput === 'number' && Number.isFinite(startInput) && startInput > 0
    ? startInput
    : (typeof startInput === 'string' && startInput.trim() ? Date.parse(startInput.trim()) : null);
  if (!startMs || Number.isNaN(startMs) || startMs <= 0 || nowMs <= startMs) return '0s';
  let rem = Math.floor((nowMs - startMs) / 1000);
  const parts = [];
  for (const [label, size] of [['y', 31536000], ['mo', 2592000], ['w', 604800], ['d', 86400], ['h', 3600], ['m', 60]]) {
    const count = Math.floor(rem / size);
    if (count > 0) {
      parts.push(`${count}${label}`);
      rem %= size;
    }
  }
  parts.push(`${rem}s`);
  return parts.join(' ');
}

function addExpAndLevelUp(user, chibi, baseExpAmount) {
  if (!user || typeof user !== 'object') return 0;
  const xpMult = Number(db?.config?.globalXpMultiplier) || 1.0;
  const expAmount = Math.round((Number(baseExpAmount) || 0) * xpMult);
  const settings = gameData.settings || {};
  const userExpBase = Number(settings.userExpBase) || 100;
  const userExpPerLevel = Number(settings.userExpPerLevel) || 50;

  user.userLevel = Math.max(1, Number(user.userLevel) || 1);
  user.userExp = (Number(user.userExp) || 0) + expAmount;

  let userMaxExp = userExpBase + (user.userLevel - 1) * userExpPerLevel;
  while (user.userExp >= userMaxExp) {
    user.userExp -= userMaxExp;
    user.userLevel += 1;
    userMaxExp = userExpBase + (user.userLevel - 1) * userExpPerLevel;
  }

  if (chibi && typeof chibi === 'object') {
    const baseChibiExp = chibi.isShiny
      ? (Number(settings.shinyChibiExpBase) || 150)
      : (Number(settings.normalChibiExpBase) || 100);
    const perLvl = chibi.isShiny
      ? (Number(settings.shinyChibiExpPerLevel) || 75)
      : (Number(settings.normalChibiExpPerLevel) || 50);
    chibi.level = Math.max(1, Number(chibi.level) || 1);
    chibi.exp = (Number(chibi.exp) || 0) + expAmount;

    let chibiMaxExp = baseChibiExp + (chibi.level - 1) * perLvl;
    while (chibi.exp >= chibiMaxExp) {
      chibi.exp -= chibiMaxExp;
      chibi.level += 1;
      chibiMaxExp = baseChibiExp + (chibi.level - 1) * perLvl;
    }
  }
  return expAmount;
}

function parseOddsNumber(oddsString) {
  if (!oddsString) return 1;
  const match = String(oddsString).replace(/,/g, '').trim().match(/(\d+(?:\.\d+)?)([KMBT]|Qa|Qi|Sx|Sp|No|Rvg|Uvg|Trvg)?/i);
  if (!match) return 1;
  const numPart = parseFloat(match[1]);
  const unitKey = Object.keys(ODDS_MULTIPLIERS).find(k => k.toLowerCase() === (match[2] || '').toLowerCase());
  return unitKey ? numPart * ODDS_MULTIPLIERS[unitKey] : numPart;
}

module.exports = {
  SHOP_DICE_MAP,
  WEATHER_EVENT_POOL,
  formatCompactValue,
  formatCompactNumber,
  isTester,
  canSeeUnreleasedBeta,
  toSmallCaps,
  getRarityIconMap,
  getEquippedDiceInfo,
  getActiveWeatherEvent,
  rollWeatherEvent,
  getUserRollLuckPercent,
  resolveRankByPoints,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  isValidProfileBgUrl,
  ensureUser,
  getClanLogoDisplay,
  getClanLogoImageUrl,
  getClanLogoListText,
  getClanMemberRole,
  pushClanMail,
  parseDurationToMs,
  formatTimeRemaining,
  formatTimePlayed,
  addExpAndLevelUp,
  parseOddsNumber
};