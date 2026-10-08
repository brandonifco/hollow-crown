# The Hollow Crown

An original, complete NES-style top-down action-adventure that runs in the browser.
No build step and no dependencies: plain HTML5 canvas + Web Audio, with every sprite and
every note made in code.

## Play

```
./play.sh
```

This starts a tiny local server on port 8642 and opens the game in your browser.
Opening `index.html` directly works too.

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / stick | D-pad |
| Sword | Z (or J / Space) | A | A |
| Use item | X (or K) | B | B |
| Inventory / pause | Enter | Start | START |
| Save & quit (in inventory) | Shift | Select | SELECT |
| Mute | M | | |

Progress autosaves to the browser (3 save files).

A single-file build that runs offline is in `dist/hollow-crown.html`; rebuild it with
`python3 tools/build_standalone.py`. A full guide is in [WALKTHROUGH.md](WALKTHROUGH.md).

## The game

The Hollow King shattered the Dawnstone into eight shards and hid them in eight dungeons.
Explore the 128-screen land of Vellmoor, find weapons and tools, clear each dungeon, collect
all eight Dawn Shards, unseal the Hollow Throne on the northern peak and free Sage Elowen.

- **Overworld:** 16x8 screens across plains, forests, mountains, desert, lakes, coast,
  a graveyard and the looping Tanglewood. Has shops, hermits with hints, fairy fountains
  and hidden caves (bomb cracked rock, burn bushes with the lantern, push boulders).
- **9 dungeons** with keys, locked doors, shutters, push blocks, bombable walls, dark rooms,
  traps, maps, compasses, a treasure item and a boss each.
- **Items:** Twig/Steel/Sunforged blades, Wind Disc, bombs and Bomb Bag, Longbow,
  Starlight Arrows, Lantern, Whistle (also warps between cleared dungeons), Mage Wand,
  Spellbook, Raft, Ladder, Tower Shield, Blue and Red Rings, Life Potions, Heart Vessels.
- **Second Quest:** after the ending your file becomes a harder Second Quest, with new
  dungeon layouts and tougher enemies.

## Code

| File | Contents |
|---|---|
| `js/engine.js` | canvas, input (keyboard/gamepad/touch), RNG, bitmap font |
| `js/audio.js` | Web Audio chiptune synth, original music and SFX |
| `js/sprites.js` | all pixel art as palette-indexed strings |
| `js/data.js` | world layout, hand-built screens, caves, shops, dungeon definitions, text |
| `js/world.js` | deterministic overworld generator (connectivity guaranteed) |
| `js/dungeon.js` | dungeon generator; lock/key placement cannot soft-lock |
| `js/entities.js` | player, weapons, projectiles, pickups |
| `js/enemies.js` | 28 enemy variants and 9 boss fights |
| `js/game.js` | states, areas, transitions, HUD, menus, saving, ending |

`tools/validate.html` checks the world and every dungeon in both quests for solvability.
`tools/sprites.html` and `tools/audio.html` preview the art and the sound.
