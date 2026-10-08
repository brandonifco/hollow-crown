#!/usr/bin/env python3
"""Validate js/sprites.js: palettes, required sprite names, dimensions, row chars.

Usage: python3 tools/check_sprites.py
Understands rows written as plain arrays (`rows:[ '...', ... ]`) and as
`rows: mirror([ ... ])` (left halves mirrored to full width).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'js', 'sprites.js')

REQUIRED_PALS = """hero hero_blue hero_red npc_old npc_merchant npc_sage fairy
red blue green gold purple white brown gray orange dark
sword1 sword2 sword3 beam item rupee1 rupee5 heart key fire magic bomb shard hud ui
tree_green tree_dark rock_brown rock_gray rock_orange water bush_green grave wood statue
dgn1 dgn2 dgn3 dgn4 dgn5 dgn6 dgn7 dgn8 dgn9 cave""".split()

# name: (w, h)
REQ = {}


def req(names, w=16, h=16):
    for n in names.split():
        REQ[n] = (w, h)


req('hero_down_0 hero_down_1 hero_up_0 hero_up_1 hero_right_0 hero_right_1 '
    'hero_atk_down hero_atk_up hero_atk_right hero_item hero_dead')
req('sword arrow wand spear', 8, 16)
req('disc_0 disc_1', 8, 8)
req('bomb fire_0 fire_1 magic_0 magic_1')
req('fireball_0 fireball_1 pebble beam_spark', 8, 8)
req('boom_0 boom_1 puff_0 puff_1 puff_2')
req('hit_spark', 8, 8)
req('rupee', 8, 16)
req('heart', 8, 8)
req('heart_container compass clock raft ladder shard')
req('fairy_0 fairy_1 key map potion lantern whistle book ring shield_tower bow '
    'star_arrow bombbag disc_item', 8, 16)
req('heart_full heart_half heart_empty icon_rupee icon_key icon_bomb', 8, 8)
req('npc_hermit npc_merchant npc_sage npc_great_fairy')
req('thorn_down_0 thorn_down_1 thorn_right_0 thorn_right_1 skitter_0 skitter_1 '
    'burrow_0 burrow_1 burrow_mound spear_down_0 spear_down_1 spear_up_0 spear_up_1 '
    'spear_right_0 spear_right_1 knight_down_0 knight_down_1 knight_up_0 knight_up_1 '
    'knight_right_0 knight_right_1 wisp_0 wisp_1 shade_right_0 shade_right_1 '
    'snapjaw_0 snapjaw_1 snapjaw_ripple')
req('slime_0 slime_1 blob_0 blob_1 flitter_0 flitter_1 bone_0 bone_1 '
    'hook_down_0 hook_down_1 hook_up_0 hook_up_1 hook_right_0 hook_right_1 '
    'viper_0 viper_1 bulwark_down_0 bulwark_down_1 bulwark_up_0 bulwark_up_1 '
    'bulwark_right_0 bulwark_right_1 hexer_down hexer_up hexer_right '
    'wrapped_0 wrapped_1 grabber_0 grabber_1 trap')
req('thornhorn_0 thornhorn_1 dragon_body beast_0 beast_1 beast_eat king_0 king_1', 32, 32)
req('coil_head coil_body hydra_core hydra_head_0 hydra_head_1 dragon_head_0 '
    'dragon_head_1 orbit_eye orbit_minion')
req('pulsar_closed pulsar_open', 32, 16)
req('dragon_neck', 8, 8)
req('tile_tree tile_rock tile_water_0 tile_water_1 tile_bush tile_grave tile_cave '
    'tile_stairs tile_dock tile_bridge tile_crack tile_flower tile_statue tile_facade '
    'tile_pillar tile_door tile_seal tile_dfloor tile_dblock tile_dwater tile_dstatue '
    'tile_dsand tile_dwall tile_dstairs')
req('door_open door_locked door_shut door_bombed', 32, 32)


def main():
    src = open(SRC).read()
    errors = []

    # ---- palettes ----
    m = re.search(r'const\s+PAL\s*=\s*\{(.*?)\n\};', src, re.S)
    if not m:
        print('FAIL: PAL block not found'); return 1
    pals = {}
    for pm in re.finditer(r"(\w+)\s*:\s*\[([^\]]*)\]", m.group(1)):
        cols = re.findall(r"'([^']*)'", pm.group(2))
        pals[pm.group(1)] = cols
        if len(cols) != 3 or not all(re.fullmatch(r'#[0-9a-fA-F]{6}', c) for c in cols):
            errors.append('palette %s malformed: %r' % (pm.group(1), cols))
    for p in REQUIRED_PALS:
        if p not in pals:
            errors.append('missing palette ' + p)

    # ---- sprites ----
    m = re.search(r'const\s+SPRITES\s*=\s*\{(.*?)\n\};', src, re.S)
    if not m:
        print('FAIL: SPRITES block not found'); return 1
    body = m.group(1)
    ent = re.compile(r"(\w+)\s*:\s*\{\s*w\s*:\s*(\d+)\s*,\s*h\s*:\s*(\d+)\s*,\s*pal\s*:\s*'(\w+)'\s*,"
                     r"\s*rows\s*:\s*(mirror\(\s*)?\[(.*?)\]\s*\)?\s*\}", re.S)
    sprites = {}
    for e in ent.finditer(body):
        name, w, h, pal, mir, rowtxt = e.group(1), int(e.group(2)), int(e.group(3)), e.group(4), e.group(5), e.group(6)
        rows = re.findall(r"'([^']*)'", rowtxt)
        if mir:
            rows = [r + r[::-1] for r in rows]
        if name in sprites:
            errors.append('duplicate sprite ' + name)
        sprites[name] = (w, h, pal, rows)
    # sanity: count entries roughly
    approx = len(re.findall(r"^\s*\w+\s*:\s*\{\s*w\s*:", body, re.M))
    if approx != len(sprites):
        errors.append('parsed %d sprites but found %d entry headers' % (len(sprites), approx))

    for name, (w, h, pal, rows) in sprites.items():
        if pal not in pals:
            errors.append('%s: unknown default palette %s' % (name, pal))
        if len(rows) != h:
            errors.append('%s: %d rows, expected h=%d' % (name, len(rows), h))
        for i, r in enumerate(rows):
            if len(r) != w:
                errors.append('%s row %d: length %d, expected w=%d' % (name, i, len(r), w))
            bad = set(r) - set('.123')
            if bad:
                errors.append('%s row %d: bad chars %s' % (name, i, ''.join(sorted(bad))))
        if all(set(r) <= {'.'} for r in rows):
            errors.append('%s: sprite is empty' % name)

    for name, (w, h) in REQ.items():
        if name not in sprites:
            errors.append('missing sprite ' + name)
        elif sprites[name][:2] != (w, h):
            errors.append('%s: size %dx%d, expected %dx%d' % (name, sprites[name][0], sprites[name][1], w, h))

    for fn in ('function getSprite', 'console.warn'):
        if fn not in src:
            errors.append('missing ' + fn)

    extra = sorted(set(sprites) - set(REQ))
    print('palettes: %d   sprites: %d   required: %d   extra: %s' %
          (len(pals), len(sprites), len(REQ), ', '.join(extra) or '-'))
    if errors:
        print('\n'.join('ERROR: ' + e for e in errors))
        print('FAIL (%d errors)' % len(errors))
        return 1
    print('OK - all sprites valid')
    return 0


if __name__ == '__main__':
    sys.exit(main())
