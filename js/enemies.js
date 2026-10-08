// ============================================================================
// THE HOLLOW CROWN — enemies and bosses
// ============================================================================
'use strict';

// ---------------------------------------------------------------------------
// movement helpers
// ---------------------------------------------------------------------------
function canEnemyEnter(e, tx, ty) {
  const b = playBounds();
  if (tx < b.x0 || tx > b.x1 || ty < b.y0 || ty > b.y1) return false;
  const t = tileAt(tx, ty);
  if (t < 0) return false;
  if (e.def.fly) return true;
  if (SOLID.has(t) || TRIGGERS.has(t) || t === T.DOCK) return false;
  return true;
}
function gridWalk(e, speed, turn = 0.2, chase = 0) {
  if (e.moveLeft <= 0) {
    e.x = Math.round(e.x / TS) * TS; e.y = Math.round(e.y / TS) * TS;
    const tx = e.x / TS, ty = e.y / TS;
    e.lastTile = [tx, ty];
    const ok = d => canEnemyEnter(e, tx + DIRS[d][0], ty + DIRS[d][1]);
    let d = e.dir;
    if (!ok(d) || rnd.chance(turn) || (chase && rnd.chance(chase))) {
      let opts = DIR_LIST.filter(ok);
      if (chase && rnd.chance(chase)) {
        const p = Game.player, pd = dirTo(e.x, e.y, p.x, p.y);
        if (ok(pd)) opts = [pd];
      }
      if (!opts.length) return false;
      d = rnd.pick(opts);
    }
    e.dir = d; e.moveLeft = TS; e.justTurned = true;
  } else e.justTurned = false;
  const [dx, dy] = DIRS[e.dir];
  const st = Math.min(speed, e.moveLeft);
  e.x += dx * st; e.y += dy * st; e.moveLeft -= st;
  return true;
}
function aligned(e) { return e.moveLeft <= 0; }
function facingPlayer(e, tol = 10) {
  const p = Game.player;
  if (e.dir === 'up' || e.dir === 'down') return Math.abs(p.x - e.x) < tol && (e.dir === 'up' ? p.y < e.y : p.y > e.y);
  return Math.abs(p.y - e.y) < tol && (e.dir === 'left' ? p.x < e.x : p.x > e.x);
}
function randomFloorTile(minDistFromPlayer = 48, filter) {
  const a = Game.area, b = playBounds(), p = Game.player;
  const opts = [];
  for (let ty = b.y0 + (a.kind === 'over' ? 1 : 0); ty <= b.y1 - (a.kind === 'over' ? 1 : 0); ty++) for (let tx = b.x0 + (a.kind === 'over' ? 1 : 0); tx <= b.x1 - (a.kind === 'over' ? 1 : 0); tx++) {
    const t = tileAt(tx, ty);
    if (t < 0 || SOLID.has(t) || TRIGGERS.has(t) || t === T.DOCK) continue;
    if (a.reach && !a.reach[ty * COLS + tx]) continue;
    if (dist(tx * TS, ty * TS, p.x, p.y) < minDistFromPlayer) continue;
    if (filter && !filter(tx, ty)) continue;
    opts.push([tx, ty]);
  }
  return opts.length ? rnd.pick(opts) : null;
}
function shootStraight(e, spr, speed, dmg, kind, w = 8, h = 8) {
  const [dx, dy] = DIRS[e.dir];
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const vert = dy !== 0;
  const pw = spr === 'pebble' || spr === 'fireball' ? 8 : vert ? w : h, ph = spr === 'pebble' || spr === 'fireball' ? 8 : vert ? h : w;
  Game.addEnt(makeEProj(spr, cx - pw / 2 + dx * 8, cy - ph / 2 + dy * 8, dx * speed, dy * speed, dmg, kind, { w: pw, h: ph, rot: (spr === 'spear' || spr === 'sword' || spr === 'magic_0') ? DIR_ROT[e.dir] : 0, pal: spr === 'sword' ? 'sword2' : undefined }));
}

