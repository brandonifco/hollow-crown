// ============================================================================
// THE HOLLOW CROWN — static game data (world layout, caves, dungeons, text)
// ============================================================================
'use strict';

const GAME_TITLE = 'THE HOLLOW CROWN';
const WORLD_W = 16, WORLD_H = 8;
const START_SCREEN = { x: 7, y: 6 };

// Tile ids ------------------------------------------------------------------
const T = {
  FLOOR: 0, TREE: 1, ROCK: 2, WATER: 3, BUSH: 4, GRAVE: 5, CAVE: 6, STAIRS: 7, DOCK: 8, BRIDGE: 9,
  CRACK: 10, FLOWER: 11, STATUE: 12, FACADE: 13, PILLAR: 14, DOOR: 15, SBUSH: 16, PROCK: 17, SAND: 18,
  DFLOOR: 20, DBLOCK: 21, DWATER: 22, DSTATUE: 23, DPUSH: 24, DSAND: 25, DWALL: 26, DSTAIRS: 27,
  DDOOR: 28,   // doorway tile in a dungeon wall; passability resolved by door state
  VOID: 30,    // black, solid (cave walls drawn separately)
  CFLOOR: 31,  // cave floor (black)
};
const SOLID = new Set([T.TREE, T.ROCK, T.WATER, T.BUSH, T.GRAVE, T.CRACK, T.STATUE, T.FACADE, T.PILLAR, T.SBUSH, T.PROCK,
  T.DBLOCK, T.DWATER, T.DSTATUE, T.DPUSH, T.DWALL, T.VOID]);
const WATERY = new Set([T.WATER, T.DWATER]);
const TRIGGERS = new Set([T.CAVE, T.STAIRS, T.DOOR, T.DSTAIRS]);

const TILE_SPRITE = {
  [T.TREE]: 'tile_tree', [T.ROCK]: 'tile_rock', [T.BUSH]: 'tile_bush', [T.SBUSH]: 'tile_bush', [T.GRAVE]: 'tile_grave',
  [T.CAVE]: 'tile_cave', [T.STAIRS]: 'tile_stairs', [T.DOCK]: 'tile_dock', [T.BRIDGE]: 'tile_bridge', [T.CRACK]: 'tile_crack',
  [T.FLOWER]: 'tile_flower', [T.STATUE]: 'tile_statue', [T.FACADE]: 'tile_facade', [T.PILLAR]: 'tile_pillar', [T.DOOR]: 'tile_door',
  [T.PROCK]: 'tile_rock', [T.DFLOOR]: 'tile_dfloor', [T.DBLOCK]: 'tile_dblock', [T.DPUSH]: 'tile_dblock', [T.DWATER]: 'tile_dwater',
  [T.DSTATUE]: 'tile_dstatue', [T.DSAND]: 'tile_dsand', [T.DSTAIRS]: 'tile_dstairs',
};

// Biomes ----------------------------------------------------------------------
const BIOMES = {
  G: { name: 'plains', floor: '#dcc890', wall: T.TREE, pal: { tree: 'tree_green', rock: 'rock_brown' } },
  F: { name: 'forest', floor: '#a9bf6c', wall: T.TREE, pal: { tree: 'tree_green', rock: 'rock_brown' } },
  W: { name: 'tanglewood', floor: '#6f8c4c', wall: T.TREE, pal: { tree: 'tree_dark', rock: 'rock_gray' } },
  M: { name: 'mountain', floor: '#c49c66', wall: T.ROCK, pal: { tree: 'tree_dark', rock: 'rock_brown' } },
  D: { name: 'desert', floor: '#ecd08a', wall: T.ROCK, pal: { tree: 'tree_green', rock: 'rock_orange' } },
  L: { name: 'lakeland', floor: '#cbd59c', wall: T.TREE, pal: { tree: 'tree_green', rock: 'rock_gray' } },
  C: { name: 'coast', floor: '#eedca4', wall: T.TREE, pal: { tree: 'tree_green', rock: 'rock_gray' } },
  Y: { name: 'graveyard', floor: '#b4b4a4', wall: T.TREE, pal: { tree: 'tree_dark', rock: 'rock_gray' } },
};

const REGION = [
  'MMMMMMMMMMMMMMMM',
  'MMMMMMMMMMMMMMMM',
  'FWGGGGMDDDDGLLFF',
  'FFYYGGGGDDGGFLLL',
  'FFYYFGGGGGGFFLLL',
  'FFFFFGGGGGFFGGLL',
  'CCFGGGGGGGGGGGGC',
  'CCCCCCGGCCCCCCCC',
];

