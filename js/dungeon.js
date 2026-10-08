// ============================================================================
// THE HOLLOW CROWN — dungeon generation
// Lock/key placement rule: the key for each locked door is placed inside the
// lock-free component that contains the door's near side. That guarantees the
// player always holds at least one key whenever any locked door is reachable,
// whatever order doors are opened in, so a dungeon can never soft-lock.
// ============================================================================
'use strict';

const DGW = 8, DGH = 8;
const _dungeonCache = {};

function getDungeon(level, quest) {
  const k = level + ':' + quest;
  if (!_dungeonCache[k]) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const d = genDungeon(level, quest, attempt);
      if (d) { _dungeonCache[k] = d; break; }
    }
  }
  return _dungeonCache[k];
}

function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function ridx(x, y) { return y * DGW + x; }

function genDungeon(level, quest, attempt) {
  const def = DUNGEON_DEFS[level];
  const rng = makeRng((level * 7919 + quest * 104729 + attempt * 31337 + 99) >>> 0);
  const rooms = new Map();
  const mk = (x, y, parent) => {
    const r = { x, y, id: ridx(x, y), parent, children: [], depth: parent ? parent.depth + 1 : 0, kind: 'normal', item: null, enemies: [], template: 0, dark: false, pushOpen: false, traps: false };
    rooms.set(r.id, r);
    if (parent) parent.children.push(r);
    return r;
  };
  const start = mk(rng.int(2, 5), DGH - 1, null);
  start.kind = 'start';
  const list = [start];
  const target = def.rooms + (quest > 1 ? 4 : 0);
  let guard = 0;
  while (rooms.size < target && guard++ < 20000) {
    const r = rng.chance(0.55) ? list[list.length - 1 - rng.int(0, Math.min(5, list.length - 1))] : rng.pick(list);
    const d = rng.pick(['up', 'up', 'left', 'right', 'down']);
    if (r === start && d !== 'up') continue;
    const nx = r.x + DIRS[d][0], ny = r.y + DIRS[d][1];
    if (nx < 0 || ny < 0 || nx >= DGW || ny >= DGH || rooms.has(ridx(nx, ny))) continue;
    if (r.children.length >= 3) continue;
    list.push(mk(nx, ny, r));
  }
  if (rooms.size < target) return null;

  const edges = new Map();
  for (const r of rooms.values()) if (r.parent) edges.set(edgeKey(r.id, r.parent.id), { type: 'open', tree: true, near: r.parent.id, far: r.id });

  // boss = deepest leaf with an empty neighbor for the shard/sage room
  const leaves = [...rooms.values()].filter(r => r.children.length === 0 && r !== start).sort((a, b) => b.depth - a.depth);
  let boss = null, shardPos = null;
  for (const l of leaves) {
    if (l.depth < 3) break;
    for (const d of rng.shuffle(['up', 'left', 'right'])) {
      const nx = l.x + DIRS[d][0], ny = l.y + DIRS[d][1];
      if (nx >= 0 && ny >= 0 && nx < DGW && ny < DGH && !rooms.has(ridx(nx, ny))) { boss = l; shardPos = [nx, ny]; break; }
    }
    if (boss) break;
  }
  if (!boss) return null;
  boss.kind = 'boss';
  const shard = mk(shardPos[0], shardPos[1], boss);
  shard.kind = level === 9 ? 'sage' : 'shard';
  edges.set(edgeKey(shard.id, boss.id), { type: 'open', tree: true, near: boss.id, far: shard.id });

  // dungeon treasure room: deepest other leaf (or deepest room)
  const others = [...rooms.values()].filter(r => r.kind === 'normal').sort((a, b) => b.depth - a.depth);
  const itemRoom = others.find(r => r.children.length === 0) || others[0];
  itemRoom.kind = 'item';
  itemRoom.item = def.item;

  // extra connections (loops): open doors or hidden bombable walls
  const special = r => r.kind === 'start' || r.kind === 'boss' || r.kind === 'shard' || r.kind === 'sage';
  for (const r of rooms.values()) {
    for (const d of ['right', 'down']) {
      const n = rooms.get(ridx(r.x + DIRS[d][0], r.y + DIRS[d][1]));
      if (!n || r.x + DIRS[d][0] >= DGW || r.y + DIRS[d][1] >= DGH) continue;
      const k = edgeKey(r.id, n.id);
      if (edges.has(k) || special(r) || special(n)) continue;
      const roll = rng();
      if (roll < 0.28) edges.set(k, { type: 'bomb', tree: false });
      else if (roll < 0.45) edges.set(k, { type: 'open', tree: false });
    }
  }

  // locks
  const treeEdges = [...edges.entries()].filter(([k, e]) => e.tree && rooms.get(e.far).kind !== 'shard' && rooms.get(e.far).kind !== 'sage');
  let lockCount = def.locks + (quest > 1 ? 1 : 0);
  const bossEdge = treeEdges.find(([k, e]) => e.far === boss.id);
  if (bossEdge && rng.chance(0.75)) { bossEdge[1].type = 'locked'; lockCount--; }
  for (const [k, e] of rng.shuffle(treeEdges.slice())) {
    if (lockCount <= 0) break;
    if (e.type !== 'open' || rooms.get(e.near).kind === 'start') continue;
    e.type = 'locked'; lockCount--;
  }
  // components with locked/bomb edges closed
  const comps = () => {
    const comp = new Map();
    let c = 0;
    for (const r of rooms.values()) {
      if (comp.has(r.id)) continue;
      const q = [r.id]; comp.set(r.id, c);
      while (q.length) {
        const u = q.pop(), ur = rooms.get(u);
        for (const d of DIR_LIST) {
          const nx = ur.x + DIRS[d][0], ny = ur.y + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= DGW || ny >= DGH) continue;
          const v = ridx(nx, ny), e = edges.get(edgeKey(u, v));
          if (!e || e.type !== 'open' || comp.has(v)) continue;
          comp.set(v, c); q.push(v);
        }
      }
      c++;
    }
    return comp;
  };
  const freeRoom = r => r.kind === 'normal' && !r.item;
  for (const [k, e] of edges) {
    if (e.type !== 'locked') continue;
    const comp = comps();
    const cid = comp.get(e.near);
    const cand = [...rooms.values()].filter(r => comp.get(r.id) === cid && freeRoom(r));
    if (!cand.length) { e.type = 'open'; continue; }
    rng.pick(cand).item = 'key';
  }
  // one spare key near the entrance
  { const comp = comps(); const cid = comp.get(start.id); const cand = [...rooms.values()].filter(r => comp.get(r.id) === cid && freeRoom(r)); if (cand.length) rng.pick(cand).item = 'key'; }
  // map & compass
  for (const it of ['map', 'compass']) { const cand = [...rooms.values()].filter(freeRoom); if (cand.length) rng.pick(cand).item = it; }
  // hint rooms
  for (let i = 0; i < (level >= 3 ? 2 : 1); i++) {
    const cand = [...rooms.values()].filter(r => freeRoom(r) && r.depth > 0);
    if (cand.length) { const h = rng.pick(cand); h.kind = 'hint'; h.hint = DUNGEON_HINTS[(level * 3 + i * 5 + quest) % DUNGEON_HINTS.length]; }
  }
  // shutters (owned by the near room, which must be a fighting room)
  for (const [k, e] of edges) {
    if (e.type !== 'open' || !e.tree) continue;
    const near = rooms.get(e.near);
    if (near.kind !== 'normal' && near.kind !== 'item') continue;
    if (rng.chance(0.22)) { e.type = 'shutter'; e.owner = near.id; if (rng.chance(0.35)) near.pushOpen = true; }
  }

  // contents
  const q2 = quest > 1;
  for (const r of rooms.values()) {
    r.template = 0;
    if (r.kind === 'normal' || r.kind === 'item') {
      r.template = r.pushOpen ? 0 : rng.int(0, ROOM_TEMPLATES.length - 1);
      const n = rng.int(3, 4 + Math.floor(level / 2)) + (q2 ? 1 : 0);
      const types = [rng.pick(def.enemies)];
      if (rng.chance(0.5)) types.push(rng.pick(def.enemies));
      for (let i = 0; i < n; i++) {
        let tp = rng.pick(types);
        if (tp === 'grabber' && r.enemies.filter(e => e === 'grabber').length >= 2) tp = def.enemies[0];
        r.enemies.push(tp);
      }
      r.dark = rng.chance(def.dark);
      if ((r.template === 0 || r.template === 8) && rng.chance(0.18 + level * 0.02)) r.traps = true;
    }
    if (r.kind === 'boss') r.enemies = [def.boss];
    if (level === 9 && r.kind === 'normal' && rng.chance(0.12)) { r.enemies = [rng.pick(['thornhorn', 'hydra', 'coilworm'])]; r.miniBoss = true; r.template = 0; r.traps = false; }
  }

  return { level, quest, rooms, edges, start: start.id, boss: boss.id, shardRoom: shard.id, itemRoom: itemRoom.id, def };
}

