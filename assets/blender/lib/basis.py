"""Basis und Plündern (eigene Entwürfe für „Letzte Schicht“): Schrotthaufen, Lagerfeuer, Feuerschale, Scheinwerfer,
Wachturm, Sammelstelle, Versorgungsabwurf mit Fallschirm, Requisiten (Zaun, Heuballen, Ortsschild, Holzmast,
Straßenlaterne), Sammler-Ausrüstung und Rucksack. Ursprung = Mitte der Grundfläche, x Osten, y Norden."""
import math
import random

import bauten
import bmesh
import eisen
import gw_ground
import kit
import truemmer

lin = gw_ground.lin
W = bauten.weathered


def _wood(name, hex_='#6a5238'):
    return gw_ground.pmat(name, lin(hex_), 0.9, 0.4, 0.6, 26)


def _cloth(name, hex_):
    return W(name, hex_, metal=0.0, rough=0.95, rust=0.2, dust=0.35, edge=0.0, grime=0.4, streaks=0.4)


def _offset(objs, dz):
    for o in objs:
        if o.parent is None:
            o.location.z += dz


# --------------------------------------------------------------------------- Schrotthaufen

def _mound(name, rx, ry, h, mat, seed):
    """Flacher Erd-/Schutthügel (Ellipsoid, unregelmäßig)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in bm.verts:
        k = 1 + (rnd.random() - 0.5) * 0.25
        v.co.x *= rx * k
        v.co.y *= ry * k
        v.co.z = max(0.0, v.co.z) * h * k
    o = eisen.mesh_obj(name, bm, mat, smooth=True)
    return o


def _logs(o, rnd, w, d, layers, wood_mats, end_mat):
    """Holzstapel: Stämme quer, Schnittflächen hell."""
    for layer in range(layers):
        n = 6 - layer
        for i in range(n):
            x = -w / 2 + (i + 0.5 + layer * 0.5) * (w / 6.5)
            z = 0.1 + layer * 0.16
            r = rnd.uniform(0.07, 0.095)
            o.append(eisen.cylinder(f'log{layer}{i}', r, d, (x, rnd.uniform(-0.03, 0.03), z), rnd.choice(wood_mats), segments=10,
                                    rot=(math.pi / 2, 0, rnd.uniform(-0.05, 0.05))))
            for s in (-1, 1):
                o.append(eisen.cylinder(f'end{layer}{i}{s}', r * 0.92, 0.01, (x, s * d / 2, z), end_mat, segments=10, rot=(math.pi / 2, 0, 0)))


def pile(kind, variant=0, fill=1.0):
    """Schrotthaufen der Art kind (scrap, rubble, coal, wood, parts, ewaste); fill < 1: halb ausgeschlachtet."""
    rnd = random.Random(hash(kind) % 1000 + variant * 17)
    m = truemmer.Mats(f'h{kind[:2]}{variant}')
    o = []
    if kind == 'wood':
        wm = [_wood('pw_a', '#5e4a32'), _wood('pw_b', '#6b5338'), _wood('pw_c', '#4f3e2a')]
        endm = _wood('pw_end', '#a88a5e')
        _logs(o, rnd, 1.8, 0.85, 3 if fill > 0.6 else 1, wm, endm)
        for s in (-1, 1):
            o.append(eisen.cylinder(f'stake{s}', 0.03, 0.6, (s * 0.92, 0, 0.3), wm[0], segments=6))
        return eisen.parent_all(o, 'woodpile')
    ground = {'scrap': '#3f3228', 'rubble': '#5a5348', 'coal': '#24201c', 'parts': '#3a3029', 'ewaste': '#36302a'}[kind]
    o.append(_mound('mound', 0.9, 0.85, 0.22 * fill + 0.04, gw_ground.pmat('pm_g', lin(ground), 0.95, 0.4, 0.7, 18), rnd.randint(0, 999)))
    res = {'scrap': 'iron-ore', 'rubble': 'stone', 'coal': 'coal', 'parts': 'iron-ore', 'ewaste': 'copper-ore'}[kind]
    n = int((30 if kind != 'coal' else 38) * (0.45 + 0.55 * fill))
    pieces = truemmer.pieces(res, m, rnd, n, 0.85, size=(0.13, 0.24), foreign=0.12)
    # auf den Hügel heben: höher zur Mitte
    for p in pieces:
        if p.parent is None:
            r = math.hypot(p.location.x / 0.95, p.location.y / 0.9)
            p.location.z += max(0.0, (0.22 * fill) * (1 - r * r))
    o.extend(pieces)
    if kind == 'parts':
        tire = W('pm_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)
        for i in range(3 if fill > 0.6 else 1):
            o.append(eisen.cylinder(f'tire{i}', 0.22, 0.12, (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0.1 + i * 0.12), tire, segments=16,
                                    rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0)))
        door = W('pm_door', rnd.choice(('#6e2f26', '#3f5560', '#8a7a3e')), metal=0.5, rough=0.6, rust=0.7, dust=0.4, edge=0.7)
        o.append(eisen.box('door', (0.7, 0.04, 0.45), (0.3, 0.45, 0.25 * fill + 0.05), door, bevel=0.02, rot=(1.25, 0.1, rnd.uniform(0, 3))))
    if kind == 'ewaste':
        case = W('pm_case', '#8a8478', metal=0.1, rough=0.6, rust=0.2, dust=0.5, edge=0.6)
        screen = eisen.material('pm_scr', (0.02, 0.025, 0.03), rough=0.15)
        for i in range(3 if fill > 0.6 else 1):
            x, y = rnd.uniform(-0.55, 0.55), rnd.uniform(-0.5, 0.5)
            z = 0.12 + (0.2 * fill) * (1 - (x * x + y * y))
            a = rnd.uniform(-0.6, 0.6)
            o.append(eisen.box(f'tv{i}', (0.36, 0.3, 0.28), (x, y, z), case, bevel=0.03, rot=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), a)))
            o.append(eisen.box(f'scr{i}', (0.26, 0.01, 0.2), (x + math.sin(a) * 0.15, y - math.cos(a) * 0.15, z), screen, rot=(0, 0, a)))
    return eisen.parent_all(o, 'pile')


# --------------------------------------------------------------------------- Feuer

def _flames(o, x, y, z, size, lit, rnd):
    """Flammenzungen (leuchtend) bzw. Glut."""
    if lit <= 0:
        ember = eisen.material('fl_ember', (0.05, 0.02, 0.01), rough=0.9)
        o.append(eisen.cylinder('ember', size * 0.7, 0.03, (x, y, z), ember, segments=12))
        return
    core = kit.glow('fl_core', '#ffd27a', 18 * lit)
    outer = kit.glow('fl_out', '#ff7a2a', 9 * lit)
    o.append(eisen.cylinder('glowbed', size * 0.75, 0.03, (x, y, z), kit.glow('fl_bed', '#ff5a1a', 6 * lit), segments=12))
    for i in range(6):
        a = i / 6 * math.tau + rnd.uniform(-0.3, 0.3)
        r = size * rnd.uniform(0.15, 0.45)
        h = size * rnd.uniform(0.9, 1.5)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=size * 0.22, radius2=0.0, depth=h)
        f = eisen.mesh_obj(f'flame{i}', bm, outer if i % 2 else core, smooth=True)
        f.location = (x + math.cos(a) * r, y + math.sin(a) * r, z + h / 2)
        f.rotation_euler = (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0)
        o.append(f)


def campfire(m=None, lit=0.0):
    """Lagerfeuer 2×2: Steinring, aufgeschichtete Scheite, Sitzbalken, Kochtopf am Dreibein."""
    rnd = random.Random(5)
    o = []
    stone = [gw_ground.pmat(f'cf_s{i}', lin(h), 0.9, 0.4, 0.6, 20) for i, h in enumerate(('#77706a', '#625c55', '#8a8278'))]
    for i in range(12):
        a = i / 12 * math.tau
        o.append(eisen.rock(f'ring{i}', rnd.uniform(0.11, 0.15), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.06), rnd.choice(stone), 40 + i, squash=0.7, detail=1))
    ash = gw_ground.pmat('cf_ash', lin('#2a2622'), 1.0, 0.3, 0.6, 30)
    o.append(eisen.cylinder('ash', 0.42, 0.02, (0, 0, 0.01), ash, segments=18))
    wood = _wood('cf_log', '#4f3a26')
    char = gw_ground.pmat('cf_char', lin('#1c1612'), 0.95, 0.3, 0.6, 30)
    for i in range(5):
        a = i / 5 * math.tau
        o.append(bauten.beam(f'log{i}', (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.04), (math.cos(a) * 0.04, math.sin(a) * 0.04, 0.32),
                             (0.08, 0.08), char if lit > 0 else wood))
    _flames(o, 0, 0, 0.06, 0.32, lit, rnd)
    # Sitzbalken und Kochgestell
    for s in (-1, 1):
        o.append(eisen.cylinder(f'seat{s}', 0.1, 1.0, (s * 0.85, 0.15 * s, 0.1), wood, segments=10, rot=(math.pi / 2, 0, 0.2 * s)))
    t = kit.Tier(1, prefix='cf')
    for i in range(3):
        a = i / 3 * math.tau + 0.3
        o.append(bauten.beam(f'tri{i}', (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.0), (0, 0, 0.85), (0.03, 0.03), t.metal))
    o.append(eisen.cylinder('pot', 0.13, 0.16, (0, 0, 0.55), t.dark, segments=14))
    return eisen.parent_all(o, 'campfire')


def brazier(m=None, lit=0.0):
    """Feuerschale 1×1: Fass mit Luftlöchern auf drei Beinen, Feuer obenauf."""
    t = kit.Tier(1, prefix='br')
    o = []
    for i in range(3):
        a = i / 3 * math.tau
        o.append(bauten.beam(f'leg{i}', (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.0), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.3), (0.04, 0.04), t.metal))
    o.append(eisen.cylinder('drum', 0.26, 0.42, (0, 0, 0.5), t.panels[1], segments=16))
    o.append(eisen.cylinder('rim', 0.27, 0.03, (0, 0, 0.71), t.metal, segments=16))
    hole = kit.glow('br_hole', '#ff7a2a', 6 * lit) if lit > 0 else eisen.material('br_holeoff', (0.02, 0.015, 0.01), rough=0.9)
    for i in range(8):
        a = i / 8 * math.tau
        o.append(eisen.cylinder(f'hole{i}', 0.035, 0.02, (math.cos(a) * 0.262, math.sin(a) * 0.262, 0.45), hole, segments=8, rot=(math.pi / 2, 0, a + math.pi / 2)))
    _flames(o, 0, 0, 0.7, 0.22, lit, random.Random(3))
    return eisen.parent_all(o, 'brazier')


def floodlight(m=None, lit=0.0):
    """Scheinwerfer 1×1: Gittermast mit zwei Strahlern, Kabelkasten."""
    t = kit.Tier(2, accent='#5f6048', prefix='fl')
    o = []
    o.append(eisen.box('foot', (0.5, 0.5, 0.1), (0, 0, 0.05), t.frame, bevel=0.02))
    o.append(eisen.cylinder('pole', 0.05, 1.6, (0, 0, 0.85), t.metal, segments=10))
    o.append(eisen.box('box', (0.2, 0.12, 0.25), (0, -0.1, 0.4), t.panels[0], bevel=0.02))
    o.append(eisen.box('bar', (0.6, 0.06, 0.06), (0, 0, 1.62), t.frame))
    lens = kit.glow('fl_lens', '#fff6e0', 25 * lit) if lit > 0 else eisen.material('fl_lensoff', eisen.srgb('#c8c4b4'), rough=0.1, metal=0.3)
    for s in (-1, 1):
        o.append(eisen.box(f'head{s}', (0.22, 0.22, 0.18), (s * 0.22, -0.04, 1.62), t.panels[0], bevel=0.03, rot=(0.5, 0, 0)))
        o.append(eisen.cylinder(f'lens{s}', 0.085, 0.02, (s * 0.22, -0.155, 1.57), lens, segments=14, rot=(math.pi / 2 + 0.5, 0, 0)))
    return eisen.parent_all(o, 'floodlight')


# --------------------------------------------------------------------------- Wachturm

def watchtower_base(m=None):
    """Wachturm 2×2: Holzgerüst mit Leiter, Plattform mit Sandsäcken, Wellblechdach."""
    rnd = random.Random(9)
    wood = _wood('wt_wood', '#5e4a32')
    wood2 = _wood('wt_wood2', '#6b5338')
    sand = _cloth('wt_sand', '#8a7d5a')
    t = kit.Tier(1, prefix='wt')
    o = []
    H = 1.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(bauten.beam(f'post{sx}{sy}', (sx * 0.8, sy * 0.8, 0.0), (sx * 0.68, sy * 0.68, H), (0.1, 0.1), wood))
    for k, z in enumerate((0.45, 1.0)):
        for sx, sy, ex, ey in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            r = 0.8 - z * 0.08
            o.append(bauten.beam(f'brace{k}{sx}{sy}', (sx * r, sy * r, z), (ex * r, ey * r, z + 0.3), (0.05, 0.05), wood2))
    o.append(eisen.box('deck', (1.6, 1.6, 0.08), (0, 0, H), wood2, bevel=0.01))
    for i in range(7):
        o.append(eisen.box(f'plank{i}', (1.6, 0.21, 0.02), (0, -0.68 + i * 0.226, H + 0.05), rnd.choice((wood, wood2)), bevel=0.004))
    # Sandsäcke ringsum (Lücke für den Schützen)
    for side in range(4):
        for i in range(5):
            a = -0.62 + i * 0.31
            x, y = ((a, -0.72), (0.72, a), (-a, 0.72), (-0.72, -a))[side]
            for layer in range(2):
                o.append(eisen.box(f'sb{side}{i}{layer}', (0.3 if side % 2 == 0 else 0.16, 0.16 if side % 2 == 0 else 0.3, 0.12),
                                   (x, y, H + 0.12 + layer * 0.11), sand, bevel=0.04, rot=(0, 0, rnd.uniform(-0.1, 0.1))))
    # Leiter an der Südseite
    for s in (-1, 1):
        o.append(bauten.beam(f'rail{s}', (s * 0.16, -0.95, 0.0), (s * 0.16, -0.8, H), (0.04, 0.04), wood))
    for i in range(6):
        z = 0.2 + i * 0.22
        o.append(eisen.box(f'rung{i}', (0.32, 0.04, 0.03), (0, -0.95 + z * 0.1, z), wood2))
    # Dach auf vier Stangen
    for sx in (-1, 1):
        for sy in (0, 1):
            o.append(eisen.cylinder(f'rp{sx}{sy}', 0.03, 0.9, (sx * 0.7, sy * 0.75, H + 0.45), t.metal, segments=8))
    o.append(kit.corrugated('roof', 1.8, 0.9, 6, 0.04, (0, 0.45, H + 0.93), t.corr, rot=(0.12, 0, 0)))
    return eisen.parent_all(o, 'watchtower')


def watchtower_head(m=None):
    """Schütze auf dem Turm (Blick nach +Y): Helm, Schultern, Gewehr auf den Sandsäcken."""
    t = kit.Tier(2, prefix='wh')
    coat = _cloth('wh_coat', '#4f5541')
    skin = W('wh_skin', '#b08a6a', metal=0.0, rough=0.7, rust=0.0, dust=0.1, edge=0.0)
    o = []
    H = 1.62
    o.append(eisen.box('torso', (0.36, 0.24, 0.32), (0, -0.05, H + 0.2), coat, bevel=0.06))
    o.append(eisen.cylinder('head', 0.1, 0.16, (0, -0.02, H + 0.45), skin, segments=12))
    o.append(eisen.cylinder('helmet', 0.13, 0.08, (0, -0.02, H + 0.53), t.panels[0], segments=14, bevel=0.03))
    for s in (-1, 1):
        o.append(bauten.beam(f'arm{s}', (s * 0.2, -0.02, H + 0.3), (s * 0.08, 0.32, H + 0.24), (0.08, 0.08), coat))
    o.append(eisen.box('stock', (0.06, 0.25, 0.08), (0.05, 0.12, H + 0.25), _wood('wh_stock', '#5a4630')))
    o.append(eisen.cylinder('barrel', 0.022, 0.8, (0.05, 0.6, H + 0.27), t.metal, segments=8, rot=(math.pi / 2, 0, 0)))
    o.append(eisen.box('scope', (0.04, 0.14, 0.04), (0.05, 0.3, H + 0.33), t.dark))
    return eisen.parent_all(o, 'sentry')


# --------------------------------------------------------------------------- Sammelstelle

def scavenger_camp(m=None):
    """Sammelstelle 3×3: Planendach auf Stangen, Werkbank, sortierte Haufen, Schubkarren, Schild."""
    rnd = random.Random(21)
    t = kit.Tier(1, prefix='sc')
    wood = _wood('sc_wood', '#5e4a32')
    tarp = _cloth('sc_tarp', '#5a6a4a')
    m2 = truemmer.Mats('scm')
    o = []
    o.append(eisen.box('floor', (2.9, 2.9, 0.04), (0, 0, 0.02), gw_ground.pmat('sc_floor', lin('#4a4238'), 0.95, 0.4, 0.6, 20)))
    # Planendach (Nordhälfte) auf vier Stangen
    for sx in (-1, 1):
        for sy in (0, 1):
            o.append(eisen.cylinder(f'pole{sx}{sy}', 0.04, 1.2 - sy * 0.15, (sx * 1.3, 0.65 + sy * 0.7, 0.6 - sy * 0.07), wood, segments=8))
    o.append(eisen.box('tarp', (2.8, 0.75, 0.02), (0, 1.0, 1.1), tarp, rot=(-0.18, 0, 0)))
    # Werkbank unter dem Dach
    o.append(eisen.box('bench', (1.4, 0.5, 0.06), (-0.4, 0.95, 0.55), wood, bevel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.box(f'bl{sx}{sy}', (0.06, 0.06, 0.52), (-0.4 + sx * 0.62, 0.95 + sy * 0.2, 0.26), wood))
    o.append(eisen.box('vise', (0.15, 0.12, 0.12), (-1.0, 0.95, 0.64), t.metal, bevel=0.01))
    o.append(eisen.box('toolbox', (0.35, 0.2, 0.16), (0.1, 0.95, 0.66), t.accent, bevel=0.02))
    # sortierte Haufen vorn: Schrott, Kupfer, Schutt
    for i, (res, x) in enumerate((('iron-ore', -0.9), ('copper-ore', 0.0), ('stone', 0.9))):
        ps = truemmer.pieces(res, m2, random.Random(30 + i), 9, 0.35, size=(0.07, 0.11), foreign=0.0)
        for p in ps:
            if p.parent is None:
                p.location.x += x
                p.location.y += -0.75
        o.extend(ps)
    # Schubkarre
    o.append(eisen.box('cart', (0.5, 0.36, 0.2), (1.05, 0.3, 0.32), t.panels[2], bevel=0.04, rot=(0, 0.15, 0.4)))
    o.append(eisen.cylinder('wheel', 0.12, 0.05, (1.3, 0.42, 0.12), t.dark, segments=12, rot=(math.pi / 2, 0, 0.4)))
    # Schild auf einem Pfahl
    o.append(eisen.cylinder('signpost', 0.035, 1.0, (1.3, -1.25, 0.5), wood, segments=8))
    o.append(eisen.box('sign', (0.6, 0.04, 0.3), (1.3, -1.28, 0.92), t.panels[3], bevel=0.01))
    o.append(eisen.box('signtxt', (0.45, 0.01, 0.06), (1.3, -1.305, 0.92), eisen.material('sc_txt', eisen.srgb('#e0d8c0'), rough=0.6)))
    return eisen.parent_all(o, 'scavcamp')


# --------------------------------------------------------------------------- Versorgungsabwurf

def airdrop_crate(m=None):
    """Abwurfkiste 2×2: olivgrüne Kiste mit Gurten, schlaffer Fallschirm daneben."""
    body = W('ad_body', '#4a5238', metal=0.4, rough=0.6, rust=0.2, dust=0.3, edge=0.6, streaks=0.3)
    strap = W('ad_strap', '#1f201c', metal=0.0, rough=0.8, rust=0.0, dust=0.3, edge=0.2)
    mark = eisen.material('ad_mark', eisen.srgb('#d8d0b0'), rough=0.6)
    chute = _cloth('ad_chute', '#a8452a')
    o = [eisen.box('crate', (1.2, 1.0, 0.8), (-0.15, 0.05, 0.4), body, bevel=0.04)]
    for s in (-1, 1):
        o.append(eisen.box(f'strap{s}', (0.08, 1.04, 0.84), (-0.15 + s * 0.32, 0.05, 0.4), strap))
    o.append(eisen.box('cross1', (0.4, 0.1, 0.005), (-0.15, 0.05, 0.803), mark))
    o.append(eisen.box('cross2', (0.1, 0.4, 0.005), (-0.15, 0.05, 0.803), mark))
    # Fallschirm als zerknitterte Tuchbahn
    rnd = random.Random(7)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=10, y_segments=6, size=0.5)
    for v in bm.verts:
        v.co.x *= 1.6
        v.co.y *= 1.0
        v.co.z = 0.03 + rnd.uniform(0, 0.08) + 0.05 * math.sin(v.co.x * 9)
    c = eisen.mesh_obj('chute', bm, chute, smooth=True)
    c.location = (0.55, -0.55, 0.0)
    c.rotation_euler = (0, 0, 0.5)
    o.append(c)
    for i in range(4):
        kit.cable(o, f'line{i}', [(-0.15 + (i - 1.5) * 0.25, 0.45, 0.8), (0.3, -0.2, 0.3), (0.6 + i * 0.1, -0.6, 0.05)], 0.008, strap)
    return eisen.parent_all(o, 'airdrop')


def parachute(m=None):
    """Offener Fallschirm (für die Landung): Kappe mit Bahnen, Leinen nach unten (Kiste hängt darunter)."""
    a = _cloth('pc_a', '#b04a2a')
    b = _cloth('pc_b', '#d8cfb8')
    line = W('pc_line', '#2a2a28', metal=0.0, rough=0.8, rust=0.0, dust=0.0, edge=0.0)
    o = []
    n = 12
    R = 1.3
    for i in range(n):
        bm = bmesh.new()
        a0 = i / n * math.tau
        a1 = (i + 1) / n * math.tau
        verts = [bm.verts.new((0, 0, 2.6))]
        for k in range(1, 5):
            r = R * k / 4
            z = 2.6 - 0.9 * (k / 4) ** 2
            verts.append(bm.verts.new((math.cos(a0) * r, math.sin(a0) * r, z)))
            verts.append(bm.verts.new((math.cos(a1) * r, math.sin(a1) * r, z)))
        bm.faces.new((verts[0], verts[1], verts[2]))
        for k in range(3):
            i0 = 1 + k * 2
            bm.faces.new((verts[i0], verts[i0 + 2], verts[i0 + 3], verts[i0 + 1]))
        o.append(eisen.mesh_obj(f'gore{i}', bm, a if i % 2 else b, smooth=True))
    for i in range(6):
        ang = i / 6 * math.tau
        kit.cable(o, f'l{i}', [(math.cos(ang) * R, math.sin(ang) * R, 1.7), (0, 0, 0.5)], 0.01, line)
    return eisen.parent_all(o, 'chute')


# --------------------------------------------------------------------------- Requisiten

def fence(horizontal=True):
    """Maschendrahtzaun 1×1 (entlang x bzw. y): Pfosten, Spanndrähte, Geflecht, hier und da durchhängend."""
    t = kit.Tier(1, prefix='fe')
    mesh = W('fe_mesh', '#6f716c', metal=0.8, rough=0.5, rust=0.6, dust=0.3, edge=0.4)
    o = []
    o.append(eisen.cylinder('post', 0.035, 0.9, (-0.5, 0, 0.45), t.metal, segments=8))
    o.append(eisen.cylinder('post2', 0.035, 0.9, (0.5, 0, 0.45), t.metal, segments=8))
    for z in (0.15, 0.85):
        o.append(eisen.cylinder(f'wire{z}', 0.008, 1.0, (0, 0, z), t.metal, segments=6, rot=(0, math.pi / 2, 0)))
    for i in range(11):
        x = -0.5 + i * 0.1
        o.append(bauten.beam(f'dg{i}a', (x, 0, 0.15), (x + 0.1, 0, 0.85), (0.008, 0.008), mesh))
        o.append(bauten.beam(f'dg{i}b', (x + 0.1, 0, 0.15), (x, 0, 0.85), (0.008, 0.008), mesh))
    root = eisen.parent_all(o, 'fence')
    if not horizontal:
        root.rotation_euler = (0, 0, math.pi / 2)
    return root


def hay_bale(m=None):
    hay = gw_ground.pmat('hb_hay', lin('#b39a5a'), 0.95, 0.5, 0.8, 40)
    o = [eisen.cylinder('bale', 0.42, 0.8, (0, 0, 0.42), hay, segments=20, rot=(0, math.pi / 2, 0.3))]
    end = gw_ground.pmat('hb_end', lin('#9a8248'), 0.95, 0.5, 0.8, 60)
    o.append(eisen.cylinder('e1', 0.4, 0.01, (math.cos(0.3) * 0.4, math.sin(0.3) * 0.4, 0.42), end, segments=20, rot=(0, math.pi / 2, 0.3)))
    return eisen.parent_all(o, 'haybale')


def town_sign(m=None):
    """Ortsschild: gelbe Tafel mit dunklem Rand auf zwei Pfosten, schief, mit Schriftzug-Blöcken."""
    t = kit.Tier(1, prefix='ts')
    yellow = W('ts_yel', '#c9a22e', metal=0.4, rough=0.5, rust=0.4, dust=0.3, edge=0.6, streaks=0.6)
    black = eisen.material('ts_blk', eisen.srgb('#1e1d1b'), rough=0.6)
    o = []
    for s in (-1, 1):
        o.append(eisen.cylinder(f'post{s}', 0.03, 1.2, (s * 0.3, 0, 0.6), t.metal, segments=8))
    o.append(eisen.box('board', (0.9, 0.04, 0.45), (0, -0.04, 1.0), yellow, bevel=0.01, rot=(0, 0.06, 0)))
    o.append(eisen.box('rim', (0.92, 0.035, 0.47), (0, -0.03, 1.0), black, rot=(0, 0.06, 0)))
    for i in range(5):
        o.append(eisen.box(f'l{i}', (0.11, 0.01, 0.14), (-0.28 + i * 0.14, -0.065, 1.0 + i * 0.008), black, rot=(0, 0.06, 0)))
    return eisen.parent_all(o, 'townsign')


def utility_pole(m=None):
    """Holzmast mit Querträger, Isolatoren und durchhängenden Leitungsenden."""
    wood = _wood('up_wood', '#4f3e2a')
    ins = eisen.material('up_ins', eisen.srgb('#c8d0c8'), rough=0.2, metal=0.0)
    wire = W('up_wire', '#1a1a1a', metal=0.6, rough=0.5, rust=0.0, dust=0.0, edge=0.0)
    o = [eisen.cylinder('pole', 0.08, 2.6, (0, 0, 1.3), wood, segments=10)]
    o.append(eisen.box('arm', (0.9, 0.08, 0.08), (0, 0, 2.4), wood))
    for x in (-0.38, 0.0, 0.38):
        o.append(eisen.cylinder(f'ins{x}', 0.03, 0.08, (x, 0, 2.48), ins, segments=8))
        kit.cable(o, f'w{x}', [(x, 0, 2.52), (x, -0.4, 2.3), (x, -0.8, 2.25)], 0.01, wire)
    return eisen.parent_all(o, 'utilitypole')


def street_lamp(m=None):
    t = kit.Tier(2, prefix='sl')
    o = [eisen.box('foot', (0.24, 0.24, 0.1), (0, 0, 0.05), t.frame, bevel=0.02)]
    o.append(eisen.cylinder('pole', 0.045, 2.2, (0, 0, 1.1), t.metal, segments=10))
    o.append(bauten.beam('arm', (0, 0, 2.15), (0, -0.45, 2.25), (0.05, 0.05), t.metal))
    o.append(eisen.box('head', (0.22, 0.34, 0.08), (0, -0.55, 2.22), t.frame, bevel=0.02))
    o.append(eisen.box('glass', (0.16, 0.26, 0.02), (0, -0.55, 2.175), eisen.material('sl_gl', eisen.srgb('#5a6060'), rough=0.1)))
    return eisen.parent_all(o, 'streetlamp')


# --------------------------------------------------------------------------- Symbole

def scavenger_kit():
    """Sammler-Ausrüstung: Seesack mit Brecheisen und Handschuhen."""
    bag = _cloth('sk_bag', '#5a6a4a')
    steel = W('sk_steel', '#34495a', metal=0.8, rough=0.45, rust=0.4, dust=0.15, edge=0.7)
    o = [eisen.cylinder('bag', 0.24, 0.62, (0, 0, 0.24), bag, segments=16, rot=(0, math.pi / 2, 0.3))]
    o.append(eisen.cylinder('tie', 0.1, 0.06, (math.cos(0.3) * 0.33, math.sin(0.3) * 0.33, 0.24), _cloth('sk_tie', '#2a2a28'), segments=10, rot=(0, math.pi / 2, 0.3)))
    o.append(bauten.beam('bar', (-0.4, -0.3, 0.06), (0.35, 0.25, 0.5), (0.05, 0.05), steel))
    return eisen.parent_all(o, 'kit')


def backpack():
    pack = _cloth('bp_pack', '#6a5a3a')
    strap = _cloth('bp_strap', '#2e2a24')
    o = [eisen.box('body', (0.48, 0.3, 0.6), (0, 0, 0.32), pack, bevel=0.1)]
    o.append(eisen.box('pocket', (0.36, 0.1, 0.24), (0, -0.18, 0.24), pack, bevel=0.05))
    o.append(eisen.box('flap', (0.5, 0.32, 0.12), (0, 0.0, 0.62), strap, bevel=0.05, rot=(0.2, 0, 0)))
    o.append(eisen.cylinder('roll', 0.09, 0.5, (0, 0.05, 0.72), _cloth('bp_roll', '#4f5541'), segments=12, rot=(0, math.pi / 2, 0)))
    return eisen.parent_all(o, 'backpack')
