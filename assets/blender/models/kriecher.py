"""Kriecher (lib/kriecher.py): 8 Richtungen × 6 Kriechbilder (Schatten im Bild) und Kadaver, drei Kleidungen
(zombie.crawler.<k>, zombie.crawler.v<n>.<k>)."""
import math

import eisen
import kriecher

DIRS = 8
WALK = 6
CANVAS = ((1.25, 1.25), (0.5, 0.62))


def render(out):
    for v in range(3):
        base = 'zombie.crawler' if v == 0 else f'zombie.crawler.v{v}'
        for k in range(DIRS):
            frames = []
            for f in range(WALK):
                eisen.reset(samples=24)
                root = kriecher.crawler(f / WALK, v)
                root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
                eisen.shadow_catcher(4)
                eisen.camera(*CANVAS[0], anchor=CANVAS[1])
                frames.append(out.render_frame(f'{base}.{k}', f))
            out.add(f'{base}.{k}', 'entities', frames, CANVAS[1], fps=8, meta={'angles': DIRS})
        eisen.reset(samples=24)
        kriecher.crawler(0.0, v, dead=True)
        eisen.shadow_catcher(4)
        eisen.camera(*CANVAS[0], anchor=(0.5, 0.55))
        out.add(f'{base}.dead', 'entities', [out.render_frame(f'{base}.dead', 0)], (0.5, 0.55))
