// ============================================================================
// THE HOLLOW CROWN — game states, areas, HUD, menus, saving
// ============================================================================
'use strict';

const SAVE_KEY = 'hollowcrown_v1';

const OVER_GROUPS = {
  G: [['thorn', 'thorn', 'thorn'], ['thorn', 'thornB', 'skitter'], ['spear', 'spearB', 'thornB'], ['spearB', 'knight', 'thornB']],
  F: [['thorn', 'spear'], ['spear', 'wisp', 'thorn'], ['spearB', 'wisp'], ['knight', 'wisp', 'spearB']],
  W: [['spearB', 'wisp'], ['spearB', 'wisp'], ['spearB', 'wisp'], ['knight', 'wisp']],
  D: [['burrow'], ['burrow', 'burrowB'], ['burrowB', 'skitter'], ['burrowB', 'skitterB']],
  M: [['skitter'], ['skitter', 'spearB'], ['knight', 'skitterB', 'spearB'], ['knight', 'knightB', 'skitterB']],
  L: [['thorn'], ['thorn', 'thornB'], ['thornB', 'wisp'], ['thornB', 'spearB']],
  C: [['thorn'], ['thorn', 'thornB'], ['thornB', 'spearB'], ['spearB', 'thornB']],
  Y: [['shade'], ['shade'], ['shade'], ['shade']],
};

function newSave(name, quest, prev) {
  return {
    v: 1, name, quest: quest || 1, deaths: prev ? prev.deaths : 0, wins: prev ? (prev.wins || 0) : 0,
    maxHearts: 3, hp: 3 * HEART, rupees: 0, bombs: 0, maxBombs: 8, everBombs: false, keys: 0, sword: 0, shield: 0, ring: 0,
    items: { disc: false, bow: false, lantern: false, whistle: false, wand: false, book: false, raft: false, ladder: false, stararrow: false },
    potion: 0, shards: 0, selB: null, flags: {}, dungeons: {}, resume: 0,
  };
}

