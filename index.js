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
            marketListings: [], // For selling items/animals: { id, sellerId, sellerName, type, name, quantity, price }
            shopItems: [
                { id: 1, name: 'Rifle', price: 100000, category: 'Gun', huntCount: 1, luckBoost: 0.05, description: 'Hunts 1 Animal with 5% Luck Boost' },
                { id: 2, name: 'Sniper', price: 500000, category: 'Gun', huntCount: 3, luckBoost: 0.10, description: 'Hunts 3 Animals with 10% Luck Boost' },
                { id: 3, name: 'Machine Gun', price: 10000000, category: 'Gun', huntCount: 5, luckBoost: 0.50, description: 'Hunts 5 Animals with 50% Luck Boost' },
                { id: 4, name: 'NUKE', price: 100000000, category: 'Gun', huntCount: 100, luckBoost: 5.00, description: 'Hunts 100 Animals with 500% Luck Boost' },
                { id: 5, name: 'Lucky Charm I', price: 1500000, category: 'Charm', luckBoost: 0.25, description: 'Increase Luck Boost For 25%' },
                { id: 6, name: 'Lucky Charm II', price: 11500000, category: 'Charm', luckBoost: 0.30, description: 'Increase Luck Boost For 30%' },
                { id: 7, name: 'Lucky Charm III', price: 14500000, category: 'Charm', luckBoost: 0.65, description: 'Increase Luck Boost For 65%' },
                { id: 8, name: 'Lucky Charm IV', price: 17500000, category: 'Charm', luckBoost: 0.90, description: 'Increase Luck Boost For 90%' },
                { id: 9, name: 'Lucky Charm V', price: 50000000, category: 'Charm', luckBoost: 2.00, description: 'Increase Luck Boost For 200%' }
            ],
            globalEvent: { 
                luckBonus: 0, 
                luckExpiresAt: 0, 
                catchRateBonus: 0, 
                catchRateExpiresAt: 0 
            },
            currentWeather: { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 },
            admins: []
        };
        fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
        dbCache = initialData;
        return dbCache;
    }

    try {
        dbCache = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        if (!dbCache.admins) dbCache.admins = [];
        if (!dbCache.marketListings) dbCache.marketListings = [];
        if (!dbCache.shopItems) dbCache.shopItems = [];
        if (!dbCache.globalEvent) dbCache.globalEvent = { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 };
        if (!dbCache.currentWeather) dbCache.currentWeather = { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 };
    } catch (e) {
        dbCache = { users: {}, marketListings: [], shopItems: [], globalEvent: { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 }, currentWeather: { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 }, admins: [] };
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
            quests: { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 }
        };
        saveData(data);
    }
    const u = data.users[userId];
    if (!Array.isArray(u.titles)) u.titles = [];
    if (u.equippedTitle === 'Novice Hunter') u.equippedTitle = null;
    if (!u.boxes) u.boxes = { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 };
    if (!u.lootboxes) u.lootboxes = 0;
    if (!u.quests) u.quests = { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 };
    return u;
}

// --- WEATHER AUTOMATIC ROTATION (Every 1 hour) ---
function updateWeatherIfNeeded(data) {
    const now = Date.now();
    if (!data.currentWeather || now > data.currentWeather.expiresAt) {
        const roll = Math.random() * 100;
        let weather = { name: 'Normal', catchRate: 0, luckBoost: 0 };
        if (roll < 0.1) {
            weather = { name: 'Galaxy', catchRate: 70, luckBoost: 1.00 };
        } else if (roll < 2.6) {
            weather = { name: 'Thunder', catchRate: 35, luckBoost: 0.75 };
        } else if (roll < 12.6) {
            weather = { name: 'Rainy', catchRate: 20, luckBoost: 0.55 };
        } else if (roll < 52.6) {
            weather = { name: 'Foggy', catchRate: 10, luckBoost: 0.25 };
        }
        data.currentWeather = { ...weather, expiresAt: now + 3600000 };
        saveData(data);
    }
}

// --- TIME PARSER FOR ADMIN EVENTS ---
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

