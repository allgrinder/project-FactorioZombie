"""Landmarken (eigene Entwürfe): Windrad (Turm und Rotor getrennt), Hochspannungsmast (Gittermast), Wohnwagen,
Sägewerkshalle, Baumstammstapel, Parkplatz-Markierung. Ursprung = Mitte der Grundfläche; x Ost, y Nord."""
import math
import random

import bauten
import eisen
import gw_ground
from zombie import sphere

lin = gw_ground.lin
W = bauten.weathered


def _paint(name, hex_, rust=0.4):
    return W(name, hex_, metal=0.5, rough=0.5, rust=rust, dust=0.4, edge=0.5, grime=0.6, streaks=0.7)


HUB = 9.0  # Nabenhöhe (Felder) des Windrads


def turbine_tower():
    """Windradturm: schlanker Kegelstumpf, Gondel oben, Fundament."""
    white = _paint('wt_white', '#d8d6d0', 0.2)
    conc = W('wt_conc', '#8a867e', metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.4, grime=0.7, streaks=0.5)
    bm_r0, bm_r1 = 0.55, 0.3
    o = [eisen.cylinder('found', 1.2, 0.3, (0, 0, 0.15), conc, segments=24)]
    t = eisen.cylinder('tower', bm_r0, HUB, (0, 0, HUB / 2), white, segments=20)
    for v in t.data.vertices:  # nach oben verjüngen
        k = v.co.z / HUB + 0.5
        f = (bm_r0 + (bm_r1 - bm_r0) * k) / bm_r0
        v.co.x *= f
        v.co.y *= f
    o.append(t)
    o.append(eisen.box('nacelle', (0.7, 1.8, 0.7), (0, 0.4, HUB + 0.1), white, bevel=0.15))
    o.append(sphere('hub', 0.32, (0, -0.6, HUB + 0.1), white, 12))
    return eisen.parent_all(o, 'tower')


def turbine_rotor(phase=0.0, broken=False):
    """Rotor (drei Blätter) vor der Nabe, gedreht um die y-Achse; broken: ein Blatt fehlt, eins geknickt."""
    white = _paint('wt_blade', '#e0deda', 0.15)
    o = []
    for k in range(3):
        if broken and k == 2:
            continue
        a = phase * (2 * math.pi / 3) + k * 2 * math.pi / 3
        L = 4.2 if not (broken and k == 1) else 2.2
        b = eisen.box(f'bl{k}', (0.32, 0.08, L), (math.sin(a) * L / 2, -0.75, HUB + 0.1 + math.cos(a) * L / 2), white, rot=(0, a, 0))
        o.append(b)
    return eisen.parent_all(o, 'rotor')


def pylon():
    """Hochspannungsmast (Gittermast, 2×2): vier Eckstiele, Querstreben, zwei Traversen mit Isolatoren."""
    steel = _paint('hv_steel', '#6a6e6a', 0.5)
    o = []
    H = 7.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = eisen.cylinder(f'leg{sx}{sy}', 0.05, H + 0.2, (sx * 0.45, sy * 0.45, H / 2), steel, segments=6)
            for v in leg.data.vertices:
                k = v.co.z / (H + 0.2) + 0.5
                v.co.x -= sx * 0.33 * k
                v.co.y -= sy * 0.33 * k
            o.append(leg)
    for z in (1.5, 3.0, 4.5, 6.0):
        w = 0.9 - 0.62 * z / H
        for s in (-1, 1):
            o.append(eisen.box(f'hx{z}{s}', (w * 1.1, 0.03, 0.03), (0, s * w / 2, z), steel))
            o.append(eisen.box(f'hy{z}{s}', (0.03, w * 1.1, 0.03), (s * w / 2, 0, z), steel))
            o.append(eisen.box(f'dx{z}{s}', (w * 1.4, 0.025, 0.025), (0, s * w / 2, z - 0.75), steel, rot=(0, 0.9, 0)))
    ins = eisen.material('hv_ins', eisen.srgb('#8a6a4a'), rough=0.4)
    for z, half in ((5.2, 2.2), (6.4, 1.6)):
        o.append(eisen.box(f'arm{z}', (half * 2, 0.12, 0.12), (0, 0, z), steel))
        for s in (-1, 1):
            o.append(eisen.cylinder(f'i{z}{s}', 0.05, 0.45, (s * (half - 0.15), 0, z - 0.25), ins, segments=8))
    o.append(eisen.box('top', (0.5, 0.12, 0.6), (0, 0, H + 0.2), steel))
    return eisen.parent_all(o, 'pylon')


