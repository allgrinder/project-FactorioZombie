"""Besondere Orte (eigene Entwürfe für „Letzte Schicht“): Polizeiwache, Arztpraxis, Tankstelle. Flachdächer, weil die
Kamera vor allem das Dach sieht: Erkennungszeichen liegen deshalb oben (Rotes Kreuz, Streifen, Tankdach)."""
import math
import random

import bauten
import eisen
import gw_ground
import kit
import ruinen

lin = gw_ground.lin
W = bauten.weathered


def _plaster(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.92, rust=0.3, dust=0.45, edge=0.5, grime=0.8, streaks=0.7, rust_hex='#4a4034', dust_hex='#8a7c66')


def _flat_roof(o, w, d, h, roofm, wallm, rnd, t, units=2):
    o.append(eisen.box('roof', (w - 0.2, d - 0.2, 0.04), (0, 0, h + 0.01), roofm))
    for sx, sy, lw, ld in ((0, 1, w, 0.1), (0, -1, w, 0.1), (1, 0, 0.1, d), (-1, 0, 0.1, d)):
        o.append(eisen.box(f'par{sx}{sy}', (lw, ld, 0.14), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), h + 0.07), wallm, bevel=0.01))
    for i in range(units):
        x = -w / 2 + 0.8 + i * 1.1
        o.append(eisen.box(f'ac{i}', (0.6, 0.45, 0.28), (x, d / 2 - 0.6, h + 0.16), t.panels[i % len(t.panels)], bevel=0.03, rot=(0, 0, rnd.uniform(-0.08, 0.08))))
        kit.fan(o, f'acf{i}', 0.15, (x, d / 2 - 0.6, h + 0.31), 0.2 * i, t)


def police(variant=0):
    """Polizeiwache 6×5: helle Wände, blau-weißes Band, Funkmast, vergitterte Fenster, Streifenwagen-Wrack davor."""
    rnd = random.Random(400 + variant)
    t = kit.Tier(2, accent='#2f4a6a', prefix='po')
    wall = _plaster('po_wall', '#b4b0a4')
    roofm = gw_ground.pmat('po_roof', lin('#4a4a48'), 0.95, 0.3, 0.5, 22)
    blue = W('po_blue', '#2f4a7a', metal=0.2, rough=0.5, rust=0.2, dust=0.3, edge=0.5, streaks=0.4)
    dark = eisen.material('po_dark', (0.012, 0.012, 0.014), rough=0.25)
    bars = W('po_bars', '#3a3a38', metal=0.8, rough=0.5, rust=0.4, dust=0.2, edge=0.3)
    o = []
    w, d, h = 5.6, 4.0, 1.25
    o.append(eisen.box('walls', (w, d, h), (0, 0, h / 2), wall, bevel=0.02))
    _flat_roof(o, w, d, h, roofm, wall, rnd, t, 2)
    # blaues Band rund um die Attika und großes Abzeichen auf dem Dach
    o.append(eisen.box('band', (w + 0.02, d + 0.02, 0.12), (0, 0, h - 0.15), blue))
    o.append(eisen.cylinder('badge', 0.55, 0.03, (0.9, -0.4, h + 0.04), blue, segments=6, rot=(0, 0, math.pi / 6)))
    o.append(eisen.cylinder('badge2', 0.35, 0.035, (0.9, -0.4, h + 0.045), eisen.material('po_gold', eisen.srgb('#c9a24a'), rough=0.4, metal=0.6), segments=6, rot=(0, 0, math.pi / 6)))
    # Funkmast
    o.append(eisen.cylinder('mast', 0.04, 1.6, (-2.2, 1.4, h + 0.8), t.metal, segments=8))
    for k in range(3):
        o.append(eisen.box(f'mx{k}', (0.5 - k * 0.1, 0.03, 0.03), (-2.2, 1.4, h + 0.9 + k * 0.4), t.metal))
    # Südfront: Eingang, vergitterte Fenster, Schild
    ys = -d / 2 - 0.012
    o.append(eisen.box('door', (0.9, 0.03, 0.85), (0.0, ys, 0.43), dark))
    o.append(eisen.box('canopy', (1.4, 0.6, 0.06), (0.0, ys - 0.28, 0.95), blue, bevel=0.01))
    for x in (-2.0, -1.1, 1.1, 2.0):
        o.append(eisen.box(f'win{x}', (0.6, 0.03, 0.5), (x, ys, 0.7), dark))
        for b in range(4):
            o.append(eisen.box(f'bar{x}{b}', (0.025, 0.04, 0.52), (x - 0.22 + b * 0.15, ys - 0.02, 0.7), bars))
    o.append(eisen.box('sign', (1.6, 0.05, 0.22), (0, ys - 0.04, 1.12), blue))
    for k in range(7):
        o.append(eisen.box(f'l{k}', (0.12, 0.01, 0.12), (-0.6 + k * 0.2, ys - 0.07, 1.12), eisen.material('po_txt', eisen.srgb('#e8e8e0'), rough=0.6)))
    # Sandsäcke vor dem Eingang (letztes Gefecht)
    sand = W('po_sand', '#8a7d5a', metal=0.0, rough=0.95, rust=0.2, dust=0.35, edge=0.0)
    for i in range(6):
        o.append(eisen.box(f'sb{i}', (0.32, 0.18, 0.13), (-0.9 + i * 0.36, ys - 0.75, 0.07 + (i % 2) * 0.02), sand, bevel=0.05, rot=(0, 0, rnd.uniform(-0.15, 0.15))))
    return eisen.parent_all(o, 'police')