// Hand-built screens -----------------------------------------------------------
// . floor  T tree  R rock  W water  B bush  b secret bush  G grave  C cave  c crack
// D dock  = bridge  F flower  X statue  e facade  p pillar  E temple door  P push-rock  > stairs
const HAND_CHARS = {
  '.': T.FLOOR, T: T.TREE, R: T.ROCK, W: T.WATER, B: T.BUSH, b: T.SBUSH, G: T.GRAVE, C: T.CAVE, c: T.CRACK,
  D: T.DOCK, '=': T.BRIDGE, F: T.FLOWER, X: T.STATUE, e: T.FACADE, p: T.PILLAR, E: T.DOOR, P: T.PROCK, '>': T.STAIRS, H: T.FLOOR,
};
const HAND_SCREENS = {
  '7,6': [ // hermit's glade
    'TTTTTTT..TTTTTTT',
    'TT.F.........FTT',
    'T.....RRRR.....T',
    'T....RRCRRR....T',
    '.....F.......F..',
    '................',
    '..B..........B..',
    'T....WWW.......T',
    'T....WWW...F...T',
    'TT............TT',
    'TTTTTTT..TTTTTTT',
  ],
  '14,3': [ // island sanctum (raft)
    'TTTTTTTTTTTTTTTT',
    'TWWWWW.....WWWWT',
    'TWWWW..eee..WWWT',
    'TWWWW..pEp..WWWT',
    'TWWWW.......WWWT',
    'TWWWWWWWDWWWWWWT',
    'TWWWWWWWWWWWWWWT',
    'TWWWWWWWWWWWWWWT',
    '........D.....TT',
    '..............TT',
    'TTTTTT....TTTTTT',
  ],
  '1,6': [ // barrow across the channel (ladder)
    'WTTTTT....TTTTTT',
    'WT.............T',
    'WT..B.......B..T',
    'WT..............',
    'WT..............',
    'WT..............',
    'WWWWWWWWWWWWWWWT',
    'WW.....eee.....T',
    'WW.....pEp.....T',
    'WW.............T',
    'WWWWWWWWWWWWWWWW',
  ],
  '11,1': [ // mountain tarn (whistle)
    'RRRRRRRRRRRRRRRR',
    'RRRRR......RRRRR',
    'RRR..........RRR',
    'RR....WWWW....RR',
    '......WWWW....RR',
    '......WWWW....RR',
    'RR....WWWW....RR',
    'RRR..........RRR',
    'RRRR........RRRR',
    'RRRRR......RRRRR',
    'RRRRRR....RRRRRR',
  ],
  '7,0': [ // the hollow throne gate
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'RRRRRR.eee.RRRRR',
    'RRRRR..pEp..RRRR',
    'RRRR.X.....X.RRR',
    'RRR..........RRR',
    'RR............RR',
    'RR.X........X.RR',
    'RRR..........RRR',
    'RRRRR......RRRRR',
    'RRRRRR....RRRRRR',
  ],
  '1,2': [ // the tanglewood (looping woods)
    'TTTTTTT..TTTTTTT',
    'TTT.T.T..T.TT.TT',
    'T.T...T..T...T.T',
    'T...TT....TT...T',
    '................',
    '................',
    '................',
    'T...TT....TT...T',
    'T.T...T..T...T.T',
    'TTT.T.T..T.TT.TT',
    'TTTTTTT..TTTTTTT',
  ],
  '15,6': [ // gull rock (raft to the islet)
    'TTTTTT....TTTTWW',
    'T............WWW',
    'T............WWW',
    '..............WW',
    '..............WW',
    '..............WW',
    'T......D.....WWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWW.D.H.WWWWW',
    'WWWWWWWWWWWWWWWW',
  ],
  '8,7': [ // shingle beach (ladder to the sandbar)
    'TTTTTT....TTTTTT',
    'T..............T',
    'T....B....B....T',
    '................',
    '................',
    '................',
    'T..............T',
    'WWWWWWWWWWWWWWWW',
    'WWWWWW..H..WWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
  ],
};

// edges forced closed regardless of generation: [x1,y1,x2,y2]
const FORCED_CLOSED = [[0, 2, 0, 1], [0, 2, 0, 3]];