// ---------------------------------------------------------------------------
// AI routines
// ---------------------------------------------------------------------------
const AI = {
  thorn(e) {
    if (e.pause > 0) { if (--e.pause === 12) { shootStraight(e, 'pebble', 2.5, e.dmg, 'small'); } return; }
    if (aligned(e) && rnd.chance(0.07)) { e.pause = 36; return; }
    gridWalk(e, e.speed, 0.15);
  },
  spear(e) {
    if (e.pause > 0) { if (--e.pause === 10) { Sound.sfx('arrow'); shootStraight(e, 'spear', 2.5, e.dmg, 'small', 8, 16); } return; }
    if (aligned(e) && rnd.chance(0.05)) { e.pause = 30; return; }
    gridWalk(e, e.speed, 0.15);
  },
  knight(e) {
    if (e.pause > 0) { if (--e.pause === 8) shootStraight(e, 'sword', 3, e.dmg, 'big', 8, 16); return; }
    if (aligned(e) && (facingPlayer(e, 12) ? rnd.chance(0.5) : rnd.chance(0.03))) { e.pause = 20; return; }
    gridWalk(e, e.speed, 0.15, 0.2);
  },
  skitter(e) {
    if (e.jump) {
      e.jt++;
      const q = e.jt / e.jdur;
      e.x = e.jx0 + (e.jx1 - e.jx0) * q;
      e.y = e.jy0 + (e.jy1 - e.jy0) * q - Math.sin(q * Math.PI) * e.jh;
      if (e.jt >= e.jdur) { e.jump = false; e.x = e.jx1; e.y = e.jy1; e.wait = rnd.int(15, 60); }
      return;
    }
    if (--e.wait > 0) return;
    const tx = Math.round(e.x / TS), ty = Math.round(e.y / TS);
    const opts = [];
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if ((x !== tx || y !== ty) && canEnemyEnter({ def: {} }, x, y)) opts.push([x, y]);
    if (!opts.length) { e.wait = 30; return; }
    const [nx, ny] = rnd.pick(opts);
    e.jump = true; e.jt = 0; e.jdur = rnd.int(22, 34); e.jx0 = e.x; e.jy0 = e.y; e.jx1 = nx * TS; e.jy1 = ny * TS; e.jh = rnd.int(10, 22);
  },
  burrow(e) {
    e.st = e.st || 'under';
    e.intangible = e.st === 'under' || e.st === 'rise' || e.st === 'sink';
    e.hidden = e.st === 'under';
    if (e.st === 'under') {
      if (--e.wait > 0) return;
      const p = Game.player, [dx, dy] = DIRS[p.dir];
      const tx = Math.round(p.x / TS) + dx * rnd.int(2, 3), ty = Math.round(p.y / TS) + dy * rnd.int(2, 3);
      if (canEnemyEnter(e, tx, ty) && Game.area.reach && Game.area.reach[ty * COLS + tx]) { e.x = tx * TS; e.y = ty * TS; e.moveLeft = 0; e.dir = OPP[p.dir]; }
      else { const t = randomFloorTile(32); if (!t) { e.wait = 30; return; } e.x = t[0] * TS; e.y = t[1] * TS; e.moveLeft = 0; }
      e.st = 'rise'; e.stT = 40;
    } else if (e.st === 'rise') { if (--e.stT <= 0) { e.st = 'up'; e.stT = rnd.int(120, 200); } }
    else if (e.st === 'up') { gridWalk(e, e.speed, 0.1, e.pal === 'blue' ? 0.4 : 0.15); if (--e.stT <= 0 && aligned(e)) { e.st = 'sink'; e.stT = 30; } }
    else if (e.st === 'sink') { if (--e.stT <= 0) { e.st = 'under'; e.wait = rnd.int(40, 120); } }
  },
  wisp(e) {
    e.phase = e.phase === undefined ? rnd.int(0, 300) : e.phase + 1;
    const cyc = e.phase % 300;
    const spd = cyc < 200 ? Math.min(1.6, cyc / 60) : cyc < 240 ? Math.max(0, 1.6 - (cyc - 200) / 25) : 0;
    e.moving = spd > 0.3;
    e.ang = (e.ang || rnd() * 6.28) + (rnd() - 0.5) * 0.3;
    e.x += Math.cos(e.ang) * spd; e.y += Math.sin(e.ang) * spd;
    const b = playBounds();
    if (e.x < b.x0 * TS || e.x > b.x1 * TS) { e.ang = Math.PI - e.ang; e.x = clamp(e.x, b.x0 * TS, b.x1 * TS); }
    if (e.y < b.y0 * TS || e.y > b.y1 * TS) { e.ang = -e.ang; e.y = clamp(e.y, b.y0 * TS, b.y1 * TS); }
    e.animRate = e.moving ? 2 : 16;
  },
  flitter(e) {
    e.phase = e.phase === undefined ? rnd.int(0, 200) : e.phase + 1;
    const cyc = e.phase % 260;
    const spd = cyc < 180 ? Math.min(2, cyc / 30) : cyc < 210 ? Math.max(0, 2 - (cyc - 180) / 15) : 0;
    e.ang = (e.ang || rnd() * 6.28) + (rnd() - 0.5) * 0.5;
    e.x += Math.cos(e.ang) * spd; e.y += Math.sin(e.ang) * spd;
    const b = playBounds();
    if (e.x < b.x0 * TS || e.x > b.x1 * TS) { e.ang = Math.PI - e.ang; e.x = clamp(e.x, b.x0 * TS, b.x1 * TS); }
    if (e.y < b.y0 * TS || e.y > b.y1 * TS) { e.ang = -e.ang; e.y = clamp(e.y, b.y0 * TS, b.y1 * TS); }
    e.animRate = spd > 0.2 ? 3 : 999;
  },
  shade(e) {
    const p = Game.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t / 40) * 1.2;
    e.x += Math.cos(a) * 0.45; e.y += Math.sin(a) * 0.45;
    e.dir = Math.cos(a) < 0 ? 'left' : 'right';
  },
  snapjaw(e) {
    e.st = e.st || 'hidden';
    e.intangible = e.st !== 'up';
    e.hidden = e.st === 'hidden';
    if (e.st === 'hidden') {
      if (--e.wait > 0) return;
      const w = [];
      for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (tileAt(tx, ty) === T.WATER) w.push([tx, ty]);
      if (!w.length) { e.dead = true; return; }
      const p = Game.player;
      w.sort((a, b) => dist(a[0] * TS, a[1] * TS, p.x, p.y) - dist(b[0] * TS, b[1] * TS, p.x, p.y));
      const pick = w[Math.min(w.length - 1, rnd.int(0, Math.min(8, w.length - 1)))];
      e.x = pick[0] * TS; e.y = pick[1] * TS; e.st = 'ripple'; e.stT = 40;
    } else if (e.st === 'ripple') { if (--e.stT <= 0) { e.st = 'up'; e.stT = 80; } }
    else if (e.st === 'up') { e.stT--; if (e.stT === 50) fireball(e.x + 8, e.y + 8, 0, 1.6); if (e.stT <= 0) { e.st = 'hidden'; e.wait = rnd.int(60, 140); } }
  },
  slime(e) {
    if (e.pause > 0) { e.pause--; return; }
    gridWalk(e, 1, 0.3);
    if (aligned(e)) e.pause = rnd.int(4, 40);
  },
  blob(e) {
    if (e.pause > 0) { e.pause--; return; }
    gridWalk(e, 0.5, 0.25, 0.2);
    if (aligned(e)) e.pause = rnd.int(10, 50);
  },
  walker(e) { gridWalk(e, e.speed, e.def.turn || 0.2, e.def.chase || 0); },
  hook(e) {
    if (e.pause > 0) { e.pause--; return; }
    if (aligned(e) && !e.discOut && (facingPlayer(e, 12) ? rnd.chance(0.6) : rnd.chance(0.04))) {
      e.pause = 30; e.discOut = true;
      const [dx, dy] = DIRS[e.dir];
      const owner = e;
      Game.addEnt(makeEProj('disc_0', e.x + 4, e.y + 4, dx * 2.5, dy * 2.5, e.dmg, 'small', {
        ghost: true,
        update(pj) {
          pj.spr = 'disc_' + ((pj.t >> 2) & 1);
          if (!pj.back && (pj.t > 34 || boxHitsWall(pj.x, pj.y, 8, 8, { water: true }))) pj.back = true;
          if (pj.back) {
            const d = dist(pj.x, pj.y, owner.x + 4, owner.y + 4);
            if (d < 6 || owner.dead) { pj.dead = true; owner.discOut = false; return; }
            pj.vx = (owner.x + 4 - pj.x) / d * 2.5; pj.vy = (owner.y + 4 - pj.y) / d * 2.5;
          }
        },
      }));
      return;
    }
    gridWalk(e, e.speed, 0.2, 0.25);
  },
  viper(e) {
    if (e.charge) {
      const ok = gridWalkCharge(e, 2.5);
      if (!ok) e.charge = false;
      return;
    }
    gridWalk(e, 0.5, 0.2);
    if (aligned(e)) {
      const p = Game.player;
      let d = null;
      if (Math.abs(p.y - e.y) < 8) d = p.x < e.x ? 'left' : 'right';
      else if (Math.abs(p.x - e.x) < 8) d = p.y < e.y ? 'up' : 'down';
      if (d) { e.dir = d; e.charge = true; }
    }
  },
  bulwark(e) { gridWalk(e, e.speed, 0.2, 0.25); },
  hexer(e) {
    e.st = e.st || 'hidden';
    e.intangible = e.st !== 'show';
    e.hidden = e.st === 'hidden';
    if (e.st === 'hidden') {
      if (--e.wait > 0) return;
      const p = Game.player, ptx = Math.round(p.x / TS), pty = Math.round(p.y / TS);
      const opts = [];
      for (const d of DIR_LIST) for (let k = 3; k <= 5; k++) {
        const tx = ptx + DIRS[d][0] * k, ty = pty + DIRS[d][1] * k;
        if (canEnemyEnter({ def: {} }, tx, ty)) opts.push([tx, ty, OPP[d]]);
      }
      if (!opts.length) { e.wait = 20; return; }
      const [tx, ty, fd] = rnd.pick(opts);
      e.x = tx * TS; e.y = ty * TS; e.dir = fd; e.st = 'fade'; e.stT = 28;
    } else if (e.st === 'fade') { if (--e.stT <= 0) { e.st = 'show'; e.stT = 56; } }
    else if (e.st === 'show') {
      e.stT--;
      if (e.stT === 44) { Sound.sfx('magic'); shootStraight(e, 'magic_0', 3, e.dmg, 'magic', 16, 16); }
      if (e.stT <= 0) { e.st = 'hidden'; e.wait = rnd.int(30, 80); }
    }
  },
  grabber(e) {
    e.st = e.st || 'hidden';
    e.hidden = e.st === 'hidden';
    e.intangible = e.st === 'hidden';
    if (e.st === 'hidden') {
      if (--e.wait > 0) return;
      const p = Game.player;
      // rise from the floor beside the player's nearest wall
      const cands = [[p.x, 32], [p.x, 128], [32, p.y], [208, p.y]];
      const [x, y] = cands.sort((a, b) => dist(a[0], a[1], p.x, p.y) - dist(b[0], b[1], p.x, p.y))[rnd.int(0, 1)];
      e.x = clamp(x, 32, 208); e.y = clamp(y, 32, 128); e.st = 'hunt'; e.stT = 220;
    } else if (e.st === 'hunt') {
      const p = Game.player, d = dist(e.x, e.y, p.x, p.y) || 1;
      e.x += (p.x - e.x) / d * 0.65; e.y += (p.y - e.y) / d * 0.65;
      if (--e.stT <= 0) { e.st = 'hidden'; e.wait = rnd.int(60, 180); }
    }
  },
  trap(e) {
    const p = Game.player;
    e.st = e.st || 'idle';
    if (e.st === 'idle') {
      if (Math.abs(p.y - e.y) < 10) { e.st = 'go'; e.vx = p.x < e.x ? -3 : 3; e.vy = 0; }
      else if (Math.abs(p.x - e.x) < 10) { e.st = 'go'; e.vy = p.y < e.y ? -3 : 3; e.vx = 0; }
    } else if (e.st === 'go') {
      e.x += e.vx; e.y += e.vy;
      const midX = Math.abs(e.x - e.hx) >= 88 || e.x < 32 || e.x > 208, midY = Math.abs(e.y - e.hy) >= 40 || e.y < 32 || e.y > 128;
      if ((e.vx && midX) || (e.vy && midY)) { e.st = 'back'; e.x = clamp(e.x, 32, 208); e.y = clamp(e.y, 32, 128); }
    } else {
      const d = dist(e.x, e.y, e.hx, e.hy);
      if (d < 1) { e.x = e.hx; e.y = e.hy; e.st = 'idle'; } else { e.x += (e.hx - e.x) / d; e.y += (e.hy - e.y) / d; }
    }
  },
  dhead(e) { // detached flying dragon head
    e.ang = (e.ang || rnd() * 6.28) + (rnd() - 0.5) * 0.25;
    e.x += Math.cos(e.ang) * 1.2; e.y += Math.sin(e.ang) * 1.2;
    if (e.x < 32 || e.x > 208) { e.ang = Math.PI - e.ang; e.x = clamp(e.x, 32, 208); }
    if (e.y < 32 || e.y > 128) { e.ang = -e.ang; e.y = clamp(e.y, 32, 128); }
    if (rnd.chance(0.008)) fireball(e.x + 8, e.y + 8);
  },
};
function gridWalkCharge(e, speed) {
  if (e.moveLeft <= 0) {
    e.x = Math.round(e.x / TS) * TS; e.y = Math.round(e.y / TS) * TS;
    if (!canEnemyEnter(e, e.x / TS + DIRS[e.dir][0], e.y / TS + DIRS[e.dir][1])) return false;
    e.moveLeft = TS;
  }
  const [dx, dy] = DIRS[e.dir];
  const st = Math.min(speed, e.moveLeft);
  e.x += dx * st; e.y += dy * st; e.moveLeft -= st;
  return true;
}