def clinic(variant=0):
    """Arztpraxis 6×5: weiß, großes Rotes Kreuz auf dem Dach, Vordach, umgestürzte Trage."""
    rnd = random.Random(420 + variant)
    t = kit.Tier(2, accent='#8a3a2e', prefix='cl')
    wall = _plaster('cl_wall', '#c8c4b8')
    roofm = gw_ground.pmat('cl_roof', lin('#7a7872'), 0.95, 0.3, 0.5, 22)
    red = W('cl_red', '#a8322a', metal=0.0, rough=0.6, rust=0.2, dust=0.35, edge=0.3, streaks=0.5)
    white = W('cl_white', '#e0dccc', metal=0.0, rough=0.7, rust=0.1, dust=0.3, edge=0.2)
    dark = eisen.material('cl_dark', (0.012, 0.014, 0.016), rough=0.2)
    o = []
    w, d, h = 5.6, 4.0, 1.2
    o.append(eisen.box('walls', (w, d, h), (0, 0, h / 2), wall, bevel=0.02))
    _flat_roof(o, w, d, h, roofm, wall, rnd, t, 1)
    # Rotes Kreuz auf weißem Grund
    o.append(eisen.box('cbg', (1.8, 1.8, 0.02), (0.6, -0.3, h + 0.04), white))
    o.append(eisen.box('c1', (1.4, 0.45, 0.02), (0.6, -0.3, h + 0.055), red))
    o.append(eisen.box('c2', (0.45, 1.4, 0.02), (0.6, -0.3, h + 0.065), red))
    ys = -d / 2 - 0.012
    o.append(eisen.box('door', (1.0, 0.03, 0.85), (-0.8, ys, 0.43), dark))
    o.append(eisen.box('canopy', (1.6, 0.8, 0.05), (-0.8, ys - 0.38, 0.92), white, bevel=0.01))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'cp{s}', 0.03, 0.9, (-0.8 + s * 0.7, ys - 0.72, 0.45), t.metal, segments=8))
    for x in (-2.2, 0.6, 1.5, 2.3):
        o.append(eisen.box(f'win{x}', (0.55, 0.03, 0.45), (x, ys, 0.68), dark))
    o.append(eisen.box('stripe', (w + 0.02, d + 0.02, 0.08), (0, 0, 0.12), red))
    # umgestürzte Trage
    o.append(eisen.box('stretcher', (0.9, 0.36, 0.05), (1.2, ys - 0.7, 0.18), white, bevel=0.01, rot=(0.9, 0, 0.3)))
    o.append(eisen.box('strframe', (0.95, 0.04, 0.04), (1.2, ys - 0.55, 0.05), t.metal, rot=(0, 0, 0.3)))
    return eisen.parent_all(o, 'clinic')


