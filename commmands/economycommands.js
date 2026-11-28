const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');

const { db } = require('../core/database');
const {
  ensureUser,
  toSmallCaps,
  updateUserRank,
  evaluateAndSyncUserBadges,
  addExpAndLevelUp
} = require('../core/helpers');

const ECONOMY_COMMANDS = [
  'work', 'working', 'workshift', 'job', 'jobs',
  'balance',
  'casino', 'blackjack', 'coinflip',
  'ticketbuy', 'ticketuse', 'lottery',
  'csell'
];

const BASE_JOBS = [
  {
    id: 'farmer',
    name: 'Farmer',
    emoji: '🌾',
    minSalary: 50000,
    maxSalary: 150000,
    shiftSalary: 250000,
    isEvent: false
  },
  {
    id: 'streamer',
    name: 'Streamer',
    emoji: '🎮',
    minSalary: 80000,
    maxSalary: 210000,
    shiftSalary: 450000,
    isEvent: false
  },
  {
    id: 'youtuber',
    name: 'YouTuber',
    emoji: '📹',
    minSalary: 120000,
    maxSalary: 500000,
    shiftSalary: 650000,
    isEvent: false
  },
  {
    id: 'seaman',
    name: 'Seaman',
    emoji: '⚓',
    minSalary: 350000,
    maxSalary: 600000,
    shiftSalary: 1200000,
    isEvent: false
  }
];

const PH_EVENT_JOBS = [
  {
    id: 'akyat_bahay',
    name: 'Akyat Bahay',
    emoji: '🥷',
    minSalary: 350000,
    maxSalary: 800000,
    shiftSalary: 1000000,
    isEvent: true
  },
  {
    id: 'adik_sa_sha',
    name: 'Adik sa Sha',
    emoji: '🧪',
    minSalary: 500000,
    maxSalary: 1300000,
    shiftSalary: 5000000,
    isEvent: true
  },
  {
    id: 'promoter_sa_sugal',
    name: 'Promoter Sa Sugal',
    emoji: '🎰',
    minSalary: 900000,
    maxSalary: 3450000,
    shiftSalary: 15000000,
    isEvent: true
  },
  {
    id: 'artista_sa_pilipinas',
    name: 'Artista Sa Pilipinas',
    emoji: '🎬',
    minSalary: 2300000,
    maxSalary: 6700000,
    shiftSalary: 25000000,
    isEvent: true
  },
  {
    id: 'bangag_na_senator',
    name: 'Bangag Na Senator',
    emoji: '🏛️',
    minSalary: 5000000,
    maxSalary: 12000000,
    shiftSalary: 75000000,
    isEvent: true
  }
];

// PH Event ends after December 2, 2026
const PH_EVENT_END_MS = Date.parse('2026-12-02T23:59:59+08:00');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WORKING_INTERVAL_MS = 2 * 60 * 1000; // Every 2 minutes
const SHIFT_DURATION_MS = 15 * 60 * 1000;

const RARITY_SELL_VALUES = {
  C: 15,
  U: 35,
  R: 80,
  SR: 200,
  SRR: 500,
  UTR: 1200,
  STR: 3000,
  USRR: 8000,
  UGMR: 20000,
  SSRP: 50000
};

function ensureEconomyDbShapes() {
  if (!db.config || typeof db.config !== 'object') db.config = {};
  if (typeof db.config.lotteryPool !== 'number' || Number.isNaN(db.config.lotteryPool)) {
    db.config.lotteryPool = 5000;
  }
  if (!Array.isArray(db.config.lotteryEntries)) {
    db.config.lotteryEntries = [];
  }
}

function isPhEventActive(nowMs = Date.now()) {
  return nowMs <= PH_EVENT_END_MS;
}

function getAvailableJobs(nowMs = Date.now()) {
  return isPhEventActive(nowMs) ? [...BASE_JOBS, ...PH_EVENT_JOBS] : [...BASE_JOBS];
}

function findJobByQuery(query, nowMs = Date.now()) {
  if (!query) return null;
  const normalized = String(query).trim().toLowerCase().replace(/\s+/g, ' ');
  const slug = normalized.replace(/\s+/g, '_');
  const jobs = getAvailableJobs(nowMs);
  return (
    jobs.find(j => j.id === slug || j.name.toLowerCase() === normalized) ||
    jobs.find(j => j.name.toLowerCase().includes(normalized)) ||
    null
  );
}

function formatDiceDisplay(val) {
  const num = Number(val) || 0;
  if (!Number.isFinite(num)) return String(val);
  if (Math.abs(num) >= 1e15) return num.toExponential(4);
  return num.toLocaleString();
}

