"""Trümmer statt Erz (eigene Entwürfe für „Letzte Schicht“): Eisenschrott (Träger, Bleche, Zahnräder, Rohre),
Kupferschrott (Kabelrollen, Kupferrohre mit Patina), Bauschutt (Betonbrocken, Ziegel, Bewehrung), Kohle
(Brocken, verkohlte Balken). pieces() legt n Teile in einem Kreis ab; jedes Feld bekommt etwas Fremdmaterial
dazu, damit gemischte Felder ineinander übergehen."""
import math

import bauten
import eisen
import gw_ground
import kit

lin = gw_ground.lin
W = bauten.weathered

# Grundtöne des aufgewühlten Bodens je Material
GROUND = {
    'iron-ore': ('#3f3228', '#4a3a2c'),
    'copper-ore': ('#3c3228', '#473a2c'),
    'stone': ('#5a5348', '#665e52'),
    'coal': ('#27231f', '#322d28'),
}


class Mats:
    def __init__(self, p='tm'):
        self.rust = [W(f'{p}r{i}', h, metal=0.5, rough=0.75, rust=0.85, dust=0.3, edge=0.5, streaks=0.5)
                     for i, h in enumerate(('#6a3a22', '#55402f', '#7a4a2a'))]
        self.steel = W(p + 'st', '#5a5d5e', metal=0.85, rough=0.45, rust=0.5, dust=0.3, edge=0.6)
        self.paint = [W(f'{p}p{i}', h, metal=0.3, rough=0.6, rust=0.65, dust=0.3, edge=0.7, streaks=0.6)
                      for i, h in enumerate(('#4f5541', '#414c5e', '#6e5a2a'))]
        self.copper = [W(f'{p}c{i}', h, metal=0.9, rough=0.4, rust=0.45, dust=0.15, edge=0.6, rust_hex='#3f7a66')
                       for i, h in enumerate(('#a85a2e', '#8f4a28', '#b8703a'))]
        self.insul = [W(f'{p}i{i}', h, metal=0.0, rough=0.7, rust=0.0, dust=0.4, edge=0.2) for i, h in enumerate(('#1f1f1e', '#5a1f1a', '#2a3a55'))]
        self.conc = [gw_ground.pmat(f'{p}k{i}', lin(h), 0.95, 0.3, 0.6, 20 + i) for i, h in enumerate(('#6e6a62', '#5e5b54', '#7a756c'))]
        self.brick = [W(f'{p}b{i}', h, metal=0.0, rough=0.9, rust=0.2, dust=0.5, edge=0.6) for i, h in enumerate(('#7a4030', '#6a3a2c', '#8a5038'))]
        self.coal = [gw_ground.pmat(f'{p}o{i}', lin(h), 0.55, 0.25, 0.5, 25, 0.5) for i, h in enumerate(('#1c1c1d', '#262627', '#151516', '#2c2b2c'))]
        self.char = gw_ground.pmat(p + 'ch', lin('#1a1512'), 0.9, 0.3, 0.6, 30)


def _rot(rnd, flat=0.35):
    return (rnd.uniform(-flat, flat), rnd.uniform(-flat, flat), rnd.uniform(0, math.tau))


