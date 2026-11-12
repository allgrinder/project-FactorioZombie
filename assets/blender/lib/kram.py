"""Gegenstände von „Letzte Schicht“ als Symbole (eigene Entwürfe): Verpflegung, Verbandszeug, Nahkampfwaffen,
Stoff, Funkteile, Lockvogel. Jedes Modell passt in etwa 0,9 × 0,9 × 0,9 Felder um den Ursprung (Boden z = 0)."""
import math
import random

import bauten
import eisen
import gw_ground
import kit

lin = gw_ground.lin
W = bauten.weathered


def _flat(name, hex_, rough=0.7, metal=0.0):
    return W(name, hex_, metal=metal, rough=rough, rust=0.15, dust=0.15, edge=0.4, grime=0.3, streaks=0.2)


def _wood(name, hex_='#7a5f3c'):
    return gw_ground.pmat(name, lin(hex_), 0.85, 0.4, 0.5, 30)


def can(label='#8a3a2a'):
    tin = _flat('k_tin', '#9a9a94', 0.35, 0.85)
    lab = _flat('k_lab', label, 0.7)
    o = [eisen.cylinder('can', 0.26, 0.6, (0, 0, 0.3), tin, segments=20)]
    o.append(eisen.cylinder('label', 0.265, 0.36, (0, 0, 0.3), lab, segments=20))
    for z in (0.02, 0.58):
        o.append(eisen.cylinder(f'rim{z}', 0.275, 0.03, (0, 0, z), tin, segments=20))
    o.append(eisen.box('pic', (0.2, 0.02, 0.16), (0, -0.262, 0.3), _flat('k_pic', '#d8c8a0')))
    return eisen.parent_all(o, 'can')


def snack():
    bag = _flat('k_bag', '#b8862a', 0.45)
    stripe = _flat('k_bagr', '#8a2a22', 0.5)
    o = [eisen.box('bag', (0.52, 0.16, 0.66), (0, 0, 0.36), bag, bevel=0.07, rot=(0.1, 0, 0.1))]
    o.append(eisen.box('stripe', (0.53, 0.165, 0.16), (0, 0, 0.4), stripe, rot=(0.1, 0, 0.1)))
    o.append(eisen.box('seal', (0.5, 0.03, 0.06), (0, -0.07, 0.7), bag, rot=(0.1, 0, 0.1)))
    return eisen.parent_all(o, 'snack')


def vegetables():
    rnd = random.Random(5)
    o = []
    carrot = _flat('k_carrot', '#c8702a', 0.6)
    leaf = _flat('k_leaf', '#4a7a30', 0.8)
    cab = _flat('k_cab', '#7a9a48', 0.7)
    tom = _flat('k_tom', '#a8322a', 0.4)
    o.append(eisen.rock('cabbage', 0.26, (-0.12, 0.08, 0.24), cab, 3, squash=0.9, detail=2))
    for k in range(2):
        c = bauten.beam(f'car{k}', (0.05 + k * 0.1, -0.3, 0.07), (0.35 + k * 0.06, 0.12, 0.09), (0.09, 0.09), carrot)
        o.append(c)
        o.append(eisen.rock(f'cl{k}', 0.09, (0.38 + k * 0.06, 0.2, 0.1), leaf, 9 + k, squash=0.6, detail=1))
    o.append(eisen.rock('tomato', 0.13, (-0.2, -0.28, 0.12), tom, 14, squash=0.9, detail=2))
    return eisen.parent_all(o, 'vegetables')


def stew():
    pot = _flat('k_pot', '#3a3a38', 0.5, 0.7)
    soup = _flat('k_soup', '#9a5a2a', 0.4)
    o = [eisen.cylinder('pot', 0.32, 0.34, (0, 0, 0.17), pot, segments=20, bevel=0.02)]
    o.append(eisen.cylinder('soup', 0.29, 0.02, (0, 0, 0.33), soup, segments=20))
    for s in (-1, 1):
        o.append(eisen.box(f'h{s}', (0.12, 0.06, 0.04), (s * 0.36, 0, 0.3), pot, bevel=0.01))
    bits = [_flat('k_b1', '#c8702a'), _flat('k_b2', '#6a8a3a'), _flat('k_b3', '#d8c890')]
    rnd = random.Random(8)
    for k in range(7):
        o.append(eisen.rock(f'bit{k}', 0.05, (rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18), 0.345), bits[k % 3], 20 + k, squash=0.5, detail=1))
    o.append(bauten.beam('spoon', (0.1, -0.1, 0.36), (0.42, -0.36, 0.62), (0.03, 0.03), _wood('k_spoon')))
    return eisen.parent_all(o, 'stew')


