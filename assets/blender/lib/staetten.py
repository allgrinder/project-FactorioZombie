"""Stätten (eigene Entwürfe): Friedhof (Grabsteine, Kreuze, offene Gräber) und Evakuierungs-Sammelstelle (Armeezelte,
Sanitätszelt, Militär-Lastwagen, Bauzaun, Dixi-Klo, Leichensäcke). Ursprung = Mitte der Grundfläche; x Ost, y Nord."""
import math
import random

import bauten
import eisen
import gw_ground
import ruinen
from zombie import sphere

lin = gw_ground.lin
W = bauten.weathered


def _stone(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.85, rust=0.0, dust=0.4, edge=0.35, grime=0.8, streaks=0.7)


def _cloth(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.95, rust=0.1, dust=0.5, edge=0.1, grime=0.6, streaks=0.4, rust_hex='#3a2a1a')


def _paint(name, hex_):
    return W(name, hex_, metal=0.5, rough=0.6, rust=0.5, dust=0.5, edge=0.6, grime=0.6, streaks=0.5)


def _earth():
    return gw_ground.pmat('st_earth', lin('#4a3a28'), 0.95, 0.4, 0.8, 30)


def grave(v=0):
    """Grab 1×1 (Kopf nach Norden): 0 Grabstein mit Einfassung, 1 Holzkreuz, 2 offenes Grab mit Erdhaufen,
    3 Grabstein mit Blumen, 4 frisches Grab (Erdhügel, Kreuz aus Latten)."""
    rnd = random.Random(5100 + v)
    o = []
    stone = _stone(f'st_grave{v % 2}', ('#8a8680', '#6e6a62')[v % 2])
    if v in (0, 3):
        o.append(eisen.box('head', (0.5, 0.12, 0.6), (0, 0.32, 0.3), stone, bevel=0.03, rot=(rnd.uniform(-0.12, 0.05), rnd.uniform(-0.08, 0.08), 0)))
        o.append(eisen.box('frame', (0.56, 0.62, 0.08), (0, -0.08, 0.04), stone, bevel=0.01))
        o.append(eisen.box('bed', (0.46, 0.52, 0.06), (0, -0.08, 0.06), _earth()))
        if v == 3:
            import gw_plants
            for k in range(5):
                fl = gw_plants.flower_obj(('#c84040', '#e8e0d0', '#d8a030')[k % 3], 0.04, 'saucer')
                inst = eisen.link(__import__('bpy').data.objects.new('fl', fl.data))
                inst.location = (rnd.uniform(-0.18, 0.18), rnd.uniform(-0.3, 0.1), 0.1)
    elif v == 1:
        wood = W('st_wood', '#6a5034', metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.2, grime=0.7, streaks=0.6)
        o.append(eisen.box('post', (0.07, 0.07, 0.75), (0, 0.32, 0.37), wood, rot=(0, 0.1, 0)))
        o.append(eisen.box('arm', (0.36, 0.06, 0.06), (0, 0.32, 0.55), wood, rot=(0, 0.1, 0)))
        o.append(eisen.box('mound', (0.42, 0.6, 0.12), (0, -0.05, 0.05), _earth(), bevel=0.05))
    elif v == 2:
        dark = eisen.material('st_hole', (0.02, 0.016, 0.012), rough=0.95)
        o.append(eisen.box('hole', (0.45, 0.7, 0.02), (0, 0, 0.005), dark))
        for k in range(6):
            o.append(eisen.rock(f'dirt{k}', rnd.uniform(0.1, 0.18), (0.38 + rnd.uniform(-0.05, 0.08), rnd.uniform(-0.35, 0.35), 0.05), _earth(), 30 + k, squash=0.5, detail=1))
        o.append(eisen.box('slab', (0.5, 0.12, 0.6), (-0.12, 0.42, 0.06), stone, bevel=0.03, rot=(1.45, 0, 0.3)))
    else:
        wood = W('st_lath', '#8a7050', metal=0.0, rough=0.9, rust=0.0, dust=0.5, edge=0.2, grime=0.5, streaks=0.4)
        o.append(eisen.box('mound', (0.45, 0.7, 0.18), (0, -0.02, 0.06), _earth(), bevel=0.07))
        o.append(eisen.box('post', (0.05, 0.05, 0.6), (0, 0.36, 0.3), wood, rot=(0, -0.15, 0)))
        o.append(eisen.box('arm', (0.28, 0.04, 0.04), (0, 0.36, 0.45), wood, rot=(0, -0.15, 0)))
    return eisen.parent_all(o, 'grave')