// Lost-woods style loop
const TANGLEWOOD = { x: 1, y: 2, seq: ['up', 'left', 'down', 'left'], exitBack: 'right', dest: { x: 0, y: 2 } };
const WHISTLE_TARN = { x: 11, y: 1 };

// Overworld features ------------------------------------------------------------
// entrance kinds: 'cave' (id) or 'dungeon' (level). reveal: visible | bomb | fire | push | whistle
const FEATURES = [
  { x: 7, y: 6, kind: 'cave', id: 'start', hand: { tx: 7, ty: 3 } },
  { x: 9, y: 5, kind: 'dungeon', level: 1 },
  { x: 9, y: 2, kind: 'dungeon', level: 2 },
  { x: 13, y: 4, kind: 'dungeon', level: 3 },
  { x: 14, y: 3, kind: 'dungeon', level: 4, hand: { tx: 8, ty: 3 } },
  { x: 1, y: 6, kind: 'dungeon', level: 5, hand: { tx: 8, ty: 8 } },
  { x: 11, y: 1, kind: 'dungeon', level: 6, reveal: 'whistle', hand: { tx: 7, ty: 4 } },
  { x: 3, y: 0, kind: 'dungeon', level: 7, reveal: 'fire' },
  { x: 0, y: 2, kind: 'dungeon', level: 8 },
  { x: 7, y: 0, kind: 'dungeon', level: 9, hand: { tx: 8, ty: 3 } },
  { x: 2, y: 1, kind: 'cave', id: 'steel' },
  { x: 13, y: 0, kind: 'cave', id: 'sun', reveal: 'bomb' },
  { x: 5, y: 6, kind: 'cave', id: 'shopA' },
  { x: 12, y: 5, kind: 'cave', id: 'shopB' },
  { x: 3, y: 3, kind: 'cave', id: 'shopC' },
  { x: 10, y: 4, kind: 'cave', id: 'potion' },
  { x: 14, y: 6, kind: 'cave', id: 'shopD', reveal: 'fire' },
  { x: 3, y: 6, kind: 'cave', id: 'gift' },
  { x: 4, y: 0, kind: 'cave', id: 'hc_peak', reveal: 'bomb' },
  { x: 0, y: 4, kind: 'cave', id: 'hc_grove', reveal: 'fire' },
  { x: 2, y: 0, kind: 'cave', id: 'money30', reveal: 'bomb' },
  { x: 5, y: 2, kind: 'cave', id: 'money100', reveal: 'fire' },
  { x: 9, y: 6, kind: 'cave', id: 'money10', reveal: 'push' },
  { x: 10, y: 1, kind: 'cave', id: 'money50', reveal: 'bomb' },
  { x: 6, y: 1, kind: 'cave', id: 'fee', reveal: 'bomb' },
  { x: 2, y: 4, kind: 'cave', id: 'bombshop', reveal: 'push' },
  { x: 6, y: 5, kind: 'cave', id: 'hint_woods' },
  { x: 10, y: 6, kind: 'cave', id: 'hint_tarn' },
  { x: 13, y: 6, kind: 'cave', id: 'hint_fire' },
  { x: 4, y: 4, kind: 'cave', id: 'hint_bomb' },
  { x: 8, y: 1, kind: 'cave', id: 'hint_king' },
  { x: 12, y: 3, kind: 'cave', id: 'hint_swords' },
  { x: 4, y: 5, kind: 'fairy' },
  { x: 12, y: 2, kind: 'fairy' },
  { x: 15, y: 6, kind: 'item', id: 'hc_islet', item: 'heart_container', hand: { tx: 9, ty: 9 } },
  { x: 8, y: 7, kind: 'item', id: 'hc_sandbar', item: 'heart_container', hand: { tx: 8, ty: 8 } },
];

