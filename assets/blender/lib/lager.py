"""Lager des Überlebenden (eigene Entwürfe für „Letzte Schicht“): Holzbarrikade, Tor, Stacheldraht, Nagelfalle,
Feldbett, Gemüsebeet, Regentonne, Funkturm sowie Schuttbrecher. Alles Notbau (Stufe 1): Bohlen, Schrott, Plane.
Ursprung = Mitte der Grundfläche."""
import math
import random

import bauten
import eisen
import gw_ground
import kit

lin = gw_ground.lin
W = bauten.weathered


def _wood(name, hex_='#6a5238'):
    return gw_ground.pmat(name, lin(hex_), 0.9, 0.4, 0.6, 26)


def barricade(m=None):
    """Holzbarrikade 1×1: gekreuzte Bohlen, angespitzte Pfähle nach außen."""
    rnd = random.Random(11)
    wood = _wood('bar_a', '#6b5236')
    wood2 = _wood('bar_b', '#584428')
    metal = W('bar_m', '#4a4a45', metal=0.7, rough=0.5, rust=0.6, dust=0.4, edge=0.5)
    o = []
    for i, x in enumerate((-0.36, -0.12, 0.12, 0.36)):
        hh = 0.78 + rnd.uniform(-0.06, 0.08)
        o.append(eisen.box(f'post{i}', (0.17, 0.15, hh), (x, rnd.uniform(-0.03, 0.03), hh / 2), wood if i % 2 else wood2, bevel=0.02,
                           rot=(rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(-0.1, 0.1))))
        o.append(eisen.box(f'tip{i}', (0.12, 0.11, 0.1), (x, 0, hh + 0.03), wood2, bevel=0.03))
    for k, z in enumerate((0.28, 0.58)):
        o.append(eisen.box(f'rail{k}', (0.98, 0.07, 0.13), (0, -0.1, z), wood2 if k else wood, bevel=0.012, rot=(0, rnd.uniform(-0.06, 0.06), 0)))
    o.append(bauten.beam('brace', (-0.45, -0.15, 0.1), (0.45, -0.15, 0.7), (0.1, 0.05), wood))
    for sgn in (-1, 1):
        o.append(bauten.beam(f'spike{sgn}', (sgn * 0.25, -0.1, 0.25), (sgn * 0.3, -0.48, 0.5), (0.07, 0.07), wood2))
    bauten.bolts(o, metal, [(-0.36, -0.15), (0.36, -0.15), (0, -0.15)], 0.58, axis='Y')
    return eisen.parent_all(o, 'barricade')


def gate(m=None, opened=False):
    """Tor 1×1: Stahlrahmen mit Bretterflügel; offen ist der Flügel zur Seite geschwenkt."""
    wood = _wood('gate_a', '#6f573a')
    wood2 = _wood('gate_b', '#5a4630')
    t = kit.Tier(1, prefix='gt')
    o = []
    for s in (-1, 1):
        o.append(eisen.box(f'post{s}', (0.14, 0.2, 0.95), (s * 0.43, 0, 0.475), t.frame, bevel=0.015))
        o.append(eisen.box(f'cap{s}', (0.18, 0.24, 0.05), (s * 0.43, 0, 0.97), t.metal, bevel=0.01))
    o.append(eisen.box('top', (1.0, 0.1, 0.08), (0, 0, 0.93), t.frame, bevel=0.01))
    leaf = []
    for i in range(5):
        leaf.append(eisen.box(f'pl{i}', (0.135, 0.05, 0.78), (0.07 + i * 0.145, 0, 0.42), wood if i % 2 else wood2, bevel=0.008))
    leaf.append(bauten.beam('z1', (0.02, -0.035, 0.12), (0.7, -0.035, 0.72), (0.08, 0.03), wood2))
    for z in (0.2, 0.66):
        leaf.append(eisen.box(f'band{z}', (0.74, 0.02, 0.05), (0.37, -0.04, z), t.metal))
    leaf.append(eisen.box('haz', (0.5, 0.02, 0.08), (0.37, -0.045, 0.44), t.hazard))
    lf = eisen.parent_all(leaf, 'leaf')
    lf.location = (-0.36, -0.02, 0)
    lf.rotation_euler = (0, 0, -1.45 if opened else 0.0)
    o.append(lf)
    return eisen.parent_all(o, 'gate')