def tent(v=0):
    """Armeezelt 3×3: Satteldach aus Plane auf Stangen, Eingang offen nach Süden, Spannseile."""
    canvas = _cloth(f'st_tent{v}', ('#5a6040', '#6a6650', '#4e5844')[v % 3])
    dark = eisen.material('st_tentin', (0.03, 0.03, 0.025), rough=0.9)
    o = [eisen.box('floor', (2.6, 2.6, 0.02), (0, 0, 0.01), dark)]
    w, h, ridge = 2.6, 1.0, 2.0
    for s in (-1, 1):
        o.append(eisen.box(f'wall{s}', (0.04, 2.6, h), (s * w / 2, 0, h / 2), canvas))
        ang = math.atan2(ridge - h, w / 2)
        ln = math.hypot(w / 2, ridge - h) + 0.12
        o.append(eisen.box(f'roof{s}', (ln, 2.7, 0.04), (s * w / 4, 0, (ridge + h) / 2), canvas, rot=(0, s * ang, 0)))
    o.append(eisen.box('back', (w, 0.04, h), (0, 1.3, h / 2), canvas))
    o.append(eisen.box('gable', (w * 0.7, 0.04, (ridge - h) * 0.8), (0, 1.3, h + (ridge - h) * 0.4), canvas))
    # offene Klappe vorn
    o.append(eisen.box('flap', (0.9, 0.04, h), (-0.85, -1.3, h / 2), canvas, rot=(0, 0, 0.6)))
    o.append(eisen.box('front', (0.8, 0.04, h), (0.9, -1.3, h / 2), canvas))
    rope = eisen.material('st_rope', (0.35, 0.3, 0.22), rough=0.9)
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.cylinder(f'r{sx}{sy}', 0.008, 0.9, (sx * 1.55, sy * 1.0, 0.4), rope, segments=4, rot=(0, sx * 0.9, 0)))
    if v == 2:  # Rotes Kreuz auf dem Dach (Sanitätszelt)
        white = _cloth('st_white', '#d8d4c8')
        red = eisen.material('st_red', (0.5, 0.05, 0.04), rough=0.8)
        for s in (-1, 1):
            ang = math.atan2(ridge - h, w / 2)
            o.append(eisen.box(f'pw{s}', (0.7, 0.7, 0.01), (s * w / 4, 0, (ridge + h) / 2 + 0.03), white, rot=(0, s * ang, 0)))
            o.append(eisen.box(f'cx{s}', (0.5, 0.14, 0.012), (s * w / 4, 0, (ridge + h) / 2 + 0.04), red, rot=(0, s * ang, 0)))
            o.append(eisen.box(f'cy{s}', (0.14, 0.5, 0.012), (s * w / 4, 0, (ridge + h) / 2 + 0.04), red, rot=(0, s * ang, 0)))
    return eisen.parent_all(o, 'tent')


