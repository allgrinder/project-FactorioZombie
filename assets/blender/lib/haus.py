"""Begehbare Häuser (eigene Entwürfe für „Letzte Schicht“): Wandstücke mit Verbindungen zu den Nachbarn (Maske
N=1, O=2, S=4, W=8) in vier Bauarten (Ziegel, Putz, Holz, Beton), Türen und Fenster in beiden Achsen, Bretter zum
Verbarrikadieren, Möbel (Küche, Kühlschrank, Herd, Schrank, Regal, Bad, Schreibtisch, Bett, Sofa, Tisch, Ladenregal,
Pritsche, Spind), Innenböden (Dielen, Fliesen) und Dachkacheln (Ziegel, Schiefer, Wellblech; je Nord-/Südhang, First
und dasselbe quer; Flachdach) von oben.
Ursprung = Mitte des Feldes; x nach Osten, y nach Norden."""
import math
import random

import bauten
import eisen
import gw_ground
import ruinen

lin = gw_ground.lin
W = bauten.weathered

H = 0.8      # Wandhöhe
T = 0.26     # Wandstärke
MATS = ('brick', 'plaster', 'wood', 'concrete')


def _seed(*parts):
    """Fester Zufallskeim (hash() von Zeichenketten ist je Prozess verschieden)."""
    return sum((i + 1) * ord(c) for i, c in enumerate('|'.join(map(str, parts))))


def wall_mats(kind):
    if kind == 'brick':
        body = W('hw_brick', '#7a4434', metal=0.0, rough=0.9, rust=0.3, dust=0.5, edge=0.6, grime=0.7, streaks=0.4)
        cap = W('hw_brickcap', '#8d8678', metal=0.0, rough=0.9, rust=0.1, dust=0.6, edge=0.4, grime=0.5)
        line = gw_ground.pmat('hw_mortar', lin('#4a3a30'), 0.95, 0.3, 0.6, 30)
    elif kind == 'plaster':
        body = ruinen._plaster('hw_plaster', '#b3a78e')
        cap = W('hw_plcap', '#7d776a', metal=0.0, rough=0.9, rust=0.2, dust=0.6, edge=0.4, grime=0.5)
        line = W('hw_plinth', '#5e5850', metal=0.0, rough=0.9, rust=0.2, dust=0.4, edge=0.5, grime=0.8)
    elif kind == 'wood':
        body = W('hw_wood', '#6a3a2a', metal=0.0, rough=0.9, rust=0.2, dust=0.5, edge=0.6, grime=0.6, streaks=0.6,
                 rust_hex='#3a2a20', dust_hex='#7a6a52')
        cap = gw_ground.pmat('hw_woodcap', lin('#4a3626'), 0.9, 0.4, 0.6, 26)
        line = gw_ground.pmat('hw_woodgap', lin('#2a1e16'), 0.95, 0.3, 0.6, 30)
    else:
        body = W('hw_concrete', '#8a8780', metal=0.0, rough=0.92, rust=0.25, dust=0.5, edge=0.5, grime=0.8, streaks=0.7,
                 rust_hex='#4a4438', dust_hex='#8a8070')
        cap = W('hw_conccap', '#6e6c66', metal=0.0, rough=0.9, rust=0.2, dust=0.6, edge=0.4, grime=0.6)
        line = gw_ground.pmat('hw_concline', lin('#55524c'), 0.95, 0.3, 0.6, 30)
    return body, cap, line