def barbed_wire(m=None):
    """Stacheldraht 1×1: zwei gekreuzte Pflöcke, Drahtrollen dazwischen (begehbar, flach)."""
    rnd = random.Random(21)
    wood = _wood('bw_wood', '#5a4630')
    wire = W('bw_wire', '#6a6a66', metal=0.9, rough=0.4, rust=0.5, dust=0.2, edge=0.3)
    o = []
    for sx in (-0.38, 0.38):
        for a in (-0.5, 0.5):
            o.append(bauten.beam(f'x{sx}{a}', (sx, -0.22 * (1 if a > 0 else -1), 0.02), (sx, 0.22 * (1 if a > 0 else -1), 0.5), (0.06, 0.06), wood))
    # Drahtrollen: Spiralen als Kabel entlang X
    for k, (y, z, r) in enumerate(((0.0, 0.3, 0.2), (-0.22, 0.16, 0.14), (0.24, 0.16, 0.14))):
        pts = []
        turns = 7
        for i in range(turns * 10 + 1):
            tt = i / (turns * 10)
            a = tt * turns * math.tau + k
            pts.append((-0.5 + tt * 1.0, y + math.cos(a) * r, z + math.sin(a) * r * 0.8))
        kit.cable(o, f'coil{k}', pts, 0.008, wire)
    for i in range(22):
        x = rnd.uniform(-0.48, 0.48)
        y = rnd.uniform(-0.38, 0.38)
        z = rnd.uniform(0.08, 0.46)
        o.append(eisen.box(f'barb{i}', (0.05, 0.008, 0.008), (x, y, z), wire, rot=(rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))))
    return eisen.parent_all(o, 'wire')


def spike_trap(m=None):
    """Nagelfalle 1×1: Bretterrost mit nach oben stehenden Nägeln und Eisenspitzen."""
    rnd = random.Random(31)
    wood = _wood('tr_wood', '#5e4a32')
    wood2 = _wood('tr_wood2', '#4c3b26')
    iron = W('tr_iron', '#5a5a56', metal=0.9, rough=0.4, rust=0.55, dust=0.2, edge=0.5)
    blood = eisen.material('tr_blood', eisen.srgb('#3a0c09'), rough=0.5)
    o = []
    for i in range(5):
        o.append(eisen.box(f'pl{i}', (0.17, 0.92, 0.04), (-0.37 + i * 0.185, rnd.uniform(-0.02, 0.02), 0.025), wood if i % 2 else wood2, bevel=0.008,
                           rot=(0, 0, rnd.uniform(-0.03, 0.03))))
    for y in (-0.33, 0.33):
        o.append(eisen.box(f'cr{y}', (0.94, 0.08, 0.03), (0, y, 0.055), wood2, bevel=0.006))
    for i in range(5):
        for j in range(5):
            x = -0.37 + i * 0.185 + rnd.uniform(-0.03, 0.03)
            y = -0.36 + j * 0.18 + rnd.uniform(-0.03, 0.03)
            hh = rnd.uniform(0.12, 0.22)
            bm_r = 0.014
            o.append(eisen.cylinder(f'sp{i}{j}', bm_r, hh, (x, y, 0.05 + hh / 2), iron, segments=6, rot=(rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0)))
    o.append(eisen.cylinder('bl', 0.12, 0.004, (0.12, -0.1, 0.048), blood, segments=12))
    return eisen.parent_all(o, 'trap')


def bed(m=None):
    """Feldbett 1×2 (Kopf im Norden): Rohrgestell, Plane, Decke, Kissen, Rucksack am Fußende."""
    t = kit.Tier(1, prefix='bd')
    canvas = W('bd_canvas', '#6f6a4a', metal=0.0, rough=0.95, rust=0.2, dust=0.3, edge=0.0, streaks=0.3)
    blanket = W('bd_blanket', '#5a3f38', metal=0.0, rough=0.95, rust=0.25, dust=0.2, edge=0.0, streaks=0.2)
    pillow = W('bd_pillow', '#a39c88', metal=0.0, rough=0.95, rust=0.2, dust=0.2, edge=0.0)
    o = []
    for sx in (-0.34, 0.34):
        o.append(eisen.cylinder(f'rail{sx}', 0.025, 1.8, (sx, 0, 0.3), t.metal, segments=8, rot=(math.pi / 2, 0, 0)))
        for sy in (-0.75, 0.0, 0.75):
            o.append(bauten.beam(f'leg{sx}{sy}', (sx, sy - 0.12, 0.02), (sx, sy + 0.12, 0.3), (0.035, 0.035), t.metal))
            o.append(bauten.beam(f'legb{sx}{sy}', (sx, sy + 0.12, 0.02), (sx, sy - 0.12, 0.3), (0.035, 0.035), t.metal))
    o.append(eisen.box('canvas', (0.68, 1.78, 0.03), (0, 0, 0.31), canvas, bevel=0.01))
    o.append(eisen.box('blanket', (0.7, 1.05, 0.06), (0.0, -0.3, 0.35), blanket, bevel=0.025, rot=(0, 0, 0.04)))
    o.append(eisen.box('fold', (0.72, 0.2, 0.05), (0.0, 0.22, 0.38), blanket, bevel=0.02, rot=(0, 0, -0.05)))
    o.append(eisen.box('pillow', (0.46, 0.3, 0.09), (0, 0.66, 0.38), pillow, bevel=0.04, rot=(0, 0, 0.08)))
    pack = W('bd_pack', '#4a5238', metal=0.0, rough=0.9, rust=0.2, dust=0.3, edge=0.2)
    o.append(eisen.box('pack', (0.3, 0.22, 0.3), (0.3, -1.02, 0.15), pack, bevel=0.06, rot=(0, 0, 0.3)))
    return eisen.parent_all(o, 'bed')


