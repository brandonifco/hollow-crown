// ============================================================================
// THE HOLLOW CROWN — overworld generation (deterministic)
// ============================================================================
'use strict';

const World = { screens: null, hEdge: null, vEdge: null, built: false };

function passChar(ch) { return ch === '.' || ch === 'F' || ch === 'H' || ch === '=' || ch === 'D'; }

function spanOf(arr) { // arr of booleans -> {a,len} of first run
  let a = -1, len = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) { if (a < 0) a = i; len++; } else if (a >= 0) break;
  }
  return a < 0 ? null : { a, len };
}

function buildWorld() {
  if (World.built) return World;
  const rng = makeRng(0x48C0);
  const hEdge = [], vEdge = [];
  for (let y = 0; y < WORLD_H; y++) { hEdge.push(new Array(WORLD_W - 1).fill(null)); vEdge.push(new Array(WORLD_W).fill(null)); }

  // 1. edges fixed by hand-built screens
  for (const k in HAND_SCREENS) {
    const [x, y] = k.split(',').map(Number);
    const R = HAND_SCREENS[k];
    if (y > 0) { const s = spanOf([...R[0]].map((c, i) => i > 0 && i < 15 && passChar(c))); vEdge[y - 1][x] = s ? { open: true, a: s.a, len: s.len, fixed: true } : { open: false, fixed: true }; }
    if (y < WORLD_H - 1) { const s = spanOf([...R[10]].map((c, i) => i > 0 && i < 15 && passChar(c))); vEdge[y][x] = s ? { open: true, a: s.a, len: s.len, fixed: true } : { open: false, fixed: true }; }
    if (x > 0) { const s = spanOf(R.map((r, i) => i > 0 && i < 10 && passChar(r[0]))); hEdge[y][x - 1] = s ? { open: true, a: s.a, len: s.len, fixed: true } : { open: false, fixed: true }; }
    if (x < WORLD_W - 1) { const s = spanOf(R.map((r, i) => i > 0 && i < 10 && passChar(r[15]))); hEdge[y][x] = s ? { open: true, a: s.a, len: s.len, fixed: true } : { open: false, fixed: true }; }
  }
  for (const [x1, y1, x2, y2] of FORCED_CLOSED) {
    if (y1 === y2) hEdge[y1][Math.min(x1, x2)] = { open: false, fixed: true };
    else vEdge[Math.min(y1, y2)][x1] = { open: false, fixed: true };
  }

  // 2. union-find spanning connectivity + extra loops
  const parent = [];
  for (let i = 0; i < WORLD_W * WORLD_H; i++) parent.push(i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const unite = (a, b) => { parent[find(a)] = find(b); };
  const id = (x, y) => y * WORLD_W + x;
  const cands = [];
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    if (x < WORLD_W - 1) { const e = hEdge[y][x]; if (e) { if (e.open) unite(id(x, y), id(x + 1, y)); } else cands.push(['h', x, y]); }
    if (y < WORLD_H - 1) { const e = vEdge[y][x]; if (e) { if (e.open) unite(id(x, y), id(x, y + 1)); } else cands.push(['v', x, y]); }
  }
  rng.shuffle(cands);
  const narrow = (x, y) => REGION[y][x] === 'M';
  for (const [t, x, y] of cands) {
    const a = id(x, y), b = t === 'h' ? id(x + 1, y) : id(x, y + 1);
    const bx = t === 'h' ? x + 1 : x, by = t === 'h' ? y : y + 1;
    let open = false;
    if (find(a) !== find(b)) { open = true; unite(a, b); }
    else open = rng.chance(REGION[y][x] === 'M' || REGION[by][bx] === 'M' ? 0.3 : 0.5);
    const len = (narrow(x, y) || narrow(bx, by)) ? 2 : rng.int(2, 4);
    if (t === 'h') hEdge[y][x] = { open, a: rng.int(2, 9 - len), len };
    else vEdge[y][x] = { open, a: rng.int(2, 14 - len), len };
  }
  World.hEdge = hEdge; World.vEdge = vEdge;

  // 3. screens
  World.screens = [];
  for (let y = 0; y < WORLD_H; y++) {
    const row = [];
    for (let x = 0; x < WORLD_W; x++) row.push(genScreen(x, y, makeRng((x * 977 + y * 7919 + 13) >>> 0)));
    World.screens.push(row);
  }
  World.built = true;
  return World;
}

