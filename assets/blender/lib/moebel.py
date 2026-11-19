"""Mehr Möbel (eigene Entwürfe): Kirchenbank, Altar, Sessel, Fernseher, Klavier, Badewanne, Waschmaschine, Bücherregal.
Ursprung = Mitte der Grundfläche; Vorderseite nach Süden (−Y)."""
import random

import bauten
import eisen
import ruinen
from zombie import sphere

W = bauten.weathered


def _m(name, hex_, rough=0.8, metal=0.0, rust=0.2):
    return W(name, hex_, metal=metal, rough=rough, rust=rust, dust=0.5, edge=0.5, grime=0.5, streaks=0.3)


def pew():
    wood = ruinen._wood('mb_pew', '#5a3e28')
    o = [eisen.box('seat', (1.9, 0.4, 0.06), (0, -0.05, 0.42), wood)]
    o.append(eisen.box('back', (1.9, 0.06, 0.55), (0, 0.18, 0.72), wood, rot=(0.12, 0, 0)))
    for x in (-0.92, 0.92):
        o.append(eisen.box(f'end{x}', (0.06, 0.5, 0.9), (x, 0, 0.45), wood, bevel=0.02))
    return eisen.parent_all(o, 'pew')


def altar():
    stone = _m('mb_altar', '#b8b0a0', rough=0.7)
    cloth = _m('mb_cloth', '#e0dccc', rough=0.95)
    gold = _m('mb_gold', '#a88a3a', rough=0.35, metal=0.8, rust=0.1)
    o = [eisen.box('block', (1.8, 0.7, 0.95), (0, 0, 0.47), stone, bevel=0.03)]
    o.append(eisen.box('cloth', (1.84, 0.74, 0.02), (0, 0, 0.96), cloth))
    o.append(eisen.box('drape', (1.84, 0.02, 0.4), (0, -0.37, 0.76), cloth))
    for x in (-0.6, 0.6):
        o.append(eisen.cylinder(f'cs{x}', 0.04, 0.3, (x, 0.1, 1.12), gold, segments=8))
    o.append(eisen.box('cross', (0.05, 0.05, 0.5), (0, 0.15, 1.22), gold))
    o.append(eisen.box('crossb', (0.25, 0.05, 0.05), (0, 0.15, 1.35), gold))
    return eisen.parent_all(o, 'altar')


def armchair(v=0):
    fab = _m(f'mb_arm{v}', ('#6a3a2a', '#3a4a5a', '#5a5a3a')[v % 3], rough=0.95)
    o = [eisen.box('seat', (0.75, 0.7, 0.35), (0, -0.05, 0.25), fab, bevel=0.08)]
    o.append(eisen.box('back', (0.75, 0.2, 0.55), (0, 0.27, 0.6), fab, bevel=0.08))
    for x in (-0.37, 0.37):
        o.append(eisen.box(f'arm{x}', (0.16, 0.7, 0.3), (x, 0, 0.5), fab, bevel=0.06))
    return eisen.parent_all(o, 'armchair')


def tv():
    wood = ruinen._wood('mb_tvst', '#4a3a2a')
    dark = eisen.material('mb_screen', (0.02, 0.022, 0.025), rough=0.1)
    case = _m('mb_tvcase', '#2a2a2c', rough=0.5)
    o = [eisen.box('stand', (0.9, 0.45, 0.45), (0, 0.1, 0.22), wood)]
    o.append(eisen.box('tv', (0.8, 0.12, 0.5), (0, 0.15, 0.72), case, bevel=0.02))
    o.append(eisen.box('scr', (0.72, 0.02, 0.42), (0, 0.08, 0.72), dark))
    crack = _m('mb_crack', '#8a9aa0', rough=0.2)
    o.append(eisen.box('crack', (0.3, 0.021, 0.015), (0.1, 0.07, 0.8), crack, rot=(0, 0.6, 0)))
    return eisen.parent_all(o, 'tv')


def piano():
    wood = ruinen._wood('mb_piano', '#2a1e18')
    white = _m('mb_keys', '#e8e4d8', rough=0.4)
    o = [eisen.box('body', (1.6, 0.6, 1.25), (0, 0.1, 0.62), wood, bevel=0.03)]
    o.append(eisen.box('keys', (1.4, 0.25, 0.05), (0, -0.28, 0.72), white))
    o.append(eisen.box('stool', (0.6, 0.35, 0.45), (0, -0.7, 0.22), wood))
    return eisen.parent_all(o, 'piano')


def bathtub():
    enamel = _m('mb_tub', '#e0dcd0', rough=0.3, rust=0.3)
    water = eisen.material('mb_water', eisen.srgb('#4a5048'), rough=0.1)
    o = [eisen.box('tub', (0.8, 1.7, 0.55), (0, 0, 0.28), enamel, bevel=0.1)]
    o.append(eisen.box('in', (0.62, 1.5, 0.02), (0, 0, 0.45), water))
    return eisen.parent_all(o, 'tub')


def washer():
    white = _m('mb_washer', '#d8d4c8', rough=0.5, rust=0.3)
    glass = eisen.material('mb_door', (0.05, 0.06, 0.07), rough=0.1)
    o = [eisen.box('body', (0.7, 0.65, 0.85), (0, 0, 0.42), white, bevel=0.03)]
    o.append(eisen.cylinder('door', 0.22, 0.03, (0, -0.33, 0.42), glass, segments=20, rot=(1.5708, 0, 0)))
    return eisen.parent_all(o, 'washer')


def bookshelf():
    rnd = random.Random(12100)
    wood = ruinen._wood('mb_books', '#5a4030')
    o = [eisen.box('frame', (0.95, 0.35, 1.8), (0, 0.25, 0.9), wood)]
    cols = ['#7a2a24', '#2a4a6a', '#5a6a3a', '#c8b890', '#3a3a3a', '#8a6a3a']
    for row in range(4):
        x = -0.42
        while x < 0.42:
            wdt = rnd.uniform(0.03, 0.08)
            hgt = rnd.uniform(0.22, 0.32)
            if rnd.random() < 0.85:
                o.append(eisen.box(f'b{row}{x:.2f}', (wdt, 0.25, hgt), (x + wdt / 2, 0.15, 0.12 + row * 0.42 + hgt / 2), _m(f'bk{len(o) % 6}', cols[len(o) % 6], rough=0.7)))
            x += wdt + 0.005
    for k in range(5):  # herausgefallene Bücher
        o.append(eisen.box(f'f{k}', (0.2, 0.15, 0.04), (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.45, -0.1), 0.02), _m(f'bk{k}', cols[k], rough=0.7), rot=(0, 0, rnd.uniform(0, 3))))
    return eisen.parent_all(o, 'books')


PIECES = {
    # Name: Breite, Höhe (Felder), Modellhöhe, Bau-Funktion
    'pew': (2, 1, 0.95, pew), 'altar': (2, 1, 1.5, altar), 'armchair': (1, 1, 0.9, lambda: armchair(0)),
    'tv': (1, 1, 1.0, tv), 'piano': (2, 1, 1.3, piano), 'bathtub': (1, 2, 0.6, bathtub), 'washer': (1, 1, 0.9, washer),
    'bookshelf': (1, 1, 1.85, bookshelf),
}