// Caves ----------------------------------------------------------------------------
// item: sword1..3 shield bombs bombbag key lantern ring1 potion heart_container rupees
const CAVES = {
  start: { npc: 'npc_hermit', text: 'THE WILDS HAVE TEETH, YOUNG ONE. CARRY THIS AND KEEP MOVING.', items: [{ item: 'sword1', price: 0 }] },
  steel: { npc: 'npc_hermit', text: 'A BLADE OF STEEL ANSWERS ONLY TO A STRONG HEART.', items: [{ item: 'sword2', price: 0 }], req: 5,
    reqText: 'YOUR HEART IS NOT YET STOUT ENOUGH. RETURN WITH FIVE.' },
  sun: { npc: 'npc_hermit', text: 'FORGED IN THE FIRST DAWN. WIELD IT WELL, HERO.', items: [{ item: 'sword3', price: 0 }], req: 12,
    reqText: 'THIS BLADE WOULD BURN YOU. RETURN WITH TWELVE HEARTS.' },
  shopA: { npc: 'npc_merchant', text: 'WELCOME, TRAVELER! FINE GOODS, FAIR PRICES.', shop: true,
    items: [{ item: 'shield', price: 90 }, { item: 'bombs', price: 20 }, { item: 'key', price: 80 }] },
  shopB: { npc: 'npc_merchant', text: 'LIGHT FOR DARK PLACES. BUY SOMETHING, WILL YA?', shop: true,
    items: [{ item: 'lantern', price: 60 }, { item: 'bombs', price: 25 }, { item: 'key', price: 90 }] },
  shopC: { npc: 'npc_merchant', text: 'THE DEAD DO NOT SHOP. YOU MIGHT.', shop: true,
    items: [{ item: 'ring1', price: 250 }, { item: 'bombs', price: 20 }, { item: 'shield', price: 100 }] },
  shopD: { npc: 'npc_merchant', text: 'SHH! SECRET PRICES FOR SECRET CUSTOMERS.', shop: true,
    items: [{ item: 'shield', price: 70 }, { item: 'key', price: 60 }, { item: 'ring1', price: 200 }] },
  bombshop: { npc: 'npc_merchant', text: 'MORE ROOM FOR BOOM. INTERESTED?', shop: true,
    items: [{ item: 'bombbag', price: 100 }] },
  potion: { npc: 'npc_hermit', text: 'TONICS BREWED FROM MOONLIT ROOTS. ONE DOSE MENDS ALL WOUNDS.', shop: true,
    items: [{ item: 'potion', price: 40 }, { item: 'potion', price: 40 }] },
  gift: { npc: 'npc_hermit', text: 'A GIFT FOR THE BRAVE. CHOOSE ONE, AND CHOOSE WISELY.', choice: true,
    items: [{ item: 'heart_container', price: 0 }, { item: 'potion', price: 0 }] },
  hc_peak: { npc: 'npc_hermit', text: 'FEW CLIMB THIS HIGH. YOUR HEART GROWS STRONGER.', items: [{ item: 'heart_container', price: 0 }] },
  hc_grove: { npc: 'npc_hermit', text: 'THE FIRE SHOWED YOU THE WAY. TAKE THIS.', items: [{ item: 'heart_container', price: 0 }] },
  money30: { npc: 'npc_merchant', text: 'YOU FOUND MY STASH. TAKE A CUT, AND KEEP QUIET.', items: [{ item: 'rupees', amount: 30, price: 0 }] },
  money100: { npc: 'npc_merchant', text: 'A REWARD FOR SHARP EYES.', items: [{ item: 'rupees', amount: 100, price: 0 }] },
  money10: { npc: 'npc_merchant', text: 'NOT MUCH, BUT IT IS YOURS.', items: [{ item: 'rupees', amount: 10, price: 0 }] },
  money50: { npc: 'npc_merchant', text: 'MOUNTAIN GOLD FOR A MOUNTAIN CLIMBER.', items: [{ item: 'rupees', amount: 50, price: 0 }] },
  fee: { npc: 'npc_hermit', text: 'YOU BLEW A HOLE IN MY WALL! THAT WILL COST YOU 20 GEMS.', fee: 20 },
  hint_woods: { npc: 'npc_hermit', text: 'THE TANGLEWOOD IN THE WEST LOOPS FOREVER. WALK NORTH, WEST, SOUTH, THEN WEST.' },
  hint_tarn: { npc: 'npc_hermit', text: 'A MOUNTAIN TARN NORTH-EAST HIDES A DOOR. LET THE WATER HEAR A SONG.' },
  hint_fire: { npc: 'npc_hermit', text: 'SOME BUSHES HIDE STAIRS. A LANTERN FLAME REVEALS THEM.' },
  hint_bomb: { npc: 'npc_hermit', text: 'CRACKED STONE CRUMBLES BEFORE BOMBS. SOME BOULDERS CAN BE PUSHED.' },
  hint_king: { npc: 'npc_hermit', text: 'THE HOLLOW KING CANNOT BE SLAIN BY STEEL ALONE. ONLY STARLIGHT ENDS HIM.' },
  hint_swords: { npc: 'npc_hermit', text: 'TWO GREATER BLADES WAIT IN THE MOUNTAINS. ONE IS SEALED BEHIND STONE.' },
};