// ---------------------------------------------------------------------------
// boss routines
// ---------------------------------------------------------------------------
const BOSS = {
  thornhorn: {
    init(e) { e.x = 176; e.y = 64; e.w = 32; e.h = 32; e.vx = 0.35; e.mouth = 0; },
    ai(e) {
      e.x += e.vx;
      if (e.x < 150 || e.x > 192) e.vx = -e.vx;
      if (e.t % 95 === 0) { e.mouth = 26; Sound.sfx('roar'); for (const a of [-0.3, 0, 0.3]) fireball(e.x + 6, e.y + 10, a, 1.8); }
      if (e.mouth > 0) e.mouth--;
    },
    draw(e, pal) { drawSpr(e.mouth > 0 ? 'thornhorn_1' : 'thornhorn_0', e.x, e.y + HUD_H, { pal }); },
  },
  coilworm: {
    init(e) { e.ang = rnd.pick([0.785, 2.356, 3.927, 5.498]); e.hist = []; e.segs = 5; e.turnT = 60; e.x = 112; e.y = 64; },
    ai(e) {
      const sp = 0.9 + (1 - e.hp / e.maxHp) * 1.3;
      if (--e.turnT <= 0) { e.ang = rnd.int(0, 7) * Math.PI / 4; e.turnT = rnd.int(30, 90); }
      e.x += Math.cos(e.ang) * sp; e.y += Math.sin(e.ang) * sp;
      if (e.x < 32 || e.x > 208) { e.ang = Math.PI - e.ang; e.x = clamp(e.x, 32, 208); }
      if (e.y < 32 || e.y > 128) { e.ang = -e.ang; e.y = clamp(e.y, 32, 128); }
      e.hist.unshift([e.x, e.y]);
      if (e.hist.length > 80) e.hist.pop();
    },
    segPos(e) { const out = []; for (let i = 1; i < e.segs; i++) { const h = e.hist[Math.min(e.hist.length - 1, i * 10)]; if (h) out.push(h); } return out; },
    parts(e) { return [{ x: e.x + 1, y: e.y + 1, w: 14, h: 14, id: 0 }, ...BOSS.coilworm.segPos(e).map(([x, y]) => ({ x: x + 2, y: y + 2, w: 12, h: 12, id: 0 }))]; },
    draw(e, pal) { const s = BOSS.coilworm.segPos(e); for (let i = s.length - 1; i >= 0; i--) drawSpr('coil_body', s[i][0], s[i][1] + HUD_H, { pal }); drawSpr('coil_head', e.x, e.y + HUD_H, { pal }); },
  },
  hydra: {
    init(e) { e.x = 120; e.y = 72; e.vx = 0.6; e.vy = 0.6; e.heads = [0, 1, 2, 3].map(i => ({ i, hp: 3, alive: true, ph: i * 25 })); e.hp = e.maxHp = 12 * (Game.save.quest > 1 ? 1.5 : 1); e.heads.forEach(h => h.hp = e.maxHp / 4); },
    offs: [[0, -16], [16, 0], [0, 16], [-16, 0]],
    ai(e) {
      const alive = e.heads.filter(h => h.alive).length;
      const sp = 0.5 + (4 - alive) * 0.45;
      e.x += Math.sign(e.vx) * sp; e.y += Math.sign(e.vy) * sp;
      if (e.x < 48 || e.x > 192) { e.vx = -e.vx; e.x = clamp(e.x, 48, 192); }
      if (e.y < 48 || e.y > 112) { e.vy = -e.vy; e.y = clamp(e.y, 48, 112); }
      if (rnd.chance(0.02)) e.vx = -e.vx;
      if (rnd.chance(0.02)) e.vy = -e.vy;
      for (const h of e.heads) if (h.alive && (e.t + h.ph) % 120 === 0) { const [ox, oy] = BOSS.hydra.offs[h.i]; fireball(e.x + ox + 8, e.y + oy + 8); }
    },
    parts(e) {
      const out = [{ x: e.x + 2, y: e.y + 2, w: 12, h: 12, id: -1 }];
      for (const h of e.heads) if (h.alive) { const [ox, oy] = BOSS.hydra.offs[h.i]; out.push({ x: e.x + ox + 1, y: e.y + oy + 1, w: 14, h: 14, id: h.i }); }
      return out;
    },
    hurt(e, a, src, part) {
      if (part < 0) return 0;
      const h = e.heads[part]; if (!h || !h.alive) return null;
      const d = Math.min(a, h.hp); h.hp -= d;
      if (h.hp <= 0) { h.alive = false; const [ox, oy] = BOSS.hydra.offs[h.i]; Game.addEnt(makePuff(e.x + ox, e.y + oy)); Sound.sfx('enemydie'); }
      return d;
    },
    draw(e, pal) {
      drawSpr('hydra_core', e.x, e.y + HUD_H, { pal: 'green' });
      for (const h of e.heads) if (h.alive) { const [ox, oy] = BOSS.hydra.offs[h.i]; drawSpr('hydra_head_' + (((e.t + h.ph) % 120) < 60 ? 1 : 0), e.x + ox, e.y + oy + HUD_H, { pal, rot: [0, 1, 2, 3][h.i] }); }
    },
  },
  pulsar: {
    init(e) { e.x = 112; e.y = 40; e.w = 32; e.h = 16; e.vx = 0.5; },
    ai(e) {
      e.x += e.vx;
      if (e.x < 32 || e.x > 192) e.vx = -e.vx;
      if (e.t % 25 === 0 && rnd.chance(0.3)) e.vy = rnd.pick([-0.3, 0, 0.3]);
      e.y = clamp(e.y + (e.vy || 0), 36, 72);
      const c = e.t % 200;
      e.open = c >= 120 && c < 190;
      if (e.t % 80 === 40) fireball(e.x + 16, e.y + 10);
    },
    hurt(e, a, src) {
      if (!e.open) return 0;
      if (src && (src.kind === 'arrow' || src.kind === 'star')) return 3;
      return a;
    },
    draw(e, pal) { drawSpr(e.open ? 'pulsar_open' : 'pulsar_closed', e.x, e.y + HUD_H, { pal }); },
  },
  dragon: {
    init(e) {
      e.x = 112; e.y = 32; e.w = 32; e.h = 32;
      const n = Game.save.quest > 1 ? 5 : 4;
      e.heads = []; for (let i = 0; i < n; i++) e.heads.push({ i, hp: 4, alive: true, x: 0, y: 0 });
      e.hp = e.maxHp = n * 4;
      BOSS.dragon.place(e);
    },
    place(e) {
      const n = e.heads.length;
      for (const h of e.heads) {
        const ax = 120 + (h.i - (n - 1) / 2) * 30;
        h.x = ax + Math.sin(e.t / 28 + h.i * 1.7) * 18;
        h.y = 76 + Math.cos(e.t / 37 + h.i) * 14;
      }
    },
    ai(e) {
      BOSS.dragon.place(e);
      for (const h of e.heads) if (h.alive && rnd.chance(0.006)) fireball(h.x + 8, h.y + 8);
    },
    parts(e) {
      const out = [{ x: e.x, y: e.y, w: 32, h: 28, id: -1 }];
      for (const h of e.heads) if (h.alive) out.push({ x: h.x + 1, y: h.y + 1, w: 14, h: 14, id: h.i });
      return out;
    },
    hurt(e, a, src, part) {
      if (part < 0) return 0;
      const h = e.heads[part]; if (!h || !h.alive) return null;
      const d = Math.min(a, h.hp); h.hp -= d;
      if (h.hp <= 0) {
        h.alive = false;
        if (e.heads.some(o => o.alive)) { const fh = makeEnemy('dhead', h.x, h.y); fh.parentBoss = e; Game.addEnt(fh); }
      }
      return d;
    },
    draw(e, pal) {
      drawSpr('dragon_body', e.x, e.y + HUD_H, { pal });
      for (const h of e.heads) {
        if (!h.alive) continue;
        for (let k = 1; k <= 3; k++) { const q = k / 4; drawSpr('dragon_neck', 124 + (h.x + 4 - 124) * q, 58 + (h.y + 4 - 58) * q + HUD_H, { pal }); }
        drawSpr('dragon_head_' + ((e.t >> 4) & 1), h.x, h.y + HUD_H, { pal });
      }
    },
  },
  beast: {
    init(e) { e.x = 104; e.y = 64; e.w = 32; e.h = 32; e.dir = 'right'; e.eat = 0; e.turnT = 90; },
    ai(e) {
      if (e.eat > 0) { e.eat--; return; }
      const bomb = Game.ents.find(b => b.tag === 'bomb' && !b.boom && dist(b.x, b.y, e.x + 8, e.y + 8) < 72);
      if (bomb) {
        e.dir = dirTo(e.x + 8, e.y + 8, bomb.x, bomb.y);
        if (overlap({ x: e.x + 4, y: e.y + 4, w: 24, h: 24 }, bomb)) { bomb.dead = true; e.eat = 160; Sound.sfx('roar'); Game.shake = 8; return; }
      } else if (--e.turnT <= 0) { e.dir = rnd.pick(DIR_LIST); e.turnT = rnd.int(50, 120); }
      const [dx, dy] = DIRS[e.dir];
      const nx = e.x + dx * 0.5, ny = e.y + dy * 0.5;
      if (nx < 32 || nx > 192 || ny < 32 || ny > 112) { e.dir = OPP[e.dir]; } else { e.x = nx; e.y = ny; }
      if (e.t % 600 === 300 && Game.save.bombs === 0 && !Game.ents.some(p => p.tag === 'pickup' && p.kind === 'bomb')) {
        const t = randomFloorTile(32); if (t) Game.addEnt(makePickup('bomb', t[0] * TS + 8, t[1] * TS + 8, { life: 900 }));
      }
    },
    hurt(e, a, src) {
      if (src && src.kind === 'bomb') { e.eat = Math.max(e.eat, 100); return 2; }
      if (e.eat > 0) return a;
      return 0;
    },
    draw(e, pal) { drawSpr(e.eat > 0 ? 'beast_eat' : 'beast_' + ((e.t >> 4) & 1), e.x, e.y + HUD_H, { pal, flipX: e.dir === 'left' }); },
  },
  orbit: {
    init(e) {
      e.cx = 120; e.cy = 80; e.ang = 0;
      e.mins = []; for (let i = 0; i < 8; i++) e.mins.push({ i, hp: 2, alive: true, x: 0, y: 0 });
      e.eyeHp = 6 * (Game.save.quest > 1 ? 1.5 : 1);
      e.hp = e.maxHp = 16 + e.eyeHp;
      BOSS.orbit.place(e);
    },
    place(e) {
      e.x = 112 + Math.sin(e.t / 97) * 72; e.y = 72 + Math.sin(e.t / 61) * 36;
      const r = 30 + Math.sin(e.t / 45) * 14;
      for (const m of e.mins) { const a = e.ang + m.i * Math.PI / 4; m.x = e.x + Math.cos(a) * r; m.y = e.y + Math.sin(a) * r; }
    },
    ai(e) {
      e.ang += 0.035;
      BOSS.orbit.place(e);
      if (e.t % 140 === 0 && !e.mins.some(m => m.alive)) fireball(e.x + 8, e.y + 8);
    },
    parts(e) {
      const anyMin = e.mins.some(m => m.alive);
      const out = [{ x: e.x + 1, y: e.y + 1, w: 14, h: 14, id: anyMin ? -1 : 99 }];
      for (const m of e.mins) if (m.alive) out.push({ x: m.x + 2, y: m.y + 2, w: 12, h: 12, id: m.i });
      return out;
    },
    hurt(e, a, src, part) {
      if (part === -1) return 0;
      if (part === 99) { const d = Math.min(a, e.eyeHp); e.eyeHp -= d; return d; }
      const m = e.mins[part]; if (!m || !m.alive) return null;
      const d = Math.min(a, m.hp); m.hp -= d;
      if (m.hp <= 0) { m.alive = false; Game.addEnt(makePuff(m.x, m.y)); Sound.sfx('enemydie'); }
      return d;
    },
    draw(e, pal) {
      drawSpr('orbit_eye', e.x, e.y + HUD_H, { pal });
      for (const m of e.mins) if (m.alive) drawSpr('orbit_minion', m.x, m.y + HUD_H, { pal });
    },
  },
  king: {
    init(e) { e.x = 112; e.y = 56; e.w = 32; e.h = 32; e.stam = 8; e.stunT = 0; e.flash = 60; e.hp = e.maxHp = 1; e.tp = 60; },
    ai(e) {
      if (e.flash > 0) e.flash--;
      if (e.stunT > 0) {
        if (--e.stunT === 0) { e.stam = 8; e.flash = 30; }
        return;
      }
      if (--e.tp <= 0) {
        const p = Game.player;
        let x, y, n = 0;
        do { x = rnd.int(32, 192); y = rnd.int(32, 112); } while (dist(x, y, p.x, p.y) < 56 && ++n < 30);
        e.x = x; e.y = y; e.flash = 14; e.tp = rnd.int(80, 130); e.shoot = 20;
        Sound.sfx('warp');
      }
      if (e.shoot > 0 && --e.shoot === 0) { const n = Game.save.quest > 1 ? 3 : 2; for (let i = 0; i < n; i++) fireball(e.x + 16, e.y + 12, (i - (n - 1) / 2) * 0.25, 2.2); }
    },
    hurt(e, a, src) {
      if (e.stunT > 0) {
        if (src && src.kind === 'star') return 1;
        if (!Game.save.items.stararrow) Game.toast('ONLY STARLIGHT CAN END HIM!', 120);
        return 0;
      }
      if (src && (src.kind === 'sword' || src.kind === 'beam' || src.kind === 'magic')) {
        e.stam -= a; e.flash = 20;
        Sound.sfx('bosshit');
        if (e.stam <= 0) { e.stunT = 420; Sound.sfx('roar'); }
        return -2;
      }
      return 0;
    },
    draw(e) {
      const vis = e.stunT > 0 || e.flash > 0 || e.t % 90 < 3;
      if (!vis) return;
      drawSpr('king_' + ((e.t >> 4) & 1), e.x, e.y + HUD_H, { pal: e.stunT > 0 ? ((e.stunT < 90 && (e.t >> 2) & 1) ? 'purple' : 'brown') : 'purple', alpha: e.stunT > 0 ? 1 : 0.85 });
    },
  },
};

