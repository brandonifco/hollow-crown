/*
 * The Hollow Crown -- audio.js
 * All music and sound effects, synthesized live with the Web Audio API in an
 * NES-like style: two pulse leads (12.5% / 25% / 50% duty), a triangle bass and
 * an LFSR noise channel. No samples, no external files. All melodies are
 * original compositions for this game.
 *
 * Public API (global `Sound`):
 *   Sound.init()              create/resume the AudioContext (call on first user input)
 *   Sound.sfx(name)           one-shot effect (unknown names are ignored)
 *   Sound.music(name)         start a looping track ('' / null stops)
 *   Sound.stopMusic()
 *   Sound.jingle(name, then)  non-looping jingle; music pauses and resumes afterwards
 *   Sound.lowHealth(on)       repeating low-health beep while on
 *   Sound.toggleMute()        returns the new muted state
 *   Sound.muted, Sound.current
 * Every entry point is safe before init() and never throws.
 *
 * Track note format (one string per voice, parsed once):
 *   NOTE[:DUR]   e.g. E4:8  C#5:4.  Bb3:2   (DUR = 1,2,4,8,16,32 ; '.' = dotted)
 *   r[:DUR]      rest
 *   noise voice: k (kick) s (snare) h (closed hat) o (open hat) c (crash) m (metallic tick)
 *   A missing :DUR reuses the previous duration in that voice.
 *   [ ... ]xN    repeat N times (nestable);  '|' is a bar line (ignored, checked by tools/check_audio.py)
 */
