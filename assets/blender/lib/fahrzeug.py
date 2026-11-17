"""Fahrzeuge (eigene Entwürfe für „Letzte Schicht“): Pritschenwagen – fahrbereit im Notbau-Zustand (Rammschutz
aus Rohren, Gitter vor den Scheiben, Kanister auf der Ladefläche) und als Wrack am Startfundort (platte Reifen,
offene Haube, Rost) – dazu der Benzinkanister. Ursprung = Wagenmitte; Front zeigt nach +x (Osten)."""
import math
import random

import bauten
import eisen
import gw_ground

lin = gw_ground.lin
W = bauten.weathered

L, B = 2.7, 1.25  # Länge, Breite (Felder)


def _mats(wreck):
    body = W('pk_body' + ('w' if wreck else ''), '#5e6b4a' if not wreck else '#6b5a3c', metal=0.5, rough=0.55,
             rust=0.9 if wreck else 0.45, dust=0.55, edge=0.75, grime=0.7, streaks=0.6)
    return {
        'body': body,
        'rust': W('pk_rust', '#5a3320', metal=0.4, rough=0.8, rust=0.9, dust=0.4, edge=0.3),
        'dark': eisen.material('pk_dark', (0.015, 0.016, 0.018), rough=0.2),
        'tire': W('pk_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0),
        'steel': W('pk_steel', '#55524c', metal=0.8, rough=0.45, rust=0.55, dust=0.4, edge=0.6, grime=0.5),
        'wood': gw_ground.pmat('pk_wood', lin('#6a5238'), 0.9, 0.4, 0.6, 26),
        'red': W('pk_can', '#8a2a1e', metal=0.4, rough=0.5, rust=0.3, dust=0.4, edge=0.6),
        'lamp': eisen.material('pk_lamp', eisen.srgb('#d9d2b0'), rough=0.2, metal=0.3),
    }


def pickup(wreck=False):
    rnd = random.Random(77 + int(wreck))
    m = _mats(wreck)
    o = []
    sag = -0.06 if wreck else 0.0
    z0 = 0.38 + sag
    # Fahrgestell, Kabine vorn, Pritsche hinten
    o.append(eisen.box('frame', (L - 0.1, B - 0.25, 0.12), (0, 0, 0.3 + sag), m['steel'], bevel=0.02))
    o.append(eisen.box('hood', (0.75, B, 0.34), (L / 2 - 0.4, 0, z0 + 0.1), m['body'], bevel=0.08))
    o.append(eisen.box('cab', (0.85, B, 0.62), (0.18, 0, z0 + 0.24), m['body'], bevel=0.09))
    o.append(eisen.box('roof', (0.62, B - 0.12, 0.05), (0.12, 0, z0 + 0.56), m['body'], bevel=0.02))
    o.append(eisen.box('wind', (0.04, B - 0.2, 0.26), (0.55, 0, z0 + 0.42), m['dark'], rot=(0, -0.55, 0)))
    for s in (-1, 1):
        o.append(eisen.box(f'win{s}', (0.5, 0.03, 0.2), (0.15, s * (B / 2 + 0.005), z0 + 0.4), m['dark']))
    o.append(eisen.box('backwin', (0.03, B - 0.3, 0.16), (-0.255, 0, z0 + 0.42), m['dark']))
    # Pritsche: Boden und Bordwände
    bx = -L / 2 + 0.62
    o.append(eisen.box('bed', (1.18, B - 0.06, 0.06), (bx, 0, z0 + 0.04), m['rust' if wreck else 'steel'], bevel=0.01))
    for s in (-1, 1):
        o.append(eisen.box(f'rail{s}', (1.2, 0.05, 0.28), (bx, s * (B / 2 - 0.03), z0 + 0.16), m['body'], bevel=0.015))
    o.append(eisen.box('gate', (0.05, B - 0.06, 0.26), (-L / 2 + 0.02, 0, z0 + 0.15), m['body'], bevel=0.015,
                       rot=(0, 0.9 if wreck else 0, 0)))
    # Räder
    for sx in (-1, 1):
        for sy in (-1, 1):
            flat = wreck and (sx, sy) != (1, 1)
            r = 0.17 if flat else 0.21
            pos = (sx * 0.85, sy * (B / 2 - 0.02), r)
            o.append(eisen.cylinder(f'wh{sx}{sy}', r, 0.18, pos, m['tire'], segments=16, rot=(math.pi / 2, 0, 0)))
            o.append(eisen.cylinder(f'rim{sx}{sy}', 0.1, 0.19, pos, m['steel'], segments=10, rot=(math.pi / 2, 0, 0)))
            o.append(eisen.box(f'fender{sx}{sy}', (0.55, 0.08, 0.05), (sx * 0.85, sy * (B / 2 + 0.01), 0.47 + sag), m['body'], bevel=0.02))
    # Scheinwerfer
    for t in (-1, 1):
        o.append(eisen.cylinder(f'hl{t}', 0.07, 0.04, (L / 2 - 0.02, t * (B / 2 - 0.2), z0 + 0.12),
                                m['dark'] if wreck else m['lamp'], segments=12, rot=(0, math.pi / 2, 0)))
    if wreck:
        # offene Haube, Rost, verstreuter Kleinkram
        o.append(eisen.box('hoodopen', (0.6, B - 0.1, 0.03), (L / 2 - 0.55, 0, z0 + 0.55), m['body'], bevel=0.01, rot=(0, -1.0, 0)))
        o.append(eisen.box('engine', (0.5, B - 0.4, 0.14), (L / 2 - 0.4, 0, z0 + 0.3), m['rust'], bevel=0.03))
        for i in range(6):
            o.append(eisen.box(f'part{i}', (rnd.uniform(0.06, 0.16), rnd.uniform(0.04, 0.1), 0.03),
                               (rnd.uniform(-1.4, 1.4), rnd.choice((-1, 1)) * rnd.uniform(0.75, 0.95), 0.02),
                               rnd.choice((m['rust'], m['steel'])), rot=(0, 0, rnd.uniform(0, 3))))
    else:
        # Notbau: Rammschutz aus Rohren, Gitter vor der Scheibe, Kanister und Kiste auf der Pritsche
        for t in (-1, 1):
            o.append(eisen.box(f'ram{t}', (0.06, 0.06, 0.4), (L / 2 + 0.12, t * 0.42, 0.42), m['steel'], bevel=0.01))
            o.append(eisen.box(f'ramarm{t}', (0.22, 0.05, 0.05), (L / 2 + 0.02, t * 0.42, 0.34), m['steel'], bevel=0.01))
        for i, z in enumerate((0.3, 0.46, 0.6)):
            o.append(eisen.box(f'rambar{i}', (0.06, B + 0.05, 0.05), (L / 2 + 0.14, 0, z), m['steel'], bevel=0.01))
        for i in range(4):
            o.append(eisen.box(f'grid{i}', (0.02, B - 0.25, 0.015), (0.6, 0, z0 + 0.32 + i * 0.07), m['steel'], rot=(0, -0.55, 0)))
        o.append(eisen.box('rack', (0.04, B - 0.1, 0.04), (-0.05, 0, z0 + 0.7), m['steel'], bevel=0.01))
        for s in (-1, 1):
            o.append(eisen.box(f'rackp{s}', (0.04, 0.04, 0.16), (-0.05, s * (B / 2 - 0.07), z0 + 0.62), m['steel']))
        for i in range(2):
            o.append(eisen.box(f'can{i}', (0.2, 0.12, 0.26), (-0.52 - i * 0.14, -0.38, z0 + 0.2), m['red'], bevel=0.02))
        o.append(eisen.box('crate', (0.38, 0.4, 0.24), (-0.9, 0.2, z0 + 0.19), m['wood'], bevel=0.015, rot=(0, 0, 0.12)))
        o.append(eisen.box('tarp', (0.36, 0.42, 0.04), (-0.4, 0.22, z0 + 0.1), W('pk_tarp', '#4e5233', metal=0.0, rough=0.95, rust=0.0, dust=0.6, edge=0.2), bevel=0.02))
    return eisen.parent_all(o, 'pickup')


def fuel_can():
    m = _mats(False)
    o = [eisen.box('body', (0.5, 0.22, 0.62), (0, 0, 0.31), m['red'], bevel=0.04),
         eisen.box('handle', (0.32, 0.06, 0.06), (-0.05, 0, 0.66), m['red'], bevel=0.02),
         eisen.cylinder('spout', 0.05, 0.12, (0.17, 0, 0.68), m['steel'], segments=10, rot=(0, -0.5, 0)),
         eisen.box('rib', (0.36, 0.24, 0.04), (0, 0, 0.38), m['red'], bevel=0.01, rot=(0, 0.6, 0))]
    return eisen.parent_all(o, 'fuelcan')