// ---------------------------------------------------------------------------
// definitions
// ---------------------------------------------------------------------------
// spr: base sprite; dirs: 'df' (down+right, flip for up/left) | 'd4' (down/up/right) | undefined (animated _0/_1)
const ENEMY_DEFS = {
  thorn: { spr: 'thorn', dirs: 'df', pal: 'red', hp: 1, dmg: 1, speed: 0.5, ai: 'thorn' },
  thornB: { spr: 'thorn', dirs: 'df', pal: 'blue', hp: 2, dmg: 1, speed: 1, ai: 'thorn' },
  spear: { spr: 'spear', dirs: 'd4', pal: 'red', hp: 2, dmg: 1, speed: 0.5, ai: 'spear' },
  spearB: { spr: 'spear', dirs: 'd4', pal: 'blue', hp: 3, dmg: 2, speed: 0.75, ai: 'spear' },
  knight: { spr: 'knight', dirs: 'd4', pal: 'red', hp: 6, dmg: 2, speed: 1, ai: 'knight' },
  knightB: { spr: 'knight', dirs: 'd4', pal: 'blue', hp: 10, dmg: 4, speed: 1, ai: 'knight' },
  skitter: { spr: 'skitter', pal: 'red', hp: 1, dmg: 1, ai: 'skitter', fly: true, animRate: 12 },
  skitterB: { spr: 'skitter', pal: 'blue', hp: 2, dmg: 1, ai: 'skitter', fly: true, animRate: 12 },
  burrow: { spr: 'burrow', pal: 'red', hp: 2, dmg: 1, speed: 0.5, ai: 'burrow' },
  burrowB: { spr: 'burrow', pal: 'blue', hp: 4, dmg: 2, speed: 0.75, ai: 'burrow' },
  wisp: { spr: 'wisp', pal: 'red', hp: 2, dmg: 1, ai: 'wisp', fly: true, hurt: (e, a) => e.moving ? 0 : a },
  shade: { spr: 'shade_right', pal: 'white', hp: 9, dmg: 2, ai: 'shade', fly: true, faceFlip: true },
  snapjaw: { spr: 'snapjaw', pal: 'green', hp: 2, dmg: 2, ai: 'snapjaw', fly: true, heavy: true },
  slime: { spr: 'slime', pal: 'green', hp: 1, dmg: 1, ai: 'slime', discKills: true, animRate: 6 },
  blob: { spr: 'blob', pal: 'green', hp: 2, dmg: 2, ai: 'blob', split: 'slime' },
  flitter: { spr: 'flitter', pal: 'blue', hp: 1, dmg: 1, ai: 'flitter', fly: true, discKills: true },
  bone: { spr: 'bone', pal: 'white', hp: 2, dmg: 1, speed: 0.75, ai: 'walker', turn: 0.25 },
  hook: { spr: 'hook', dirs: 'd4', pal: 'red', hp: 3, dmg: 1, speed: 0.75, ai: 'hook' },
  hookB: { spr: 'hook', dirs: 'd4', pal: 'blue', hp: 5, dmg: 2, speed: 0.75, ai: 'hook' },
  viper: { spr: 'viper', pal: 'orange', hp: 1, dmg: 1, speed: 0.5, ai: 'viper', faceFlip: true },
  bulwark: { spr: 'bulwark', dirs: 'd4', pal: 'red', hp: 4, dmg: 2, speed: 0.6, ai: 'bulwark', shielded: true },
  bulwarkB: { spr: 'bulwark', dirs: 'd4', pal: 'blue', hp: 8, dmg: 4, speed: 0.75, ai: 'bulwark', shielded: true },
  hexer: { spr: 'hexer', dirs: 'd4', single: true, pal: 'red', hp: 3, dmg: 2, ai: 'hexer' },
  hexerB: { spr: 'hexer', dirs: 'd4', single: true, pal: 'blue', hp: 5, dmg: 4, ai: 'hexer' },
  wrapped: { spr: 'wrapped', pal: 'white', hp: 7, dmg: 2, speed: 0.5, ai: 'walker', chase: 0.15 },
  grabber: { spr: 'grabber', pal: 'dark', hp: 2, dmg: 1, ai: 'grabber', fly: true, grab: true },
  trap: { spr: 'trap', noAnim: true, pal: 'gray', hp: 99, dmg: 2, ai: 'trap', fly: true, noCount: true, heavy: true, hurt: () => null },
  dhead: { spr: 'dragon_head', pal: 'green', hp: 99, dmg: 2, ai: 'dhead', fly: true, noCount: true, heavy: true, hurt: () => 0 },
  thornhorn: { boss: 'thornhorn', pal: 'green', hp: 6, dmg: 2, fly: true, heavy: true },
  coilworm: { boss: 'coilworm', pal: 'red', hp: 8, dmg: 2, fly: true, heavy: true },
  coilworm2: { boss: 'coilworm', pal: 'purple', hp: 7, dmg: 2, fly: true, heavy: true },
  hydra: { boss: 'hydra', pal: 'red', hp: 12, dmg: 2, fly: true, heavy: true },
  pulsar: { boss: 'pulsar', pal: 'orange', hp: 6, dmg: 2, fly: true, heavy: true },
  dragon: { boss: 'dragon', pal: 'green', hp: 16, dmg: 2, fly: true, heavy: true },
  beast: { boss: 'beast', pal: 'brown', hp: 6, dmg: 2, fly: true, heavy: true },
  orbit: { boss: 'orbit', pal: 'blue', hp: 22, dmg: 2, fly: true, heavy: true },
  king: { boss: 'king', pal: 'purple', hp: 1, dmg: 4, fly: true, heavy: true },
};