(function (root) {
  'use strict';

  var MASTER_VOL = 0.25, MUSIC_VOL = 0.55, JINGLE_VOL = 0.65, SFX_VOL = 2.4;
  var VOICE_VOL = { p1: 0.42, p2: 0.28, tri: 0.62, noi: 0.4 };
  var VOICES = ['p1', 'p2', 'tri', 'noi'];
  var LOOKAHEAD = 0.12, TICK_MS = 25;

  // ---------------------------------------------------------------------------
  // Tracks. bpm = quarter notes per minute, bar = beats per bar (for the checker).
  // p1d/p2d = pulse duty, v1/v2/vt/vn = voice volume multipliers, gate = note length
  // fraction, vib = vibrato on long lead notes.
  // ---------------------------------------------------------------------------
  var TRACKS = /*TRACKS_BEGIN*/{
    title: { bpm: 88, bar: 4, loop: true, p1d: 0.5, p2d: 0.125, gate: 0.95, vib: true, vn: 0.7,
      p1: `
        D5:2. G5:8 A5 | A5:4. F#5:8 D5:2 | E5:4. F#5:8 G5:4 B5 | G5:2 E5:4 C5 |
        C5:4. D5:8 E5:4 A5 | F#5:2 A5:4 F#5 | G5:4. A5:8 B5:4 D6 | A5:1 |
        G5:4. E5:8 C6:2 | B5:4 A5 F#5 D5 | D5:4. F#5:8 B5:4 A5:8 F#5 | G5:2. E5:4 |
        E5:4. G5:8 C6:4 B5:8 A5 | A5:2 E5:4 C5 | D5:4. E5:8 F#5:4 A5 | A5:2. r:4 |`,
      p2: `
        B4:1 | A4:2 F#4 | G4:2 B4 | C5:2 G4 |
        A4:2 C5 | A4:2 D5 | B4:2 D5 | F#4:2 A4 |
        E5:2 C5 | D5:2 A4 | B4:2 D5 | B4:2 G4 |
        C5:2 E5 | C5:2 A4 | A4:2 C5 | A4:2 F#4 |`,
      tri: `
        G2:4 D3 G3 D3 | F#2:4 A2 D3 A2 | E2:4 B2 E3 B2 | C3:4 G2 C3 G2 |
        A2:4 E3 A3 E3 | D3:4 A2 D3 A2 | G2:4 D3 G3 D3 | D3:4 A2 D3 F#2 |
        C3:4 G2 C3 G2 | D3:4 A2 D3 A2 | B2:4 F#3 B2 F#3 | E2:4 B2 E3 B2 |
        C3:4 G2 C3 G2 | A2:4 E3 A2 E3 | D3:4 A2 D3 A2 | D3:4 A2 D3 F#2 |`,
      noi: `
        [k:4 h s h:8 h |]x15 [s:16]x8 s:8 s k:4 |`
    },

    overworld: { bpm: 136, bar: 4, loop: true, p1d: 0.5, p2d: 0.25, gate: 0.86, vib: true,
      p1: `
        D5:4. A4:8 D5 E5 F#5:4 | E5:4. C#5:8 A4:4 r:8 A4 | B4:8 C#5 D5 F#5 B5:4. A5:8 | G5:4 F#5:8 E5 D5:2 |
        E5:4. G5:8 F#5 E5 D5 E5 | C#5:4 A4 E5 A5 | F#5:4. E5:16 D5 E5:8 F#5 D5:4 | E5:2 r:8 A4:16 B4 C#5:8 E5 |
        D5:4. A4:8 D5 E5 F#5:4 | E5:4. C#5:8 A4:4 r:8 A4 | B4:8 C#5 D5 F#5 B5:4. A5:8 | A#5:4. F#5:8 C#6:4 A#5 |
        B5:4. A5:8 G5 F#5 E5 D5 | A5:4. F#5:8 D5:4 F#5 | G5:8 F#5 E5 G5 B5 A5 G5 E5 | D5:2 r:8 D5 E5 F#5 |
        G5:2 B5:4 A5:8 G5 | A5:4. E5:8 E5:2 | F#5:4 A5 C#6:4. B5:8 | B5:2 r:8 F#5 G5 A5 |
        B5:4. G5:8 E5:4 G5:8 B5 | A5:4. F#5:8 C#5:4 E5:8 F#5 | G5:8 A5 B5 D6 E6:4. D6:8 | C#6:2 B5:8 A5 G5 E5 |`,
      p2: `
        [r:8 F#4 r A4]x2 | [r:8 E4 r A4]x2 | [r:8 F#4 r B4]x2 | [r:8 G4 r B4]x2 |
        [r:8 G4 r B4]x2 | [r:8 A4 r C#5]x2 | [r:8 F#4 r A4]x2 | [r:8 A4 r C#5]x2 |
        [r:8 F#4 r A4]x2 | [r:8 E4 r A4]x2 | [r:8 F#4 r B4]x2 | [r:8 F#4 r A#4]x2 |
        [r:8 G4 r B4]x2 | [r:8 F#4 r A4]x2 | r:8 G4 r B4 r A4 r C#5 | [r:8 F#4 r A4]x2 |
        B4:2 D5 | C#5:1 | A4:2 C#5 | D5:2. C#5:4 |
        G4:2 B4 | C#5:2 A4 | B4:2 D5 | C#5:2 A4 |`,
      tri: `
        [D3:8 D3 A2 D3]x2 | [C#3:8 C#3 A2 C#3]x2 | [B2:8 B2 F#2 B2]x2 | [G2:8 G2 D3 G2]x2 |
        [E2:8 E2 B2 E2]x2 | [A2:8 A2 E3 A2]x2 | [D3:8 D3 A2 D3]x2 | [A2:8 A2 E2 A2]x2 |
        [D3:8 D3 A2 D3]x2 | [C#3:8 C#3 A2 C#3]x2 | [B2:8 B2 F#2 B2]x2 | [F#2:8 F#2 C#3 F#2]x2 |
        [G2:8 G2 D3 G2]x2 | [F#2:8 F#2 A2 F#2]x2 | E2:8 E2 B2 E2 A2 A2 E2 A2 | [D3:8 D3 A2 D3]x2 |
        [G2:8 G2 D3 G2]x2 | [A2:8 A2 E3 A2]x2 | [F#2:8 F#2 C#3 F#2]x2 | [B2:8 B2 F#2 B2]x2 |
        [E2:8 E2 B2 E2]x2 | [F#2:8 F#2 C#3 F#2]x2 | [G2:8 G2 D3 G2]x2 | A2:8 A2 E3 A2 A2 B2 C#3 C#3 |`,
      noi: `
        [[k:8 h s h k k s h |]x7 k:8 h s h s:16 s s:8 s:16 s s:8 |]x3`
    },

    dungeon: { bpm: 112, bar: 4, loop: true, p1d: 0.25, p2d: 0.125, gate: 0.9, vib: true, v2: 0.55, vn: 0.8,
      p1: `
        B4:2. C5:4 | B4:2 G4 | E4:2. F4:4 | E4:1 |
        G5:2. E5:4 | D5:4 E5 C5:2 | D#5:2. F#5:4 | E5:4 D#5 B4:2 |
        E5:4. G5:8 F#5:4 E5 | B5:2. A5:4 | G5:4 F#5 E5 D#5 | E5:1 |
        F5:2. A5:4 | G5:4 F5 E5:2 | D#5:2. F#5:4 | A5:4 G5 F#5 D#5 |`,
      p2: `
        [B4:16 G4 E4 G4]x16 | [C5:16 G4 E4 G4]x8 | [B4:16 F#4 D#4 F#4]x8 |
        [B4:16 G4 E4 G4]x16 | [C5:16 A4 F4 A4]x8 | [B4:16 F#4 D#4 F#4]x8 |`,
      tri: `
        [E2:8 B2 E3 B2 F3 B2 E3 B2 |]x4 [C2:8 G2 C3 G2 Db3 G2 C3 G2 |]x2 [B1:8 F#2 B2 F#2 C3 F#2 B2 F#2 |]x2
        [E2:8 B2 E3 B2 F3 B2 E3 B2 |]x4 [F2:8 C3 F3 C3 Gb3 C3 F3 C3 |]x2 [B1:8 F#2 B2 F#2 C3 F#2 B2 F#2 |]x2`,
      noi: `
        [k:4 r:8 m:16 m r:4 m:8 r |]x16`
    },

    boss: { bpm: 168, bar: 4, loop: true, p1d: 0.25, p2d: 0.125, gate: 0.8, vib: false, v2: 0.85,
      p1: `
        A5:4. E5:8 A5 B5 C6:4 | B5:8 A5 G5 E5 A5:2 | C6:4. A5:8 F5:4 A5 | B5:4. G5:8 D6:4 B5 |
        C6:8 B5 A5 E5 C6 B5 A5 E5 | A5:4 E6 D6 C6 | D6:4. Bb5:8 F5:4 D6 | B5:4 G#5 E5:8 F5 G#5 B5 |
        A5:4. E5:8 A5 B5 C6:4 | B5:8 A5 G5 E5 A5:2 | C6:4. A5:8 F5:4 A5 | B5:4. G5:8 D6:4 B5 |
        E6:4. D6:8 C6 B5 A5:4 | C6:8 B5 A5 G5 A5:2 | F5:4 Bb5 D6 F6 | E6:2 r:8 E5 G#5 B5 |
        D6:2 A5:4 F5 | D5:8 F5 A5 D6 C6:4 A5 | E6:2 C6:4 A5 | E5:8 A5 C6 E6 D6:4 C6 |
        D6:4. C6:8 Bb5:4 F5 | E6:4. D6:8 C6:4 G5 | G#5:4 B5 D6 E6 | F6:8 E6 D6 B5 G#5 B5 E5:4 |`,
      p2: `
        [[A4:16 C5 E5 C5]x8 | [A4:16 C5 F5 C5]x4 | [B4:16 D5 G5 D5]x4 |
         [A4:16 C5 E5 C5]x8 | [Bb4:16 D5 F5 D5]x4 | [G#4:16 B4 E5 B4]x4 |]x2
        [D4:8 F4 A4 F4]x4 | [E4:8 A4 C5 A4]x4 | [D4:8 F4 Bb4 F4]x2 | [E4:8 G4 C5 G4]x2 | [E4:8 G#4 B4 G#4]x4 |`,
      tri: `
        [[A2:8 A3]x8 | [F2:8 F3]x4 | [G2:8 G3]x4 | [A2:8 A3]x8 | [Bb2:8 Bb3]x4 | [E2:8 E3]x4 |]x2
        [D2:8 D3]x8 | [A2:8 A3]x8 | [Bb2:8 Bb3]x4 | [C3:8 C4]x4 | [E2:8 E3]x8 |`,
      noi: `
        [[k:8 h:16 h s:8 h k k s h |]x7 k:8 s:16 s s:8 s:16 s k:8 s:16 s s:8 s |]x3`
    },

    final: { bpm: 96, bar: 4, loop: true, p1d: 0.5, p2d: 0.125, gate: 0.92, vib: true, v2: 0.8,
      p1: `
        C5:2. Eb5:4 | D5:4 Eb5 G5:2 | Ab5:2. G5:4 | F5:4 D5 B4:2 |
        C5:2. G5:4 | Ab5:2 F5:4 Db5 | B4:4 D5 F5 Ab5 | G5:1 |
        Ab5:2. C6:4 | Bb5:4 Ab5 G5 F5 | G5:2. Eb5:4 | D5:4 Eb5 C5:2 |
        C6:2. Bb5:4 | Ab5:4 F5 Db6:2 | B5:2. Ab5:4 | G5:4 F5 D5 B4 |`,
      p2: `
        [Eb4:8 G4]x8 | [Eb4:8 Ab4]x4 | [D4:8 G4]x4 |
        [Eb4:8 G4]x4 | [F4:8 Ab4]x4 | [D4:8 F4]x4 | [D4:8 G4]x4 |
        [F4:8 Ab4]x8 | [Eb4:8 G4]x8 |
        [Eb4:8 Ab4]x4 | [F4:8 Ab4]x4 | [D4:8 F4]x4 | [D4:8 G4]x4 |`,
      tri: `
        [C3:4 C3:8 C3 Db3:4 C3 |]x2 Ab2:4 Ab2:8 Ab2 A2:4 Ab2 | G2:4 G2:8 G2 Ab2:4 G2 |
        C3:4 C3:8 C3 Db3:4 C3 | Db3:4 Db3:8 Db3 D3:4 Db3 | [G2:4 G2:8 G2 Ab2:4 G2 |]x2
        [F2:4 F2:8 F2 Gb2:4 F2 |]x2 [C3:4 C3:8 C3 Db3:4 C3 |]x2
        Ab2:4 Ab2:8 Ab2 A2:4 Ab2 | Db3:4 Db3:8 Db3 D3:4 Db3 | [G2:4 G2:8 G2 Ab2:4 G2 |]x2`,
      noi: `
        [k:4 r r m:8 m | k:4 r s r |]x8`
    },

    ending: { bpm: 100, bar: 4, loop: true, p1d: 0.5, p2d: 0.25, gate: 0.92, vib: true,
      p1: `
        C5:4. F5:8 A5:4 C6 | G5:2. E5:4 | F5:4. A5:8 D6:4 C6 | D6:2 Bb5:4 F5 |
        A5:4. G5:8 F5:4 C6 | D6:4. C6:8 Bb5:4 F5 | G5:4 A5 Bb5 C6 | C6:2. r:4 |
        D5:4. C5:8 Bb4:2 | A4:2. C5:4 | Bb4:4. A4:8 G4:4 D5 | C5:1 |
        E5:4. D5:8 C5:4 A4 | F5:2. D5:4 | D5:4 C5 Bb4 G4 | E5:2. r:4 |`,
      p2: `
        A4:2 C5 | C5:2 G4 | D5:2 A4 | F5:2 D5 |
        C5:2 A4 | F5:2 D5 | E5:4 F5 G5 A5 | E5:2. r:4 |
        [F3:8 Bb3 D4 Bb3]x2 | [F3:8 A3 C4 A3]x2 | [G3:8 Bb3 D4 Bb3]x2 | [G3:8 C4 E4 C4]x2 |
        [E3:8 A3 C4 A3]x2 | [F3:8 A3 D4 A3]x2 | [F3:8 Bb3 D4 Bb3]x2 | [G3:8 C4 E4 C4]x2 |`,
      tri: `
        F2:4 C3 F3 C3 | E2:4 G2 C3 G2 | D2:4 A2 D3 A2 | Bb2:4 F2 Bb2 D3 |
        A2:4 C3 F3 C3 | Bb2:4 F2 Bb2 D3 | C3:4 G2 C3 E3 | C3:4 G2 E2 C2 |
        Bb2:2 F2 | F2:2 C3 | G2:2 D3 | C3:2 G2 |
        A2:2 E2 | D2:2 A2 | Bb2:2 F2 | C3:2 C2 |`,
      noi: `
        [k:4 h:8 h s:4 h:8 h |]x7 s:8 s s:16 s s:8 k:4 r |
        [h:4 r r r |]x8`
    },

    gameover: { bpm: 72, bar: 3, loop: true, p1d: 0.25, p2d: 0.125, gate: 0.9, vib: true, vn: 0.5,
      p1: `
        A4:4 D5 F5 | F5:4. D5:8 Bb4:4 | D5:4 C5 Bb4 | A4:2. |
        F5:4 E5 D5 | C5:4. A4:8 C5:4 | Bb4:4 G4 C#5 | D5:2. |
        F5:4 G5 F5 | D5:4. Bb4:8 D5:4 | E5:4. D5:8 Bb4:4 | E5:4 C#5 r |`,
      p2: `
        r:4 F4 A4 | r:4 D4 F4 | r:4 D4 G4 | r:4 C#4 E4 |
        r:4 F4 A4 | r:4 F4 A4 | r:4 D4 E4 | r:4 F4 A4 |
        r:4 D4 F4 | r:4 D4 G4 | r:4 E4 G4 | r:4 C#4 E4 |`,
      tri: `
        D3:2. | Bb2:2. | G2:2. | A2:2. |
        D3:2. | F2:2. | G2:2 A2:4 | D3:2. |
        Bb2:2. | G2:2. | E2:2. | A2:2. |`,
      noi: `
        [h:4 r r |]x12`
    },

    // ---- jingles (non-looping) ----
    fanfare: { bpm: 150, bar: 0, loop: false, p1d: 0.5, p2d: 0.25, gate: 0.92, vib: true,
      p1: `G4:16 C5 E5 G5 F5:8 A5 D6 C6:2 r:8`,
      p2: `E4:16 G4 C5 E5 C5:8 F5 F5 E5:2 r:8`,
      tri: `C3:4 F2:8 G2 C3:2 r:4`,
      noi: `h:16 h h h s:8 s s k:2 r:8`
    },

    shard: { bpm: 100, bar: 2, loop: false, p1d: 0.5, p2d: 0.25, gate: 0.95, vib: true,
      p1: `A4:16 D5 F#5 A5 D6:4 | D6:8. C6:16 Bb5:4 | G5:8 C6 E6:4 | D6:2 |`,
      p2: `F#4:16 A4 D5 F#5 A5:4 | F5:8. Eb5:16 D5:4 | E5:8 G5 G5:4 | A5:2 |`,
      tri: `D3:8 A2 D3:4 | Bb2:8 F2 Bb2:4 | C3:8 G2 C3:4 | D3:2 |`,
      noi: `h:16 h h h k:4 | s:8 s:16 s k:4 | s:8 s:16 s k:4 | k:8 s:16 s [s:32]x8 |`
    },

    secret: { bpm: 150, bar: 0, loop: false, p1d: 0.25, p2d: 0.125, gate: 0.95, vib: false, vn: 0.6,
      p1: `E5:32 G5 A5 B5 D6 E6 G6 A6 B6:4 r:8`,
      p2: `r:32 E5 G5 A5 B5 D6 E6 G6 A6 E6:4 r:16.`,
      tri: `E3:8 r E4:4 r:8`,
      noi: `[h:32]x8 r:4 r:8`
    },

    whistle: { bpm: 150, bar: 0, loop: false, p1d: 0.5, p2d: 0.125, gate: 0.97, vib: true, v2: 0.7,
      p1: `D5:8 G5 F5 E5:4 C5:8 D5:8. A5:16 G5:2.`,
      p2: `B4:8 D5 D5 C5:4 A4:8 B4:8. C5:16 B4:2.`,
      tri: `G2:2 C3:2 G2:2.`,
      noi: `r:1 r:2.`
    }
  }/*TRACKS_END*/;

  var MUSIC_NAMES = ['title', 'overworld', 'dungeon', 'boss', 'final', 'ending', 'gameover'];
  var JINGLE_NAMES = ['fanfare', 'shard', 'secret', 'whistle'];

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteFreq(tok) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
    if (!m) return 0;
    var s = SEMI[m[1]] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0));
    var midi = (parseInt(m[3], 10) + 1) * 12 + s;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function expand(src) {
    var toks = String(src || '').replace(/\[/g, ' [ ').replace(/\](x\d+)?/g, ' ]$1 ').split(/\s+/);
    var stack = [[]], i, j, k;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t || t === '|') continue;
      if (t === '[') { stack.push([]); continue; }
      if (t.charAt(0) === ']') {
        var n = t.length > 2 ? parseInt(t.slice(2), 10) : 2;
        var body = stack.length > 1 ? stack.pop() : [];
        var top = stack[stack.length - 1];
        for (j = 0; j < n; j++) for (k = 0; k < body.length; k++) top.push(body[k]);
        continue;
      }
      stack[stack.length - 1].push(t);
    }
    while (stack.length > 1) {
      var rest = stack.pop();
      for (k = 0; k < rest.length; k++) stack[stack.length - 1].push(rest[k]);
    }
    return stack[0];
  }

  function parseVoice(src, isNoise) {
    var toks = expand(src), t = 0, dur = 1, evs = [];
    for (var i = 0; i < toks.length; i++) {
      var parts = toks[i].split(':'), name = parts[0];
      if (parts.length > 1) {
        var m = /^(\d+)(\.?)$/.exec(parts[1]);
        if (m) dur = (4 / parseInt(m[1], 10)) * (m[2] ? 1.5 : 1);
      }
      if (name !== 'r') {
        if (isNoise) evs.push({ t: t, d: dur, n: name });
        else {
          var f = noteFreq(name);
          if (f) evs.push({ t: t, d: dur, f: f });
        }
      }
      t += dur;
    }
    return { evs: evs, len: t };
  }

  var parsedCache = {};
  function getParsed(name) {
    if (parsedCache[name]) return parsedCache[name];
    var src = TRACKS[name];
    if (!src) return null;
    var tr = {
      name: name, spb: 60 / (src.bpm || 120), loop: src.loop !== false,
      p1d: src.p1d || 0.5, p2d: src.p2d || 0.25, gate: src.gate || 0.9, vib: !!src.vib,
      v1: src.v1 == null ? 1 : src.v1, v2: src.v2 == null ? 1 : src.v2,
      vt: src.vt == null ? 1 : src.vt, vn: src.vn == null ? 1 : src.vn,
      voices: {}, len: 0
    };
    for (var i = 0; i < VOICES.length; i++) {
      var v = VOICES[i], p = parseVoice(src[v], v === 'noi');
      tr.voices[v] = p.evs;
      if (p.len > tr.len) tr.len = p.len;
    }
    if (tr.len <= 0) tr.len = 1;
    tr.seconds = tr.len * tr.spb;
    parsedCache[name] = tr;
    return tr;
  }

  // ---------------------------------------------------------------------------
  // Audio graph & primitives
  // ---------------------------------------------------------------------------
  var ctx = null, master = null, musicBus = null, jingleBus = null, sfxBus = null;
  var noiseBuf = null, metalBuf = null, vibLfo = null;
  var waves = {};

  function pulseWave(duty) {
    var key = String(duty);
    if (waves[key]) return waves[key];
    var N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (var n = 1; n < N; n++) {
      re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
      im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
    }
    waves[key] = ctx.createPeriodicWave(re, im);
    return waves[key];
  }

  // NES-style LFSR noise. Long mode (tap 1) = white noise; short mode (tap 6) = metallic buzz.
  function lfsrBuffer(tap, steps, hold) {
    var sr = ctx.sampleRate, len = steps * hold;
    var buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var reg = 1;
    for (var i = 0; i < steps; i++) {
      var fb = (reg & 1) ^ ((reg >> tap) & 1);
      reg = (reg >> 1) | (fb << 14);
      var v = (reg & 1) ? -0.9 : 0.9;
      for (var h = 0; h < hold; h++) d[i * hold + h] = v;
    }
    return buf;
  }

  function buildGraph() {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = S.muted ? 0 : MASTER_VOL;
    master.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    jingleBus = ctx.createGain(); jingleBus.gain.value = JINGLE_VOL; jingleBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
    noiseBuf = lfsrBuffer(1, 32767, 1);
    metalBuf = lfsrBuffer(6, 93 * 64, 1);
    vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine'; vibLfo.frequency.value = 5.6;
    vibLfo.start();
    pulseWave(0.125); pulseWave(0.25); pulseWave(0.5);
  }

  // Click-free envelope. flat = hold then short release, otherwise percussive decay.
  function env(p, at, len, vol, flat) {
    var a = Math.min(0.004, len * 0.25);
    p.setValueAtTime(0, at);
    p.linearRampToValueAtTime(vol, at + a);
    if (flat) {
      var r = Math.min(0.015, len * 0.3);
      p.setValueAtTime(vol, Math.max(at + a, at + len - r));
      p.linearRampToValueAtTime(0, at + len);
    } else {
      p.exponentialRampToValueAtTime(Math.max(vol * 0.002, 0.00005), at + len);
      p.linearRampToValueAtTime(0, at + len + 0.008);
    }
  }

  function makeOsc(duty) {
    var o = ctx.createOscillator();
    if (duty === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(pulseWave(duty));
    return o;
  }

  // Generic swept tone for sfx. duty: 0.125/0.25/0.5 or 'tri'.
  function tone(duty, f0, f1, at, len, vol, opt) {
    opt = opt || {};
    if (!(vol > 0) || !(len > 0)) return;
    var o = makeOsc(duty), g = ctx.createGain(), vg = null, lfo = null;
    o.frequency.setValueAtTime(f0, at);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + len);
    env(g.gain, at, len, vol, opt.flat);
    o.connect(g); g.connect(opt.out || sfxBus);
    if (opt.vib) {
      lfo = ctx.createOscillator(); lfo.frequency.value = opt.vib[0];
      vg = ctx.createGain(); vg.gain.value = f0 * opt.vib[1];
      lfo.connect(vg); vg.connect(o.frequency);
      lfo.start(at); lfo.stop(at + len + 0.05);
    }
    o.start(at); o.stop(at + len + 0.03);
    o.onended = function () { try { g.disconnect(); if (vg) vg.disconnect(); } catch (e) { /* ignore */ } };
  }

  // Noise burst. r0/r1 = playback-rate sweep (lower = darker rumble).
  function noiseHit(r0, r1, at, len, vol, opt) {
    opt = opt || {};
    if (!(vol > 0) || !(len > 0)) return;
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = opt.metal ? metalBuf : noiseBuf;
    s.loop = true;
    s.playbackRate.setValueAtTime(r0, at);
    if (r1 && r1 !== r0) s.playbackRate.exponentialRampToValueAtTime(r1, at + len);
    env(g.gain, at, len, vol, opt.flat);
    s.connect(g); g.connect(opt.out || sfxBus);
    s.start(at, Math.random() * s.buffer.duration);
    s.stop(at + len + 0.03);
    s.onended = function () { try { g.disconnect(); } catch (e) { /* ignore */ } };
  }

  function arp(duty, notes, step, at, vol, lenMul) {
    for (var i = 0; i < notes.length; i++) {
      var f = typeof notes[i] === 'number' ? notes[i] : noteFreq(notes[i]);
      var last = i === notes.length - 1;
      tone(duty, f, 0, at + i * step, step * (last ? (lenMul || 3) : 1.05), vol);
    }
  }

  // ---- music voices ----
  function pulseNote(out, duty, f, at, dur, vol, gate, vib) {
    var len = Math.max(0.03, dur * gate);
    var rel = Math.min(0.03, len * 0.3);
    var att = Math.min(0.005, (len - rel) * 0.3);
    var dec = at + Math.min(0.1, (len - rel) * 0.6);
    var o = makeOsc(duty), g = ctx.createGain(), vg = null;
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + att);
    g.gain.linearRampToValueAtTime(vol * 0.72, dec);
    g.gain.setValueAtTime(vol * 0.72, at + len - rel);
    g.gain.linearRampToValueAtTime(0, at + len);
    o.connect(g); g.connect(out);
    if (vib && len > 0.36) {
      vg = ctx.createGain();
      vg.gain.setValueAtTime(0, at);
      vg.gain.setValueAtTime(0, at + 0.18);
      vg.gain.linearRampToValueAtTime(f * 0.007, at + Math.min(len, 0.45));
      vibLfo.connect(vg); vg.connect(o.frequency);
    }
    o.start(at); o.stop(at + len + 0.02);
    o.onended = function () { try { g.disconnect(); if (vg) { vibLfo.disconnect(vg); vg.disconnect(); } } catch (e) { /* ignore */ } };
  }

  function triNote(out, f, at, dur, vol, gate) {
    var len = Math.max(0.03, dur * Math.min(0.98, gate + 0.06));
    var o = makeOsc('tri'), g = ctx.createGain();
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.setValueAtTime(vol, at + len - 0.01);
    g.gain.linearRampToValueAtTime(0, at + len);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + len + 0.02);
    o.onended = function () { try { g.disconnect(); } catch (e) { /* ignore */ } };
  }

  function drum(kind, at, vol, out) {
    var o = { out: out };
    switch (kind) {
      case 'k': tone('tri', 170, 45, at, 0.11, vol * 1.3, o); noiseHit(0.22, 0.1, at, 0.05, vol * 0.5, o); break;
      case 's': noiseHit(0.55, 0.4, at, 0.13, vol, o); break;
      case 'h': noiseHit(1, 1, at, 0.035, vol * 0.45, o); break;
      case 'o': noiseHit(1, 1, at, 0.16, vol * 0.38, o); break;
      case 'c': noiseHit(0.8, 0.5, at, 0.7, vol * 0.5, o); break;
      case 'm': noiseHit(1, 1, at, 0.05, vol * 0.35, { out: out, metal: true }); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------
  // Sequencer (lookahead scheduler)
  // ---------------------------------------------------------------------------
  function Player(name, bus, loop) {
    this.name = name;
    this.tr = getParsed(name);
    this.loop = loop;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(bus);
    this.start = ctx.currentTime + 0.06;
    this.cur = {};
  }
  Player.prototype.tick = function (horizon) {
    var tr = this.tr, now = ctx.currentTime;
    for (var v = 0; v < VOICES.length; v++) {
      var key = VOICES[v], evs = tr.voices[key];
      if (!evs || !evs.length) continue;
      var c = this.cur[key] || (this.cur[key] = { i: 0, n: 0, done: false });
      var guard = 0;
      while (!c.done && guard++ < 4096) {
        var ev = evs[c.i];
        var at = this.start + (c.n * tr.len + ev.t) * tr.spb;
        if (at >= horizon) break;
        if (at >= now - 0.03) this.play(key, ev, at);
        c.i++;
        if (c.i >= evs.length) {
          c.i = 0; c.n++;
          if (!this.loop) c.done = true;
        }
      }
    }
  };
  Player.prototype.play = function (key, ev, at) {
    var tr = this.tr, d = ev.d * tr.spb;
    if (key === 'noi') drum(ev.n, at, VOICE_VOL.noi * tr.vn, this.out);
    else if (key === 'tri') triNote(this.out, ev.f, at, d, VOICE_VOL.tri * tr.vt, tr.gate);
    else if (key === 'p1') pulseNote(this.out, tr.p1d, ev.f, at, d, VOICE_VOL.p1 * tr.v1, tr.gate, tr.vib);
    else pulseNote(this.out, tr.p2d, ev.f, at, d, VOICE_VOL.p2 * tr.v2, tr.gate, false);
  };

  function fadeOut(node) {
    if (!node || !ctx) return;
    try {
      var now = ctx.currentTime;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(0, now + 0.06);
    } catch (e) { /* ignore */ }
    setTimeout(function () { try { node.disconnect(); } catch (e) { /* ignore */ } }, 2000);
  }

  var song = null, jingleP = null, jingleActive = false, jingleToken = 0, schedTimer = null;

  function tick() {
    try {
      if (!ctx) return;
      var hidden = typeof document !== 'undefined' && document.hidden;
      var horizon = ctx.currentTime + (hidden ? 1.2 : LOOKAHEAD);
      if (song) song.tick(horizon);
      if (jingleP) jingleP.tick(horizon);
    } catch (e) { /* never throw from the timer */ }
  }

  function stopSong() {
    if (song) { fadeOut(song.out); song = null; }
  }

  function startSong(name) {
    if (!ctx) return;
    stopSong();
    if (!TRACKS[name]) return;
    song = new Player(name, musicBus, true);
    song.tick(ctx.currentTime + LOOKAHEAD);
  }

  // ---------------------------------------------------------------------------
  // Sound effects
  // ---------------------------------------------------------------------------
  var N = noteFreq;
  var FLAT = { flat: true };
  var SFX = {
    sword: function (t) { noiseHit(1.0, 0.3, t, 0.13, 0.7); tone(0.125, 1500, 450, t, 0.08, 0.22); },
    beam: function (t) {
      for (var i = 0; i < 5; i++) tone(0.25, 2100, 900, t + i * 0.055, 0.055, 0.22);
      tone(0.5, 700, 1500, t, 0.28, 0.08);
    },
    hit: function (t) { tone(0.5, 520, 120, t, 0.09, 0.5); noiseHit(0.7, 0.3, t, 0.07, 0.45); },
    enemydie: function (t) { noiseHit(0.5, 0.07, t, 0.35, 0.55); tone(0.25, 900, 110, t, 0.2, 0.22); },
    hurt: function (t) {
      tone(0.5, 380, 90, t, 0.08, 0.45); tone(0.5, 320, 70, t + 0.09, 0.11, 0.45);
      noiseHit(0.45, 0.2, t, 0.12, 0.3);
    },
    rupee: function (t) { tone(0.25, N('E6'), 0, t, 0.05, 0.28, FLAT); tone(0.25, N('B6'), 0, t + 0.05, 0.2, 0.28); },
    heart: function (t) { arp(0.25, ['A5', 'C#6', 'E6', 'A6'], 0.045, t, 0.26); },
    item: function (t) { arp(0.5, ['G5', 'D6'], 0.06, t, 0.24); },
    key: function (t) {
      arp(0.25, ['E6', 'G#6', 'B6', 'E7'], 0.035, t, 0.24);
      tone(0.125, N('E7'), 0, t + 0.15, 0.3, 0.1);
    },
    bombdrop: function (t) { tone('tri', 520, 170, t, 0.09, 0.55); tone(0.5, 260, 0, t, 0.035, 0.14); },
    bomb: function (t) {
      noiseHit(1.0, 0.5, t, 0.06, 0.5);
      noiseHit(0.32, 0.035, t, 0.9, 0.9);
      tone('tri', 140, 35, t, 0.5, 0.75);
    },
    arrow: function (t) { noiseHit(1.0, 0.6, t, 0.1, 0.45); tone(0.125, 1100, 1900, t, 0.09, 0.2); },
    disc: function (t) {
      for (var i = 0; i < 3; i++) {
        tone(0.125, 500, 1300, t + i * 0.1, 0.05, 0.15, FLAT);
        tone(0.125, 1300, 500, t + i * 0.1 + 0.05, 0.05, 0.15, FLAT);
      }
      noiseHit(0.9, 0.9, t, 0.3, 0.08, FLAT);
    },
    fire: function (t) { noiseHit(0.55, 0.12, t, 0.42, 0.5); noiseHit(0.2, 0.08, t + 0.05, 0.3, 0.3); },
    magic: function (t) {
      tone(0.25, 300, 1600, t, 0.3, 0.32, { vib: [30, 0.06] });
      tone(0.125, 450, 2400, t + 0.04, 0.3, 0.12);
    },
    door: function (t) {
      for (var i = 0; i < 6; i++) noiseHit(0.45, 0.45, t + i * 0.04, 0.03, 0.4, { metal: true });
      tone(0.5, 95, 70, t, 0.26, 0.16, FLAT);
    },
    unlock: function (t) {
      noiseHit(1, 1, t, 0.03, 0.35, { metal: true });
      tone(0.5, 900, 0, t + 0.02, 0.04, 0.22, FLAT);
      tone(0.5, 1350, 0, t + 0.1, 0.09, 0.22);
      noiseHit(1, 1, t + 0.1, 0.03, 0.3, { metal: true });
    },
    stairs: function (t) {
      var f = 820;
      for (var i = 0; i < 8; i++) { tone(0.5, f, f * 0.92, t + i * 0.08, 0.06, 0.22); f *= 0.885; }
    },
    text: function (t) { tone(0.5, 1500, 0, t, 0.02, 0.09, FLAT); },
    shield: function (t) {
      tone(0.125, 2600, 2400, t, 0.05, 0.32);
      tone(0.25, 3500, 3300, t + 0.03, 0.08, 0.14);
      noiseHit(1, 1, t, 0.04, 0.25, { metal: true });
    },
    refill: function (t) { tone(0.25, 1760, 0, t, 0.035, 0.2, FLAT); },
    menu: function (t) { arp(0.5, ['C5', 'G5', 'C6'], 0.04, t, 0.2, 2); },
    cursor: function (t) { tone(0.125, 1050, 0, t, 0.035, 0.2, FLAT); },
    push: function (t) { noiseHit(0.12, 0.08, t, 0.3, 0.55, FLAT); tone('tri', 70, 55, t, 0.3, 0.5, FLAT); },
    splash: function (t) { noiseHit(0.9, 0.22, t, 0.38, 0.5); noiseHit(1.0, 0.6, t + 0.06, 0.15, 0.25); },
    fall: function (t) {
      tone(0.5, 900, 90, t, 0.9, 0.26, { flat: true, vib: [12, 0.03] });
      noiseHit(0.3, 0.1, t + 0.85, 0.2, 0.3);
    },
    roar: function (t) {
      noiseHit(0.13, 0.07, t, 0.8, 0.65, FLAT);
      tone(0.5, 95, 60, t, 0.8, 0.3, { flat: true, vib: [18, 0.15] });
      tone(0.25, 142, 82, t + 0.02, 0.75, 0.16, { vib: [23, 0.12] });
    },
    bosshit: function (t) {
      tone(0.5, 260, 60, t, 0.18, 0.5); noiseHit(0.5, 0.15, t, 0.2, 0.6);
      tone(0.25, 900, 300, t, 0.06, 0.2);
    },
    bossdie: function (t) {
      for (var i = 0; i < 7; i++) {
        var at = t + i * 0.16;
        noiseHit(0.3 + Math.random() * 0.2, 0.05, at, 0.35, 0.6);
        tone('tri', 170 - i * 12, 40, at, 0.25, 0.45);
      }
      noiseHit(0.25, 0.03, t + 1.2, 1.4, 0.95);
      tone('tri', 120, 30, t + 1.2, 0.9, 0.7);
      tone(0.5, 400, 40, t + 1.2, 1.0, 0.18);
    },
    buy: function (t) { arp(0.25, ['B5', 'E6', 'G#6', 'B6'], 0.05, t, 0.24, 4); },
    error: function (t) { tone(0.5, 110, 0, t, 0.12, 0.32, FLAT); tone(0.5, 104, 0, t + 0.16, 0.18, 0.32, FLAT); },
    warp: function (t) {
      tone(0.25, 180, 2200, t, 0.7, 0.2, { vib: [25, 0.08] });
      tone(0.125, 2200, 180, t, 0.7, 0.1);
      noiseHit(0.2, 1.0, t, 0.7, 0.18, FLAT);
    },
    fairy: function (t) {
      var sc = ['E6', 'G6', 'A6', 'B6', 'D7', 'E7'];
      for (var i = 0; i < 10; i++) {
        tone(0.125, N(sc[(i * 4 + (i >> 1)) % sc.length]), 0, t + i * 0.035, 0.07, 0.2 * (1 - i / 12));
      }
    },
    crumble: function (t) {
      noiseHit(0.3, 0.06, t, 0.6, 0.7);
      for (var i = 0; i < 4; i++) noiseHit(0.6, 0.2, t + 0.08 * i + 0.05, 0.08, 0.4);
      tone('tri', 90, 40, t, 0.4, 0.5);
    },
    _lowhp: function (t) { tone(0.5, 990, 0, t, 0.065, 0.16, FLAT); }
  };

  var lastSfx = {};
  function playSfx(name) {
    if (!ctx || !SFX.hasOwnProperty(name)) return;
    var now = ctx.currentTime;
    if (lastSfx[name] != null && now - lastSfx[name] < 0.03 && now >= lastSfx[name]) return;
    lastSfx[name] = now;
    SFX[name](now + 0.01);
  }

  // ---------------------------------------------------------------------------
  // Low health beeper
  // ---------------------------------------------------------------------------
  var lowOn = false, lowTimer = null;
  function lowBeep() { try { if (ctx && !S.muted) playSfx('_lowhp'); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var S = {
    muted: false,
    current: null,
    list: {
      music: MUSIC_NAMES.slice(),
      jingles: JINGLE_NAMES.slice(),
      sfx: Object.keys(SFX).filter(function (k) { return k.charAt(0) !== '_'; })
    },

    init: function () {
      try {
        if (!ctx) {
          var AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          buildGraph();
          schedTimer = setInterval(tick, TICK_MS);
          if (S.current && !jingleActive) startSong(S.current);
        }
        if (ctx.state === 'suspended' && ctx.resume) {
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () { /* ignore */ });
        }
      } catch (e) { /* audio unavailable */ }
    },

    sfx: function (name) {
      try { playSfx(name); } catch (e) { /* ignore */ }
    },

    music: function (name) {
      try {
        if (!name) { S.stopMusic(); return; }
        if (!TRACKS[name] || TRACKS[name].loop === false) return;
        if (S.current === name && (song || !ctx || jingleActive)) return;
        S.current = name;
        if (!ctx || jingleActive) return; // starts on init / after the jingle
        startSong(name);
      } catch (e) { /* ignore */ }
    },

    stopMusic: function () {
      try { S.current = null; stopSong(); } catch (e) { /* ignore */ }
    },

    jingle: function (name, then) {
      try {
        var tr = TRACKS[name] ? getParsed(name) : null;
        var cb = typeof then === 'function' ? then : null;
        if (!tr) {
          if (cb) setTimeout(function () { try { cb(); } catch (err) { if (root.console) root.console.error(err); } }, 0);
          return;
        }
        var ms = Math.ceil(tr.seconds * 1000) + 80;
        var token = ++jingleToken;
        if (ctx) {
          stopSong();
          if (jingleP) fadeOut(jingleP.out);
          jingleActive = true;
          jingleP = new Player(name, jingleBus, false);
          jingleP.tick(ctx.currentTime + LOOKAHEAD);
        }
        setTimeout(function () {
          try {
            if (token === jingleToken) {
              jingleActive = false;
              jingleP = null;
              if (ctx && S.current && !song) startSong(S.current);
            }
          } catch (e) { /* ignore */ }
          if (cb) {
            try { cb(); } catch (err) { if (root.console) root.console.error(err); }
          }
        }, ms);
      } catch (e) { /* ignore */ }
    },

    lowHealth: function (on) {
      try {
        on = !!on;
        if (on === lowOn) return;
        lowOn = on;
        if (lowTimer) { clearInterval(lowTimer); lowTimer = null; }
        if (on) { lowBeep(); lowTimer = setInterval(lowBeep, 500); }
      } catch (e) { /* ignore */ }
    },

    toggleMute: function () {
      try {
        S.muted = !S.muted;
        if (ctx && master) {
          var now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(master.gain.value, now);
          master.gain.linearRampToValueAtTime(S.muted ? 0 : MASTER_VOL, now + 0.03);
        }
      } catch (e) { /* ignore */ }
      return S.muted;
    }
  };

  root.Sound = S;
})(typeof window !== 'undefined' ? window : this);
