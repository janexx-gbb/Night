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
const https = require('https');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const dataFile = path.join(__dirname, 'data.json');

// --- RAM CACHING & SAFE SCHEMA MIGRATION PERSISTENCE ---
let dbCache = null;

function readData() {
    if (dbCache) return dbCache;

    try {
        if (fs.existsSync(dataFile)) {
            const raw = fs.readFileSync(dataFile, 'utf8');
            dbCache = JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading data.json, initializing fallback cache:', e);
    }

    if (!dbCache || typeof dbCache !== 'object') {
        dbCache = {
            users: {},
            marketListings: [],
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
            globalEvent: { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 },
            currentWeather: { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 },
            admins: []
        };
    }

    if (!dbCache.users) dbCache.users = {};
    if (!dbCache.marketListings) dbCache.marketListings = [];
    if (!dbCache.shopItems || dbCache.shopItems.length === 0) {
        dbCache.shopItems = [
            { id: 1, name: 'Rifle', price: 100000, category: 'Gun', huntCount: 1, luckBoost: 0.05, description: 'Hunts 1 Animal with 5% Luck Boost' },
            { id: 2, name: 'Sniper', price: 500000, category: 'Gun', huntCount: 3, luckBoost: 0.10, description: 'Hunts 3 Animals with 10% Luck Boost' },
            { id: 3, name: 'Machine Gun', price: 10000000, category: 'Gun', huntCount: 5, luckBoost: 0.50, description: 'Hunts 5 Animals with 50% Luck Boost' },
            { id: 4, name: 'NUKE', price: 100000000, category: 'Gun', huntCount: 100, luckBoost: 5.00, description: 'Hunts 100 Animals with 500% Luck Boost' },
            { id: 5, name: 'Lucky Charm I', price: 1500000, category: 'Charm', luckBoost: 0.25, description: 'Increase Luck Boost For 25%' },
            { id: 6, name: 'Lucky Charm II', price: 11500000, category: 'Charm', luckBoost: 0.30, description: 'Increase Luck Boost For 30%' },
            { id: 7, name: 'Lucky Charm III', price: 14500000, category: 'Charm', luckBoost: 0.65, description: 'Increase Luck Boost For 65%' },
            { id: 8, name: 'Lucky Charm IV', price: 17500000, category: 'Charm', luckBoost: 0.90, description: 'Increase Luck Boost For 90%' },
            { id: 9, name: 'Lucky Charm V', price: 50000000, category: 'Charm', luckBoost: 2.00, description: 'Increase Luck Boost For 200%' }
        ];
    }
    if (!dbCache.globalEvent) dbCache.globalEvent = { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 };
    if (!dbCache.currentWeather) dbCache.currentWeather = { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 };
    if (!dbCache.admins) dbCache.admins = [];

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
            wallet: 0, 
            bank: 0, 
            inventory: [], 
            boxes: { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 },
            lootboxes: 0,
            collection: {}, 
            cooldowns: {},
            titles: [],
            equippedTitle: null,
            started: false,
            dailyStreak: 0,
            lastDailyTimestamp: 0,
            lastWeeklyTimestamp: 0,
            level: 1,
            exp: 0,
            points: 0,
            team: [null, null, null],
            animalLevels: {},
            badges: [],
            totalHunts: 0,
            quests: { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 }
        };
        saveData(data);
    }
    const u = data.users[userId];
    if (u.started === undefined) u.started = false;
    if (!Array.isArray(u.titles)) u.titles = [];
    if (!u.boxes) u.boxes = { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 };
    if (!u.lootboxes) u.lootboxes = 0;
    if (u.level === undefined) u.level = 1;
    if (u.exp === undefined) u.exp = 0;
    if (u.points === undefined) u.points = 0;
    if (!Array.isArray(u.team)) u.team = [null, null, null];
    if (!u.animalLevels) u.animalLevels = {};
    if (!Array.isArray(u.badges)) u.badges = [];
    if (u.totalHunts === undefined) u.totalHunts = 0;
    if (!u.quests) u.quests = { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 };
    return u;
}

// --- CUSTOM COIN ICON & FORMATTER ---
const COIN_ICON = '💰'; 
const BANK_ICON = '🏦';
const WALLET_ICON = '💳';