def bottle(full=True, soda=False):
    glass = eisen.material('k_glass' + str(full) + str(soda), eisen.srgb('#3f6a7a' if full and not soda else '#7a2a22' if soda else '#8fa6a0'),
                           rough=0.12, metal=0.25)
    cap = _flat('k_cap', '#c9c2a0' if not soda else '#d8d0c0', 0.4, 0.6)
    o = [eisen.cylinder('body', 0.17, 0.5, (0, 0, 0.25), glass, segments=18, bevel=0.03)]
    o.append(eisen.cylinder('neck', 0.07, 0.2, (0, 0, 0.6), glass, segments=12))
    o.append(eisen.cylinder('cap', 0.085, 0.06, (0, 0, 0.72), cap, segments=12))
    if soda:
        o.append(eisen.cylinder('label', 0.175, 0.2, (0, 0, 0.27), _flat('k_slab', '#e0d8c0'), segments=18))
    elif full:
        o.append(eisen.cylinder('label', 0.175, 0.14, (0, 0, 0.3), _flat('k_wlab', '#d8e0e0'), segments=18))
    return eisen.parent_all(o, 'bottle')


def coffee():
    tin = _flat('k_ctin', '#5a3a26', 0.5, 0.4)
    lid = _flat('k_clid', '#c9b98a', 0.4, 0.5)
    o = [eisen.box('tin', (0.4, 0.3, 0.52), (0, 0, 0.26), tin, bevel=0.03)]
    o.append(eisen.box('lid', (0.42, 0.32, 0.05), (0, 0, 0.545), lid, bevel=0.015))
    o.append(eisen.box('lab', (0.3, 0.01, 0.24), (0, -0.152, 0.28), lid))
    mug = _flat('k_mug', '#8a8a84', 0.5, 0.5)
    o.append(eisen.cylinder('mug', 0.11, 0.2, (0.36, -0.12, 0.1), mug, segments=14))
    o.append(eisen.cylinder('cof', 0.095, 0.01, (0.36, -0.12, 0.2), _flat('k_cof', '#2a1a10', 0.3), segments=14))
    return eisen.parent_all(o, 'coffee')


def cloth():
    rnd = random.Random(3)
    o = []
    cols = [_flat('k_cl1', '#6a7a8a', 0.95), _flat('k_cl2', '#8a6a5a', 0.95), _flat('k_cl3', '#a8a08a', 0.95)]
    for k in range(3):
        o.append(eisen.box(f'fold{k}', (0.66 - k * 0.06, 0.5 - k * 0.04, 0.1), (rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0.06 + k * 0.105), cols[k], bevel=0.04,
                           rot=(0, 0, rnd.uniform(-0.2, 0.2))))
    return eisen.parent_all(o, 'cloth')


def bandage():
    gauze = _flat('k_gauze', '#d8d4c4', 0.95)
    o = [eisen.cylinder('roll', 0.2, 0.3, (0, 0, 0.2), gauze, segments=18, rot=(math.pi / 2, 0, 0.4))]
    o.append(eisen.cylinder('core', 0.06, 0.31, (0, 0, 0.2), _flat('k_core', '#9a8a70'), segments=10, rot=(math.pi / 2, 0, 0.4)))
    o.append(eisen.box('tail', (0.5, 0.26, 0.015), (0.3, 0.1, 0.012), gauze, rot=(0, 0, 0.4)))
    return eisen.parent_all(o, 'bandage')


