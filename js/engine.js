// ============================================================================
// THE HOLLOW CROWN — engine core: canvas, input, rng, font, drawing helpers
// ============================================================================
'use strict';

const SCREEN_W = 256, SCREEN_H = 240, TS = 16, HUD_H = 64;
const COLS = 16, ROWS = 11, PLAY_H = ROWS * TS; // 176
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_LIST = ['up', 'down', 'left', 'right'];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

let canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('screen');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const fit = () => {
    const wrap = document.getElementById('wrap');
    const availW = wrap.clientWidth, availH = wrap.clientHeight;
    let s = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    if (s >= 2) s = Math.floor(s);
    canvas.style.width = Math.floor(SCREEN_W * s) + 'px';
    canvas.style.height = Math.floor(SCREEN_H * s) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();
}

// ---------------------------------------------------------------------------
// RNG (deterministic)
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return f;
}
const rnd = makeRng((Date.now() ^ 0x5eed) >>> 0); // gameplay randomness

// ---------------------------------------------------------------------------
// Input: keyboard + gamepad + touch, mapped to NES-like buttons
// ---------------------------------------------------------------------------
const Input = {
  held: { up: false, down: false, left: false, right: false, a: false, b: false, start: false, select: false },
  pressed: {},
  dirOrder: [],
  typed: [],
  _kb: {}, _pad: {}, _touch: {},
  anyPressed() { return Object.keys(this.pressed).some(k => this.pressed[k]); },
};
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', KeyJ: 'a', Space: 'a', KeyX: 'b', KeyK: 'b', Enter: 'start', KeyP: 'start', ShiftLeft: 'select', ShiftRight: 'select', Tab: 'select',
};
let onFirstInput = null;
window.addEventListener('keydown', e => {
  if (onFirstInput) onFirstInput();
  if (e.key && e.key.length === 1) Input.typed.push(e.key);
  else if (e.key === 'Backspace') Input.typed.push('\b');
  else if (e.key === 'Enter') Input.typed.push('\n');
  if (e.code === 'KeyM' && !e.repeat && typeof Game !== 'undefined' && Game.state !== 'name') Sound.toggleMute();
  const b = KEYMAP[e.code];
  if (b) { Input._kb[b] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => { const b = KEYMAP[e.code]; if (b) Input._kb[b] = false; });
window.addEventListener('blur', () => { Input._kb = {}; Input._touch = {}; });
window.addEventListener('pointerdown', () => { if (onFirstInput) onFirstInput(); });

let gamepadBlocked = false;
function pollGamepad() {
  // getGamepads throws when a permissions policy (e.g. a sandboxed iframe) disallows it;
  // fall back to keyboard/touch only instead of failing every frame.
  if (gamepadBlocked || !navigator.getGamepads) return;
  let pads;
  try { pads = navigator.getGamepads() || []; }
  catch (err) { gamepadBlocked = true; Input._pad = {}; return; }
  const p = {};
  for (const gp of pads) {
    if (!gp) continue;
    const bt = i => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes || [];
    p.up = p.up || bt(12) || ax[1] < -0.5;
    p.down = p.down || bt(13) || ax[1] > 0.5;
    p.left = p.left || bt(14) || ax[0] < -0.5;
    p.right = p.right || bt(15) || ax[0] > 0.5;
    p.a = p.a || bt(0) || bt(3);
    p.b = p.b || bt(1) || bt(2);
    p.start = p.start || bt(9);
    p.select = p.select || bt(8);
    if (Object.values(p).some(v => v) && onFirstInput) onFirstInput();
  }
  Input._pad = p;
}

function updateInput() {
  pollGamepad();
  for (const k in Input.held) {
    const now = !!(Input._kb[k] || Input._pad[k] || Input._touch[k]);
    Input.pressed[k] = now && !Input.held[k];
    Input.held[k] = now;
    if (DIRS[k]) {
      const i = Input.dirOrder.indexOf(k);
      if (now && i < 0) Input.dirOrder.push(k);
      if (!now && i >= 0) Input.dirOrder.splice(i, 1);
    }
  }
}
// most recently pressed held direction
function heldDir() { return Input.dirOrder.length ? Input.dirOrder[Input.dirOrder.length - 1] : null; }

function setupTouch() {
  const pad = document.getElementById('touch');
  if (!pad) return;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  pad.style.display = 'block';
  document.body.classList.add('touch');
  pad.querySelectorAll('[data-btn]').forEach(el => {
    const btns = el.dataset.btn.split(',');
    const on = e => { e.preventDefault(); if (onFirstInput) onFirstInput(); btns.forEach(b => Input._touch[b] = true); };
    const off = e => { e.preventDefault(); btns.forEach(b => Input._touch[b] = false); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
  });
}

// ---------------------------------------------------------------------------
// Bitmap font (5x7 in 8x8 cells)
// ---------------------------------------------------------------------------
const FONT_SRC = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  "'": '00100 00100 01000 00000 00000 00000 00000', '-': '00000 00000 00000 11111 00000 00000 00000',
  ':': '00000 01100 01100 00000 01100 01100 00000', '/': '00001 00010 00010 00100 01000 01000 10000',
  '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000',
  '+': '00000 00100 00100 11111 00100 00100 00000', '=': '00000 00000 11111 00000 11111 00000 00000',
  '>': '01000 00100 00010 00001 00010 00100 01000', '<': '00010 00100 01000 10000 01000 00100 00010',
  '"': '01010 01010 00000 00000 00000 00000 00000', '&': '01100 10010 10100 01000 10101 10010 01101',
  '*': '00000 10101 01110 11111 01110 10101 00000', x: '00000 00000 10001 01010 00100 01010 10001',
  '#': '00100 01110 11111 11111 11111 01110 00100', '@': '01110 10001 10111 10101 10111 10000 01110',
  '^': '00100 01110 10101 00100 00100 00100 00100', '_': '00000 00000 00000 00000 00000 00000 11111',
};
const FONT_CHARS = Object.keys(FONT_SRC);
const _fontCache = {};
function fontAtlas(color) {
  if (_fontCache[color]) return _fontCache[color];
  const c = document.createElement('canvas');
  c.width = FONT_CHARS.length * 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = color;
  FONT_CHARS.forEach((ch, i) => {
    const rows = FONT_SRC[ch].split(' ');
    rows.forEach((r, y) => { for (let x = 0; x < 5; x++) if (r[x] === '1') g.fillRect(i * 8 + x + 1, y, 1, 1); });
  });
  _fontCache[color] = c;
  return c;
}
const _fontIndex = {};
FONT_CHARS.forEach((ch, i) => _fontIndex[ch] = i);
function drawText(str, x, y, color = '#fcfcfc', scale = 1) {
  const atlas = fontAtlas(color);
  str = String(str);
  for (let i = 0; i < str.length; i++) {
    let ch = str[i];
    if (ch !== 'x') ch = ch.toUpperCase();
    const idx = _fontIndex[ch];
    if (idx === undefined) continue;
    ctx.drawImage(atlas, idx * 8, 0, 8, 8, Math.round(x + i * 8 * scale), Math.round(y), 8 * scale, 8 * scale);
  }
}
function drawTextC(str, cx, y, color, scale = 1) { drawText(str, cx - String(str).length * 4 * scale, y, color, scale); }
function drawTextShadow(str, x, y, color, scale = 1) { drawText(str, x + scale, y + scale, '#000', scale); drawText(str, x, y, color, scale); }
// word-wrap to a max number of chars per line
function wrapText(str, max) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if ((line + (line ? ' ' : '') + w).length > max) { out.push(line); line = w; }
      else line += (line ? ' ' : '') + w;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sprite drawing (sprites.js provides getSprite)
// ---------------------------------------------------------------------------
function drawSpr(name, x, y, o) {
  const img = getSprite(name, o && o.pal);
  if (!img) return;
  x = Math.round(x); y = Math.round(y);
  if (!o || (!o.flipX && !o.flipY && !o.rot && o.alpha === undefined)) { ctx.drawImage(img, x, y); return; }
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const w = img.width, h = img.height;
  const rot = (o.rot || 0) & 3;
  const bw = rot & 1 ? h : w, bh = rot & 1 ? w : h; // bounding box after rotation
  ctx.translate(x + bw / 2, y + bh / 2);
  if (rot) ctx.rotate(rot * Math.PI / 2);
  ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();
}
// weapon sprites point up; rotation for a facing direction
const DIR_ROT = { up: 0, right: 1, down: 2, left: 3 };

// ---------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function dirTo(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }
function key2(x, y) { return x + ',' + y; }
