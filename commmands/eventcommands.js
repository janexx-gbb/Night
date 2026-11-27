const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const { BETA_EMOJIS, EVENT_ICONS, EVENT_NPCS, EVENT_CHIBIS_POOL, SHINY_ICON } = require('../core/constants');
const database = require('../core/database');
const { gameData, db, saveUsers } = database;
const { toSmallCaps, evaluateAndSyncUserBadges, addExpAndLevelUp, ensureUser } = require('../core/helpers');

const EVENT_CMDS = ['event', 'ecrystal', 'eadventure', 'ca', 'eshop', 'es'];

async function execute(ctx) {
  const { command, message, currentPrefix, callerHasBetaView } = ctx;
  const normalizedCmd = String(command || '').toLowerCase();
  if (!EVENT_CMDS.includes(normalizedCmd)) return false;

  const userId = ctx.userId || message.author.id;
  ensureUser(userId);
  const user = ctx.user || db.users[userId];

  if (!db.config.eventCrystals || typeof db.config.eventCrystals !== 'object') {
    db.config.eventCrystals = {};
  }

  if (normalizedCmd === 'event') {
    if (!db.config.eventActive) {
      await message.reply(toSmallCaps('❌ The Beta Event is currently inactive!'));
      return true;
    }

    const crystals = Number(db.config.eventCrystals[userId]) || 0;
    const eventDescription = 'Welcome to the official Chibi RPG Beta Event! Embark on thrilling adventures, challenge mysterious wandering NPCs across the realm, battle rival players in the arena, and collect exclusive rare event chibis using event crystals to claim supreme glory and build the ultimate collection!';

    await message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x9b59b6)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 📦 BETA EVENT HUB & INFORMATION\n\n${EVENT_ICONS.TIPS} **DESCRIPTION:**\n${eventDescription}\n\n` +
                `-----------------------------------\n🎯 **HOW TO PARTICIPATE:**\n` +
                `• TYPE \`${currentPrefix}eadventure\` (OR \`${currentPrefix}ca\`) TO EXPLORE AND BATTLE WANDERING EVENT NPCS.\n` +
                `• TYPE \`${currentPrefix}battle [@user]\` TO CLASH AGAINST OTHER PLAYERS IN 3v3 ARENA BATTLES.\n` +
                `• TYPE \`${currentPrefix}eshop\` (OR \`${currentPrefix}es\`) TO OPEN THE EVENT SHOP AND TRADE YOUR CRYSTALS.\n\n` +
                `💎 **HOW CAN I EARN CRYSTALS:**\n` +
                `• BATTLING PLAYERS (\`${currentPrefix}battle\`): WINNING REWARDS YOU WITH 10–16 CRYSTALS ${EVENT_ICONS.CRYSTAL}, WHILE LOSING GRANTS 2–8 CRYSTALS.\n` +
                `• ADVENTURE (\`${currentPrefix}eadventure\`): DEFEATING WANDERING NPCS REWARDS YOU WITH 17 CRYSTALS ${EVENT_ICONS.CRYSTAL}, OR 8 CRYSTALS IF DEFEATED.\n` +
                `• TRIVIA (\`${currentPrefix}trivia\`): CORRECT ANSWERS AWARD BONUS POINTS AND XP.\n\n` +
                `🎁 **HOW CAN I CLAIM & EXCHANGE MY REWARD:**\n` +
                `• ACCUMULATE EVENT CRYSTALS AND OPEN THE EVENT SHOP USING \`${currentPrefix}eshop\`.\n\n` +
                `YOUR CRYSTALS: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`
              )
            )
          )
      ],
      flags: MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (normalizedCmd === 'ecrystal') {
    const crystals = Number(db.config.eventCrystals[userId]) || 0;
    await message.reply(
      toSmallCaps(`💎 You currently have **${crystals.toLocaleString()}** Event Crystals ${EVENT_ICONS.CRYSTAL}.`)
    );
    return true;
  }

  if (normalizedCmd === 'eadventure' || normalizedCmd === 'ca') {
    if (!db.config.eventActive) {
      await message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      return true;
    }

    const randomNpc = EVENT_NPCS[Math.floor(Math.random() * EVENT_NPCS.length)];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('accept_npc_fight')
        .setLabel(toSmallCaps('Fight NPC ⚔️'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('decline_npc_fight')
        .setLabel(toSmallCaps('Run Away 🏃'))
        .setStyle(ButtonStyle.Secondary)
    );

    const advMsg = await message.reply({
      content: toSmallCaps(
        `${randomNpc.icon} **${randomNpc.name}**\n\n<@${userId}> You spotted an NPC and they want to fight you! Do you want to accept this challenge? (Expires in 10s)`
      ),
      components: [row]
    });

    const collector = advMsg.createMessageComponentCollector({ time: 10000 });
    let handled = false;

    collector.on('collect', async i => {
      if (i.user.id !== userId) {
        await i.reply({ content: toSmallCaps('Not your adventure encounter!'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      if (!i.deferred && !i.replied) {
        await i.deferUpdate().catch(() => {});
      }

      if (handled) return;
      handled = true;
      collector.stop('handled');

      if (i.customId === 'decline_npc_fight') {
        await advMsg.edit({
          content: toSmallCaps(`🏃 You fled from ${randomNpc.name}. Safe travels!`),
          components: []
        }).catch(() => {});
        return;
      }

      if (i.customId === 'accept_npc_fight') {
        const npcAtk = Math.floor(Math.random() * 36) + 10;
        const npcHp = Math.floor(Math.random() * 1329) + 400;
        const npcDef = Math.floor(Math.random() * 66) + 40;

        const eventPool = (Array.isArray(gameData.eventChibis) && gameData.eventChibis.length > 0)
          ? gameData.eventChibis
          : EVENT_CHIBIS_POOL;
        const npcRandomChibi = eventPool[Math.floor(Math.random() * eventPool.length)];

        const userChibis = Array.isArray(user.inventory?.chibis) ? user.inventory.chibis : [];
        const userTeam = (Array.isArray(user.team) ? user.team : [null, null, null]).map(id =>
          id ? userChibis.find(c => (c.chibiId || c.id) === id) : null
        );

        let userPower = 50;
        userTeam.forEach(c => {
          if (c) {
            const statCfg = gameData.stats?.[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || {
              hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1
            };
            const lvl = Number(c.level) || 1;
            userPower += (statCfg.hp + lvl * (statCfg.hpPer || 0)) + (statCfg.atk + lvl * (statCfg.atkPer || 0)) * 3;
          }
        });

        const isUserWinner = userPower >= (npcHp + npcAtk * 3 + npcDef * 2) * (0.85 + Math.random() * 0.3);

        const rewardCrystal = isUserWinner ? 17 : 8;
        let npcDropText = isUserWinner ? 'NO SHINY DROP (0.1% CHANCE)' : 'DEFEATED (NO DROP)';
        db.config.eventCrystals[userId] = (Number(db.config.eventCrystals[userId]) || 0) + rewardCrystal;

        if (isUserWinner && Math.random() * 100 <= 0.1 && eventPool.length > 0) {
          const droppedEventChibi = eventPool[Math.floor(Math.random() * eventPool.length)];
          const generatedId = new mongoose.Types.ObjectId().toString();
          if (!user.inventory) user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
          if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];
          user.inventory.chibis.push({
            id: generatedId,
            chibiId: generatedId,
            name: droppedEventChibi.name,
            rarity: 'SSRP',
            emoji: droppedEventChibi.emoji,
            isShiny: true,
            isEvent: true,
            level: 1,
            exp: 0,
            date: new Date().toLocaleDateString()
          });
          npcDropText = `RECEIVED SHINY ${SHINY_ICON} ${droppedEventChibi.emoji} ${droppedEventChibi.name}`;
        }

        const awardedExp = addExpAndLevelUp(user, userTeam.find(Boolean), 350);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();

        const resultContainer = new ContainerBuilder()
          .setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# ⚔️ ADVENTURE BATTLE RESULT\n\n` +
                `OPPONENT: ${randomNpc.icon} ${randomNpc.name}\n` +
                `NPC CHIBI: ${npcRandomChibi.emoji} ${npcRandomChibi.name}\n` +
                `NPC STATS -> ${callerHasBetaView ? BETA_EMOJIS.ATK : '⚔️'} ATK: ${npcAtk} | ${callerHasBetaView ? BETA_EMOJIS.HP : '❤️'} HP: ${npcHp}\n` +
                `${callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️'} DEF: ${npcDef}\n\n` +
                `${isUserWinner ? '🏆 VICTORY! YOU DEFEATED THE NPC!' : '💔 DEFEATED BY THE NPC!'}\n` +
                `💎 CRYSTALS EARNED: +${rewardCrystal} ${EVENT_ICONS.CRYSTAL}\n` +
                `🎁 NPC DROP: ${npcDropText}\n` +
                `✨ EXP GAINED: +${awardedExp}`
              )
            )
          );

        await advMsg.edit({
          content: null,
          components: [resultContainer],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (!handled && reason === 'time') {
        await advMsg.edit({
          content: toSmallCaps(`⏳ Encounter with ${randomNpc.name} timed out.`),
          components: []
        }).catch(() => {});
      }
    });

    return true;
  }

  if (normalizedCmd === 'eshop' || normalizedCmd === 'es') {
    if (!db.config.eventActive) {
      await message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      return true;
    }

    const crystals = Number(db.config.eventCrystals[userId]) || 0;

    const shopMap = (db.config.eventShop && Object.keys(db.config.eventShop).length > 0)
      ? db.config.eventShop
      : Object.fromEntries((gameData.eventChibis || EVENT_CHIBIS_POOL || []).map(c => [String(c.id), c]));

    const shopItems = Object.values(shopMap).sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
    if (!shopItems.length) {
      await message.reply(toSmallCaps('❌ The Event Shop is currently empty!'));
      return true;
    }

    const shopLines = shopItems
      .map((item, idx) =>
        toSmallCaps(`**[${idx + 1}]** ${item.emoji} **${item.name}** — **${Number(item.cost).toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`)
      )
      .join('\n');

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('eshop_buy_select')
        .setPlaceholder(toSmallCaps('Select an event chibi to purchase'))
        .addOptions(
          shopItems.slice(0, 25).map(item => ({
            label: `${item.name} (${item.cost} Crystals)`.slice(0, 100),
            value: String(item.id)
          }))
        )
    );

    const container = new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(
            `# 💎 Beta Event Crystal Shop\n\n` +
            `Your Crystal Balance: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n` +
            `*Select from the dropdown menu below to exchange your crystals for exclusive SSRP event chibis!*:\n\n`
          ) + shopLines
        )
      );

    const shopMsg = await message.reply({
      components: [container, row],
      flags: MessageFlags.IsComponentsV2
    });

    const collector = shopMsg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
      if (i.user.id !== userId) {
        await i.reply({ content: toSmallCaps('Not your eshop session!'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      if (i.customId !== 'eshop_buy_select') return;

      if (!i.deferred && !i.replied) {
        await i.deferUpdate().catch(() => {});
      }

      const item = shopMap[i.values[0]];
      const userCrystals = Number(db.config.eventCrystals[userId]) || 0;

      if (!item) {
        await i.followUp({ content: toSmallCaps('❌ Item not found!'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      const itemCost = Number(item.cost) || 0;
      if (userCrystals < itemCost) {
        await i.followUp({
          content: toSmallCaps(`❌ You need **${itemCost.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}, but you only have **${userCrystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}!`),
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return;
      }

      db.config.eventCrystals[userId] = userCrystals - itemCost;

      const generatedId = new mongoose.Types.ObjectId().toString();
      if (!user.inventory) user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
      if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];

      user.inventory.chibis.push({
        id: generatedId,
        chibiId: generatedId,
        name: item.name,
        rarity: 'SSRP',
        emoji: item.emoji,
        isShiny: false,
        isEvent: true,
        level: 1,
        exp: 0,
        date: new Date().toLocaleDateString()
      });

      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();

      // Refresh displayed crystal balance in the shop embed
      const updatedBalance = Number(db.config.eventCrystals[userId]) || 0;
      const updatedContainer = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 💎 Beta Event Crystal Shop\n\n` +
              `Your Crystal Balance: **${updatedBalance.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n` +
              `*Select from the dropdown menu below to exchange your crystals for exclusive SSRP event chibis!*:\n\n`
            ) + shopLines
          )
        );

      await shopMsg.edit({
        components: [updatedContainer, row],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});

      await i.followUp({
        content: toSmallCaps(
          `✅ Successfully purchased ${item.emoji} **${item.name}**! It has been added directly to your collections with the Event badge ${EVENT_ICONS.EVENT_BADGE}.`
        ),
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    });

    collector.on('end', async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        StringSelectMenuBuilder.from(row.components[0]).setDisabled(true)
      );
      await shopMsg.edit({
        components: [container, disabledRow],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    });

    return true;
  }

  return false;
}

module.exports = { commands: EVENT_CMDS, execute };