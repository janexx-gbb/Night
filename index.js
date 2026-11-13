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

// --- RAM CACHING & SAFE SCHEMA MIGRATION PERSISTENCE ---
let dbCache = null;

function readData() {
    if (dbCache) return dbCache;

    if (!fs.existsSync(dataFile)) {
        const initialData = {
            users: {},
            market: [
                { id: 1, name: 'Rifle', price: 100000, type: 'tool', description: 'Basic hunting tool.' },
                { id: 2, name: 'Lucky Charm', price: 500000, type: 'charm', luckBoost: 0.10, description: 'Increased Luck by 10%' },
                { id: 3, name: 'Lucky Charm II', price: 2000000, type: 'charm', luckBoost: 0.30, description: 'Increased Luck by 30%' },
                { id: 4, name: 'Lucky Charm III', price: 10000000, type: 'charm', luckBoost: 0.50, description: 'Increased Luck by 50%' }
            ],
            globalEvent: { 
                luckBonus: 0, 
                luckExpiresAt: 0, 
                catchRateBonus: 0, 
                catchRateExpiresAt: 0 
            },
            admins: []
        };
        fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
        dbCache = initialData;
        return dbCache;
    }

    try {
        dbCache = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        if (!dbCache.admins) dbCache.admins = [];
        if (!dbCache.market) dbCache.market = [];
        if (!dbCache.globalEvent) {
            dbCache.globalEvent = { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 };
        }
    } catch (e) {
        dbCache = { 
            users: {}, 
            market: [], 
            globalEvent: { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 }, 
            admins: [] 
        };
    }
    return dbCache;
}

let saveTimeout = null;
function saveData(data) {
    dbCache = data;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        fs.writeFile(dataFile, JSON.stringify(dbCache, null, 2), (err) => {
            if (err) console.error('Failed to save data:', err);
        });
    }, 500);
}

function getUser(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = { 
            wallet: 500, 
            bank: 1000, 
            inventory: [], 
            boxes: { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 },
            lootboxes: 0,
            collection: {}, 
            cooldowns: {},
            titles: [],
            equippedTitle: null,
            dailyStreak: 0,
            lastDailyTimestamp: 0,
            lastWeeklyTimestamp: 0,
            quests: { daily: [], dailyReset: 0, weekly: [], weeklyReset: 0 }
        };
        saveData(data);
    }
    const u = data.users[userId];
    if (!Array.isArray(u.titles)) u.titles = [];
    if (u.equippedTitle === 'Novice Hunter') u.equippedTitle = null;
    if (!u.boxes) u.boxes = { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 };
    if (!u.lootboxes) u.lootboxes = 0;
    if (!u.quests) u.quests = { daily: [], dailyReset: 0, weekly: [], weeklyReset: 0 };
    return u;
}

