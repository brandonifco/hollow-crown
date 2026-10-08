#!/usr/bin/env python3
"""Validate the music/jingle note strings in js/audio.js.

Mirrors the JS parser (expand repeats, sticky durations) and checks:
  * every token is valid for its voice
  * all four voices of a track have exactly equal total length (loops stay in sync)
  * bar lines '|' fall on multiples of the track's bar length (when bar > 0)
  * looping tracks last at least ~30 s; pitches stay in a sane range
Exit status 1 on any error.
"""
import os
import re
import sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_JS = os.path.join(HERE, '..', 'js', 'audio.js')
VOICES = ['p1', 'p2', 'tri', 'noi']
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
NOTE_RE = re.compile(r'^([A-G])([#b]?)(-?\d)$')
DUR_RE = re.compile(r'^(\d+)(\.?)$')
NOISE = set('kshocm')
RANGES = {'p1': (48, 100), 'p2': (45, 96), 'tri': (23, 72)}  # MIDI


def expand(src):
    src = src.replace('[', ' [ ')
    src = re.sub(r'\](x\d+)?', lambda m: ' ]' + (m.group(1) or '') + ' ', src)
    stack = [[]]
    for t in src.split():
        if t == '[':
            stack.append([])
        elif t.startswith(']'):
            n = int(t[2:]) if len(t) > 2 else 2
            if len(stack) < 2:
                raise ValueError('unbalanced ]')
            body = stack.pop()
            stack[-1].extend(body * n)
        else:
            stack[-1].append(t)  # '|' kept for bar checks
    if len(stack) != 1:
        raise ValueError('unbalanced [')
    return stack[0]


def parse_voice(src, voice, bar, errors, label):
    t = Fraction(0)
    dur = Fraction(1)
    bar_no = 0
    for tok in expand(src):
        if tok == '|':
            bar_no += 1
            if bar and t % bar != 0:
                errors.append('%s: bar line #%d at beat %s is not a multiple of %s'
                              % (label, bar_no, t, bar))
            continue
        parts = tok.split(':')
        name = parts[0]
        if len(parts) > 2:
            errors.append('%s: bad token %r' % (label, tok))
            continue
        if len(parts) == 2:
            m = DUR_RE.match(parts[1])
            if not m or int(m.group(1)) not in (1, 2, 4, 8, 16, 32):
                errors.append('%s: bad duration in %r' % (label, tok))
                continue
            dur = Fraction(4, int(m.group(1))) * (Fraction(3, 2) if m.group(2) else 1)
        if name != 'r':
            if voice == 'noi':
                if name not in NOISE:
                    errors.append('%s: bad noise token %r' % (label, tok))
            else:
                m = NOTE_RE.match(name)
                if not m:
                    errors.append('%s: bad note %r' % (label, tok))
                else:
                    s = SEMI[m.group(1)] + {'#': 1, 'b': -1, '': 0}[m.group(2)]
                    midi = (int(m.group(3)) + 1) * 12 + s
                    lo, hi = RANGES[voice]
                    if not lo <= midi <= hi:
                        errors.append('%s: note %r out of range' % (label, tok))
        t += dur
    return t


def main():
    with open(AUDIO_JS, encoding='utf-8') as f:
        js = f.read()
    m = re.search(r'/\*TRACKS_BEGIN\*/(.*)/\*TRACKS_END\*/', js, re.S)
    if not m:
        print('TRACKS markers not found')
        return 1
    block = m.group(1)
    errors = []
    tracks = list(re.finditer(r'(\w+)\s*:\s*\{([^{}]*)\}', block))
    if not tracks:
        print('no tracks found')
        return 1
    print('%-10s %5s %4s %5s %8s %7s  %s' % ('track', 'bpm', 'bar', 'loop', 'beats', 'secs', 'voices'))
    for tm in tracks:
        name, body = tm.group(1), tm.group(2)
        bpm = Fraction(re.search(r'\bbpm:\s*([\d.]+)', body).group(1))
        bm = re.search(r'\bbar:\s*([\d.]+)', body)
        bar = Fraction(bm.group(1)) if bm else Fraction(0)
        loop = not re.search(r'\bloop:\s*false', body)
        voices = dict((vm.group(1), vm.group(2))
                      for vm in re.finditer(r'\b(p1|p2|tri|noi)\s*:\s*`([^`]*)`', body))
        lens = {}
        for v in VOICES:
            if v not in voices:
                errors.append('%s: missing voice %s' % (name, v))
                continue
            try:
                lens[v] = parse_voice(voices[v], v, bar, errors, '%s.%s' % (name, v))
            except ValueError as e:
                errors.append('%s.%s: %s' % (name, v, e))
        if len(set(lens.values())) > 1:
            errors.append('%s: voice lengths differ: %s'
                          % (name, ', '.join('%s=%s' % (k, lens[k]) for k in VOICES if k in lens)))
        beats = max(lens.values()) if lens else Fraction(0)
        secs = float(beats * 60 / bpm)
        if bar and beats % bar:
            errors.append('%s: total %s beats is not a whole number of bars' % (name, beats))
        if loop and secs < 29.9:
            errors.append('%s: loop only %.1f s long' % (name, secs))
        print('%-10s %5s %4s %5s %8s %7.2f  %s' % (
            name, bpm, bar, 'yes' if loop else 'no', beats, secs,
            ' '.join('%s=%s' % (k, lens.get(k)) for k in VOICES)))
    if errors:
        print('\nFAILED (%d errors):' % len(errors))
        for e in errors:
            print('  ' + e)
        return 1
    print('\nOK: all %d tracks consistent' % len(tracks))
    return 0


if __name__ == '__main__':
    sys.exit(main())
