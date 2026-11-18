"""Himmel (lib/himmel.py): Hubschrauber von oben in 8 Richtungen × 4 Rotorbildern, Schatten getrennt (heli.shadow)."""
import math

import eisen
import himmel

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