const Game = {
  state: 'title', t: 0, stateT: 0, save: null, slot: 0, slots: [null, null, null],
  area: null, player: null, ents: [], trans: null, text: null, toastMsg: null, shake: 0, shakeX: 0,
  clockFreeze: false, refillTo: 0, dsession: null, woodsProg: 0, whistleIdx: 0, menuSel: 0, selSlot: 0, nameBuf: '',
  eraseArm: -1, goSel: 0,

  // -------------------------------------------------------------------------
  // persistence
  // -------------------------------------------------------------------------
  loadSlots() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && Array.isArray(d.slots)) this.slots = d.slots.concat([null, null, null]).slice(0, 3); } catch (e) { /* storage unavailable */ }
  },
  writeSlots() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ slots: this.slots })); } catch (e) { /* ignore */ }
  },
  saveGame() {
    if (!this.save) return;
    this.slots[this.slot] = JSON.parse(JSON.stringify(this.save));
    this.writeSlots();
  },
  flag(k) { return !!this.save.flags[k]; },
  setFlag(k) { this.save.flags[k] = true; },
  dstate(level) {
    const d = this.save.dungeons;
    if (!d[level]) d[level] = { map: false, compass: false, visited: [], unlocked: [], bombed: [], taken: [], bossDead: false, heart: false, shard: false };
    return d[level];
  },
  addEnt(e) { this.ents.push(e); return e; },
  toast(text, t = 150) { this.toastMsg = { lines: wrapText(text, 28), t }; },
  showText(str) { this.text = { lines: wrapText(str, 26), n: 0, total: str.length, done: false }; },

  // -------------------------------------------------------------------------
  // starting / respawning
  // -------------------------------------------------------------------------
  startGame(slot) {
    this.slot = slot;
    this.save = JSON.parse(JSON.stringify(this.slots[slot]));
    const s = this.save;
    s.hp = Math.max(s.hp, Math.min(s.maxHearts, 3) * HEART);
    this.player = makePlayer(128, 96, 'up');
    this.state = 'play';
    this.trans = null; this.text = null;
    if (s.resume) this.enterDungeon(s.resume, true);
    else this.goOverworld(START_SCREEN.x, START_SCREEN.y, 128, 96, 'up');
  },
  respawn() {
    const s = this.save;
    s.hp = Math.min(s.maxHearts, 3) * HEART;
    this.player = makePlayer(128, 96, 'up');
    this.state = 'play';
    this.trans = null; this.text = null;
    if (s.resume) this.enterDungeon(s.resume, true);
    else this.goOverworld(START_SCREEN.x, START_SCREEN.y, 128, 96, 'up');
  },
  goOverworld(sx, sy, px, py, dir) {
    this.save.resume = 0;
    this.setArea(this.buildOver(sx, sy), px, py, dir);
  },

  // -------------------------------------------------------------------------
  // area construction
  // -------------------------------------------------------------------------
  buildOver(sx, sy) {
    const scr = World.screens[sy][sx];
    const a = { kind: 'over', sx, sy, scr, biome: scr.biome, tiles: Uint8Array.from(scr.tiles), reach: scr.reach, floor: BIOMES[scr.biome].floor, dirty: true, lanternUsed: false };
    if (scr.entrance && scr.entrance.f.reveal && this.flag('rev:' + sx + ',' + sy)) this.applyReveal(a, scr.entrance);
    return a;
  },
  applyReveal(a, ent) {
    const { tx, ty, f } = ent;
    const set = (x, y, v) => { a.tiles[y * COLS + x] = v; a.dirty = true; };
    if (f.reveal === 'bomb') set(tx, ty, T.CAVE);
    else if (f.reveal === 'fire') set(tx, ty, T.STAIRS);
    else if (f.reveal === 'push') { set(tx, ty - 1, T.ROCK); set(tx, ty, T.STAIRS); }
    else if (f.reveal === 'whistle') {
      for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] === T.WATER) a.tiles[i] = T.FLOOR;
      set(tx, ty, T.STAIRS);
      a.reach = computeReach(a.tiles, openingTargets(screenEdges(a.sx, a.sy)));
    }
  },
  buildCave(id, ret) {
    const def = CAVES[id];
    const t = new Uint8Array(COLS * ROWS).fill(T.CFLOOR);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (y < 2 || x < 2 || x > 13 || (y > 8 && (x < 7 || x > 8))) t[y * COLS + x] = T.ROCK;
    }
    for (const x of [4, 7, 8, 11]) t[4 * COLS + x] = T.VOID;
    return { kind: 'cave', id, def, ret, tiles: t, floor: '#000000', dirty: true, lanternUsed: false };
  },
  buildRoom(level, rid) {
    const dg = getDungeon(level, this.save.quest), room = dg.rooms.get(rid), def = dg.def;
    const t = new Uint8Array(COLS * ROWS).fill(T.DFLOOR);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (y < 2 || y > 8 || x < 2 || x > 13) t[y * COLS + x] = T.DWALL;
    const tpl = ROOM_TEMPLATES[room.template] || ROOM_TEMPLATES[0];
    const map = { B: T.DBLOCK, W: T.DWATER, S: T.DSTATUE, s: T.DSAND };
    tpl.forEach((row, j) => { for (let i = 0; i < 12; i++) if (map[row[i]]) t[(j + 2) * COLS + i + 2] = map[row[i]]; });
    if (room.pushOpen) t[4 * COLS + 7] = this.dsession.pushed.has(rid) ? T.DBLOCK : T.DPUSH;
    if (room.kind === 'hint') for (const x of [4, 7, 8, 11]) t[4 * COLS + x] = T.VOID;
    const a = { kind: 'dungeon', level, dg, room, rid, def, tiles: t, floor: def.floor, pal: def.pal, dirty: true, lanternUsed: false, dark: room.dark, lit: false, doors: {} };
    this.refreshDoors(a, true);
    return a;
  },
  roomCleared(room) {
    const ds = this.dstate(this.dsession.level);
    if (room.kind === 'boss') return ds.bossDead;
    return room.enemies.length === 0 || this.dsession.cleared.has(room.id);
  },
  doorState(a, dir) {
    const dg = a.dg, room = a.room, ds = this.dstate(a.level);
    const e = dungeonDoor(dg, room, dir);
    if (!e) return null;
    if (e.type === 'exit') return { state: 'exit' };
    const nid = ridx(room.x + DIRS[dir][0], room.y + DIRS[dir][1]), ek = edgeKey(room.id, nid);
    let st = 'open';
    if (e.type === 'locked') st = ds.unlocked.includes(ek) ? 'open' : 'locked';
    else if (e.type === 'bomb') st = ds.bombed.includes(ek) ? 'bombed' : 'bombwall';
    else if (e.type === 'shutter' && e.owner === room.id) {
      const open = room.pushOpen ? this.dsession.pushed.has(room.id) : this.roomCleared(room);
      if (!open) st = 'shut';
    }
    if (room.kind === 'boss' && !ds.bossDead && a.level !== 9 && st === 'open') st = 'shut';
    if (room.kind === 'boss' && !ds.bossDead && nid === dg.shardRoom) st = 'shut';
    return { state: st, ek, nid };
  },
  refreshDoors(a, silent) {
    let changed = false;
    for (const dir of DIR_LIST) {
      const d = this.doorState(a, dir);
      const prev = a.doors[dir];
      a.doors[dir] = d;
      const pass = !d || d.state === 'open' || d.state === 'bombed' || d.state === 'exit';
      for (const [x, y] of doorTiles(dir)) a.tiles[y * COLS + x] = d && pass ? T.DFLOOR : T.DWALL;
      if (prev && d && prev.state !== d.state && (prev.state === 'shut' || d.state === 'shut')) changed = true;
    }
    a.dirty = true;
    if (changed && !silent) Sound.sfx('door');
  },

  // -------------------------------------------------------------------------
  // populate an area with entities after it becomes current
  // -------------------------------------------------------------------------
  setArea(a, px, py, dir) {
    const p = this.player;
    this.area = a; this.ents = []; this.clockFreeze = false;
    p.x = px; p.y = py; p.dir = dir || p.dir; p.kb = null; p.atk = 0; p.beamOut = false; p.discOut = false;
    if (p.state !== 'auto') p.state = 'normal';
    this.populate();
  },
  populate() {
    const a = this.area, s = this.save;
    this.text = null;
    if (a.kind === 'over') {
      Sound.music('overworld');
      const scr = a.scr;
      (s.seen = s.seen || {})[a.sx + ',' + a.sy] = 1;
      if (scr.item && !this.flag('item:' + scr.item.f.id)) {
        const f = scr.item.f;
        this.addEnt(makePickup(f.item, scr.item.tx * TS + 8, scr.item.ty * TS + 8, { major: true, onTake: () => this.setFlag('item:' + f.id) }));
      }
      if (scr.fairy) {
        const fx = scr.fairy;
        const n = makeNpc('npc_great_fairy', fx.x - 8, fx.y - 8);
        n.bob = true; n.fountain = true;
        this.addEnt(n);
      }
      this.spawnOverEnemies();
    } else if (a.kind === 'cave') {
      Sound.music(null);
      const def = a.def;
      this.addEnt(makeNpc(def.npc, 120, 64));
      this.addEnt(makeNpc('fire', 64, 64, { anim: true }));
      this.addEnt(makeNpc('fire', 176, 64, { anim: true }));
      let text = def.text;
      if (def.fee) {
        if (!this.flag('fee:' + a.id)) { this.setFlag('fee:' + a.id); s.rupees = Math.max(0, s.rupees - def.fee); this.saveGame(); }
        else text = 'THE WALL IS FIXED NOW. NO THANKS TO YOU.';
      }
      if (def.req && s.maxHearts < def.req && !this.flag('cave:' + a.id + ':0')) { this.showText(def.reqText); return; }
      const items = (def.items || []).map((it, i) => ({ it, i })).filter(({ it, i }) => this.caveItemAvailable(a.id, def, it, i));
      if (def.items && !items.length && !def.shop) text = '';
      if (text) this.showText(text);
      const xs = items.length === 1 ? [128] : items.length === 2 ? [104, 152] : [88, 128, 168];
      items.forEach(({ it, i }, k) => {
        const pk = makePickup(it.item, xs[k], 104, { price: it.price, major: true });
        pk.cave = { id: a.id, def, it, i };
        this.addEnt(pk);
      });
    } else if (a.kind === 'dungeon') {
      const room = a.room, ds = this.dstate(a.level);
      if (!ds.visited.includes(a.rid)) ds.visited.push(a.rid);
      const bossAlive = room.kind === 'boss' && !ds.bossDead;
      Sound.music(bossAlive ? 'boss' : a.level === 9 ? 'final' : 'dungeon');
      if (room.kind === 'hint') {
        this.addEnt(makeNpc('npc_hermit', 120, 64));
        this.addEnt(makeNpc('fire', 64, 64, { anim: true }));
        this.addEnt(makeNpc('fire', 176, 64, { anim: true }));
        this.showText(room.hint);
      }
      if (room.kind === 'sage') {
        const n = makeNpc('npc_sage', 120, 72);
        n.onTouch = () => this.beginEnding();
        this.addEnt(n);
        for (const x of [72, 96, 144, 168]) this.addEnt(makeNpc('fire', x, 104, { anim: true }));
      }
      if (room.kind === 'shard' && !ds.shard) this.addEnt(this.dungeonPickup('shard', 128, 88));
      if (room.kind === 'boss' && ds.bossDead && !ds.heart && a.level < 9) this.addEnt(this.dungeonPickup('heart_container', 128, 88));
      if (room.item && !ds.taken.includes(a.rid)) {
        const visible = room.kind === 'item' || this.roomCleared(room);
        if (visible) this.addEnt(this.dungeonPickup(room.item, 128, 88));
      }
      if (!this.roomCleared(room) || (room.kind === 'boss' && !ds.bossDead)) this.spawnRoomEnemies();
      if (room.traps) for (const [tx, ty] of [[2, 2], [13, 2], [2, 8], [13, 8]]) {
        const e = makeEnemy('trap', tx * TS, ty * TS); e.hx = e.x; e.hy = e.y; this.addEnt(e);
      }
    }
  },
  caveItemAvailable(id, def, it, i) {
    const s = this.save;
    if (def.choice && this.flag('cave:' + id)) return false;
    if (!def.shop) return !this.flag('cave:' + id + ':' + i);
    if (it.item === 'shield') return !s.shield;
    if (it.item === 'lantern') return !s.items.lantern;
    if (it.item === 'ring1') return s.ring < 1;
    if (it.item === 'bombbag') return !this.flag('bombbag');
    return true;
  },
  dungeonPickup(kind, x, y) {
    const a = this.area;
    const pk = makePickup(kind, x, y, { major: !['key', 'map', 'compass'].includes(kind) });
    pk.dungeon = { level: a.level, rid: a.rid };
    return pk;
  },
  spawnOverEnemies() {
    const a = this.area;
    if ((a.sx === START_SCREEN.x && a.sy === START_SCREEN.y) || a.scr.fairy) return;
    const tier = Math.min(3, Math.floor((Math.abs(a.sx - 7) + Math.abs(a.sy - 6) * 1.4) / 3) + (a.sy <= 1 ? 1 : 0));
    const group = OVER_GROUPS[a.biome][tier];
    const n = a.biome === 'Y' ? rnd.int(3, 5) : Math.min(6, rnd.int(2 + Math.min(tier, 1), 4 + tier));
    for (let i = 0; i < n; i++) {
      const type = rnd.pick(group);
      const t = randomFloorTile(56);
      if (!t) break;
      const e = makeEnemy(type, t[0] * TS, t[1] * TS);
      if (type.startsWith('burrow')) { e.st = 'under'; e.wait = rnd.int(20, 140); }
      else e.spawnT = 18 + i * 6;
      this.addEnt(e);
    }
    let water = 0;
    for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] === T.WATER) water++;
    if (water >= 6 && (a.biome === 'L' || a.biome === 'C')) { const e = makeEnemy('snapjaw', 0, 0); e.wait = rnd.int(60, 160); this.addEnt(e); }
  },
  spawnRoomEnemies() {
    const room = this.area.room;
    let i = 0;
    for (const type of room.enemies) {
      if (type === 'coilworm2') {
        for (let k = 0; k < 2; k++) { const e = makeEnemy('coilworm2', 0, 0); e.x = 64 + k * 96; e.y = 64 + k * 24; e.hp = e.maxHp = Math.ceil(6 * (this.save.quest > 1 ? 1.5 : 1)); this.addEnt(e); }
        continue;
      }
      if (ENEMY_DEFS[type].boss) { this.addEnt(makeEnemy(type, 0, 0)); continue; }
      if (type === 'grabber') { const e = makeEnemy(type, 0, 0); e.wait = rnd.int(60, 200); this.addEnt(e); continue; }
      const t = randomFloorTile(48);
      if (!t) continue;
      const e = makeEnemy(type, t[0] * TS, t[1] * TS);
      e.spawnT = 10 + i++ * 4;
      this.addEnt(e);
    }
  },

  // -------------------------------------------------------------------------
  // events
  // -------------------------------------------------------------------------
  checkRoomClear() {
    const a = this.area;
    if (!a || a.kind !== 'dungeon') return;
    if (this.ents.some(e => e.tag === 'enemy' && !e.dead && !e.def.noCount)) return;
    if (this.dsession.cleared.has(a.rid)) return;
    this.dsession.cleared.add(a.rid);
    const room = a.room, ds = this.dstate(a.level);
    if (room.item && !ds.taken.includes(a.rid) && room.kind !== 'item' && !this.ents.some(e => e.tag === 'pickup' && e.dungeon)) {
      this.addEnt(this.dungeonPickup(room.item, 128, 88));
      Sound.sfx('key');
    }
    this.refreshDoors(a);
  },
  bossDefeated(e) {
    const a = this.area;
    Sound.sfx('bossdie');
    this.shake = 30;
    for (let i = 0; i < 6; i++) this.addEnt(makePuff(e.x + rnd.int(-8, e.w - 8), e.y + rnd.int(-8, e.h - 8)));
    if (a.kind !== 'dungeon') return;
    if (a.room.miniBoss) { rollDrop(e.x + 8, e.y + 8); this.checkRoomClear(); return; }
    if (this.ents.some(o => o.tag === 'enemy' && o.boss && !o.dead)) return;
    for (const o of this.ents) if (o.type === 'dhead') o.dead = true;
    const ds = this.dstate(a.level);
    ds.bossDead = true;
    this.ents = this.ents.filter(o => o.tag !== 'eproj');
    if (a.level < 9) this.addEnt(this.dungeonPickup('heart_container', clamp(e.x + e.w / 2, 48, 208), clamp(e.y + e.h / 2, 48, 128)));
    else this.toast('THE HOLLOW KING FALLS! FREE THE SAGE.', 200);
    Sound.music(a.level === 9 ? 'final' : 'dungeon');
    this.checkRoomClear();
    this.refreshDoors(a);
    this.saveGame();
  },
  explode(x, y) {
    const a = this.area;
    for (const e of this.ents) {
      if (e.tag !== 'enemy' || e.dead) continue;
      for (const pt of enemyParts(e)) if (dist(pt.x + pt.w / 2, pt.y + pt.h / 2, x, y) < 28) { damageEnemy(e, 4, { kind: 'bomb' }, pt.id, null); break; }
    }
    if (a.kind === 'over' && a.scr.entrance) {
      const en = a.scr.entrance;
      if (en.f.reveal === 'bomb' && !this.flag('rev:' + a.sx + ',' + a.sy) && dist(en.tx * TS + 8, en.ty * TS + 8, x, y) < 34) this.reveal();
    }
    if (a.kind === 'dungeon') {
      const ds = this.dstate(a.level);
      for (const dir of DIR_LIST) {
        const d = a.doors[dir];
        if (!d || d.state !== 'bombwall') continue;
        const [cx, cy] = DOOR_CENTER[dir];
        if (dist(cx, cy, x, y) < 40) { ds.bombed.push(d.ek); this.refreshDoors(a); Sound.jingle('secret'); Sound.sfx('crumble'); }
      }
    }
  },
  fireTouch(f) {
    const a = this.area;
    for (const e of this.ents) {
      if (e.tag !== 'enemy' || e.dead) continue;
      for (const pt of enemyParts(e)) if (overlap(f, pt)) { damageEnemy(e, 1, { kind: 'fire' }, pt.id, null); break; }
    }
    if (a.kind === 'over' && a.scr.entrance) {
      const en = a.scr.entrance;
      if (en.f.reveal === 'fire' && !this.flag('rev:' + a.sx + ',' + a.sy) && overlap({ x: f.x + 2, y: f.y + 2, w: 12, h: 12 }, { x: en.tx * TS, y: en.ty * TS, w: 16, h: 16 })) this.reveal();
    }
  },
  reveal() {
    const a = this.area;
    this.setFlag('rev:' + a.sx + ',' + a.sy);
    this.applyReveal(a, a.scr.entrance);
    Sound.jingle('secret');
    this.saveGame();
  },
  pushBlock(tx, ty, dir) {
    const a = this.area;
    if (a.kind === 'over') {
      const en = a.scr.entrance;
      if (en && en.f.reveal === 'push' && en.tx === tx && en.ty === ty && !this.flag('rev:' + a.sx + ',' + a.sy)) { Sound.sfx('push'); this.reveal(); }
      return;
    }
    if (a.kind === 'dungeon' && tileAt(tx, ty) === T.DPUSH) {
      const [dx, dy] = DIRS[dir];
      const nx = tx + dx, ny = ty + dy;
      if (nx < 2 || ny < 2 || nx > 13 || ny > 8 || tileAt(nx, ny) !== T.DFLOOR) return;
      setTile(tx, ty, T.DFLOOR);
      Sound.sfx('push');
      const blk = { tag: 'fx', x: tx * TS, y: ty * TS, t: 0, dead: false };
      blk.update = () => { blk.x += dx; blk.y += dy; if (++blk.t >= 16) { blk.dead = true; setTile(nx, ny, T.DBLOCK); } };
      blk.draw = () => drawSpr('tile_dblock', blk.x, blk.y + HUD_H, { pal: a.pal });
      this.addEnt(blk);
      this.dsession.pushed.add(a.rid);
      setTimeout(() => { if (this.area === a) { this.refreshDoors(a); Sound.jingle('secret'); } }, 300);
    }
  },
  tryDoor(tx, ty, dir) {
    const a = this.area;
    for (const d of DIR_LIST) {
      const door = a.doors[d];
      if (!door || door.state !== 'locked' || d !== dir) continue;
      if (!doorTiles(d).some(([x, y]) => x === tx && y === ty)) continue;
      if (this.save.keys <= 0) return false;
      this.save.keys--;
      this.dstate(a.level).unlocked.push(door.ek);
      Sound.sfx('unlock');
      this.refreshDoors(a);
      return true;
    }
    return false;
  },
  refillHearts(amount) { this.refillTo = Math.min(this.save.maxHearts * HEART, Math.max(this.refillTo, this.save.hp) + amount); },
  whistleDone() {
    const a = this.area, s = this.save;
    if (a.kind !== 'over') return;
    if (a.sx === WHISTLE_TARN.x && a.sy === WHISTLE_TARN.y && !this.flag('rev:' + a.sx + ',' + a.sy)) { this.reveal(); return; }
    const done = [];
    for (let l = 1; l <= 8; l++) if (s.dungeons[l] && s.dungeons[l].bossDead) done.push(l);
    if (!done.length) return;
    this.whistleIdx = (this.whistleIdx + 1) % done.length;
    const f = FEATURES.find(ff => ff.kind === 'dungeon' && ff.level === done[this.whistleIdx]);
    Sound.sfx('warp');
    this.fade(() => {
      const scr = World.screens[f.y][f.x], en = scr.entrance;
      this.goOverworld(f.x, f.y, en.tx * TS, (en.ty + 1) * TS + 2, 'down');
    });
  },
  grabbed() {
    if (this.trans) return;
    const p = this.player;
    p.state = 'frozen'; p.stateT = 60;
    Sound.sfx('fall');
    this.toast('THE HAND DRAGS YOU BACK!', 90);
    this.fade(() => this.enterDungeon(this.area.level, true));
  },
  playerDied() {
    const p = this.player;
    p.state = 'dead';
    this.state = 'dying'; this.stateT = 0;
    Sound.stopMusic(); Sound.lowHealth(false);
    Sound.sfx('fall');
  },

  // -------------------------------------------------------------------------
  // entering / leaving places
  // -------------------------------------------------------------------------
  fade(mid) { this.trans = { kind: 'fade', t: 0, dur: 40, mid }; },
  enterDungeon(level, fromRespawn) {
    const dg = getDungeon(level, this.save.quest);
    if (!this.dsession || this.dsession.level !== level || !fromRespawn) this.dsession = { level, cleared: new Set(), pushed: new Set() };
    this.save.resume = level;
    const p = this.player;
    const a = this.buildRoom(level, dg.start);
    p.state = 'auto'; p.stateT = 20; p.dir = 'up'; p.afterAuto = null;
    this.setArea(a, 120, 160, 'up');
    this.saveGame();
    this.toast(DUNGEON_DEFS[level].name, 120);
  },
  enterEntrance(ent) {
    const f = ent.f, p = this.player;
    if (f.kind === 'dungeon' && f.level === 9 && this.save.shards !== 255) {
      this.toast('THE SEAL HOLDS. BRING ALL EIGHT DAWN SHARDS.', 150);
      p.y += 10; p.dir = 'down';
      return;
    }
    Sound.sfx('stairs');
    p.state = 'frozen'; p.stateT = 40;
    const ret = { sx: this.area.sx, sy: this.area.sy, tx: ent.tx, ty: ent.ty };
    this.fade(() => {
      p.state = 'normal';
      if (f.kind === 'cave') this.setArea(this.buildCave(f.id, ret), 120, 140, 'up');
      else { this.dsession = null; this.enterDungeon(f.level); }
    });
  },
  exitToEntrance(sx, sy, tx, ty) {
    this.fade(() => {
      const scr = World.screens[sy][sx];
      let px = tx * TS, py = (ty + 1) * TS + 2;
      // whistle stairs & push stairs: step off to the side if below is blocked
      this.goOverworld(sx, sy, px, py, 'down');
      if (playerBlockedAt(pbox(this.player), null)) { this.player.y = ty * TS; this.player.x = tx * TS + 16; }
    });
  },
  exitDungeon() {
    const f = FEATURES.find(ff => ff.kind === 'dungeon' && ff.level === this.area.level);
    const en = World.screens[f.y][f.x].entrance;
    Sound.sfx('stairs');
    this.exitToEntrance(f.x, f.y, en.tx, en.ty);
  },
  startScroll(dir, toArea, after) {
    const p = this.player;
    this.ents = [];
    p.beamOut = false; p.discOut = false; p.atk = 0; p.kb = null;
    const from = this.area;
    renderAreaBg(toArea);
    const horiz = dir === 'left' || dir === 'right';
    const [dx, dy] = DIRS[dir];
    const fromX = p.x, fromY = p.y;
    const toX = dir === 'right' ? 0 : dir === 'left' ? SCREEN_W - TS : p.x;
    const toY = dir === 'down' ? -6 : dir === 'up' ? PLAY_H - TS : p.y;
    this.trans = { kind: 'scroll', dir, t: 0, dur: horiz ? 64 : 44, from, to: toArea, fromX, fromY, toX, toY, dx, dy, after };
  },

  // -------------------------------------------------------------------------
  // collecting things
  // -------------------------------------------------------------------------
  collect(pk) {
    if (pk.dead) return;
    const s = this.save, p = this.player;
    if (pk.cave) {
      const { id, def, it, i } = pk.cave;
      if (pk.denyT && this.t < pk.denyT) return;
      if (it.price > s.rupees) { Sound.sfx('error'); pk.denyT = this.t + 40; return; }
      if (it.item === 'bombs' && s.everBombs && s.bombs >= s.maxBombs) { Sound.sfx('error'); pk.denyT = this.t + 40; return; }
      if (it.item === 'potion' && s.potion >= 2) { Sound.sfx('error'); pk.denyT = this.t + 40; return; }
      s.rupees -= it.price;
      if (it.price) Sound.sfx('buy');
      if (def.choice) { this.setFlag('cave:' + id); for (const o of this.ents) if (o.cave) o.dead = true; }
      else if (!def.shop) this.setFlag('cave:' + id + ':' + i);
      else if (it.item === 'bombbag') this.setFlag('bombbag');
      const keepShop = def.shop && ['bombs', 'key', 'potion'].includes(it.item);
      if (!keepShop) pk.dead = true;
      this.gainItem(it.item, { amount: it.amount, major: !keepShop && it.item !== 'rupees' });
      if (!def.shop) this.text = null;
      this.saveGame();
      return;
    }
    pk.dead = true;
    if (pk.dungeon) {
      const ds = this.dstate(pk.dungeon.level);
      if (pk.kind === 'shard') {
        ds.shard = true;
        s.shards |= 1 << (pk.dungeon.level - 1);
        p.state = 'item'; p.stateT = 290; p.holdSpr = { spr: 'shard' };
        Sound.jingle('shard');
        this.refillTo = s.maxHearts * HEART;
        p.afterItem = () => this.exitDungeon();
        this.saveGame();
        return;
      }
      if (pk.kind === 'heart_container') ds.heart = true;
      else ds.taken.push(pk.dungeon.rid);
    }
    if (pk.onTake) pk.onTake();
    this.gainItem(pk.kind, { major: pk.major });
    if (pk.major || pk.dungeon) this.saveGame();
  },
  gainItem(kind, o = {}) {
    const s = this.save, p = this.player;
    const major = o.major;
    switch (kind) {
      case 'sword1': s.sword = Math.max(s.sword, 1); break;
      case 'sword2': s.sword = Math.max(s.sword, 2); break;
      case 'sword3': s.sword = 3; break;
      case 'shield': s.shield = 1; break;
      case 'ring1': s.ring = Math.max(s.ring, 1); break;
      case 'ring2': s.ring = 2; break;
      case 'bombs': case 'bomb': s.everBombs = true; s.bombs = Math.min(s.maxBombs, s.bombs + 4); if (!s.selB) s.selB = 'bombs'; break;
      case 'bombbag': s.maxBombs += 4; s.everBombs = true; s.bombs = s.maxBombs; if (!s.selB) s.selB = 'bombs'; break;
      case 'key': s.keys = Math.min(99, s.keys + 1); break;
      case 'potion': s.potion = Math.min(2, s.potion + 1); if (!s.selB) s.selB = 'potion'; break;
      case 'heart_container': s.maxHearts = Math.min(16, s.maxHearts + 1); this.refillTo = s.maxHearts * HEART; break;
      case 'rupees': s.rupees = Math.min(255, s.rupees + (o.amount || 0)); break;
      case 'rupee': s.rupees = Math.min(255, s.rupees + 1); break;
      case 'rupee5': s.rupees = Math.min(255, s.rupees + 5); break;
      case 'heart': s.hp = Math.min(s.maxHearts * HEART, s.hp + HEART); break;
      case 'fairy': this.refillHearts(3 * HEART); break;
      case 'clock': this.clockFreeze = true; break;
      case 'map': this.dstate(this.area.level).map = true; break;
      case 'compass': this.dstate(this.area.level).compass = true; break;
      case 'stararrow': s.items.stararrow = true; if (!s.selB || s.selB === 'bow') s.selB = 'bow'; break;
      default:
        if (kind in s.items) { s.items[kind] = true; if (!s.selB && B_ITEMS.includes(kind)) s.selB = kind; }
    }
    const minorSfx = { rupee: 'rupee', rupee5: 'rupee', heart: 'heart', key: 'key', bomb: 'item', bombs: 'item', fairy: 'fairy', clock: 'item', map: 'item', compass: 'item', rupees: 'rupee' };
    if (major) {
      const ii = ITEM_INFO[kind] || {};
      p.state = 'item'; p.stateT = 100; p.holdSpr = { spr: ii.spr || 'heart_container', pal: ii.pal };
      Sound.jingle('fanfare');
      if (ii.name && kind !== 'potion' && kind !== 'key') this.toast(ii.name, 100);
    } else Sound.sfx(minorSfx[kind] || 'item');
  },
  beginEnding() {
    if (this.state === 'ending') return;
    this.state = 'ending'; this.stateT = 0;
    Sound.lowHealth(false);
    Sound.music('ending');
    this.save.wins = (this.save.wins || 0) + 1;
    this.saveGame();
  },
};

