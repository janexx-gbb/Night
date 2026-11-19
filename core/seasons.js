const { gameData, db, saveUsers } = require('./database');
const {
  updateUserRank,
  updatePeakRank,
  ensureUser,
  pushClanMail
} = require('./helpers');

const SEASON_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

// Archives every player's season stats, resets points, and starts the next season.
async function rolloverPlayerSeason(now) {
  for (const u of Object.values(db.users)) {
    u.highestSeasonRank = u.rank;
    u.highestSeasonPoints = u.points || 0;
    updatePeakRank(u);
    u.points = 0;
    updateUserRank(u);
  }

  db.config.seasonNumber = (db.config.seasonNumber || 1) + 1;
  db.config.seasonStartedAt = now;
  db.config.seasonExpires = now + SEASON_LENGTH_MS;
  await saveUsers();
  console.log(`Season timer expired! Automatically started Season ${db.config.seasonNumber} and archived user peak records.`);
}

function getClansByPoints() {
  return Object.entries(db.clans)
    .map(([name, clan]) => {
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      return { name, clan, totalPoints };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

// Clans with a configured reward for their rank get chibis; everyone else gets dice.
function buildClanRewardMail(rank, clanName, rewardCfg) {
  if (!rewardCfg) {
    return {
      title: `Clan Season Consolation (#${rank})`,
      body: `Your clan **${clanName}** finished Rank #${rank}! Reward: 100x 🎲 Dice.`,
      category: 'Rewards',
      claimed: false,
      reward: { type: 'dice', dice: 100 }
    };
  }

  const rarity = rewardCfg.rarity || 'SR';
  const sampleChibi = gameData.chibis.find(c => c.rarity === rarity) || gameData.chibis[0];
  return {
    title: `Clan Season Reward (#${rank})`,
    body: `Your clan **${clanName}** finished Rank #${rank}! Reward: ${rewardCfg.qty}x ${rewardCfg.rarity} ${sampleChibi.emoji} ${sampleChibi.name}.`,
    category: 'Rewards',
    claimed: false,
    reward: {
      type: 'chibi',
      qty: rewardCfg.qty || 1,
      rarity,
      name: sampleChibi.name,
      emoji: sampleChibi.emoji
    }
  };
}

// Mails every clan member their end-of-season reward and starts the next clan season.
async function rolloverClanSeason(now) {
  const rewards = db.config.clanRewards || {};

  getClansByPoints().forEach(({ name, clan }, idx) => {
    const rank = idx + 1;
    const mail = buildClanRewardMail(rank, name, rewards[rank]);
    for (const memberId of clan.members) {
      ensureUser(memberId);
      pushClanMail(memberId, { ...mail, reward: { ...mail.reward } });
    }
  });

  db.config.clanSeasonExpires = now + SEASON_LENGTH_MS;
  await saveUsers();
  console.log('Clan season expired! Rewards queued in clan mail.');
}

async function checkSeasonRollovers() {
  const now = Date.now();
  if (db.config.seasonExpires && now >= db.config.seasonExpires) {
    await rolloverPlayerSeason(now);
  }
  if (db.config.clanSeasonExpires && now >= db.config.clanSeasonExpires) {
    await rolloverClanSeason(now);
  }
}

module.exports = { checkSeasonRollovers };