def _courses(o, kind, line, x0, x1, y0, y1, h0=0.0, h1=H):
    """Fugen bzw. Bretterspalten auf der sichtbaren Südseite (y0) eines Wandstücks."""
    if kind == 'brick':
        for k in range(1, 6):
            z = h0 + (h1 - h0) * k / 6
            o.append(eisen.box(f'c{len(o)}', (x1 - x0, 0.008, 0.012), ((x0 + x1) / 2, y0 - 0.003, z), line))
    elif kind == 'plaster':
        o.append(eisen.box(f'c{len(o)}', (x1 - x0, 0.012, 0.14), ((x0 + x1) / 2, y0 - 0.004, h0 + 0.07), line))
    elif kind == 'wood':
        n = max(1, round((x1 - x0) / 0.16))
        for k in range(1, n):
            x = x0 + (x1 - x0) * k / n
            o.append(eisen.box(f'c{len(o)}', (0.012, 0.008, h1 - h0), (x, y0 - 0.003, (h0 + h1) / 2), line))
    else:
        for k in (1, 2):
            z = h0 + (h1 - h0) * k / 3
            o.append(eisen.box(f'c{len(o)}', (x1 - x0, 0.008, 0.01), ((x0 + x1) / 2, y0 - 0.003, z), line))


def wall(kind, mask):
    """Wandstück: Pfosten in der Mitte und Arme zu verbundenen Nachbarn (Maske N=1, O=2, S=4, W=8)."""
    body, cap, line = wall_mats(kind)
    o = []
    segs = [(-T / 2, T / 2, -T / 2, T / 2)]
    if mask & 1:
        segs.append((-T / 2, T / 2, T / 2, 0.51))
    if mask & 4:
        segs.append((-T / 2, T / 2, -0.51, -T / 2))
    if mask & 2:
        segs.append((T / 2, 0.51, -T / 2, T / 2))
    if mask & 8:
        segs.append((-0.51, -T / 2, -T / 2, T / 2))
    for x0, x1, y0, y1 in segs:
        o.append(eisen.box(f'w{len(o)}', (x1 - x0, y1 - y0, H), ((x0 + x1) / 2, (y0 + y1) / 2, H / 2), body))
        o.append(eisen.box(f'k{len(o)}', (x1 - x0 + 0.01, y1 - y0 + 0.01, 0.03), ((x0 + x1) / 2, (y0 + y1) / 2, H + 0.005), cap))
        _courses(o, kind, line, x0, x1, y0, y1)
    return eisen.parent_all(o, 'wall')


def _rot(o, axis):
    root = eisen.parent_all(o, 'piece')
    if axis == 'v':
        root.rotation_euler = (0, 0, math.pi / 2)
    return root


def window(kind, axis, broken=False):
    """Fenster in einer Wand (Achse h: Wand läuft Ost-West): Brüstung, Sturz, Rahmen, Scheibe bzw. Scherben."""
    rnd = random.Random(_seed(kind, axis, broken))
    body, cap, line = wall_mats(kind)
    frame = ruinen._wood('hw_frame', '#c8c0aa' if kind != 'wood' else '#4a3626')
    glass = eisen.material('hw_glass', (0.06, 0.08, 0.09), rough=0.05, metal=0.2)
    o = []
    L = 1.02
    o.append(eisen.box('sill', (L, T, 0.32), (0, 0, 0.16), body))
    o.append(eisen.box('lintel', (L, T, 0.12), (0, 0, H - 0.06), body))
    o.append(eisen.box('cap', (L + 0.01, T + 0.01, 0.03), (0, 0, H + 0.005), cap))
    _courses(o, kind, line, -L / 2, L / 2, -T / 2, T / 2, 0, 0.32)
    for s in (-1, 1):
        o.append(eisen.box(f'post{s}', (0.12, T, H), (s * 0.45, 0, H / 2), body))
        o.append(eisen.box(f'fr{s}', (0.05, 0.08, H - 0.44), (s * 0.37, 0, 0.32 + (H - 0.44) / 2), frame))
    o.append(eisen.box('frb', (0.78, 0.09, 0.05), (0, 0, 0.34), frame))
    o.append(eisen.box('frt', (0.78, 0.08, 0.05), (0, 0, H - 0.13), frame))
    o.append(eisen.box('frm', (0.04, 0.07, H - 0.44), (0, 0, 0.32 + (H - 0.44) / 2), frame))
    if not broken:
        o.append(eisen.box('glass', (0.72, 0.02, H - 0.46), (0, 0, 0.32 + (H - 0.44) / 2), glass))
    else:
        for i in range(4):
            o.append(eisen.box(f'shard{i}', (rnd.uniform(0.06, 0.16), 0.015, rnd.uniform(0.05, 0.12)),
                               (rnd.uniform(-0.3, 0.3), 0, 0.38 + rnd.uniform(0, 0.08)), glass, rot=(0, rnd.uniform(-0.6, 0.6), 0)))
        for i in range(6):
            o.append(eisen.box(f'g{i}', (0.04, 0.03, 0.004), (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.45, -0.18), 0.003), glass,
                               rot=(0, 0, rnd.uniform(0, 3))))
    return _rot(o, axis)


