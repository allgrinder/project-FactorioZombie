"""Ausrüstung (eigene Entwürfe, nur Symbole): Angel, Fisch (roh/gebraten), Wintermantel."""
import math

import bauten
import eisen
from zombie import sphere

W = bauten.weathered


def _m(name, hex_, rough=0.7, metal=0.0):
    return W(name, hex_, metal=metal, rough=rough, rust=0.1, dust=0.3, edge=0.3, grime=0.3, streaks=0.2)


def rod():
    wood = _m('ar_rod', '#6a5034', 0.6)
    reel = _m('ar_reel', '#5a5a5e', 0.4, 0.7)
    line = eisen.material('ar_line', (0.85, 0.85, 0.8), rough=0.4)
    o = [eisen.cylinder('pole', 0.02, 1.5, (0, 0, 0.1), wood, segments=8, rot=(0, math.pi / 2 - 0.25, 0.6))]
    o.append(eisen.cylinder('reel', 0.08, 0.05, (-0.38, -0.25, 0.0), reel, segments=14, rot=(math.pi / 2, 0, 0.6)))
    o.append(eisen.cylinder('line', 0.004, 0.6, (0.45, 0.32, 0.05), line, segments=4, rot=(0.3, 0.2, 0)))
    return eisen.parent_all(o, 'rod')


def fish(cooked=False):
    body = _m('ar_fish' + str(cooked), '#6a4a2a' if cooked else '#7a8a8a', 0.35 if not cooked else 0.6)
    belly = _m('ar_belly' + str(cooked), '#a8783a' if cooked else '#d8d8cc', 0.4)
    o = [sphere('body', 0.5, (0, 0, 0.12), body, 18, (0.9, 0.3, 0.22))]
    o.append(sphere('belly', 0.5, (0, 0, 0.09), belly, 14, (0.8, 0.26, 0.12)))
    tail = eisen.box('tail', (0.22, 0.02, 0.22), (0.5, 0, 0.12), body, rot=(0, 0.785, 0))
    o.append(tail)
    if cooked:
        stick = _m('ar_stick', '#6a5032', 0.8)
        o.append(eisen.cylinder('spit', 0.015, 1.0, (0, 0, 0.12), stick, segments=6, rot=(0, math.pi / 2, 0)))
        for k in range(4):
            o.append(eisen.box(f'g{k}', (0.03, 0.31, 0.02), (-0.25 + k * 0.15, 0, 0.23), _m('ar_grill', '#2a1e14', 0.9)))
    else:
        o.append(sphere('eye', 0.03, (-0.33, -0.1, 0.16), eisen.material('ar_eye', (0.02, 0.02, 0.02), rough=0.1), 8))
    root = eisen.parent_all(o, 'fish')
    root.rotation_euler = (0, 0, 0.5)
    return root


def coat():
    wool = _m('ar_coat', '#5a4a3a', 0.95)
    fur = _m('ar_fur', '#c8b898', 0.95)
    o = [eisen.box('body', (0.6, 0.18, 0.75), (0, 0, 0.1), wool, bevel=0.06)]
    for s in (-1, 1):
        o.append(eisen.box(f'sl{s}', (0.18, 0.16, 0.55), (s * 0.4, 0, 0.12), wool, bevel=0.05, rot=(0, s * 0.35, 0)))
    o.append(eisen.box('collar', (0.5, 0.2, 0.12), (0, 0, 0.5), fur, bevel=0.05))
    for k in range(3):
        o.append(sphere(f'b{k}', 0.025, (0, -0.1, 0.3 - k * 0.2), _m('ar_btn', '#2a2420', 0.4), 8))
    root = eisen.parent_all(o, 'coat')
    root.rotation_euler = (math.pi / 2 - 0.5, 0, 0)
    return root
