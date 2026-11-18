"""Flurstücke (eigene Entwürfe): Hochsitz (Jägerstand), Vogelscheuche, Wegkreuz, Wegweiser, Feldsteinmauer.
Ursprung = Mitte der Grundfläche; x Ost, y Nord."""
import math
import random

import bauten
import eisen
import gw_ground
from zombie import sphere

lin = gw_ground.lin
W = bauten.weathered


def _wood(name, hex_='#6a5440'):
    return W(name, hex_, metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.3, grime=0.8, streaks=0.6)


def hunting_stand():
    """Hochsitz 2×2: vier schräge Stämme, Leiter, Kanzel mit Dach."""
    wood = _wood('hs_wood')
    roof = _wood('hs_roof', '#4a3e32')
    o = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(bauten.beam(f'leg{sx}{sy}', (sx * 0.8, sy * 0.8, 0), (sx * 0.45, sy * 0.45, 2.6), (0.09, 0.09), wood))
    o.append(eisen.box('floor', (1.1, 1.1, 0.06), (0, 0, 2.6), wood))
    for s in (-1, 1):
        o.append(eisen.box(f'wx{s}', (1.1, 0.04, 0.6), (0, s * 0.55, 2.9), wood))
        o.append(eisen.box(f'wy{s}', (0.04, 1.1, 0.6), (s * 0.55, 0, 2.9) if s > 0 else (-0.55, 0, 2.9), wood))
    o.append(eisen.box('roof', (1.4, 1.4, 0.05), (0, 0, 3.55), roof, rot=(0.15, 0, 0)))
    for k in range(8):
        o.append(eisen.box(f'rung{k}', (0.5, 0.04, 0.04), (0, -0.95 + k * 0.03, 0.3 + k * 0.3), wood))
    o.append(bauten.beam('railL', (-0.25, -1.0, 0), (-0.25, -0.75, 2.6), (0.05, 0.05), wood))
    o.append(bauten.beam('railR', (0.25, -1.0, 0), (0.25, -0.75, 2.6), (0.05, 0.05), wood))
    return eisen.parent_all(o, 'stand')


def scarecrow(v=0):
    """Vogelscheuche 1×1: Pfahl mit Querlatte, Mantel, Hut, Strohbüschel."""
    rnd = random.Random(10100 + v)
    wood = _wood('sc_wood')
    coat = W(f'sc_coat{v}', ('#5a4a3a', '#4a5a6a', '#6a3a2a')[v % 3], metal=0.0, rough=0.95, rust=0.1, dust=0.6, edge=0.1, grime=0.7, streaks=0.5)
    straw = gw_ground.pmat('sc_straw', lin('#c8a860'), 0.9, 0.3, 0.4, 30)
    hat = W('sc_hat', '#3a3028', metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.1, grime=0.5, streaks=0.3)
    o = [eisen.cylinder('pole', 0.04, 1.9, (0, 0, 0.95), wood, segments=6)]
    o.append(eisen.box('arm', (1.2, 0.05, 0.05), (0, 0, 1.45), wood))
    o.append(eisen.box('coat', (0.5, 0.25, 0.7), (0, 0, 1.15), coat, bevel=0.06))
    for s in (-1, 1):
        o.append(eisen.box(f'sl{s}', (0.45, 0.14, 0.14), (s * 0.38, 0, 1.42), coat, rot=(0, s * rnd.uniform(0.05, 0.2), 0)))
        o.append(sphere(f'st{s}', 0.07, (s * 0.62, 0, 1.4), straw, 8, (1.4, 1, 1)))
    o.append(sphere('head', 0.14, (0, 0, 1.7), straw, 10))
    o.append(eisen.cylinder('brim', 0.24, 0.02, (0, 0, 1.82), hat, segments=14))
    o.append(eisen.cylinder('crown', 0.12, 0.14, (0, 0, 1.89), hat, segments=12))
    root = eisen.parent_all(o, 'scarecrow')
    root.rotation_euler = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(-0.4, 0.4))
    return root


