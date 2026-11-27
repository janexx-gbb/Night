const BADGE_CATALOG = {
  // Obtainable Badges
  hacker: { key: 'hacker', category: 'Obtainable Badges', name: 'Hacker Badge', icon: '<:Hacker:1573804176457212014>', description: 'Obtaining Hacker Dice' },
  archangel: { key: 'archangel', category: 'Obtainable Badges', name: 'Archangel Badge', icon: '<:Archangel:1573804118722613279>', description: 'Obtaining Archangel Dice' },
  days100: { key: 'days100', category: 'Obtainable Badges', name: '100 Days Badge', icon: '<:100days:1573803920055341056>', description: 'Playing 100 Days Are you Crazy?' },
  collections: { key: 'collections', category: 'Obtainable Badges', name: 'Collections Master Badge', icon: '<:Collectionss:1573804220044541992>', description: 'Complete all Collections Except SSRP or Event chibi' },
  lvl50: { key: 'lvl50', category: 'Obtainable Badges', name: 'Level 50 Badge', icon: '<:Lvl50:1573805749153439844>', description: 'Reaching Level 50' },
  lvl100: { key: 'lvl100', category: 'Obtainable Badges', name: 'Level 100 Badge', icon: '<:Lvl100:1573805790525923470>', description: 'Reaching Level 100' },
  ugmr: { key: 'ugmr', category: 'Obtainable Badges', name: 'UGMR Roller Badge', icon: '<:What:1573806040644980917>', description: 'Rolling UMGR crazy' },
  gamblingod: { key: 'gamblingod', category: 'Obtainable Badges', name: 'Gambling God Badge', icon: '<:Gamblingod:1573806102771007519>', description: 'Earn 1T money in gambling' },

  // Utility Badges
  devvsplayer: { key: 'devvsplayer', category: 'Utility Badges', name: 'Dev vs Player Badge', icon: '<:DevVsPlayer:1573805960311476245>', description: 'Fighting Developer 3v3' },
  developer: { key: 'developer', category: 'Utility Badges', name: 'Developer Badge', icon: '<:Dev:1573804306023452682>', description: 'Developer of the bot' },
  supporter: { key: 'supporter', category: 'Utility Badges', name: 'Supporter Badge', icon: '<:Supporter:1573804400840015874>', description: 'Support the bot since beta' },
  nitro: { key: 'nitro', category: 'Utility Badges', name: 'Nitro User Badge', icon: '<:Nitrouser:1573804526132265010>', description: 'Obtaining for nitro users' },
  booster: { key: 'booster', category: 'Utility Badges', name: 'Boosting User Badge', icon: '<:Boostinguser:1573804574123237376>', description: 'Obtaining for booster' },
  mods: { key: 'mods', category: 'Utility Badges', name: 'Moderator Badge', icon: '<:Mods:1573804640447897602>', description: 'Moderator only' },
  admin: { key: 'admin', category: 'Utility Badges', name: 'Admin Badge', icon: '<:Admin:1573804706915029083>', description: 'Admin only' },

  // Event Badges
  halloween2026: { key: 'halloween2026', category: 'Event Badges', name: 'Halloween 2026 Badge', icon: '<:Halloween2026:1573818026745143367>', description: 'Obtained by playing halloween event 2026' },
  xmas2026: { key: 'xmas2026', category: 'Event Badges', name: 'Xmas 2026 Badge', icon: '<:Xmas2026:1573817982885437490>', description: 'Obtained by playing Xmas event 2026' }
};

const BALANCE_ICON = '<:Balance:1574526346019864656>';

