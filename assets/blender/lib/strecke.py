"""Stillgelegte Bahnstrecke (eigener Entwurf): Gleisstück im Schotterbett (von oben), Güterwagen, Kesselwagen,
Diesellok und Bahnsteigdach als Wracks. Längsachse x (Osten), Ursprung = Mitte der Grundfläche."""
import math
import random

import bauten
import eisen
import gw_ground
from zombie import sphere

lin = gw_ground.lin
W = bauten.weathered


def _rust(name, hex_, rust=0.8):
    return W(name, hex_, metal=0.6, rough=0.6, rust=rust, dust=0.5, edge=0.7, grime=0.7, streaks=0.8)


def rail_slice(v):
    """Ein Feld Gleis: Schotterbett, zwei Schwellen, rostige Schienen, Unkraut."""
    rnd = random.Random(9100 + v)
    o = []
    ballast = gw_ground.pmat('rl_ballast', lin('#6a645a'), 1.0, 0.45, 0.8, 50)
    stone = gw_ground.pmat('rl_stone', lin('#7a7468'), 1.0, 0.3, 0.6, 30)
    wood = W('rl_sleeper', '#4a3a2c', metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.3, grime=0.8, streaks=0.4)
    rail = _rust('rl_rail', '#5a4a3e', 0.9)
    head = W('rl_head', '#6a6460', metal=0.8, rough=0.4, rust=0.6, dust=0.3, edge=0.5, grime=0.3, streaks=0.2)
    weed = gw_ground.pmat('rl_weed', lin('#5a6a30'), 0.95, 0.4, 0.5, 30)
    o.append(eisen.box('bed', (1.0, 2.6, 0.05), (0, 0, 0.0), ballast))
    for k in range(14):
        o.append(eisen.rock(f's{k}', rnd.uniform(0.02, 0.05), (rnd.uniform(-0.5, 0.5), rnd.choice((-1, 1)) * rnd.uniform(0.9, 1.35), 0.03), stone, 9200 + v * 40 + k, squash=0.6, detail=1))
    for x in (-0.25, 0.25):
        o.append(eisen.box(f'sl{x}', (0.24, 1.75, 0.08), (x + rnd.uniform(-0.02, 0.02), 0, 0.05), wood, rot=(0, 0, rnd.uniform(-0.04, 0.04))))
    for y in (-0.48, 0.48):
        o.append(eisen.box(f'r{y}', (1.0, 0.07, 0.1), (0, y, 0.12), rail))
        o.append(eisen.box(f'h{y}', (1.0, 0.05, 0.02), (0, y, 0.175), head))
    for k in range(rnd.randint(1, 4)):
        x, y = rnd.uniform(-0.45, 0.45), rnd.uniform(-1.1, 1.1)
        for j in range(6):
            o.append(eisen.box(f'w{k}{j}', (0.015, 0.015, rnd.uniform(0.08, 0.2)), (x + rnd.uniform(-0.06, 0.06), y + rnd.uniform(-0.06, 0.06), 0.1), weed,
                               rot=(rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0)))
    return eisen.parent_all(o, 'rail')


def _bogies(o, length, wheel=0.28):
    steel = _rust('rl_bogie', '#2e2a26', 0.7)
    for x in (-length * 0.36, length * 0.36):
        o.append(eisen.box(f'bg{x}', (1.4, 1.2, 0.3), (x, 0, 0.35), steel))
        for dx in (-0.4, 0.4):
            for s in (-1, 1):
                o.append(eisen.cylinder(f'wh{x}{dx}{s}', wheel, 0.1, (x + dx, s * 0.5, wheel), steel, segments=14, rot=(math.pi / 2, 0, 0)))


def freight_car(v=0):
    """Gedeckter Güterwagen 6×2: Holz-/Blechkasten, Schiebetür offen (v1: umgekippt zur Seite geneigt)."""
    body = _rust(f'fc_body{v}', ('#6a3a2a', '#4a5a4a', '#5a4a3a')[v % 3])
    dark = eisen.material('fc_in', (0.02, 0.02, 0.02), rough=0.9)
    o = []
    _bogies(o, 8.4)
    o.append(eisen.box('frame', (8.6, 2.0, 0.2), (0, 0, 0.62), _rust('fc_frame', '#2a2622')))
    o.append(eisen.box('box', (8.4, 2.0, 2.0), (0, 0, 1.72), body, bevel=0.04))
    o.append(eisen.box('roof', (8.5, 2.1, 0.12), (0, 0, 2.78), _rust('fc_roof', '#46443e', 0.8), bevel=0.05))
    o.append(eisen.box('door', (1.6, 0.04, 1.7), (0.4, -1.02, 1.6), dark))
    o.append(eisen.box('slide', (1.6, 0.05, 1.8), (2.2, -1.06, 1.62), body))
    for x in range(-4, 5):
        o.append(eisen.box(f'rib{x}', (0.06, 2.04, 1.9), (x * 0.95, 0, 1.72), body))
    root = eisen.parent_all(o, 'freight')
    root.scale = (0.66, 0.66, 0.66)
    if v == 1:
        root.rotation_euler = (0.35, 0, 0.04)
    return root