// Items ---------------------------------------------------------------------------
const ITEM_INFO = {
  sword1: { spr: 'sword', pal: 'sword1', name: 'TWIG BLADE' },
  sword2: { spr: 'sword', pal: 'sword2', name: 'STEEL BLADE' },
  sword3: { spr: 'sword', pal: 'sword3', name: 'SUNFORGED BLADE' },
  shield: { spr: 'shield_tower', name: 'TOWER SHIELD' },
  bombs: { spr: 'bomb', name: 'BOMBS' },
  bombbag: { spr: 'bombbag', name: 'BOMB BAG' },
  key: { spr: 'key', name: 'KEY' },
  lantern: { spr: 'lantern', name: 'LANTERN' },
  ring1: { spr: 'ring', pal: 'blue', name: 'BLUE RING' },
  ring2: { spr: 'ring', pal: 'red', name: 'RED RING' },
  potion: { spr: 'potion', name: 'LIFE POTION' },
  heart_container: { spr: 'heart_container', name: 'HEART VESSEL' },
  rupees: { spr: 'rupee', pal: 'rupee5', name: 'GEMS' },
  disc: { spr: 'disc_item', name: 'WIND DISC' },
  bow: { spr: 'bow', name: 'LONGBOW' },
  raft: { spr: 'raft', name: 'RAFT' },
  ladder: { spr: 'ladder', name: 'LADDER' },
  whistle: { spr: 'whistle', name: 'WHISTLE' },
  wand: { spr: 'wand', pal: 'magic', name: 'MAGE WAND' },
  book: { spr: 'book', name: 'SPELLBOOK' },
  stararrow: { spr: 'star_arrow', name: 'STARLIGHT ARROWS' },
  map: { spr: 'map', name: 'MAP' },
  compass: { spr: 'compass', name: 'COMPASS' },
  shard: { spr: 'shard', name: 'DAWN SHARD' },
};

// Dungeons --------------------------------------------------------------------------
const DUNGEON_DEFS = [null,
  { name: 'ROOTDEEP HOLLOW', pal: 'dgn1', floor: '#1c3a3a', item: 'disc', boss: 'thornhorn', rooms: 14, locks: 2, enemies: ['slime', 'flitter', 'bone'], dark: 0 },
  { name: 'SUNSCAR CRYPT', pal: 'dgn2', floor: '#3a2c18', item: 'bow', boss: 'coilworm', rooms: 17, locks: 2, enemies: ['viper', 'slime', 'blob', 'flitter'], dark: 0 },
  { name: 'MIREWATER VAULT', pal: 'dgn3', floor: '#1e3418', item: 'raft', boss: 'hydra', rooms: 20, locks: 3, enemies: ['bone', 'hook', 'blob', 'bulwark'], dark: 0.1 },
  { name: 'ISLE SANCTUM', pal: 'dgn4', floor: '#14204a', item: 'ladder', boss: 'pulsar', rooms: 22, locks: 3, enemies: ['flitter', 'viper', 'blob', 'hook', 'bulwark'], dark: 0.15 },
  { name: 'GLOOM BARROW', pal: 'dgn5', floor: '#2a1838', item: 'whistle', boss: 'coilworm2', rooms: 25, locks: 4, enemies: ['bulwark', 'wrapped', 'hexer', 'blob', 'bone'], dark: 0.2 },
  { name: 'STORMSPIRE', pal: 'dgn6', floor: '#262a30', item: 'wand', boss: 'dragon', rooms: 28, locks: 4, enemies: ['hexer', 'wrapped', 'bulwark', 'flitter', 'grabber'], dark: 0.2 },
  { name: 'EMBERFORGE', pal: 'dgn7', floor: '#3a1410', item: 'book', boss: 'beast', rooms: 30, locks: 5, enemies: ['hookB', 'bulwark', 'grabber', 'viper', 'blob'], dark: 0.25 },
  { name: 'SHROUDED DEPTHS', pal: 'dgn8', floor: '#24280e', item: 'stararrow', boss: 'orbit', rooms: 32, locks: 5, enemies: ['bulwarkB', 'hexerB', 'wrapped', 'flitter', 'blob'], dark: 0.3 },
  { name: 'THE HOLLOW THRONE', pal: 'dgn9', floor: '#1a0610', item: 'ring2', boss: 'king', rooms: 40, locks: 6, enemies: ['bulwarkB', 'hexerB', 'wrapped', 'hookB', 'grabber', 'bone', 'blob'], dark: 0.35 },
];