// --- TIME PARSER FOR ADMIN EVENTS (e.g., 10s, 5m, 2h, 1d) ---
function parseDuration(timeStr) {
    const match = timeStr.trim().match(/^(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;
    if (unit.startsWith('h')) return value * 60 * 60 * 1000;
    if (unit.startsWith('m')) return value * 60 * 1000;
    if (unit.startsWith('s')) return value * 1000;
    return null;
}

function formatRemainingTime(ms) {
    if (ms <= 0) return 'Expired';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.join(' ') || '0s';
}

// --- UNIFIED BOOST CALCULATOR (Charms + Timed Global Events) ---
function getActiveBoosts(data, user) {
    const now = Date.now();
    let changed = false;

    // Auto-expire Luck Event
    if (data.globalEvent.luckExpiresAt && now > data.globalEvent.luckExpiresAt) {
        data.globalEvent.luckBonus = 0;
        data.globalEvent.luckExpiresAt = 0;
        changed = true;
    }

    // Auto-expire Catch Rate Event
    if (data.globalEvent.catchRateExpiresAt && now > data.globalEvent.catchRateExpiresAt) {
        data.globalEvent.catchRateBonus = 0;
        data.globalEvent.catchRateExpiresAt = 0;
        changed = true;
    }

    if (changed) saveData(data);

    // Charm Boost
    let charmBoost = 0;
    if (user.inventory.includes('Lucky Charm III')) charmBoost = 0.50;
    else if (user.inventory.includes('Lucky Charm II')) charmBoost = 0.30;
    else if (user.inventory.includes('Lucky Charm')) charmBoost = 0.10;

    const eventLuckBonus = data.globalEvent.luckBonus || 0;
    const eventCatchBonus = data.globalEvent.catchRateBonus || 0;

    // Combined multiplier for rare/shiny odds + flat percentage boost
    const totalLuckMultiplier = 1 + charmBoost + eventLuckBonus;
    const flatCatchBonus = eventCatchBonus / 100;

    return {
        charmBoost,
        eventLuckBonus,
        eventCatchBonus,
        totalLuckMultiplier,
        flatCatchBonus,
        luckRemaining: data.globalEvent.luckExpiresAt > now ? formatRemainingTime(data.globalEvent.luckExpiresAt - now) : null,
        catchRemaining: data.globalEvent.catchRateExpiresAt > now ? formatRemainingTime(data.globalEvent.catchRateExpiresAt - now) : null
    };
}

// Custom Rarity Icons / Emojis
const RARITY_ICONS = {
    'Common': '<:common:1570576518206333098>',
    'Uncommon': '<:uncommon:1570576547298021437>',
    'Rare': '<:rare:1570576572044279918>',
    'Epic': '<:epic:1570576596413190154>',
    'Legendary': '<:legendary:1570576620383641610>',
    'Mythic': '<:mythical:1570576640247861449>',
    'S+ Tier': '<:s_:1570576679150030999>',
    'SS+ Tier': '<:ss:1570577009787142214>',
    'SSS+ Tier': '<:sss:1570577033027784835>',
    'GOD Tier': '<:god:1570577048966140035>',
    'Shiny': '✨'
};

const LOOTBOX_ICON = '<:lootbox:1570562809648123924>';
const BOX_ICONS = {
    'Rare': '<:raretier:1570562759156830339>',
    'Epic': '<:epictier:1570562708305350726>',
    'Ultra': '<:ultratier:1570562647768829994>',
    'Legendary': '<:legendarytier:1570562590529159210>',
    'GOD': '<:godtier:1570562525274316920>'
};

// Animal Database
const HUNT_ANIMALS = [
    { name: 'Worm', tier: 'Common', rank: 1, badge: '🐛', rate: 0.85, reward: 50 },
    { name: 'Dog', tier: 'Common', rank: 1, badge: '🐕', rate: 0.85, reward: 60 },
    { name: 'Bird', tier: 'Common', rank: 1, badge: '🐦', rate: 0.85, reward: 60 },
    { name: 'Cat', tier: 'Common', rank: 1, badge: '🐈', rate: 0.85, reward: 60 },
    { name: 'Butterfly', tier: 'Common', rank: 1, badge: '🦋', rate: 0.85, reward: 40 },
    { name: 'Snail', tier: 'Common', rank: 1, badge: '🐌', rate: 0.85, reward: 40 },
    { name: 'Bee', tier: 'Uncommon', rank: 2, badge: '🐝', rate: 0.50, reward: 120 },
    { name: 'Mouse', tier: 'Uncommon', rank: 2, badge: '🐁', rate: 0.50, reward: 130 },
    { name: 'Rabbit', tier: 'Uncommon', rank: 2, badge: '🐇', rate: 0.50, reward: 150 },
    { name: 'Frog', tier: 'Uncommon', rank: 2, badge: '🐸', rate: 0.50, reward: 140 },
    { name: 'Fish', tier: 'Uncommon', rank: 2, badge: '🐟', rate: 0.50, reward: 150 },
    { name: 'Cow', tier: 'Rare', rank: 3, badge: '🐄', rate: 0.25, reward: 400 },
    { name: 'Pig', tier: 'Rare', rank: 3, badge: '🐖', rate: 0.25, reward: 350 },
    { name: 'Kangaroo', tier: 'Rare', rank: 3, badge: '🦘', rate: 0.25, reward: 500 },
    { name: 'Bear', tier: 'Rare', rank: 3, badge: '🐻', rate: 0.25, reward: 600 },
    { name: 'Panda', tier: 'Rare', rank: 3, badge: '🐼', rate: 0.25, reward: 650 },
    { name: 'Whale', tier: 'Epic', rank: 4, badge: '🐋', rate: 0.15, reward: 1500 },
    { name: 'Penguin', tier: 'Epic', rank: 4, badge: '🐧', rate: 0.15, reward: 1200 },
    { name: 'Camel', tier: 'Epic', rank: 4, badge: '🐫', rate: 0.15, reward: 1300 },
    { name: 'Dove', tier: 'Epic', rank: 4, badge: '🕊️', rate: 0.15, reward: 1100 },
    { name: 'Elephant', tier: 'Legendary', rank: 5, badge: '🐘', rate: 0.10, reward: 4000 },
    { name: 'Crocodile', tier: 'Legendary', rank: 5, badge: '🐊', rate: 0.10, reward: 4500 },
    { name: 'Crow', tier: 'Legendary', rank: 5, badge: '🐦‍⬛', rate: 0.10, reward: 3500 },
    { name: 'Tiger', tier: 'Legendary', rank: 5, badge: '🐅', rate: 0.10, reward: 5000 },
    { name: 'Deer', tier: 'Mythic', rank: 6, badge: '🦌', rate: 0.01, reward: 12000 },
    { name: 'Lion', tier: 'Mythic', rank: 6, badge: '🦁', rate: 0.01, reward: 15000 },
    { name: 'Ghost', tier: 'S+ Tier', rank: 7, badge: '👻', rate: 0.05, reward: 35000 },
    { name: 'Skeleton', tier: 'S+ Tier', rank: 7, badge: '💀', rate: 0.05, reward: 30000 },
    { name: 'Dragon', tier: 'SS+ Tier', rank: 8, badge: '🐉', rate: 0.005, reward: 50000 },
    { name: 'Phantom Ghost', tier: 'SS+ Tier', rank: 8, badge: '🥷', rate: 0.005, reward: 55000 },
    { name: 'Unicorn', tier: 'SSS+ Tier', rank: 9, badge: '🦄', rate: 0.001, reward: 120000 },
    { name: 'Dinosaur', tier: 'SSS+ Tier', rank: 9, badge: '🦖', rate: 0.001, reward: 150000 },
    { name: 'Snowman', tier: 'GOD Tier', rank: 10, badge: '⛄', rate: 0.0001, reward: 500000 },
    { name: 'Shiny Turtle', tier: 'Shiny', rank: 11, badge: '<:ShinyTurtle:1570467471889137735>', rate: 0.001, reward: 200000 },
    { name: 'Shiny Snowman', tier: 'Shiny', rank: 11, badge: '<:ShinySnowman:1570467561454305520>', rate: 0.001, reward: 300000 },
    { name: 'Shiny Scorpion', tier: 'Shiny', rank: 11, badge: '<:ShinyScorpion:1570467397834379285>', rate: 0.001, reward: 250000 },
    { name: 'Shiny Dolphin', tier: 'Shiny', rank: 11, badge: '<:Shinydolphin:1570467326573416602>', rate: 0.001, reward: 250000 }
];

// Official Clean Titles Registry & Categories
const TITLES_DATA = {
    'Beta': { category: 'Special', desc: 'Given only to beta users or admins' },
    'Admin': { category: 'Special', desc: 'Special title for Admin' },
    'Moderator': { category: 'Special', desc: 'Special title for Mods' },
    'Owner': { category: 'Special', desc: 'Who add this???' },
    'Mythical Hunter': { category: 'Hunting', desc: 'Collected all Mythics' },
    'S+ Hunter': { category: 'Hunting', desc: 'Collected all S+' },
    'SS+ Hunter': { category: 'Hunting', desc: 'Collected all SS+' },
    'SSS+ Hunter': { category: 'Hunting', desc: 'Collected all SSS+' },
    'Shiny Hunter': { category: 'Hunting', desc: 'Collected all Shiny' },
    'Snowwy': { category: 'Hunting', desc: 'Caught a SNOWMAN!' },
    'Millionaire': { category: 'Economy', desc: 'Own a Million Coins' },
    'Billionaire': { category: 'Economy', desc: 'Own a Billion Coins' },
    'Trillionaire': { category: 'Economy', desc: 'Own a Trillionaire Coins' },
    'Lucky Charm': { category: 'Economy', desc: 'Crazy Beggar' },
    'JACKPOT': { category: 'Economy', desc: 'No Idea What i\'ve donee' }
};

async function checkAndAwardTitles(user, clientUser, interaction) {
    const newlyUnlocked = [];

    const grant = (titleName) => {
        if (!user.titles.includes(titleName)) {
            user.titles.push(titleName);
            newlyUnlocked.push(titleName);
        }
    };

    if ((user.collection['Snowman'] || 0) > 0) grant('Snowwy');
    if (['Deer', 'Lion'].every(m => (user.collection[m] || 0) > 0)) grant('Mythical Hunter');
    if (['Ghost', 'Skeleton'].every(s => (user.collection[s] || 0) > 0)) grant('S+ Hunter');
    if (['Dragon', 'Phantom Ghost'].every(s => (user.collection[s] || 0) > 0)) grant('SS+ Hunter');
    if (['Unicorn', 'Dinosaur'].every(s => (user.collection[s] || 0) > 0)) grant('SSS+ Hunter');
    if (['Shiny Turtle', 'Shiny Snowman', 'Shiny Scorpion', 'Shiny Dolphin'].every(sh => (user.collection[sh] || 0) > 0)) grant('Shiny Hunter');
    if (user.wallet >= 1000000) grant('Millionaire');
    if (user.wallet >= 1000000000) grant('Billionaire');
    if (user.wallet >= 1000000000000) grant('Trillionaire');

    if (newlyUnlocked.length > 0 && interaction) {
        for (const t of newlyUnlocked) {
            const desc = TITLES_DATA[t]?.desc || '';
            try {
                await interaction.followUp({ 
                    content: `🎉 Congrats **${clientUser.username}** 🎉 You Unlock **${t}** by ${desc}`, 
                    ephemeral: false 
                });
            } catch (e) {}
        }
    }
}

function formatTitleDisplay(titleName) {
    if (!titleName) return '`No Title Equipped`';
    if (titleName === 'Beta') return '```ansi\n\u001b[1;35mBeta\u001b[0m\n```';
    if (titleName === 'Admin') return '```ansi\n\u001b[1;31mAdmin\u001b[0m\n```';
    if (titleName === 'Owner') return '```ansi\n\u001b[1;33mOwner\u001b[0m\n```';
    return `\`${titleName}\``;
}

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
        new ButtonBuilder().setCustomId(`col_sort_rarity_${userId}`).setLabel('Sort: Rarity').setStyle(sortBy === 'rarity' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`col_sort_name_${userId}`).setLabel('Sort: Name').setStyle(sortBy === 'name' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`col_sort_total_${userId}`).setLabel('Sort: Total Caught').setStyle(sortBy === 'total' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// Slash Commands Definition
const commands = [
    new SlashCommandBuilder().setName('balance').setDescription('Check wallet and bank balance.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for quick starter coins (1-10,000).'),
    new SlashCommandBuilder().setName('work').setDescription('Work to earn coins (1-100,000).'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Bet coins on a harder coinflip game.')
        .addStringOption(o => o.setName('choice').setDescription('Heads or Tails').setRequired(true).addChoices({name:'Heads', value:'heads'}, {name:'Tails', value:'tails'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('slot').setDescription('Play the slot machine (💎♥️🗡️🍎🍑🥭).')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('blackjack').setDescription('Play a harder game of blackjack.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('trivia').setDescription('Answer a harder trivia question to win coins.'),
    new SlashCommandBuilder().setName('market').setDescription('View the item shop market.'),
    new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the market.')
        .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true)),
    new SlashCommandBuilder().setName('hunt').setDescription('Go hunting for creatures and boxes!'),
    new SlashCommandBuilder().setName('lootbox').setDescription('Open a lootbox for random coins, animals, or shiny items!'),
    new SlashCommandBuilder().setName('open').setDescription('Open a specific rarity box.')
        .addStringOption(o => o.setName('rarity').setDescription('Box rarity to open').setRequired(true)
            .addChoices(
                { name: 'Rare', value: 'Rare' },
                { name: 'Epic', value: 'Epic' },
                { name: 'Ultra', value: 'Ultra' },
                { name: 'Legendary', value: 'Legendary' },
                { name: 'GOD', value: 'GOD' }
            )),
    new SlashCommandBuilder().setName('daily').setDescription('Claim your 12h daily rewards & boxes!'),
    new SlashCommandBuilder().setName('weekly').setDescription('Claim your 5d weekly rewards & boxes!'),
    new SlashCommandBuilder().setName('quest').setDescription('View daily and weekly active tasks and timers.'),
    new SlashCommandBuilder().setName('collection').setDescription('View and sort your hunted animal collection.'),
    new SlashCommandBuilder().setName('inventory').setDescription('View your item inventory, boxes, and lootboxes.'),
    new SlashCommandBuilder().setName('titles').setDescription('View and equip your unlocked profile titles.')
        .addStringOption(o => o.setName('equip').setDescription('Exact title name to equip').setRequired(false)),
    new SlashCommandBuilder().setName('titlelist').setDescription('View list of all available titles by category and description.'),
    new SlashCommandBuilder().setName('profiles').setDescription('View detailed user profile stats, streak, best catch, and title.')
        .addUserOption(o => o.setName('user').setDescription('User profile to view').setRequired(false)),
    new SlashCommandBuilder().setName('bank').setDescription('Deposit or withdraw coins from your bank.')
        .addStringOption(o => o.setName('action').setDescription('deposit or withdraw').setRequired(true).addChoices({name:'Deposit', value:'deposit'}, {name:'Withdraw', value:'withdraw'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('give').setDescription('Transfer coins to another user.')
        .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('trade').setDescription('Offer an item/charm to another user.')
        .addUserOption(o => o.setName('target').setDescription('Trade partner').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name from inventory').setRequired(true)),
    
    // Admin & Owner Commands
    new SlashCommandBuilder().setName('admin-give-coins').setDescription('Admin: Give coins').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-item').setDescription('Admin: Give market item').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-animal').setDescription('Admin: Give a specific animal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Animal name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-title').setDescription('Admin: Award a title').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Title name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-permission').setDescription('Owner only: Grant admin permissions to user.')
        .addUserOption(o => o.setName('user').setDescription('User to grant admin rights').setRequired(true)),
    new SlashCommandBuilder().setName('admin-luck-event').setDescription('Admin: Start a timed global luck event').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption(o => o.setName('amount').setDescription('Luck multiplier boost (e.g., 0.5 for +50%)').setRequired(true))
        .addStringOption(o => o.setName('time').setDescription('Duration (e.g., 30s, 10m, 2h, 1d)').setRequired(true)),
    new SlashCommandBuilder().setName('admin-catching-rate-event').setDescription('Admin: Start a timed global catching rate event').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption(o => o.setName('amount').setDescription('Catching rate % boost (e.g., 25 for +25%)').setRequired(true))
        .addStringOption(o => o.setName('time').setDescription('Duration (e.g., 30s, 10m, 2h, 1d)').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands synchronized.');
});

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

// Weighted Animal Picker helper (supports boosts for Hunt, Lootbox, and Boxes)
function pickWeightedAnimal(animalsPool, totalLuckMultiplier, flatCatchBonus) {
    // Higher ranks receive stronger proportional benefit from luck boosts
    const weightedList = animalsPool.map(animal => {
        const rankScale = 1 + (animal.rank * 0.15 * (totalLuckMultiplier - 1));
        const effectiveWeight = Math.max(0.00001, (animal.rate * rankScale) + (flatCatchBonus * (animal.rank * 0.05)));
        return { animal, weight: effectiveWeight };
    });

    const totalWeight = weightedList.reduce((acc, item) => acc + item.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of weightedList) {
        if (roll <= entry.weight) {
            return entry.animal;
        }
        roll -= entry.weight;
    }
    return weightedList[0].animal;
}

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('col_sort_')) {
            const parts = interaction.customId.split('_');
            const sortType = parts[2];
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

    // Permission check for admin commands
    const isAdminCommand = commandName.startsWith('admin-');
    if (isAdminCommand) {
        const isOwner = interaction.user.id === interaction.guild?.ownerId || data.admins.includes(interaction.user.id) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (commandName === 'admin-give-permission') {
            if (interaction.user.id !== interaction.guild?.ownerId) {
                return interaction.reply({ content: '❌ Only the server owner can execute `/admin-give-permission`.', ephemeral: true });
            }
        } else if (!isOwner) {
            return interaction.reply({ content: '❌ You do not have permission to use admin commands.', ephemeral: true });
        }
    }

    try {
        if (['balance', 'beg', 'work', 'coinflip', 'slot', 'blackjack', 'trivia', 'hunt', 'lootbox', 'open'].includes(commandName)) {
            const cd = checkCooldown(user, commandName, 2);
            if (cd > 0) {
                return interaction.reply({ content: `⏳ Please wait **${cd}s** before using \`/${commandName}\` again.`, ephemeral: true });
            }
            saveData(data);
        }

        // --- BALANCE ---
        if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            const titleDisplay = tData.equippedTitle ? ` [${tData.equippedTitle}]` : '';
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`💰 Balance for ${target.username}${titleDisplay}`)
                .addFields(
                    { name: '🪙 Wallet', value: `${tData.wallet.toLocaleString()}`, inline: true },
                    { name: '🏦 Bank', value: `${tData.bank.toLocaleString()}`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- BEG ---
        else if (commandName === 'beg') {
            const amt = Math.floor(Math.random() * 10000) + 1;
            user.wallet += amt;
            if (amt >= 8000 && !user.titles.includes('Lucky Charm')) {
                user.titles.push('Lucky Charm');
                await interaction.channel.send(`🎉 Congrats **${interaction.user.username}** 🎉 You Unlock **Lucky Charm** by Crazy Beggar`);
            }
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`🤲 You begged and received **${amt.toLocaleString()} coins**!`);
        }

        // --- WORK ---
        else if (commandName === 'work') {
            const amt = Math.floor(Math.random() * 100000) + 1;
            user.wallet += amt;
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`💼 You worked a hard shift and earned **${amt.toLocaleString()} coins**!`);
        }

        // --- COINFLIP ---
        else if (commandName === 'coinflip') {
            const choice = interaction.options.getString('choice');
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const outcome = Math.random() < 0.53 ? (choice === 'heads' ? 'tails' : 'heads') : choice;
            if (choice === outcome) {
                user.wallet += amount;
                await interaction.reply(`🪙 It landed on **${outcome}**! You won **${amount.toLocaleString()} coins**!`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`🪙 It landed on **${outcome}**! You lost **${amount.toLocaleString()} coins**.`);
            }
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
        }

        // --- SLOT ---
        else if (commandName === 'slot') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const symbols = ['💎', '♥️', '🗡️', '🍎', '🍑', '🥭'];
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];

            if (r1 === '💎' && r2 === '💎' && r3 === '💎') {
                const winnings = amount * 20;
                user.wallet += winnings;
                if (!user.titles.includes('JACKPOT')) {
                    user.titles.push('JACKPOT');
                    await interaction.channel.send(`🎉 Congrats **${interaction.user.username}** 🎉 You Unlock **JACKPOT** by No Idea What i've donee`);
                }
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] DIAMOND JACKPOT!! You won **${winnings.toLocaleString()} coins**!`);
            } else if (r1 === r2 && r2 === r3) {
                const winnings = amount * 5;
                user.wallet += winnings;
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Triple match! You won **${winnings.toLocaleString()} coins**!`);
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                const winnings = Math.floor(amount * 1.2);
                user.wallet += winnings;
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] Two matching! You won **${winnings.toLocaleString()} coins**.`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`🎰 [ ${r1} | ${r2} | ${r3} ] No match. You lost **${amount.toLocaleString()} coins**.`);
            }
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
        }

        // --- BLACKJACK ---
        else if (commandName === 'blackjack') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet or insufficient wallet funds.', ephemeral: true });

            const playerSum = Math.floor(Math.random() * 8) + 12; 
            const dealerSum = Math.floor(Math.random() * 5) + 17; 

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
            await checkAndAwardTitles(user, interaction.user, interaction);
        }

        // --- TRIVIA ---
        else if (commandName === 'trivia') {
            const reward = 15000;
            user.wallet += reward;
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`🧠 Hard Trivia Solved! You answered correctly and earned **${reward.toLocaleString()} coins**!`);
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

        // --- HUNT (Uses Charms + Timed Global Luck & Catch Events) ---
        else if (commandName === 'hunt') {
            if (!user.inventory.includes('Rifle')) {
                return interaction.reply({ content: '❌ You need a **Rifle** from `/market` to go hunting!', ephemeral: true });
            }

            const boosts = getActiveBoosts(data, user);

            // Box drop chances boosted by events & charms
            let droppedBox = null;
            const rollBox = Math.random();
            const boxMultiplier = boosts.totalLuckMultiplier + (boosts.flatCatchBonus * 0.5);

            if (rollBox < 0.005 * boxMultiplier) { droppedBox = 'GOD'; user.boxes.GOD++; }
            else if (rollBox < 0.01 * boxMultiplier) { droppedBox = 'Legendary'; user.boxes.Legendary++; }
            else if (rollBox < 0.03 * boxMultiplier) { droppedBox = 'Ultra'; user.boxes.Ultra++; }
            else if (rollBox < 0.06 * boxMultiplier) { droppedBox = 'Epic'; user.boxes.Epic++; }
            else if (rollBox < 0.10 * boxMultiplier) { droppedBox = 'Rare'; user.boxes.Rare++; }

            // Shiny chance boosted by Charms & Timed Events
            let caught = null;
            const shinyChance = (0.001 * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.01);

            if (Math.random() < shinyChance) {
                const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                caught = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
            } else {
                const standardAnimals = HUNT_ANIMALS.filter(a => a.tier !== 'Shiny');
                caught = pickWeightedAnimal(standardAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
            }

            user.wallet += caught.reward;
            if (!user.collection[caught.name]) user.collection[caught.name] = 0;
            user.collection[caught.name]++;

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Hunting Expedition')
                .setColor('#00ff88')
                .setDescription(`You went hunting and successfully caught ${caught.badge} **${caught.name}**!`)
                .addFields(
                    { name: 'Rarity Tier', value: `${RARITY_ICONS[caught.tier] || ''} \`${caught.tier}\``, inline: true },
                    { name: 'Reward', value: `🪙 ${caught.reward.toLocaleString()} coins`, inline: true },
                    { name: 'Total Caught', value: `${user.collection[caught.name]}x`, inline: true }
                );

            if (droppedBox) {
                embed.addFields({ name: '🎁 Special Hunt Drop!', value: `You found a ${BOX_ICONS[droppedBox]} **${droppedBox} Box**!` });
            }

            // Show active boost footer if any event or charm is running
            const activeTags = [];
            if (boosts.charmBoost > 0) activeTags.push(`Charm +${Math.round(boosts.charmBoost * 100)}%`);
            if (boosts.luckRemaining) activeTags.push(`Luck Event +${Math.round(boosts.eventLuckBonus * 100)}% (${boosts.luckRemaining})`);
            if (boosts.catchRemaining) activeTags.push(`Catch Event +${boosts.eventCatchBonus}% (${boosts.catchRemaining})`);
            if (activeTags.length > 0) {
                embed.setFooter({ text: `Active Boosts: ${activeTags.join(' • ')}` });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- LOOTBOX (/lootbox - Uses Charms + Timed Global Luck & Catch Events) ---
        else if (commandName === 'lootbox') {
            if ((user.lootboxes || 0) <= 0) {
                return interaction.reply({ content: `❌ You don't have any Lootboxes! (${LOOTBOX_ICON})`, ephemeral: true });
            }

            user.lootboxes--;
            const boosts = getActiveBoosts(data, user);

            let rewardText = '';
            // Base 0.5% shiny rate boosted by Charms & Timed Events
            const shinyChance = (0.005 * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.02);

            if (Math.random() < shinyChance) {
                const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                const shiny = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                if (!user.collection[shiny.name]) user.collection[shiny.name] = 0;
                user.collection[shiny.name]++;
                rewardText = `✨ **Shiny Animal**: ${shiny.badge} **${shiny.name}**!`;
            } else if (Math.random() < 0.45) {
                const coinAmt = Math.floor(Math.random() * 5000) + 1;
                user.wallet += coinAmt;
                rewardText = `🪙 **Coins**: ${coinAmt.toLocaleString()} coins`;
            } else {
                const standardAnimals = HUNT_ANIMALS.filter(a => a.tier !== 'Shiny');
                const randAnimal = pickWeightedAnimal(standardAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                if (!user.collection[randAnimal.name]) user.collection[randAnimal.name] = 0;
                user.collection[randAnimal.name]++;
                rewardText = `🐾 **Animal**: ${randAnimal.badge} **${randAnimal.name}** (\`${randAnimal.tier}\`)`;
            }

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`${LOOTBOX_ICON} Lootbox Opened!`)
                .setColor('#ffaa00')
                .setDescription(`You opened a ${LOOTBOX_ICON} **Lootbox** and obtained:\n\n${rewardText}`)
                .setTimestamp();

            const activeTags = [];
            if (boosts.charmBoost > 0) activeTags.push(`Charm +${Math.round(boosts.charmBoost * 100)}%`);
            if (boosts.luckRemaining) activeTags.push(`Luck Event +${Math.round(boosts.eventLuckBonus * 100)}% (${boosts.luckRemaining})`);
            if (boosts.catchRemaining) activeTags.push(`Catch Event +${boosts.eventCatchBonus}% (${boosts.catchRemaining})`);
            if (activeTags.length > 0) {
                embed.setFooter({ text: `Boosts Applied: ${activeTags.join(' • ')}` });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- OPEN BOXES (/open - Uses Charms + Timed Global Luck & Catch Events) ---
        else if (commandName === 'open') {
            const boxRarity = interaction.options.getString('rarity');
            if (!user.boxes[boxRarity] || user.boxes[boxRarity] <= 0) {
                return interaction.reply({ content: `❌ You don't have any **${boxRarity} Boxes** to open!`, ephemeral: true });
            }

            user.boxes[boxRarity]--;
            const boosts = getActiveBoosts(data, user);

            let maxCoins = 1000;
            let maxRank = 6;
            let baseShinyChance = 0.00001; // 0.001%
            if (boxRarity === 'Epic') { maxCoins = 10000; maxRank = 7; baseShinyChance = 0.000015; }
            else if (boxRarity === 'Ultra') { maxCoins = 20000; maxRank = 9; baseShinyChance = 0.00005; }
            else if (boxRarity === 'Legendary') { maxCoins = 30000; maxRank = 9; baseShinyChance = 0.0001; }
            else if (boxRarity === 'GOD') { maxCoins = 50000; maxRank = 10; baseShinyChance = 0.001; }

            let dropDescription = '';
            // 50% Coins OR 50% Animal
            if (Math.random() < 0.5) {
                const coinDrop = Math.floor(Math.random() * maxCoins) + 1;
                user.wallet += coinDrop;
                dropDescription = `🪙 **Coins Drop**: ${coinDrop.toLocaleString()} coins`;
            } else {
                const effectiveShinyChance = (baseShinyChance * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.01);
                if (Math.random() < effectiveShinyChance) {
                    const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                    const sAnimal = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                    if (!user.collection[sAnimal.name]) user.collection[sAnimal.name] = 0;
                    user.collection[sAnimal.name]++;
                    dropDescription = `✨ **Shiny Animal Drop**: ${sAnimal.badge} **${sAnimal.name}**!`;
                } else {
                    const eligibleAnimals = HUNT_ANIMALS.filter(a => a.rank <= maxRank && a.tier !== 'Shiny');
                    const chosen = pickWeightedAnimal(eligibleAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                    if (!user.collection[chosen.name]) user.collection[chosen.name] = 0;
                    user.collection[chosen.name]++;
                    dropDescription = `🐾 **Animal Drop**: ${chosen.badge} **${chosen.name}** (\`${chosen.tier}\`)`;
                }
            }

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`${BOX_ICONS[boxRarity]} ${boxRarity} Box Opened!`)
                .setColor('#9900ff')
                .setDescription(`You opened a ${BOX_ICONS[boxRarity]} **${boxRarity} Box** and received:\n\n${dropDescription}`)
                .setTimestamp();

            const activeTags = [];
            if (boosts.charmBoost > 0) activeTags.push(`Charm +${Math.round(boosts.charmBoost * 100)}%`);
            if (boosts.luckRemaining) activeTags.push(`Luck Event +${Math.round(boosts.eventLuckBonus * 100)}% (${boosts.luckRemaining})`);
            if (boosts.catchRemaining) activeTags.push(`Catch Event +${boosts.eventCatchBonus}% (${boosts.catchRemaining})`);
            if (activeTags.length > 0) {
                embed.setFooter({ text: `Boosts Applied: ${activeTags.join(' • ')}` });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- DAILY ---
        else if (commandName === 'daily') {
            const now = Date.now();
            const twelveHours = 12 * 60 * 60 * 1000;
            if (now - user.lastDailyTimestamp < twelveHours) {
                const hoursLeft = Math.ceil((twelveHours - (now - user.lastDailyTimestamp)) / (1000 * 60 * 60));
                return interaction.reply({ content: `⏳ Daily reward already claimed! Come back in **${hoursLeft} hours**.`, ephemeral: true });
            }

            user.lastDailyTimestamp = now;
            user.dailyStreak = (user.dailyStreak || 0) + 1;
            user.lootboxes += 1;
            user.boxes.Rare += 1;

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            return interaction.reply(`🎁 Daily Claimed! Streak: 🔥 **${user.dailyStreak} Days**. Received 1x ${LOOTBOX_ICON} Lootbox and 1x ${BOX_ICONS['Rare']} Rare Box!`);
        }

        // --- WEEKLY ---
        else if (commandName === 'weekly') {
            const now = Date.now();
            const fiveDays = 5 * 24 * 60 * 60 * 1000;
            if (now - (user.lastWeeklyTimestamp || 0) < fiveDays) {
                return interaction.reply({ content: `⏳ Weekly reward already claimed!`, ephemeral: true });
            }

            user.lastWeeklyTimestamp = now;
            user.lootboxes += 3;
            user.boxes.Epic += 1;
            user.boxes.Legendary += 1;

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            return interaction.reply(`🎁 Weekly Claimed! Received 3x ${LOOTBOX_ICON} Lootboxes, 1x ${BOX_ICONS['Epic']} Epic Box, and 1x ${BOX_ICONS['Legendary']} Legendary Box!`);
        }

        // --- QUEST ---
        else if (commandName === 'quest') {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const weekMs = 5 * 24 * 60 * 60 * 1000;

            if (!user.quests.dailyReset || now > user.quests.dailyReset) {
                user.quests.dailyReset = now + dayMs;
                user.quests.daily = ['Hunt 5 animals', 'Work 2 shifts', 'Win 1 coinflip'];
            }
            if (!user.quests.weeklyReset || now > user.quests.weeklyReset) {
                user.quests.weeklyReset = now + weekMs;
                user.quests.weekly = ['Open 3 boxes', 'Collect 1 Epic or higher animal'];
            }
            saveData(data);

            const dailyTimeLeft = Math.ceil((user.quests.dailyReset - now) / (1000 * 60));
            const weeklyDaysLeft = ((user.quests.weeklyReset - now) / (1000 * 60 * 60 * 24)).toFixed(1);

            const embed = new EmbedBuilder()
                .setTitle('📋 Quests & Active Tasks')
                .setColor('#00ffcc')
                .addFields(
                    { name: `📅 Daily Quests (Resets in ${Math.floor(dailyTimeLeft / 60)}h ${dailyTimeLeft % 60}m)`, value: user.quests.daily.map(q => `• ${q}`).join('\n') },
                    { name: `🗓️ Weekly Quests (Resets in ${weeklyDaysLeft} days)`, value: user.quests.weekly.map(q => `• ${q}`).join('\n') }
                );

            return interaction.reply({ embeds: [embed] });
        }

        // --- COLLECTION ---
        else if (commandName === 'collection') {
            const payload = buildCollectionDisplay(user, interaction.user.username, interaction.user.id, 'rarity');
            return interaction.reply(payload);
        }

        // --- INVENTORY ---
        else if (commandName === 'inventory') {
            const embed = new EmbedBuilder().setTitle(`🎒 ${interaction.user.username}'s Inventory & Boxes`).setColor('#ffaa00');
            
            const boxCounts = Object.entries(user.boxes).map(([b, count]) => `${BOX_ICONS[b]} **${b} Box**: ${count}x`).join('\n');
            const itemCounts = {};
            user.inventory.forEach(i => itemCounts[i] = (itemCounts[i] || 0) + 1);
            const itemList = Object.entries(itemCounts).map(([item, qty]) => `🔹 **${item}**: ${qty}x`).join('\n') || 'No items.';

            embed.addFields(
                { name: '🎁 Lootboxes & Boxes', value: `${LOOTBOX_ICON} **Lootboxes**: ${user.lootboxes || 0}x\n${boxCounts}` },
                { name: '🎒 Tools & Charms', value: itemList }
            );

            return interaction.reply({ embeds: [embed] });
        }

        // --- TITLES & TITLELIST ---
        else if (commandName === 'titles') {
            const equipName = interaction.options.getString('equip');
            if (equipName) {
                const matchedTitle = user.titles.find(t => t.toLowerCase() === equipName.toLowerCase());
                if (!matchedTitle) {
                    return interaction.reply({ content: `❌ You have not unlocked the title **${equipName}** yet!`, ephemeral: true });
                }
                user.equippedTitle = matchedTitle;
                saveData(data);
                return interaction.reply({ content: `✅ Successfully equipped title: **${matchedTitle}**!`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${interaction.user.username}'s Unlocked Titles`)
                .setColor('#ffd700')
                .setDescription('Use `/titles equip [title]` to equip any unlocked title.');

            if (user.titles.length === 0) {
                embed.addFields({ name: 'Unlocked Titles', value: 'You have not unlocked any titles yet! Check `/titlelist` to see requirements.' });
            } else {
                const list = user.titles.map(t => `${t === user.equippedTitle ? '🟢 **[Equipped]**' : '🔹'} **${t}**`).join('\n');
                embed.addFields({ name: 'Unlocked Titles', value: list });
            }

            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'titlelist') {
            const embed = new EmbedBuilder()
                .setTitle('📜 All Available Titles List')
                .setColor('#5865F2')
                .setDescription('Here are all titles categorized by Special, Hunting, and Economy:');

            const categories = { Special: [], Hunting: [], Economy: [] };
            for (const [tName, info] of Object.entries(TITLES_DATA)) {
                categories[info.category]?.push(`• **${tName}**: ${info.desc}`);
            }

            for (const [cat, list] of Object.entries(categories)) {
                if (list.length > 0) {
                    embed.addFields({ name: `${cat} Titles`, value: list.join('\n') });
                }
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- ENHANCED PROFILES ---
        else if (commandName === 'profiles') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);

            const totalHuntCount = Object.values(tData.collection).reduce((a, b) => a + b, 0);

            let bestAnimalName = 'None';
            let bestRank = -1;
            let bestBadge = '⚪';
            for (const [animalName] of Object.entries(tData.collection)) {
                const found = HUNT_ANIMALS.find(a => a.name === animalName);
                if (found && found.rank > bestRank) {
                    bestRank = found.rank;
                    bestAnimalName = found.name;
                    bestBadge = found.badge;
                }
            }

            const bestCaughtDisplay = bestRank !== -1 ? `${bestBadge} **${bestAnimalName}**` : 'No hunts yet';
            const activeTitle = tData.equippedTitle;

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`🌟 User Profile Card • ${target.username}`)
                .setDescription(`>>> 🏷️ **Title Showcase:** ${formatTitleDisplay(activeTitle)}`)
                .addFields(
                    { name: '🔥 Daily Streak', value: `\`${tData.dailyStreak || 0} Days\``, inline: true },
                    { name: '🎯 Total Hunts', value: `\`${totalHuntCount.toLocaleString()}\``, inline: true },
                    { name: '👑 Best Catch', value: `${bestCaughtDisplay}`, inline: true },
                    { name: '🪙 Wallet Balance', value: `\`🪙 ${tData.wallet.toLocaleString()}\``, inline: true },
                    { name: '🏦 Bank Balance', value: `\`🏦 ${tData.bank.toLocaleString()}\``, inline: true },
                    { name: '📦 Total Boxes', value: `\`🎁 ${Object.values(tData.boxes).reduce((a,b)=>a+b, 0)}x\``, inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // --- BANK, GIVE, TRADE ---
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
        else if (commandName === 'admin-give-coins') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.wallet += amount;
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Added ${amount.toLocaleString()} coins to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-item') {
            const target = interaction.options.getUser('target');
            const itemName = interaction.options.getString('item');
            const targetData = getUser(data, target.id);
            targetData.inventory.push(itemName);
            saveData(data);
            return interaction.reply({ content: `🛠️ Admin: Gave **${itemName}** to ${target.tag}.`, ephemeral: true });
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
            await checkAndAwardTitles(targetData, target, interaction);
            return interaction.reply({ content: `🛠️ Admin: Added 1x ${foundAnimal.badge} **${foundAnimal.name}** to ${target.tag}'s collection!`, ephemeral: true });
        }

        else if (commandName === 'admin-give-title') {
            const target = interaction.options.getUser('target');
            const titleToGrant = interaction.options.getString('title');
            const targetData = getUser(data, target.id);

            if (!targetData.titles.includes(titleToGrant)) {
                targetData.titles.push(titleToGrant);
            }
            targetData.equippedTitle = titleToGrant;
            saveData(data);

            return interaction.reply({ content: `🏆 Admin: Awarded and equipped title **${titleToGrant}** for ${target.tag}!`, ephemeral: true });
        }

        else if (commandName === 'admin-give-permission') {
            const targetUser = interaction.options.getUser('user');
            if (!data.admins.includes(targetUser.id)) {
                data.admins.push(targetUser.id);
                saveData(data);
            }
            return interaction.reply({ content: `🛡️ Owner: Granted admin permissions to **${targetUser.tag}** successfully!`, ephemeral: true });
        }

        // --- TIMED GLOBAL LUCK EVENT ---
        else if (commandName === 'admin-luck-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) {
                return interaction.reply({ content: '❌ Invalid time format! Use formats like `30s`, `15m`, `2h`, or `1d`.', ephemeral: true });
            }

            data.globalEvent.luckBonus = amount;
            data.globalEvent.luckExpiresAt = Date.now() + durationMs;
            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('✨ Global Luck Event Started!')
                .setColor('#ff00ff')
                .setDescription(`An admin has activated a global luck boost across **Hunting, Lootboxes, and Mystery Boxes**!`)
                .addFields(
                    { name: '🍀 Luck Boost', value: `**+${Math.round(amount * 100)}%**`, inline: true },
                    { name: '⏳ Duration', value: `**${formatRemainingTime(durationMs)}**`, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // --- TIMED GLOBAL CATCHING RATE EVENT ---
        else if (commandName === 'admin-catching-rate-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) {
                return interaction.reply({ content: '❌ Invalid time format! Use formats like `30s`, `15m`, `2h`, or `1d`.', ephemeral: true });
            }

            data.globalEvent.catchRateBonus = amount;
            data.globalEvent.catchRateExpiresAt = Date.now() + durationMs;
            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Global Catching Rate Event Started!')
                .setColor('#00ffcc')
                .setDescription(`An admin has activated a global catch rate boost across **Hunting, Lootboxes, and Mystery Boxes**!`)
                .addFields(
                    { name: '📈 Catch Rate Boost', value: `**+${amount}%**`, inline: true },
                    { name: '⏳ Duration', value: `**${formatRemainingTime(durationMs)}**`, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred processing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