function screenEdges(x, y) {
  return {
    up: y > 0 ? World.vEdge[y - 1][x] : null,
    down: y < WORLD_H - 1 ? World.vEdge[y][x] : null,
    left: x > 0 ? World.hEdge[y][x - 1] : null,
    right: x < WORLD_W - 1 ? World.hEdge[y][x] : null,
  };
}

function genScreen(sx, sy, rng) {
  const b = REGION[sy][sx], bio = BIOMES[b];
  const scr = { x: sx, y: sy, biome: b, tiles: new Uint8Array(COLS * ROWS), hand: false, entrance: null, fairy: null, item: null };
  const t = scr.tiles;
  const inb = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
  const set = (x, y, v) => { if (inb(x, y)) t[y * COLS + x] = v; };
  const get = (x, y) => inb(x, y) ? t[y * COLS + x] : T.ROCK;
  const feats = FEATURES.filter(f => f.x === sx && f.y === sy);
  const edges = screenEdges(sx, sy);

  // ---- hand-built screen
  const hk = sx + ',' + sy;
  if (HAND_SCREENS[hk]) {
    scr.hand = true;
    HAND_SCREENS[hk].forEach((row, y) => { for (let x = 0; x < COLS; x++) set(x, y, HAND_CHARS[row[x]]); });
    for (const f of feats) {
      if (f.kind === 'item') scr.item = { tx: f.hand.tx, ty: f.hand.ty, f };
      else if (f.hand) scr.entrance = { tx: f.hand.tx, ty: f.hand.ty, f };
    }
    scr.reach = computeReach(t, openingTargets(edges));
    return scr;
  }

  const reserved = new Uint8Array(COLS * ROWS);
  const res = (x, y, v) => { set(x, y, v); if (inb(x, y)) reserved[y * COLS + x] = 1; };
  const W = bio.wall;

  // ---- border
  for (let x = 0; x < COLS; x++) { set(x, 0, W); set(x, ROWS - 1, W); }
  for (let y = 0; y < ROWS; y++) { set(0, y, W); set(COLS - 1, y, W); }
  for (let x = 1; x < COLS - 1; x++) { if (rng.chance(0.45)) set(x, 1, W); if (rng.chance(0.45)) set(x, ROWS - 2, W); }
  for (let y = 1; y < ROWS - 1; y++) { if (rng.chance(0.45)) set(1, y, W); if (rng.chance(0.45)) set(COLS - 2, y, W); }
  if (b === 'M') { // mountains: thicker, jagged
    for (let x = 1; x < COLS - 1; x++) if (rng.chance(0.3)) set(x, 2, W);
  }
  if (b === 'C' || b === 'L') {
    if (sy === WORLD_H - 1) for (let x = 0; x < COLS; x++) { set(x, 9, T.WATER); set(x, 10, T.WATER); if (rng.chance(0.3)) set(x, 8, T.WATER); }
    if (sx === 0) for (let y = 0; y < ROWS; y++) { set(0, y, T.WATER); set(1, y, T.WATER); }
    if (sx === WORLD_W - 1) for (let y = 0; y < ROWS; y++) { set(14, y, T.WATER); set(15, y, T.WATER); }
  }

  // ---- interior obstacles
  const blob = (tile, n, mw, mh) => {
    for (let i = 0; i < n; i++) {
      const w = rng.int(1, mw), h = rng.int(1, mh), x0 = rng.int(2, 14 - w), y0 = rng.int(2, 9 - h);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, tile);
    }
  };
  const scatter = (tile, n) => { for (let i = 0; i < n; i++) set(rng.int(2, 13), rng.int(2, 8), tile); };
  switch (b) {
    case 'G': blob(T.TREE, rng.int(1, 3), 2, 2); scatter(T.BUSH, rng.int(2, 5)); scatter(T.FLOWER, rng.int(1, 4)); break;
    case 'F': blob(T.TREE, rng.int(4, 7), 2, 2); scatter(T.FLOWER, rng.int(0, 2)); break;
    case 'W': blob(T.TREE, 9, 2, 2); break;
    case 'M': blob(T.ROCK, rng.int(3, 6), 3, 2); break;
    case 'D': blob(T.ROCK, rng.int(2, 4), 2, 1); scatter(T.ROCK, rng.int(1, 3)); break;
    case 'L': {
      const cx = rng.int(5, 10), cy = rng.int(4, 6), rx = rng.int(2, 4) + 0.5, ry = rng.int(1, 2) + 0.5;
      for (let y = 2; y < 9; y++) for (let x = 2; x < 14; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, T.WATER);
      blob(T.TREE, rng.int(1, 2), 2, 1);
      break;
    }
    case 'C': scatter(T.BUSH, rng.int(1, 3)); blob(T.TREE, rng.int(0, 2), 2, 1); break;
    case 'Y':
      for (const gy of [3, 5, 7]) for (const gx of [3, 5, 10, 12]) if (rng.chance(0.75)) set(gx, gy, T.GRAVE);
      scatter(T.TREE, rng.int(0, 2));
      break;
  }

  // ---- openings
  const targets = [];
  if (edges.up && edges.up.open) { for (let c = edges.up.a; c < edges.up.a + edges.up.len; c++) { res(c, 0, T.FLOOR); set(c, 1, T.FLOOR); } targets.push([edges.up.a + (edges.up.len >> 1), 1]); }
  if (edges.down && edges.down.open) { for (let c = edges.down.a; c < edges.down.a + edges.down.len; c++) { res(c, 10, T.FLOOR); set(c, 9, T.FLOOR); } targets.push([edges.down.a + (edges.down.len >> 1), 9]); }
  if (edges.left && edges.left.open) { for (let r = edges.left.a; r < edges.left.a + edges.left.len; r++) { res(0, r, T.FLOOR); set(1, r, T.FLOOR); } targets.push([1, edges.left.a + (edges.left.len >> 1)]); }
  if (edges.right && edges.right.open) { for (let r = edges.right.a; r < edges.right.a + edges.right.len; r++) { res(15, r, T.FLOOR); set(14, r, T.FLOOR); } targets.push([14, edges.right.a + (edges.right.len >> 1)]); }

  // ---- features
  const topCaveCol = () => {
    const opts = [];
    for (let c = 3; c <= 12; c++) {
      if (edges.up && edges.up.open && c >= edges.up.a - 1 && c <= edges.up.a + edges.up.len) continue;
      opts.push(c);
    }
    return rng.pick(opts);
  };
  for (const f of feats) {
    if (f.kind === 'cave' && (!f.reveal || f.reveal === 'bomb')) {
      const c = topCaveCol();
      for (let x = c - 1; x <= c + 1; x++) res(x, 0, T.ROCK);
      res(c - 1, 1, T.ROCK); res(c + 1, 1, T.ROCK);
      res(c, 1, f.reveal === 'bomb' ? T.CRACK : T.CAVE);
      res(c, 2, T.FLOOR);
      scr.entrance = { tx: c, ty: 1, f };
      targets.push([c, 2]);
    } else if (f.kind === 'dungeon' && !f.reveal) {
      for (let y = 2; y <= 5; y++) for (let x = 5; x <= 9; x++) res(x, y, T.FLOOR);
      res(6, 3, T.FACADE); res(7, 3, T.FACADE); res(8, 3, T.FACADE);
      res(6, 4, T.PILLAR); res(7, 4, T.DOOR); res(8, 4, T.PILLAR);
      scr.entrance = { tx: 7, ty: 4, f };
      targets.push([7, 5]);
    } else if (f.reveal === 'fire') {
      const c = rng.int(4, 10), r = rng.int(3, 6), n = rng.int(3, 4), which = rng.int(0, n - 1);
      for (let i = 0; i < n; i++) { res(c + i, r, i === which ? T.SBUSH : T.BUSH); res(c + i, r + 1, T.FLOOR); }
      scr.entrance = { tx: c + which, ty: r, f };
      targets.push([c + which, r + 1]);
    } else if (f.reveal === 'push') {
      const c = rng.int(4, 11), r = rng.int(4, 6);
      res(c, r, T.PROCK); res(c, r - 1, T.FLOOR); res(c, r + 1, T.FLOOR);
      res(c - 1, r, T.ROCK); res(c + 1, r, T.ROCK);
      scr.entrance = { tx: c, ty: r, f };
      targets.push([c, r + 1]);
    } else if (f.kind === 'fairy') {
      for (let y = 2; y <= 7; y++) for (let x = 5; x <= 10; x++) res(x, y, T.FLOOR);
      for (let y = 3; y <= 5; y++) for (let x = 6; x <= 9; x++) res(x, y, T.WATER);
      scr.fairy = { x: 7 * TS + 8, y: 4 * TS };
      targets.push([7, 6]);
    }
  }

  // ---- carve paths from hub to every target (Dijkstra; obstacles are expensive, reserved tiles forbidden)
  let hub = [7, 6];
  if (reserved[hub[1] * COLS + hub[0]]) hub = [7, 7];
  if (reserved[hub[1] * COLS + hub[0]]) hub = [4, 6];
  if (get(hub[0], hub[1]) !== T.FLOOR) set(hub[0], hub[1], T.FLOOR);
  for (const tg of targets) carvePath(t, reserved, hub, tg, sy === WORLD_H - 1 || sx === 0 || sx === WORLD_W - 1);
  scr.reach = computeReach(t, [hub, ...targets]);
  return scr;
}