const BETA_EMOJIS = {
  USERS: '<:Users:1572761957340287066>',
  TOTAL_BADGE: '<:Totalbadge:1572774284273909801>',
  STATS: '<:Stats:1572761987736408145>',
  DICE: '<:Dice:1572769311414820937>',
  CASH: '<:Cash:1572769444025999420>',
  BALANCE: BALANCE_ICON,
  STREAK: '<:Streak:1572769479803277403>',
  EXP: '<:Expp:1572769510170038282>',
  RANK: '<:Rank:1572771446801965076>',
  TROPHY_PTS: '<:Trophypts:1572763419382124544>',
  GLOBAL: '<:Global:1572766388727185488>',
  CLAN_BADGE: '<a:Clanbadge:1572769261032575147>',
  INV: '<:Inv:1572769543238062210>',
  COLLECTIONS: '<a:Collections:1572768891547947078>',
  HP: '<:Hp:1572769347061940356>',
  ATK: '<:Swordx:1572769375318970368>',
  DEF: '<:Def:1572769405841055784>',
  CRR_TROPHY: '<:Crrtrophy:1572796318869618738>',
  END_SEASON: '<:Endseason:1572796368718925959>',
  C_LEADER: '<a:Cleader:1572763472729477384>',
  CLAN_DESC: '<:Clandesc:1572806342736085052>',
  START_BTN: '<:Start:1572796405033214043>',
  CLAIM_BTN: '<:Claim:1572814245848940707>',
  RANKS_POS: { 1: '<:1st:1572796499979403334>', 2: '<:2nd:1572796465355690104>', 3: '<:3rd:1572796434867159161>' },
  RARITIES: {
    C: '<:Pcommon:1573802564200300687>',
    U: '<:Puncommon:1573802607561015306>',
    R: '<:Prare:1573802661134864464>',
    SR: '<:Psr:1573802765459918889>',
    SRR: '<:Psrr:1573802796040585358>',
    UTR: '<a:Putr:1573802703090614342>',
    STR: '<a:Pstr:1573802859491762237>',
    USRR: '<a:Pusrr:1573802908846264380>',
    UGMR: '<a:Pugmr:1573802950675923024>',
    SSRP: '<a:NewSSRP:1572759498198745248>'
  }
};

const RARITY_ICONS = { ...BETA_EMOJIS.RARITIES };

const RARITY_RATES = [
  { key: 'C', label: 'Common', emoji: '<:Pcommon:1573802564200300687>', normalPct: 35, shinyPct: 0.0952 },
  { key: 'U', label: 'Uncommon', emoji: '<:Puncommon:1573802607561015306>', normalPct: 15, shinyPct: 0.0721 },
  { key: 'R', label: 'Rare', emoji: '<:Prare:1573802661134864464>', normalPct: 8, shinyPct: 0.0572 },
  { key: 'SR', label: 'SR', emoji: '<:Psr:1573802765459918889>', normalPct: 4, shinyPct: 0.0217 },
  { key: 'SRR', label: 'SRR', emoji: '<:Psrr:1573802796040585358>', normalPct: 1, shinyPct: 0.0137 },
  { key: 'UTR', label: 'UTR', emoji: '<a:Putr:1573802703090614342>', normalPct: 0.49, shinyPct: 0.0092 },
  { key: 'STR', label: 'STR', emoji: '<a:Pstr:1573802859491762237>', normalPct: 0.1, shinyPct: 0.0028 },
  { key: 'USRR', label: 'USRR', emoji: '<a:Pusrr:1573802908846264380>', normalPct: 0.0190, shinyPct: 0.0010 },
  { key: 'UGMR', label: 'UGMR', emoji: '<a:Pugmr:1573802950675923024>', normalPct: 0.015, shinyPct: 0.0001 }
];

const CLAN_ROLE_HIERARCHY = { Leader: 4, 'Co-Leader': 3, Officer: 2, Deputy: 1, Member: 0 };

const CLAN_LOGOS = {
  '1': '<a:Clanlogo1:1572057180704604261>', '2': '<a:Clanlogo2:1572057251022241913>',
  '3': '<a:Clanlogo3:1572057291400683653>', '4': '<a:Clanlogo4:1572057336112226324>',
  '5': '<a:Clanlogo5:1572057406102310923>', '6': '<a:Clanlogo6:1572057452864602223>',
  '7': '<a:Clanlogo7:1572057492501037176>', '8': '<a:Clanlogo8:1572057529817632828>',
  '9': '<a:Clanlogo9:1572057564135555142>', '10': '<a:Clanlogo10:1572057937814495355>',
  '11': '<a:Clanlogo11:1572057971830161408>', '12': '<:Cllanlogo12:1572058007532077238>'
};

const EVENT_ICONS = {
  TIPS: '<a:Tips:1572101474329300992>',
  CRYSTAL: '<a:Crystal_event:1572101509288558652>',
  EVENT_BADGE: '<a:Ascending:1572101417144025169>'
};

