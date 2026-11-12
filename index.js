const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
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
    try {
        return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (e) {
        return { users: {}, market: [], globalEvent: { luckBonus: 0, catchRateBonus: 0 } };
    }
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getUser(data, userId) {
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

// Discord ANSI Color Wrapper for real colored text inside Embeds
function formatTierAnsi(tier) {
    switch (tier) {
        case 'Common':    return '```ansi\n\u001b[1;31mCommon\u001b[0m\n```'; // Red
        case 'Uncommon':  return '```ansi\n\u001b[1;33mUncommon\u001b[0m\n```'; // Yellow
        case 'Rare':      return '```ansi\n\u001b[1;34mRare\u001b[0m\n```'; // Blue
        case 'Epic':      return '```ansi\n\u001b[1;35mEpic\u001b[0m\n```'; // Violet/Magenta
        case 'Legendary': return '```ansi\n\u001b[0;33mLegendary\u001b[0m\n```'; // Orange/Gold
        case 'Mythical':  return '```ansi\n\u001b[1;36mMythical\u001b[0m\n```'; // Neon Blue/Cyan
        case 'S+ Tier':   return '```ansi\n\u001b[0;36mS+ Tier\u001b[0m\n```'; // Neon Skyblue
        case 'SS+ Tier':  return '```ansi\n\u001b[1;35mSS+ Tier\u001b[0m\n```'; // Neon Pink
        case 'SSS+ Tier': return '```ansi\n\u001b[0;35mSSS+ Tier\u001b[0m\n```'; // Neon Violet
        case 'GOD Tier':  return '```ansi\n\u001b[1;31mG\u001b[1;33mO\u001b[1;32mD\u001b[1;36m \u001b[1;34mT\u001b[1;35mi\u001b[1;31me\u001b[1;33mr\u001b[0m\n```'; // Rainbow GOD Tier
        default:          return tier;
    }
}

// Rarity rank values for sorting (1 = lowest, 10 = highest)
const HUNT_ANIMALS = [
    // Common (Hunt Rate 85%)
    { name: 'Worm', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 50 },
    { name: 'Dog', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 60 },
    { name: 'Bird', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 60 },
    { name: 'Cat', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 60 },
    { name: 'Butterfly', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 40 },
    { name: 'Snail', tier: 'Common', rank: 1, badge: '🔴', rate: 0.85, reward: 40 },
    // Uncommon (Hunt Rate 50%)
    { name: 'Bee', tier: 'Uncommon', rank: 2, badge: '🟡', rate: 0.50, reward: 120 },
    { name: 'Mouse', tier: 'Uncommon', rank: 2, badge: '🟡', rate: 0.50, reward: 130 },
    { name: 'Rabbit', tier: 'Uncommon', rank: 2, badge: '🟡', rate: 0.50, reward: 150 },
    { name: 'Frog', tier: 'Uncommon', rank: 2, badge: '🟡', rate: 0.50, reward: 140 },
    { name: 'Fish', tier: 'Uncommon', rank: 2, badge: '🟡', rate: 0.50, reward: 150 },
    // Rare (Hunt Rate 25%)
    { name: 'Cow', tier: 'Rare', rank: 3, badge: '🔵', rate: 0.25, reward: 400 },
    { name: 'Pig', tier: 'Rare', rank: 3, badge: '🔵', rate: 0.25, reward: 350 },
    { name: 'Kangaroo', tier: 'Rare', rank: 3, badge: '🔵', rate: 0.25, reward: 500 },
    { name: 'Bear', tier: 'Rare', rank: 3, badge: '🔵', rate: 0.25, reward: 600 },
    { name: 'Panda', tier: 'Rare', rank: 3, badge: '🔵', rate: 0.25, reward: 650 },
    // Epic (Hunt Rate 15%)
    { name: 'Whale', tier: 'Epic', rank: 4, badge: '🟣', rate: 0.15, reward: 1500 },
    { name: 'Penguin', tier: 'Epic', rank: 4, badge: '🟣', rate: 0.15, reward: 1200 },
    { name: 'Camel', tier: 'Epic', rank: 4, badge: '🟣', rate: 0.15, reward: 1300 },
    { name: 'Dove', tier: 'Epic', rank: 4, badge: '🟣', rate: 0.15, reward: 1100 },
    // Legendary (Hunt Rate 10%)
    { name: 'Elephant', tier: 'Legendary', rank: 5, badge: '🟠', rate: 0.10, reward: 4000 },
    { name: 'Crocodile', tier: 'Legendary', rank: 5, badge: '🟠', rate: 0.10, reward: 4500 },
    { name: 'Crow', tier: 'Legendary', rank: 5, badge: '🟠', rate: 0.10, reward: 3500 },
    { name: 'Tiger', tier: 'Legendary', rank: 5, badge: '🟠', rate: 0.10, reward: 5000 },
    // Mythical (Hunt Rate 1%)
    { name: 'Deer', tier: 'Mythical', rank: 6, badge: '🔷', rate: 0.01, reward: 12000 },
    { name: 'Lion', tier: 'Mythical', rank: 6, badge: '🔷', rate: 0.01, reward: 15000 },
    // S+ Tier (Hunt Rate 5%)
    { name: 'Ghost', tier: 'S+ Tier', rank: 7, badge: '🩵', rate: 0.05, reward: 35000 },
    { name: 'Skeleton', tier: 'S+ Tier', rank: 7, badge: '🩵', rate: 0.05, reward: 30000 },
    // SS+ Tier (Hunt Rate 0.5%)
    { name: 'Dragon', tier: 'SS+ Tier', rank: 8, badge: '🩷', rate: 0.005, reward: 50000 },
    { name: 'Phantom Ghost', tier: 'SS+ Tier', rank: 8, badge: '🩷', rate: 0.005, reward: 55000 },
    // SSS+ Tier (Hunt Rate 0.1%)
    { name: 'Unicorn', tier: 'SSS+ Tier', rank: 9, badge: '🔮', rate: 0.001, reward: 120000 },
    { name: 'Dinosaur', tier: 'SSS+ Tier', rank: 9, badge: '🔮', rate: 0.001, reward: 150000 },
    // GOD Tier (Hunt Rate 0.01%)
    { name: 'Snowman', tier: 'GOD Tier', rank: 10, badge: '🌈', rate: 0.0001, reward: 500000 }
];

// Helper to build sorted collection embed & sorting buttons
function buildCollectionDisplay(userObj, username, userId, sortBy = 'rarity') {
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${username}'s Animal Collection`)
        .setColor('#9900ff')
        .setFooter({ text: `Sorted by: ${sortBy.toUpperCase()}` });

    const entries = Object.entries(userObj.collection);
    if (entries.length === 0) {
        embed.setDescription('Your collection is empty! Buy a **Rifle** in `/market` and use `/hunt`.');
        return { embeds: [embed], components: [] };
    }

    const mapped = entries.map(([name, count]) => {
        const info = HUNT_ANIMALS.find(a => a.name === name) || { tier: 'Unknown', rank: 0, badge: '⚪' };
        return { name, count, tier: info.tier, rank: info.rank, badge: info.badge };
    });

    if (sortBy === 'rarity') {
        mapped.sort((a, b) => b.rank - a.rank || b.count - a.count);
    } else if (sortBy === 'name') {
        mapped.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'total') {
        mapped.sort((a, b) => b.count - a.count || b.rank - a.rank);
    }

    const lines = mapped.map(m => `${m.badge} **${m.name}** — \`${m.tier}\` (**${m.count}x** caught)`);
    embed.setDescription(lines.join('\n'));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`col_sort_rarity_${userId}`)
            .setLabel('Sort: Rarity')
            .setStyle(sortBy === 'rarity' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`col_sort_name_${userId}`)
            .setLabel('Sort: Name')
            .setStyle(sortBy === 'name' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`col_sort_total_${userId}`)
            .setLabel('Sort: Total Caught')
            .setStyle(sortBy === 'total' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// Slash Commands Registration
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
    new SlashCommandBuilder().setName('collection').setDescription('View and sort your hunted animal collection.'),
    new SlashCommandBuilder().setName('inventory').setDescription('View your item inventory and charms.'),
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
    new SlashCommandBuilder().setName('admin-give-animal').setDescription('Admin: Give a specific animal to collection').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Animal name').setRequired(true)),
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

// Enforces a 2-second cooldown
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
    // Handle Collection Sort Buttons
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('col_sort_')) {
            const parts = interaction.customId.split('_');
            const sortType = parts[2]; // rarity, name, or total
            const targetUserId = parts[3];

            if (interaction.user.id !== targetUserId) {
                return interaction.reply({ content: '❌ Only the collection owner can sort this view.', ephemeral: true });
            }

            const data = readData();
            const targetUser = getUser(data, targetUserId);
            const payload = buildCollectionDisplay(targetUser, interaction.user.username, targetUserId, sortType);
            return interaction.update(payload);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    const data = readData();
    const user = getUser(data, interaction.user.id);

    try {
        // Enforce 2-second cooldown across economy & hunt commands
        if (['balance', 'beg', 'work', 'coinflip', 'slot', 'blackjack', 'hunt'].includes(commandName)) {
            const cd = checkCooldown(user, commandName, 2);
            saveData(data);
            if (cd > 0) {
                return interaction.reply({ content: `⏳ Please wait **${cd}s** before using \`/${commandName}\` again.`, ephemeral: true });
            }
        }

        if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
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
                await interaction.reply(`🪙 It was **${outcome}**! You won **${amount.toLocaleString()} coins**!`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`🪙 It was **${outcome}**! You lost **${amount.toLocaleString()} coins**.`);
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
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Jackpot! You won **${winnings.toLocaleString()} coins**!`);
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                const winnings = Math.floor(amount * 1.5);
                user.wallet += winnings;
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Two matching! You won **${winnings.toLocaleString()} coins**.`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] No match. You lost **${amount.toLocaleString()} coins**.`);
            }
            saveData(data);
        }

        else if (commandName === 'blackjack') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const playerSum = Math.floor(Math.random() * 8) + 14; 
            const dealerSum = Math.floor(Math.random() * 7) + 15; 

            if (playerSum > 21 || (playerSum < dealerSum && dealerSum <= 21)) {
                user.wallet -= amount;
                await interaction.reply(`🃏 Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You lost **${amount.toLocaleString()} coins**.`);
            } else if (playerSum === dealerSum) {
                await interaction.reply(`🃏 Blackjack: Push! Both had ${playerSum}. Bet returned.`);
            } else {
                user.wallet += amount;
                await interaction.reply(`🃏 Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You won **${amount.toLocaleString()} coins**!`);
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
            if (!user.inventory.includes('Rifle')) {
                return interaction.reply({ content: '❌ You need a **Rifle** from `/market` to go hunting!', ephemeral: true });
            }

            let charmBoost = 0;
            if (user.inventory.includes('Lucky Charm III')) charmBoost = 0.50;
            else if (user.inventory.includes('Lucky Charm II')) charmBoost = 0.30;
            else if (user.inventory.includes('Lucky Charm')) charmBoost = 0.10;

            const totalLuckMultiplier = 1 + charmBoost + (data.globalEvent.luckBonus || 0);
            
            let possibleCatches = [];
            for (const animal of HUNT_ANIMALS) {
                let adjustedRate = Math.min(1.0, animal.rate * totalLuckMultiplier + ((data.globalEvent.catchRateBonus || 0) / 100));
                if (Math.random() <= adjustedRate) {
                    possibleCatches.push(animal);
                }
            }

            if (possibleCatches.length === 0) {
                return interaction.reply('🌲 You went hunting into the wild, but came back empty-handed. Try again!');
            }

            const caught = possibleCatches[Math.floor(Math.random() * possibleCatches.length)];

            user.wallet += caught.reward;
            if (!user.collection[caught.name]) user.collection[caught.name] = 0;
            user.collection[caught.name]++;
            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Hunting Expedition')
                .setColor('#00ff88')
                .setDescription(`You went hunting and successfully caught a **${caught.name}**!`)
                .addFields(
                    { name: 'Rarity Tier', value: formatTierAnsi(caught.tier), inline: true },
                    { name: 'Reward', value: `🪙 ${caught.reward.toLocaleString()} coins`, inline: true },
                    { name: 'Total Caught', value: `${user.collection[caught.name]}x`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'collection') {
            const payload = buildCollectionDisplay(user, interaction.user.username, interaction.user.id, 'rarity');
            return interaction.reply(payload);
        }

        else if (commandName === 'inventory') {
            const embed = new EmbedBuilder().setTitle(`🎒 ${interaction.user.username}'s Inventory`).setColor('#ffaa00');
            if (user.inventory.length === 0) {
                embed.setDescription('Your inventory is empty. Visit `/market` to buy tools and charms!');
            } else {
                const counts = {};
                user.inventory.forEach(i => counts[i] = (counts[i] || 0) + 1);
                let desc = '';
                for (const [item, qty] of Object.entries(counts)) {
                    desc += `🔹 **${item}**: ${qty}x\n`;
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
                await interaction.reply(`🏦 Deposited **${amount.toLocaleString()} coins** into your bank.`);
            } else {
                if (user.bank < amount) return interaction.reply({ content: '❌ Insufficient bank funds.', ephemeral: true });
                user.bank -= amount;
                user.wallet += amount;
                await interaction.reply(`💵 Withdrew **${amount.toLocaleString()} coins** to your wallet.`);
            }
            saveData(data);
        }

        else if (commandName === 'give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot give coins to yourself.', ephemeral: true });
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet balance.', ephemeral: true });

            user.wallet -= amount;
            const targetData = getUser(data, target.id);
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
            const targetData = getUser(data, target.id);
            targetData.inventory.push(itemName);
            saveData(data);

            return interaction.reply(`🤝 Successfully traded **${itemName}** to ${target.username}!`);
        }

        // --- ADMIN COMMANDS ---
        else if (commandName === 'admin-give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.wallet += amount;
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Added ${amount.toLocaleString()} coins to ${target.tag}. Wallet is now ${targetData.wallet.toLocaleString()}`, ephemeral: true });
        }

        else if (commandName === 'admin-remove') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.wallet = Math.max(0, targetData.wallet - amount);
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Removed ${amount.toLocaleString()} coins from ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-reset') {
            const target = interaction.options.getUser('target');
            data.users[target.id] = { wallet: 500, bank: 1000, inventory: [], collection: {}, cooldowns: {} };
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Reset account data for ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-nuke') {
            data.users = {};
            saveData(data);
            return interaction.reply({ content: '☢️ Admin: Nuked entire economy database.', ephemeral: true });
        }

        else if (commandName === 'admin-give-animal') {
            const target = interaction.options.getUser('target');
            const animalName = interaction.options.getString('type');
            const foundAnimal = HUNT_ANIMALS.find(a => a.name.toLowerCase() === animalName.toLowerCase());
            
            if (!foundAnimal) return interaction.reply({ content: '❌ Invalid animal name specified.', ephemeral: true });

            const targetData = getUser(data, target.id);
            if (!targetData.collection[foundAnimal.name]) targetData.collection[foundAnimal.name] = 0;
            targetData.collection[foundAnimal.name]++;
            saveData(data);

            return interaction.reply({ content: `🛠️ Admin: Added 1x **${foundAnimal.name}** (${foundAnimal.tier}) to ${target.tag}'s collection!`, ephemeral: true });
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
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred processing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