const DOOR_CENTER = { up: [128, 16], down: [128, 160], left: [16, 88], right: [240, 88] };
function doorTiles(dir) {
  return { up: [[7, 0], [8, 0], [7, 1], [8, 1]], down: [[7, 9], [8, 9], [7, 10], [8, 10]], left: [[0, 5], [1, 5]], right: [[14, 5], [15, 5]] }[dir];
}

function makeNpc(spr, x, y, o = {}) {
  const e = { tag: 'npc', spr, x, y, w: 16, h: 16, t: rnd.int(0, 20), dead: false };
  e.update = () => { e.t++; };
  e.draw = () => {
    const by = e.bob ? Math.sin(e.t / 15) * 2 : 0;
    drawSpr(o.anim ? spr + '_' + ((e.t >> 3) & 1) : spr, e.x, e.y + by + HUD_H);
  };
  return e;
}

// ===========================================================================
// rendering helpers
// ===========================================================================
function tilePal(a, t) {
  if (a.kind === 'dungeon') return t === T.DWATER ? 'water' : a.pal;
  if (a.kind === 'cave') return 'rock_brown';
  const b = BIOMES[a.biome].pal;
  switch (t) {
    case T.TREE: return b.tree;
    case T.ROCK: case T.CRACK: case T.PROCK: case T.CAVE: return b.rock;
    case T.WATER: return 'water';
    case T.BUSH: case T.SBUSH: return 'bush_green';
    case T.GRAVE: return 'grave';
    case T.DOCK: case T.BRIDGE: return 'wood';
    case T.FLOWER: return 'red';
    case T.STAIRS: return 'rock_gray';
    default: return 'statue';
  }
}
function renderAreaBg(a) {
  if (!a.bg) { a.bg = document.createElement('canvas'); a.bg.width = SCREEN_W; a.bg.height = PLAY_H; }
  const g = a.bg.getContext('2d');
  const saved = ctx;
  ctx = g; // reuse drawSpr into the cache canvas
  g.imageSmoothingEnabled = false;
  g.fillStyle = a.floor; g.fillRect(0, 0, SCREEN_W, PLAY_H);
  const wf = (Game.t >> 5) & 1;
  a.wf = wf;
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const t = a.tiles[ty * COLS + tx];
    let spr = TILE_SPRITE[t];
    if (t === T.WATER) spr = 'tile_water_' + wf;
    if (t === T.DOOR && a.kind === 'over' && a.sx === 7 && a.sy === 0 && Game.save && Game.save.shards !== 255) spr = 'tile_seal';
    if (t === T.DWALL) spr = 'tile_dwall';
    if (t === T.DFLOOR) spr = 'tile_dfloor';
    if (!spr) continue;
    drawSpr(spr, tx * TS, ty * TS, { pal: tilePal(a, t) });
  }
  if (a.kind === 'dungeon') {
    const DSPR = { open: 'door_open', exit: 'door_open', locked: 'door_locked', shut: 'door_shut', bombed: 'door_bombed' };
    const POS = { up: [112, 0, 0], down: [112, 144, 2], left: [0, 72, 3], right: [224, 72, 1] };
    for (const dir of DIR_LIST) {
      const d = a.doors[dir];
      if (!d || !DSPR[d.state]) continue;
      const [x, y, rot] = POS[dir];
      drawSpr(DSPR[d.state], x, y, { pal: a.pal, rot });
    }
    // inner shadow line around the room
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(32, 32, 192, 2); g.fillRect(32, 32, 2, 112);
  }
  ctx = saved;
  a.dirty = false;
  a.hasWater = a.tiles.some(t => t === T.WATER);
}