// Room interior templates (12x7). . floor B block W water S statue s sand
const ROOM_TEMPLATES = [
  ['............', '............', '............', '............', '............', '............', '............'],
  ['............', '.BB......BB.', '............', '............', '............', '.BB......BB.', '............'],
  ['............', '............', '....B..B....', '............', '....B..B....', '............', '............'],
  ['............', '.B.B....B.B.', '............', '............', '............', '.B.B....B.B.', '............'],
  ['S..........S', '............', '............', '............', '............', '............', 'S..........S'],
  ['............', '.WWW....WWW.', '.WWW....WWW.', '............', '.WWW....WWW.', '.WWW....WWW.', '............'],
  ['ssssssssssss', 'ss........ss', 's..ssssss..s', 's..........s', 's..ssssss..s', 'ss........ss', 'ssssssssssss'],
  ['............', '.BBBB..BBBB.', '.B........B.', '............', '.B........B.', '.BBBB..BBBB.', '............'],
  ['............', '..S......S..', '............', '............', '............', '..S......S..', '............'],
  ['............', 'WWWWW..WWWWW', '............', '............', '............', 'WWWWW..WWWWW', '............'],
  ['............', '.ss.ss.ss.s.', '............', '..B......B..', '............', '.s.ss.ss.ss.', '............'],
  ['B..........B', '.B........B.', '............', '............', '............', '.B........B.', 'B..........B'],
];

const DUNGEON_HINTS = [
  'EYES THAT OPEN CAN BE PIERCED BY ARROWS.',
  'WALLS THAT SOUND HOLLOW BREAK WITH BOMBS.',
  'SHIELDED KNIGHTS ARE WEAK FROM BEHIND.',
  'THE BEAST HUNGERS FOR BOMBS. FEED IT.',
  'IF A DOOR IS SHUT, DEFEAT ALL FOES OR PUSH A STONE.',
  'A KEY CAN BE BOUGHT IF ONE IS LOST.',
  'LIGHT THE LANTERN WHERE IT IS DARK.',
  'THE WIND DISC STUNS WHAT IT CANNOT KILL.',
  'SORCERERS VANISH AND REAPPEAR. BE READY.',
  'BEWARE THE HAND THAT RISES FROM THE FLOOR.',
  'SPIKED BLOCKS STRIKE WHEN YOU STAND IN LINE.',
  'THE EIGHT SHARDS UNSEAL THE THRONE ON THE PEAK.',
];

const STORY = [
  'LONG AGO, THE DAWNSTONE',
  'KEPT THE LAND OF VELLMOOR',
  'WARM AND BRIGHT.',
  '',
  'THEN THE HOLLOW KING ROSE',
  'FROM THE MOUNTAIN DARK.',
  'HE SHATTERED THE STONE',
  'INTO EIGHT SHARDS AND',
  'IMPRISONED SAGE ELOWEN,',
  'ITS LAST KEEPER.',
  '',
  'THE SHARDS FELL INTO',
  'EIGHT DEEP PLACES.',
  '',
  'A LONE WANDERER NAMED',
  'BY YOU MUST FIND THEM,',
  'MEND THE DAWNSTONE, AND',
  'END THE HOLLOW REIGN.',
];

const ENDING_TEXT = [
  'THE HOLLOW KING IS NO MORE.',
  '',
  'THE DAWNSTONE BURNS AGAIN',
  'AND MORNING RETURNS TO',
  'VELLMOOR.',
  '',
  'SAGE ELOWEN THANKS YOU,',
  'WANDERER. THE LAND WILL',
  'REMEMBER YOUR NAME.',
];

const CREDITS = [
  GAME_TITLE, '', 'AN ORIGINAL ADVENTURE', '', 'DESIGN, CODE, ART, MUSIC', 'BY CLAUDE', '',
  'FOR BRANDON', '', 'THANK YOU FOR PLAYING', '', 'A HARDER SECOND QUEST', 'AWAITS YOUR FILE.',
];