function carvePath(t, reserved, from, to) {
  const N = COLS * ROWS, distA = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const s = from[1] * COLS + from[0], g = to[1] * COLS + to[0];
  distA[s] = 0;
  const cost = i => {
    const x = i % COLS, y = (i / COLS) | 0;
    if (i === g) return 1;
    if (reserved[i]) return t[i] === T.FLOOR ? 1 : Infinity;
    if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) return Infinity;
    const v = t[i];
    if (v === T.FLOOR || v === T.FLOWER || v === T.BRIDGE) return 1;
    if (v === T.WATER) return 9;
    return 4;
  };
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && distA[i] < best) { best = distA[i]; u = i; }
    if (u < 0 || u === g) break;
    done[u] = 1;
    const ux = u % COLS, uy = (u / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ux + dx, ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const v = nx + ny * COLS, c = cost(v);
      if (distA[u] + c < distA[v]) { distA[v] = distA[u] + c; prev[v] = u; }
    }
  }
  if (distA[g] === Infinity) return false;
  for (let i = g; i >= 0; i = prev[i]) {
    if (reserved[i]) continue;
    if (t[i] === T.WATER) t[i] = T.BRIDGE;
    else if (SOLID.has(t[i])) t[i] = T.FLOOR;
  }
  return true;
}

