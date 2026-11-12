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

const dataFile = path.join(__dirname, 'data.json');

function readData() {
    if (!fs.existsSync(dataFile)) {
        const initialData = {
            users: {},
            market: [
                { id: 1, name: 'Rifle', price: 100000, type: 'tool', description: 'Basic hunting tool.' },
                { id: 2, name: 'Lucky Charm', price: 500000, type: 'charm', luckBoost: 0.10, description: 'Increased Luck by 10%' },
                { id: 3, name: 'Lucky Charm II', price: 2000000, type: 'charm', luckBoost: 0.30, description: 'Increased Luck by 30%' },
                { id: 4, name: 'Lucky Charm III', price: 10000000, type: 'charm', luckBoost: 0.50, description: 'Increased Luck by 50%' }
            ],
            globalEvent: { luckBonus: 0, catchRateBonus: 0 }
        };
        fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
    }
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getUser(userId) {
    const data = readData();
    if (!data.users[userId]) {
        data.users[userId] = { 
            wallet: 500, 
            bank: 1000, 
            inventory: [], 
            collection: {}, 
            cooldowns: {} 
        };
        saveData(data);
    }
    return data.users[userId];
}

// Animal Database with exact rates & tier colors
const HUNT_ANIMALS = [
    // Common (45%)
    { name: 'Worm', tier: 'Common', color: '🔴', rate: 0.45, reward: 50 },
    { name: 'Dog', tier: 'Common', color: '🔴', rate: 0.45, reward: 60 },
    { name: 'Bird', tier: 'Common', color: '🔴', rate: 0.45, reward: 60 },
    { name: 'Cat', tier: 'Common', color: '🔴', rate: 0.45, reward: 60 },
    { name: 'Butterfly', tier: 'Common', color: '🔴', rate: 0.45, reward: 40 },
    { name: 'Snail', tier: 'Common', color: '🔴', rate: 0.45, reward: 40 },
    // Uncommon (20%)
    { name: 'Bee', tier: 'Uncommon', color: '🟡', rate: 0.20, reward: 120 },
    { name: 'Mouse', tier: 'Uncommon', color: '🟡', rate: 0.20, reward: 130 },
    { name: 'Rabbit', tier: 'Uncommon', color: '🟡', rate: 0.20, reward: 150 },
    { name: 'Frog', tier: 'Uncommon', color: '🟡', rate: 0.20, reward: 140 },
    { name: 'Fish', tier: 'Uncommon', color: '🟡', rate: 0.20, reward: 150 },
    // Rare (10%)
    { name: 'Cow', tier: 'Rare', color: '🔵', rate: 0.10, reward: 400 },
    { name: 'Pig', tier: 'Rare', color: '🔵', rate: 0.10, reward: 350 },
    { name: 'Kangaroo', tier: 'Rare', color: '🔵', rate: 0.10, reward: 500 },
    { name: 'Bear', tier: 'Rare', color: '🔵', rate: 0.10, reward: 600 },
    { name: 'Panda', tier: 'Rare', color: '🔵', rate: 0.10, reward: 650 },
    // Epic (6%)
    { name: 'Whale', tier: 'Epic', color: '🟣', rate: 0.06, reward: 1500 },
    { name: 'Penguin', tier: 'Epic', color: '🟣', rate: 0.06, reward: 1200 },
    { name: 'Camel', tier: 'Epic', color: '🟣', rate: 0.06, reward: 1300 },
    { name: 'Dove', tier: 'Epic', color: '🟣', rate: 0.06, reward: 1100 },
    // Legendary (3%)
    { name: 'Elephant', tier: 'Legendary', color: '🟠', rate: 0.03, reward: 4000 },
    { name: 'Crocodile', tier: 'Legendary', color: '🟠', rate: 0.03, reward: 4500 },
    { name: 'Crow', tier: 'Legendary', color: '🟠', rate: 0.03, reward: 3500 },
    { name: 'Tiger', tier: 'Legendary', color: '🟠', rate: 0.03, reward: 5000 },
    // Mythical (1%)
    { name: 'Deer', tier: 'Mythical', color: '🔵', rate: 0.01, reward: 12000 },
    { name: 'Lion', tier: 'Mythical', color: '🔵', rate: 0.01, reward: 15000 },
    // S+ Tier (0.50%)
    { name: 'Ghost', tier: 'S+ Tier', color: '🩵', rate: 0.005, reward: 35000 },
    { name: 'Skeleton', tier: 'S+ Tier', color: '🩵', rate: 0.005, reward: 30000 },
    // SS+ Tier (0.5%)
    { name: 'Dragon', tier: 'SS+ Tier', color: '🩷', rate: 0.005, reward: 50000 },
    // SSS+ Tier (0.1%)
    { name: 'Unicorn', tier: 'SSS+ Tier', color: '🟣', rate: 0.001, reward: 120000 },
    { name: 'Dinosaur', tier: 'SSS+ Tier', color: '🟣', rate: 0.001, reward: 150000 },
    // GOD Tier (0.01%)
    { name: 'Snowman', tier: 'GOD Tier', color: '🌈', rate: 0.0001, reward: 500000 }
];

// Define Commands
const commands = [
    new SlashCommandBuilder().setName('balance').setDescription('Check wallet and bank balance.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for quick starter coins.'),
    new SlashCommandBuilder().setName('work').setDescription('Work to earn coins.'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Bet coins on coinflip.')
        .addStringOption(o => o.setName('choice').setDescription('Heads or Tails').setRequired(true).addChoices({name:'Heads', value:'heads'}, {name:'Tails', value:'tails'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('slot').setDescription('Play the slot machine.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('blackjack').setDescription('Play a game of blackjack.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('market').setDescription('View the item shop market.'),
    new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the market.')
        .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true)),
    new SlashCommandBuilder().setName('hunt').setDescription('Go hunting for creatures and build your collection!'),
    new SlashCommandBuilder().setName('collection').setDescription('View your hunted animal collection.'),
    new SlashCommandBuilder().setName('bank').setDescription('Deposit or withdraw coins from your bank.')
        .addStringOption(o => o.setName('action').setDescription('deposit or withdraw').setRequired(true).addChoices({name:'Deposit', value:'deposit'}, {name:'Withdraw', value:'withdraw'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('give').setDescription('Transfer coins to another user.')
        .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('trade').setDescription('Offer an item/charm to another user.')
        .addUserOption(o => o.setName('target').setDescription('Trade partner').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name from inventory').setRequired(true)),
    
    // Admin Commands
    new SlashCommandBuilder().setName('admin-give').setDescription('Admin: Give coins').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-remove').setDescription('Admin: Remove coins').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-reset').setDescription('Admin: Reset user account').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true)),
    new SlashCommandBuilder().setName('admin-nuke').setDescription('Admin: Nuke entire economy database').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('admin-luck-event').setDescription('Admin: Set global luck event bonus').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption(o => o.setName('amount').setDescription('Luck multiplier bonus').setRequired(true)),
    new SlashCommandBuilder().setName('admin-catching-rate-event').setDescription('Admin: Set global catch rate boost').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption(o => o.setName('percent').setDescription('Catch rate percentage').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands synchronized.');
});

// Cooldown checker utility (2 seconds for economy commands)
function checkCooldown(user, commandName, seconds = 2) {
    const now = Date.now();
    if (!user.cooldowns) user.cooldowns = {};
    const expiration = (user.cooldowns[commandName] || 0) + (seconds * 1000);
    if (now < expiration) {
        return Math.ceil((expiration - now) / 1000);
    }
    user.cooldowns[commandName] = now;
    return 0;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    const data = readData();
    const user = getUser(interaction.user.id);

    try {
        // --- ECONOMY (2s Cooldown) ---
        if (['balance', 'beg', 'work', 'coinflip', 'slot', 'blackjack'].includes(commandName)) {
            const cd = checkCooldown(user, commandName, 2);
            if (cd > 0) {
                return interaction.reply({ content: `⏳ Please wait **${cd}s** before using \`/${commandName}\` again.`, ephemeral: true });
            }
        }

        if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(target.id);
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`💰 Balance for ${target.username}`)
                .addFields(
                    { name: 'Wallet', value: `🪙 ${tData.wallet.toLocaleString()}`, inline: true },
                    { name: 'Bank', value: `🏦 ${tData.bank.toLocaleString()}`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'beg') {
            const amt = Math.floor(Math.random() * 80) + 10;
            user.wallet += amt;
            saveData(data);
            return interaction.reply(`🤲 You begged and received **${amt} coins**.`);
        }

        else if (commandName === 'work') {
            const amt = Math.floor(Math.random() * 250) + 50;
            user.wallet += amt;
            saveData(data);
            return interaction.reply(`💼 You worked a shift and earned **${amt} coins**.`);
        }

        else if (commandName === 'coinflip') {
            const choice = interaction.options.getString('choice');
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
            if (choice === outcome) {
                user.wallet += amount;
                interaction.reply(`🪙 It was **${outcome}**! You won **${amount} coins**!`);
            } else {
                user.wallet -= amount;
                interaction.reply(`🪙 It was **${outcome}**! You lost **${amount} coins**.`);
            }
            saveData(data);
        }

        else if (commandName === 'slot') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];

            if (r1 === r2 && r2 === r3) {
                const winnings = amount * 5;
                user.wallet += winnings;
                interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Jackpot! You won **${winnings} coins**!`);
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                const winnings = Math.floor(amount * 1.5);
                user.wallet += winnings;
                interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Two matching! You won **${winnings} coins**.`);
            } else {
                user.wallet -= amount;
                interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] No match. You lost **${amount} coins**.`);
            }
            saveData(data);
        }

        else if (commandName === 'blackjack') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const playerSum = Math.floor(Math.random() * 8) + 14; // 14 to 21
            const dealerSum = Math.floor(Math.random() * 7) + 15; // 15 to 21

            if (playerSum > 21 || (playerSum < dealerSum && dealerSum <= 21)) {
                user.wallet -= amount;
                interaction.reply(`🃏 Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You lost **${amount} coins**.`);
            } else if (playerSum === dealerSum) {
                interaction.reply(`🃏 Blackjack: Push! Both had ${playerSum}. Bet returned.`);
            } else {
                user.wallet += amount;
                interaction.reply(`🃏 Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You won **${amount} coins**!`);
            }
            saveData(data);
        }

        // --- MARKET ---
        else if (commandName === 'market') {
            const embed = new EmbedBuilder().setTitle('🛒 Community Market & Shop').setColor('#00ffcc');
            data.market.forEach(i => {
                embed.addFields({ name: `[ID: ${i.id}] ${i.name} - 🪙 ${i.price.toLocaleString()}`, value: i.description });
            });
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'buy') {
            const id = interaction.options.getInteger('id');
            const item = data.market.find(i => i.id === id);
            if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });
            if (user.wallet < item.price) return interaction.reply({ content: '❌ Not enough wallet coins.', ephemeral: true });

            user.wallet -= item.price;
            user.inventory.push(item.name);
            saveData(data);
            return interaction.reply(`✅ Successfully purchased **${item.name}** for 🪙 ${item.price.toLocaleString()}!`);
        }

        // --- HUNTING & COLLECTION ---
        else if (commandName === 'hunt') {
            const cd = checkCooldown(user, 'hunt', 2);
            if (cd > 0) return interaction.reply({ content: `⏳ Reloading gear! Wait **${cd}s** to hunt again.`, ephemeral: true });

            if (!user.inventory.includes('Rifle')) {
                return interaction.reply({ content: '❌ You need a **Rifle** from `/market` to go hunting!', ephemeral: true });
            }

            // Calculate active charm luck boost
            let charmBoost = 0;
            if (user.inventory.includes('Lucky Charm III')) charmBoost = 0.50;
            else if (user.inventory.includes('Lucky Charm II')) charmBoost = 0.30;
            else if (user.inventory.includes('Lucky Charm')) charmBoost = 0.10;

            const totalLuck = 1 + charmBoost + data.globalEvent.luckBonus;
            const roll = Math.random();

            // Weighted random selection based on rates
            let cumulative = 0;
            let caught = HUNT_ANIMALS[0];
            for (const animal of HUNT_ANIMALS) {
                let adjustedRate = animal.rate * totalLuck + (data.globalEvent.catchRateBonus / 100);
                cumulative += adjustedRate;
                if (roll <= cumulative) {
                    caught = animal;
                    break;
                }
            }

            // Add reward & save collection count
            user.wallet += caught.reward;
            if (!user.collection[caught.name]) user.collection[caught.name] = 0;
            user.collection[caught.name]++;
            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Hunting Expedition')
                .setColor('#00ff88')
                .setDescription(`You went hunting and caught a **${caught.name}**!`)
                .addFields(
                    { name: 'Tier', value: `${caught.color} **${caught.tier}**`, inline: true },
                    { name: 'Reward', value: `🪙 ${caught.reward.toLocaleString()} coins`, inline: true },
                    { name: 'Total Caught', value: `${user.collection[caught.name]}x`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'collection') {
            const embed = new EmbedBuilder().setTitle(`📜 ${interaction.user.username}'s Animal Collection`).setColor('#9900ff');
            if (Object.keys(user.collection).length === 0) {
                embed.setDescription('Your collection is empty! Use `/hunt` to catch animals.');
            } else {
                let desc = '';
                for (const [animal, count] of Object.entries(user.collection)) {
                    const info = HUNT_ANIMALS.find(a => a.name === animal);
                    desc += `${info ? info.color : '⚪'} **${animal}**: ${count}x (${info ? info.tier : 'Unknown'})\n`;
                }
                embed.setDescription(desc);
            }
            return interaction.reply({ embeds: [embed] });
        }

        // --- PERSONAL COMMANDS ---
        else if (commandName === 'bank') {
            const action = interaction.options.getString('action');
            const amount = interaction.options.getInteger('amount');

            if (amount <= 0) return interaction.reply({ content: '❌ Enter a valid amount.', ephemeral: true });

            if (action === 'deposit') {
                if (user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet funds.', ephemeral: true });
                user.wallet -= amount;
                user.bank += amount;
                interaction.reply(`🏦 Deposited **${amount.toLocaleString()} coins** into your bank.`);
            } else {
                if (user.bank < amount) return interaction.reply({ content: '❌ Insufficient bank funds.', ephemeral: true });
                user.bank -= amount;
                user.wallet += amount;
                interaction.reply(`💵 Withdrew **${amount.toLocaleString()} coins** to your wallet.`);
            }
            saveData(data);
        }

        else if (commandName === 'give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot give coins to yourself.', ephemeral: true });
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet balance.', ephemeral: true });

            user.wallet -= amount;
            const targetData = getUser(target.id);
            targetData.wallet += amount;
            saveData(data);

            return interaction.reply(`✅ Successfully transferred **${amount.toLocaleString()} coins** to ${target.username}.`);
        }

        else if (commandName === 'trade') {
            const target = interaction.options.getUser('target');
            const itemName = interaction.options.getString('item');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Cannot trade with yourself.', ephemeral: true });

            const itemIndex = user.inventory.indexOf(itemName);
            if (itemIndex === -1) return interaction.reply({ content: `❌ You do not have **${itemName}** in your inventory.`, ephemeral: true });

            user.inventory.splice(itemIndex, 1);
            const targetData = getUser(target.id);
            targetData.inventory.push(itemName);
            saveData(data);

            return interaction.reply(`🤝 Successfully traded **${itemName}** to ${target.username}!`);
        }

        // --- ADMIN COMMANDS ---
        else if (commandName === 'admin-give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(target.id);
            targetData.wallet += amount;
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Added ${amount.toLocaleString()} coins to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-remove') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(target.id);
            targetData.wallet = Math.max(0, targetData.wallet - amount);
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Removed ${amount.toLocaleString()} coins from ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-reset') {
            const target = interaction.options.getUser('target');
            data.users[target.id] = { wallet: 100, bank: 500, inventory: [], collection: {}, cooldowns: {} };
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Reset account data for ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-nuke') {
            data.users = {};
            saveData(data);
            return interaction.reply({ content: '☢️ Admin: Nuked entire economy database.', ephemeral: true });
        }

        else if (commandName === 'admin-luck-event') {
            const amount = interaction.options.getNumber('amount');
            data.globalEvent.luckBonus = amount;
            saveData(data);
            return interaction.reply({ content: `✨ Global Luck Event active! Luck bonus set to +${amount * 100}%.`, ephemeral: false });
        }

        else if (commandName === 'admin-catching-rate-event') {
            const percent = interaction.options.getNumber('percent');
            data.globalEvent.catchRateBonus = percent;
            saveData(data);
            return interaction.reply({ content: `🎯 Global Catch Rate Event active! Catch boost set to +${percent}%.`, ephemeral: false });
        }

    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'An error occurred processing this command.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
