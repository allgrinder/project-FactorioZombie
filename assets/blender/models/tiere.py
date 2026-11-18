"""Wildtiere (lib/tiere.py): je Art 8 Richtungen × 6 Laufbilder, ein Äsungsbild je Richtung und ein Kadaver;
Krähen sitzend (4 Richtungen) und fliegend (8 Richtungen × 4 Flügelschläge). Richtung k: 0 = Norden, im Uhrzeigersinn."""
import math

import eisen
import tiere

DIRS = 8
WALK = 6
SIZE = {
    'deer': ((1.75, 1.75), (0.5, 1.2 / 1.75)),
    'rabbit': ((0.75, 0.75), (0.5, 0.45 / 0.75)),
    'boar': ((1.75, 1.5), (0.5, 1.0 / 1.5)),
}


def render(out):
    for kind, (canvas, anchor) in SIZE.items():
        for k in range(DIRS):
            rot = math.pi - k * math.pi / 4
            frames = []
            for f in range(WALK):
                eisen.reset(samples=24)
                root = tiere.animal(kind, f / WALK)
                root.rotation_euler = (0, 0, rot)
                eisen.shadow_catcher(5)
                eisen.camera(*canvas, anchor=anchor)
                frames.append(out.render_frame(f'animal.{kind}.{k}', f))
            out.add(f'animal.{kind}.{k}', 'entities', frames, anchor, fps=10, meta={'angles': DIRS})
            eisen.reset(samples=24)
            root = tiere.animal(kind, 0, graze=True)
            root.rotation_euler = (0, 0, rot)
            eisen.shadow_catcher(5)
            eisen.camera(*canvas, anchor=anchor)
            out.add(f'animal.{kind}.graze.{k}', 'entities', [out.render_frame(f'animal.{kind}.graze.{k}', 0)], anchor)
        eisen.reset(samples=24)
        root = tiere.animal(kind, 0, dead=True)
        root.rotation_euler = (root.rotation_euler[0], root.rotation_euler[1], 0.6)
        eisen.shadow_catcher(5)
        eisen.camera(*canvas, anchor=(0.5, 0.55))
        out.add(f'animal.{kind}.dead', 'entities', [out.render_frame(f'animal.{kind}.dead', 0)], (0.5, 0.55))
    for k in range(4):
        eisen.reset(samples=20)
        root = tiere.crow(sitting=True)
        root.rotation_euler = (0, 0, math.pi - k * math.pi / 2)
        eisen.shadow_catcher(3)
        eisen.camera(0.5, 0.5, anchor=(0.5, 0.7))
        out.add(f'crow.sit.{k}', 'entities', [out.render_frame(f'crow.sit.{k}', 0)], (0.5, 0.7))
    for k in range(DIRS):
        frames = []
        for f in range(4):
            eisen.reset(samples=20, ground=False)
            root = tiere.crow(f / 4, sitting=False)
            root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
            eisen.camera(0.75, 0.75, anchor=(0.5, 0.5), target=(0, 0, 0.6))
            frames.append(out.render_frame(f'crow.fly.{k}', f))
        out.add(f'crow.fly.{k}', 'entities', frames, (0.5, 0.5), fps=12)
    # Gegenstände: rohes Fleisch, Braten, Fell
    for name, fn in (('raw-meat', lambda: tiere.meat(False)), ('cooked-meat', lambda: tiere.meat(True)), ('hide', tiere.hide)):
        eisen.reset(samples=40)
        root = fn()
        root.rotation_euler = (0, 0, math.radians(20))
        eisen.camera(1, 1, anchor=(0.5, 0.56))
        out.add(f'item.{name}', 'items', [out.render_frame(f'item.{name}', 0)], (0.5, 0.5))
    # Enten (8 Richtungen, zwei Arten) und Wellenringe (4 Stufen) für das Leben auf dem Wasser
    for v in range(2):
        for k in range(8):
            eisen.reset(samples=20, ground=False)
            root = tiere.duck(v)
            root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
            eisen.camera(0.75, 0.75, anchor=(0.5, 0.55))
            out.add(f'duck.{v}.{k}', 'entities', [out.render_frame(f'duck.{v}.{k}', 0)], (0.5, 0.55))
    for k in range(4):
        eisen.reset(samples=12, ground=False)
        tiere.ripple(k / 3)
        eisen.camera(1.5, 1.5, tilt=0.0)
        out.add(f'fx.ripple.{k}', 'effects', [out.render_frame(f'fx.ripple.{k}', 0)], (0.5, 0.5))