def wayside_cross():
    """Wegkreuz 1×1: Holzkreuz auf Steinsockel, kleines Dach, Blumen am Fuß."""
    import gw_plants
    stone = W('wc_stone', '#8a847a', metal=0.0, rough=0.85, rust=0.0, dust=0.4, edge=0.4, grime=0.9, streaks=0.8)
    wood = _wood('wc_wood', '#5a4434')
    o = [eisen.box('base', (0.5, 0.5, 0.4), (0, 0, 0.2), stone, bevel=0.03)]
    o.append(eisen.box('post', (0.1, 0.1, 1.8), (0, 0, 1.3), wood))
    o.append(eisen.box('arm', (0.7, 0.08, 0.08), (0, 0, 1.75), wood))
    o.append(eisen.box('roofL', (0.3, 0.2, 0.03), (-0.12, 0, 2.25), wood, rot=(0, 0.6, 0)))
    o.append(eisen.box('roofR', (0.3, 0.2, 0.03), (0.12, 0, 2.25), wood, rot=(0, -0.6, 0)))
    for k in range(3):
        fl = gw_plants.flower_obj(('#c84040', '#e8d860', '#e8e0e8')[k], 0.05, 'saucer')
        inst = eisen.link(__import__('bpy').data.objects.new('fl', fl.data))
        inst.location = (-0.15 + k * 0.15, -0.3, 0.05)
    return eisen.parent_all(o, 'cross')


def signpost(v=0):
    """Wegweiser 1×1: Pfosten mit zwei bis drei Richtungsschildern (Schrift ausgeblichen), ein Schild hängt schief."""
    rnd = random.Random(10200 + v)
    wood = _wood('sp_wood', '#5a4a3a')
    board = W('sp_board', '#d8d0b8', metal=0.0, rough=0.8, rust=0.2, dust=0.6, edge=0.6, grime=0.7, streaks=0.8, rust_hex='#6a5a40')
    o = [eisen.cylinder('post', 0.05, 2.0, (0, 0, 1.0), wood, segments=8)]
    for k in range(2 + v % 2):
        a = rnd.uniform(0, math.tau)
        tilt = 0.4 if k == 1 else rnd.uniform(-0.05, 0.05)
        o.append(eisen.box(f'b{k}', (0.7, 0.03, 0.14), (math.cos(a) * 0.35, math.sin(a) * 0.35, 1.8 - k * 0.22), board, rot=(0, tilt, a)))
    return eisen.parent_all(o, 'sign')


def stone_wall(v=0):
    """Feldsteinmauer 1×1 (Ost–West): lose geschichtete Steine, Moos, Lücke bei v=2."""
    rnd = random.Random(10300 + v)
    tones = [W(f'sw_s{i}', c, metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.4, grime=0.8, streaks=0.4) for i, c in enumerate(('#8a847a', '#7a7468', '#958e82', '#6e6a62'))]
    moss = gw_ground.pmat('sw_moss', lin('#4e5e30'), 0.95, 0.4, 0.8, 30)
    o = []
    rows = 3 if v != 2 else 1
    for r in range(rows):
        x = -0.5
        while x < 0.5:
            s = rnd.uniform(0.14, 0.24)
            o.append(eisen.rock(f'r{r}{len(o)}', s / 2, (x + s / 2, rnd.uniform(-0.06, 0.06), 0.1 + r * 0.17), rnd.choice(tones), 10400 + v * 100 + len(o), squash=0.75, detail=1))
            x += s * 0.9
    for k in range(3):
        o.append(sphere(f'm{k}', rnd.uniform(0.05, 0.09), (rnd.uniform(-0.4, 0.4), 0, 0.1 + rows * 0.16), moss, 8, (1.4, 1.0, 0.35)))
    return eisen.parent_all(o, 'wall')
