"""Himmel (lib/himmel.py): Hubschrauber von oben in 8 Richtungen × 4 Rotorbildern, Schatten getrennt (heli.shadow)."""
import math

import eisen
import himmel
import ruinen

DIRS = 8


def render(out):
    for k in range(DIRS):
        frames = []
        for f in range(4):
            eisen.reset(samples=20, ground=False)
            r = himmel.helicopter(f / 4)
            r.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
            eisen.camera(8.0, 8.0, anchor=(0.5, 0.5), target=(0, 0, 1.4))
            frames.append(out.render_frame(f'heli.{k}', f))
        out.add(f'heli.{k}', 'entities', frames, (0.5, 0.5), fps=20)
    # Absturzstelle: Wrack als Fundort mit Schatten
    canvas, anchor, sh, sha = ruinen.spec(5, 4, 1.6, margin=0.3)
    eisen.reset(samples=32)
    himmel.wreck()
    eisen.camera(*canvas, anchor=anchor)
    out.add('heli-wreck.v0', 'entities', [out.render_frame('heli-wreck.v0', 0)], anchor)
    eisen.reset(samples=12)
    himmel.wreck()
    eisen.shadow_render(out, 'heli-wreck.v0.shadow', 'entities', sh, sha, half=True)