def gas_station(variant=0):
    """Tankstelle 6×4: Tankdach auf Stützen mit rot-weißem Rand, Zapfsäulen davor, kleiner Kassenbau dahinter."""
    rnd = random.Random(440 + variant)
    t = kit.Tier(2, accent='#a8322a', prefix='gs')
    wall = _plaster('gs_wall', '#a8a294')
    red = W('gs_red', '#a8322a', metal=0.3, rough=0.5, rust=0.4, dust=0.3, edge=0.6, streaks=0.5)
    white = W('gs_white', '#d8d4c4', metal=0.3, rough=0.5, rust=0.3, dust=0.4, edge=0.5, streaks=0.5)
    canopy = W('gs_can', '#c8c4b8', metal=0.4, rough=0.5, rust=0.35, dust=0.5, edge=0.4, streaks=0.6)
    dark = eisen.material('gs_dark', (0.012, 0.012, 0.014), rough=0.25)
    o = []
    # Kassenbau im Norden
    o.append(eisen.box('shop', (3.0, 1.3, 1.0), (-1.2, 1.25, 0.5), wall, bevel=0.02))
    o.append(eisen.box('shoproof', (3.1, 1.4, 0.05), (-1.2, 1.25, 1.02), gw_ground.pmat('gs_roof', lin('#4a4944'), 0.95, 0.3, 0.5, 22)))
    o.append(eisen.box('shopwin', (2.0, 0.03, 0.5), (-1.2, 0.59, 0.6), dark))
    # Zapfsäulen (südlich, unter dem Dach) und Tankdach – Dach nur über der Mitte, Säulen sichtbar
    for i, x in enumerate((-1.6, 0.0, 1.6)):
        o.append(eisen.box(f'isl{i}', (0.9, 0.4, 0.12), (x, -0.9, 0.06), white, bevel=0.02))
        o.append(eisen.box(f'pump{i}', (0.35, 0.25, 0.6), (x, -0.9, 0.42), red if i != 1 else white, bevel=0.03, rot=(0, 0, rnd.uniform(-0.1, 0.1) if i == 2 else 0)))
        o.append(eisen.box(f'disp{i}', (0.25, 0.01, 0.15), (x, -1.03, 0.58), dark))
        kit.cable(o, f'hose{i}', [(x + 0.18, -0.9, 0.5), (x + 0.4, -1.2, 0.2), (x + 0.6, -1.3, 0.02)], 0.02, t.dark)
    for sx in (-1, 1):
        o.append(eisen.box(f'col{sx}', (0.18, 0.18, 1.4), (sx * 1.9, 0.05, 0.7), white, bevel=0.02))
    o.append(eisen.box('canopy', (5.4, 1.4, 0.1), (0, 0.05, 1.45), canopy, bevel=0.02))
    o.append(eisen.box('canedge', (5.5, 1.5, 0.12), (0, 0.05, 1.36), red))
    # Preisschild am Mast
    o.append(eisen.cylinder('signpole', 0.05, 1.8, (2.55, -1.6, 0.9), t.metal, segments=8))
    o.append(eisen.box('signbox', (0.5, 0.12, 0.7), (2.55, -1.6, 1.75), red, bevel=0.02))
    o.append(eisen.box('signface', (0.36, 0.01, 0.45), (2.55, -1.665, 1.72), white))
    # Ölfass und Reifen
    o.append(eisen.cylinder('drum', 0.2, 0.5, (2.5, 1.3, 0.25), t.panels[1], segments=14))
    return eisen.parent_all(o, 'gasstation')


SPECS = (('police-station', police, 6, 5, 1.6), ('clinic', clinic, 6, 5, 1.4), ('gas-station', gas_station, 6, 4, 1.9))


def spec(w, h, height):
    return ruinen.spec(w, h, height)
