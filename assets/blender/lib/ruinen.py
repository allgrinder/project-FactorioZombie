"""Fundorte der alten Welt (eigene Entwürfe für „Letzte Schicht“): Autowrack, verlassenes Haus, Schuppen,
geplünderter Laden, Werkstatt, Vorrats- und Militärkiste, Müllcontainer, rissiger Asphalt.
Ursprung = Mitte der Grundfläche; x nach Osten, y nach Norden. Die Kamera sieht Dach und Südseite –
dort sitzen Türen, Fenster und Schäden."""
import math
import random

import bauten
import bmesh
import eisen
import gw_ground
import kit

lin = gw_ground.lin
W = bauten.weathered


def spec(w, h, height, margin=0.3):
    """Leinwand und Anker für ein Gebäude mit Grundfläche w×h und Höhe height (Höhe erscheint × tan 30°),
    dazu Schattenleinwand und -anker."""
    up = height * math.tan(eisen.TILT)
    cw = w + 2 * margin
    ch = h + up + 2 * margin
    canvas = (math.ceil(cw * 4) / 4, math.ceil(ch * 4) / 4)
    anchor = (0.5, (canvas[1] - margin - h / 2) / canvas[1])
    sh = (w + 1.5, h + 1.5)
    sha = ((w / 2 + 0.25) / sh[0], (h / 2 + 0.25) / sh[1])
    return canvas, anchor, sh, sha


def _wood(name, hex_='#6a5238'):
    return gw_ground.pmat(name, lin(hex_), 0.9, 0.4, 0.6, 26)


def _plaster(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.92, rust=0.35, dust=0.45, edge=0.5, grime=0.8, streaks=0.7,
             rust_hex='#4a4034', dust_hex='#8a7c66')


def _glass_dark(name='ru_dark'):
    return eisen.material(name, (0.012, 0.012, 0.014), rough=0.25)


def rubble(o, rnd, x0, y0, x1, y1, n, tones, size=(0.04, 0.12)):
    """Schutt: kleine kantige Brocken in einem Rechteck."""
    for i in range(n):
        r = rnd.uniform(*size)
        o.append(eisen.rock(f'rub{len(o)}', r, (rnd.uniform(x0, x1), rnd.uniform(y0, y1), r * 0.45), rnd.choice(tones), rnd.randint(0, 9999), squash=0.7, detail=1))


def planks(o, name, x, y, z, w, h, n, mat, axis='X', thick=0.03, rnd=None):
    """Brettergruppe (vernageltes Fenster): n Bretter quer über eine Öffnung an einer Südwand (in der XZ-Ebene)."""
    for i in range(n):
        zz = z - h / 2 + (i + 0.5) * h / n
        o.append(eisen.box(f'{name}{i}', (w, thick, h / n * 0.8), (x, y, zz), mat, bevel=0.006,
                           rot=(0, (rnd.uniform(-0.09, 0.09) if rnd else 0), 0)))


def pitched_roof(o, name, w, d, z, rise, mats, rnd, hole=None, rows=10, overhang=0.12):
    """Satteldach, First entlang X: je Seite rows Reihen Ziegelbahnen; hole = (x0, x1, Seite, r0, r1) lässt eine
    Lücke (eingestürzt), darunter dunkler Dachboden mit Sparren."""
    half = d / 2 + overhang
    slope = math.atan2(rise, d / 2)
    length = math.hypot(d / 2, rise) + overhang
    for side in (-1, 1):
        for r in range(rows):
            t0 = r / rows
            t1 = (r + 1) / rows
            cy = side * half * (1 - (t0 + t1) / 2)
            cz = z + rise * (t0 + t1) / 2 + 0.02
            # in Stücke entlang X teilen, damit einzelne Bahnen fehlen/anders getönt sein können
            nseg = max(3, int(w / 0.3))
            for sgm in range(nseg):
                x0 = -w / 2 - overhang + sgm * (w + 2 * overhang) / nseg
                x1 = x0 + (w + 2 * overhang) / nseg
                xm = (x0 + x1) / 2
                if hole and hole[2] == side and hole[0] < xm < hole[1] and hole[3] <= r < hole[4]:
                    continue
                if rnd.random() < 0.035:
                    continue  # einzelne Ziegel fehlen
                mat = rnd.choice(mats)
                off = (r % 2) * (x1 - x0) / 2
                o.append(eisen.box(f'{name}{side}{r}{sgm}', (x1 - x0 - 0.01, length / rows + 0.035, 0.03), (xm + off, cy, cz + rnd.uniform(-0.008, 0.008)),
                                   mat, bevel=0.006, rot=(side * -slope + rnd.uniform(-0.03, 0.03), 0, rnd.uniform(-0.02, 0.02))))
    o.append(eisen.box(name + 'ridge', (w + 2 * overhang, 0.09, 0.05), (0, 0, z + rise + 0.03), mats[0], bevel=0.01))