def first_aid():
    case = _flat('k_case', '#a8322a', 0.5)
    white = _flat('k_white', '#e0dccc', 0.6)
    o = [eisen.box('case', (0.72, 0.5, 0.3), (0, 0, 0.15), case, bevel=0.05)]
    o.append(eisen.box('c1', (0.3, 0.09, 0.01), (0, 0, 0.303), white))
    o.append(eisen.box('c2', (0.09, 0.3, 0.01), (0, 0, 0.303), white))
    o.append(eisen.box('handle', (0.24, 0.05, 0.05), (0, -0.27, 0.2), _flat('k_hand', '#2a2a28')))
    return eisen.parent_all(o, 'firstaid')


def antibiotics():
    jar = eisen.material('k_jar', eisen.srgb('#b8742a'), rough=0.15, metal=0.1)
    white = _flat('k_awhite', '#e0dccc', 0.6)
    o = [eisen.cylinder('jar', 0.2, 0.44, (0, 0, 0.22), jar, segments=18, bevel=0.02)]
    o.append(eisen.cylinder('cap', 0.21, 0.1, (0, 0, 0.49), white, segments=18))
    o.append(eisen.cylinder('lab', 0.205, 0.2, (0, 0, 0.22), white, segments=18))
    pill = _flat('k_pill', '#d8d8d0', 0.3)
    red = _flat('k_pillr', '#b8402a', 0.3)
    for k, (x, y) in enumerate(((0.36, -0.2), (0.42, 0.02), (0.3, -0.4))):
        o.append(eisen.cylinder(f'p{k}', 0.035, 0.12, (x, y, 0.035), pill if k % 2 else red, segments=8, rot=(math.pi / 2, 0, k * 0.9)))
    return eisen.parent_all(o, 'antibiotics')


def axe():
    wood = _wood('k_axew')
    steel = W('k_axes', '#6a6a66', metal=0.9, rough=0.35, rust=0.35, dust=0.15, edge=0.6)
    o = [bauten.beam('shaft', (-0.38, 0, 0.08), (0.36, 0, 0.08), (0.06, 0.07), wood)]
    o.append(eisen.box('head', (0.14, 0.3, 0.07), (0.3, -0.08, 0.08), steel, bevel=0.015))
    o.append(eisen.box('edge', (0.12, 0.12, 0.05), (0.3, -0.26, 0.08), steel, bevel=0.02, rot=(0, 0, 0.0)))
    root = eisen.parent_all(o, 'axe')
    root.rotation_euler = (0, 0, 0.7)
    return root


def crowbar():
    steel = W('k_cbs', '#34495a', metal=0.8, rough=0.45, rust=0.4, dust=0.15, edge=0.7)
    o = [bauten.beam('bar', (-0.4, 0, 0.05), (0.32, 0, 0.05), (0.055, 0.055), steel)]
    o.append(bauten.beam('hook', (0.32, 0, 0.05), (0.42, -0.14, 0.05), (0.055, 0.055), steel))
    o.append(bauten.beam('claw', (0.42, -0.14, 0.05), (0.36, -0.22, 0.05), (0.07, 0.03), steel))
    o.append(bauten.beam('tip', (-0.4, 0, 0.05), (-0.47, 0.05, 0.05), (0.07, 0.03), steel))
    root = eisen.parent_all(o, 'crowbar')
    root.rotation_euler = (0, 0, 0.7)
    return root


def bat():
    wood = _wood('k_batw', '#9a7a4a')
    tape = _flat('k_tape', '#2a2a28', 0.9)
    o = [bauten.beam('grip', (-0.42, 0, 0.06), (-0.1, 0, 0.06), (0.05, 0.05), wood)]
    o.append(bauten.beam('barrel', (-0.1, 0, 0.06), (0.42, 0, 0.07), (0.1, 0.1), wood))
    o.append(bauten.beam('tape', (-0.42, 0, 0.06), (-0.26, 0, 0.06), (0.056, 0.056), tape))
    nail = W('k_nail', '#7a7a76', metal=0.9, rough=0.4, rust=0.4, dust=0.1, edge=0.3)
    for k in range(4):
        o.append(eisen.cylinder(f'nail{k}', 0.012, 0.16, (0.18 + k * 0.07, 0, 0.07), nail, segments=6, rot=(1.2 * (1 if k % 2 else -1), 0, 0)))
    root = eisen.parent_all(o, 'bat')
    root.rotation_euler = (0, 0, 0.7)
    return root