function makeEnemy(type, x, y) {
  const def = ENEMY_DEFS[type];
  const q = Game.save && Game.save.quest > 1;
  const e = {
    tag: 'enemy', type, def, x, y, w: 16, h: 16, hp: Math.ceil(def.hp * (q && def.hp < 50 ? 1.5 : 1)), dmg: def.dmg * (q ? 2 : 1) / (q ? 1.5 : 1),
    pal: def.pal, dir: rnd.pick(DIR_LIST), t: rnd.int(0, 30), inv: 0, kb: null, stun: 0, dead: false, moveLeft: 0,
    speed: (def.speed || 0.5) * (q ? 1.25 : 1), pause: 0, wait: rnd.int(20, 90), spawnT: 0,
  };
  e.maxHp = e.hp;
  if (def.boss) { e.bossDef = BOSS[def.boss]; e.boss = true; e.bossDef.init(e); }
  e.update = () => enemyUpdate(e);
  e.draw = () => drawEnemy(e);
  return e;
}

function enemyParts(e) {
  // vulnerable parts first, so a hit overlapping a shielded core still lands on the weak point
  if (e.bossDef && e.bossDef.parts) return e.bossDef.parts(e).sort((p, q) => (p.id < 0) - (q.id < 0));
  return [{ x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 4, id: 0 }];
}