// --- UNIFIED BOOST CALCULATOR (Guns, Non-stacking Charms, Weather, Timed Events) ---
function getActiveBoosts(data, user) {
    updateWeatherIfNeeded(data);
    const now = Date.now();

    // Expire Global Events if needed
    if (data.globalEvent.luckExpiresAt && now > data.globalEvent.luckExpiresAt) {
        data.globalEvent.luckBonus = 0;
        data.globalEvent.luckExpiresAt = 0;
    }
    if (data.globalEvent.catchRateExpiresAt && now > data.globalEvent.catchRateExpiresAt) {
        data.globalEvent.catchRateBonus = 0;
        data.globalEvent.catchRateExpiresAt = 0;
    }

    // Gun Check (Find best gun in inventory or market items owned)
    let bestGun = { huntCount: 1, luckBoost: 0 };
    const gunRanks = { 'Rifle': 1, 'Sniper': 2, 'Machine Gun': 3, 'NUKE': 4 };
    let highestGunRank = 0;

    for (const itemInv of user.inventory) {
        const shopItem = data.shopItems.find(i => i.name === itemInv && i.category === 'Gun');
        if (shopItem) {
            const rank = gunRanks[shopItem.name] || 0;
            if (rank > highestGunRank) {
                highestGunRank = rank;
                bestGun = { huntCount: shopItem.huntCount, luckBoost: shopItem.luckBoost };
            }
        }
    }

    // Non-stacking Charms (Takes highest single charm owned from inventory)
    let highestCharmLuck = 0;
    for (const itemInv of user.inventory) {
        const shopItem = data.shopItems.find(i => i.name === itemInv && i.category === 'Charm');
        if (shopItem && shopItem.luckBoost > highestCharmLuck) {
            highestCharmLuck = shopItem.luckBoost;
        }
    }

    const weatherLuck = data.currentWeather.luckBoost || 0;
    const weatherCatch = data.currentWeather.catchRate || 0;
    const eventLuck = data.globalEvent.luckBonus || 0;
    const eventCatch = data.globalEvent.catchRateBonus || 0;

    // Total stats calculation
    const totalLuckBoost = bestGun.luckBoost + highestCharmLuck + weatherLuck + eventLuck;
    const totalCatchRateBoost = weatherCatch + eventCatch;
    const totalLuckMultiplier = 1 + totalLuckBoost;
    const flatCatchBonus = totalCatchRateBoost / 100;

    return {
        huntCount: bestGun.huntCount,
        charmLuck: highestCharmLuck,
        gunLuck: bestGun.luckBoost,
        weatherLuck,
        weatherCatch,
        eventLuck,
        eventCatch,
        totalLuckBoost,
        totalCatchRateBoost,
        totalLuckMultiplier,
        flatCatchBonus,
        weatherName: data.currentWeather.name
    };
}

// --- QUEST PROGRESS TRACKER ---
function trackQuestProgress(user, actionType, count = 1) {
    if (!user.quests.dailyCompleted && user.quests.daily) {
        for (const task of user.quests.daily) {
            if (task.toLowerCase().includes(actionType.toLowerCase())) {
                user.quests.dailyProgress[task] = (user.quests.dailyProgress[task] || 0) + count;
            }
        }
    }
    if (!user.quests.weeklyCompleted && user.quests.weekly) {
        for (const task of user.quests.weekly) {
            if (task.toLowerCase().includes(actionType.toLowerCase())) {
                user.quests.weeklyProgress[task] = (user.quests.weeklyProgress[task] || 0) + count;
            }
        }
    }
}

// Check and automatically grant rewards if quest completed
function checkAndClaimQuests(user) {
    let claimedRewards = [];
    const now = Date.now();

    // Check Daily Quests
    if (!user.quests.dailyCompleted && user.quests.daily && user.quests.daily.length > 0) {
        let allDone = true;
        for (const task of user.quests.daily) {
            let targetCount = 5;
            if (task.includes('2')) targetCount = 2;
            if (task.includes('1')) targetCount = 1;
            if (task.includes('3')) targetCount = 3;
            if ((user.quests.dailyProgress[task] || 0) < targetCount) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            user.quests.dailyCompleted = true;
            user.lootboxes += 2;
            user.boxes.Rare += 1;
            claimedRewards.push('Daily Quest Completed! (+2 Lootboxes, +1 Rare Box)');
        }
    }

    // Check Weekly Quests
    if (!user.quests.weeklyCompleted && user.quests.weekly && user.quests.weekly.length > 0) {
        let allDone = true;
        for (const task of user.quests.weekly) {
            let targetCount = 3;
            if (task.includes('1')) targetCount = 1;
            if ((user.quests.weeklyProgress[task] || 0) < targetCount) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            user.quests.weeklyCompleted = true;
            user.lootboxes += 5;
            user.boxes.Epic += 1;
            user.boxes.Legendary += 1;
            claimedRewards.push('Weekly Quest Completed! (+5 Lootboxes, +1 Epic Box, +1 Legendary Box)');
        }
    }

    return claimedRewards;
}

// Custom Rarity Icons
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

// --- REWORKED CLEAN COLLECTION DISPLAY ---
function buildCollectionDisplay(userObj, username, userId) {
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${username}'s Animal Collection`)
        .setColor('#9900ff')
        .setTimestamp();

    const tierGroups = {
        'C': HUNT_ANIMALS.filter(a => a.tier === 'Common'),
        'U': HUNT_ANIMALS.filter(a => a.tier === 'Uncommon'),
        'R': HUNT_ANIMALS.filter(a => a.tier === 'Rare'),
        'E': HUNT_ANIMALS.filter(a => a.tier === 'Epic'),
        'L': HUNT_ANIMALS.filter(a => a.tier === 'Legendary'),
        'M': HUNT_ANIMALS.filter(a => a.tier === 'Mythic'),
        'S+': HUNT_ANIMALS.filter(a => a.tier === 'S+ Tier'),
        'SS+': HUNT_ANIMALS.filter(a => a.tier === 'SS+ Tier'),
        'SSS+': HUNT_ANIMALS.filter(a => a.tier === 'SSS+ Tier'),
        'GOD': HUNT_ANIMALS.filter(a => a.tier === 'GOD Tier' || a.tier === 'Shiny')
    };

    let hasAny = false;
    for (const [key, animals] of Object.entries(tierGroups)) {
        const lines = [];
        for (const animal of animals) {
            const count = userObj.collection[animal.name] || 0;
            if (count > 0) {
                hasAny = true;
                lines.append ? lines.append() : lines.push(`${animal.badge} **${animal.name}**: \`${count}x\``);
            }
        }
        if (lines.length > 0) {
            embed.addFields({ name: `${key} >`, value: lines.join(' | '), inline: false });
        }
    }

    if (!hasAny) {
        embed.setDescription('Your collection is empty! Buy a weapon in `/shop` and use `/hunt`.');
    }

    return { embeds: [embed] };
}