# --------------------------------------------------------------------------- Autowrack 3×2

CAR_COLORS = ('#6e2f26', '#3f5560', '#8a7a3e')


def car_wreck(variant=0):
    rnd = random.Random(40 + variant)
    body = W(f'car_body{variant}', CAR_COLORS[variant % 3], metal=0.55, rough=0.55, rust=0.75, dust=0.5, edge=0.7, grime=0.7, streaks=0.7)
    rust = W('car_rust', '#5a3320', metal=0.4, rough=0.8, rust=0.9, dust=0.4, edge=0.3)
    dark = _glass_dark('car_dark')
    tire = W('car_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)
    chrome = W('car_chrome', '#6f706c', metal=0.85, rough=0.4, rust=0.4, dust=0.4, edge=0.4)
    o = []
    L, Bw = 2.55, 1.2
    sag = -0.05  # platte Reifen: Wagen hängt tief
    o.append(eisen.box('chassis', (L, Bw, 0.34), (0, 0, 0.36 + sag), body, bevel=0.07))
    o.append(eisen.box('cabin', (1.25, Bw - 0.14, 0.34), (-0.18, 0, 0.68 + sag), body, bevel=0.1))
    o.append(eisen.box('roofrust', (0.9, Bw - 0.4, 0.02), (-0.18, 0, 0.855 + sag), rust, bevel=0.005))
    # Scheiben (zerbrochen: dunkel), Front schräg
    o.append(eisen.box('wind', (0.05, Bw - 0.26, 0.26), (0.46, 0, 0.67 + sag), dark, rot=(0, -0.5, 0)))
    o.append(eisen.box('rear', (0.05, Bw - 0.26, 0.24), (-0.82, 0, 0.67 + sag), dark, rot=(0, 0.45, 0)))
    for s in (-1, 1):
        o.append(eisen.box(f'side{s}', (0.95, 0.03, 0.2), (-0.18, s * (Bw / 2 - 0.065), 0.7 + sag), dark))
    # Motorhaube: je nach Variante offen
    if variant % 3 == 1:
        o.append(eisen.box('hood', (0.72, Bw - 0.12, 0.03), (0.72, 0, 0.78 + sag), body, bevel=0.01, rot=(0, -0.75, 0)))
        o.append(eisen.box('engine', (0.6, Bw - 0.3, 0.1), (0.9, 0, 0.5 + sag), rust, bevel=0.02))
    else:
        o.append(eisen.box('hood', (0.75, Bw - 0.1, 0.03), (0.9, 0, 0.545 + sag), body, bevel=0.01))
    o.append(eisen.box('trunk', (0.42, Bw - 0.1, 0.03), (-1.04, 0, 0.545 + sag), body, bevel=0.01))
    for s in (-1, 1):
        o.append(eisen.box(f'bump{s}', (0.08, Bw + 0.04, 0.1), (s * (L / 2 + 0.01), 0, 0.27 + sag), chrome, bevel=0.02,
                           rot=(0, 0, rnd.uniform(-0.05, 0.05))))
        for t in (-1, 1):
            o.append(eisen.cylinder(f'lamp{s}{t}', 0.07, 0.04, (s * (L / 2 + 0.005), t * (Bw / 2 - 0.18), 0.42 + sag),
                                    dark if rnd.random() < 0.6 else chrome, segments=10, rot=(0, math.pi / 2, 0)))
    # Räder: eins fehlt bzw. liegt daneben
    missing = rnd.randrange(4)
    k = 0
    for sx in (-1, 1):
        for sy in (-1, 1):
            pos = (sx * 0.82, sy * (Bw / 2 - 0.02), 0.19)
            if k == missing:
                o.append(eisen.cylinder('wheeloff', 0.2, 0.15, (sx * 1.0 + rnd.uniform(-0.2, 0.2), sy * 0.9, 0.075), tire, segments=14))
                o.append(eisen.cylinder('hub', 0.1, 0.16, (pos[0], pos[1] - sy * 0.05, 0.22), rust, segments=10, rot=(math.pi / 2, 0, 0)))
            else:
                o.append(eisen.cylinder(f'wheel{k}', 0.2, 0.16, pos, tire, segments=14, rot=(math.pi / 2, 0, 0)))
                o.append(eisen.cylinder(f'rim{k}', 0.11, 0.17, pos, chrome, segments=10, rot=(math.pi / 2, 0, 0)))
            k += 1
    # offene Tür (Südseite, sichtbar)
    if variant % 3 != 2:
        o.append(eisen.box('door', (0.55, 0.04, 0.5), (0.02, -Bw / 2 - 0.2, 0.5 + sag), body, bevel=0.02, rot=(0, 0, 0.75)))
    earth = [gw_ground.pmat(f'car_e{i}', lin(h), 1.0, 0.3, 0.6, 25) for i, h in enumerate(('#4a3d2e', '#3a3128', '#5a4a36'))]
    rubble(o, rnd, -1.4, -0.95, 1.4, 0.95, 26, earth + [rust], (0.02, 0.06))
    return eisen.parent_all(o, 'carwreck')


# --------------------------------------------------------------------------- Haus 5×4

def ruin_house(variant=0):
    rnd = random.Random(60 + variant)
    wall = _plaster('rh_wall', ('#a59a84', '#8f8a7c', '#a08f78')[variant % 3])
    brick = W('rh_brick', '#7a4a36', metal=0.0, rough=0.9, rust=0.3, dust=0.5, edge=0.6, grime=0.6, streaks=0.3)
    tiles = [W(f'rh_tile{i}', h, metal=0.0, rough=0.9, rust=0.5, dust=0.2, edge=0.35, grime=0.5, streaks=0.6, rust_hex='#33382a', dust_hex='#6a6252')
             for i, h in enumerate(('#63301f', '#55291d', '#6e3a26', '#4a2a22', '#5a3524') if variant % 2 == 0 else ('#3c4044', '#32363a', '#474b4d', '#2e3134', '#3a3f3c'))]
    wood = _wood('rh_wood')
    dark = _glass_dark('rh_dark')
    o = []
    w, d, hgt = 4.6, 3.3, 1.05
    # Sockel und Wände
    o.append(eisen.box('base', (w + 0.1, d + 0.1, 0.1), (0, 0, 0.05), brick, bevel=0.02))
    o.append(eisen.box('walls', (w, d, hgt), (0, 0, 0.1 + hgt / 2), wall, bevel=0.02))
    # Dachboden dunkel (sichtbar durch das Loch)
    o.append(eisen.box('attic', (w - 0.1, d - 0.1, 0.04), (0, 0, hgt + 0.13), dark))
    for i in range(7):
        x = -w / 2 + 0.3 + i * (w - 0.6) / 6
        for side in (-1, 1):
            o.append(bauten.beam(f'raft{i}{side}', (x, side * d / 2, hgt + 0.14), (x, 0, hgt + 0.14 + 0.75), (0.07, 0.07), wood))
    hole = (0.2, 1.9, -1, 1, 5) if variant % 2 == 0 else (-2.0, -0.6, -1, 0, 4)
    pitched_roof(o, 'roof', w, d, hgt + 0.12, 0.78, tiles, rnd, hole=hole)
    moss_r = gw_ground.pmat('rh_mossr', lin('#3a4526'), 0.95, 0.5, 0.7, 14)
    for i in range(7):
        side = rnd.choice((-1, 1))
        tt = rnd.uniform(0.1, 0.9)
        o.append(eisen.rock(f'mossr{i}', rnd.uniform(0.1, 0.22), (rnd.uniform(-w / 2, w / 2), side * (d / 2) * (1 - tt), hgt + 0.15 + 0.78 * tt), moss_r, 300 + i, squash=0.18, detail=2))
    # Giebel (Ost/West)
    for s in (-1, 1):
        bm = bmesh.new()
        v = [bm.verts.new((s * w / 2, -d / 2, hgt + 0.1)), bm.verts.new((s * w / 2, d / 2, hgt + 0.1)), bm.verts.new((s * w / 2, 0, hgt + 0.1 + 0.78))]
        bm.faces.new(v if s > 0 else v[::-1])
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.04)
        o.append(eisen.mesh_obj(f'gable{s}', bm, wall))
    # Schornstein
    o.append(eisen.box('chim', (0.34, 0.34, 0.75), (-1.4 if variant % 2 == 0 else 1.5, 0.45, hgt + 0.75), brick, bevel=0.02))
    o.append(eisen.box('chimtop', (0.4, 0.4, 0.06), (-1.4 if variant % 2 == 0 else 1.5, 0.45, hgt + 1.15), brick, bevel=0.01))
    # Südfassade: Tür (offen, dunkel) und vernagelte Fenster
    ys = -d / 2 - 0.012
    o.append(eisen.box('door', (0.5, 0.03, 0.78), (0.2, ys, 0.49), dark))
    o.append(eisen.box('doorleaf', (0.48, 0.04, 0.76), (0.62, ys - 0.2, 0.49), wood, bevel=0.01, rot=(0, 0, -1.1)))
    o.append(eisen.box('step', (0.7, 0.3, 0.08), (0.2, ys - 0.16, 0.04), brick, bevel=0.01))
    for i, x in enumerate((-1.55, -0.6, 1.5)):
        o.append(eisen.box(f'win{i}', (0.56, 0.03, 0.46), (x, ys, 0.68), dark))
        o.append(eisen.box(f'sill{i}', (0.66, 0.08, 0.04), (x, ys - 0.03, 0.43), brick, bevel=0.008))
        if i != 1:
            planks(o, f'pl{i}', x, ys - 0.03, 0.68, 0.7, 0.44, 3, wood, rnd=rnd)
    # Efeu-artiger Bewuchs: dunkle Flecken an der Wand, Schutt und Dachziegel am Boden
    moss = gw_ground.pmat('rh_moss', lin('#3f4a2a'), 0.95, 0.4, 0.6, 20)
    for i in range(5):
        o.append(eisen.box(f'moss{i}', (rnd.uniform(0.3, 0.7), 0.02, rnd.uniform(0.2, 0.6)), (rnd.uniform(-w / 2 + 0.3, w / 2 - 0.3), ys - 0.004, rnd.uniform(0.15, 0.4)), moss))
    rubble(o, rnd, hole[0] - 0.2, -d / 2 - 0.5, hole[1] + 0.2, -d / 2 - 0.1, 22, tiles + [brick], (0.04, 0.11))
    rubble(o, rnd, -w / 2 - 0.15, -d / 2 - 0.3, w / 2 + 0.15, d / 2 + 0.2, 20, [brick, wall], (0.03, 0.07))
    return eisen.parent_all(o, 'ruinhouse')