function computeReach(t, starts) {
  const reach = new Uint8Array(COLS * ROWS);
  const q = [];
  for (const [x, y] of starts) { const i = y * COLS + x; if (!reach[i] && !SOLID.has(t[i])) { reach[i] = 1; q.push(i); } }
  while (q.length) {
    const u = q.pop(), ux = u % COLS, uy = (u / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ux + dx, ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const v = nx + ny * COLS;
      if (!reach[v] && !SOLID.has(t[v]) && !TRIGGERS.has(t[v])) { reach[v] = 1; q.push(v); }
    }
  }
  return reach;
}

function openingTargets(edges) {
  const out = [];
  if (edges.up && edges.up.open) out.push([edges.up.a, 1]);
  if (edges.down && edges.down.open) out.push([edges.down.a, 9]);
  if (edges.left && edges.left.open) out.push([1, edges.left.a]);
  if (edges.right && edges.right.open) out.push([14, edges.right.a]);
  return out;
}

// world-level sanity check (used by tools/validate.html and dev console)
function validateWorld() {
  buildWorld();
  const problems = [];
  const seen = new Set([key2(START_SCREEN.x, START_SCREEN.y)]), q = [[START_SCREEN.x, START_SCREEN.y]];
  while (q.length) {
    const [x, y] = q.pop();
    const e = screenEdges(x, y);
    for (const d of DIR_LIST) {
      if (!e[d] || !e[d].open) continue;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1], k = key2(nx, ny);
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  if (seen.size !== WORLD_W * WORLD_H) problems.push('unreachable screens: ' + (WORLD_W * WORLD_H - seen.size));
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const s = World.screens[y][x], e = screenEdges(x, y);
    // every opening must be reachable from every other (via reach map)
    for (const d of DIR_LIST) {
      if (!e[d] || !e[d].open) continue;
      const inner = d === 'up' ? [e[d].a, 1] : d === 'down' ? [e[d].a, 9] : d === 'left' ? [1, e[d].a] : [14, e[d].a];
      if (!s.reach[inner[1] * COLS + inner[0]]) problems.push(`screen ${x},${y} opening ${d} not reached`);
      // neighbor side must match
    }
    if (s.entrance && !(s.entrance.f.reveal === 'whistle' || s.entrance.f.level === 4 || s.entrance.f.level === 5)) {
      const { tx, ty } = s.entrance;
      const fronts = [[tx, ty + 1], [tx, ty - 1], [tx - 1, ty], [tx + 1, ty]];
      if (!fronts.some(([fx, fy]) => fy < ROWS && s.reach[fy * COLS + fx])) problems.push(`screen ${x},${y} entrance unreachable`);
    }
  }
  for (const f of FEATURES) {
    const s = World.screens[f.y][f.x];
    if (f.kind === 'cave' || f.kind === 'dungeon') { if (!s.entrance || s.entrance.f !== f) problems.push(`feature ${f.id || f.level} at ${f.x},${f.y} not placed`); }
  }
  return problems;
}