def army_truck(v=0):
    """Militär-Lastwagen 4×2: Fahrerhaus, Pritsche mit Plane, große Räder; ausgebrannt (v=1)."""
    rnd = random.Random(5200 + v)
    body = _paint(f'st_truck{v}', '#4e5638' if v == 0 else '#2e2a26')
    tarp = _cloth(f'st_tarp{v}', '#5a6040' if v == 0 else '#2a2622')
    dark = eisen.material('st_dark', (0.012, 0.012, 0.014), rough=0.25)
    tire = W('st_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)
    o = [eisen.box('chassis', (3.6, 1.5, 0.25), (0, 0, 0.55), body)]
    o.append(eisen.box('cab', (1.0, 1.5, 0.95), (1.25, 0, 1.15), body, bevel=0.06))
    o.append(eisen.box('wind', (0.04, 1.3, 0.4), (1.76, 0, 1.35), dark, rot=(0, -0.2, 0)))
    o.append(eisen.box('bed', (2.4, 1.6, 0.4), (-0.55, 0, 0.88), body))
    if v == 0:
        o.append(eisen.box('tarp', (2.4, 1.62, 0.9), (-0.55, 0, 1.5), tarp, bevel=0.12))
    else:
        for k in range(4):
            o.append(eisen.box(f'hoop{k}', (0.05, 1.6, 0.05), (-1.6 + k * 0.7, 0, 1.75), body))
    for k, x in enumerate((1.2, -0.4, -1.3)):
        for s in (-1, 1):
            o.append(eisen.cylinder(f'w{k}{s}', 0.42, 0.28, (x, s * 0.72, 0.42), tire, segments=16, rot=(math.pi / 2, 0, 0)))
    if v == 1:
        tones = [gw_ground.pmat(f'st_ash{i}', lin(c), 1.0, 0.3, 0.6, 25) for i, c in enumerate(('#2a2622', '#3a3430'))]
        ruinen.rubble(o, rnd, -1.8, -0.9, 1.8, 0.9, 8, tones, (0.03, 0.08))
    return eisen.parent_all(o, 'truck')


def site_fence():
    """Bauzaun 1 Feld: Gitterfeld in Betonfüßen, leicht schief."""
    steel = _paint('st_fence', '#8a8a84')
    foot = _stone('st_foot', '#7a7670')
    o = []
    for x in (-0.48, 0.48):
        o.append(eisen.box(f'foot{x}', (0.18, 0.3, 0.12), (x, 0, 0.06), foot, bevel=0.02))
        o.append(eisen.cylinder(f'post{x}', 0.02, 1.8, (x, 0, 0.95), steel, segments=6))
    for k in range(8):
        o.append(eisen.cylinder(f'v{k}', 0.006, 1.7, (-0.42 + k * 0.12, 0, 0.95), steel, segments=4))
    for z in (0.15, 0.95, 1.8):
        o.append(eisen.cylinder(f'h{z}', 0.012, 0.98, (0, 0, z), steel, segments=4, rot=(0, math.pi / 2, 0)))
    root = eisen.parent_all(o, 'fence')
    root.rotation_euler = (0.03, 0, 0)
    return root


def porta_potty():
    """Dixi-Klo 1×1: blaues Kunststoffhäuschen, Tür halb offen."""
    blue = W('st_potty', '#3a5a8a', metal=0.0, rough=0.5, rust=0.0, dust=0.5, edge=0.2, grime=0.7, streaks=0.6)
    o = [eisen.box('body', (0.8, 0.8, 1.9), (0, 0, 0.95), blue, bevel=0.04)]
    o.append(eisen.box('roof', (0.86, 0.86, 0.08), (0, 0, 1.94), _paint('st_white2', '#d8d8d0'), bevel=0.03))
    o.append(eisen.box('door', (0.6, 0.04, 1.6), (-0.15, -0.5, 0.85), blue, rot=(0, 0, 0.5)))
    return eisen.parent_all(o, 'potty')


def body_bags(v=0):
    """Leichensäcke 2×1: zwei bis drei schwarze Säcke nebeneinander."""
    rnd = random.Random(5300 + v)
    bag = W('st_bag', '#141618', metal=0.0, rough=0.75, rust=0.0, dust=0.12, edge=0.05, grime=0.3, streaks=0.1)
    o = []
    for k in range(2 + v):
        o.append(sphere(f'bag{k}', 0.5, (-0.6 + k * 0.55 + rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0.09), bag, 16,
                        (0.4, 0.95, 0.22)))
    return eisen.parent_all(o, 'bags')


def cot():
    """Feldbett 1×1 (längs): Stoffliege auf Klappgestell."""
    steel = _paint('st_cot', '#4a4e3e')
    cloth = _cloth('st_cotcloth', '#5e6448')
    o = [eisen.box('bed', (0.6, 0.95, 0.04), (0, 0, 0.42), cloth)]
    for x in (-0.28, 0.28):
        for y in (-0.42, 0.42):
            o.append(eisen.cylinder(f'leg{x}{y}', 0.015, 0.42, (x, y, 0.21), steel, segments=5))
    o.append(eisen.box('blanket', (0.58, 0.45, 0.06), (0, -0.2, 0.46), _cloth('st_blanket', '#6a5a48'), bevel=0.02))
    return eisen.parent_all(o, 'cot')