# --------------------------------------------------------------------------- Schuppen 3×3

def ruin_shed(variant=0):
    rnd = random.Random(80 + variant)
    t = kit.Tier(1, prefix='sh')
    wood = _wood('sh_wood', '#5e4a33')
    wood2 = _wood('sh_wood2', '#6f5a40')
    dark = _glass_dark('sh_dark')
    o = []
    w, d, h0, h1 = 2.6, 2.4, 0.95, 1.25
    # Bretterwände: senkrechte Bohlen an der Südseite, Kasten dahinter
    o.append(eisen.box('core', (w - 0.06, d - 0.06, h0), (0, 0, h0 / 2), wood, bevel=0.01))
    n = 13
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if 0.1 < x < 0.75:
            continue  # Türöffnung
        o.append(eisen.box(f'pl{i}', (w / n - 0.012, 0.04, h0 + rnd.uniform(-0.03, 0.06)), (x, -d / 2, h0 / 2), rnd.choice((wood, wood2)), bevel=0.006,
                           rot=(0, rnd.uniform(-0.02, 0.02), 0)))
    o.append(eisen.box('door', (0.62, 0.03, 0.8), (0.42, -d / 2 + 0.01, 0.42), dark))
    o.append(eisen.box('leaf', (0.6, 0.04, 0.8), (0.95, -d / 2 - 0.22, 0.42), wood2, bevel=0.01, rot=(0, 0, -0.9)))
    # Pultdach aus Wellblech, nach Süden abfallend, eine Bahn verrutscht
    slope = math.atan2(h1 - h0, d)
    for i in range(3):
        x = -w / 2 + (i + 0.5) * (w + 0.2) / 3 - 0.1
        shift = 0.25 if (i == variant % 3) else 0.0
        o.append(kit.corrugated(f'roof{i}', (w + 0.3) / 3 + 0.04, d + 0.35, 5, 0.035, (x, -shift, (h0 + h1) / 2 + 0.05 + (0.03 if shift else 0)),
                                t.corr if i != 1 else t.panels[1], rot=(-slope, 0, rnd.uniform(-0.03, 0.03) + (0.12 if shift else 0))))
    o.append(eisen.box('back', (w, 0.05, h1 - h0 + 0.1), (0, d / 2 - 0.03, (h0 + h1) / 2), wood, bevel=0.005))
    # Gerümpel: Fass, Bretterstapel
    o.append(eisen.cylinder('drum', 0.2, 0.5, (-w / 2 - 0.05 + 0.3, -d / 2 - 0.3, 0.25), t.panels[2], segments=14))
    for i in range(4):
        o.append(eisen.box(f'stack{i}', (0.9, 0.12, 0.04), (-0.6, -d / 2 - 0.25 - i * 0.02, 0.03 + i * 0.045), rnd.choice((wood, wood2)), bevel=0.006,
                           rot=(0, 0, rnd.uniform(-0.1, 0.1))))
    return eisen.parent_all(o, 'ruinshed')