// Weighted Animal Picker helper
function pickWeightedAnimal(animalsPool, totalLuckMultiplier, flatCatchBonus) {
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

// Slash Commands Definition
const commands = [
    new SlashCommandBuilder().setName('balance').setDescription('Check wallet and bank balance.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for quick starter coins (1-10,000).'),
    new SlashCommandBuilder().setName('work').setDescription('Work to earn coins (1-100,000).'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Bet coins on a coinflip game.')
        .addStringOption(o => o.setName('choice').setDescription('Heads or Tails').setRequired(true).addChoices({name:'Heads', value:'heads'}, {name:'Tails', value:'tails'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('slot').setDescription('Play the slot machine (💎♥️🗡️🍎🍑🥭).')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('blackjack').setDescription('Play a game of blackjack.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('trivia').setDescription('Answer a trivia question to win coins.'),
    new SlashCommandBuilder().setName('shop').setDescription('View guns and charms shop categories.')
        .addStringOption(o => o.setName('category').setDescription('Shop category').setRequired(false).addChoices({name:'Gun', value:'Gun'}, {name:'Charm', value:'Charm'})),
    new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop.')
        .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true)),
    new SlashCommandBuilder().setName('market').setDescription('View player market listings or sell items.'),
    new SlashCommandBuilder().setName('sell').setDescription('Sell items or animals on the market.')
        .addStringOption(o => o.setName('type').setDescription('Animal or Item name').setRequired(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Quantity to sell').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Total price in coins').setRequired(true)),
    new SlashCommandBuilder().setName('buy-market').setDescription('Buy a listing from player market.')
        .addIntegerOption(o => o.setName('id').setDescription('Market Listing ID').setRequired(true)),
    new SlashCommandBuilder().setName('hunt').setDescription('Go hunting for creatures and boxes!'),
    new SlashCommandBuilder().setName('lootbox').setDescription('Open lootboxes with quantity support.')
        .addIntegerOption(o => o.setName('quantity').setDescription('Number of lootboxes to open').setRequired(false)),
    new SlashCommandBuilder().setName('open').setDescription('Open specific rarity boxes with quantity support.')
        .addStringOption(o => o.setName('rarity').setDescription('Box rarity').setRequired(true).addChoices(
            { name: 'Rare', value: 'Rare' }, { name: 'Epic', value: 'Epic' }, { name: 'Ultra', value: 'Ultra' }, { name: 'Legendary', value: 'Legendary' }, { name: 'GOD', value: 'GOD' }
        ))
        .addIntegerOption(o => o.setName('quantity').setDescription('Number of boxes to open').setRequired(false)),
    new SlashCommandBuilder().setName('daily').setDescription('Claim your 12h daily rewards & boxes!'),
    new SlashCommandBuilder().setName('weekly').setDescription('Claim your 5d weekly rewards & boxes!'),
    new SlashCommandBuilder().setName('quest').setDescription('View daily and weekly active tasks and automatic rewards.'),
    new SlashCommandBuilder().setName('event').setDescription('View current active weather and global event status.'),
    new SlashCommandBuilder().setName('stats').setDescription('View your current active Luck and Catch Rate boost stats.'),
    new SlashCommandBuilder().setName('collection').setDescription('View your clean categorized animal collection.'),
    new SlashCommandBuilder().setName('inventory').setDescription('View your item inventory, boxes, and lootboxes.'),
    new SlashCommandBuilder().setName('titles').setDescription('View and equip your unlocked profile titles.')
        .addStringOption(o => o.setName('equip').setDescription('Exact title name to equip').setRequired(false)),
    new SlashCommandBuilder().setName('titlelist').setDescription('View list of all available titles by category and description.'),
    new SlashCommandBuilder().setName('profiles').setDescription('View detailed user profile stats.')
        .addUserOption(o => o.setName('user').setDescription('User profile to view').setRequired(false)),
    new SlashCommandBuilder().setName('bank').setDescription('Deposit or withdraw coins.')
        .addStringOption(o => o.setName('action').setDescription('deposit or withdraw').setRequired(true).addChoices({name:'Deposit', value:'deposit'}, {name:'Withdraw', value:'withdraw'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('give').setDescription('Transfer coins.')
        .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('trade').setDescription('Interactive trade offer with another user.')
        .addUserOption(o => o.setName('target').setDescription('Trade partner').setRequired(true)),
    
    // Admin & Owner Commands
    new SlashCommandBuilder().setName('admin-give-coins').setDescription('Admin: Give coins').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-item').setDescription('Admin: Give shop item').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-animal').setDescription('Admin: Give animal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Animal name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-title').setDescription('Admin: Award title').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Title name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-lootbox').setDescription('Admin: Give lootboxes').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Quantity').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-boxes').setDescription('Admin: Give boxes').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('rarity').setDescription('Rarity').setRequired(true).addChoices(
            { name: 'Rare', value: 'Rare' }, { name: 'Epic', value: 'Epic' }, { name: 'Ultra', value: 'Ultra' }, { name: 'Legendary', value: 'Legendary' }, { name: 'GOD', value: 'GOD' }
        ))
        .addIntegerOption(o => o.setName('amount').setDescription('Quantity').setRequired(true)),
    new SlashCommandBuilder().setName('admin-run-weather').setDescription('Admin: Force trigger or change weather')
        .addStringOption(o => o.setName('weather').setDescription('Weather name').setRequired(true).addChoices(
            { name: 'Foggy', value: 'Foggy' }, { name: 'Rainy', value: 'Rainy' }, { name: 'Thunder', value: 'Thunder' }, { name: 'Galaxy', value: 'Galaxy' }, { name: 'Normal', value: 'Normal' }
        )),
    new SlashCommandBuilder().setName('admin-reset-account').setDescription('Admin: Reset all data for a user or entire db')
        .addUserOption(o => o.setName('target').setDescription('Target user (leave blank to reset all)').setRequired(false)),
    new SlashCommandBuilder().setName('admin-give-permission').setDescription('Owner only: Grant admin permissions.'),
    new SlashCommandBuilder().setName('admin-luck-event').setDescription('Admin: Start timed global luck event')
        .addNumberOption(o => o.setName('amount').setDescription('Boost amount').setRequired(true))
        .addStringOption(o => o.setName('time').setDescription('Duration (e.g. 30s, 1h)').setRequired(true)),
    new SlashCommandBuilder().setName('admin-catching-rate-event').setDescription('Admin: Start timed catch rate event')
        .addNumberOption(o => o.setName('amount').setDescription('Boost amount').setRequired(true))
        .addStringOption(o => o.setName('time').setDescription('Duration').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands synchronized.');
});

// Bot Status update representing how many servers are playing
setInterval(() => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`with ${serverCount} servers | /hunt`, { type: 0 });
}, 60000);

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
    // --- INTERACTIVE BUTTONS (Collection Sort & Trade UI) ---
    if (interaction.isButton()) {
        const data = readData();
        if (interaction.customId.startsWith('trade_offer_')) {
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const initiatorId = parts[3];

            if (interaction.user.id !== targetId && interaction.user.id !== initiatorId) {
                return interaction.reply({ content: '❌ You are not part of this trade session.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🤝 Interactive Trade Session')
                .setColor('#ffaa00')
                .setDescription(`Trade session active between users.\n\n` +
                    `**User 1 (${initiatorId === interaction.user.id ? interaction.user.username : 'Partner'})**\n` +
                    `_____________________\n| 📦 Ready to exchange\n|_____________________\n\n` +
                    `**User 2 (${targetId === interaction.user.id ? interaction.user.username : 'Partner'})**\n` +
                    `_____________________\n| 📦 Ready to exchange\n|_____________________`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_accept_${initiatorId}_${targetId}`).setLabel('Confirm Trade').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`trade_cancel_${initiatorId}_${targetId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        else if (interaction.customId.startsWith('trade_accept_')) {
            return interaction.update({ content: '✅ Trade successfully completed and verified!', embeds: [], components: [] });
        }
        else if (interaction.customId.startsWith('trade_cancel_')) {
            return interaction.update({ content: '❌ Trade session cancelled.', embeds: [], components: [] });
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
            trackQuestProgress(user, 'beg', 1);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`🤲 You begged and received **${amt.toLocaleString()} coins**!`);
        }

        // --- WORK ---
        else if (commandName === 'work') {
            const amt = Math.floor(Math.random() * 100000) + 1;
            user.wallet += amt;
            trackQuestProgress(user, 'work', 1);
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
            trackQuestProgress(user, 'coinflip', 1);
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
            trackQuestProgress(user, 'slot', 1);
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

        // --- SHOP (/shop) ---
        else if (commandName === 'shop') {
            const category = interaction.options.getString('category');
            const embed = new EmbedBuilder().setTitle('🛒 Shop & Weapon Armory').setColor('#00ffcc');

            const itemsToShow = category ? data.shopItems.filter(i => i.category === category) : data.shopItems;

            const gunList = itemsToShow.filter(i => i.category === 'Gun').map(i => `**[ID: ${i.id}] ${i.name}** - 🪙 ${i.price.toLocaleString()}\n└ *${i.description}*`).join('\n\n');
            const charmList = itemsToShow.filter(i => i.category === 'Charm').map(i => `**[ID: ${i.id}] ${i.name}** - 🪙 ${i.price.toLocaleString()}\n└ *${i.description}* (Non-stackable)`).join('\n\n');

            if (!category || category === 'Gun') {
                embed.addFields({ name: '🔫 Gun Category', value: gunList || 'No guns available.' });
            }
            if (!category || category === 'Charm') {
                embed.addFields({ name: '✨ Charm Category (Non-stacking)', value: charmList || 'No charms available.' });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- BUY (/buy) ---
        else if (commandName === 'buy') {
            const id = interaction.options.getInteger('id');
            const item = data.shopItems.find(i => i.id === id);
            if (!item) return interaction.reply({ content: '❌ Item not found in shop.', ephemeral: true });

            // Ensure non-stackable charm check
            if (item.category === 'Charm' && user.inventory.includes(item.name)) {
                return interaction.reply({ content: `❌ You already own **${item.name}**! Charms cannot be stacked.`, ephemeral: true });
            }

            if (user.wallet < item.price) return interaction.reply({ content: '❌ Not enough wallet coins.', ephemeral: true });

            user.wallet -= item.price;
            user.inventory.push(item.name);
            saveData(data);
            return interaction.reply(`✅ Successfully purchased **${item.name}** for 🪙 ${item.price.toLocaleString()}!`);
        }

        // --- MARKET SELL & BUY ---
        else if (commandName === 'sell') {
            const typeName = interaction.options.getString('type');
            const qty = interaction.options.getInteger('quantity');
            const amount = interaction.options.getInteger('amount');

            if (qty <= 0 || amount <= 0) return interaction.reply({ content: '❌ Quantity and amount must be greater than zero.', ephemeral: true });

            // Check if user has item or animal
            let isAnimal = HUNT_ANIMALS.some(a => a.name.toLowerCase() === typeName.toLowerCase());
            let isItem = user.inventory.includes(typeName);

            if (isAnimal) {
                const animalObj = HUNT_ANIMALS.find(a => a.name.toLowerCase() === typeName.toLowerCase());
                if ((user.collection[animalObj.name] || 0) < qty) {
                    return interaction.reply({ content: `❌ You do not have ${qty}x **${animalObj.name}** in your collection.`, ephemeral: true });
                }
                user.collection[animalObj.name] -= qty;
                if (user.collection[animalObj.name] <= 0) delete user.collection[animalObj.name];

                data.marketListings.push({
                    id: data.marketListings.length + 1,
                    sellerId: interaction.user.id,
                    sellerName: interaction.user.username,
                    type: 'Animal',
                    name: animalObj.name,
                    quantity: qty,
                    price: amount
                });
            } else if (isItem) {
                // Count occurrences in inventory
                let count = user.inventory.filter(i => i.toLowerCase() === typeName.toLowerCase()).length;
                if (count < qty) {
                    return interaction.reply({ content: `❌ You do not have ${qty}x **${typeName}** in your inventory.`, ephemeral: true });
                }
                for (let i = 0; i < qty; i++) {
                    const idx = user.inventory.findIndex(inv => inv.toLowerCase() === typeName.toLowerCase());
                    if (idx > -1) user.inventory.splice(idx, 1);
                }

                data.marketListings.push({
                    id: data.marketListings.length + 1,
                    sellerId: interaction.user.id,
                    sellerName: interaction.user.username,
                    type: 'Item',
                    name: typeName,
                    quantity: qty,
                    price: amount
                });
            } else {
                return interaction.reply({ content: `❌ You don't own any item or animal named **${typeName}** to sell.`, ephemeral: true });
            }

            saveData(data);
            return interaction.reply(`🛍️ Successfully listed **${qty}x ${typeName}** on the market for 🪙 ${amount.toLocaleString()} coins! (Listing ID: ${data.marketListings.length})`);
        }

        else if (commandName === 'market') {
            const embed = new EmbedBuilder().setTitle('🏪 Player Community Market').setColor('#00ffcc');
            if (data.marketListings.length === 0) {
                embed.setDescription('No active listings on the market. Use `/sell` to post items or animals.');
            } else {
                const list = data.marketListings.map(l => `**[ID: ${l.id}]** ${l.quantity}x **${l.name}** (${l.type}) by **${l.sellerName}** — 🪙 **${l.price.toLocaleString()} coins**`).join('\n');
                embed.setDescription(list);
            }
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'buy-market') {
            const id = interaction.options.getInteger('id');
            const listing = data.marketListings.find(l => l.id === id);
            if (!listing) return interaction.reply({ content: '❌ Market listing not found.', ephemeral: true });
            if (listing.sellerId === interaction.user.id) return interaction.reply({ content: '❌ You cannot buy your own listing.', ephemeral: true });
            if (user.wallet < listing.price) return interaction.reply({ content: '❌ Not enough wallet coins to buy this listing.', ephemeral: true });

            user.wallet -= listing.price;
            const sellerUser = getUser(data, listing.sellerId);
            sellerUser.wallet += listing.price;

            // Transfer items/animals to buyer
            if (listing.type === 'Animal') {
                if (!user.collection[listing.name]) user.collection[listing.name] = 0;
                user.collection[listing.name] += listing.quantity;
            } else {
                for (let i = 0; i < listing.quantity; i++) {
                    user.inventory.push(listing.name);
                }
            }

            // Remove listing
            data.marketListings = data.marketListings.filter(l => l.id !== id);
            saveData(data);

            return interaction.reply(`✅ Successfully purchased ${listing.quantity}x **${listing.name}** from **${listing.sellerName}** for 🪙 ${listing.price.toLocaleString()} coins!`);
        }

        // --- HUNTING REWORK (No coin earnings, drops boxes/lootboxes, gun hunt counts) ---
        else if (commandName === 'hunt') {
            const boosts = getActiveBoosts(data, user);
            const huntCount = boosts.huntCount;

            const embed = new EmbedBuilder()
                .setTitle('🎯 Hunting Expedition')
                .setColor('#00ff88');

            const caughtSummary = [];
            let totalBoxesFound = 0;

            for (let i = 0; i < huntCount; i++) {
                // Box drop from hunt
                let droppedBox = null;
                const rollBox = Math.random();
                const boxMultiplier = boosts.totalLuckMultiplier + (boosts.flatCatchBonus * 0.5);

                if (rollBox < 0.005 * boxMultiplier) { droppedBox = 'GOD'; user.boxes.GOD++; totalBoxesFound++; }
                else if (rollBox < 0.01 * boxMultiplier) { droppedBox = 'Legendary'; user.boxes.Legendary++; totalBoxesFound++; }
                else if (rollBox < 0.03 * boxMultiplier) { droppedBox = 'Ultra'; user.boxes.Ultra++; totalBoxesFound++; }
                else if (rollBox < 0.06 * boxMultiplier) { droppedBox = 'Epic'; user.boxes.Epic++; totalBoxesFound++; }
                else if (rollBox < 0.10 * boxMultiplier) { droppedBox = 'Rare'; user.boxes.Rare++; totalBoxesFound++; }

                // Shiny chance boosted by Charms, Guns, Weather & Timed Events
                let caught = null;
                const shinyChance = (0.001 * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.01);

                if (Math.random() < shinyChance) {
                    const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                    caught = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                } else {
                    const standardAnimals = HUNT_ANIMALS.filter(a => a.tier !== 'Shiny');
                    caught = pickWeightedAnimal(standardAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                }

                if (!user.collection[caught.name]) user.collection[caught.name] = 0;
                user.collection[caught.name]++;
                caughtSummary.push(`${caught.badge} **${caught.name}** (${caught.tier})`);
            }

            trackQuestProgress(user, 'hunt', huntCount);
            const questAlerts = checkAndClaimQuests(user);

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            embed.setDescription(`You fired your weapon and completed **${huntCount} hunts**!\n\n**Animals Caught:**\n${caughtSummary.join('\n')}`);
            if (totalBoxesFound > 0) {
                embed.addFields({ name: '🎁 Boxes Found', value: `Found **${totalBoxesFound}** mystery boxes during the hunt!` });
            }
            if (questAlerts.length > 0) {
                embed.addFields({ name: '🎉 Quest Completed!', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- LOOTBOX WITH QUANTITY SUPPORT (/lootbox) ---
        else if (commandName === 'lootbox') {
            const qty = interaction.options.getInteger('quantity') || 1;
            if (qty <= 0) return interaction.reply({ content: '❌ Quantity must be at least 1.', ephemeral: true });
            if ((user.lootboxes || 0) < qty) {
                return interaction.reply({ content: `❌ You only have **${user.lootboxes || 0}x** Lootboxes available! (${LOOTBOX_ICON})`, ephemeral: true });
            }

            user.lootboxes -= qty;
            const boosts = getActiveBoosts(data, user);
            const rewardsSummary = [];

            for (let i = 0; i < qty; i++) {
                const roll = Math.random();
                const shinyChance = (0.005 * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.02);

                if (roll < shinyChance) {
                    const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                    const shiny = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                    if (!user.collection[shiny.name]) user.collection[shiny.name] = 0;
                    user.collection[shiny.name]++;
                    rewardsSummary.push(`✨ Shiny Animal: ${shiny.badge} **${shiny.name}**`);
                } else if (Math.random() < 0.5) {
                    const coinAmt = Math.floor(Math.random() * 5000) + 1;
                    user.wallet += coinAmt;
                    rewardsSummary.push(`🪙 Coins: ${coinAmt.toLocaleString()}`);
                } else {
                    const standardAnimals = HUNT_ANIMALS.filter(a => a.tier !== 'Shiny');
                    const randAnimal = pickWeightedAnimal(standardAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                    if (!user.collection[randAnimal.name]) user.collection[randAnimal.name] = 0;
                    user.collection[randAnimal.name]++;
                    rewardsSummary.push(`🐾 Animal: ${randAnimal.badge} **${randAnimal.name}** (${randAnimal.tier})`);
                }
            }

            trackQuestProgress(user, 'open', qty);
            const questAlerts = checkAndClaimQuests(user);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`${LOOTBOX_ICON} Opened ${qty}x Lootboxes!`)
                .setDescription(rewardsSummary.slice(0, 15).join('\n') + (rewardsSummary.length > 15 ? `\n*(And ${rewardsSummary.length - 15} more rewards)*` : ''))
                .setColor('#ffaa00');

            if (questAlerts.length > 0) {
                embed.addFields({ name: '🎉 Quest Completed!', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- OPEN BOXES WITH QUANTITY SUPPORT (/open) ---
        else if (commandName === 'open') {
            const boxRarity = interaction.options.getString('rarity');
            const qty = interaction.options.getInteger('quantity') || 1;
            if (qty <= 0) return interaction.reply({ content: '❌ Quantity must be at least 1.', ephemeral: true });

            if (!user.boxes[boxRarity] || user.boxes[boxRarity] < qty) {
                return interaction.reply({ content: `❌ You only have **${user.boxes[boxRarity] || 0}x** **${boxRarity} Boxes** available!`, ephemeral: true });
            }

            user.boxes[boxRarity] -= qty;
            const boosts = getActiveBoosts(data, user);

            let maxCoins = 1000;
            let maxRank = 6;
            let baseShinyChance = 0.00001;
            if (boxRarity === 'Epic') { maxCoins = 10000; maxRank = 7; baseShinyChance = 0.000015; }
            else if (boxRarity === 'Ultra') { maxCoins = 20000; maxRank = 9; baseShinyChance = 0.00005; }
            else if (boxRarity === 'Legendary') { maxCoins = 30000; maxRank = 9; baseShinyChance = 0.0001; }
            else if (boxRarity === 'GOD') { maxCoins = 50000; maxRank = 10; baseShinyChance = 0.001; }

            const rewardsSummary = [];

            for (let i = 0; i < qty; i++) {
                if (Math.random() < 0.5) {
                    const coinDrop = Math.floor(Math.random() * maxCoins) + 1;
                    user.wallet += coinDrop;
                    rewardsSummary.push(`🪙 Coins: ${coinDrop.toLocaleString()}`);
                } else {
                    const effectiveShinyChance = (baseShinyChance * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.01);
                    if (Math.random() < effectiveShinyChance) {
                        const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                        const sAnimal = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                        if (!user.collection[sAnimal.name]) user.collection[sAnimal.name] = 0;
                        user.collection[sAnimal.name]++;
                        rewardsSummary.push(`✨ Shiny Animal Drop: ${sAnimal.badge} **${sAnimal.name}**`);
                    } else {
                        const eligibleAnimals = HUNT_ANIMALS.filter(a => a.rank <= maxRank && a.tier !== 'Shiny');
                        const chosen = pickWeightedAnimal(eligibleAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                        if (!user.collection[chosen.name]) user.collection[chosen.name] = 0;
                        user.collection[chosen.name]++;
                        rewardsSummary.push(`🐾 Animal Drop: ${chosen.badge} **${chosen.name}** (${chosen.tier})`);
                    }
                }
            }

            trackQuestProgress(user, 'open', qty);
            const questAlerts = checkAndClaimQuests(user);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`${BOX_ICONS[boxRarity]} Opened ${qty}x ${boxRarity} Boxes!`)
                .setDescription(rewardsSummary.slice(0, 15).join('\n') + (rewardsSummary.length > 15 ? `\n*(And ${rewardsSummary.length - 15} more drops)*` : ''))
                .setColor('#9900ff');

            if (questAlerts.length > 0) {
                embed.addFields({ name: '🎉 Quest Completed!', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- DAILY & WEEKLY ---
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

        // --- QUEST (Automatic rewards & status) ---
        else if (commandName === 'quest') {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const weekMs = 5 * 24 * 60 * 60 * 1000;

            if (!user.quests.dailyReset || now > user.quests.dailyReset) {
                user.quests.dailyReset = now + dayMs;
                user.quests.daily = ['Hunt 5 animals', 'Work 2 shifts', 'Open 1 boxes'];
                user.quests.dailyProgress = {};
                user.quests.dailyCompleted = false;
            }
            if (!user.quests.weeklyReset || now > user.quests.weeklyReset) {
                user.quests.weeklyReset = now + weekMs;
                user.quests.weekly = ['Open 3 boxes', 'Hunt 10 animals'];
                user.quests.weeklyProgress = {};
                user.quests.weeklyCompleted = false;
            }
            saveData(data);

            const dailyTimeLeft = Math.ceil((user.quests.dailyReset - now) / (1000 * 60));
            const weeklyDaysLeft = ((user.quests.weeklyReset - now) / (1000 * 60 * 60 * 24)).toFixed(1);

            const embed = new EmbedBuilder()
                .setTitle('📋 Quests & Automatic Rewards')
                .setColor('#00ffcc')
                .addFields(
                    { name: `📅 Daily Quests (Resets in ${Math.floor(dailyTimeLeft / 60)}h ${dailyTimeLeft % 60}m) [${user.quests.dailyCompleted ? 'COMPLETED ✅' : 'IN PROGRESS'}]`, value: user.quests.daily.map(q => `• ${q} (${user.quests.dailyProgress[q] || 0})`).join('\n') },
                    { name: `🗓️ Weekly Quests (Resets in ${weeklyDaysLeft} days) [${user.quests.weeklyCompleted ? 'COMPLETED ✅' : 'IN PROGRESS'}]`, value: user.quests.weekly.map(q => `• ${q} (${user.quests.weeklyProgress[q] || 0})`).join('\n') }
                );

            return interaction.reply({ embeds: [embed] });
        }

        // --- EVENT WEATHER (/event) ---
        else if (commandName === 'event') {
            updateWeatherIfNeeded(data);
            const w = data.currentWeather;
            const embed = new EmbedBuilder()
                .setTitle('⛅ Current Active Weather & Events')
                .setColor('#ffaa00')
                .addFields(
                    { name: '🌤️ Active Weather', value: `**${w.name}**\n└ Catch Rate: +${w.catchRate}% | Luck Boost: +${Math.round(w.luckBoost * 100)}%` },
                    { name: '⏳ Next Weather Shift', value: `Rotates every 1 hour (Resets in ${Math.ceil((w.expiresAt - Date.now()) / 60000)} mins)` }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- STATS BOOSTS (/stats) ---
        else if (commandName === 'stats') {
            const boosts = getActiveBoosts(data, user);
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${interaction.user.username}'s Boost Statistics`)
                .setColor('#0099ff')
                .addFields(
                    { name: '🍀 [luck]', value: `**+${Math.round(boosts.totalLuckBoost * 100)}%** total luck boost (Gun: +${Math.round(boosts.gunLuck*100)}%, Charm: +${Math.round(boosts.charmLuck*100)}%, Weather: +${Math.round(boosts.weatherLuck*100)}%, Event: +${Math.round(boosts.eventLuck*100)}%)`, inline: false },
                    { name: '🎯 [boost rate]', value: `**+${boosts.totalCatchRateBoost}%** catch rate boost (Weather: +${boosts.weatherCatch}%, Event: +${boosts.eventCatch}%)`, inline: false },
                    { name: '🔫 Weapon Hunt Power', value: `Hunts **${boosts.huntCount}** animals per `/hunt` command`, inline: false }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- REWORKED COLLECTION (/collection) ---
        else if (commandName === 'collection') {
            const payload = buildCollectionDisplay(user, interaction.user.username, interaction.user.id);
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
                { name: '🎒 Tools & Weapons', value: itemList }
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
                .setColor('#ffd700');

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
                .setColor('#5865F2');

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
            const boosts = getActiveBoosts(data, tData);

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

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`🌟 User Profile Card • ${target.username}`)
                .setDescription(`>>> 🏷️ **Title Showcase:** ${formatTitleDisplay(tData.equippedTitle)}`)
                .addFields(
                    { name: '🔥 Daily Streak', value: `\`${tData.dailyStreak || 0} Days\``, inline: true },
                    { name: '🎯 Total Hunts', value: `\`${totalHuntCount.toLocaleString()}\``, inline: true },
                    { name: '👑 Best Catch', value: `${bestCaughtDisplay}`, inline: true },
                    { name: '🪙 Wallet Balance', value: `\`🪙 ${tData.wallet.toLocaleString()}\``, inline: true },
                    { name: '🏦 Bank Balance', value: `\`🏦 ${tData.bank.toLocaleString()}\``, inline: true },
                    { name: '📊 Active Stats', value: `Luck: +${Math.round(boosts.totalLuckBoost*100)}% | Catch: +${boosts.totalCatchRateBoost}%`, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // --- TRADE UI IMPROVEMENT ---
        else if (commandName === 'trade') {
            const target = interaction.options.getUser('target');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Cannot trade with yourself.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🤝 Secure Interactive Trade')
                .setColor('#ffaa00')
                .setDescription(`Trade session between **${interaction.user.username}** and **${target.username}**.\n\n` +
                    `**${interaction.user.username}**\n` +
                    `_____________________\n| Click the button to offer items/coins\n|_____________________\n\n` +
                    `**${target.username}**\n` +
                    `_____________________\n| Click the button to offer items/coins\n|_____________________`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_offer_${target.id}_${interaction.user.id}`).setLabel('Click to Offer').setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- BANK, GIVE ---
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

        else if (commandName === 'admin-give-lootbox') {
            const target = interaction.options.getUser('target');
            const amt = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.lootboxes = (targetData.lootboxes || 0) + amt;
            saveData(data);
            return interaction.reply({ content: `🎁 Admin: Gave **${amt}x** Lootboxes to ${target.tag}!`, ephemeral: true });
        }

        else if (commandName === 'admin-give-boxes') {
            const target = interaction.options.getUser('target');
            const rarity = interaction.options.getString('rarity');
            const amt = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.boxes[rarity] = (targetData.boxes[rarity] || 0) + amt;
            saveData(data);
            return interaction.reply({ content: `📦 Admin: Gave **${amt}x ${rarity} Boxes** to ${target.tag}!`, ephemeral: true });
        }

        else if (commandName === 'admin-run-weather') {
            const wName = interaction.options.getString('weather');
            let wConfig = { name: wName, catchRate: 0, luckBoost: 0 };
            if (wName === 'Foggy') wConfig = { name: 'Foggy', catchRate: 10, luckBoost: 0.25 };
            else if (wName === 'Rainy') wConfig = { name: 'Rainy', catchRate: 20, luckBoost: 0.55 };
            else if (wName === 'Thunder') wConfig = { name: 'Thunder', catchRate: 35, luckBoost: 0.75 };
            else if (wName === 'Galaxy') wConfig = { name: 'Galaxy', catchRate: 70, luckBoost: 1.00 };

            data.currentWeather = { ...wConfig, expiresAt: Date.now() + 3600000 };
            saveData(data);
            return interaction.reply({ content: `🌤️ Admin: Weather forcibly changed to **${wName}**!`, ephemeral: true });
        }

        else if (commandName === 'admin-reset-account') {
            const target = interaction.options.getUser('target');
            if (target) {
                delete data.users[target.id];
                saveData(data);
                return interaction.reply({ content: `⚠️ Admin: Reset account data for ${target.tag}.`, ephemeral: true });
            } else {
                data.users = {};
                saveData(data);
                return interaction.reply({ content: `⚠️ Admin: Reset ALL user accounts in database!`, ephemeral: true });
            }
        }

        else if (commandName === 'admin-give-permission') {
            const targetUser = interaction.options.getUser('user');
            if (targetUser && !data.admins.includes(targetUser.id)) {
                data.admins.push(targetUser.id);
                saveData(data);
            }
            return interaction.reply({ content: `🛡️ Owner: Granted admin permissions successfully!`, ephemeral: true });
        }

        else if (commandName === 'admin-luck-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) return interaction.reply({ content: '❌ Invalid time format!', ephemeral: true });

            data.globalEvent.luckBonus = amount;
            data.globalEvent.luckExpiresAt = Date.now() + durationMs;
            saveData(data);

            return interaction.reply({ content: `✨ Global Luck Event activated (+${Math.round(amount*100)}%) for ${timeStr}!` });
        }

        else if (commandName === 'admin-catching-rate-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) return interaction.reply({ content: '❌ Invalid time format!', ephemeral: true });

            data.globalEvent.catchRateBonus = amount;
            data.globalEvent.catchRateExpiresAt = Date.now() + durationMs;
            saveData(data);

            return interaction.reply({ content: `🎯 Global Catch Rate Event activated (+${amount}%) for ${timeStr}!` });
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred processing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
