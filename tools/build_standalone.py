#!/usr/bin/env python3
"""Bundle The Hollow Crown into one self-contained HTML file: dist/hollow-crown.html

Inlines every js/*.js file (in load order) into index.html, replacing the
cache-busting script loader. The result runs offline by double-clicking it.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['engine', 'audio', 'sprites', 'data', 'world', 'dungeon', 'entities', 'enemies', 'game']

html = (ROOT / 'index.html').read_text()
loader = re.search(r'<script>\s*// version stamp.*?</script>\n', html, re.S)
if not loader:
    raise SystemExit('could not find the script loader in index.html')

parts = []
for name in ORDER:
    src = (ROOT / 'js' / f'{name}.js').read_text()
    if re.search(r'</script', src, re.I):
        raise SystemExit(f'js/{name}.js contains "</script" and cannot be inlined safely')
    parts.append(f'<script>\n// ===== js/{name}.js =====\n{src}\n</script>\n')

out = html[:loader.start()] + ''.join(parts) + html[loader.end():]
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
target = dist / 'hollow-crown.html'
target.write_text(out)
print(f'wrote {target} ({target.stat().st_size // 1024} KB)')
