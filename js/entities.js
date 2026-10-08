// ============================================================================
// THE HOLLOW CROWN — player, weapons, projectiles, pickups, effects
// ============================================================================
'use strict';

const HEART = 16;               // hp points per heart
const SWORD_DMG = [0, 1, 2, 4];
const B_ITEMS = ['disc', 'bombs', 'bow', 'lantern', 'whistle', 'potion', 'wand'];

// ---------------------------------------------------------------------------
// tiles & collision
// ---------------------------------------------------------------------------
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return -1;
  return Game.area.tiles[ty * COLS + tx];
}
function setTile(tx, ty, v) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
  Game.area.tiles[ty * COLS + tx] = v;
  Game.area.dirty = true;
}
function walkable(t) { return t >= 0 && !SOLID.has(t); }

// can the player's box occupy this position? returns blocking tile info or null
function playerBlockedAt(box, dir) {
  const x0 = Math.floor(box.x / TS), x1 = Math.floor((box.x + box.w - 1) / TS);
  const y0 = Math.floor(box.y / TS), y1 = Math.floor((box.y + box.h - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = tileAt(tx, ty);
    if (t < 0) continue;
    if (WATERY.has(t)) { if (ladderOK(tx, ty, dir)) continue; return { tx, ty, t }; }
    if (SOLID.has(t)) return { tx, ty, t };
  }
  return null;
}
function ladderOK(tx, ty, dir) {
  if (!Game.save.items.ladder || !dir) return false;
  const [dx, dy] = DIRS[dir];
  const a = tileAt(tx + dx, ty + dy), b = tileAt(tx - dx, ty - dy);
  const land = t => t >= 0 && !SOLID.has(t) && !WATERY.has(t);
  return land(a) && land(b);
}
// generic entity vs tiles (enemies/projectiles): solid tiles & water block, out of bounds blocks
function boxHitsWall(x, y, w, h, opts = {}) {
  const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 1) / TS);
  const y0 = Math.floor(y / TS), y1 = Math.floor((y + h - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = tileAt(tx, ty);
    if (t < 0) return true;
    if (opts.water && WATERY.has(t)) continue;
    if (SOLID.has(t)) return true;
  }
  return false;
}
function playBounds() {
  // the region enemies may roam in
  return Game.area.kind === 'dungeon' ? { x0: 2, y0: 2, x1: 13, y1: 8 } : { x0: 1, y0: 1, x1: 14, y1: 9 };
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
function makePlayer(x, y, dir) {
  return { x, y, dir: dir || 'up', step: 0, atk: 0, atkKind: null, inv: 0, kb: null, state: 'normal', stateT: 0,
    holdSpr: null, pushT: 0, raftDir: null, beamOut: false, discOut: false, slow: 0, auto: null, frozen: 0 };
}
function pbox(p) { return { x: p.x + 2, y: p.y + 6, w: 12, h: 10 }; }
function pcenter(p) { return [p.x + 8, p.y + 10]; }

function playerHurt(dmgHalf, sx, sy, kind) {
  const p = Game.player, s = Game.save;
  if (p.inv > 0 || p.state === 'dead' || p.state === 'item' || Game.state !== 'play') return;
  let pts = dmgHalf * 8 * (s.quest > 1 ? 1.5 : 1);
  if (s.ring === 2) pts /= 4; else if (s.ring === 1) pts /= 2;
  s.hp = Math.max(0, s.hp - Math.max(2, Math.round(pts)));
  p.inv = 48;
  Sound.sfx('hurt');
  if (p.state === 'normal' || p.state === 'raft') {
    const [cx, cy] = pcenter(p);
    let d = dirTo(sx, sy, cx, cy);
    if (p.state === 'normal') p.kb = { dir: d, t: 8 };
  }
  if (s.hp <= 0) Game.playerDied();
}

function swordBox(p) {
  const r = { up: [p.x + 4, p.y - 11, 8, 16], down: [p.x + 4, p.y + 11, 8, 16], left: [p.x - 11, p.y + 5, 16, 8], right: [p.x + 11, p.y + 5, 16, 8] }[p.dir];
  return { x: r[0], y: r[1], w: r[2], h: r[3] };
}

function updatePlayer() {
  const p = Game.player, s = Game.save;
  if (p.inv > 0) p.inv--;
  if (p.state === 'dead') return;
  if (p.state === 'item') { if (--p.stateT <= 0) { p.state = 'normal'; p.holdSpr = null; if (p.afterItem) { const f = p.afterItem; p.afterItem = null; f(); } } return; }
  if (p.state === 'frozen') { if (--p.stateT <= 0) p.state = 'normal'; return; }
  if (p.state === 'auto') { // scripted walk (entering rooms)
    const [dx, dy] = DIRS[p.dir];
    p.x += dx; p.y += dy; p.step++;
    if (--p.stateT <= 0) { p.state = 'normal'; if (p.afterAuto) { const f = p.afterAuto; p.afterAuto = null; f(); } }
    return;
  }
  if (p.state === 'raft') {
    const [dx, dy] = DIRS[p.raftDir];
    p.x += dx; p.y += dy;
    const [cx, cy] = pcenter(p);
    const t = tileAt(Math.floor(cx / TS), Math.floor((p.y + 8) / TS));
    const aligned = dy ? (p.y % TS === 0) : (p.x % TS === 0);
    if (t !== T.WATER && aligned) { p.state = 'normal'; }
    if (p.y < -8 || p.y > PLAY_H - 8 || p.x < -8 || p.x > SCREEN_W - 8) p.state = 'normal';
    return;
  }
  // knockback
  if (p.kb) {
    const [dx, dy] = DIRS[p.kb.dir];
    for (let i = 0; i < 4; i++) { const b = pbox(p); b.x += dx; b.y += dy; if (playerBlockedAt(b, null) || b.x < 0 || b.y < 0 || b.x + b.w > SCREEN_W || b.y + b.h > PLAY_H) break; p.x += dx; p.y += dy; }
    if (--p.kb.t <= 0) p.kb = null;
    if (p.atk > 0) p.atk--;
    return;
  }
  // attacking
  if (p.atk > 0) {
    p.atk--;
    if (p.atk === 8 && p.atkKind === 'sword' && s.hp >= s.maxHearts * HEART && !p.beamOut) {
      p.beamOut = true; Sound.sfx('beam');
      Game.addEnt(makeSwordBeam(p));
    }
    if (p.atk === 8 && p.atkKind === 'wand') { Sound.sfx('magic'); Game.addEnt(makeWandBolt(p)); }
    return;
  }
  // buttons
  if (Input.pressed.a && s.sword > 0) { p.atk = 14; p.atkKind = 'sword'; Sound.sfx('sword'); return; }
  if (Input.pressed.b && s.selB) { useBItem(s.selB); if (p.atk > 0 || p.state !== 'normal') return; }

  // movement
  const d = heldDir();
  if (!d) { p.pushT = 0; return; }
  p.dir = d;
  // raft launch
  if (s.items.raft) {
    const [cx, cy] = pcenter(p);
    const ctx_ = Math.floor(cx / TS), cty = Math.floor(cy / TS);
    if (tileAt(ctx_, cty) === T.DOCK && tileAt(ctx_ + DIRS[d][0], cty + DIRS[d][1]) === T.WATER) {
      p.state = 'raft'; p.raftDir = d; p.x = ctx_ * TS; p.y = Math.round(p.y); Sound.sfx('splash'); return;
    }
  }
  const spd = 1.5;
  const [dx, dy] = DIRS[d];
  let moved = false;
  const b = pbox(p);
  // ladder: lock perpendicular motion while over water
  const blocked = playerBlockedAt({ x: b.x + dx * spd, y: b.y + dy * spd, w: b.w, h: b.h }, d);
  if (!blocked) { p.x += dx * spd; p.y += dy * spd; moved = true; p.pushT = 0; }
  else {
    // locked dungeon doors / push blocks
    if (Game.area.kind === 'dungeon' && Game.tryDoor(blocked.tx, blocked.ty, d)) return;
    if ((blocked.t === T.DPUSH || (blocked.t === T.PROCK && d === 'up'))) {
      if (++p.pushT > 22) { p.pushT = 0; Game.pushBlock(blocked.tx, blocked.ty, d); }
    } else p.pushT = 0;
    // corner sliding
    for (let o = 1; o <= 7 && !moved; o++) {
      for (const sgn of [1, -1]) {
        const ox = dy ? o * sgn : 0, oy = dx ? o * sgn : 0;
        const tb = { x: b.x + ox + dx * spd, y: b.y + oy + dy * spd, w: b.w, h: b.h };
        if (!playerBlockedAt({ x: b.x + ox, y: b.y + oy, w: b.w, h: b.h }, d) && !playerBlockedAt(tb, d)) {
          p.x += Math.sign(ox); p.y += Math.sign(oy); moved = true; break;
        }
      }
    }
  }
  if (moved) p.step++;
  // align to half-tiles on the perpendicular axis (classic feel)
  if (moved && !blocked) {
    if (dx) { const r = Math.round(p.y / 8) * 8; if (Math.abs(r - p.y) > 0 && Math.abs(r - p.y) < 3 && !playerBlockedAt({ ...pbox(p), y: r + 6 }, d)) p.y += Math.sign(r - p.y) * 0.5; }
    if (dy) { const r = Math.round(p.x / 8) * 8; if (Math.abs(r - p.x) > 0 && Math.abs(r - p.x) < 3 && !playerBlockedAt({ ...pbox(p), x: r + 2 }, d)) p.x += Math.sign(r - p.x) * 0.5; }
  }
}

function useBItem(it) {
  const p = Game.player, s = Game.save, [dx, dy] = DIRS[p.dir];
  switch (it) {
    case 'disc':
      if (p.discOut) return;
      p.discOut = true; Sound.sfx('disc');
      Game.addEnt(makeDisc(p));
      p.atk = 8; p.atkKind = 'throw';
      break;
    case 'bombs':
      if (s.bombs <= 0 || Game.ents.filter(e => e.tag === 'bomb').length >= 2) return;
      s.bombs--; Sound.sfx('bombdrop');
      Game.addEnt(makeBomb(p.x + dx * 14, p.y + dy * 14 + 2));
      p.atk = 8; p.atkKind = 'throw';
      break;
    case 'bow':
      if (Game.ents.some(e => e.tag === 'arrow')) return;
      if (s.rupees <= 0) { Sound.sfx('error'); return; }
      s.rupees--; Sound.sfx('arrow');
      Game.addEnt(makeArrow(p, s.items.stararrow));
      p.atk = 8; p.atkKind = 'throw';
      break;
    case 'lantern':
      if (Game.area.lanternUsed && Game.area.kind !== 'cave') { Sound.sfx('error'); return; }
      Game.area.lanternUsed = true; Sound.sfx('fire');
      if (Game.area.dark) { Game.area.lit = true; }
      Game.addEnt(makeFire(p.x + dx * 16, p.y + dy * 16, p.dir, true));
      p.atk = 8; p.atkKind = 'throw';
      break;
    case 'whistle':
      p.state = 'frozen'; p.stateT = 160;
      Game.whistleT = 160;
      Sound.jingle('whistle');
      break;
    case 'potion':
      if (s.potion <= 0) return;
      s.potion--;
      Game.refillHearts(s.maxHearts * HEART);
      if (s.potion <= 0) s.selB = firstOwnedB();
      break;
    case 'wand':
      p.atk = 14; p.atkKind = 'wand';
      break;
  }
}
function ownsB(it) {
  const s = Game.save;
  if (it === 'bombs') return s.everBombs;
  if (it === 'potion') return s.potion > 0;
  if (it === 'bow') return s.items.bow || s.items.stararrow;
  return !!s.items[it];
}
function firstOwnedB() { return B_ITEMS.find(ownsB) || null; }

function heroPal() { const r = Game.save ? Game.save.ring : 0; return r === 2 ? 'hero_red' : r === 1 ? 'hero_blue' : 'hero'; }

function drawPlayer(ox = 0, oy = 0) {
  const p = Game.player, s = Game.save;
  if (p.state === 'dead' && p.hidden) return;
  if (p.inv > 0 && (p.inv >> 1) & 1 && p.state !== 'dead') return;
  const x = p.x + ox, y = p.y + oy + HUD_H, pal = heroPal();
  if (p.state === 'raft') drawSpr('raft', x, y + 4);
  if (p.state === 'item') {
    drawSpr('hero_item', x, y, { pal });
    if (p.holdSpr) { const img = getSprite(p.holdSpr.spr, p.holdSpr.pal); drawSpr(p.holdSpr.spr, x + 8 - img.width / 2, y - img.height, { pal: p.holdSpr.pal }); }
    return;
  }
  // ladder under player when crossing water
  const [cx] = pcenter(p);
  const under = tileAt(Math.floor(cx / TS), Math.floor((p.y + 10) / TS));
  if (WATERY.has(under) && p.state !== 'raft') drawSpr('ladder', Math.floor(cx / TS) * TS + ox, Math.floor((p.y + 10) / TS) * TS + oy + HUD_H);
  const d = p.dir, flipX = d === 'left';
  const base = d === 'left' ? 'right' : d;
  if (p.atk > 0 && (p.atkKind === 'sword' || p.atkKind === 'wand')) {
    drawSpr('hero_atk_' + base, x, y, { pal, flipX });
    if (p.atk > 2) {
      const sb = swordBox(p);
      const isW = p.atkKind === 'wand';
      const pull = p.atk > 11 ? 5 : 0; // slight wind-up
      const [dx, dy] = DIRS[d];
      drawSpr(isW ? 'wand' : 'sword', sb.x - dx * pull + ox, sb.y - dy * pull + oy + HUD_H, { rot: DIR_ROT[d], pal: isW ? 'magic' : 'sword' + s.sword });
    }
    return;
  }
  if (p.atk > 0) { drawSpr('hero_atk_' + base, x, y, { pal, flipX }); return; }
  const f = (p.step >> 3) & 1;
  drawSpr('hero_' + base + '_' + f, x, y, { pal, flipX });
}

// ---------------------------------------------------------------------------
// player projectiles
// ---------------------------------------------------------------------------
function projBase(tag, x, y, w, h, dir, speed) {
  const [dx, dy] = DIRS[dir];
  return { tag, x, y, w, h, dir, vx: dx * speed, vy: dy * speed, t: 0, dead: false };
}
function offscreen(e) { return e.x < -16 || e.y < -16 || e.x > SCREEN_W + 16 || e.y > PLAY_H + 16; }

function makeSwordBeam(p) {
  const sb = swordBox(p);
  const e = projBase('pproj', sb.x, sb.y, sb.w, sb.h, p.dir, 4);
  e.dmg = SWORD_DMG[Game.save.sword]; e.kind = 'beam';
  e.update = () => {
    e.x += e.vx; e.y += e.vy; e.t++;
    if (offscreen(e) || e.x < 0 || e.y < 0 || e.x + e.w > SCREEN_W || e.y + e.h > PLAY_H) e.die();
  };
  e.die = () => { if (e.dead) return; e.dead = true; Game.player.beamOut = false; burstSparks(e.x + e.w / 2, e.y + e.h / 2); };
  e.onHit = () => e.die();
  e.draw = () => drawSpr('sword', e.x, e.y + HUD_H, { rot: DIR_ROT[e.dir], pal: (e.t >> 1) & 1 ? 'beam' : 'sword' + Game.save.sword });
  return e;
}
function burstSparks(x, y) {
  for (const [vx, vy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    const s = { tag: 'fx', x: x - 4, y: y - 4, t: 0, dead: false };
    s.update = () => { s.x += vx; s.y += vy; if (++s.t > 14) s.dead = true; };
    s.draw = () => drawSpr('beam_spark', s.x, s.y + HUD_H, { pal: (s.t >> 1) & 1 ? 'beam' : 'white' });
    Game.addEnt(s);
  }
}
function makeWandBolt(p) {
  const sb = swordBox(p);
  const e = projBase('pproj', sb.x - (p.dir === 'up' || p.dir === 'down' ? 4 : 0), sb.y - (p.dir === 'left' || p.dir === 'right' ? 4 : 0), 16, 16, p.dir, 3.5);
  e.dmg = 2; e.kind = 'magic';
  e.update = () => { e.x += e.vx; e.y += e.vy; e.t++; if (boxHitsWall(e.x + 4, e.y + 4, 8, 8, { water: true }) || offscreen(e)) e.die(); };
  e.die = () => { if (e.dead) return; e.dead = true; if (Game.save.items.book) Game.addEnt(makeFire(e.x, e.y, null, false)); };
  e.onHit = () => e.die();
  e.draw = () => drawSpr('magic_' + ((e.t >> 2) & 1), e.x, e.y + HUD_H, { rot: DIR_ROT[e.dir] });
  return e;
}
function makeArrow(p, star) {
  const vert = p.dir === 'up' || p.dir === 'down';
  const [dx, dy] = DIRS[p.dir];
  const e = projBase('pproj', p.x + (vert ? 4 : dx * 8), p.y + (vert ? dy * 8 : 4), vert ? 8 : 16, vert ? 16 : 8, p.dir, star ? 5 : 4);
  e.tag = 'arrow'; e.dmg = star ? 4 : 2; e.kind = star ? 'star' : 'arrow';
  e.update = () => {
    e.x += e.vx; e.y += e.vy; e.t++;
    if (e.stuck) { if (++e.stuck > 10) e.dead = true; return; }
    if (boxHitsWall(e.x + 2, e.y + 2, e.w - 4, e.h - 4, { water: true }) || offscreen(e)) { e.vx = e.vy = 0; e.stuck = 1; Game.addEnt(makeSparkFx(e.x + e.w / 2 - 4, e.y + e.h / 2 - 4)); }
  };
  e.onHit = () => { if (!star) e.dead = true; };
  e.draw = () => drawSpr(star ? 'star_arrow' : 'arrow', e.x, e.y + HUD_H, { rot: DIR_ROT[e.dir] });
  return e;
}
function makeDisc(p) {
  const [dx, dy] = DIRS[p.dir];
  let vx = dx, vy = dy;
  // allow diagonal throws if a second direction is held
  for (const d of Input.dirOrder) { if (DIRS[d][0] && !vx) vx = DIRS[d][0]; if (DIRS[d][1] && !vy) vy = DIRS[d][1]; }
  const n = Math.hypot(vx, vy);
  const e = { tag: 'pproj', kind: 'disc', x: p.x + 4, y: p.y + 4, w: 8, h: 8, vx: vx / n * 3, vy: vy / n * 3, t: 0, back: false, dmg: 0, stun: true, carry: [] };
  e.update = () => {
    e.t++;
    if (!e.back) {
      e.x += e.vx; e.y += e.vy;
      if (e.t > 22 || boxHitsWall(e.x, e.y, 8, 8, { water: true })) e.back = true;
    } else {
      const pl = Game.player, tx = pl.x + 4, ty = pl.y + 4, d = dist(e.x, e.y, tx, ty);
      if (d < 6) { e.dead = true; pl.discOut = false; for (const c of e.carry) Game.collect(c); return; }
      e.x += (tx - e.x) / d * 3.5; e.y += (ty - e.y) / d * 3.5;
    }
    if (e.t % 8 === 0) Sound.sfx('disc');
    for (const c of e.carry) { c.x = e.x - (c.w - 8) / 2; c.y = e.y - (c.h - 8) / 2; }
  };
  e.onHit = () => { e.back = true; };
  e.draw = () => drawSpr('disc_' + ((e.t >> 2) & 1), e.x, e.y + HUD_H);
  return e;
}
function makeBomb(x, y) {
  x = clamp(x, 0, SCREEN_W - 16); y = clamp(y, 0, PLAY_H - 16);
  const e = { tag: 'bomb', x, y, w: 16, h: 16, t: 0, dead: false };
  e.update = () => {
    e.t++;
    if (e.t === 60) { e.boom = true; Sound.sfx('bomb'); Game.explode(e.x + 8, e.y + 8); Game.shake = 12; }
    if (e.t > 80) e.dead = true;
  };
  e.draw = () => {
    if (!e.boom) drawSpr('bomb', e.x, e.y + HUD_H);
    else {
      const f = (e.t >> 2) & 1;
      for (const [ox, oy] of [[0, 0], [-10, -8], [10, -8], [-10, 8], [10, 8], [0, -14], [0, 14]]) drawSpr('boom_' + f, e.x + ox, e.y + oy + HUD_H);
    }
  };
  return e;
}
function makeFire(x, y, dir, moving) {
  x = clamp(x, 0, SCREEN_W - 16); y = clamp(y, 0, PLAY_H - 16);
  const e = { tag: 'pproj', kind: 'fire', x, y, w: 16, h: 16, t: 0, dmg: 1, dead: false, persist: true };
  const [dx, dy] = dir ? DIRS[dir] : [0, 0];
  e.update = () => {
    e.t++;
    if (moving && e.t < 24) { const nx = e.x + dx, ny = e.y + dy; if (!boxHitsWall(nx + 2, ny + 2, 12, 12)) { e.x = nx; e.y = ny; } }
    Game.fireTouch(e);
    if (e.t > 80) e.dead = true;
  };
  e.onHit = () => {};
  e.draw = () => drawSpr('fire_' + ((e.t >> 3) & 1), e.x, e.y + HUD_H);
  return e;
}

// ---------------------------------------------------------------------------
// enemy projectiles
// ---------------------------------------------------------------------------
// kind: small (blocked by any shield), big (blocked by tower shield), magic (tower shield)
function makeEProj(spr, x, y, vx, vy, dmg, kind, opts = {}) {
  const e = { tag: 'eproj', spr, x, y, w: opts.w || 8, h: opts.h || 8, vx, vy, dmg, kind, t: 0, dead: false, rot: opts.rot || 0, pal: opts.pal, anim: opts.anim };
  e.update = () => {
    e.t++;
    e.x += e.vx; e.y += e.vy;
    if (offscreen(e) || (!opts.ghost && boxHitsWall(e.x + 2, e.y + 2, e.w - 4, e.h - 4, { water: true }) && e.t > 6)) e.dead = true;
    if (opts.update) opts.update(e);
  };
  e.draw = () => drawSpr(e.anim ? e.spr + '_' + ((e.t >> 2) & 1) : e.spr, e.x, e.y + HUD_H, { rot: e.rot, pal: e.pal });
  return e;
}
function aimAt(x, y, speed, angleOff = 0) {
  const [px, py] = pcenter(Game.player);
  const a = Math.atan2(py - y, px - x) + angleOff;
  return [Math.cos(a) * speed, Math.sin(a) * speed];
}
function fireball(x, y, angleOff = 0, speed = 2) {
  const [vx, vy] = aimAt(x, y, speed, angleOff);
  Game.addEnt(makeEProj('fireball', x - 4, y - 4, vx, vy, 2, 'big', { anim: true, ghost: true }));
}

// ---------------------------------------------------------------------------
// pickups
// ---------------------------------------------------------------------------
const PICKUP_SPR = {
  rupee: { spr: 'rupee', pal: 'rupee1', w: 8, h: 16 }, rupee5: { spr: 'rupee', pal: 'rupee5', w: 8, h: 16 },
  heart: { spr: 'heart', w: 8, h: 8 }, bomb: { spr: 'bomb', w: 16, h: 16 }, fairy: { spr: 'fairy', w: 8, h: 16, anim: true },
  clock: { spr: 'clock', w: 16, h: 16 }, key: { spr: 'key', w: 8, h: 16 }, map: { spr: 'map', w: 8, h: 16 },
  compass: { spr: 'compass', w: 16, h: 16 }, heart_container: { spr: 'heart_container', w: 16, h: 16 }, shard: { spr: 'shard', w: 16, h: 16 },
};
function makePickup(kind, x, y, opts = {}) {
  let info = PICKUP_SPR[kind];
  if (!info) { const ii = ITEM_INFO[kind]; const img = getSprite(ii.spr, ii.pal); info = { spr: ii.spr, pal: ii.pal, w: img.width, h: img.height }; }
  const e = { tag: 'pickup', kind, x: x - info.w / 2, y: y - info.h / 2, w: info.w, h: info.h, t: 0, dead: false, life: opts.life || 0, onTake: opts.onTake, major: opts.major, price: opts.price };
  e.update = () => {
    e.t++;
    if (kind === 'fairy') { e.x += Math.sin(e.t / 13) * 1.2; e.y += Math.cos(e.t / 17) * 0.8; e.x = clamp(e.x, 16, SCREEN_W - 24); e.y = clamp(e.y, 16, PLAY_H - 32); }
    if (e.life && e.t > e.life) e.dead = true;
  };
  e.draw = () => {
    if (e.life && e.t > e.life - 90 && (e.t >> 1) & 1) return;
    let pal = info.pal;
    if (kind === 'rupee' && (e.t >> 3) & 1) pal = 'rupee5';
    drawSpr(info.anim ? info.spr + '_' + ((e.t >> 2) & 1) : info.spr, e.x, e.y + HUD_H, { pal });
    if (e.price !== undefined && e.price > 0) drawTextC(String(e.price), e.x + e.w / 2, e.y + e.h + 4 + HUD_H, '#fcfcfc');
  };
  return e;
}
function rollDrop(x, y) {
  if (!rnd.chance(0.38)) return;
  const r = rnd();
  let k = r < 0.38 ? 'rupee' : r < 0.68 ? 'heart' : r < 0.8 ? 'bomb' : r < 0.9 ? 'rupee5' : r < 0.96 ? 'fairy' : 'clock';
  if (k === 'bomb' && !Game.save.everBombs) k = 'rupee';
  Game.addEnt(makePickup(k, x, y, { life: 480 }));
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------
function makePuff(x, y, then) {
  const e = { tag: 'fx', x, y, t: 0, dead: false };
  e.update = () => { if (++e.t >= 18) { e.dead = true; if (then) then(); } };
  e.draw = () => drawSpr('puff_' + Math.min(2, (e.t / 6) | 0), e.x, e.y + HUD_H);
  return e;
}
function makeSparkFx(x, y) {
  const e = { tag: 'fx', x, y, t: 0, dead: false };
  e.update = () => { if (++e.t > 6) e.dead = true; };
  e.draw = () => drawSpr('hit_spark', e.x, e.y + HUD_H);
  return e;
}