# --------------------------------------------------------------------------- Laden 6×4

def ruin_store(variant=0):
    rnd = random.Random(100 + variant)
    t = kit.Tier(1, prefix='st')
    conc = _plaster('st_wall', '#8d8a80')
    roofm = gw_ground.pmat('st_roof', lin('#4a4944'), 0.95, 0.3, 0.5, 22)
    sign = W('st_sign', ('#8a3a2e', '#2f5a6a', '#8a7a2e')[variant % 3], metal=0.2, rough=0.6, rust=0.5, dust=0.4, edge=0.7, streaks=0.7)
    signtxt = eisen.material('st_txt', eisen.srgb('#d8d0b8'), rough=0.7)
    dark = _glass_dark('st_dark')
    wood = _wood('st_wood')
    o = []
    w, d, h = 5.6, 3.3, 1.15
    o.append(eisen.box('walls', (w, d, h), (0, 0, h / 2), conc, bevel=0.02))
    # Flachdach mit Attika, Kies, Lüftungsgeräten
    o.append(eisen.box('roof', (w - 0.2, d - 0.2, 0.04), (0, 0, h - 0.02 + 0.03), roofm))
    for sx, sy, lw, ld in ((0, 1, w, 0.1), (0, -1, w, 0.1), (1, 0, 0.1, d), (-1, 0, 0.1, d)):
        o.append(eisen.box(f'par{sx}{sy}', (lw, ld, 0.14), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), h + 0.07), conc, bevel=0.01))
    for i, (x, y) in enumerate(((-1.7, 0.5), (1.2, 0.7), (2.0, -0.4))):
        o.append(eisen.box(f'ac{i}', (0.7, 0.5, 0.3), (x, y, h + 0.17), t.panels[i % 3], bevel=0.03, rot=(0, 0, rnd.uniform(-0.1, 0.1))))
        kit.fan(o, f'acf{i}', 0.18, (x, y, h + 0.33), 0.1 * i, t)
    # Oberlicht eingebrochen
    o.append(eisen.box('sky', (1.1, 0.8, 0.03), (-0.4, -0.3, h + 0.035), dark))
    for k in range(3):
        o.append(eisen.box(f'skyb{k}', (1.2, 0.04, 0.04), (-0.4, -0.3 + (k - 1) * 0.3, h + 0.05), t.metal, rot=(0, 0, rnd.uniform(-0.1, 0.1))))
    # Südfront: Schaufenster (zerbrochen), Eingang, Schild, zerfetzte Markise
    ys = -d / 2 - 0.012
    for i, (x, ww) in enumerate(((-1.75, 1.7), (1.85, 1.5))):
        o.append(eisen.box(f'shop{i}', (ww, 0.03, 0.62), (x, ys, 0.5), dark))
        o.append(eisen.box(f'shopf{i}', (ww + 0.1, 0.05, 0.05), (x, ys - 0.01, 0.17), t.metal))
        if i == 1:
            planks(o, 'shb', x, ys - 0.03, 0.5, ww + 0.1, 0.56, 4, wood, rnd=rnd)
    o.append(eisen.box('entry', (0.8, 0.03, 0.82), (0.1, ys, 0.42), dark))
    o.append(eisen.box('signb', (w - 0.6, 0.06, 0.26), (0, ys - 0.03, 0.98), sign, bevel=0.01, rot=(0, rnd.uniform(-0.02, 0.03), 0)))
    for k in range(7):
        o.append(eisen.box(f'let{k}', (0.22, 0.02, 0.14), (-1.6 + k * 0.5 + rnd.uniform(-0.03, 0.03), ys - 0.065, 0.98), signtxt))
    awn = W('st_awn', '#6a5f4a', metal=0.0, rough=0.95, rust=0.3, dust=0.4, edge=0.0, streaks=0.6)
    for k in range(4):
        if k == 1 + variant % 2:
            continue
        o.append(eisen.box(f'awn{k}', (rnd.uniform(0.7, 1.1), rnd.uniform(0.25, 0.4), 0.02), (-1.9 + k * 1.3, ys - 0.2, 0.82 - (0.05 if k % 2 else 0)), awn,
                           rot=(0.45 + (0.3 if k % 2 else 0), 0, rnd.uniform(-0.08, 0.08))))
    # Einkaufswagen, Scherben, Müll
    cart = t.metal
    o.append(eisen.box('cart', (0.42, 0.28, 0.22), (-2.3, ys - 0.75, 0.3), cart, rot=(0.0, 1.2, 0.5)))
    tones = [gw_ground.pmat(f'st_r{i}', lin(hx), 0.95, 0.3, 0.5, 22) for i, hx in enumerate(('#8a867c', '#5a584f', '#3c3b36'))]
    rubble(o, rnd, -w / 2, ys - 0.7, w / 2, ys - 0.1, 34, tones, (0.02, 0.07))
    return eisen.parent_all(o, 'ruinstore')