def door(axis, opened=False):
    """Haustür: Sturz und Pfosten, Türblatt geschlossen oder um 90° nach innen (Norden bzw. Osten) geöffnet."""
    frame = ruinen._wood('hd_frame', '#5a4430')
    leaf = W('hd_leaf', '#5e3e2a', metal=0.0, rough=0.85, rust=0.2, dust=0.4, edge=0.6, grime=0.6, streaks=0.4,
             rust_hex='#3a2a20')
    knob = W('hd_knob', '#8a8270', metal=0.8, rough=0.4, rust=0.4, dust=0.3, edge=0.3)
    o = []
    o.append(eisen.box('lintel', (1.02, T, 0.1), (0, 0, H - 0.05), frame))
    for s in (-1, 1):
        o.append(eisen.box(f'post{s}', (0.1, T + 0.02, H), (s * 0.46, 0, H / 2), frame))
    hl = H - 0.12
    if not opened:
        o.append(eisen.box('leaf', (0.82, 0.06, hl), (0, 0, hl / 2), leaf, bevel=0.01))
        for k in range(2):
            o.append(eisen.box(f'panel{k}', (0.3, 0.07, hl * 0.36), (-0.18 + k * 0.36, 0, hl * (0.28 + 0.44 * (k % 1))), leaf, bevel=0.01))
        o.append(eisen.cylinder('knob', 0.025, 0.1, (0.3, 0, hl * 0.5), knob, segments=8, rot=(math.pi / 2, 0, 0)))
    else:
        o.append(eisen.box('leaf', (0.06, 0.82, hl), (-0.4, 0.41 + 0.03, hl / 2), leaf, bevel=0.01))
    return _rot(o, axis)


def boards(axis, n):
    """n Bretter (1–3) schräg über Tür oder Fenster (Südseite bzw. Westseite)."""
    wood = ruinen._wood('hb_board', '#7a6040')
    nail = W('hb_nail', '#55524c', metal=0.8, rough=0.5, rust=0.6, dust=0.3, edge=0.2)
    o = []
    for i in range(n):
        z = 0.22 + i * 0.2
        a = (-0.25, 0.18, -0.08)[i]
        o.append(eisen.box(f'b{i}', (1.08, 0.04, 0.11), (0, -T / 2 - 0.03, z), wood, bevel=0.008, rot=(0, a, 0)))
        for s in (-1, 1):
            o.append(eisen.cylinder(f'n{i}{s}', 0.012, 0.02, (s * 0.42, -T / 2 - 0.055, z - s * a * 0.42), nail, segments=6,
                                    rot=(math.pi / 2, 0, 0)))
    return _rot(o, axis)


# --------------------------------------------------------------------------- Möbel

def _m(name, hex_, rough=0.8, metal=0.0, **kw):
    return W(name, hex_, metal=metal, rough=rough, rust=kw.get('rust', 0.2), dust=kw.get('dust', 0.5), edge=kw.get('edge', 0.5),
             grime=kw.get('grime', 0.5), streaks=kw.get('streaks', 0.3))