let _darkCanvas = null;
function drawDarkness(px, py) {
  if (!_darkCanvas) { _darkCanvas = document.createElement('canvas'); _darkCanvas.width = SCREEN_W; _darkCanvas.height = PLAY_H; }
  const g = _darkCanvas.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, SCREEN_W, PLAY_H);
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.fillRect(0, 0, SCREEN_W, PLAY_H);
  g.globalCompositeOperation = 'destination-out';
  const gr = g.createRadialGradient(px, py, 10, px, py, 46);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, SCREEN_W, PLAY_H);
  ctx.drawImage(_darkCanvas, 0, HUD_H);
}

const LAYER = { pickup: 0, npc: 1, bomb: 2, enemy: 3, pproj: 5, arrow: 5, eproj: 6, fx: 7 };
function drawEnts() {
  const list = Game.ents.slice().sort((a, b) => (LAYER[a.tag] || 0) - (LAYER[b.tag] || 0));
  let playerDrawn = false;
  for (const e of list) {
    if (!playerDrawn && (LAYER[e.tag] || 0) >= 4) { drawPlayer(); playerDrawn = true; }
    e.draw();
  }
  if (!playerDrawn) drawPlayer();
}

// ===========================================================================
// HUD
// ===========================================================================
const MAP_COLORS = { G: '#7aa040', F: '#3c7c28', W: '#245018', M: '#8c5c2c', D: '#d8b060', L: '#3c78c8', C: '#c8b878', Y: '#7c7c8c' };
function drawHUD(y0 = 0) {
  const s = Game.save, a = Game.area;
  ctx.fillStyle = '#000'; ctx.fillRect(0, y0, SCREEN_W, HUD_H);
  ctx.fillStyle = '#1c1008'; ctx.fillRect(0, y0 + HUD_H - 3, SCREEN_W, 3);
  // hearts (left)
  drawText('HEARTS', 8, y0 + 6, '#fc7460');
  for (let i = 0; i < s.maxHearts; i++) {
    const v = s.hp - i * HEART;
    const spr = v >= HEART ? 'heart_full' : v > 0 ? 'heart_half' : 'heart_empty';
    drawSpr(spr, 8 + (i % 8) * 9, y0 + (i < 8 ? 18 : 28));
  }
  // counters (left, bottom row)
  drawSpr('icon_rupee', 8, y0 + 44); drawText(String(s.rupees).padStart(3, '0'), 17, y0 + 44, '#fcfcfc');
  drawSpr('icon_key', 46, y0 + 44); drawText(String(s.keys), 55, y0 + 44, '#fcfcfc');
  drawSpr('icon_bomb', 76, y0 + 44); drawText(String(s.bombs), 85, y0 + 44, '#fcfcfc');
  // item slots (middle)
  const slot = (x, label) => {
    ctx.fillStyle = '#20140c'; ctx.fillRect(x, y0 + 16, 26, 30);
    ctx.strokeStyle = '#b8742c'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y0 + 16.5, 25, 29);
    drawTextC(label, x + 13, y0 + 6, '#b8742c');
  };
  slot(112, 'X'); slot(144, 'Z');
  if (s.selB) drawBItemIcon(s.selB, 125, y0 + 31);
  if (s.sword) drawSpr('sword', 153, y0 + 23, { pal: 'sword' + s.sword });
  // map (right)
  const mx = 184, my = y0 + 16;
  if (a && a.kind === 'dungeon') {
    const ds = Game.dstate(a.level), dg = a.dg;
    drawText('LEVEL ' + a.level, mx, y0 + 6, '#fcd8a8');
    for (const r of dg.rooms.values()) {
      const seen = ds.visited.includes(r.id);
      if (!seen && !ds.map) continue;
      ctx.fillStyle = seen ? '#c8a060' : '#5c4428';
      ctx.fillRect(mx + r.x * 8, my + r.y * 5 - 6, 7, 4);
    }
    if (ds.compass && !ds.shard && (Game.t >> 4) & 1) { const sr = dg.rooms.get(dg.shardRoom); ctx.fillStyle = '#f83800'; ctx.fillRect(mx + sr.x * 8 + 2, my + sr.y * 5 - 5, 3, 2); }
    if ((Game.t >> 3) & 1) { ctx.fillStyle = '#fcfcfc'; ctx.fillRect(mx + a.room.x * 8 + 2, my + a.room.y * 5 - 5, 3, 2); }
  } else {
    drawText('VELLMOOR', mx, y0 + 6, '#fcd8a8');
    const seen = s.seen || {};
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      ctx.fillStyle = seen[x + ',' + y] ? MAP_COLORS[REGION[y][x]] : '#241a12';
      ctx.fillRect(mx + x * 4, my + y * 4, 4, 4);
    }
    const sx = a ? (a.kind === 'cave' ? a.ret.sx : a.sx) : 7, sy = a ? (a.kind === 'cave' ? a.ret.sy : a.sy) : 6;
    if ((Game.t >> 3) & 1) { ctx.fillStyle = '#fcfcfc'; ctx.fillRect(mx + sx * 4 + 1, my + sy * 4 + 1, 2, 2); }
  }
}
function drawBItemIcon(it, cx, cy) {
  const s = Game.save;
  const spr = { disc: 'disc_item', bombs: 'bomb', bow: s.items.stararrow ? 'star_arrow' : 'bow', lantern: 'lantern', whistle: 'whistle', potion: 'potion', wand: 'wand' }[it];
  const pal = it === 'wand' ? 'magic' : it === 'potion' && s.potion === 1 ? 'blue' : undefined;
  const img = getSprite(spr, pal);
  drawSpr(spr, cx - img.width / 2, cy - img.height / 2, { pal });
}