# --------------------------------------------------------------------------- Werkstatt 4×4

def ruin_garage(variant=0):
    rnd = random.Random(120 + variant)
    t = kit.Tier(1, accent='#6a5a2c', prefix='ga')
    wall = W('ga_wall', '#6f6f66', metal=0.0, rough=0.9, rust=0.4, dust=0.45, edge=0.5, grime=0.9, streaks=0.8)
    dark = _glass_dark('ga_dark')
    tire = W('ga_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)
    o = []
    w, d, h = 3.6, 3.3, 1.2
    o.append(eisen.box('walls', (w, d, h), (0, 0, h / 2), wall, bevel=0.02))
    # flaches Blechdach aus Bahnen, einige rostig oder aufgebogen
    for i in range(6):
        x = -w / 2 + (i + 0.5) * w / 6
        lift = 0.1 if i == 2 + variant % 3 else 0.0
        o.append(kit.corrugated(f'roof{i}', w / 6 + 0.05, d + 0.24, 4, 0.03, (x, 0, h + 0.09 + lift), t.corr if i % 3 else t.panels[1],
                                rot=(0.02 + lift * 0.9, 0, rnd.uniform(-0.02, 0.02))))
    o.append(eisen.cylinder('vent', 0.16, 0.3, (1.0, 0.7, h + 0.22), t.metal, segments=12))
    o.append(eisen.cylinder('ventcap', 0.22, 0.04, (1.0, 0.7, h + 0.4), t.dark, segments=12))
    # Südseite: Rolltor halb offen, Tür, Schild
    ys = -d / 2 - 0.012
    o.append(eisen.box('gate', (1.9, 0.03, 0.95), (-0.55, ys, 0.48), dark))
    for k in range(4):
        o.append(eisen.box(f'slat{k}', (1.92, 0.05, 0.11), (-0.55, ys - 0.02, 0.9 - k * 0.12), t.panels[0], bevel=0.008))
    o.append(eisen.box('door', (0.5, 0.03, 0.8), (1.2, ys, 0.41), t.panels[2], bevel=0.005))
    o.append(eisen.box('lintel', (2.1, 0.07, 0.1), (-0.55, ys - 0.02, 1.02), t.hazard))
    # Reifenstapel, Ölfass, Werkbank-Reste
    for k in range(3):
        o.append(eisen.cylinder(f'tire{k}', 0.2, 0.13, (1.55 + rnd.uniform(-0.03, 0.03), ys - 0.35, 0.065 + k * 0.13), tire, segments=14))
    o.append(eisen.cylinder('drum', 0.19, 0.48, (-1.75, ys - 0.3, 0.24), t.panels[1], segments=14))
    o.append(eisen.cylinder('drum2', 0.19, 0.48, (-1.5, ys - 0.62, 0.19), t.panels[3], segments=14, rot=(math.pi / 2, 0, 0.6)))
    oil = eisen.material('ga_oil', (0.01, 0.01, 0.012), rough=0.15)
    o.append(eisen.cylinder('oil', 0.4, 0.004, (-0.4, ys - 0.5, 0.002), oil, segments=18))
    return eisen.parent_all(o, 'ruingarage')


# --------------------------------------------------------------------------- Kisten, Container

def supply_crate(military=False):
    rnd = random.Random(140 + military)
    o = []
    if military:
        body = W('mc_body', '#4a5238', metal=0.5, rough=0.6, rust=0.35, dust=0.4, edge=0.7, streaks=0.4)
        strap = W('mc_strap', '#23241f', metal=0.6, rough=0.5, rust=0.2, dust=0.3, edge=0.5)
        mark = eisen.material('mc_mark', eisen.srgb('#c9c2a0'), rough=0.7)
        o.append(eisen.box('box', (0.86, 0.62, 0.42), (0, 0, 0.21), body, bevel=0.03))
        o.append(eisen.box('lid', (0.9, 0.66, 0.08), (0, 0, 0.46), body, bevel=0.02))
        for s in (-1, 1):
            o.append(eisen.box(f'strap{s}', (0.06, 0.68, 0.5), (s * 0.26, 0, 0.25), strap, bevel=0.005))
            o.append(eisen.box(f'grip{s}', (0.03, 0.2, 0.05), (s * 0.46, 0, 0.3), strap))
        o.append(eisen.box('mark', (0.2, 0.2, 0.004), (0, 0, 0.502), mark, rot=(0, 0, math.pi / 4)))
        o.append(eisen.box('marks', (0.22, 0.005, 0.1), (0, -0.312, 0.25), mark))
    else:
        wood = _wood('sc_wood', '#7a6240')
        wood2 = _wood('sc_wood2', '#665033')
        o.append(eisen.box('box', (0.8, 0.8, 0.6), (0, 0, 0.3), wood, bevel=0.01))
        for k in range(5):
            o.append(eisen.box(f'top{k}', (0.15, 0.84, 0.03), (-0.32 + k * 0.16, 0, 0.615), wood2 if k % 2 else wood, bevel=0.005,
                               rot=(0, 0, rnd.uniform(-0.03, 0.03))))
        for s in (-1, 1):
            o.append(eisen.box(f'edge{s}', (0.86, 0.06, 0.06), (0, s * 0.39, 0.6), wood2, bevel=0.005))
            o.append(eisen.box(f'fr{s}', (0.07, 0.03, 0.62), (s * 0.37, -0.405, 0.3), wood2, bevel=0.005))
        o.append(bauten.beam('diag', (-0.36, -0.41, 0.04), (0.36, -0.41, 0.56), (0.07, 0.03), wood2))
        red = eisen.material('sc_red', eisen.srgb('#8a2a22'), rough=0.8)
        o.append(eisen.box('cross1', (0.3, 0.09, 0.004), (0, 0, 0.632), red))
        o.append(eisen.box('cross2', (0.09, 0.3, 0.004), (0, 0, 0.632), red))
    return eisen.parent_all(o, 'crate')


def dumpster(variant=0):
    rnd = random.Random(150 + variant)
    body = W('du_body', '#3f5a44', metal=0.5, rough=0.6, rust=0.6, dust=0.4, edge=0.7, grime=0.8, streaks=0.8)
    lid = W('du_lid', '#2b2d2a', metal=0.2, rough=0.7, rust=0.2, dust=0.5, edge=0.4)
    dark = _glass_dark('du_dark')
    o = []
    o.append(eisen.box('body', (1.8, 0.78, 0.62), (0, 0, 0.36), body, bevel=0.03))
    o.append(eisen.box('inner', (1.7, 0.68, 0.02), (0, 0, 0.675), dark))
    o.append(eisen.box('lid0', (0.86, 0.8, 0.04), (-0.45, 0.02, 0.7), lid, bevel=0.01, rot=(0.04, 0, 0)))
    o.append(eisen.box('lid1', (0.86, 0.8, 0.04), (0.45, 0.33, 0.95), lid, bevel=0.01, rot=(1.15, 0, 0)))
    for s in (-1, 1):
        o.append(eisen.box(f'rib{s}', (0.05, 0.82, 0.5), (s * 0.55, 0, 0.36), body, bevel=0.01))
        o.append(eisen.cylinder(f'wheel{s}', 0.07, 0.06, (s * 0.75, -0.3, 0.06), lid, segments=10, rot=(math.pi / 2, 0, 0)))
    bag = W('du_bag', '#1b1b1c', metal=0.0, rough=0.5, rust=0.0, dust=0.3, edge=0.0)
    for k in range(3):
        o.append(eisen.rock(f'bag{k}', rnd.uniform(0.14, 0.2), (0.3 + k * 0.2, -0.05 + rnd.uniform(-0.1, 0.1), 0.68), bag, 20 + k, squash=0.8, detail=2))
    o.append(eisen.rock('bagout', 0.18, (-1.05, -0.3, 0.1), bag, 31, squash=0.7, detail=2))
    return eisen.parent_all(o, 'dumpster')


# --------------------------------------------------------------------------- Asphalt (1×1-Kachel)

def asphalt(v):
    rnd = random.Random(170 + v)
    o = []
    tar = gw_ground.pmat('as_tar', lin('#3b3b3c'), 0.95, 0.35, 0.6, 40 + v)
    o.append(eisen.box('base', (1.06, 1.06, 0.02), (0, 0, -0.01), tar))
    crack = eisen.material('as_crack', (0.012, 0.012, 0.012), rough=0.95)
    patch = gw_ground.pmat('as_patch', lin('#2c2c2e'), 0.9, 0.3, 0.5, 30)
    weed = gw_ground.pmat('as_weed', lin('#55602f'), 0.95, 0.4, 0.5, 30)
    # Risse: gezackte Linienzüge, in manchen wächst Gras
    for c in range(rnd.randint(1, 3)):
        x, y = rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4)
        a = rnd.uniform(0, math.tau)
        for k in range(rnd.randint(3, 6)):
            a += rnd.uniform(-0.7, 0.7)
            l = rnd.uniform(0.08, 0.2)
            o.append(eisen.box(f'cr{c}{k}', (l, rnd.uniform(0.008, 0.02), 0.004), (x + math.cos(a) * l / 2, y + math.sin(a) * l / 2, 0.001), crack, rot=(0, 0, a)))
            if rnd.random() < 0.3:
                o.append(eisen.cylinder(f'wd{c}{k}', rnd.uniform(0.015, 0.035), 0.01, (x, y, 0.004), weed, segments=7))
            x += math.cos(a) * l
            y += math.sin(a) * l
    if v % 2 == 0:
        o.append(eisen.box('patch', (rnd.uniform(0.25, 0.45), rnd.uniform(0.2, 0.35), 0.003), (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.0005), patch,
                           rot=(0, 0, rnd.uniform(-0.3, 0.3))))
    # Staub/Kies am Rand
    grit = gw_ground.pmat('as_grit', lin('#6a6253'), 1.0, 0.3, 0.6, 30)
    for k in range(10):
        o.append(eisen.rock(f'gr{k}', rnd.uniform(0.008, 0.02), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0.004), grit, 200 + k, squash=0.6, detail=1))
    return eisen.parent_all(o, 'asphalt')