function ensureEconomyFields(user, nowMs = Date.now()) {
  if (typeof user.cash !== 'number' || Number.isNaN(user.cash)) user.cash = 0;
  if (typeof user.dice !== 'number' || Number.isNaN(user.dice)) user.dice = 0;
  if (typeof user.points !== 'number' || Number.isNaN(user.points)) user.points = 0;
  if (typeof user.tickets !== 'number' || Number.isNaN(user.tickets)) user.tickets = 0;
  if (typeof user.workCount !== 'number' || Number.isNaN(user.workCount)) user.workCount = 0;
  if (!user.jobCooldowns || typeof user.jobCooldowns !== 'object') {
    user.jobCooldowns = {};
  }
  if (!user.workingLoop || typeof user.workingLoop !== 'object') {
    user.workingLoop = null;
  }
  if (!user.activeShift || typeof user.activeShift !== 'object') {
    user.activeShift = null;
  }
  if (!user.inventory || typeof user.inventory !== 'object') {
    user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
  }
  if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];

  if (!isPhEventActive(nowMs)) {
    for (const evJob of PH_EVENT_JOBS) {
      delete user.jobCooldowns[evJob.id];
    }
    if (user.selectedJobId && PH_EVENT_JOBS.some(j => j.id === user.selectedJobId)) {
      user.selectedJobId = null;
    }
    if (user.workingLoop && PH_EVENT_JOBS.some(j => j.id === user.workingLoop.jobId)) {
      user.workingLoop = null;
    }
    if (user.activeShift && PH_EVENT_JOBS.some(j => j.id === user.activeShift.jobId)) {
      user.activeShift = null;
    }
  }
}

function getJobCooldownRemaining(user, jobId, nowMs = Date.now()) {
  const expiresAt = Number(user.jobCooldowns?.[jobId] || 0);
  if (!expiresAt) return 0;
  if (nowMs >= expiresAt) {
    delete user.jobCooldowns[jobId];
    return 0;
  }
  return expiresAt - nowMs;
}

function setJobOneDayCooldown(user, jobId, nowMs = Date.now()) {
  if (!user.jobCooldowns || typeof user.jobCooldowns !== 'object') {
    user.jobCooldowns = {};
  }
  user.jobCooldowns[jobId] = nowMs + ONE_DAY_MS;
}

function getSelectedJob(user, nowMs = Date.now()) {
  if (!user.selectedJobId) return null;
  return getAvailableJobs(nowMs).find(j => j.id === user.selectedJobId) || null;
}

function rollJobSalary(job) {
  return Math.floor(Math.random() * (job.maxSalary - job.minSalary + 1)) + job.minSalary;
}

function formatDurationShort(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function parsePositiveInt(val) {
  if (!val) return NaN;
  const cleaned = String(val).replace(/,/g, '').trim();
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function drawCard() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits = ['♠', '♥', '♦', '♣'];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  let value = Number.parseInt(rank, 10);
  if (['J', 'Q', 'K'].includes(rank)) value = 10;
  if (rank === 'A') value = 11;
  return { label: `${rank}${suit}`, rank, value };
}

function calculateBlackjackTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += card.value;
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function buildWorkListText(user, currentPrefix, nowMs = Date.now()) {
  const eventActive = isPhEventActive(nowMs);
  const formatLine = (j) => {
    const cd = getJobCooldownRemaining(user, j.id, nowMs);
    const cdTag = cd > 0 ? ` — ⏳ **1d Cooldown (${formatDurationShort(cd)})**` : '';
    return `• ${j.emoji} **${j.name}**${cdTag}`;
  };

  const baseLines = BASE_JOBS.map(formatLine).join('\n');
  let eventBlock = '';
  if (eventActive) {
    const eventLines = PH_EVENT_JOBS.map(formatLine).join('\n');
    eventBlock = `\n\n🇵🇭 **PH EVENT (Ends Dec 2, 2026):**\n${eventLines}`;
  }

  return (
    `Use \`${currentPrefix}working\` to work every 2m or \`${currentPrefix}workshift\` to shift.\n\n` +
    `**Work List:**\n${baseLines}${eventBlock}`
  );
}

function buildJobSelectRow(user, nowMs = Date.now()) {
  const jobs = getAvailableJobs(nowMs);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('economy_choose_job_select')
      .setPlaceholder(toSmallCaps('Choose your work...'))
      .addOptions(
        jobs.map(j => {
          const cd = getJobCooldownRemaining(user, j.id, nowMs);
          return {
            label: `${j.name}${j.isEvent ? ' [PH Event]' : ''}`.slice(0, 100),
            description: (cd > 0
              ? `1d cooldown (${formatDurationShort(cd)} left)`
              : `${j.isEvent ? 'PH Event Work' : 'Work'}`
            ).slice(0, 100),
            value: j.id,
            emoji: j.emoji,
            default: user.selectedJobId === j.id
          };
        })
      )
  );
}