// ===========================================================================
// state: play
// ===========================================================================
function updatePlay() {
  const p = Game.player, s = Game.save, a = Game.area;
  if (Game.trans) { updateTrans(); return; }
  if (Input.pressed.start && p.state === 'normal' && p.atk === 0) { Game.state = 'menu'; Sound.sfx('menu'); Game.menuSel = Math.max(0, B_ITEMS.indexOf(s.selB)); return; }
  if (Game.toastMsg && --Game.toastMsg.t <= 0) Game.toastMsg = null;
  if (Game.shake > 0) { Game.shake--; Game.shakeX = Game.shake ? rnd.int(-2, 2) : 0; } else Game.shakeX = 0;
  // refilling hearts
  if (Game.refillTo > s.hp) { if (Game.t % 2 === 0) { s.hp = Math.min(Game.refillTo, s.hp + 4); if (Game.t % 8 === 0) Sound.sfx('refill'); } }
  else Game.refillTo = 0;
  Sound.lowHealth(s.hp > 0 && s.hp <= HEART);
  // text typing freezes the action
  if (Game.text && !Game.text.done) {
    if (Game.t % 3 === 0) { Game.text.n++; Sound.sfx('text'); if (Game.text.n >= Game.text.lines.join('').length) Game.text.done = true; }
    if (Input.pressed.a || Input.pressed.b) { Game.text.n = 9999; Game.text.done = true; }
    return;
  }
  if (Game.whistleT > 0 && --Game.whistleT === 0) Game.whistleDone();
  updatePlayer();
  for (const e of Game.ents) if (!e.dead) e.update();
  collisions();
  Game.ents = Game.ents.filter(e => !e.dead);
  if (Game.state !== 'play' || Game.trans) return;
  checkTriggers();
  checkExits();
  // fairy fountain
  if (a.kind === 'over' && a.scr.fairy) {
    const [cx, cy] = pcenter(p);
    if (dist(cx, cy, a.scr.fairy.x, a.scr.fairy.y + 40) < 28 && s.hp < s.maxHearts * HEART && !Game.refillTo) { Game.refillHearts(s.maxHearts * HEART); Sound.sfx('fairy'); }
  }
}