def garden(m=None, phase=1.0):
    """Gemüsebeet 2×2: Bohlenrahmen, Erde in Reihen, Pflanzen (phase 0 = kahl … 1 = erntereif)."""
    rnd = random.Random(41)
    wood = _wood('gd_wood', '#5e4a32')
    soil = gw_ground.pmat('gd_soil', lin('#3a2c20'), 1.0, 0.4, 0.8, 22)
    leaf = gw_ground.pmat('gd_leaf', lin('#3f5a28'), 0.9, 0.5, 0.5, 30)
    leaf2 = gw_ground.pmat('gd_leaf2', lin('#324a20'), 0.9, 0.5, 0.5, 30)
    fruit = [eisen.material(f'gd_fr{i}', eisen.srgb(h), rough=0.5) for i, h in enumerate(('#b8402a', '#c98a2a', '#8a9a3a'))]
    o = []
    for s in (-1, 1):
        o.append(eisen.box(f'fx{s}', (1.9, 0.09, 0.22), (0, s * 0.92, 0.11), wood, bevel=0.012))
        o.append(eisen.box(f'fy{s}', (0.09, 1.9, 0.22), (s * 0.92, 0, 0.11), wood, bevel=0.012))
    o.append(eisen.box('soil', (1.78, 1.78, 0.16), (0, 0, 0.08), soil))
    for r in range(4):
        y = -0.66 + r * 0.44
        o.append(eisen.box(f'ridge{r}', (1.7, 0.26, 0.07), (0, y, 0.18), soil, bevel=0.03))
        for c in range(6):
            x = -0.72 + c * 0.29 + rnd.uniform(-0.03, 0.03)
            size = (0.05 + 0.1 * phase) * rnd.uniform(0.8, 1.2)
            o.append(eisen.rock(f'pl{r}{c}', size, (x, y, 0.22 + size * 0.5), rnd.choice((leaf, leaf2)), 500 + r * 10 + c, squash=0.75, detail=2))
            if phase > 0.7 and rnd.random() < 0.55:
                o.append(eisen.rock(f'fr{r}{c}', 0.04, (x + rnd.uniform(-0.05, 0.05), y - 0.06, 0.24 + size * 0.6), fruit[(r + c) % 3], 700 + r * 10 + c, squash=1.0, detail=1))
    # Gießkanne und Stock mit Schnur
    t = kit.Tier(1, prefix='gd')
    o.append(eisen.cylinder('can', 0.1, 0.18, (0.78, -0.82, 0.31), t.panels[2], segments=10))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'stick{s}', 0.014, 0.5, (s * 0.8, 0.86, 0.35), wood, segments=6))
    return eisen.parent_all(o, 'garden')