async function applyChosenWork(user, job, nowMs, saveUsers) {
  const prevJobId = user.selectedJobId;
  const cdRemaining = getJobCooldownRemaining(user, job.id, nowMs);

  if (cdRemaining > 0) {
    return {
      ok: false,
      reason: `⏳ **${job.emoji} ${job.name}** is on a **1d** cooldown! Try again in **${formatDurationShort(cdRemaining)}** or choose another work.`
    };
  }

  if (prevJobId === job.id) {
    setJobOneDayCooldown(user, job.id, nowMs);
    user.selectedJobId = null;
    await saveUsers();
    return {
      ok: false,
      reason: `⏳ You chose **${job.emoji} ${job.name}** again! **${job.name}** is now on a **1d** cooldown. Choose a different work.`
    };
  }

  user.selectedJobId = job.id;
  await saveUsers();
  return { ok: true, job };
}

async function promptJobSelection(message, user, userId, currentPrefix, nowMs, saveUsers, headerNote = '') {
  const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      toSmallCaps(`# 💼 Choose Your Work\n${headerNote ? `${headerNote}\n\n` : ''}`) +
      buildWorkListText(user, currentPrefix, nowMs)
    )
  );
  const selectRow = buildJobSelectRow(user, nowMs);
  const promptMsg = await message.reply({
    components: [container, selectRow],
    flags: MessageFlags.IsComponentsV2
  });

  const collector = promptMsg.createMessageComponentCollector({ time: 45000 });
  collector.on('collect', async i => {
    if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
    if (i.user.id !== userId) {
      return i.followUp({ content: toSmallCaps('❌ Only the command user can choose a work here!'), ephemeral: true });
    }
    if (i.customId === 'economy_choose_job_select') {
      const clickNow = Date.now();
      ensureEconomyFields(user, clickNow);
      const chosen = getAvailableJobs(clickNow).find(j => j.id === i.values[0]);
      if (!chosen) {
        return i.followUp({ content: toSmallCaps('❌ That work is no longer available.'), ephemeral: true });
      }

      const applied = await applyChosenWork(user, chosen, clickNow, saveUsers);
      collector.stop();

      if (!applied.ok) {
        const cdContainer = new ContainerBuilder().setAccentColor(0xe67e22).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# ⏳ Work Cooldown Triggered\n\n${applied.reason}`))
        );
        await promptMsg.edit({ components: [cdContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
      }

      const updatedContainer = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# ✅ Work Selected — ${chosen.emoji} ${chosen.name}\n\n`) +
          `Use \`${currentPrefix}working\` to work every 2m or \`${currentPrefix}workshift\` to shift.`
        )
      );
      await promptMsg.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  });

  collector.on('end', async () => {
    await promptMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });
}