const EVENT_NPCS = [
  { name: 'Seroko Mabey', icon: '<:Np8:1572106125652795464>' },
  { name: 'Suxt Bebon', icon: '<:Npc7:1572106075807817768>' },
  { name: 'AXF Nurse', icon: '<:Npc6:1572106025929146469>' },
  { name: 'Jest Clumsey', icon: '<:Npc5:1572105934317293758>' },
  { name: 'Yumey Ker', icon: '<:Npc4:1572105897990430760>' },
  { name: 'Riri Zhun', icon: '<:Npc3:1572105865400549458>' },
  { name: 'Pamey Ev', icon: '<:Npc2:1572105768214204528>' },
  { name: 'Oz Wizzard', icon: '<:Npc1:1572105705958412399>' }
];

const EVENT_CHIBIS_POOL = [
  { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>' },
  { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>' },
  { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>' },
  { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>' },
  { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>' },
  { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>' },
  { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>' },
  { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>' },
  { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>' },
  { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>' },
  { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>' }
];

const SEASON_LIST = {
  1: { name: 'Season 1 - Beta Phrase', start: 'November 1, 2026 - 12:00 AM' },
  2: { name: 'Season 2 - Alpha Xmas', start: 'December 1, 2026 - 12:00 AM' },
  3: { name: 'Season 3 - New Year Begins', start: 'January 1, 2027 - 12:00 AM' },
  4: { name: 'Season 4 - Snowy Flakes', start: 'February 1, 2027 - 12:00 AM' },
  5: { name: 'Season 5 - Chibi Venture', start: 'March 1, 2027 - 12:00 AM' },
  6: { name: 'Season 6 - Hacker Sonata', start: 'April 1, 2027 - 12:00 AM' },
  7: { name: 'Season 7 - Galaxy Reign', start: 'May 1, 2027 - 12:00 AM' },
  8: { name: 'Season 8 - New Era', start: 'June 1, 2027 - 12:00 AM' }
};

const TRIVIA_BANK = [
  { q: 'What is the powerhouse of the cell? Answer starts with M___', a: ['mitochondria'] },
  { q: 'What programming language is this bot written in? J______', a: ['javascript', 'js'] },
  { q: 'Which planet is known as the Red Planet? M___', a: ['mars'] },
  { q: 'What is the chemical symbol for gold? A_', a: ['au'] },
  { q: 'Who painted the Mona Lisa? L______', a: ['da vinci', 'leonardo da vinci'] },
  { q: 'What is the capital city of Japan? T____', a: ['tokyo'] },
  { q: 'How many continents are there on Earth? S____ / Number', a: ['seven', '7'] },
  { q: 'What gas do plants absorb from the atmosphere? C______ d______', a: ['carbon dioxide'] },
  { q: 'What is the largest mammal in the world? B____ w____', a: ['blue whale'] },
  { q: 'In what year did the Titanic sink? 1___', a: ['1912'] }
];

const SHINY_ICON = '<a:Shinynew:1572053794332872886>';
const RARITY_HIERARCHY = { SSRP: 10, UGMR: 9, USRR: 8, STR: 7, UTR: 6, SRR: 5, SR: 4, R: 3, U: 2, C: 1 };

// PH Event ends on December 2, 2026 (23:59:59.999 local time)
const PH_EVENT_END_MS = new Date(2026, 11, 2, 23, 59, 59, 999).getTime();

const ECONOMY_JOBS = [
  { id: 'farmer', name: 'Farmer', emoji: '🌾', minSalary: 50000, maxSalary: 150000, shiftSalary: 250000, isPhEvent: false },
  { id: 'streamer', name: 'Streamer', emoji: '🎮', minSalary: 80000, maxSalary: 210000, shiftSalary: 450000, isPhEvent: false },
  { id: 'youtuber', name: 'YouTuber', emoji: '📹', minSalary: 120000, maxSalary: 500000, shiftSalary: 650000, isPhEvent: false },
  { id: 'seaman', name: 'Seaman', emoji: '⚓', minSalary: 350000, maxSalary: 600000, shiftSalary: 1200000, isPhEvent: false },
  { id: 'akyat_bahay', name: 'Akyat Bahay', emoji: '🥷', minSalary: 350000, maxSalary: 800000, shiftSalary: 1000000, isPhEvent: true },
  { id: 'adik_sa_sha', name: 'Adik sa Sha', emoji: '😵‍💫', minSalary: 500000, maxSalary: 1300000, shiftSalary: 5000000, isPhEvent: true },
  { id: 'promoter_sa_sugal', name: 'Promoter Sa Sugal', emoji: '🎲', minSalary: 900000, maxSalary: 3450000, shiftSalary: 15000000, isPhEvent: true },
  { id: 'artista_sa_pilipinas', name: 'Artista Sa Pilipinas', emoji: '🌟', minSalary: 2300000, maxSalary: 6700000, shiftSalary: 25000000, isPhEvent: true },
  { id: 'bangag_na_senator', name: 'Bangag Na Senator', emoji: '🏛️', minSalary: 5000000, maxSalary: 12000000, shiftSalary: 75000000, isPhEvent: true }
];

const isPhEventActive = (nowMs = Date.now()) => Number(nowMs) <= PH_EVENT_END_MS;
const getActiveEconomyJobs = (nowMs = Date.now()) => ECONOMY_JOBS.filter(job => !job.isPhEvent || isPhEventActive(nowMs));

const CSELL_RATES = {
  C: 8000, U: 16000, R: 24000, SR: 32000, SRR: 43000, UTR: 54000,
  STR: 61000, SRT: 61000, USRR: 100000, UGMR: 200000, UMGR: 200000, SSRP: 500000
};

const ALL_VALID_COMMANDS = new Set([
  'start', 'help', 'status', 'roll', 'drop', 'slot', 'shop', 'rarities',
  'event', 'eadventure', 'ca', 'eshop', 'es', 'ecrystal', 'daily', 'points', 'rank', 'ranks',
  'ccranks', 'customnn', 'profilebg', 'setbg', 'seasons', 'higheststats', 'tradehistory',
  'cstats', 'equipteam', 'battle', 'inventory', 'collections', 'profile', 'trade',
  'clanlist', 'cclaninfo', 'ccreateclan', 'cclanjoin', 'clanleave', 'clanrename',
  'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced',
  'prefixchange', 'enablec', 'disablec', 'meme', 'trivia',
  'work', 'working', 'workshift', 'balance', 'casino', 'blackjack', 'coinflip',
  'ticketuse', 'ticketbuy', 'lottery', 'csell',
  'cnpc', 'npcinv', 'cget', 'nrebirth', 'nascend', 'nsredeem', 'nsr', 'snsredeem', 'snsr',
  'redeems', 'redeem', 'fnpcspawn', 'fns', 'redeemgive', 'sredeemgive',
  'ownercommands', 'admincommands', 'ownerbotmaintenance', 'ownersetstatus',
  'adminrestoreall', 'ownerresetdata', 'fixadmin', 'ownersecretpanel',
  'ownergivechibi', 'adminsetclanrewards', 'owneradminpermsrem', 'removeadminperms',
  'admingivecrystal', 'adminsetlbseason', 'adminresetrank', 'adminsetnn',
  'adminban', 'adminclearlb', 'adminluckevent', 'adminsetxp', 'admingiveitem',
  'adminsetrank', 'adminsetpoints', 'admingivepermission', 'adminsetlevel',
  'testerpanel', 'addtester', 'removetester', 'pubnewupd', 'testerfeature',
  'testerfeatures', 'tf', 'admingivebadges', 'agb'
]);

const TESTER_ONLY_COMMANDS = new Set([
  'testerfeature', 'testerfeatures', 'tf', 'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced'
]);

module.exports = {
  BADGE_CATALOG, BALANCE_ICON, BETA_EMOJIS, RARITY_ICONS, RARITY_RATES,
  CLAN_ROLE_HIERARCHY, CLAN_LOGOS, EVENT_ICONS, EVENT_NPCS, EVENT_CHIBIS_POOL,
  SEASON_LIST, TRIVIA_BANK, SHINY_ICON, RARITY_HIERARCHY,
  PH_EVENT_END_MS, ECONOMY_JOBS, isPhEventActive, getActiveEconomyJobs, CSELL_RATES,
  ALL_VALID_COMMANDS, TESTER_ONLY_COMMANDS
};