def spear():
    wood = _wood('k_spw', '#6a5236')
    steel = W('k_sps', '#7a7a76', metal=0.9, rough=0.35, rust=0.3, dust=0.1, edge=0.6)
    o = [bauten.beam('shaft', (-0.46, 0, 0.05), (0.3, 0, 0.05), (0.04, 0.04), wood)]
    o.append(bauten.beam('blade', (0.28, 0, 0.05), (0.47, 0, 0.05), (0.09, 0.02), steel))
    o.append(bauten.beam('wrap', (0.2, 0, 0.05), (0.3, 0, 0.05), (0.055, 0.055), _flat('k_wrap', '#8a7a5a', 0.95)))
    root = eisen.parent_all(o, 'spear')
    root.rotation_euler = (0, 0, 0.7)
    return root


def knife():
    steel = W('k_kns', '#9a9a96', metal=0.95, rough=0.25, rust=0.15, dust=0.05, edge=0.5)
    grip = _flat('k_kng', '#3a2a1c', 0.8)
    o = [bauten.beam('blade', (-0.02, 0, 0.04), (0.42, 0, 0.04), (0.1, 0.015), steel)]
    o.append(bauten.beam('grip', (-0.36, 0, 0.04), (-0.02, 0, 0.04), (0.07, 0.04), grip))
    o.append(eisen.box('guard', (0.03, 0.16, 0.04), (-0.02, 0, 0.04), steel))
    root = eisen.parent_all(o, 'knife')
    root.rotation_euler = (0, 0, 0.7)
    return root


def radio_parts():
    t = kit.Tier(2, prefix='rp2')
    board = _flat('k_board', '#2f5a3a', 0.5)
    o = [eisen.box('board', (0.7, 0.5, 0.03), (0, 0, 0.03), board, bevel=0.005)]
    rnd = random.Random(12)
    for k in range(6):
        o.append(eisen.box(f'chip{k}', (rnd.uniform(0.08, 0.16), rnd.uniform(0.06, 0.12), 0.05), (rnd.uniform(-0.26, 0.26), rnd.uniform(-0.17, 0.17), 0.07), t.dark, bevel=0.005))
    for k in range(3):
        o.append(eisen.cylinder(f'cap{k}', 0.04, 0.12, (-0.25 + k * 0.12, 0.16, 0.1), t.metal, segments=10))
    o.append(eisen.cylinder('tube', 0.07, 0.26, (0.2, -0.05, 0.17), eisen.material('k_tube', eisen.srgb('#c9a24a'), rough=0.1, metal=0.4), segments=12))
    kit.cable(o, 'wire', [(-0.35, -0.2, 0.05), (-0.5, -0.3, 0.12), (-0.42, -0.42, 0.03)], 0.015, _flat('k_wr', '#a8322a'))
    return eisen.parent_all(o, 'radioparts')


def noise_lure():
    """Lockvogel: Wecker mit Glocken, an eine Blechdose gebunden."""
    t = kit.Tier(1, prefix='nl')
    brass = W('k_brass', '#b8962e', metal=0.9, rough=0.3, rust=0.15, dust=0.1, edge=0.5)
    face = _flat('k_face', '#e0d8c0', 0.5)
    o = [eisen.cylinder('body', 0.24, 0.16, (0, 0, 0.3), t.panels[1], segments=20, rot=(math.pi / 2, 0, 0))]
    o.append(eisen.cylinder('face', 0.2, 0.02, (0, -0.085, 0.3), face, segments=20, rot=(math.pi / 2, 0, 0)))
    o.append(eisen.box('hand1', (0.02, 0.01, 0.14), (0, -0.1, 0.35), t.dark))
    o.append(eisen.box('hand2', (0.1, 0.01, 0.02), (0.04, -0.1, 0.3), t.dark))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'bell{s}', 0.1, 0.07, (s * 0.15, 0, 0.56), brass, segments=14, rot=(0, s * 0.5, 0)))
        o.append(eisen.box(f'foot{s}', (0.04, 0.04, 0.1), (s * 0.15, 0, 0.05), t.dark, rot=(0, s * -0.3, 0)))
    o.append(eisen.box('hammer', (0.03, 0.03, 0.12), (0, 0, 0.6), t.dark))
    return eisen.parent_all(o, 'lure')
