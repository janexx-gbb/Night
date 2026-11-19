const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { toSmallCaps } = require('../core/helpers');

const PING_CMDS = ['ping'];

// Green / yellow / red depending on how fast the bot is responding.
function getLatencyStatus(ms) {
  if (ms < 150) return { label: '🟢 Excellent', color: 0x2ecc71 };
  if (ms < 400) return { label: '🟡 Okay', color: 0xf1c40f };
  return { label: '🔴 Slow', color: 0xe74c3c };
}

async function execute(ctx) {
  const { command, message, client } = ctx;

  if (!PING_CMDS.includes(command)) return false;

  const sent = await message.reply(toSmallCaps('🏓 Pinging...'));

  // Round trip: time from the user's message to the bot's reply showing up on Discord.
  const roundTrip = sent.createdTimestamp - message.createdTimestamp;
  // Heartbeat: the bot's connection to Discord's gateway. It is -1 until the first heartbeat.
  const heartbeat = client.ws.ping;
  const heartbeatText = heartbeat >= 0 ? `${heartbeat}ms` : 'Measuring...';

  const status = getLatencyStatus(roundTrip);

  const container = new ContainerBuilder()
    .setAccentColor(status.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(
          '# 🏓 Pong!\n\n' +
          `⏱️ Response Time: ${roundTrip}ms\n` +
          `💓 Heartbeat: ${heartbeatText}\n` +
          `📶 Status: ${status.label}`
        )
      )
    );

  await sent.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 });
  return true;
}

module.exports = {
  commands: PING_CMDS,
  execute
};
