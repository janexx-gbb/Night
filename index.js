const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Data persistence helper
const dataFile = path.join(__dirname, 'data.json');
function readData() {
    if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, JSON.stringify({ users: {}, market: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getUser(userId) {
    const data = readData();
    if (!data.users[userId]) {
        data.users[userId] = { wallet: 100, bank: 500, inventory: [] };
        saveData(data);
    }
    return data.users[userId];
}

// Define Slash Commands
const commands = [
    // Balance
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your or another user\'s wallet and bank balance.')
        .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(false)),

    // Economy (Work / Daily)
    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward credits!'),
    new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work hard at your job to earn coins.'),

    // Market / Shop
    new SlashCommandBuilder()
        .setName('market')
        .setDescription('View items available in the community market.'),
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the market using its item ID.')
        .addIntegerOption(option => option.setName('id').setDescription('Item ID from /market').setRequired(true)),

    // Hunting
    new SlashCommandBuilder()
        .setName('hunt')
        .setDescription('Go hunting in the wild for animals and loot!'),

    // Fun
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Bet your coins on a coinflip game!')
        .addStringOption(option => 
            option.setName('choice').setDescription('Heads or Tails').setRequired(true)
                .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to bet').setRequired(true)),

    // Guild Info
    new SlashCommandBuilder()
        .setName('guild')
        .setDescription('Display detailed information about this server.'),

    // Bot Details
    new SlashCommandBuilder()
        .setName('botdetails')
        .setDescription('Displays technical details and uptime about this bot.'),

    // Admin Commands
    new SlashCommandBuilder()
        .setName('admin-give')
        .setDescription('Admin command to give currency to a user.')
        .addUserOption(option => option.setName('target').setDescription('User to give coins to').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of coins').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

client.once('ready', async () => {
    console.log(`Logged in successfully as ${client.user.tag}!`);

    // Register Slash Commands Globally or to Guilds
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    try {
        // --- BALANCE MODULE ---
        if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const userData = getUser(target.id);
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`💰 ${target.username}'s Balance`)
                .addFields(
                    { name: 'Wallet', value: `🪙 ${userData.wallet} coins`, inline: true },
                    { name: 'Bank', value: `🏦 ${userData.bank} coins`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        // --- EARNING MODULE (Daily / Work) ---
        else if (commandName === 'daily') {
            const data = readData();
            const user = getUser(interaction.user.id);
            const now = Date.now();
            
            if (user.lastDaily && now - user.lastDaily < 86400000) {
                const timeLeft = Math.ceil((86400000 - (now - user.lastDaily)) / (1000 * 60 * 60));
                return interaction.reply({ content: `⏳ You already claimed your daily reward! Come back in about **${timeLeft} hours**.`, ephemeral: true });
            }

            user.wallet += 500;
            user.lastDaily = now;
            data.users[interaction.user.id] = user;
            saveData(data);

            await interaction.reply('🎉 You successfully claimed your daily **500 coins**!');
        }
        else if (commandName === 'work') {
            const data = readData();
            const user = getUser(interaction.user.id);
            const now = Date.now();

            if (user.lastWork && now - user.lastWork < 3600000) {
                return interaction.reply({ content: '⏱️ You are tired from working! Rest for a bit (cooldown: 1 hour).', ephemeral: true });
            }

            const earnings = Math.floor(Math.random() * 150) + 50;
            user.wallet += earnings;
            user.lastWork = now;
            data.users[interaction.user.id] = user;
            saveData(data);

            await interaction.reply(`🛠️ You worked hard and earned **${earnings} coins**!`);
        }

        // --- MARKET MODULE ---
        else if (commandName === 'market') {
            const data = readData();
            const embed = new EmbedBuilder()
                .setColor('#00ffcc')
                .setTitle('🛒 Community Market & Shop')
                .setDescription('Use `/buy [id]` to purchase an item.');

            if (data.market.length === 0) {
                embed.addFields({ name: 'Empty', value: 'No items currently listed.' });
            } else {
                data.market.forEach(item => {
                    embed.addFields({ name: `[ID: ${item.id}] ${item.name} - 🪙 ${item.price}`, value: item.description });
                });
            }
            await interaction.reply({ embeds: [embed] });
        }
        else if (commandName === 'buy') {
            const itemId = interaction.options.getInteger('id');
            const data = readData();
            const item = data.market.find(i => i.id === itemId);

            if (!item) return interaction.reply({ content: '❌ Item ID not found in the market.', ephemeral: true });

            const user = getUser(interaction.user.id);
            if (user.wallet < item.price) {
                return interaction.reply({ content: `❌ You do not have enough wallet balance! This item costs 🪙 ${item.price}.`, ephemeral: true });
            }

            user.wallet -= item.price;
            user.inventory.push(item.name);
            data.users[interaction.user.id] = user;
            saveData(data);

            await interaction.reply(`✅ Success! You bought **${item.name}** for 🪙 ${item.price}.`);
        }

        // --- HUNTING MODULE ---
        else if (commandName === 'hunt') {
            const data = readData();
            const user = getUser(interaction.user.id);
            const now = Date.now();

            if (user.lastHunt && now - user.lastHunt < 45000) {
                return interaction.reply({ content: '🎯 You are reloading your gear. Wait 45 seconds before hunting again.', ephemeral: true });
            }

            const hasRifle = user.inventory.includes('Hunting Rifle');
            const catchChance = Math.random();

            user.lastHunt = now;
            data.users[interaction.user.id] = user;
            saveData(data);

            if (!hasRifle && catchChance < 0.6) {
                return interaction.reply('🌲 You went hunting empty-handed and scared away a deer. *(Tip: Buy a Hunting Rifle from `/market`!)*');
            }

            const preys = [
                { name: 'Wild Rabbit', reward: 80 },
                { name: 'Forest Deer', reward: 200 },
                { name: 'Wild Boar', reward: 350 },
                { name: 'Legendary Bear', reward: 700 }
            ];
            const caught = preys[Math.floor(Math.random() * preys.length)];
            user.wallet += caught.reward;
            saveData(data);

            await interaction.reply(`🏹 Direct hit! You hunted a **${caught.name}** and sold its hide/meat for **${caught.reward} coins**!`);
        }

        // --- FUN MODULE ---
        else if (commandName === 'coinflip') {
            const choice = interaction.options.getString('choice');
            const amount = interaction.options.getInteger('amount');
            const data = readData();
            const user = getUser(interaction.user.id);

            if (amount <= 0 || user.wallet < amount) {
                return interaction.reply({ content: '❌ Invalid bet amount or insufficient funds in your wallet.', ephemeral: true });
            }

            const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
            const won = choice === outcome;

            if (won) {
                user.wallet += amount;
                await interaction.reply(`🪙 It landed on **${outcome}**! You guessed right and won **${amount} coins**!`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`🪙 It landed on **${outcome}**! You guessed wrong and lost **${amount} coins**.`);
            }
            data.users[interaction.user.id] = user;
            saveData(data);
        }

        // --- GUILD INFO MODULE ---
        else if (commandName === 'guild') {
            const { guild } = interaction;
            const owner = await guild.fetchOwner();

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🏰 Server Details: ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: 'Owner', value: `${owner.user.tag}`, inline: true },
                    { name: 'Members', value: `${guild.memberCount}`, inline: true },
                    { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
                );
            await interaction.reply({ embeds: [embed] });
        }

        // --- BOT DETAILS MODULE ---
        else if (commandName === 'botdetails') {
            const uptimeSecs = Math.floor(client.uptime / 1000);
            const hours = Math.floor(uptimeSecs / 3600);
            const minutes = Math.floor((uptimeSecs % 3600) / 60);

            const embed = new EmbedBuilder()
                .setColor('#ffffff')
                .setTitle('🤖 Bot Technical Details')
                .addFields(
                    { name: 'Library', value: 'Discord.js v14', inline: true },
                    { name: 'Hosting Platform', value: 'Railway + GitHub', inline: true },
                    { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true }
                );
            await interaction.reply({ embeds: [embed] });
        }

        // --- ADMIN COMMANDS MODULE ---
        else if (commandName === 'admin-give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const data = readData();
            const targetUser = getUser(target.id);

            targetUser.wallet += amount;
            data.users[target.id] = targetUser;
            saveData(data);

            await interaction.reply({ content: `✅ Successfully added **${amount} coins** to ${target.tag}'s wallet.`, ephemeral: true });
        }

    } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'There was an error executing this command.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