def piece(res, m, rnd, x, y, s):
    """Ein Trümmerteil der Größe s (≈ Radius) bei (x, y). Liefert eine Objektliste."""
    o = []
    k = rnd.random()
    if res == 'iron-ore':
        if k < 0.3:    # Träger / Profil
            L = s * rnd.uniform(2.2, 3.4)
            a = rnd.uniform(0, math.tau)
            kit.ibeam(o, 'beam', (x - math.cos(a) * L / 2, y - math.sin(a) * L / 2, s * 0.3), (x + math.cos(a) * L / 2, y + math.sin(a) * L / 2, s * rnd.uniform(0.3, 0.9)),
                      s * 0.55, s * 0.45, rnd.choice(m.rust))
        elif k < 0.55:  # verbogenes Blech
            o.append(eisen.box('plate', (s * rnd.uniform(1.6, 2.4), s * rnd.uniform(1.0, 1.6), s * 0.08), (x, y, s * 0.3), rnd.choice(m.paint + m.rust), bevel=s * 0.02,
                               rot=_rot(rnd, 0.5)))
        elif k < 0.7:   # Zahnrad
            g = bauten.gear('gear', s * 0.9, s * 0.35, 10, s * 0.25, m.steel)
            g.location = (x, y, s * 0.25)
            g.rotation_euler = _rot(rnd, 0.6)
            o.append(g)
        elif k < 0.88:  # Rohrstück
            o.append(eisen.cylinder('pipe', s * 0.32, s * rnd.uniform(1.8, 2.8), (x, y, s * 0.34), rnd.choice(m.rust), segments=10, rot=(math.pi / 2 + rnd.uniform(-0.2, 0.2), 0, rnd.uniform(0, 3.14))))
        else:           # Klotz (Motorblock)
            o.append(eisen.box('block', (s * 1.3, s * 1.0, s * 0.8), (x, y, s * 0.4), m.steel, bevel=s * 0.08, rot=_rot(rnd, 0.2)))
    elif res == 'copper-ore':
        if k < 0.4:     # Kabelrolle
            n = 28
            r = s * rnd.uniform(0.7, 1.0)
            ins = rnd.choice(m.insul)
            for ring in range(3):
                pts = [(x + math.cos(i / n * math.tau) * r * (1 - ring * 0.14), y + math.sin(i / n * math.tau) * r * (1 - ring * 0.14) * 0.9, s * (0.12 + ring * 0.1)) for i in range(n + 1)]
                kit.cable(o, f'coil{ring}', pts, s * 0.09, ins if ring != 1 else rnd.choice(m.copper))
        elif k < 0.75:  # Kupferrohr mit Patina
            o.append(eisen.cylinder('cpipe', s * 0.2, s * rnd.uniform(2.0, 3.2), (x, y, s * 0.22), rnd.choice(m.copper), segments=10,
                                    rot=(math.pi / 2 + rnd.uniform(-0.15, 0.15), 0, rnd.uniform(0, 3.14))))
        elif k < 0.9:   # Drahtgewirr
            pts = [(x + rnd.uniform(-s, s), y + rnd.uniform(-s, s), s * rnd.uniform(0.08, 0.5)) for _ in range(7)]
            kit.cable(o, 'tangle', pts, s * 0.06, rnd.choice(m.copper))
        else:           # Trafo / Motorwicklung
            o.append(eisen.cylinder('wind', s * 0.6, s * 0.7, (x, y, s * 0.35), rnd.choice(m.copper), segments=14, rot=_rot(rnd, 0.5)))
            o.append(eisen.box('core', (s * 0.5, s * 0.5, s * 0.9), (x, y, s * 0.4), m.steel, rot=(0, 0, rnd.uniform(0, 3))))
    elif res == 'stone':
        if k < 0.5:     # Betonbrocken
            o.append(eisen.rock('conc', s * rnd.uniform(0.8, 1.25), (x, y, s * 0.4), rnd.choice(m.conc), rnd.randint(0, 99999), squash=0.7, detail=1))
        elif k < 0.8:   # Ziegel
            for b in range(rnd.randint(1, 3)):
                o.append(eisen.box('brick', (s * 1.1, s * 0.52, s * 0.36), (x + rnd.uniform(-s, s) * 0.7, y + rnd.uniform(-s, s) * 0.7, s * 0.2 + b * s * 0.1), rnd.choice(m.brick),
                                   bevel=s * 0.03, rot=_rot(rnd, 0.3)))
        elif k < 0.92:  # Platte mit Bewehrung
            o.append(eisen.box('slab', (s * 2.2, s * 1.5, s * 0.3), (x, y, s * 0.25), rnd.choice(m.conc), bevel=s * 0.04, rot=_rot(rnd, 0.3)))
            for b in range(3):
                a = rnd.uniform(0, math.tau)
                o.append(bauten.beam('rebar', (x, y, s * 0.3), (x + math.cos(a) * s * 1.6, y + math.sin(a) * s * 1.6, s * rnd.uniform(0.3, 0.9)), (s * 0.06, s * 0.06), rnd.choice(m.rust)))
        else:
            o.append(eisen.box('tile', (s * 1.2, s * 1.2, s * 0.1), (x, y, s * 0.15), rnd.choice(m.brick + m.conc), rot=_rot(rnd, 0.4)))
    else:               # Kohle
        if k < 0.8:
            o.append(eisen.rock('coal', s * rnd.uniform(0.75, 1.2), (x, y, s * 0.4), rnd.choice(m.coal), rnd.randint(0, 99999), squash=0.75, detail=1))
        else:
            a = rnd.uniform(0, math.tau)
            L = s * rnd.uniform(2.0, 3.0)
            o.append(bauten.beam('char', (x - math.cos(a) * L / 2, y - math.sin(a) * L / 2, s * 0.2), (x + math.cos(a) * L / 2, y + math.sin(a) * L / 2, s * 0.3), (s * 0.4, s * 0.35), m.char))
    return o


def pieces(res, m, rnd, n, radius, size=(0.07, 0.13), foreign=0.2):
    """n Teile im Kreis radius; foreign = Anteil fremder Kleinteile (Schutt, Rostsplitter)."""
    o = []
    placed = []
    tries = 0
    while len(placed) < n and tries < 800:
        tries += 1
        s = rnd.uniform(*size)
        a = rnd.uniform(0, math.tau)
        d = radius * math.sqrt(rnd.random())
        x, y = math.cos(a) * d, math.sin(a) * d
        if any((x - px) ** 2 + (y - py) ** 2 < (s + ps) ** 2 * 0.9 for px, py, ps in placed):
            continue
        placed.append((x, y, s))
        other = [r for r in ('iron-ore', 'stone', 'copper-ore') if r != res]
        if rnd.random() < foreign:
            o.extend(piece(rnd.choice(other), m, rnd, x, y, s * 0.6))
        else:
            o.extend(piece(res, m, rnd, x, y, s))
    return o
