"""Ortsbild (lib/ruinen.asphalt als Grundlage): Gehwegplatten, Acker mit Furchen und Stoppeln, Asphalt mit
gestrichelter Mittellinie am Süd- bzw. Ostrand. Je 4 Varianten, 1×1-Kacheln von oben."""
import math
import random

import eisen
import gw_ground
import ruinen

lin = gw_ground.lin


def pavement(v):
    rnd = random.Random(300 + v)
    o = []
    grout = gw_ground.pmat('pv_grout', lin('#3e3b36'), 0.95, 0.3, 0.6, 30)
    o.append(eisen.box('base', (1.06, 1.06, 0.02), (0, 0, -0.01), grout))
    tones = [gw_ground.pmat(f'pv_t{i}', lin(h), 0.9, 0.35, 0.6, 18 + i) for i, h in enumerate(('#7a766d', '#6f6b63', '#85817a'))]
    moss = gw_ground.pmat('pv_moss', lin('#4a5530'), 0.95, 0.4, 0.6, 30)
    for j in range(2):
        for i in range(2):
            if rnd.random() < 0.06:
                continue  # fehlende Platte
            tilt = (rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(-0.02, 0.02))
            o.append(eisen.box(f'p{i}{j}', (0.47, 0.47, 0.04), (-0.25 + i * 0.5, -0.25 + j * 0.5, 0.02 + rnd.uniform(0, 0.01)), rnd.choice(tones), bevel=0.01, rot=tilt))
    for k in range(rnd.randint(1, 4)):
        o.append(eisen.cylinder(f'm{k}', rnd.uniform(0.02, 0.05), 0.01, (rnd.choice((-0.5, 0, 0.5)) + rnd.uniform(-0.05, 0.05), rnd.uniform(-0.5, 0.5), 0.03), moss, segments=7))
    return eisen.parent_all(o, 'pavement')


def field(v):
    rnd = random.Random(320 + v)
    o = []
    soil = gw_ground.pmat('fd_soil', lin('#4a3a26'), 1.0, 0.4, 0.8, 22)
    soil2 = gw_ground.pmat('fd_soil2', lin('#3d2f1f'), 1.0, 0.4, 0.8, 22)
    o.append(eisen.box('base', (1.06, 1.06, 0.02), (0, 0, -0.01), soil2))
    # Furchen in Ost-West-Richtung, 4 je Feld (durchgehend über die Feldgrenzen)
    for r in range(4):
        y = -0.375 + r * 0.25
        o.append(eisen.box(f'ridge{r}', (1.06, 0.14, 0.05), (0, y, 0.02), soil, bevel=0.03))
    stub = gw_ground.pmat('fd_stub', lin('#a08a50'), 0.95, 0.4, 0.6, 40)
    weed = gw_ground.pmat('fd_weed', lin('#5a6a30'), 0.95, 0.4, 0.6, 40)
    for k in range(26):
        r = rnd.randrange(4)
        x = rnd.uniform(-0.5, 0.5)
        y = -0.375 + r * 0.25 + rnd.uniform(-0.04, 0.04)
        m = weed if rnd.random() < 0.25 else stub
        o.append(eisen.cylinder(f's{k}', 0.008, rnd.uniform(0.04, 0.09), (x, y, 0.07), m, segments=5, rot=(rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0)))
    return eisen.parent_all(o, 'field')


def roadline(v, edge):
    root = ruinen.asphalt(v)
    paint = gw_ground.pmat('rl_paint', lin('#c9c2a8'), 0.8, 0.35, 0.5, 30)
    # Linie am Rand: halbe Breite in diesem Feld, abgewetzt (zwei Stücke)
    rnd = random.Random(340 + v)
    parts = [(-0.5, -0.05), (0.05, 0.5)] if v % 2 else [(-0.5, 0.5)]
    for i, (a, b) in enumerate(parts):
        L = b - a - rnd.uniform(0, 0.08)
        c = (a + b) / 2
        if edge == 's':
            ob = eisen.box(f'line{i}', (L, 0.05, 0.006), (c, -0.475, 0.003), paint)
        else:
            ob = eisen.box(f'line{i}', (0.05, L, 0.006), (0.475, c, 0.003), paint)
        ob.parent = root
    return root


def render(out):
    for prefix, fn in (('floor.pavement', pavement), ('floor.field', field),
                       ('floor.roadline-s', lambda v: roadline(v, 's')), ('floor.roadline-e', lambda v: roadline(v, 'e'))):
        for v in range(4):
            eisen.reset(samples=32, ground=False)
            fn(v)
            eisen.camera(1.0, 1.0)
            name = f'{prefix}.{v}'
            out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