function enemyUpdate(e) {
  if (e.spawnT > 0) { e.spawnT--; return; }
  e.t++;
  if (e.inv > 0) e.inv--;
  if (Game.clockFreeze && !e.boss && e.type !== 'trap') return;
  if (e.kb) {
    const [dx, dy] = DIRS[e.kb.dir];
    for (let i = 0; i < 4; i++) {
      const nx = e.x + dx, ny = e.y + dy;
      const b = playBounds();
      if (nx < b.x0 * TS || ny < b.y0 * TS || nx > b.x1 * TS || ny > b.y1 * TS || (!e.def.fly && boxHitsWall(nx + 1, ny + 1, 14, 14))) { e.kb.t = 0; break; }
      e.x = nx; e.y = ny;
    }
    if (--e.kb.t <= 0) {
      e.kb = null;
      if (e.moveLeft !== undefined && !e.def.fly) {
        const sx = Math.round(e.x / TS), sy = Math.round(e.y / TS);
        if (canEnemyEnter(e, sx, sy)) { e.x = sx * TS; e.y = sy * TS; } else if (e.lastTile) { e.x = e.lastTile[0] * TS; e.y = e.lastTile[1] * TS; }
        e.moveLeft = 0;
      }
    }
    return;
  }
  if (e.stun > 0) { e.stun--; return; }
  if (e.bossDef) e.bossDef.ai(e);
  else AI[e.def.ai](e);
}

