"""Geschwungene Straßen (eigene Entwürfe für „Letzte Schicht“): Querschnitts-Stücke einer Landstraße (Asphalt mit
Rissen, bröckelnder Rand, Kies), Mittellinien-Strich und Feldweg (zwei Fahrspuren aus Erde). Das Spiel legt die Stücke
dicht hintereinander entlang der Kurve und dreht sie in Fahrtrichtung. x = Fahrtrichtung, y = quer."""
import math
import random

import eisen
import gw_ground

lin = gw_ground.lin

L = 0.72          # Länge eines Stücks (Abstand im Spiel 0,5 Felder: überlappend)
CORE = 2.5        # Asphaltbreite


def road_slice(v):
    rnd = random.Random(700 + v)
    o = []
    tar = gw_ground.pmat('rd_tar', lin('#3c3c3d'), 0.95, 0.35, 0.6, 40)
    tar2 = gw_ground.pmat('rd_tar2', lin('#454443'), 0.95, 0.35, 0.6, 40)
    grit = gw_ground.pmat('rd_grit', lin('#6e665a'), 1.0, 0.3, 0.6, 30)
    crack = eisen.material('rd_crack', (0.014, 0.014, 0.014), rough=0.95)
    weed = gw_ground.pmat('rd_weed', lin('#55602f'), 0.95, 0.4, 0.5, 30)
    o.append(eisen.box('core', (L, CORE, 0.02), (0, 0, 0), tar))
    # ausgefahrene Spuren etwas heller
    for s in (-1, 1):
        o.append(eisen.box(f'rut{s}', (L, 0.45, 0.004), (0, s * 0.62, 0.011), tar2))
    # bröckelnder Rand: unregelmäßige Asphaltbrocken, dann Kies
    for s in (-1, 1):
        for k in range(5):
            x = -L / 2 + (k + 0.5) * L / 5
            w = rnd.uniform(0.06, 0.16)
            o.append(eisen.box(f'edge{s}{k}', (L / 5 + 0.02, w, 0.018), (x, s * (CORE / 2 + w / 2 - 0.02), 0), tar))
        for k in range(9):
            r = rnd.uniform(0.012, 0.035)
            o.append(eisen.rock(f'gr{s}{k}', r, (rnd.uniform(-L / 2, L / 2), s * rnd.uniform(CORE / 2 + 0.05, CORE / 2 + 0.3), 0.005), grit, 900 + v * 50 + k + (s + 1) * 20,
                                squash=0.6, detail=1))
    # Risse und Unkraut
    for c in range(rnd.randint(0, 2)):
        x, y = rnd.uniform(-0.3, 0.3), rnd.uniform(-1.0, 1.0)
        a = rnd.uniform(0, math.tau)
        for k in range(rnd.randint(2, 4)):
            a += rnd.uniform(-0.6, 0.6)
            l = rnd.uniform(0.08, 0.18)
            o.append(eisen.box(f'cr{c}{k}', (l, rnd.uniform(0.008, 0.018), 0.004), (x + math.cos(a) * l / 2, y + math.sin(a) * l / 2, 0.012), crack, rot=(0, 0, a)))
            if rnd.random() < 0.3:
                o.append(eisen.cylinder(f'wd{c}{k}', rnd.uniform(0.015, 0.03), 0.01, (x, y, 0.014), weed, segments=7))
            x += math.cos(a) * l
            y += math.sin(a) * l
    return eisen.parent_all(o, 'roadslice')


def dash(v):
    rnd = random.Random(760 + v)
    paint = gw_ground.pmat('rd_paint', lin('#c9c2a8'), 0.8, 0.35, 0.5, 30)
    o = []
    x = -0.5
    while x < 0.5:
        l = min(0.5 - x, rnd.uniform(0.15, 0.4))
        if rnd.random() < 0.85:
            o.append(eisen.box(f'd{len(o)}', (l - 0.01, 0.09, 0.004), (x + l / 2, 0, 0.002), paint))
        x += l
    return eisen.parent_all(o, 'dash')


def track_slice(v):
    rnd = random.Random(780 + v)
    soil = gw_ground.pmat('tr_soil', lin('#5a4a34'), 1.0, 0.4, 0.7, 24)
    soil2 = gw_ground.pmat('tr_soil2', lin('#4e4030'), 1.0, 0.4, 0.7, 24)
    grass = gw_ground.pmat('tr_grass', lin('#5e6a34'), 0.95, 0.4, 0.6, 30)
    o = []
    for s in (-1, 1):
        o.append(eisen.box(f'rut{s}', (L, 0.38, 0.015), (0, s * 0.5, 0), soil if s < 0 else soil2, bevel=0.005))
        for k in range(4):
            o.append(eisen.rock(f'p{s}{k}', rnd.uniform(0.01, 0.025), (rnd.uniform(-L / 2, L / 2), s * 0.5 + rnd.uniform(-0.15, 0.15), 0.01), soil2, 950 + v * 30 + k + s * 7, squash=0.5, detail=1))
    for k in range(5):
        o.append(eisen.cylinder(f'g{k}', rnd.uniform(0.02, 0.05), 0.02, (rnd.uniform(-L / 2, L / 2), rnd.uniform(-0.15, 0.15), 0.01), grass, segments=7))
    return eisen.parent_all(o, 'trackslice')
