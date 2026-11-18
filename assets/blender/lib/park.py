"""Park (eigener Entwurf): trockener Brunnen 3×3 mit Moos und Laub, Rutsche, Sandkasten, Klettergerüst, Steg (2×1)."""
import math
import random

import bauten
import eisen
import gw_ground
from zombie import sphere

lin = gw_ground.lin
W = bauten.weathered


def _stone(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.85, rust=0.0, dust=0.5, edge=0.4, grime=0.9, streaks=0.8)


def _paint(name, hex_):
    return W(name, hex_, metal=0.4, rough=0.6, rust=0.6, dust=0.5, edge=0.7, grime=0.6, streaks=0.5)


def fountain():
    rnd = random.Random(9500)
    st = _stone('pk_stone', '#8a847a')
    moss = gw_ground.pmat('pk_moss', lin('#4e5e30'), 0.95, 0.4, 0.8, 30)
    murk = eisen.material('pk_murk', eisen.srgb('#2a3428'), rough=0.2)
    leaf = gw_ground.pmat('pk_leaf', lin('#7a5a2a'), 0.9, 0.4, 0.6, 30)
    o = [eisen.cylinder('basin', 1.35, 0.45, (0, 0, 0.22), st, segments=32)]
    o.append(eisen.cylinder('inner', 1.15, 0.04, (0, 0, 0.42), murk, segments=32))
    o.append(eisen.cylinder('pillar', 0.22, 1.2, (0, 0, 0.6), st, segments=16))
    o.append(eisen.cylinder('bowl', 0.55, 0.15, (0, 0, 1.2), st, segments=24))
    o.append(sphere('top', 0.14, (0, 0, 1.35), st, 12))
    for k in range(10):
        a = rnd.uniform(0, math.tau)
        o.append(eisen.cylinder(f'm{k}', rnd.uniform(0.1, 0.25), 0.01, (math.cos(a) * 1.25, math.sin(a) * 1.25, 0.45), moss, segments=10))
    for k in range(20):
        o.append(eisen.box(f'l{k}', (0.05, 0.035, 0.004), (rnd.uniform(-0.9, 0.9), rnd.uniform(-0.9, 0.9), 0.45), leaf, rot=(0, 0, rnd.uniform(0, 3))))
    return eisen.parent_all(o, 'fountain')


def slide():
    frame = _paint('pk_frame', '#3a5a8a')
    chute = _paint('pk_chute', '#c8622a')
    o = []
    for x in (-0.55, -0.15):
        for y in (-0.25, 0.25):
            o.append(eisen.cylinder(f'p{x}{y}', 0.03, 1.4, (x, y, 0.7), frame, segments=8))
    o.append(eisen.box('deck', (0.5, 0.6, 0.05), (-0.35, 0, 1.3), frame))
    o.append(eisen.box('chute', (1.4, 0.4, 0.04), (0.45, 0, 0.7), chute, rot=(0, 0.75, 0)))
    for k in range(5):
        o.append(eisen.box(f'step{k}', (0.06, 0.5, 0.03), (-0.75 - k * 0.04, 0, 0.25 + k * 0.25), frame))
    return eisen.parent_all(o, 'slide')


def sandbox():
    wood = W('pk_wood', '#7a6044', metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.3, grime=0.7, streaks=0.5)
    sand = gw_ground.pmat('pk_sand', lin('#b8a07a'), 1.0, 0.4, 0.6, 40)
    o = [eisen.box('sand', (1.7, 1.7, 0.1), (0, 0, 0.05), sand)]
    for s in (-1, 1):
        o.append(eisen.box(f'bx{s}', (1.9, 0.12, 0.25), (0, s * 0.9, 0.12), wood))
        o.append(eisen.box(f'by{s}', (0.12, 1.9, 0.25), (s * 0.9, 0, 0.12), wood))
    o.append(eisen.cylinder('bucket', 0.08, 0.12, (0.3, -0.2, 0.15), _paint('pk_bucket', '#c8a030'), segments=10, rot=(1.4, 0, 0.5)))
    return eisen.parent_all(o, 'sandbox')


def climber():
    bars = _paint('pk_bars', '#5a7a3a')
    o = []
    for x in (-0.8, 0, 0.8):
        for y in (-0.8, 0.8):
            o.append(eisen.cylinder(f'p{x}{y}', 0.03, 1.6, (x, y, 0.8), bars, segments=6))
    for z in (0.5, 1.0, 1.55):
        for y in (-0.8, 0.8):
            o.append(eisen.cylinder(f'h{z}{y}', 0.025, 1.6, (0, y, z), bars, segments=6, rot=(0, math.pi / 2, 0)))
        for x in (-0.8, 0, 0.8):
            o.append(eisen.cylinder(f'c{z}{x}', 0.02, 1.6, (x, 0, z), bars, segments=6, rot=(math.pi / 2, 0, 0)))
    return eisen.parent_all(o, 'climber')


def jetty():
    """Bootssteg 2×1: Bretter auf Pfählen, eine Planke fehlt."""
    rnd = random.Random(9600)
    wood = W('pk_jetty', '#6a5440', metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.3, grime=0.8, streaks=0.6)
    o = []
    for k in range(9):
        if k == 5:
            continue
        o.append(eisen.box(f'b{k}', (0.2, 0.9, 0.05), (-0.85 + k * 0.21, 0, 0.25), wood, rot=(0, 0, rnd.uniform(-0.04, 0.04))))
    for x in (-0.8, 0.8):
        for y in (-0.4, 0.4):
            o.append(eisen.cylinder(f'p{x}{y}', 0.06, 0.6, (x, y, 0.0), wood, segments=8))
    return eisen.parent_all(o, 'jetty')
