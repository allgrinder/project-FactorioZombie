"""Zombies (lib/zombie.py): je Art 8 Richtungen × 6 Laufbilder (Schatten im Bild) und zwei Kadaver.
Richtung k: 0 = Norden, im Uhrzeigersinn in 45°-Schritten (wie die Spielfigur)."""
import math

import eisen
import zombie

DIRS = 8
WALK = 6
# Leinwand und Anker je Art (der Brocken ist größer)
SIZE = {
    'walker': ((1.25, 1.5), (0.5, 1.05 / 1.5)),
    'runner': ((1.25, 1.5), (0.5, 1.05 / 1.5)),
    'screamer': ((1.5, 1.5), (0.5, 1.05 / 1.5)),
    'brute': ((1.75, 2.0), (0.5, 1.4 / 2.0)),
}
SCALE = {'walker': 1.0, 'runner': 0.97, 'screamer': 1.0, 'brute': 1.45}


def render(out):
    for kind, (canvas, anchor) in SIZE.items():
        for k in range(DIRS):
            frames = []
            for f in range(WALK):
                eisen.reset(samples=28)
                root = zombie.zombie(kind, f / WALK, variant=0)
                root.scale = (SCALE[kind],) * 3
                root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
                eisen.shadow_catcher(5)
                eisen.camera(*canvas, anchor=anchor)
                frames.append(out.render_frame(f'zombie.{kind}.{k}', f))
            out.add(f'zombie.{kind}.{k}', 'entities', frames, anchor, fps=10, meta={'angles': DIRS})
        dead = []
        dcanvas = (max(2.25, canvas[0] + 1.0), max(2.0, canvas[1] + 0.25))
        danchor = (0.5, 0.55)
        for v in range(2):
            eisen.reset(samples=28)
            root = zombie.zombie(kind, 0.2, variant=v, dead=True)
            root.scale = (SCALE[kind],) * 3
            eisen.shadow_catcher(5)
            eisen.camera(*dcanvas, anchor=danchor)
            dead.append(out.render_frame(f'zombie.{kind}.dead', v))
        out.add(f'zombie.{kind}.dead', 'entities', dead, danchor)