def tank_car(v=0):
    """Kesselwagen 6×2: liegender Kessel mit Domdeckel und Laufsteg, Rostfahnen."""
    tank = _rust(f'tc_tank{v}', ('#2a2a2c', '#5a5a52')[v % 2])
    o = []
    _bogies(o, 8.4)
    o.append(eisen.box('frame', (8.6, 1.8, 0.2), (0, 0, 0.62), _rust('tc_frame', '#2a2622')))
    t = eisen.cylinder('tank', 1.0, 7.8, (0, 0, 1.75), tank, segments=24, rot=(0, math.pi / 2, 0))
    o.append(t)
    for s in (-1, 1):
        o.append(sphere(f'cap{s}', 1.0, (s * 3.9, 0, 1.75), tank, 16, (0.25, 1.0, 1.0)))
    o.append(eisen.cylinder('dome', 0.4, 0.4, (0, 0, 2.85), tank, segments=16))
    o.append(eisen.box('walk', (7.6, 0.3, 0.04), (0, 0.9, 1.3), _rust('tc_walk', '#3a3632')))
    root = eisen.parent_all(o, 'tank')
    root.scale = (0.66, 0.66, 0.66)
    return root


def locomotive():
    """Diesellok 7×2: Vorbau mit Motorhaube, Führerstand, Gitter, Warnstreifen, verblichenes Rot."""
    body = _rust('lk_body', '#8a3a2a', 0.6)
    hood = _rust('lk_hood', '#7a3426', 0.6)
    dark = eisen.material('lk_glass', (0.02, 0.025, 0.03), rough=0.2)
    yel = _rust('lk_warn', '#c8a030', 0.5)
    o = []
    _bogies(o, 9.6, 0.32)
    o.append(eisen.box('frame', (10.0, 2.1, 0.3), (0, 0, 0.68), _rust('lk_frame', '#2a2622')))
    o.append(eisen.box('hoodL', (5.0, 1.5, 1.6), (-2.2, 0, 1.6), hood, bevel=0.08))
    o.append(eisen.box('cab', (2.2, 2.1, 2.4), (1.5, 0, 2.0), body, bevel=0.06))
    o.append(eisen.box('hoodS', (1.8, 1.5, 1.4), (3.6, 0, 1.5), hood, bevel=0.08))
    for s in (-1, 1):
        o.append(eisen.box(f'win{s}', (1.6, 0.04, 0.6), (1.5, s * 1.06, 2.6), dark))
    o.append(eisen.box('front', (0.04, 1.6, 0.6), (2.62, 0, 2.6), dark))
    for x in (-4.9, 4.9):
        o.append(eisen.box(f'warn{x}', (0.1, 2.1, 0.3), (x, 0, 0.9), yel))
    for k in range(6):
        o.append(eisen.box(f'grill{k}', (0.5, 1.2, 0.04), (-4.2 + k * 0.85, 0, 2.42), _rust('lk_grill', '#2a2622')))
    root = eisen.parent_all(o, 'loco')
    root.scale = (0.66, 0.66, 0.66)
    return root


def platform_roof():
    """Bahnsteigdach 6×2: Stahlstützen, Wellblechdach mit Löchern."""
    steel = _rust('pf_steel', '#4a4e4a', 0.6)
    sheet = _rust('pf_sheet', '#56564e', 0.8)
    o = []
    for x in (-2.4, 0, 2.4):
        o.append(eisen.cylinder(f'post{x}', 0.07, 2.6, (x, 0, 1.3), steel, segments=8))
    o.append(eisen.box('roof', (6.0, 2.0, 0.06), (0, 0, 2.65), sheet, rot=(0.08, 0, 0)))
    return eisen.parent_all(o, 'roof')