function collisions() {
  const p = Game.player, s = Game.save, pb = pbox(p);
  const enemies = Game.ents.filter(e => e.tag === 'enemy' && !e.dead);
  // sword
  if (p.atk > 2 && p.atk <= 12 && p.atkKind === 'sword') {
    const sb = swordBox(p);
    for (const e of enemies) for (const pt of enemyParts(e)) if (overlap(sb, pt)) { damageEnemy(e, SWORD_DMG[s.sword], { kind: 'sword' }, pt.id, p.dir); break; }
  }
  // player projectiles
  for (const pr of Game.ents) {
    if ((pr.tag !== 'pproj' && pr.tag !== 'arrow') || pr.dead || pr.kind === 'fire' || pr.stuck) continue;
    for (const e of enemies) {
      if (e.dead || (pr.hitSet && pr.hitSet.has(e))) continue;
      let hit = false;
      for (const pt of enemyParts(e)) if (overlap(pr, pt)) {
        const sd = pr.dir || (Math.abs(pr.vx) > Math.abs(pr.vy) ? (pr.vx < 0 ? 'left' : 'right') : (pr.vy < 0 ? 'up' : 'down'));
        hit = damageEnemy(e, pr.dmg, pr, pt.id, sd);
        break;
      }
      if (hit) { (pr.hitSet = pr.hitSet || new Set()).add(e); if (pr.onHit) pr.onHit(e); if (pr.dead || pr.kind !== 'star') break; }
    }
    if (pr.kind === 'disc') for (const pk of Game.ents) if (pk.tag === 'pickup' && !pk.dead && !pk.cave && !pk.carried && overlap(pr, pk)) { pk.carried = true; pr.carry.push(pk); pr.back = true; }
  }
  if (p.state === 'dead' || p.state === 'item') return;
  // enemies touching player
  for (const e of enemies) {
    if (e.spawnT > 0 || e.intangible || e.dead) continue;
    for (const pt of enemyParts(e)) if (overlap(pb, pt)) {
      if (e.def.grab) { Game.grabbed(); return; }
      playerHurt(e.dmg, pt.x + pt.w / 2, pt.y + pt.h / 2);
      break;
    }
  }
  // enemy projectiles
  for (const ep of Game.ents) {
    if (ep.tag !== 'eproj' || ep.dead || !overlap(pb, ep)) continue;
    const pd = Math.abs(ep.vx) > Math.abs(ep.vy) ? (ep.vx < 0 ? 'left' : 'right') : (ep.vy < 0 ? 'up' : 'down');
    const canBlock = ep.kind === 'small' || (s.shield && (ep.kind === 'big' || ep.kind === 'magic'));
    if (canBlock && p.state === 'normal' && p.atk === 0 && p.dir === OPP[pd]) { Sound.sfx('shield'); ep.dead = true; Game.addEnt(makeSparkFx(ep.x, ep.y)); }
    else { playerHurt(ep.dmg, ep.x + ep.w / 2, ep.y + ep.h / 2); if (ep.spr !== 'disc_0' && ep.spr !== 'disc_1') ep.dead = true; }
  }
  // pickups & npcs
  for (const pk of Game.ents) {
    if (pk.dead) continue;
    if (pk.tag === 'pickup' && !pk.carried && overlap(pb, { x: pk.x, y: pk.y, w: pk.w, h: pk.h })) Game.collect(pk);
    else if (pk.tag === 'npc' && pk.onTouch && overlap(pb, { x: pk.x - 4, y: pk.y, w: 24, h: 24 })) pk.onTouch();
  }
}

function checkTriggers() {
  const p = Game.player, a = Game.area;
  if (p.state !== 'normal' || a.kind !== 'over') return;
  const cx = p.x + 8, cy = p.y + 8;
  const tx = Math.floor(cx / TS), ty = Math.floor(cy / TS);
  const t = tileAt(tx, ty);
  if (!TRIGGERS.has(t)) return;
  const en = a.scr.entrance;
  if (en && en.tx === tx && en.ty === ty) Game.enterEntrance(en);
}

function checkExits() {
  const p = Game.player, a = Game.area;
  if (p.state !== 'normal' && p.state !== 'raft') return;
  const b = pbox(p);
  let dir = null;
  if (b.x < 0) dir = 'left'; else if (b.x + b.w > SCREEN_W) dir = 'right'; else if (b.y < 0) dir = 'up'; else if (b.y + b.h > PLAY_H) dir = 'down';
  if (!dir) return;
  if (p.state === 'raft') p.state = 'normal';
  if (a.kind === 'over') {
    let tx = a.sx + DIRS[dir][0], ty = a.sy + DIRS[dir][1];
    if (a.sx === TANGLEWOOD.x && a.sy === TANGLEWOOD.y && dir !== TANGLEWOOD.exitBack) {
      const seq = TANGLEWOOD.seq;
      if (dir === seq[Game.woodsProg]) Game.woodsProg++;
      else Game.woodsProg = dir === seq[0] ? 1 : 0;
      if (Game.woodsProg >= seq.length) { Game.woodsProg = 0; tx = TANGLEWOOD.dest.x; ty = TANGLEWOOD.dest.y; Sound.jingle('secret'); }
      else { tx = a.sx; ty = a.sy; }
    } else if (!(a.sx === TANGLEWOOD.x && a.sy === TANGLEWOOD.y)) Game.woodsProg = 0;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) { p.x = clamp(p.x, 0, SCREEN_W - 16); p.y = clamp(p.y, 0, PLAY_H - 16); return; }
    Game.startScroll(dir, Game.buildOver(tx, ty));
  } else if (a.kind === 'cave') {
    if (dir === 'down') { const r = a.ret; Game.exitToEntrance(r.sx, r.sy, r.tx, r.ty); p.state = 'frozen'; p.stateT = 30; }
  } else if (a.kind === 'dungeon') {
    const d = a.doors[dir];
    if (d && d.state === 'exit') { p.state = 'frozen'; p.stateT = 30; Game.save.resume = 0; Game.exitDungeon(); return; }
    if (!d || !d.nid && d.nid !== 0) return;
    const na = Game.buildRoom(a.level, d.nid);
    // keep the entry doorway open while walking in
    const back = OPP[dir];
    for (const [x, y] of doorTiles(back)) na.tiles[y * COLS + x] = T.DFLOOR;
    Game.startScroll(dir, na, () => {
      p.state = 'auto'; p.dir = dir; p.stateT = 34;
      p.afterAuto = () => { if (Game.area === na) Game.refreshDoors(na); };
    });
  }
}

function updateTrans() {
  const tr = Game.trans, p = Game.player;
  tr.t++;
  if (tr.kind === 'scroll') {
    const q = tr.t / tr.dur;
    p.x = tr.fromX + (tr.toX + tr.dx * SCREEN_W - tr.fromX) * q - tr.dx * SCREEN_W * q;
    p.y = tr.fromY + (tr.toY + tr.dy * PLAY_H - tr.fromY) * q - tr.dy * PLAY_H * q;
    p.step++;
    if (tr.t >= tr.dur) {
      Game.trans = null;
      Game.area = tr.to; p.x = tr.toX; p.y = tr.toY;
      Game.ents = [];
      Game.populate();
      if (tr.after) tr.after();
    }
  } else if (tr.kind === 'fade') {
    if (tr.t === tr.dur / 2) tr.mid();
    if (tr.t >= tr.dur) Game.trans = null;
  }
}