async function execute({
  command,
  args,
  message,
  userId,
  currentPrefix,
  user,
  currentMs,
  saveUsers,
  trackPeakPoints,
  rarityIconsMap
}) {
  if (!ECONOMY_COMMANDS.includes(command)) return false;

  const nowMs = Date.now() || currentMs;
  ensureEconomyDbShapes();
  ensureEconomyFields(user, nowMs);

  // JOB / JOBS selector
  if (command === 'job' || command === 'jobs') {
    if (args.length > 0) {
      const chosen = findJobByQuery(args.join(' '), nowMs);
      if (!chosen) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Could not find an active work matching "${args.join(' ')}". Pick one below:`
        );
        return true;
      }
      const applied = await applyChosenWork(user, chosen, nowMs, saveUsers);
      if (!applied.ok) {
        return message.reply(toSmallCaps(applied.reason));
      }
      return message.reply(toSmallCaps(`✅ Chosen work: ${chosen.emoji} **${chosen.name}**!`));
    }

    await promptJobSelection(message, user, userId, currentPrefix, nowMs, saveUsers);
    return true;
  }

  // 1. WORK
  if (command === 'work') {
    if (args.length > 0) {
      const requestedJob = findJobByQuery(args.join(' '), nowMs);
      if (!requestedJob) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Unknown or expired work "${args.join(' ')}". Choose your work below:`
        );
        return true;
      }
      const applied = await applyChosenWork(user, requestedJob, nowMs, saveUsers);
      if (!applied.ok) {
        return message.reply(toSmallCaps(applied.reason));
      }
      return message.reply(toSmallCaps(`✅ You are now in work: ${requestedJob.emoji} **${requestedJob.name}**!`));
    }

    const job = getSelectedJob(user, nowMs);
    if (!job) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        '❌ You are not in a work yet! Choose your work below:'
      );
      return true;
    }

    const cdRemaining = getJobCooldownRemaining(user, job.id, nowMs);
    const cdLine = cdRemaining > 0
      ? `\n⏳ **1d Cooldown:** **${formatDurationShort(cdRemaining)}** remaining`
      : '';

    const changeJobRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('economy_switch_job_btn')
        .setLabel(toSmallCaps('Choose / Change Work'))
        .setStyle(ButtonStyle.Secondary)
    );

    const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(toSmallCaps(
        `# 💼 CURRENT WORK STATUS\n\n` +
        `✅ You are already in work: **${job.emoji} ${job.name}**${cdLine}\n` +
        `Use \`${currentPrefix}working\` to work every 2m or \`${currentPrefix}workshift\` to shift.`
      ))
    );

    const workMsg = await message.reply({
      components: [container, changeJobRow],
      flags: MessageFlags.IsComponentsV2
    });

    const btnCollector = workMsg.createMessageComponentCollector({ time: 30000, max: 1 });
    btnCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Only the command sender can choose/change work here!'), ephemeral: true });
      }
      if (i.customId === 'economy_switch_job_btn') {
        await workMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        await promptJobSelection(message, user, userId, currentPrefix, Date.now(), saveUsers);
      }
    });
    btnCollector.on('end', async () => {
      await workMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  // 2. WORKING
  if (command === 'working') {
    const subArg = (args[0] || '').toLowerCase();

    if (subArg === 'stop' || subArg === 'off') {
      if (!user.workingLoop) {
        return message.reply(toSmallCaps('ℹ️ You are not currently working on a 2m loop.'));
      }
      const loopJob = getAvailableJobs(nowMs).find(j => j.id === user.workingLoop.jobId) || getSelectedJob(user, nowMs);
      const elapsed = Math.max(0, nowMs - Number(user.workingLoop.lastTickAt || user.workingLoop.startedAt || nowMs));
      const completedCycles = Math.floor(elapsed / WORKING_INTERVAL_MS);
      let totalPaid = 0;

      if (completedCycles > 0 && loopJob) {
        for (let c = 0; c < completedCycles; c++) {
          totalPaid += rollJobSalary(loopJob);
        }
        user.cash += totalPaid;
        user.workCount += completedCycles;
      }

      user.workingLoop = null;
      if (typeof trackPeakPoints === 'function') trackPeakPoints(user);
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(
        `🛑 **Stopped Working**\n` +
        `💵 Claimed Cycles (${completedCycles}x 2m): **+$${totalPaid.toLocaleString()}**\n` +
        `🏦 Cash Balance: **$${user.cash.toLocaleString()}**`
      ));
    }

    const job = getSelectedJob(user, nowMs);
    if (!job) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        `⚠️ Choose your work first before running \`${currentPrefix}working\`:`
      );
      return true;
    }

    if (!user.workingLoop) {
      user.workingLoop = {
        jobId: job.id,
        startedAt: nowMs,
        lastTickAt: nowMs
      };
      await saveUsers();
      return message.reply(toSmallCaps(
        `🔨 **Working Started — ${job.emoji} ${job.name}**\n` +
        `⏱️ Earning every **2m** (Next payout in **2m 0s**). Run \`${currentPrefix}working\` again to claim or \`${currentPrefix}working stop\` to stop.`
      ));
    }

    const loopJob = getAvailableJobs(nowMs).find(j => j.id === user.workingLoop.jobId) || job;
    const lastTick = Number(user.workingLoop.lastTickAt || user.workingLoop.startedAt || nowMs);
    const elapsedSinceTick = Math.max(0, nowMs - lastTick);
    const cyclesReady = Math.floor(elapsedSinceTick / WORKING_INTERVAL_MS);

    if (cyclesReady <= 0) {
      const nextPayoutIn = WORKING_INTERVAL_MS - elapsedSinceTick;
      return message.reply(toSmallCaps(
        `⏳ **Working (${loopJob.emoji} ${loopJob.name})**\n` +
        `⏱️ Next 2m payout in: **${formatDurationShort(nextPayoutIn)}**`
      ));
    }

    let earnedCash = 0;
    for (let i = 0; i < cyclesReady; i++) {
      earnedCash += rollJobSalary(loopJob);
    }
    const earnedExp = addExpAndLevelUp(user, null, 80 * cyclesReady);

    user.workingLoop.lastTickAt = lastTick + cyclesReady * WORKING_INTERVAL_MS;
    user.workCount += cyclesReady;
    user.cash += earnedCash;
    if (typeof trackPeakPoints === 'function') trackPeakPoints(user);
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    const nextIn = WORKING_INTERVAL_MS - (nowMs - user.workingLoop.lastTickAt);
    return message.reply(toSmallCaps(
      `🔨 **Working Payout (${loopJob.emoji} ${loopJob.name}) — ${cyclesReady}x 2m**\n` +
      `💵 Earned Cash: **+$${earnedCash.toLocaleString()}**\n` +
      `✨ EXP Gained: **+${earnedExp}**\n` +
      `⏱️ Next 2m payout in: **${formatDurationShort(nextIn)}** | 🏦 Cash: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 3. WORKSHIFT
  if (command === 'workshift') {
    if (args.length > 0) {
      const requestedJob = findJobByQuery(args.join(' '), nowMs);
      if (!requestedJob) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Unknown or expired work "${args.join(' ')}". Choose your work below:`
        );
        return true;
      }
      const applied = await applyChosenWork(user, requestedJob, nowMs, saveUsers);
      if (!applied.ok) {
        return message.reply(toSmallCaps(applied.reason));
      }
    }

    let job = getSelectedJob(user, nowMs);
    if (!job && user.activeShift) {
      job = getAvailableJobs(nowMs).find(j => j.id === user.activeShift.jobId) || null;
    }

    if (!job) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        '⚠️ Choose the work you want to shift for:'
      );
      return true;
    }

    const cdRemaining = getJobCooldownRemaining(user, job.id, nowMs);
    if (cdRemaining > 0 && !user.activeShift) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        `⏳ **${job.emoji} ${job.name}** is on a **1d** cooldown (${formatDurationShort(cdRemaining)} left). Choose another work:`
      );
      return true;
    }

    if (!user.activeShift) {
      user.activeShift = {
        startedAt: nowMs,
        endsAt: nowMs + SHIFT_DURATION_MS,
        jobId: job.id,
        roleName: job.name,
        shiftSalary: job.shiftSalary
      };
      await saveUsers();
      return message.reply(toSmallCaps(
        `⏱️ **Workshift Started (${job.emoji} ${job.name})**\n` +
        `💵 Shift Salary: **$${job.shiftSalary.toLocaleString()}** | Duration: **15m**\n` +
        `Run \`${currentPrefix}workshift\` again when finished to claim.`
      ));
    }

    const remaining = user.activeShift.endsAt - nowMs;
    if (remaining > 0) {
      return message.reply(toSmallCaps(
        `⏳ **Workshift in Progress (${user.activeShift.roleName || job.name})**\n` +
        `⏱️ Time Remaining: **${formatDurationShort(remaining)}** | 💵 Shift Salary: **$${Number(user.activeShift.shiftSalary || job.shiftSalary).toLocaleString()}**`
      ));
    }

    const shiftJobId = user.activeShift.jobId || job.id;
    const shiftRoleName = user.activeShift.roleName || job.name;
    const payoutCash = Number(user.activeShift.shiftSalary) || job.shiftSalary;
    const payoutExp = addExpAndLevelUp(user, null, 220);

    user.activeShift = null;
    user.workCount += 1;
    user.cash += payoutCash;
    if (typeof trackPeakPoints === 'function') trackPeakPoints(user);
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    const shiftJobObj = getAvailableJobs(nowMs).find(j => j.id === shiftJobId);
    const jobBadge = shiftJobObj ? `${shiftJobObj.emoji} ${shiftJobObj.name}` : shiftRoleName;

    return message.reply(toSmallCaps(
      `✅ **Workshift Complete — ${jobBadge}!**\n` +
      `💵 Shift Salary Earned: **+$${payoutCash.toLocaleString()}**\n` +
      `✨ EXP Gained: **+${payoutExp}**\n` +
      `🏦 Cash Balance: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 4. BALANCE
  if (command === 'balance') {
    const targetMention = message.mentions.users.first();
    if (targetMention && targetMention.id !== userId) {
      return message.reply(toSmallCaps(`❌ View your own balance with \`${currentPrefix}balance\`.`));
    }

    updateUserRank(user);
    const displayName = user.customNickname || message.author.username;
    const job = getSelectedJob(user, nowMs);
    const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 💰 ${displayName}'s Balance\n\n`) +
        toSmallCaps(`💵 Cash: **$${user.cash.toLocaleString()}**\n`) +
        toSmallCaps(`🎲 Dice: **${formatDiceDisplay(user.dice)}**\n`) +
        toSmallCaps(`🎟️ Tickets: **${user.tickets.toLocaleString()}**\n`) +
        toSmallCaps(`💼 Current Work: **${job ? `${job.emoji} ${job.name}` : 'None'}**\n`) +
        toSmallCaps(`🏆 Points: **${user.points.toLocaleString()}**\n`) +
        toSmallCaps(`🎖️ Rank: `) + `${user.rank}`
      )
    );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  // 5. CASINO
  if (command === 'casino') {
    const wager = parsePositiveInt(args[0]);
    const currencyMode = (args[1] || 'cash').toLowerCase() === 'dice' ? 'dice' : 'cash';

    if (Number.isNaN(wager) || wager <= 0) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}casino [amount] [cash|dice]\` (e.g. \`${currentPrefix}casino 250 cash\`)`));
    }

    if (currencyMode === 'dice') {
      if (user.dice < wager) {
        return message.reply(toSmallCaps(`❌ You only have **${formatDiceDisplay(user.dice)} 🎲 Dice**!`));
      }
      user.dice -= wager;
      const roll = Math.random();
      let mult = 0;
      let label = '💔 House Wins!';
      if (roll >= 0.92) {
        mult = 3;
        label = '🌟 Mega Casino Hit (3x)!';
      } else if (roll >= 0.52) {
        mult = 2;
        label = '🎉 Casino Win (2x)!';
      }
      const payout = wager * mult;
      user.dice += payout;
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(
        `🎰 **Casino Wheel** — ${label}\n` +
        `🎲 Payout: **${payout > 0 ? `+${payout.toLocaleString()}` : `-${wager.toLocaleString()}`} Dice** | Balance: **${formatDiceDisplay(user.dice)} 🎲**`
      ));
    }

    if (user.cash < wager) {
      return message.reply(toSmallCaps(`❌ You only have **$${user.cash.toLocaleString()}** Cash!`));
    }
    user.cash -= wager;
    const roll = Math.random();
    let mult = 0;
    let label = '💔 House Wins!';
    if (roll >= 0.92) {
      mult = 3;
      label = '🌟 Mega Casino Jackpot (3x)!';
    } else if (roll >= 0.52) {
      mult = 2;
      label = '🎉 Casino Win (2x)!';
    }
    const payout = wager * mult;
    user.cash += payout;
    updateUserRank(user);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎰 **Casino Table** — ${label}\n` +
      `💵 Payout: **${payout > 0 ? `+$${payout.toLocaleString()}` : `-$${wager.toLocaleString()}`}** | Cash: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 6. BLACKJACK
  if (command === 'blackjack') {
    const bet = parsePositiveInt(args[0]);
    if (Number.isNaN(bet) || bet <= 0) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}blackjack [cash_bet]\` (e.g. \`${currentPrefix}blackjack 200\`)`));
    }
    if (user.cash < bet) {
      return message.reply(toSmallCaps(`❌ Insufficient cash! You have **$${user.cash.toLocaleString()}**.`));
    }

    user.cash -= bet;
    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    const formatHand = (hand, hideSecond = false) => {
      if (hideSecond && hand.length > 1) {
        return `${hand[0].label}, [🂠]`;
      }
      return hand.map(c => c.label).join(', ');
    };

    const finishBlackjack = async (msg, outcome) => {
      let payout = 0;
      let statusLine = '';
      if (outcome === 'blackjack') {
        payout = Math.round(bet * 2.5);
        statusLine = `🃏 **BLACKJACK!** You won **+$${payout.toLocaleString()}**!`;
      } else if (outcome === 'win') {
        payout = bet * 2;
        statusLine = `🎉 **You Win!** Payout: **+$${payout.toLocaleString()}**!`;
      } else if (outcome === 'push') {
        payout = bet;
        statusLine = `🤝 **Push (Tie)!** Bet of **$${bet.toLocaleString()}** refunded.`;
      } else {
        statusLine = `💔 **Dealer Wins!** Lost **-$${bet.toLocaleString()}**.`;
      }

      user.cash += payout;
      updateUserRank(user);
      await saveUsers();

      await msg.edit({
        content: toSmallCaps(
          `🃏 **Blackjack Final**\n` +
          `Your Hand: ${formatHand(playerHand)} (**${calculateBlackjackTotal(playerHand)}**)\n` +
          `Dealer Hand: ${formatHand(dealerHand)} (**${calculateBlackjackTotal(dealerHand)}**)\n\n` +
          `${statusLine}\n💵 Cash Balance: **$${user.cash.toLocaleString()}**`
        ),
        components: []
      }).catch(() => {});
    };

    const playerStartTotal = calculateBlackjackTotal(playerHand);
    const dealerStartTotal = calculateBlackjackTotal(dealerHand);
    if (playerStartTotal === 21 || dealerStartTotal === 21) {
      const replyMsg = await message.reply(toSmallCaps('🃏 Checking natural blackjack...'));
      if (playerStartTotal === 21 && dealerStartTotal !== 21) return finishBlackjack(replyMsg, 'blackjack');
      if (playerStartTotal === 21 && dealerStartTotal === 21) return finishBlackjack(replyMsg, 'push');
      return finishBlackjack(replyMsg, 'lose');
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel(toSmallCaps('Hit')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel(toSmallCaps('Stand')).setStyle(ButtonStyle.Success)
    );

    const bjMsg = await message.reply({
      content: toSmallCaps(
        `🃏 **Blackjack** — Bet: **$${bet.toLocaleString()}**\n` +
        `Your Hand: ${formatHand(playerHand)} (**${playerStartTotal}**)\n` +
        `Dealer Hand: ${formatHand(dealerHand, true)}`
      ),
      components: [row]
    });

    const collector = bjMsg.createMessageComponentCollector({ time: 30000 });
    let resolved = false;

    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Not your blackjack table!'), ephemeral: true });
      }

      if (i.customId === 'bj_hit') {
        playerHand.push(drawCard());
        const pTotal = calculateBlackjackTotal(playerHand);
        if (pTotal > 21) {
          resolved = true;
          collector.stop();
          return finishBlackjack(bjMsg, 'bust');
        }
        if (pTotal === 21) {
          resolved = true;
          collector.stop();
          while (calculateBlackjackTotal(dealerHand) < 17) dealerHand.push(drawCard());
          const dTotal = calculateBlackjackTotal(dealerHand);
          if (dTotal === 21) return finishBlackjack(bjMsg, 'push');
          return finishBlackjack(bjMsg, 'win');
        }
        await bjMsg.edit({
          content: toSmallCaps(
            `🃏 **Blackjack** — Bet: **$${bet.toLocaleString()}**\n` +
            `Your Hand: ${formatHand(playerHand)} (**${pTotal}**)\n` +
            `Dealer Hand: ${formatHand(dealerHand, true)}`
          ),
          components: [row]
        }).catch(() => {});
      } else if (i.customId === 'bj_stand') {
        resolved = true;
        collector.stop();
        while (calculateBlackjackTotal(dealerHand) < 17) {
          dealerHand.push(drawCard());
        }
        const pTotal = calculateBlackjackTotal(playerHand);
        const dTotal = calculateBlackjackTotal(dealerHand);
        if (dTotal > 21 || pTotal > dTotal) return finishBlackjack(bjMsg, 'win');
        if (pTotal === dTotal) return finishBlackjack(bjMsg, 'push');
        return finishBlackjack(bjMsg, 'lose');
      }
    });

    collector.on('end', async () => {
      if (!resolved) {
        resolved = true;
        return finishBlackjack(bjMsg, 'lose');
      }
    });
    return true;
  }

  // 7. COINFLIP
  if (command === 'coinflip') {
    const bet = parsePositiveInt(args[0]);
    const choiceArg = (args[1] || '').toLowerCase();
    const pick = ['heads', 'h'].includes(choiceArg) ? 'Heads' : ['tails', 't'].includes(choiceArg) ? 'Tails' : null;

    if (Number.isNaN(bet) || bet <= 0 || !pick) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}coinflip [cash_bet] [heads|tails]\` (e.g. \`${currentPrefix}coinflip 150 heads\`)`));
    }
    if (user.cash < bet) {
      return message.reply(toSmallCaps(`❌ You only have **$${user.cash.toLocaleString()}** Cash!`));
    }

    user.cash -= bet;
    const flipped = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const won = flipped === pick;
    if (won) {
      user.cash += bet * 2;
    }
    updateUserRank(user);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🪙 Coin landed on **${flipped}** (You picked **${pick}**)\n` +
      `${won ? `🎉 You won **+$${(bet * 2).toLocaleString()}**!` : `💔 You lost **-$${bet.toLocaleString()}**.`}\n` +
      `💵 Cash Balance: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 8. TICKETBUY
  if (command === 'ticketbuy') {
    const qty = Math.max(1, parsePositiveInt(args[0]) || 1);
    const unitPrice = 250;
    const totalCost = qty * unitPrice;

    if (user.cash < totalCost) {
      return message.reply(toSmallCaps(
        `❌ You need **$${totalCost.toLocaleString()}** to buy **${qty}x Ticket(s)** ($${unitPrice} each), but you have **$${user.cash.toLocaleString()}**.`
      ));
    }

    user.cash -= totalCost;
    user.tickets += qty;
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ Purchased **+${qty}x Ticket(s)** for **$${totalCost.toLocaleString()}**!\n` +
      `🎟️ Total Tickets: **${user.tickets}** | 💵 Cash: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 9. TICKETUSE
  if (command === 'ticketuse') {
    const qty = Math.min(Math.max(1, parsePositiveInt(args[0]) || 1), user.tickets);
    if (user.tickets <= 0) {
      return message.reply(toSmallCaps(`❌ You don't have any tickets! Buy some with \`${currentPrefix}ticketbuy [qty]\`.`));
    }

    user.tickets -= qty;
    const bonusDice = qty * 4;
    const bonusCash = qty * 100;
    user.dice += bonusDice;
    user.cash += bonusCash;
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ Used **${qty}x Ticket(s)**!\n` +
      `🎲 Received: **+${bonusDice}x Dice** | 💵 Received: **+$${bonusCash.toLocaleString()}**\n` +
      `🎟️ Remaining Tickets: **${user.tickets}** | 🎲 Dice: **${formatDiceDisplay(user.dice)}**`
    ));
  }

  // 10. LOTTERY
  if (command === 'lottery') {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'draw') {
      if (db.config.lotteryEntries.length === 0) {
        return message.reply(toSmallCaps(`🎟️ No lottery tickets have been entered yet! Use \`${currentPrefix}lottery\` with a ticket to join.`));
      }
      const winnerId = db.config.lotteryEntries[Math.floor(Math.random() * db.config.lotteryEntries.length)];
      const jackpot = db.config.lotteryPool;
      db.config.lotteryEntries = [];
      db.config.lotteryPool = 5000;

      ensureUser(winnerId);
      ensureEconomyFields(db.users[winnerId], nowMs);
      db.users[winnerId].cash += jackpot;
      if (typeof trackPeakPoints === 'function') trackPeakPoints(db.users[winnerId]);
      updateUserRank(db.users[winnerId]);
      await saveUsers();

      return message.reply(toSmallCaps(
        `🎉 **Lottery Draw Complete!**\n` +
        `🏆 Winner: <@${winnerId}>\n` +
        `💰 Jackpot Prize: **$${jackpot.toLocaleString()}**`
      ));
    }

    if (user.tickets < 1) {
      return message.reply(toSmallCaps(
        `🎟️ **Chibi Lottery**\n` +
        `Current Jackpot: **$${db.config.lotteryPool.toLocaleString()}** | Entries: **${db.config.lotteryEntries.length}**\n` +
        `Buy a ticket with \`${currentPrefix}ticketbuy\` and enter with \`${currentPrefix}lottery\`!`
      ));
    }

    user.tickets -= 1;
    db.config.lotteryEntries.push(userId);
    db.config.lotteryPool += 350;
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ You entered the **Chibi Lottery** using **1x Ticket**!\n` +
      `💰 Current Jackpot: **$${db.config.lotteryPool.toLocaleString()}**\n` +
      `🎟️ Your Tickets Left: **${user.tickets}** | Total Entries: **${db.config.lotteryEntries.length}**`
    ));
  }

  // 11. CSELL
  if (command === 'csell') {
    if (user.inventory.chibis.length === 0) {
      return message.reply(toSmallCaps(`❌ Your chibi collection is empty! Use \`${currentPrefix}roll\` first.`));
    }

    let qtyToSell = 1;
    let rarityFilter = null;

    for (const arg of args) {
      const parsedNum = parsePositiveInt(arg);
      if (!Number.isNaN(parsedNum) && parsedNum > 0) {
        qtyToSell = parsedNum;
      } else if (arg && arg.trim()) {
        rarityFilter = arg.trim().toUpperCase();
      }
    }

    const equippedSet = new Set([...(user.team || []), user.equippedChibi].filter(Boolean));
    const sellableIndices = [];
    user.inventory.chibis.forEach((chibi, idx) => {
      const cId = chibi.chibiId || chibi.id;
      const matchesRarity = !rarityFilter || (chibi.rarity || '').toUpperCase() === rarityFilter;
      if (matchesRarity && !equippedSet.has(cId)) {
        sellableIndices.push(idx);
      }
    });

    if (sellableIndices.length === 0) {
      const targetMsg = rarityFilter ? ` with rarity **${rarityFilter}**` : '';
      return message.reply(toSmallCaps(`❌ No unequipped chibis${targetMsg} available to sell.`));
    }

    const actualSellCount = Math.min(qtyToSell, sellableIndices.length);
    const chosenIndices = sellableIndices.slice(0, actualSellCount);
    const chosenSet = new Set(chosenIndices);

    let totalCashEarned = 0;
    const soldPreview = [];

    chosenIndices.forEach(idx => {
      const c = user.inventory.chibis[idx];
      const baseVal = RARITY_SELL_VALUES[(c.rarity || 'C').toUpperCase()] || 15;
      const shinyMult = c.isShiny ? 3 : 1;
      const lvlBonus = Math.max(0, (Number(c.level) || 1) - 1) * 5;
      const val = (baseVal + lvlBonus) * shinyMult;
      totalCashEarned += val;
      if (soldPreview.length < 5) {
        soldPreview.push(`${rarityIconsMap?.[c.rarity] || '📦'} ${c.emoji || '✨'} **${c.name}** (+$${val.toLocaleString()})`);
      }
    });

    user.inventory.chibis = user.inventory.chibis.filter((_, idx) => !chosenSet.has(idx));
    user.cash += totalCashEarned;
    updateUserRank(user);
    await saveUsers();

    const extraCount = actualSellCount - soldPreview.length;
    const extraLine = extraCount > 0 ? `\n*...and ${extraCount} more.*` : '';

    const container = new ContainerBuilder().setAccentColor(0xe67e22).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 💵 Sold ${actualSellCount}x Chibi(s)\n\n`) +
        soldPreview.join('\n') +
        toSmallCaps(`${extraLine}\n\nTotal Cash Earned: **+$${totalCashEarned.toLocaleString()}**\nCash Balance: **$${user.cash.toLocaleString()}**`)
      )
    );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  return false;
}

module.exports = {
  commands: ECONOMY_COMMANDS,
  execute
};