// returns true if the hit "connected" (so piercing projectiles know)
function damageEnemy(e, amount, src, partId, srcDir) {
  if (e.dead || e.inv > 0 || e.spawnT > 0 || e.intangible) return false;
  if (src && src.kind === 'disc') {
    if (e.def.discKills) { e.hp = 0; killEnemy(e); return true; }
    if (!e.boss && e.type !== 'trap' && e.type !== 'dhead') { e.stun = 100; Sound.sfx('hit'); e.inv = 10; return true; }
    Sound.sfx('shield'); return true;
  }
  let a = amount;
  if (e.def.shielded && srcDir && srcDir === OPP[e.dir] && (!src || src.kind !== 'bomb' && src.kind !== 'fire')) a = 0;
  if (e.bossDef && e.bossDef.hurt) a = e.bossDef.hurt(e, a, src, partId, srcDir);
  else if (e.def.hurt) a = e.def.hurt(e, a, src, partId, srcDir);
  if (a === null || a === undefined) return false;
  if (a === 0) { Sound.sfx('shield'); e.inv = 10; Game.addEnt(makeSparkFx(e.x + e.w / 2 - 4, e.y + e.h / 2 - 4)); return true; }
  e.inv = e.boss ? 20 : 16;
  if (a > 0) e.hp -= a;
  Sound.sfx(e.boss ? 'bosshit' : 'hit');
  if (!e.def.heavy && srcDir) e.kb = { dir: srcDir, t: 6 };
  if (e.hp <= 0) killEnemy(e);
  return true;
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  if (e.boss) { Game.bossDefeated(e); return; }
  Sound.sfx('enemydie');
  Game.addEnt(makePuff(e.x + e.w / 2 - 8, e.y + e.h / 2 - 8));
  if (e.def.split) {
    for (const o of [-6, 6]) { const s = makeEnemy(e.def.split, e.x, e.y); s.x = Math.round(e.x / TS) * TS; s.y = Math.round(e.y / TS) * TS; s.inv = 20; s.pause = 20 + (o > 0 ? 10 : 0); Game.addEnt(s); }
  } else if (e.type !== 'trap' && e.type !== 'dhead') rollDrop(e.x + 8, e.y + 8);
  Game.checkRoomClear();
}