function renderPlay() {
  const a = Game.area, tr = Game.trans, p = Game.player;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  if (tr && tr.kind === 'scroll') {
    const q = tr.t / tr.dur;
    if (tr.from.dirty || !tr.from.bg) renderAreaBg(tr.from);
    const ox = -tr.dx * SCREEN_W * q, oy = -tr.dy * PLAY_H * q;
    ctx.drawImage(tr.from.bg, ox, oy + HUD_H);
    ctx.drawImage(tr.to.bg, ox + tr.dx * SCREEN_W, oy + tr.dy * PLAY_H + HUD_H);
    drawPlayer();
  } else {
    if (a.dirty || !a.bg || (a.hasWater && ((Game.t >> 5) & 1) !== a.wf)) renderAreaBg(a);
    ctx.drawImage(a.bg, Game.shakeX, HUD_H);
    drawEnts();
    if (a.kind === 'dungeon' && a.dark && !a.lit) drawDarkness(p.x + 8, p.y + 8);
    // cave / hint text
    if (Game.text) {
      let n = Game.text.n;
      Game.text.lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, n)); n -= ln.length; drawTextC(part, 128, HUD_H + 24 + i * 10, '#fcfcfc'); });
    }
  }
  if (Game.toastMsg) {
    const L = Game.toastMsg.lines, h = L.length * 10 + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(8, SCREEN_H - h - 8, 240, h);
    L.forEach((ln, i) => drawTextC(ln, 128, SCREEN_H - h - 4 + i * 10, '#fcd8a8'));
  }
  drawHUD();
  if (tr && tr.kind === 'fade') {
    const h = tr.dur / 2;
    ctx.fillStyle = `rgba(0,0,0,${tr.t < h ? tr.t / h : (tr.dur - tr.t) / h})`;
    ctx.fillRect(0, HUD_H, SCREEN_W, PLAY_H);
  }
}

// ===========================================================================
// state: pause menu (subscreen)
// ===========================================================================
const MENU_SLOTS = [[96, 100], [120, 100], [144, 100], [168, 100], [96, 124], [120, 124], [144, 124], [168, 124]];
function updateMenu() {
  const s = Game.save;
  if (Input.pressed.start) { Game.state = 'play'; Sound.sfx('menu'); return; }
  if (Input.pressed.select) { Game.saveGame(); Game.toTitle(); return; }
  const owned = B_ITEMS.map((it, i) => ownsB(it) ? i : -1).filter(i => i >= 0);
  if (!owned.length) return;
  let cur = owned.indexOf(B_ITEMS.indexOf(s.selB));
  if (cur < 0) cur = 0;
  if (Input.pressed.right || Input.pressed.down) { cur = (cur + 1) % owned.length; Sound.sfx('cursor'); }
  if (Input.pressed.left || Input.pressed.up) { cur = (cur - 1 + owned.length) % owned.length; Sound.sfx('cursor'); }
  s.selB = B_ITEMS[owned[cur]];
}
function renderMenu() {
  const s = Game.save, a = Game.area;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawHUD(SCREEN_H - HUD_H);
  const Y = 0;
  drawText('INVENTORY', 24, Y + 12, '#d82800');
  ctx.strokeStyle = '#2038ec'; ctx.lineWidth = 2;
  ctx.strokeRect(24, Y + 26, 40, 40); ctx.strokeRect(84, Y + 26, 112, 60);
  if (s.selB) drawBItemIcon(s.selB, 44, Y + 46);
  drawText('USE B', 26, Y + 70, '#a0a0a0');
  B_ITEMS.forEach((it, i) => {
    if (!ownsB(it)) return;
    const [x, y] = MENU_SLOTS[i];
    drawBItemIcon(it, x, y - 64 + Y);
    if (it === 'potion') drawText(String(s.potion), x + 4, y - 60 + Y, '#fcfcfc');
    if (s.selB === it && (Game.t >> 3) & 1) { ctx.strokeStyle = '#fc9838'; ctx.strokeRect(x - 10, y - 74 + Y, 20, 20); }
  });
  // passive items
  drawText('TREASURES', 24, Y + 96, '#d82800');
  const passive = [];
  if (s.sword) passive.push(['sword', 'sword' + s.sword]);
  if (s.shield) passive.push(['shield_tower']);
  if (s.ring) passive.push(['ring', s.ring === 2 ? 'red' : 'blue']);
  if (s.items.raft) passive.push(['raft']);
  if (s.items.ladder) passive.push(['ladder']);
  if (s.items.book) passive.push(['book']);
  if (s.items.stararrow) passive.push(['star_arrow']);
  if (s.maxBombs > 8) passive.push(['bombbag']);
  passive.forEach(([spr, pal], i) => { const img = getSprite(spr, pal); drawSpr(spr, 32 + i * 24 + 8 - img.width / 2, Y + 108 + 8 - img.height / 2, { pal }); });
  // shards
  drawText('DAWN SHARDS', 24, Y + 130, '#d82800');
  for (let i = 0; i < 8; i++) drawSpr('shard', 32 + i * 24, Y + 142, { alpha: s.shards & (1 << i) ? 1 : 0.18 });
  if (a.kind === 'dungeon') {
    const ds = Game.dstate(a.level), nm = DUNGEON_DEFS[a.level].name;
    drawText(nm, 232 - nm.length * 8, Y + 12, '#fcd8a8');
    if (ds.map) drawSpr('map', 210, Y + 96);
    if (ds.compass) drawSpr('compass', 226, Y + 96);
  }
  drawTextC('ENTER RESUME  SHIFT SAVE+QUIT', 128, 164, '#7c7c7c');
}

// ===========================================================================
// title, file select, name entry, game over, ending
// ===========================================================================
Game.toTitle = function () {
  Sound.lowHealth(false);
  this.state = 'title'; this.stateT = 0; this.save = null; this.area = null; this.ents = [];
  Sound.music('title');
};

function drawSky(t) {
  const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, '#0c0830'); g.addColorStop(0.55, '#5c1848'); g.addColorStop(0.8, '#e86830'); g.addColorStop(1, '#fcd070');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // stars
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % SCREEN_W, y = (i * 53) % 110;
    if (((t >> 4) + i) % 7) { ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x, y, 1, 1); }
  }
  // rising dawn
  ctx.fillStyle = 'rgba(252,216,120,0.8)';
  ctx.beginPath(); ctx.arc(128, 200, 38 + Math.sin(t / 40) * 2, 0, Math.PI * 2); ctx.fill();
  // mountains
  ctx.fillStyle = '#1c0c1c';
  ctx.beginPath(); ctx.moveTo(0, 240);
  const peaks = [[0, 190], [30, 160], [60, 185], [100, 140], [128, 120], [156, 140], [190, 175], [220, 150], [256, 180], [256, 240]];
  for (const [x, y] of peaks) ctx.lineTo(x, y);
  ctx.fill();
  // the hollow crown silhouette on the peak
  ctx.fillStyle = '#3c1450';
  ctx.fillRect(118, 108, 20, 6); ctx.fillRect(118, 100, 4, 8); ctx.fillRect(126, 96, 4, 12); ctx.fillRect(134, 100, 4, 8);
}

function updateTitle() {
  Game.stateT++;
  if (Input.pressed.start || Input.pressed.a) { Game.state = 'select'; Game.selSlot = 0; Sound.sfx('menu'); Game.eraseArm = -1; }
}
function renderTitle() {
  const t = Game.stateT;
  drawSky(t);
  const phase = Math.floor(t / 900) % 2;
  if (phase === 0 || t < 900) {
    drawTextShadow('THE', 116, 36, '#fcd8a8');
    drawTextShadow('HOLLOW', 128 - 6 * 8, 48, '#fcfcfc', 2);
    drawTextShadow('CROWN', 128 - 5 * 8, 68, '#fcfcfc', 2);
    drawTextC('SHARDS OF THE DAWNSTONE', 128, 92, '#fc9838');
    drawSpr('shard', 120, 112 + Math.sin(t / 20) * 3);
    if ((t >> 5) & 1) drawTextC('PRESS ENTER', 128, 214, '#fcfcfc');
    drawTextC('(C) 2026 AN ORIGINAL GAME', 128, 228, '#a07070');
  } else {
    const off = (t % 900) * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    STORY.forEach((ln, i) => { const y = 240 - off + i * 12; if (y > -10 && y < 240) drawTextC(ln, 128, y, '#fcfcfc'); });
  }
}