def furniture(name):
    rnd = random.Random(sum(map(ord, name)))
    o = []
    wood = ruinen._wood('fu_wood', '#6a4e34')
    pale = _m('fu_pale', '#c9c2b0', rough=0.6)
    dark = eisen.material('fu_dark', (0.03, 0.03, 0.03), rough=0.4)
    steel = _m('fu_steel', '#8a8a86', metal=0.7, rough=0.4, rust=0.4)
    if name == 'kitchen':
        o.append(eisen.box('base', (0.96, 0.58, 0.42), (0, 0.18, 0.21), pale, bevel=0.01))
        o.append(eisen.box('top', (0.98, 0.62, 0.04), (0, 0.18, 0.44), _m('fu_worktop', '#5a5048', rough=0.5)))
        o.append(eisen.box('sink', (0.36, 0.3, 0.03), (0.2, 0.2, 0.455), steel))
        o.append(eisen.cylinder('tap', 0.015, 0.12, (0.2, 0.36, 0.5), steel, segments=8))
        for k in range(2):
            o.append(eisen.box(f'door{k}', (0.42, 0.01, 0.34), (-0.24 + k * 0.48, -0.115, 0.21), pale, bevel=0.005))
            o.append(eisen.box(f'h{k}', (0.1, 0.02, 0.015), (-0.24 + k * 0.48, -0.125, 0.36), steel))
        o.append(eisen.box('pot', (0.18, 0.18, 0.08), (-0.25, 0.2, 0.5), steel, bevel=0.03))
    elif name == 'fridge':
        o.append(eisen.box('body', (0.66, 0.6, 0.86), (0, 0.16, 0.43), _m('fu_fridge', '#d4d0c4', rough=0.5, streaks=0.6), bevel=0.04))
        o.append(eisen.box('gap', (0.64, 0.01, 0.012), (0, -0.145, 0.58), dark))
        o.append(eisen.box('handle', (0.03, 0.03, 0.2), (0.26, -0.16, 0.66), steel))
    elif name == 'stove':
        o.append(eisen.box('body', (0.72, 0.6, 0.44), (0, 0.16, 0.22), _m('fu_stove', '#b8b4a8', rough=0.5), bevel=0.02))
        o.append(eisen.box('oven', (0.56, 0.01, 0.22), (0, -0.145, 0.2), dark))
        for i in range(4):
            o.append(eisen.cylinder(f'hob{i}', 0.09, 0.012, (-0.16 + (i % 2) * 0.32, 0.06 + (i // 2) * 0.26, 0.445), dark, segments=14))
    elif name == 'wardrobe':
        o.append(eisen.box('body', (0.94, 0.5, 0.92), (0, 0.22, 0.46), wood, bevel=0.02))
        o.append(eisen.box('gap', (0.01, 0.01, 0.82), (0, -0.035, 0.46), dark))
        for s in (-1, 1):
            o.append(eisen.cylinder(f'k{s}', 0.02, 0.03, (s * 0.06, -0.04, 0.5), steel, segments=8, rot=(math.pi / 2, 0, 0)))
    elif name == 'shelf':
        o.append(eisen.box('back', (0.94, 0.06, 0.9), (0, 0.33, 0.45), wood))
        for s in (-1, 1):
            o.append(eisen.box(f'side{s}', (0.04, 0.34, 0.9), (s * 0.45, 0.2, 0.45), wood))
        cols = ['#7a2e26', '#2e4a6a', '#5a6a3a', '#8a7a4a', '#4a3a5a', '#a0904a']
        for r in range(3):
            z = 0.06 + r * 0.29
            o.append(eisen.box(f'b{r}', (0.9, 0.34, 0.03), (0, 0.2, z), wood))
            x = -0.42
            while x < 0.4:
                wdt = rnd.uniform(0.03, 0.07)
                if rnd.random() < 0.8:
                    hgt = rnd.uniform(0.14, 0.24)
                    o.append(eisen.box(f'bk{len(o)}', (wdt, 0.22, hgt), (x + wdt / 2, 0.2, z + 0.015 + hgt / 2),
                                       _m(f'fu_bk{len(o) % 6}', rnd.choice(cols), rough=0.7), rot=(0, rnd.uniform(-0.1, 0.1), 0)))
                x += wdt + 0.005
    elif name == 'bathroom':
        o.append(eisen.box('cab', (0.5, 0.4, 0.4), (-0.22, 0.25, 0.2), pale, bevel=0.01))
        o.append(eisen.box('basin', (0.44, 0.34, 0.06), (-0.22, 0.25, 0.43), _m('fu_porc', '#e4e2dc', rough=0.3), bevel=0.03))
        o.append(eisen.box('mirror', (0.36, 0.02, 0.28), (-0.22, 0.44, 0.7), _m('fu_mirror', '#8a9498', metal=0.9, rough=0.15)))
        o.append(eisen.box('wc', (0.28, 0.4, 0.22), (0.26, 0.2, 0.11), _m('fu_porc', '#e4e2dc', rough=0.3), bevel=0.06))
        o.append(eisen.box('tank', (0.32, 0.12, 0.28), (0.26, 0.4, 0.3), _m('fu_porc', '#e4e2dc', rough=0.3), bevel=0.02))
    elif name == 'desk':
        o.append(eisen.box('top', (0.92, 0.5, 0.04), (0, 0.18, 0.42), wood))
        o.append(eisen.box('drawers', (0.3, 0.46, 0.4), (0.3, 0.18, 0.2), wood, bevel=0.01))
        o.append(eisen.box('leg', (0.04, 0.46, 0.4), (-0.43, 0.18, 0.2), wood))
        o.append(eisen.box('paper', (0.2, 0.26, 0.004), (-0.1, 0.2, 0.443), pale, rot=(0, 0, 0.3)))
        o.append(eisen.box('radio', (0.2, 0.12, 0.1), (-0.25, 0.3, 0.49), _m('fu_radio', '#3a3a34'), bevel=0.01))
        o.append(eisen.box('chair', (0.36, 0.36, 0.04), (0, -0.25, 0.28), wood))
    elif name == 'house-bed':
        frame = wood
        o.append(eisen.box('frame', (0.96, 1.9, 0.3), (0, 0, 0.15), frame, bevel=0.02))
        o.append(eisen.box('head', (0.96, 0.08, 0.6), (0, 0.94, 0.3), frame))
        o.append(eisen.box('matt', (0.9, 1.8, 0.12), (0, 0, 0.34), _m('fu_matt', '#c8c0a8', rough=0.9)))
        o.append(eisen.box('blanket', (0.94, 1.1, 0.06), (0, -0.32, 0.42), _m('fu_blanket', '#5a6a7a', rough=0.95, dust=0.6), bevel=0.03,
                           rot=(0.02, 0, 0.03)))
        o.append(eisen.box('pillow', (0.6, 0.32, 0.1), (0, 0.66, 0.44), _m('fu_pillow', '#ddd6c4', rough=0.9), bevel=0.04))
    elif name == 'sofa':
        cloth = _m('fu_sofa', '#6a5038', rough=0.95, dust=0.6)
        o.append(eisen.box('seat', (1.86, 0.7, 0.3), (0, 0.05, 0.15), cloth, bevel=0.05))
        o.append(eisen.box('back', (1.9, 0.22, 0.56), (0, 0.36, 0.28), cloth, bevel=0.05))
        for s in (-1, 1):
            o.append(eisen.box(f'arm{s}', (0.18, 0.7, 0.42), (s * 0.86, 0.05, 0.21), cloth, bevel=0.05))
        o.append(eisen.box('rip', (0.3, 0.2, 0.01), (0.3, 0.0, 0.305), _m('fu_foam', '#c8b880', rough=0.9)))
    elif name == 'table':
        o.append(eisen.box('top', (0.86, 0.86, 0.04), (0, 0, 0.42), wood))
        for sx in (-1, 1):
            for sy in (-1, 1):
                o.append(eisen.box(f'l{sx}{sy}', (0.05, 0.05, 0.4), (sx * 0.38, sy * 0.38, 0.2), wood))
        o.append(eisen.box('chair', (0.34, 0.34, 0.04), (0.1, -0.5, 0.26), wood, rot=(0, 0, 0.3)))
        o.append(eisen.cylinder('plate', 0.09, 0.01, (0.1, 0.1, 0.445), pale, segments=14))
    elif name == 'store-shelf':
        o.append(eisen.box('back', (1.94, 0.06, 0.9), (0, 0.0, 0.45), steel))
        goods = ['#a03a2a', '#d0b040', '#3a6a8a', '#5a8a4a', '#c8c0b0']
        for side in (-1, 1):
            for r in range(3):
                z = 0.05 + r * 0.3
                o.append(eisen.box(f'b{side}{r}', (1.9, 0.36, 0.025), (0, side * 0.2, z), steel))
                for k in range(9):
                    if rnd.random() < 0.55:
                        continue  # geplündert
                    o.append(eisen.box(f'g{len(o)}', (0.14, 0.14, rnd.uniform(0.1, 0.2)), (-0.85 + k * 0.21, side * 0.2, z + 0.1),
                                       _m(f'fu_g{len(o) % 5}', rnd.choice(goods), rough=0.6), bevel=0.01))
    elif name == 'bunk':
        o.append(eisen.box('frame', (0.9, 1.9, 0.06), (0, 0, 0.35), steel))
        for sx in (-1, 1):
            for sy in (-1, 1):
                o.append(eisen.box(f'l{sx}{sy}', (0.05, 0.05, 0.4), (sx * 0.42, sy * 0.92, 0.2), steel))
        o.append(eisen.box('matt', (0.84, 1.8, 0.08), (0, 0, 0.42), _m('fu_bunk', '#6a6a5a', rough=0.95)))
    elif name == 'locker':
        lock = _m('fu_locker', '#5a6a6a', metal=0.6, rough=0.5, rust=0.5)
        for k in range(2):
            o.append(eisen.box(f'l{k}', (0.44, 0.45, 0.95), (-0.23 + k * 0.46, 0.2, 0.475), lock, bevel=0.01))
            for r in range(3):
                o.append(eisen.box(f'v{k}{r}', (0.2, 0.01, 0.015), (-0.23 + k * 0.46, -0.03, 0.8 - r * 0.03), dark))
    elif name == 'workbench':
        o.append(eisen.box('top', (0.96, 0.6, 0.06), (0, 0.15, 0.45), wood))
        for sx in (-1, 1):
            o.append(eisen.box(f'l{sx}', (0.06, 0.56, 0.42), (sx * 0.44, 0.15, 0.21), steel))
        o.append(eisen.box('vise', (0.14, 0.16, 0.1), (0.32, 0.0, 0.53), steel))
        o.append(eisen.box('tools', (0.5, 0.04, 0.4), (-0.1, 0.44, 0.75), wood))
        for k in range(5):
            o.append(eisen.box(f't{k}', (0.03, 0.02, 0.18), (-0.3 + k * 0.1, 0.42, 0.75), steel, rot=(0, rnd.uniform(-0.3, 0.3), 0)))
    return eisen.parent_all(o, name)


FURNITURE = {
    # Name: Breite, Höhe (Felder), Höhe des Modells
    'kitchen': (1, 1, 0.5), 'fridge': (1, 1, 0.9), 'stove': (1, 1, 0.5), 'wardrobe': (1, 1, 0.95), 'shelf': (1, 1, 0.9),
    'bathroom': (1, 1, 0.85), 'desk': (1, 1, 0.6), 'house-bed': (1, 2, 0.6), 'sofa': (2, 1, 0.6), 'table': (1, 1, 0.5),
    'store-shelf': (2, 1, 0.95), 'bunk': (1, 2, 0.5), 'locker': (1, 1, 0.95), 'workbench': (1, 1, 0.9),
}


# --------------------------------------------------------------------------- Böden und Dächer (Kacheln von oben)

def planks(v):
    rnd = random.Random(500 + v)
    o = []
    tones = [gw_ground.pmat(f'pl_t{i}', lin(h), 0.85, 0.4, 0.6, 30 + i) for i, h in enumerate(('#6e5238', '#7a5c40', '#634a32', '#735538'))]
    gap = gw_ground.pmat('pl_gap', lin('#2a1e16'), 0.95, 0.3, 0.6, 30)
    o.append(eisen.box('base', (1.04, 1.04, 0.02), (0, 0, -0.01), gap))
    for r in range(5):
        y = -0.4 + r * 0.2
        off = rnd.uniform(-0.5, 0.5)
        for k, (a, b) in enumerate(((-0.52, off), (off, 0.52))):
            if b - a < 0.02:
                continue
            o.append(eisen.box(f'p{r}{k}', (b - a - 0.01, 0.185, 0.03), ((a + b) / 2, y, 0.015), rnd.choice(tones), bevel=0.004))
    return eisen.parent_all(o, 'planks')


def tiles(v):
    rnd = random.Random(520 + v)
    o = []
    a = gw_ground.pmat('ti_a', lin('#b8b4a8'), 0.4, 0.3, 0.5, 30)
    b = gw_ground.pmat('ti_b', lin('#6a6e70'), 0.4, 0.3, 0.5, 30)
    grout = gw_ground.pmat('ti_g', lin('#4a4844'), 0.95, 0.3, 0.6, 30)
    o.append(eisen.box('base', (1.04, 1.04, 0.02), (0, 0, -0.01), grout))
    for j in range(4):
        for i in range(4):
            if rnd.random() < 0.04:
                continue
            o.append(eisen.box(f't{i}{j}', (0.235, 0.235, 0.02), (-0.375 + i * 0.25, -0.375 + j * 0.25, 0.01), a if (i + j) % 2 else b,
                               bevel=0.004, rot=(0, 0, rnd.uniform(-0.02, 0.02))))
    return eisen.parent_all(o, 'tiles')


ROOFS = {
    'tile': ('#7a3a28', '#6a3222', '#874230'),
    'slate': ('#4a4e52', '#3e4246', '#555a5e'),
    'metal': ('#6a6258', '#5a4a3a', '#7a6e60'),
}


def roof(kind, part, v):
    """Dachkachel 1×1 von oben. part: n/s (Hang nach Norden/Süden, First Ost-West), r (First), e/w und rv (quer)."""
    rnd = random.Random(_seed(kind, part, v))
    o = []
    across = part in ('e', 'w', 'rv')
    p = {'e': 's', 'w': 'n', 'rv': 'r'}.get(part, part)
    slope = math.radians(32)
    mats = [W(f'rf_{kind}{i}', h, metal=0.5 if kind == 'metal' else 0.0, rough=0.8, rust=0.8 if kind == 'metal' else 0.3,
              dust=0.4, edge=0.4, grime=0.5, streaks=0.6) for i, h in enumerate(ROOFS[kind])]
    moss = gw_ground.pmat('rf_moss', lin('#4a5530'), 0.95, 0.4, 0.6, 30)
    dark = W(f'rf_{kind}d', ROOFS[kind][1], metal=0.5 if kind == 'metal' else 0.0, rough=0.85, rust=0.5, dust=0.2, edge=0.3, grime=0.7)
    under = gw_ground.pmat('rf_under', lin('#2a1e18'), 0.95, 0.3, 0.6, 30)
    o.append(eisen.box('under', (1.04, 1.04, 0.02), (0, 0, 0.1), under))

    def plane(sign):
        # sign +1: Hang fällt nach Norden (n), -1: nach Süden (s); Hälfte bzw. ganze Kachel
        rows = 4
        for r in range(rows):
            y = -0.5 + (r + 0.5) / rows
            if p == 'r' and (y > 0) == (sign < 0):
                continue
            tilt = -sign * slope
            z = 0.2 - sign * y * math.tan(slope) * 0.3
            if kind == 'metal':
                for k in range(5):
                    o.append(eisen.box(f'm{len(o)}', (0.2, 0.26, 0.02), (-0.4 + k * 0.2, y, z), mats[k % 2], rot=(tilt * 0.3, 0, 0)))
                    o.append(eisen.box(f'rb{len(o)}', (0.03, 0.26, 0.03), (-0.4 + k * 0.2 + 0.1, y, z + 0.01), mats[2], rot=(tilt * 0.3, 0, 0)))
            else:
                for k in range(5 if kind == 'tile' else 4):
                    n = 5 if kind == 'tile' else 4
                    w = 1.04 / n
                    o.append(eisen.box(f't{len(o)}', (w - 0.01, 0.27, 0.035), (-0.52 + (k + 0.5) * w + (r % 2) * w / 2 - w / 4, y, z),
                                       (dark if sign > 0 else rnd.choice(mats)) if rnd.random() < 0.6 else rnd.choice(mats), bevel=0.01, rot=(tilt * 0.3 + rnd.uniform(-0.03, 0.03), 0, rnd.uniform(-0.03, 0.03))))
        if rnd.random() < 0.35:
            o.append(eisen.box(f'moss{len(o)}', (rnd.uniform(0.1, 0.3), rnd.uniform(0.08, 0.2), 0.01),
                               (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0.26), moss))
    if p == 'n':
        plane(1)
    elif p == 's':
        plane(-1)
    else:
        plane(1)
        plane(-1)
        o.append(eisen.box('ridge', (1.04, 0.12, 0.06), (0, 0, 0.27), mats[2], bevel=0.02))
    root = eisen.parent_all(o, 'roof')
    if across:
        root.rotation_euler = (0, 0, math.pi / 2)
    return root


def flat_roof(v, part='c'):
    """Flachdach-Kachel (Neunerteilung): c Mitte (Variante 1 mit Lüfter bzw. Klimagerät), n/s/e/w Rand mit Attika,
    nw/ne/sw/se Ecken."""
    rnd = random.Random(560 + v + 17 * len(part) + sum(map(ord, part)))
    o = []
    par = W('fr_parapet', '#8a857a', metal=0.0, rough=0.9, rust=0.3, dust=0.6, edge=0.6, grime=0.7, streaks=0.6)
    tin = W('fr_tin', '#6a6e70', metal=0.7, rough=0.5, rust=0.6, dust=0.4, edge=0.4)
    for d in part if part != 'c' else '':
        if d == 'n':
            o.append(eisen.box('pn', (1.04, 0.16, 0.12), (0, 0.44, 0.06), par, bevel=0.01))
        if d == 's':
            o.append(eisen.box('ps', (1.04, 0.16, 0.12), (0, -0.44, 0.06), par, bevel=0.01))
        if d == 'e':
            o.append(eisen.box('pe', (0.16, 1.04, 0.12), (0.44, 0, 0.06), par, bevel=0.01))
        if d == 'w':
            o.append(eisen.box('pw', (0.16, 1.04, 0.12), (-0.44, 0, 0.06), par, bevel=0.01))
    if part == 'c' and v == 1:
        if rnd.random() < 0.5:
            o.append(eisen.box('ac', (0.5, 0.4, 0.22), (0.05, 0.05, 0.13), tin, bevel=0.02))
            o.append(eisen.cylinder('fan', 0.14, 0.02, (0.05, 0.05, 0.25), eisen.material('fr_dark', (0.03, 0.03, 0.03)), segments=16))
        else:
            o.append(eisen.cylinder('vent', 0.12, 0.3, (0.1, 0.0, 0.17), tin, segments=14))
            o.append(eisen.cylinder('cap', 0.17, 0.04, (0.1, 0.0, 0.33), tin, segments=14))
    tar = gw_ground.pmat('fr_tar', lin('#4a4844'), 0.95, 0.4, 0.6, 22)
    grit = gw_ground.pmat('fr_grit', lin('#6a665e'), 0.95, 0.4, 0.6, 40)
    o.append(eisen.box('base', (1.04, 1.04, 0.04), (0, 0, 0.0), tar))
    for k in range(40):
        o.append(eisen.box(f'g{k}', (0.03, 0.03, 0.01), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0.025), grit))
    if rnd.random() < 0.5:
        o.append(eisen.box('puddle', (rnd.uniform(0.2, 0.4), rnd.uniform(0.15, 0.3), 0.004), (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.022),
                           eisen.material('fr_water', (0.05, 0.06, 0.07), rough=0.05)))
    return eisen.parent_all(o, 'flat')