def caravan(v=0):
    """Wohnwagen 3×2: weißer Kasten mit Farbstreifen, Fenster, Deichsel, Vorzelt-Reste."""
    rnd = random.Random(9900 + v)
    body = _paint(f'cv_body{v}', '#d8d4c8', 0.3)
    stripe = _paint(f'cv_str{v}', ('#4a6a8a', '#8a5a3a', '#6a7a4a')[v % 3], 0.3)
    dark = eisen.material('cv_win', (0.03, 0.035, 0.04), rough=0.15)
    tire = W('cv_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)
    o = [eisen.box('box', (2.6, 1.5, 1.4), (0, 0, 1.0), body, bevel=0.15)]
    o.append(eisen.box('stripe', (2.62, 1.52, 0.18), (0, 0, 0.75), stripe))
    for x in (-0.7, 0.6):
        o.append(eisen.box(f'w{x}', (0.6, 1.54, 0.35), (x, 0, 1.25), dark))
    o.append(eisen.box('door', (0.5, 0.04, 1.0), (0.1, -0.77, 0.85), stripe))
    o.append(eisen.box('bar', (0.9, 0.06, 0.06), (1.7, 0, 0.45), _paint('cv_bar', '#3a3a3a')))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'wh{s}', 0.25, 0.15, (-0.1, s * 0.72, 0.25), tire, segments=12, rot=(math.pi / 2, 0, 0)))
    if v == 1:  # Vorzelt, zerrissen
        canvas = W('cv_awn', '#6a7a5a', metal=0.0, rough=0.95, rust=0.1, dust=0.5, edge=0.1, grime=0.6, streaks=0.4)
        o.append(eisen.box('awn', (1.8, 1.0, 0.03), (0, -1.2, 1.5), canvas, rot=(0.25, 0, 0)))
    root = eisen.parent_all(o, 'caravan')
    root.scale = (0.85, 0.85, 0.85)
    root.rotation_euler = (0, 0, rnd.uniform(-0.05, 0.05))
    return root


def saw_hall():
    """Offene Sägewerkshalle 6×4: Stahlstützen, Pultdach, Gattersäge, Bretterstapel."""
    rnd = random.Random(9950)
    steel = _paint('sw_steel', '#5a5a52', 0.6)
    sheet = _paint('sw_sheet', '#4e4a42', 0.9)
    wood = W('sw_wood', '#a8885a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.3, grime=0.5, streaks=0.3)
    o = []
    for x in (-2.8, 0, 2.8):
        for y in (-1.8, 1.8):
            o.append(eisen.cylinder(f'p{x}{y}', 0.08, 2.6 + (0.4 if y > 0 else 0), (x, y, 1.3 + (0.2 if y > 0 else 0)), steel, segments=8))
    o.append(eisen.box('roof', (6.2, 4.2, 0.06), (0, 0, 2.85), sheet, rot=(-0.1, 0, 0)))
    o.append(eisen.box('saw', (1.0, 2.6, 1.2), (-1.2, 0, 0.6), _paint('sw_saw', '#7a3a2a', 0.7)))
    for k in range(4):
        o.append(eisen.box(f'plank{k}', (2.0, 0.9, 0.12), (1.5, -0.9 + rnd.uniform(-0.05, 0.05), 0.08 + k * 0.13), wood, rot=(0, 0, rnd.uniform(-0.05, 0.05))))
    return eisen.parent_all(o, 'saw')


def log_stack():
    """Baumstammstapel 3×2: geschälte Stämme in drei Lagen, Stirnseiten hell."""
    rnd = random.Random(9960)
    bark = W('ls_bark', '#5a4634', metal=0.0, rough=0.9, rust=0.0, dust=0.4, edge=0.3, grime=0.7, streaks=0.4)
    o = []
    for row, n in ((0, 5), (1, 4), (2, 3)):
        for k in range(n):
            r = rnd.uniform(0.2, 0.26)
            y = -0.9 + (k + row * 0.5) * 0.48 + 0.24
            o.append(eisen.cylinder(f'l{row}{k}', r, 2.7 + rnd.uniform(-0.2, 0.2), (rnd.uniform(-0.1, 0.1), y, r + row * 0.4), bark, segments=12, rot=(0, math.pi / 2, 0)))
    return eisen.parent_all(o, 'logs')


def parking(v=0):
    """Parkplatz-Markierung (von oben, 1×2 Felder): weiße Trennlinie mit Abrieb, Ölfleck."""
    rnd = random.Random(9970 + v)
    paint = gw_ground.pmat('pk_line', lin('#c8c4b4'), 0.8, 0.4, 0.5, 30)
    oil = eisen.material('pk_oil', (0.02, 0.02, 0.022), rough=0.2)
    o = []
    y = -1.0
    while y < 1.0:
        L = min(1.0 - y, rnd.uniform(0.2, 0.5))
        if rnd.random() < 0.85:
            o.append(eisen.box(f'l{len(o)}', (0.08, L - 0.02, 0.003), (-0.48, y + L / 2, 0.0015), paint))
        y += L
    if v % 2 == 0:
        o.append(eisen.cylinder('oil', rnd.uniform(0.15, 0.3), 0.002, (rnd.uniform(-0.1, 0.2), rnd.uniform(-0.4, 0.4), 0.001), oil, segments=16))
    return eisen.parent_all(o, 'park')