function updateSelect() {
  if (Input.pressed.down) { Game.selSlot = (Game.selSlot + 1) % 3; Sound.sfx('cursor'); Game.eraseArm = -1; }
  if (Input.pressed.up) { Game.selSlot = (Game.selSlot + 2) % 3; Sound.sfx('cursor'); Game.eraseArm = -1; }
  const sl = Game.slots[Game.selSlot];
  if (Input.pressed.b && sl) {
    if (Game.eraseArm === Game.selSlot) { Game.slots[Game.selSlot] = null; Game.writeSlots(); Sound.sfx('bomb'); Game.eraseArm = -1; }
    else { Game.eraseArm = Game.selSlot; Sound.sfx('error'); }
    return;
  }
  if (Input.pressed.start || Input.pressed.a) {
    Sound.sfx('menu');
    if (!sl) { Game.state = 'name'; Game.nameBuf = ''; Input.typed.length = 0; }
    else Game.startGame(Game.selSlot);
  }
}
function renderSelect() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawTextC('- SELECT A FILE -', 128, 24, '#fcd8a8');
  for (let i = 0; i < 3; i++) {
    const y = 56 + i * 44, sl = Game.slots[i];
    ctx.strokeStyle = i === Game.selSlot ? '#fc9838' : '#2038ec'; ctx.lineWidth = 2; ctx.strokeRect(24, y - 8, 208, 36);
    drawText((i + 1) + '.', 32, y, '#fcfcfc');
    if (!sl) { drawText('- NEW ADVENTURE -', 56, y + 6, '#7c7c7c'); continue; }
    drawSpr('hero_down_0', 54, y - 4, { pal: sl.ring === 2 ? 'hero_red' : sl.ring === 1 ? 'hero_blue' : 'hero' });
    drawText(sl.name, 76, y, '#fcfcfc');
    if (sl.quest > 1) drawText('QUEST 2', 160, y, '#fc9838');
    for (let h = 0; h < sl.maxHearts; h++) drawSpr('heart_full', 76 + (h % 8) * 8, y + 10 + (h >= 8 ? 8 : 0));
    let sh = 0; for (let k = 0; k < 8; k++) if (sl.shards & (1 << k)) sh++;
    drawText(sh + '/8 #', 160, y + 12, '#fcd8a8');
    if (Game.eraseArm === i) drawText('PRESS X AGAIN TO ERASE', 40, y + 22, '#f83800');
  }
  drawTextC('ENTER: PLAY    X: ERASE', 128, 196, '#a0a0a0');
  drawTextC('ARROWS MOVE  Z SWORD  X ITEM', 128, 212, '#7c7c7c');
  drawTextC('ENTER MENU  M MUTE', 128, 224, '#7c7c7c');
}

function updateName() {
  for (const ch of Input.typed) {
    if (ch === '\b') Game.nameBuf = Game.nameBuf.slice(0, -1);
    else if (ch === '\n') { finishName(); return; }
    else if (/^[a-z0-9 ]$/i.test(ch) && Game.nameBuf.length < 8) { Game.nameBuf += ch.toUpperCase(); Sound.sfx('text'); }
  }
  if (Input.pressed.start && !Input._kb.start) finishName(); // gamepad/touch start
  if (Input.pressed.select) { Game.state = 'select'; }
}
function finishName() {
  const name = Game.nameBuf.trim() || 'WREN';
  Game.slots[Game.selSlot] = newSave(name, 1);
  Game.writeSlots();
  Sound.sfx('menu');
  Game.startGame(Game.selSlot);
}
function renderName() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawTextC('- NAME YOUR WANDERER -', 128, 48, '#fcd8a8');
  ctx.strokeStyle = '#2038ec'; ctx.lineWidth = 2; ctx.strokeRect(64, 84, 128, 24);
  drawText(Game.nameBuf + ((Game.t >> 4) & 1 ? '_' : ''), 76, 92, '#fcfcfc');
  drawTextC('TYPE A NAME, THEN ENTER', 128, 132, '#a0a0a0');
  drawTextC('(BLANK = WREN)', 128, 146, '#7c7c7c');
}

function updateDying() {
  const p = Game.player;
  Game.stateT++;
  if (Game.stateT < 64) { if (Game.stateT % 4 === 0) p.dir = ['down', 'left', 'up', 'right'][(Game.stateT >> 2) % 4]; }
  else if (Game.stateT === 64) { p.hidden = false; }
  if (Game.stateT > 130) { Game.state = 'gameover'; Game.goSel = 0; Sound.music('gameover'); }
}
function renderDying() {
  renderPlay();
  const q = Math.min(1, Game.stateT / 60);
  ctx.fillStyle = `rgba(120,0,0,${q * 0.6})`; ctx.fillRect(0, HUD_H, SCREEN_W, PLAY_H);
  if (Game.stateT > 64) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (Game.stateT - 64) / 40)})`; ctx.fillRect(0, HUD_H, SCREEN_W, PLAY_H); drawSpr('hero_dead', Game.player.x, Game.player.y + HUD_H, { pal: heroPal() }); }
}
function updateGameOver() {
  if (Input.pressed.down || Input.pressed.up) { Game.goSel = (Game.goSel + 1) % 2; Sound.sfx('cursor'); }
  if (Input.pressed.start || Input.pressed.a) {
    const s = Game.save;
    s.deaths++;
    s.hp = Math.min(s.maxHearts, 3) * HEART;
    Game.saveGame();
    if (Game.goSel === 0) Game.respawn(); else Game.toTitle();
  }
}
function renderGameOver() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawTextC('GAME OVER', 128, 80, '#d82800', 2);
  ['CONTINUE', 'SAVE AND QUIT'].forEach((t, i) => { drawText(t, 88, 128 + i * 20, '#fcfcfc'); if (i === Game.goSel) drawSpr('heart_full', 72, 128 + i * 20); });
}

function updateEnding() {
  Game.stateT++;
  if (Game.stateT > 1500 && (Input.pressed.start || Input.pressed.a)) {
    const prev = Game.save;
    Game.slots[Game.slot] = newSave(prev.name, 2, prev);
    Game.writeSlots();
    Game.toTitle();
  }
}
function renderEnding() {
  const t = Game.stateT;
  drawSky(t + 2000);
  if (t < 700) {
    const q = Math.min(1, t / 120);
    ctx.fillStyle = `rgba(0,0,0,${0.6 * q})`; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawSpr('npc_sage', 136, 150); drawSpr('hero_item', 104, 150, { pal: heroPal() }); drawSpr('shard', 104, 134 - Math.sin(t / 20) * 2);
    ENDING_TEXT.forEach((ln, i) => { if (t > 60 + i * 30) drawTextC(ln, 128, 24 + i * 11, '#fcfcfc'); });
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const off = (t - 700) * 0.45;
    CREDITS.forEach((ln, i) => { const y = 240 - off + i * 14; if (y > -10 && y < 240) drawTextC(ln, 128, y, i === 0 ? '#fcd8a8' : '#fcfcfc'); });
    if (t > 1500) {
      drawTextC('THE END', 128, 100, '#fcd8a8', 2);
      drawTextC('DEATHS: ' + Game.save.deaths, 128, 140, '#fcfcfc');
      if ((t >> 5) & 1) drawTextC('PRESS ENTER: SECOND QUEST', 128, 200, '#fc9838');
    }
  }
}

// ===========================================================================
// main loop
// ===========================================================================
function step() {
  updateInput();
  Game.t++;
  switch (Game.state) {
    case 'title': updateTitle(); break;
    case 'select': updateSelect(); break;
    case 'name': updateName(); break;
    case 'play': updatePlay(); break;
    case 'menu': updateMenu(); break;
    case 'dying': updateDying(); break;
    case 'gameover': updateGameOver(); break;
    case 'ending': updateEnding(); break;
  }
  Input.typed.length = 0;
}
function render() {
  switch (Game.state) {
    case 'title': renderTitle(); break;
    case 'select': renderSelect(); break;
    case 'name': renderName(); break;
    case 'play': renderPlay(); break;
    case 'menu': renderMenu(); break;
    case 'dying': renderDying(); break;
    case 'gameover': renderGameOver(); break;
    case 'ending': renderEnding(); break;
  }
  if (Sound.muted) drawText('MUTE', 220, 2, '#7c7c7c');
}

function boot() {
  initCanvas();
  setupTouch();
  buildWorld();
  Game.loadSlots();
  onFirstInput = () => { Sound.init(); if (Game.state === 'title' && !Sound.current) Sound.music('title'); };
  Sound.music('title');
  let last = performance.now(), acc = 0;
  const frame = now => {
    acc += Math.min(100, now - last); last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4) {
      try { step(); } catch (err) { console.error(err); }
      acc -= 1000 / 60; n++;
    }
    try { render(); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__hc = Game;
  // debug/test hook: advance n frames synchronously (holding the given buttons)
  window.__run = (n, keys = []) => { keys.forEach(k => Input._kb[k] = true); for (let i = 0; i < n; i++) step(); keys.forEach(k => Input._kb[k] = false); render(); return Game.state; };
}
window.addEventListener('load', boot);