function formatCurrency(amount) {
    if (amount >= 1e12) return (amount / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (amount >= 1e9) return (amount / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (amount >= 1e6) return (amount / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (amount >= 1e3) return (amount / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return amount.toLocaleString();
}

// --- DYNAMIC LEVEL & EXP FORMULAS ---
function getUserMaxExp(level) {
    return 2500 + ((level - 1) * 6000);
}

function getAnimalMaxExp(level) {
    return 5000 + ((level - 1) * 7500);
}

function addUserExp(user, amount) {
    user.exp += amount;
    let neededExp = getUserMaxExp(user.level);
    while (user.exp >= neededExp) {
        user.exp -= neededExp;
        user.level++;
        neededExp = getUserMaxExp(user.level);
    }
    updateBadgesAndRanks(user, '', null);
}

function addAnimalExp(user, animalName, amount) {
    if (!user.animalLevels[animalName]) {
        user.animalLevels[animalName] = { level: 1, exp: 0 };
    }
    const pet = user.animalLevels[animalName];
    pet.exp += amount;
    let neededExp = getAnimalMaxExp(pet.level);
    while (pet.exp >= neededExp) {
        pet.exp -= neededExp;
        pet.level++;
        neededExp = getAnimalMaxExp(pet.level);
    }
}

function updateBadgesAndRanks(user, userId, data) {
    const huntBadges = [
        { count: 50000, emoji: '<:50khunts:1571018959904313364>' },
        { count: 30000, emoji: '<:30khunts:1571018894754193469>' },
        { count: 20000, emoji: '<:20khunts:1571018827108712561>' },
        { count: 10000, emoji: '<:10khunts:1571018670098878464>' },
        { count: 5000, emoji: '<:5khunts:1571018603770159236>' },
        { count: 1000, emoji: '<:1khunts:1571018500112125982>' }
    ];
    for (const b of huntBadges) {
        if (user.totalHunts >= b.count && !user.badges.includes(b.emoji)) {
            user.badges.push(b.emoji);
        }
    }

    const levelBadges = [
        { level: 150, emoji: '<:lvl150:1571012977744805990>' },
        { level: 50, emoji: '<:lvl50:1571012702250475601>' },
        { level: 10, emoji: '<:lvl10:1571012632633147512>' }
    ];
    for (const b of levelBadges) {
        if (user.level >= b.level && !user.badges.includes(b.emoji)) {
            user.badges.push(b.emoji);
        }
    }
}

function getRankBadge(points) {
    if (points >= 10000) return '<:10000pts:1571018412464021504>';
    if (points >= 6000) return '<:6000pts:1571018312626872421>';
    if (points >= 4500) return '<:4500pts:1571018231584526397>';
    if (points >= 3500) return '<:3500pts:1571019075604193300>';
    if (points >= 2500) return '<:2500pts:1571018118036463786>';
    return '<:1000pts:1571018024838893678>';
}

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

function getActiveBoosts(data, user) {
    updateWeatherIfNeeded(data);
    const now = Date.now();

    if (data.globalEvent.luckExpiresAt && now > data.globalEvent.luckExpiresAt) {
        data.globalEvent.luckBonus = 0;
        data.globalEvent.luckExpiresAt = 0;
    }
    if (data.globalEvent.catchRateExpiresAt && now > data.globalEvent.catchRateExpiresAt) {
        data.globalEvent.catchRateBonus = 0;
        data.globalEvent.catchRateExpiresAt = 0;
    }

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

function checkAndClaimQuests(user) {
    let claimedRewards = [];

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

const RARITY_ICONS = {
    'Common': '<:common:1570576518206333098>',
    'Uncommon': '<:uncommon:1570576547298021437>',
    'Rare': '<:rare:1570576572044279918>',
    'Epic': '<:epic:1570576596413190154>',
    'Legendary': '<:legendary:1570562590529159210>',
    'Mythic': '<:mythical:1570576640247861449>',
    'S+ Tier': '<:stier:1571017458419109989>',
    'SS+ Tier': '<:sstier:1571017591189807104>',
    'SSS+ Tier': '<:ssstier:1571017675650367608>',
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

const HUNT_ANIMALS = [
    { name: 'Worm', tier: 'Common', rank: 1, badge: '🐛', rate: 0.85, reward: 50, minExp: 20, maxExp: 50 },
    { name: 'Dog', tier: 'Common', rank: 1, badge: '🐕', rate: 0.85, reward: 60, minExp: 20, maxExp: 50 },
    { name: 'Bird', tier: 'Common', rank: 1, badge: '🐦', rate: 0.85, reward: 60, minExp: 20, maxExp: 50 },
    { name: 'Cat', tier: 'Common', rank: 1, badge: '🐈', rate: 0.85, reward: 60, minExp: 20, maxExp: 50 },
    { name: 'Butterfly', tier: 'Common', rank: 1, badge: '🦋', rate: 0.85, reward: 40, minExp: 20, maxExp: 50 },
    { name: 'Snail', tier: 'Common', rank: 1, badge: '🐌', rate: 0.85, reward: 40, minExp: 20, maxExp: 50 },
    { name: 'Bee', tier: 'Uncommon', rank: 2, badge: '🐝', rate: 0.50, reward: 120, minExp: 70, maxExp: 110 },
    { name: 'Mouse', tier: 'Uncommon', rank: 2, badge: '🐁', rate: 0.50, reward: 130, minExp: 70, maxExp: 110 },
    { name: 'Rabbit', tier: 'Uncommon', rank: 2, badge: '🐇', rate: 0.50, reward: 150, minExp: 70, maxExp: 110 },
    { name: 'Frog', tier: 'Uncommon', rank: 2, badge: '🐸', rate: 0.50, reward: 140, minExp: 70, maxExp: 110 },
    { name: 'Fish', tier: 'Uncommon', rank: 2, badge: '🐟', rate: 0.50, reward: 150, minExp: 70, maxExp: 110 },
    { name: 'Cow', tier: 'Rare', rank: 3, badge: '🐄', rate: 0.25, reward: 400, minExp: 120, maxExp: 170 },
    { name: 'Pig', tier: 'Rare', rank: 3, badge: '🐖', rate: 0.25, reward: 350, minExp: 120, maxExp: 170 },
    { name: 'Kangaroo', tier: 'Rare', rank: 3, badge: '🦘', rate: 0.25, reward: 500, minExp: 120, maxExp: 170 },
    { name: 'Bear', tier: 'Rare', rank: 3, badge: '🐻', rate: 0.25, reward: 600, minExp: 120, maxExp: 170 },
    { name: 'Panda', tier: 'Rare', rank: 3, badge: '🐼', rate: 0.25, reward: 650, minExp: 120, maxExp: 170 },
    { name: 'Whale', tier: 'Epic', rank: 4, badge: '🐋', rate: 0.15, reward: 1500, minExp: 180, maxExp: 210 },
    { name: 'Penguin', tier: 'Epic', rank: 4, badge: '🐧', rate: 0.15, reward: 1200, minExp: 180, maxExp: 210 },
    { name: 'Camel', tier: 'Epic', rank: 4, badge: '🐫', rate: 0.15, reward: 1300, minExp: 180, maxExp: 210 },
    { name: 'Dove', tier: 'Epic', rank: 4, badge: '🕊️', rate: 0.15, reward: 1100, minExp: 180, maxExp: 210 },
    { name: 'Elephant', tier: 'Legendary', rank: 5, badge: '🐘', rate: 0.10, reward: 4000, minExp: 230, maxExp: 280 },
    { name: 'Crocodile', tier: 'Legendary', rank: 5, badge: '🐊', rate: 0.10, reward: 4500, minExp: 230, maxExp: 280 },
    { name: 'Crow', tier: 'Legendary', rank: 5, badge: '🐦‍⬛', rate: 0.10, reward: 3500, minExp: 230, maxExp: 280 },
    { name: 'Tiger', tier: 'Legendary', rank: 5, badge: '🐅', rate: 0.10, reward: 5000, minExp: 230, maxExp: 280 },
    { name: 'Deer', tier: 'Mythic', rank: 6, badge: '🦌', rate: 0.01, reward: 12000, minExp: 300, maxExp: 340 },
    { name: 'Lion', tier: 'Mythic', rank: 6, badge: '🦁', rate: 0.01, reward: 15000, minExp: 300, maxExp: 340 },
    { name: 'Ghost', tier: 'S+ Tier', rank: 7, badge: '👻', rate: 0.05, reward: 35000, minExp: 1370, maxExp: 1420 },
    { name: 'Skeleton', tier: 'S+ Tier', rank: 7, badge: '💀', rate: 0.05, reward: 30000, minExp: 1370, maxExp: 1420 },
    { name: 'Dragon', tier: 'SS+ Tier', rank: 8, badge: '🐉', rate: 0.005, reward: 50000, minExp: 2500, maxExp: 2700 },
    { name: 'Phantom Ghost', tier: 'SS+ Tier', rank: 8, badge: '🥷', rate: 0.005, reward: 55000, minExp: 2500, maxExp: 2700 },
    { name: 'Unicorn', tier: 'SSS+ Tier', rank: 9, badge: '🦄', rate: 0.001, reward: 120000, minExp: 3500, maxExp: 4000 },
    { name: 'Dinosaur', tier: 'SSS+ Tier', rank: 9, badge: '🦖', rate: 0.001, reward: 150000, minExp: 3500, maxExp: 4000 },
    { name: 'Snowman', tier: 'GOD Tier', rank: 10, badge: '⛄', rate: 0.0001, reward: 500000, minExp: 5000, maxExp: 7000 },
    { name: 'Shiny Turtle', tier: 'Shiny', rank: 11, badge: '<:ShinyTurtle:1570467471889137735>', rate: 0.001, reward: 200000, minExp: 8000, maxExp: 10000 },
    { name: 'Shiny Snowman', tier: 'Shiny', rank: 11, badge: '<:ShinySnowman:1570467561454305520>', rate: 0.001, reward: 300000, minExp: 8000, maxExp: 10000 },
    { name: 'Shiny Scorpion', tier: 'Shiny', rank: 11, badge: '<:ShinyScorpion:1570467397834379285>', rate: 0.001, reward: 250000, minExp: 8000, maxExp: 10000 },
    { name: 'Shiny Dolphin', tier: 'Shiny', rank: 11, badge: '<:Shinydolphin:1570467326573416602>', rate: 0.001, reward: 250000, minExp: 8000, maxExp: 10000 }
];

function getAnimalStats(animalName, level = 1) {
    const animal = HUNT_ANIMALS.find(a => a.name === animalName);
    if (!animal) return { hp: 100, atk: 20, def: 10 };

    let baseHp = 100, baseAtk = 20, baseDef = 10;
    let hpInc = 10, atkInc = 5, defInc = 3;

    switch (animal.tier) {
        case 'Uncommon': baseHp = 150; baseAtk = 30; baseDef = 15; hpInc = 20; atkInc = 8; defInc = 5; break;
        case 'Rare': baseHp = 200; baseAtk = 40; baseDef = 20; hpInc = 30; atkInc = 12; defInc = 8; break;
        case 'Epic': baseHp = 220; baseAtk = 50; baseDef = 25; hpInc = 40; atkInc = 15; defInc = 12; break;
        case 'Legendary': baseHp = 250; baseAtk = 65; baseDef = 30; hpInc = 50; atkInc = 21; defInc = 15; break;
        case 'Mythic': baseHp = 280; baseAtk = 75; baseDef = 35; hpInc = 60; atkInc = 25; defInc = 19; break;
        case 'S+ Tier': baseHp = 305; baseAtk = 85; baseDef = 40; hpInc = 70; atkInc = 28; defInc = 23; break;
        case 'SS+ Tier': baseHp = 340; baseAtk = 95; baseDef = 50; hpInc = 80; atkInc = 34; defInc = 26; break;
        case 'SSS+ Tier': baseHp = 380; baseAtk = 105; baseDef = 60; hpInc = 90; atkInc = 39; defInc = 31; break;
        case 'GOD Tier': baseHp = 420; baseAtk = 130; baseDef = 100; hpInc = 120; atkInc = 50; defInc = 40; break;
        case 'Shiny': baseHp = 520; baseAtk = 200; baseDef = 120; hpInc = 200; atkInc = 80; defInc = 50; break;
    }

    const lvlFactor = level - 1;
    return {
        hp: baseHp + (lvlFactor * hpInc),
        atk: baseAtk + (lvlFactor * atkInc),
        def: baseDef + (lvlFactor * defInc)
    };
}

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
    if (titleName === 'Beta') return '🔮```ansi\n\u001b[1;35mBeta\u001b[0m\n```';
    if (titleName === 'Admin') return '🛡️'```ansi\n\u001b[1;31mAdmin\u001b[0m\n```';
    if (titleName === 'Owner') return '👑'```ansi\n\u001b[1;33mOwner\u001b[0m\n```';
    return `\`${titleName}\``;
}

function buildCollectionDisplay(userObj, username) {
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${username}'s Animal Collection`)
        .setColor('#9900ff')
        .setTimestamp();

    const tierGroups = [
        { icon: RARITY_ICONS['Common'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Common') },
        { icon: RARITY_ICONS['Uncommon'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Uncommon') },
        { icon: RARITY_ICONS['Rare'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Rare') },
        { icon: RARITY_ICONS['Epic'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Epic') },
        { icon: RARITY_ICONS['Legendary'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Legendary') },
        { icon: RARITY_ICONS['Mythic'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Mythic') },
        { icon: RARITY_ICONS['S+ Tier'], animals: HUNT_ANIMALS.filter(a => a.tier === 'S+ Tier') },
        { icon: RARITY_ICONS['SS+ Tier'], animals: HUNT_ANIMALS.filter(a => a.tier === 'SS+ Tier') },
        { icon: RARITY_ICONS['SSS+ Tier'], animals: HUNT_ANIMALS.filter(a => a.tier === 'SSS+ Tier') },
        { icon: RARITY_ICONS['GOD Tier'], animals: HUNT_ANIMALS.filter(a => a.tier === 'GOD Tier') },
        { icon: RARITY_ICONS['Shiny'], animals: HUNT_ANIMALS.filter(a => a.tier === 'Shiny') }
    ];

    let hasAny = false;
    for (const group of tierGroups) {
        const parts = [];
        for (const animal of group.animals) {
            const count = userObj.collection[animal.name] || 0;
            if (count > 0) {
                hasAny = true;
                parts.push(`${animal.badge} \`${count}x\``);
            }
        }
        if (parts.length > 0) {
            embed.addFields({ name: group.icon, value: parts.join(' | '), inline: false });
        }
    }

    if (!hasAny) {
        embed.setDescription('Your collection is empty! Use `/hunt` to discover creatures.');
    }

    return { embeds: [embed] };
}

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

function fetchMeme() {
    return new Promise((resolve, reject) => {
        https.get('https://meme-api.com/gimme', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', err => reject(err));
    });
}

const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Initialize your profile and claim your Beta title.'),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands.'),
    new SlashCommandBuilder().setName('rank').setDescription('Check your current points and rank tier badge.'),
    new SlashCommandBuilder().setName('balance').setDescription('Check your wallet and bank balance.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for quick starter coins.'),
    new SlashCommandBuilder().setName('work').setDescription('Work to earn coins.'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Bet coins on a coinflip game.')
        .addStringOption(o => o.setName('choice').setDescription('Heads or Tails').setRequired(true).addChoices({name:'Heads', value:'heads'}, {name:'Tails', value:'tails'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('slot').setDescription('Play the slot machine.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('blackjack').setDescription('Play a game of blackjack.')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true)),
    new SlashCommandBuilder().setName('trivia').setDescription('Answer a trivia question to win coins.'),
    new SlashCommandBuilder().setName('shop').setDescription('View guns and charms shop categories.')
        .addStringOption(o => o.setName('category').setDescription('Shop category').setRequired(false).addChoices({name:'Gun', value:'Gun'}, {name:'Charm', value:'Charm'})),
    new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop.')
        .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true)),
    new SlashCommandBuilder().setName('equip').setDescription('Equip an item or charm from your inventory.')
        .addStringOption(o => o.setName('item').setDescription('Item or charm name to equip').setRequired(true)),
    new SlashCommandBuilder().setName('meme').setDescription('Generate a random meme from the internet.'),
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
    new SlashCommandBuilder().setName('battle').setDescription('Battle your equipped team pets against another player.')
        .addUserOption(o => o.setName('player').setDescription('Player to battle').setRequired(true)),
    new SlashCommandBuilder().setName('level').setDescription('Check user level and active team animal levels.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('team').setDescription('Equip animals to your active combat team (Slots 1, 2, or 3).')
        .addIntegerOption(o => o.setName('slot').setDescription('Team slot (1, 2, or 3)').setRequired(true).addChoices({name:'Slot 1', value:1}, {name:'Slot 2', value:2}, {name:'Slot 3', value:3}))
        .addStringOption(o => o.setName('animal').setDescription('Animal name from your collection to equip').setRequired(true)),
    new SlashCommandBuilder().setName('animal-stats').setDescription('View stats (HP, ATK, DEF) of your active team animals.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('View server rankings for Hunts, Points, or Money.')
        .addStringOption(o => o.setName('category').setDescription('Leaderboard category').setRequired(true).addChoices(
            { name: 'Money', value: 'money' }, { name: 'Points', value: 'points' }, { name: 'Hunts', value: 'hunts' }
        )),
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
    new SlashCommandBuilder().setName('profiles').setDescription('View detailed RPG user profile card with badges.')
        .addUserOption(o => o.setName('user').setDescription('User profile to view').setRequired(false)),
    new SlashCommandBuilder().setName('bank').setDescription('Deposit or withdraw coins.')
        .addStringOption(o => o.setName('action').setDescription('deposit or withdraw').setRequired(true).addChoices({name:'Deposit', value:'deposit'}, {name:'Withdraw', value:'withdraw'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('give').setDescription('Transfer coins.')
        .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('trade').setDescription('Interactive trade offer with another user.')
        .addUserOption(o => o.setName('target').setDescription('Trade partner').setRequired(true)),
    
    // Validated Admin Commands
    new SlashCommandBuilder().setName('admin-give-coins').setDescription('Admin: Give coins').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-item').setDescription('Admin: Give shop item').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Exact item name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-animal').setDescription('Admin: Give animal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Exact animal name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-title').setDescription('Admin: Award title').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Exact title name').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-lootbox').setDescription('Admin: Give lootboxes').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Quantity').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-boxes').setDescription('Admin: Give boxes').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('rarity').setDescription('Rarity').setRequired(true).addChoices(
            { name: 'Rare', value: 'Rare' }, { name: 'Epic', value: 'Epic' }, { name: 'Ultra', value: 'Ultra' }, { name: 'Legendary', value: 'Legendary' }, { name: 'GOD', value: 'GOD' }
        ))
        .addIntegerOption(o => o.setName('amount').setDescription('Quantity').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-points').setDescription('Admin: Give points').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('admin-give-badge').setDescription('Admin: Give custom badge emoji').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('badge').setDescription('Badge emoji string').setRequired(true)),
    new SlashCommandBuilder().setName('admin-set-level').setDescription('Admin: Set user level').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('Level').setRequired(true)),
    new SlashCommandBuilder().setName('admin-set-exp').setDescription('Admin: Set user exp').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('exp').setDescription('EXP').setRequired(true)),
    new SlashCommandBuilder().setName('admin-set-rank').setDescription('Admin: Set points directly').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('target').setDescription('Target').setRequired(true))
        .addIntegerOption(o => o.setName('points').setDescription('Points').setRequired(true)),
    new SlashCommandBuilder().setName('admin-run-weather').setDescription('Admin: Force trigger weather')
        .addStringOption(o => o.setName('weather').setDescription('Weather name').setRequired(true).addChoices(
            { name: 'Foggy', value: 'Foggy' }, { name: 'Rainy', value: 'Rainy' }, { name: 'Thunder', value: 'Thunder' }, { name: 'Galaxy', value: 'Galaxy' }, { name: 'Normal', value: 'Normal' }
        )),
    new SlashCommandBuilder().setName('admin-reset-account').setDescription('Admin: Reset all data')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(false)),
    new SlashCommandBuilder().setName('admin-give-permission').setDescription('Owner only: Grant admin permissions.')
        .addUserOption(o => o.setName('user').setDescription('User to grant admin rights').setRequired(true)),
    new SlashCommandBuilder().setName('admin-luck-event').setDescription('Admin: Start timed global luck event')
        .addNumberOption(o => o.setName('amount').setDescription('Boost amount').setRequired(true))
        .addStringOption(o => o.setName('time').setDescription('Duration').setRequired(true)),
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

// --- DYNAMIC BOT STATUS: [Server Count] /start ---
setInterval(() => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`[${serverCount} Servers] /start`, { type: 0 });
}, 60000);

function checkCooldown(user, commandName, seconds = 3) {
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
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('trade_offer_')) {
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const initiatorId = parts[3];

            if (interaction.user.id !== targetId && interaction.user.id !== initiatorId) {
                return interaction.reply({ content: '❌ You are not authorized to interact with this trade session.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Interactive Trade Session')
                .setColor('#ffaa00')
                .setDescription(`Trade session active between users.\n\n` +
                    `**User 1 (${initiatorId === interaction.user.id ? interaction.user.username : 'Partner'})**\n` +
                    `| Click the button to confirm or cancel your trade offerings.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_accept_${initiatorId}_${targetId}`).setLabel('Confirm Trade').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`trade_cancel_${initiatorId}_${targetId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        else if (interaction.customId.startsWith('trade_accept_')) {
            return interaction.update({ content: '✅ Trade successfully completed and verified.', embeds: [], components: [] });
        }
        else if (interaction.customId.startsWith('trade_cancel_')) {
            return interaction.update({ content: '❌ Trade session has been cancelled.', embeds: [], components: [] });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    const data = readData();
    const user = getUser(data, interaction.user.id);

    // --- ENFORCE /start REQUIREMENT STRICTLY ---
    if (commandName === 'start') {
        user.started = true;
        if (!user.titles.includes('Beta')) {
            user.titles.push('Beta');
        }
        if (!user.equippedTitle) {
            user.equippedTitle = 'Beta';
        }
        saveData(data);

        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('Welcome to Night (BETA)!')
                .setColor('#5865F2')
                .setDescription('Thank you for initializing your profile! You have automatically unlocked the exclusive **Beta** title.\n\n' +
                    'Here is a list of commands to get you started:\n' +
                    '• `/hunt` - Hunt animals and boxes\n' +
                    '• `/shop` - Purchase weapons and charms\n' +
                    '• `/profiles` - View your RPG profile card\n' +
                    '• `/help` - View all available bot commands\n\n' +
                    'Good luck on your adventure!');
            await interaction.user.send({ embeds: [dmEmbed] });
        } catch (e) {}

        return interaction.reply({ content: '✅ Profile successfully initialized! Check your DMs for a welcome message and command overview.', ephemeral: true });
    }

    // STRICT CHECK: If user hasn't started and command is NOT help, block everything else completely
    if (!user.started && commandName !== 'help') {
        return interaction.reply({ content: '⚠️ You must run the `/start` command first to initialize your profile and unlock bot features!', ephemeral: true });
    }

    const isAdminCommand = commandName.startsWith('admin-');
    if (isAdminCommand) {
        const isOwner = interaction.user.id === interaction.guild?.ownerId || data.admins.includes(interaction.user.id) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (commandName === 'admin-give-permission') {
            if (interaction.user.id !== interaction.guild?.ownerId) {
                return interaction.reply({ content: '❌ Only the server owner can execute this command.', ephemeral: true });
            }
        } else if (!isOwner) {
            return interaction.reply({ content: '❌ You do not have permission to execute admin commands.', ephemeral: true });
        }
    }

    try {
        if (commandName !== 'start' && commandName !== 'help') {
            const cd = checkCooldown(user, commandName, 3);
            if (cd > 0) {
                return interaction.reply({ content: `⏳ Please wait **${cd}s** before using \`/${commandName}\` again.`, ephemeral: true });
            }
            saveData(data);
        }

        // --- /help ---
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('Command Directory')
                .setColor('#5865F2')
                .setDescription('Here is the complete list of available commands:')
                .addFields(
                    { name: 'Getting Started', value: '`/start` - Initialize profile & claim Beta title\n`/help` - View command directory', inline: false },
                    { name: 'Hunting & Combat', value: '`/hunt` - Go hunting for animals & boxes\n`/team` - Equip animals to your active combat slots\n`/battle` - Battle another player in the arena\n`/animal-stats` - View active team combat statistics', inline: false },
                    { name: 'Profile & Progress', value: '`/profiles` - View your RPG profile card\n`/rank` - Check points and rank tier badge\n`/level` - Check user and animal level/EXP status\n`/collection` - View your animal collection\n`/titles` - View and equip unlocked titles\n`/titlelist` - View all available titles', inline: false },
                    { name: 'Economy & Shop', value: '`/balance` - Check wallet and bank\n`/shop` - Browse weapons and charms\n`/buy` - Purchase shop items\n`/equip` - Equip an item or charm\n`/beg` / `/work` - Earn starter coins\n`/coinflip` / `/slot` / `/blackjack` / `/trivia` - Play mini-games\n`/market` / `/sell` / `/buy-market` - Community player market\n`/inventory` - Check items and boxes', inline: false },
                    { name: 'Utilities & Events', value: '`/daily` / `/weekly` - Claim recurring rewards\n`/quest` - View active daily/weekly tasks\n`/event` / `/stats` - Check weather and active boost stats\n`/meme` - Generate a random meme\n`/trade` - Secure player trading', inline: false }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- /rank ---
        else if (commandName === 'rank') {
            const rankBadge = getRankBadge(user.points || 0);
            const embed = new EmbedBuilder()
                .setTitle(`Rank Status — ${interaction.user.username}`)
                .setColor('#0099ff')
                .setDescription(`You currently hold **${user.points || 0} points**.\nYour Active Rank Badge: ${rankBadge}`);
            return interaction.reply({ embeds: [embed] });
        }

        // --- /meme ---
        else if (commandName === 'meme') {
            try {
                const memeData = await fetchMeme();
                const embed = new EmbedBuilder()
                    .setTitle(memeData.title)
                    .setImage(memeData.url)
                    .setColor('#ff4500')
                    .setFooter({ text: `Subreddit: r/${memeData.subreddit} | 👍 ${memeData.ups}` });
                return interaction.reply({ embeds: [embed] });
            } catch (err) {
                return interaction.reply({ content: '❌ Failed to fetch a meme at the moment. Please try again later.', ephemeral: true });
            }
        }

        // --- /equip ---
        else if (commandName === 'equip') {
            const itemName = interaction.options.getString('item');
            const foundItem = user.inventory.find(i => i.toLowerCase() === itemName.toLowerCase());
            if (!foundItem) {
                return interaction.reply({ content: `❌ You do not own any item named **${itemName}** in your inventory.`, ephemeral: true });
            }
            return interaction.reply({ content: `✅ Successfully equipped **${foundItem}** from your inventory.`, ephemeral: true });
        }

        // --- BALANCE ---
        else if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            const titleDisplay = tData.equippedTitle ? ` [${tData.equippedTitle}]` : '';
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Balance — ${target.username}${titleDisplay}`)
                .addFields(
                    { name: `${WALLET_ICON} Wallet`, value: `${COIN_ICON} ${formatCurrency(tData.wallet)} coins`, inline: true },
                    { name: `${BANK_ICON} Bank`, value: `${COIN_ICON} ${formatCurrency(tData.bank)} coins`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- BEG ---
        else if (commandName === 'beg') {
            const amt = Math.floor(Math.random() * 10000) + 1;
            user.wallet += amt;
            if (amt >= 8000 && !user.titles.includes('Lucky Charm')) {
                user.titles.push('Lucky Charm');
                await interaction.channel.send(`🎉 Congrats **${interaction.user.username}** 🎉 You Unlocked **Lucky Charm** title!`);
            }
            trackQuestProgress(user, 'beg', 1);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`You begged on the streets and received ${COIN_ICON} **${formatCurrency(amt)} coins**.`);
        }

        // --- WORK ---
        else if (commandName === 'work') {
            const amt = Math.floor(Math.random() * 100000) + 1;
            user.wallet += amt;
            trackQuestProgress(user, 'work', 1);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
            return interaction.reply(`You completed your shift and earned ${COIN_ICON} **${formatCurrency(amt)} coins**.`);
        }

        // --- COINFLIP ---
        else if (commandName === 'coinflip') {
            const choice = interaction.options.getString('choice');
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet amount or insufficient wallet balance.', ephemeral: true });

            const outcome = Math.random() < 0.53 ? (choice === 'heads' ? 'tails' : 'heads') : choice;
            if (choice === outcome) {
                user.wallet += amount;
                await interaction.reply(`The coin landed on **${outcome}**. You won ${COIN_ICON} **${formatCurrency(amount)} coins**.`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`The coin landed on **${outcome}**. You lost ${COIN_ICON} **${formatCurrency(amount)} coins**.`);
            }
            trackQuestProgress(user, 'coinflip', 1);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
        }

        // --- SLOT ---
        else if (commandName === 'slot') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet amount or insufficient wallet balance.', ephemeral: true });

            const symbols = ['💎', '♥️', '🗡️', '🍎', '🍑', '🥭'];
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];

            if (r1 === '💎' && r2 === '💎' && r3 === '💎') {
                const winnings = amount * 20;
                user.wallet += winnings;
                if (!user.titles.includes('JACKPOT')) {
                    user.titles.push('JACKPOT');
                    await interaction.channel.send(`🎉 Congrats **${interaction.user.username}** 🎉 You Unlocked **JACKPOT** title!`);
                }
                await interaction.reply(`[ ${r1} | ${r2} | ${r3} ] DIAMOND JACKPOT! You won ${COIN_ICON} **${formatCurrency(winnings)} coins**.`);
            } else if (r1 === r2 && r2 === r3) {
                const winnings = amount * 5;
                user.wallet += winnings;
                await interaction.reply(`[ ${r1} | ${r2} | ${r3} ] Triple match! You won ${COIN_ICON} **${formatCurrency(winnings)} coins**.`);
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                const winnings = Math.floor(amount * 1.2);
                user.wallet += winnings;
                await interaction.reply(`[ ${r1} | ${r2} | ${r3} ] Partial match. You won ${COIN_ICON} **${formatCurrency(winnings)} coins**.`);
            } else {
                user.wallet -= amount;
                await interaction.reply(`[ ${r1} | ${r2} | ${r3} ] No match. You lost ${COIN_ICON} **${formatCurrency(amount)} coins**.`);
            }
            trackQuestProgress(user, 'slot', 1);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);
        }

        // --- BLACKJACK ---
        else if (commandName === 'blackjack') {
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Invalid bet amount or insufficient wallet balance.', ephemeral: true });

            const playerSum = Math.floor(Math.random() * 8) + 12; 
            const dealerSum = Math.floor(Math.random() * 5) + 17; 

            if (playerSum > 21 || (playerSum < dealerSum && dealerSum <= 21)) {
                user.wallet -= amount;
                await interaction.reply(`Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You lost ${COIN_ICON} **${formatCurrency(amount)} coins**.`);
            } else if (playerSum === dealerSum) {
                await interaction.reply(`Blackjack: Push! Both had ${playerSum}. Bet returned.`);
            } else {
                user.wallet += amount;
                await interaction.reply(`Blackjack: Your sum (${playerSum}) vs Dealer (${dealerSum}). You won ${COIN_ICON} **${formatCurrency(amount)} coins**.`);
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
            return interaction.reply(`Trivia solved successfully! You earned ${COIN_ICON} **${formatCurrency(reward)} coins**.`);
        }

        // --- SHOP ---
        else if (commandName === 'shop') {
            const category = interaction.options.getString('category');
            const embed = new EmbedBuilder().setTitle('Shop & Armory').setColor('#00ffcc');

            const itemsToShow = category ? data.shopItems.filter(i => i.category === category) : data.shopItems;

            const gunList = itemsToShow.filter(i => i.category === 'Gun').map(i => `**[ID: ${i.id}] ${i.name}** - ${COIN_ICON} ${formatCurrency(i.price)} coins\n└ *${i.description}*`).join('\n\n');
            const charmList = itemsToShow.filter(i => i.category === 'Charm').map(i => `**[ID: ${i.id}] ${i.name}** - ${COIN_ICON} ${formatCurrency(i.price)} coins\n└ *${i.description}* (Non-stackable)`).join('\n\n');

            if (!category || category === 'Gun') {
                embed.addFields({ name: 'Gun Category', value: gunList || 'No guns available.' });
            }
            if (!category || category === 'Charm') {
                embed.addFields({ name: 'Charm Category', value: charmList || 'No charms available.' });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- BUY ---
        else if (commandName === 'buy') {
            const id = interaction.options.getInteger('id');
            const item = data.shopItems.find(i => i.id === id);
            if (!item) return interaction.reply({ content: '❌ Item not found in shop.', ephemeral: true });

            if (item.category === 'Charm' && user.inventory.includes(item.name)) {
                return interaction.reply({ content: `❌ You already own **${item.name}**. Charms cannot be stacked.`, ephemeral: true });
            }

            if (user.wallet < item.price) return interaction.reply({ content: '❌ Insufficient wallet balance.', ephemeral: true });

            user.wallet -= item.price;
            user.inventory.push(item.name);
            saveData(data);
            return interaction.reply(`Successfully purchased **${item.name}** for ${COIN_ICON} ${formatCurrency(item.price)} coins.`);
        }

        // --- MARKET ---
        else if (commandName === 'sell') {
            const typeName = interaction.options.getString('type');
            const qty = interaction.options.getInteger('quantity');
            const amount = interaction.options.getInteger('amount');

            if (qty <= 0 || amount <= 0) return interaction.reply({ content: '❌ Quantity and price must be greater than zero.', ephemeral: true });

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
                return interaction.reply({ content: `❌ You do not own any item or animal named **${typeName}** to sell.`, ephemeral: true });
            }

            saveData(data);
            return interaction.reply(`Listed **${qty}x ${typeName}** on the community market for ${COIN_ICON} ${formatCurrency(amount)} coins. (Listing ID: ${data.marketListings.length})`);
        }

        else if (commandName === 'market') {
            const embed = new EmbedBuilder().setTitle('Community Player Market').setColor('#00ffcc');
            if (data.marketListings.length === 0) {
                embed.setDescription('No active listings available on the market.');
            } else {
                const list = data.marketListings.map(l => `**[ID: ${l.id}]** ${l.quantity}x **${l.name}** (${l.type}) by **${l.sellerName}** — ${COIN_ICON} **${formatCurrency(l.price)} coins**`).join('\n');
                embed.setDescription(list);
            }
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'buy-market') {
            const id = interaction.options.getInteger('id');
            const listing = data.marketListings.find(l => l.id === id);
            if (!listing) return interaction.reply({ content: '❌ Market listing not found.', ephemeral: true });
            if (listing.sellerId === interaction.user.id) return interaction.reply({ content: '❌ You cannot purchase your own listing.', ephemeral: true });
            if (user.wallet < listing.price) return interaction.reply({ content: '❌ Insufficient wallet balance to purchase this listing.', ephemeral: true });

            user.wallet -= listing.price;
            const sellerUser = getUser(data, listing.sellerId);
            sellerUser.wallet += listing.price;

            if (listing.type === 'Animal') {
                if (!user.collection[listing.name]) user.collection[listing.name] = 0;
                user.collection[listing.name] += listing.quantity;
            } else {
                for (let i = 0; i < listing.quantity; i++) {
                    user.inventory.push(listing.name);
                }
            }

            data.marketListings = data.marketListings.filter(l => l.id !== id);
            saveData(data);

            return interaction.reply(`Successfully purchased ${listing.quantity}x **${listing.name}** from **${listing.sellerName}** for ${COIN_ICON} ${formatCurrency(listing.price)} coins.`);
        }

        // --- TEAM EQUIPPING (/team) ---
        else if (commandName === 'team') {
            const slot = interaction.options.getInteger('slot') - 1;
            const animalNameInput = interaction.options.getString('animal');

            const foundAnimal = HUNT_ANIMALS.find(a => a.name.toLowerCase() === animalNameInput.toLowerCase());
            if (!foundAnimal) return interaction.reply({ content: '❌ Invalid animal name specified.', ephemeral: true });

            if ((user.collection[foundAnimal.name] || 0) <= 0) {
                return interaction.reply({ content: `❌ You do not own **${foundAnimal.name}** in your collection.`, ephemeral: true });
            }

            user.team[slot] = foundAnimal.name;
            saveData(data);

            return interaction.reply(`Successfully equipped **${foundAnimal.badge} ${foundAnimal.name}** into Team Slot **${slot + 1}**.`);
        }

        // --- LEVEL & EXP (/level) ---
        else if (commandName === 'level') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);

            const userNeededExp = getUserMaxExp(tData.level);
            const embed = new EmbedBuilder()
                .setTitle(`Level & EXP Status — ${target.username}`)
                .setColor('#00ffcc')
                .addFields(
                    { name: 'User Level', value: `Level **${tData.level}** (${tData.exp.toLocaleString()}/${userNeededExp.toLocaleString()} EXP)`, inline: false }
                );

            const teamLines = [];
            for (let i = 0; i < 3; i++) {
                const petName = tData.team[i];
                if (petName) {
                    const petData = tData.animalLevels[petName] || { level: 1, exp: 0 };
                    const petNeededExp = getAnimalMaxExp(petData.level);
                    const animalObj = HUNT_ANIMALS.find(a => a.name === petName);
                    teamLines.push(`Slot ${i+1}: ${animalObj?.badge || '🐾'} **${petName}** — Lvl **${petData.level}** (${petData.exp.toLocaleString()}/${petNeededExp.toLocaleString()} EXP)`);
                } else {
                    teamLines.push(`Slot ${i+1}: *Empty*`);
                }
            }

            embed.addFields({ name: 'Active Team Animal Levels', value: teamLines.join('\n'), inline: false });
            return interaction.reply({ embeds: [embed] });
        }

        // --- ANIMAL STATS (/animal-stats) ---
        else if (commandName === 'animal-stats') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);

            const embed = new EmbedBuilder()
                .setTitle(`Team Combat Stats — ${target.username}`)
                .setColor('#9900ff');

            let hasTeam = false;
            const statLines = [];

            for (let i = 0; i < 3; i++) {
                const petName = tData.team[i];
                if (petName) {
                    hasTeam = true;
                    const petData = tData.animalLevels[petName] || { level: 1, exp: 0 };
                    const stats = getAnimalStats(petName, petData.level);
                    const animalObj = HUNT_ANIMALS.find(a => a.name === petName);
                    statLines.push(`**Slot ${i+1}: ${animalObj?.badge || ''} ${petName} (Lvl ${petData.level})**\n└ HP: **${stats.hp}** | ATK: **${stats.atk}** | DEF: **${stats.def}**`);
                }
            }

            if (!hasTeam) {
                embed.setDescription('No animals equipped in team slots. Use `/team` to assign pets.');
            } else {
                embed.setDescription(statLines.join('\n\n'));
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- BATTLE SYSTEM (/battle) ---
        else if (commandName === 'battle') {
            const target = interaction.options.getUser('player');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot battle yourself.', ephemeral: true });
            if (target.bot) return interaction.reply({ content: '❌ You cannot battle bots.', ephemeral: true });

            const challenger = user;
            const opponent = getUser(data, target.id);

            let challengerPower = 0;
            for (const petName of challenger.team) {
                if (petName) {
                    const pLvl = challenger.animalLevels[petName]?.level || 1;
                    const st = getAnimalStats(petName, pLvl);
                    challengerPower += (st.hp + (st.atk * 2) + st.def);
                }
            }
            if (challengerPower === 0) challengerPower = 50;

            let opponentPower = 0;
            for (const petName of opponent.team) {
                if (petName) {
                    const pLvl = opponent.animalLevels[petName]?.level || 1;
                    const st = getAnimalStats(petName, pLvl);
                    opponentPower += (st.hp + (st.atk * 2) + st.def);
                }
            }
            if (opponentPower === 0) opponentPower = 50;

            const roll1 = challengerPower * (0.8 + Math.random() * 0.4);
            const roll2 = opponentPower * (0.8 + Math.random() * 0.4);

            const isWin = roll1 >= roll2;

            const embed = new EmbedBuilder()
                .setTitle('Pet Arena Battle')
                .setColor(isWin ? '#00ff88' : '#ff3333');

            if (isWin) {
                challenger.points += 20;
                addUserExp(challenger, 650);
                for (const pName of challenger.team) {
                    if (pName) addAnimalExp(challenger, pName, 650);
                }
                embed.setDescription(`**${interaction.user.username}** defeated **${target.username}** in battle.\n\n` +
                    `Rewards:\n` +
                    `• +20 Points\n` +
                    `• +650 User & Team EXP`);
            } else {
                if (challenger.points > 0) {
                    challenger.points = Math.max(0, challenger.points - 10);
                }
                addUserExp(challenger, 300);
                for (const pName of challenger.team) {
                    if (pName) addAnimalExp(challenger, pName, 300);
                }
                embed.setDescription(`**${target.username}** successfully defended against **${interaction.user.username}**.\n\n` +
                    `Results:\n` +
                    `• -10 Points (Protected at 0)\n` +
                    `• +300 User & Team EXP (Consolation)`);
            }

            updateBadgesAndRanks(challenger, interaction.user.id, data);
            saveData(data);
            await checkAndAwardTitles(challenger, interaction.user, interaction);

            return interaction.reply({ embeds: [embed] });
        }

        // --- LEADERBOARD SYSTEM (/leaderboard) ---
        else if (commandName === 'leaderboard') {
            const category = interaction.options.getString('category');
            const allUsers = Object.entries(data.users).map(([uId, uData]) => ({
                userId: uId,
                money: uData.wallet + uData.bank,
                points: uData.points || 0,
                hunts: uData.totalHunts || 0
            }));

            const embed = new EmbedBuilder().setColor('#ffd700');

            if (category === 'money') {
                allUsers.sort((a, b) => b.money - a.money);
                const top10 = allUsers.slice(0, 10);
                embed.setTitle('Leaderboard — Top 10 Total Money');
                const lines = top10.map((u, index) => {
                    const rankIcon = getRankBadge(u.points);
                    return `**#${index+1}** <@${u.userId}> — ${COIN_ICON} **${formatCurrency(u.money)} coins** ${rankIcon}`;
                });
                embed.setDescription(lines.join('\n') || 'No players on leaderboard yet.');
            } else if (category === 'points') {
                allUsers.sort((a, b) => b.points - a.points);
                const top10 = allUsers.slice(0, 10);
                embed.setTitle('Leaderboard — Top 10 Total Points');
                const lines = top10.map((u, index) => {
                    const rankIcon = getRankBadge(u.points);
                    return `**#${index+1}** <@${u.userId}> — **${u.points} pts** ${rankIcon}`;
                });
                embed.setDescription(lines.join('\n') || 'No players on leaderboard yet.');
            } else if (category === 'hunts') {
                allUsers.sort((a, b) => b.hunts - a.hunts);
                const top10 = allUsers.slice(0, 10);
                embed.setTitle('Leaderboard — Top 10 Total Hunts');
                const lines = top10.map((u, index) => {
                    const rankIcon = getRankBadge(u.points);
                    return `**#${index+1}** <@${u.userId}> — **${u.hunts.toLocaleString()} hunts** ${rankIcon}`;
                });
                embed.setDescription(lines.join('\n') || 'No players on leaderboard yet.');
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- HUNT ---
        else if (commandName === 'hunt') {
            const boosts = getActiveBoosts(data, user);
            const huntCount = boosts.huntCount;

            const embed = new EmbedBuilder()
                .setTitle('Hunting Expedition')
                .setColor('#00ff88');

            const caughtSummary = [];
            let totalBoxesFound = 0;
            let totalExpGained = 0;

            for (let i = 0; i < huntCount; i++) {
                const rollBox = Math.random();
                const boxMultiplier = boosts.totalLuckMultiplier + (boosts.flatCatchBonus * 0.5);

                if (rollBox < 0.005 * boxMultiplier) { user.boxes.GOD++; totalBoxesFound++; }
                else if (rollBox < 0.01 * boxMultiplier) { user.boxes.Legendary++; totalBoxesFound++; }
                else if (rollBox < 0.03 * boxMultiplier) { user.boxes.Ultra++; totalBoxesFound++; }
                else if (rollBox < 0.06 * boxMultiplier) { user.boxes.Epic++; totalBoxesFound++; }
                else if (rollBox < 0.10 * boxMultiplier) { user.boxes.Rare++; totalBoxesFound++; }

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
                caughtSummary.push(`${RARITY_ICONS[caught.tier]} ${caught.badge} **${caught.name}**`);

                const expGain = Math.floor(Math.random() * (caught.maxExp - caught.minExp + 1)) + caught.minExp;
                totalExpGained += expGain;
            }

            user.totalHunts += huntCount;
            addUserExp(user, totalExpGained);
            for (const petName of user.team) {
                if (petName) addAnimalExp(user, petName, totalExpGained);
            }

            trackQuestProgress(user, 'hunt', huntCount);
            const questAlerts = checkAndClaimQuests(user);
            updateBadgesAndRanks(user, interaction.user.id, data);

            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            embed.setDescription(`Completed **${huntCount} hunts**.\n\nAnimals Discovered:\n${caughtSummary.slice(0, 20).join('\n')}${caughtSummary.length > 20 ? `\n*(And ${caughtSummary.length - 20} more)*` : ''}`);
            embed.addFields({ name: 'EXP Gained', value: `+${totalExpGained} User & Team EXP` });
            if (totalBoxesFound > 0) {
                embed.addFields({ name: 'Boxes Found', value: `Discovered **${totalBoxesFound}** mystery boxes during the expedition.` });
            }
            if (questAlerts.length > 0) {
                embed.addFields({ name: 'Quest Completed', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- LOOTBOX ---
        else if (commandName === 'lootbox') {
            const qty = interaction.options.getInteger('quantity') || 1;
            if (qty <= 0) return interaction.reply({ content: '❌ Quantity must be at least 1.', ephemeral: true });
            if ((user.lootboxes || 0) < qty) {
                return interaction.reply({ content: `❌ You only have **${user.lootboxes || 0}x** Lootboxes available.`, ephemeral: true });
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
                    rewardsSummary.push(`${RARITY_ICONS['Shiny']} ${shiny.badge} **${shiny.name}**`);
                } else if (Math.random() < 0.5) {
                    const coinAmt = Math.floor(Math.random() * 5000) + 1;
                    user.wallet += coinAmt;
                    rewardsSummary.push(`${COIN_ICON} ${formatCurrency(coinAmt)} coins`);
                } else {
                    const standardAnimals = HUNT_ANIMALS.filter(a => a.tier !== 'Shiny');
                    const randAnimal = pickWeightedAnimal(standardAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                    if (!user.collection[randAnimal.name]) user.collection[randAnimal.name] = 0;
                    user.collection[randAnimal.name]++;
                    rewardsSummary.push(`${RARITY_ICONS[randAnimal.tier]} ${randAnimal.badge} **${randAnimal.name}**`);
                }
            }

            trackQuestProgress(user, 'open', qty);
            const questAlerts = checkAndClaimQuests(user);
            updateBadgesAndRanks(user, interaction.user.id, data);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`Opened ${qty}x Lootboxes`)
                .setDescription(rewardsSummary.slice(0, 15).join('\n') + (rewardsSummary.length > 15 ? `\n*(And ${rewardsSummary.length - 15} more rewards)*` : ''))
                .setColor('#ffaa00');

            if (questAlerts.length > 0) {
                embed.addFields({ name: 'Quest Completed', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- OPEN BOXES ---
        else if (commandName === 'open') {
            const boxRarity = interaction.options.getString('rarity');
            const qty = interaction.options.getInteger('quantity') || 1;
            if (qty <= 0) return interaction.reply({ content: '❌ Quantity must be at least 1.', ephemeral: true });

            if (!user.boxes[boxRarity] || user.boxes[boxRarity] < qty) {
                return interaction.reply({ content: `❌ You only have **${user.boxes[boxRarity] || 0}x** **${boxRarity} Boxes** available.`, ephemeral: true });
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
                    rewardsSummary.push(`${COIN_ICON} ${formatCurrency(coinDrop)} coins`);
                } else {
                    const effectiveShinyChance = (baseShinyChance * boosts.totalLuckMultiplier) + (boosts.flatCatchBonus * 0.01);
                    if (Math.random() < effectiveShinyChance) {
                        const shinyAnimals = HUNT_ANIMALS.filter(a => a.tier === 'Shiny');
                        const sAnimal = shinyAnimals[Math.floor(Math.random() * shinyAnimals.length)];
                        if (!user.collection[sAnimal.name]) user.collection[sAnimal.name] = 0;
                        user.collection[sAnimal.name]++;
                        rewardsSummary.push(`${RARITY_ICONS['Shiny']} ${sAnimal.badge} **${sAnimal.name}**`);
                    } else {
                        const eligibleAnimals = HUNT_ANIMALS.filter(a => a.rank <= maxRank && a.tier !== 'Shiny');
                        const chosen = pickWeightedAnimal(eligibleAnimals, boosts.totalLuckMultiplier, boosts.flatCatchBonus);
                        if (!user.collection[chosen.name]) user.collection[chosen.name] = 0;
                        user.collection[chosen.name]++;
                        rewardsSummary.push(`${RARITY_ICONS[chosen.tier]} ${chosen.badge} **${chosen.name}**`);
                    }
                }
            }

            trackQuestProgress(user, 'open', qty);
            const questAlerts = checkAndClaimQuests(user);
            updateBadgesAndRanks(user, interaction.user.id, data);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            const embed = new EmbedBuilder()
                .setTitle(`Opened ${qty}x ${boxRarity} Boxes`)
                .setDescription(rewardsSummary.slice(0, 15).join('\n') + (rewardsSummary.length > 15 ? `\n*(And ${rewardsSummary.length - 15} more drops)*` : ''))
                .setColor('#9900ff');

            if (questAlerts.length > 0) {
                embed.addFields({ name: 'Quest Completed', value: questAlerts.join('\n') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // --- DAILY & WEEKLY ---
        else if (commandName === 'daily') {
            const now = Date.now();
            const twelveHours = 12 * 60 * 60 * 1000;
            if (now - user.lastDailyTimestamp < twelveHours) {
                const hoursLeft = Math.ceil((twelveHours - (now - user.lastDailyTimestamp)) / (1000 * 60 * 60));
                return interaction.reply({ content: `⏳ Daily reward already claimed. Available in **${hoursLeft} hours**.`, ephemeral: true });
            }

            user.lastDailyTimestamp = now;
            user.dailyStreak = (user.dailyStreak || 0) + 1;
            user.lootboxes += 1;
            user.boxes.Rare += 1;

            updateBadgesAndRanks(user, interaction.user.id, data);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            return interaction.reply(`Daily claimed successfully. Streak: **${user.dailyStreak} Days**. Received 1x Lootbox and 1x Rare Box.`);
        }

        else if (commandName === 'weekly') {
            const now = Date.now();
            const fiveDays = 5 * 24 * 60 * 60 * 1000;
            if (now - (user.lastWeeklyTimestamp || 0) < fiveDays) {
                return interaction.reply({ content: `⏳ Weekly reward already claimed.`, ephemeral: true });
            }

            user.lastWeeklyTimestamp = now;
            user.lootboxes += 3;
            user.boxes.Epic += 1;
            user.boxes.Legendary += 1;

            updateBadgesAndRanks(user, interaction.user.id, data);
            saveData(data);
            await checkAndAwardTitles(user, interaction.user, interaction);

            return interaction.reply(`Weekly claimed successfully. Received 3x Lootboxes, 1x Epic Box, and 1x Legendary Box.`);
        }

        // --- QUEST ---
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
                .setTitle('Active Quests')
                .setColor('#00ffcc')
                .addFields(
                    { name: `Daily Quests (Resets in ${Math.floor(dailyTimeLeft / 60)}h ${dailyTimeLeft % 60}m) [${user.quests.dailyCompleted ? 'COMPLETED' : 'IN PROGRESS'}]`, value: user.quests.daily.map(q => `• ${q} (${user.quests.dailyProgress[q] || 0})`).join('\n') },
                    { name: `Weekly Quests (Resets in ${weeklyDaysLeft} days) [${user.quests.weeklyCompleted ? 'COMPLETED' : 'IN PROGRESS'}]`, value: user.quests.weekly.map(q => `• ${q} (${user.quests.weeklyProgress[q] || 0})`).join('\n') }
                );

            return interaction.reply({ embeds: [embed] });
        }

        // --- EVENT WEATHER (/event) ---
        else if (commandName === 'event') {
            updateWeatherIfNeeded(data);
            const w = data.currentWeather;
            const embed = new EmbedBuilder()
                .setTitle('Weather & Global Events')
                .setColor('#ffaa00')
                .addFields(
                    { name: 'Active Weather', value: `**${w.name}**\n└ Catch Rate: +${w.catchRate}% | Luck Boost: +${Math.round(w.luckBoost * 100)}%` },
                    { name: 'Next Weather Shift', value: `Rotates every 1 hour (Resets in ${Math.ceil((w.expiresAt - Date.now()) / 60000)} mins)` }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- STATS BOOSTS (/stats) ---
        else if (commandName === 'stats') {
            const boosts = getActiveBoosts(data, user);
            const embed = new EmbedBuilder()
                .setTitle(`Boost Statistics — ${interaction.user.username}`)
                .setColor('#0099ff')
                .addFields(
                    { name: 'Total Luck Boost', value: `**+${Math.round(boosts.totalLuckBoost * 100)}%**`, inline: false },
                    { name: 'Catch Rate Boost', value: `**+${boosts.totalCatchRateBoost}%**`, inline: false },
                    { name: 'Weapon Hunt Power', value: `Hunts **${boosts.huntCount}** animals per \`/hunt\``, inline: false }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // --- COLLECTION ---
        else if (commandName === 'collection') {
            const payload = buildCollectionDisplay(user, interaction.user.username);
            return interaction.reply(payload);
        }

        // --- INVENTORY ---
        else if (commandName === 'inventory') {
            const embed = new EmbedBuilder().setTitle(`Inventory & Storage — ${interaction.user.username}`).setColor('#ffaa00');
            
            const boxCounts = Object.entries(user.boxes).map(([b, count]) => `${BOX_ICONS[b]} **${b} Box**: ${count}x`).join('\n');
            const itemCounts = {};
            user.inventory.forEach(i => itemCounts[i] = (itemCounts[i] || 0) + 1);
            const itemList = Object.entries(itemCounts).map(([item, qty]) => `🔹 **${item}**: ${qty}x`).join('\n') || 'No items.';

            embed.addFields(
                { name: 'Boxes', value: `${LOOTBOX_ICON} **Lootboxes**: ${user.lootboxes || 0}x\n${boxCounts}` },
                { name: 'Tools & Weapons', value: itemList }
            );

            return interaction.reply({ embeds: [embed] });
        }

        // --- TITLES & TITLELIST ---
        else if (commandName === 'titles') {
            const equipName = interaction.options.getString('equip');
            if (equipName) {
                const matchedTitle = user.titles.find(t => t.toLowerCase() === equipName.toLowerCase());
                if (!matchedTitle) {
                    return interaction.reply({ content: `❌ You have not unlocked the title **${equipName}**.`, ephemeral: true });
                }
                user.equippedTitle = matchedTitle;
                saveData(data);
                return interaction.reply({ content: `Successfully equipped title: **${matchedTitle}**.`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Unlocked Titles — ${interaction.user.username}`)
                .setColor('#ffd700');

            if (user.titles.length === 0) {
                embed.addFields({ name: 'Titles', value: 'No titles unlocked yet. Check `/titlelist` for requirements.' });
            } else {
                const list = user.titles.map(t => `${t === user.equippedTitle ? '🟢 **[Equipped]**' : '🔹'} **${t}**`).join('\n');
                embed.addFields({ name: 'Titles', value: list });
            }

            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'titlelist') {
            const embed = new EmbedBuilder()
                .setTitle('Available Titles Directory')
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

        // --- RPG PROFILE CARD (Embed Version) ---
        else if (commandName === 'profiles') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            updateBadgesAndRanks(tData, target.id, data);

            const totalHuntCount = tData.totalHunts || 0;
            const rankBadge = getRankBadge(tData.points || 0);
            const badgeDisplay = tData.badges.length > 0 ? tData.badges.join(' ') : 'No badges earned yet';

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`RPG Profile Card — ${target.username}`)
                .setDescription(`Title: ${formatTitleDisplay(tData.equippedTitle)}\nRank Badge: ${rankBadge}`)
                .addFields(
                    { name: 'Combat & Stats', value: `Level: **${tData.level}**\nPoints: **${tData.points || 0} pts**\nTotal Hunts: **${totalHuntCount.toLocaleString()}**`, inline: true },
                    { name: 'Economy', value: `Wallet: ${COIN_ICON} **${formatCurrency(tData.wallet)} coins**\nBank: ${BANK_ICON} **${formatCurrency(tData.bank)} coins**`, inline: true },
                    { name: 'Earned Badges', value: badgeDisplay, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // --- TRADE ---
        else if (commandName === 'trade') {
            const target = interaction.options.getUser('target');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot trade with yourself.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('Secure Interactive Trade')
                .setColor('#ffaa00')
                .setDescription(`Trade session between **${interaction.user.username}** and **${target.username}**.\n\n` +
                    `**${interaction.user.username}**\n` +
                    `| Click the button to offer items or coins.\n\n` +
                    `**${target.username}**`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_offer_${target.id}_${interaction.user.id}`).setLabel('Click to Offer').setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- BANK & GIVE ---
        else if (commandName === 'bank') {
            const action = interaction.options.getString('action');
            const amount = interaction.options.getInteger('amount');

            if (amount <= 0) return interaction.reply({ content: '❌ Enter a valid amount.', ephemeral: true });

            if (action === 'deposit') {
                if (user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet balance.', ephemeral: true });
                user.wallet -= amount;
                user.bank += amount;
                await interaction.reply(`Deposited ${COIN_ICON} **${formatCurrency(amount)} coins** into your bank.`);
            } else {
                if (user.bank < amount) return interaction.reply({ content: '❌ Insufficient bank balance.', ephemeral: true });
                user.bank -= amount;
                user.wallet += amount;
                await interaction.reply(`Withdrew ${COIN_ICON} **${formatCurrency(amount)} coins** to your wallet.`);
            }
            saveData(data);
        }

        else if (commandName === 'give') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot transfer coins to yourself.', ephemeral: true });
            if (amount <= 0 || user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet balance.', ephemeral: true });

            user.wallet -= amount;
            const targetData = getUser(data, target.id);
            targetData.wallet += amount;
            saveData(data);

            return interaction.reply(`Successfully transferred ${COIN_ICON} **${formatCurrency(amount)} coins** to ${target.username}.`);
        }

        // --- VALIDATED ADMIN COMMANDS ---
        else if (commandName === 'admin-give-coins') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.wallet += amount;
            saveData(data);
            return interaction.reply({ content: `Admin: Added ${COIN_ICON} ${formatCurrency(amount)} coins to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-item') {
            const target = interaction.options.getUser('target');
            const itemName = interaction.options.getString('item');
            const validItem = data.shopItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
            
            if (!validItem) {
                return interaction.reply({ content: `❌ Error: Item **"${itemName}"** does not exist in the shop catalog. Please check the correct name.`, ephemeral: true });
            }

            const targetData = getUser(data, target.id);
            targetData.inventory.push(validItem.name);
            saveData(data);
            return interaction.reply({ content: `Admin: Gave **${validItem.name}** to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-animal') {
            const target = interaction.options.getUser('target');
            const animalName = interaction.options.getString('type');
            const foundAnimal = HUNT_ANIMALS.find(a => a.name.toLowerCase() === animalName.toLowerCase());
            
            if (!foundAnimal) {
                return interaction.reply({ content: `❌ Error: Animal **"${animalName}"** does not exist in the database. Please verify the exact animal name.`, ephemeral: true });
            }

            const targetData = getUser(data, target.id);
            if (!targetData.collection[foundAnimal.name]) targetData.collection[foundAnimal.name] = 0;
            targetData.collection[foundAnimal.name]++;

            saveData(data);
            await checkAndAwardTitles(targetData, target, interaction);
            return interaction.reply({ content: `Admin: Added 1x ${RARITY_ICONS[foundAnimal.tier]} ${foundAnimal.badge} **${foundAnimal.name}** to ${target.tag}'s collection.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-title') {
            const target = interaction.options.getUser('target');
            const titleToGrant = interaction.options.getString('title');
            
            if (!TITLES_DATA[titleToGrant]) {
                return interaction.reply({ content: `❌ Error: Title **"${titleToGrant}"** is invalid or does not exist.`, ephemeral: true });
            }

            const targetData = getUser(data, target.id);
            if (!targetData.titles.includes(titleToGrant)) {
                targetData.titles.push(titleToGrant);
            }
            targetData.equippedTitle = titleToGrant;
            saveData(data);

            return interaction.reply({ content: `Admin: Awarded and equipped title **${titleToGrant}** for ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-lootbox') {
            const target = interaction.options.getUser('target');
            const amt = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.lootboxes = (targetData.lootboxes || 0) + amt;
            saveData(data);
            return interaction.reply({ content: `Admin: Gave **${amt}x** Lootboxes to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-boxes') {
            const target = interaction.options.getUser('target');
            const rarity = interaction.options.getString('rarity');
            const amt = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.boxes[rarity] = (targetData.boxes[rarity] || 0) + amt;
            saveData(data);
            return interaction.reply({ content: `Admin: Gave **${amt}x ${rarity} Boxes** to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-points') {
            const target = interaction.options.getUser('target');
            const amt = interaction.options.getInteger('amount');
            const targetData = getUser(data, target.id);
            targetData.points = (targetData.points || 0) + amt;
            saveData(data);
            return interaction.reply({ content: `Admin: Added **${amt} points** to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-give-badge') {
            const target = interaction.options.getUser('target');
            const badgeStr = interaction.options.getString('badge');
            const targetData = getUser(data, target.id);
            if (!targetData.badges.includes(badgeStr)) targetData.badges.push(badgeStr);
            saveData(data);
            return interaction.reply({ content: `Admin: Granted badge to ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-set-level') {
            const target = interaction.options.getUser('target');
            const lvl = interaction.options.getInteger('level');
            const targetData = getUser(data, target.id);
            targetData.level = lvl;
            updateBadgesAndRanks(targetData, target.id, data);
            saveData(data);
            return interaction.reply({ content: `Admin: Set level to **${lvl}** for ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-set-exp') {
            const target = interaction.options.getUser('target');
            const expVal = interaction.options.getInteger('exp');
            const targetData = getUser(data, target.id);
            targetData.exp = expVal;
            saveData(data);
            return interaction.reply({ content: `Admin: Set EXP to **${expVal}** for ${target.tag}.`, ephemeral: true });
        }

        else if (commandName === 'admin-set-rank') {
            const target = interaction.options.getUser('target');
            const pts = interaction.options.getInteger('points');
            const targetData = getUser(data, target.id);
            targetData.points = pts;
            saveData(data);
            return interaction.reply({ content: `Admin: Set points to **${pts}** for ${target.tag}.`, ephemeral: true });
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
            return interaction.reply({ content: `Admin: Weather forced to **${wName}**.`, ephemeral: true });
        }

        else if (commandName === 'admin-reset-account') {
            const target = interaction.options.getUser('target');
            if (target) {
                delete data.users[target.id];
                saveData(data);
                return interaction.reply({ content: `Admin: Reset account data for ${target.tag}.`, ephemeral: true });
            } else {
                data.users = {};
                saveData(data);
                return interaction.reply({ content: `Admin: Reset all user accounts in database.`, ephemeral: true });
            }
        }

        else if (commandName === 'admin-give-permission') {
            const targetUser = interaction.options.getUser('user');
            if (targetUser && !data.admins.includes(targetUser.id)) {
                data.admins.push(targetUser.id);
                saveData(data);
            }
            return interaction.reply({ content: `Owner: Granted admin permissions successfully.`, ephemeral: true });
        }

        else if (commandName === 'admin-luck-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) return interaction.reply({ content: '❌ Invalid time format.', ephemeral: true });

            data.globalEvent.luckBonus = amount;
            data.globalEvent.luckExpiresAt = Date.now() + durationMs;
            saveData(data);

            return interaction.reply({ content: `Global Luck Event activated (+${Math.round(amount*100)}%) for ${timeStr}.` });
        }

        else if (commandName === 'admin-catching-rate-event') {
            const amount = interaction.options.getNumber('amount');
            const timeStr = interaction.options.getString('time');
            const durationMs = parseDuration(timeStr);

            if (!durationMs) return interaction.reply({ content: '❌ Invalid time format.', ephemeral: true });

            data.globalEvent.catchRateBonus = amount;
            data.globalEvent.catchRateExpiresAt = Date.now() + durationMs;
            saveData(data);

            return interaction.reply({ content: `Global Catch Rate Event activated (+${amount}%) for ${timeStr}.` });
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