function drawEnemy(e) {
  if (e.dead) return;
  const ox = Game.shakeX || 0;
  if (e.spawnT > 0) { drawSpr('puff_' + Math.min(2, ((18 - e.spawnT) / 6) | 0), e.x + ox, e.y + HUD_H); return; }
  let pal = e.pal;
  if (e.inv > 0 && (e.inv >> 1) & 1) pal = (e.inv >> 2) & 1 ? 'white' : 'gold';
  if (e.bossDef) { e.bossDef.draw(e, pal); return; }
  const d = e.def, y = e.y + HUD_H, x = e.x;
  if (e.type === 'burrow' || e.type === 'burrowB') {
    if (e.st === 'under') return;
    if (e.st === 'rise' || e.st === 'sink') { drawSpr('burrow_mound', x, y); return; }
  }
  if (e.type === 'snapjaw') {
    if (e.st === 'hidden') return;
    if (e.st === 'ripple') { drawSpr('snapjaw_ripple', x, y); return; }
    drawSpr('snapjaw_' + (e.stT < 56 && e.stT > 40 ? 1 : 0), x, y, { pal }); return;
  }
  if (e.hidden) return;
  if ((e.type === 'hexer' || e.type === 'hexerB') && e.st === 'fade' && (e.t >> 1) & 1) return;
  const f = (e.t / (d.animRate || e.animRate || 8) | 0) & 1;
  if (d.dirs === 'df') {
    const vert = e.dir === 'up' || e.dir === 'down';
    drawSpr(d.spr + (vert ? '_down_' : '_right_') + f, x, y, { pal, flipY: e.dir === 'up', flipX: e.dir === 'left' });
  } else if (d.dirs === 'd4') {
    const base = e.dir === 'left' ? 'right' : e.dir;
    drawSpr(d.spr + '_' + base + (d.single ? '' : '_' + f), x, y, { pal, flipX: e.dir === 'left' });
  } else {
    drawSpr(d.noAnim ? d.spr : d.spr + '_' + f, x, y, { pal, flipX: d.faceFlip && e.dir === 'left' });
  }
}