// door type for a room side (static, before runtime state)
function dungeonDoor(dg, room, dir) {
  if (room.kind === 'start' && dir === 'down') return { type: 'exit' };
  const nx = room.x + DIRS[dir][0], ny = room.y + DIRS[dir][1];
  if (nx < 0 || ny < 0 || nx >= DGW || ny >= DGH) return null;
  const e = dg.edges.get(edgeKey(room.id, ridx(nx, ny)));
  if (!e) return null;
  return e;
}

// verify every dungeon is completable with only sword + keys found inside it (+bombs not required)
function validateDungeon(dg) {
  const problems = [];
  let keys = 0, opened = new Set();
  let reach = new Set([dg.start]);
  const expand = () => {
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of [...reach]) {
        const r = dg.rooms.get(id);
        for (const d of DIR_LIST) {
          const e = dungeonDoor(dg, r, d);
          if (!e || e.type === 'exit' || e.type === 'bomb') continue;
          if (e.type === 'locked' && !opened.has(e)) continue;
          const nid = ridx(r.x + DIRS[d][0], r.y + DIRS[d][1]);
          if (!reach.has(nid)) { reach.add(nid); grew = true; }
        }
      }
    }
  };
  // adversarial order: always open the locked door that leads to the fewest keys first
  for (let step = 0; step < 50; step++) {
    expand();
    const collected = [...reach].filter(id => dg.rooms.get(id).item === 'key').length;
    keys = collected - opened.size;
    const frontier = [];
    for (const id of reach) {
      const r = dg.rooms.get(id);
      for (const d of DIR_LIST) {
        const e = dungeonDoor(dg, r, d);
        if (e && e.type === 'locked' && !opened.has(e)) frontier.push(e);
      }
    }
    if (!frontier.length) break;
    if (keys <= 0) { problems.push('soft-lock: no keys with ' + frontier.length + ' locked doors'); break; }
    opened.add(frontier[frontier.length - 1]);
  }
  if (reach.size !== dg.rooms.size) problems.push('unreachable rooms: ' + (dg.rooms.size - reach.size));
  return problems;
}