def rain_barrel(m=None):
    """Regentonne 1×1: Fass mit Trichter aus Plane auf drei Stangen, Wasserspiegel sichtbar."""
    t = kit.Tier(1, prefix='rb')
    wood = _wood('rb_wood', '#5a4630')
    water = eisen.material('rb_water', eisen.srgb('#2f5a66'), rough=0.08, metal=0.2)
    o = []
    o.append(eisen.cylinder('barrel', 0.3, 0.6, (0, 0, 0.3), t.panels[2], segments=18, bevel=0.01))
    for z in (0.12, 0.48):
        o.append(eisen.cylinder(f'hoop{z}', 0.31, 0.04, (0, 0, z), t.metal, segments=18))
    o.append(eisen.cylinder('water', 0.27, 0.01, (0, 0, 0.585), water, segments=18))
    for k in range(3):
        a = k / 3 * math.tau + 0.5
        o.append(bauten.beam(f'pole{k}', (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.0), (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.98), (0.04, 0.04), wood))
    # Planentrichter: flacher Kegel, zur Mitte abfallend
    import bmesh
    bm = bmesh.new()
    n = 12
    c = bm.verts.new((0, 0, 0.72))
    ring = [bm.verts.new((math.cos(i / n * math.tau) * 0.46, math.sin(i / n * math.tau) * 0.46, 0.95 + 0.03 * math.sin(i * 2.1))) for i in range(n)]
    for i in range(n):
        bm.faces.new((c, ring[i], ring[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    o.append(eisen.mesh_obj('tarp', bm, t.tarp, smooth=True))
    return eisen.parent_all(o, 'rainbarrel')


def radio_tower(m=None, phase=0.0, lit=0.0):
    """Funkturm 3×3: Gittermast auf Betonsockel mit Abspannseilen, Sendekasten, Antennen; Warnlicht (lit) an der Spitze."""
    t = kit.Tier(2, accent='#7a3a2a', prefix='rt')
    conc = gw_ground.pmat('rt_conc', lin('#7d7a72'), 0.92, 0.28, 0.45, 18)
    o = []
    o.append(eisen.box('base', (2.5, 2.5, 0.2), (0, 0, 0.1), conc, bevel=0.03))
    # Sendekasten mit Kabeln
    o.append(eisen.box('cab', (0.9, 0.6, 0.7), (-0.6, -0.75, 0.55), t.panels[0], bevel=0.03))
    o.append(eisen.box('cabtop', (0.96, 0.66, 0.05), (-0.6, -0.75, 0.92), t.frame, bevel=0.01))
    kit.grille(o, 'cabg', 0.5, 0.02, (-0.6, -1.06, 0.6), t.frame, t.dark)
    led = kit.glow('rt_led', '#6fe08a' if lit > 0 else '#30402f', 3.0 if lit > 0 else 0.0)
    for k in range(3):
        o.append(eisen.box(f'led{k}', (0.05, 0.02, 0.05), (-0.85 + k * 0.1, -1.06, 0.82), led))
    # Gittermast: vier Eckstiele, die sich verjüngen, Querstreben je Abschnitt
    H = 4.2
    def corner(z):
        r = 0.42 * (1 - z / H) + 0.08
        return [(sx * r, sy * r, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    levels = [0.2 + i * (H - 0.2) / 7 for i in range(8)]
    for i in range(7):
        a = corner(levels[i])
        b = corner(levels[i + 1])
        for k in range(4):
            o.append(bauten.beam(f'st{i}{k}', a[k], b[k], (0.06, 0.06), t.accent if i % 2 else t.metal))
            o.append(bauten.beam(f'hz{i}{k}', b[k], b[(k + 1) % 4], (0.035, 0.035), t.metal))
            o.append(bauten.beam(f'dg{i}{k}', a[k], b[(k + 1) % 4], (0.03, 0.03), t.metal))
    # Antennen: Dipole und Schüssel, oben Stab mit Warnlicht
    top = H
    o.append(eisen.cylinder('rod', 0.03, 0.9, (0, 0, top + 0.45), t.metal, segments=8))
    for k, z in enumerate((top - 0.5, top - 1.3)):
        for s in (-1, 1):
            o.append(eisen.cylinder(f'dip{k}{s}', 0.02, 0.9, (s * 0.25, 0, z), t.frame, segments=8, rot=(math.pi / 2, 0, 0.5 * s + phase * math.tau * 0)))
    o.append(eisen.cylinder('dish', 0.32, 0.06, (0.0, -0.3, top - 2.0), t.panels[1], segments=18, rot=(1.1, 0, 0.4)))
    lamp = kit.glow('rt_lamp', '#ff3a2a', 10.0 * lit) if lit > 0 else eisen.material('rt_lampoff', eisen.srgb('#5a1a14'), rough=0.3)
    o.append(eisen.cylinder('lamp', 0.07, 0.1, (0, 0, top + 0.95), lamp, segments=10))
    # Abspannseile zu drei Ankern
    for k in range(3):
        a = k / 3 * math.tau + 0.4
        anc = (math.cos(a) * 1.15, math.sin(a) * 1.15, 0.22)
        o.append(eisen.box(f'anc{k}', (0.16, 0.16, 0.1), anc, t.frame, bevel=0.01))
        kit.cable(o, f'guy{k}', [anc, (math.cos(a) * 0.12, math.sin(a) * 0.12, top * 0.72)], 0.008, t.dark)
    return eisen.parent_all(o, 'radiotower')
