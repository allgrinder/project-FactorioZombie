"""Ufer (eigener Entwurf): Ruderboot 2×1 am Seeufer – aufrecht mit Rudern und Wasser im Rumpf (v0, v2) oder kieloben
(v1). Ursprung = Mitte der Grundfläche; Bug nach Osten."""
import math
import random

import bauten
import eisen
from zombie import sphere

W = bauten.weathered


def rowboat(v=0):
    rnd = random.Random(6100 + v)
    hull = W(f'uf_hull{v}', ('#5a6a7a', '#7a5a3a', '#4a6a4a')[v % 3], metal=0.0, rough=0.8, rust=0.3, dust=0.4, edge=0.6,
             grime=0.8, streaks=0.7, rust_hex='#3a2a1a')
    wood = W('uf_wood', '#7a6044', metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.3, grime=0.6, streaks=0.5)
    o = []
    flip = v == 1
    shell = sphere('hull', 0.5, (0, 0, 0.18), hull, 20, (1.9, 0.8, 0.45))
    if flip:
        o.append(shell)
        o.append(eisen.box('keel', (1.6, 0.06, 0.06), (0, 0, 0.4), wood))
    else:
        shell.scale.z = 0.7
        o.append(shell)
        inner = eisen.material('uf_inner' + str(v), eisen.srgb('#2a3a3e' if v == 2 else '#4a3a2a'), rough=0.3 if v == 2 else 0.9)
        o.append(sphere('inner', 0.5, (0, 0, 0.27), inner, 18, (1.7, 0.66, 0.12)))
        for x in (-0.35, 0.3):
            o.append(eisen.box(f'seat{x}', (0.16, 0.72, 0.04), (x, 0, 0.3), wood))
        for s in (-1, 1):
            o.append(eisen.box(f'oar{s}', (1.3, 0.05, 0.03), (rnd.uniform(-0.2, 0.2), s * 0.5, 0.32), wood, rot=(0, 0, s * rnd.uniform(0.1, 0.4))))
    root = eisen.parent_all(o, 'boat')
    root.rotation_euler = (0, 0, rnd.uniform(-0.15, 0.15))
    return root


def dome_tent(v=0):
    """Kuppelzelt 2×2 eines verlassenen Zeltplatzes: Stoffkuppel mit Überzelt, Eingang offen, eingesunken (v=1)."""
    cloth = W(f'uf_tent{v}', ('#4a6a8a', '#8a6a3a', '#6a7a4a')[v % 3], metal=0.0, rough=0.9, rust=0.1, dust=0.5, edge=0.2,
              grime=0.6, streaks=0.5, rust_hex='#3a2a1a')
    dark = eisen.material('uf_tentin', (0.03, 0.03, 0.03), rough=0.9)
    o = [sphere('dome', 0.5, (0, 0, 0.0), cloth, 20, (1.7, 1.5, 1.1 if v != 1 else 0.6))]
    o.append(sphere('door', 0.5, (0, -0.62, 0.18), dark, 12, (0.6, 0.3, 0.55 if v != 1 else 0.3)))
    pole = eisen.material('uf_pole', (0.2, 0.2, 0.22), rough=0.4)
    for a in (0.6, -0.6):
        o.append(eisen.cylinder(f'p{a}', 0.012, 2.2, (0, 0, 0.5), pole, segments=5, rot=(0, math.pi / 2, a)))
    return eisen.parent_all(o, 'tent')


def fire_ring():
    """Erkaltete Feuerstelle 1×1: Steinkreis, Asche, angekohlte Scheite."""
    rnd = random.Random(6200)
    stone = W('uf_stone', '#7a746a', metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.4, grime=0.8, streaks=0.3)
    ash = eisen.material('uf_ash', eisen.srgb('#3a3632'), rough=0.95)
    char = eisen.material('uf_char', eisen.srgb('#1e1a16'), rough=0.9)
    o = [eisen.cylinder('ash', 0.3, 0.02, (0, 0, 0.01), ash, segments=16)]
    for k in range(9):
        a = k / 9 * math.tau
        o.append(eisen.rock(f's{k}', rnd.uniform(0.07, 0.1), (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.05), stone, 60 + k, squash=0.7, detail=1))
    for k in range(3):
        o.append(eisen.cylinder(f'log{k}', 0.035, 0.4, (0, 0, 0.05), char, segments=6, rot=(math.pi / 2, 0, k * 1.1)))
    return eisen.parent_all(o, 'ring')
