"""Wildwuchs: weitere Baumarten (flora.tree.8+), Unterholz und Bodenbewuchs für eine dichte, natürliche Welt.

Bäume mit den Gartenwerk-Generatoren wie in flora.py, aber mehr Arten und Größen: Birken, Esskastanien, alte Eichen,
Rosskastanien, Walnuss, Obstbäume (Apfel, Birne, Kirsche, mit Früchten), Jungbäume. Die Reihenfolge der Indizes steht
in src/data/decor.ts (TREE_SPECIES) und darf nur hinten erweitert werden.

Unterholz (flora.<art>.<n>, Schatten im Bild bzw. kleine Schattenebene): Farne, hohes Gras, Wildblumen, Brombeeren und
Wildsträucher, Baumstümpfe, Totholz, Pilze. Bodenflecken (decal.<art>.<n>, von oben): Laubstreu, Nadelstreu, Moos,
Unkraut in Ritzen, Pfützen.
"""
import math
import random

import bmesh
import bpy
import eisen
import gw_ground
import gw_lib
import gw_plants

P = gw_lib.P
lin = gw_ground.lin
TAN = math.tan(eisen.TILT)

# (Art, Krone, Höhe, Laubfarbe, Frucht) – Index = 8 + Position
TREES = [
    ('betula-pendula', 3.4, 7.5, '#7d8a4e', None),
    ('betula-pendula', 2.8, 6.4, '#869352', None),
    ('betula-pendula', 3.8, 8.2, '#76844a', None),
    ('castanea-sativa', 6.4, 8.5, '#5a6b3e', None),
    ('castanea-sativa', 5.6, 7.6, '#617141', None),
    ('quercus-rubra', 7.4, 9.5, '#56683f', None),
    ('quercus-rubra', 6.8, 8.8, '#5d6c42', None),
    ('aesculus-hippocastanum', 5.8, 8.6, '#5a6e40', None),
    ('aesculus-hippocastanum', 5.0, 7.8, '#617443', None),
    ('juglans-regia', 6.0, 7.4, '#66774a', None),
    ('malus-topaz', 3.8, 4.4, '#6b7c48', '#a8402a'),
    ('malus-topaz', 3.4, 4.0, '#728248', '#b8902e'),
    ('pyrus-communis', 3.2, 5.4, '#68784a', '#a89a3a'),
    ('prunus-avium', 4.0, 5.6, '#647445', '#7a1e22'),
    ('acer-campestre', 2.4, 3.6, '#7a8a4c', None),
    ('carpinus-betulus', 2.2, 3.4, '#728548', None),
]

SHRUBS = [
    # Brombeeren, Himbeeren, Johannisbeeren, Wildrose, Hartriegel, Flieder (verwildert)
    ('flora.bramble', [('rubus-idaeus', 1.8, 1.3, '#5d6e42', None, '#3a1630'),
                       ('rubus-idaeus', 1.5, 1.0, '#66763f', None, '#2e1428'),
                       ('ribes', 1.4, 1.1, '#62743f', None, '#8a1a1a'),
                       ('rosa-shrub', 1.7, 1.4, '#5a6c3e', '#d8a0a8', None)]),
    ('flora.thicket', [('cornus', 2.4, 2.2, '#5f6f44', None, None),
                       ('syringa', 2.6, 2.6, '#617146', '#9a84b8', None),
                       ('forsythia', 2.2, 2.0, '#6c7c46', None, None),
                       ('viburnum', 2.4, 2.0, '#58693f', '#e0dcc8', None)]),
]

PERENNIALS = [
    ('flora.fern', [('dryopteris', 1.1, 0.8, '#5b7442', None), ('dryopteris', 0.9, 0.65, '#647c46', None),
                    ('dryopteris', 1.3, 0.95, '#56703f', None), ('dryopteris', 0.8, 0.55, '#6c8248', None)]),
    ('flora.wild', [('achillea', 0.7, 0.7, '#7a8a52', '#e8e2cc'), ('rudbeckia', 0.8, 0.8, '#6a7c46', '#d8a028'),
                    ('echinacea', 0.7, 0.8, '#66783f', '#b06080'), ('salvia', 0.6, 0.6, '#6c7e4c', '#6a58a0'),
                    ('geranium', 0.7, 0.4, '#6a8048', '#9a7ab8'), ('phlox', 0.7, 0.8, '#6c7e48', '#e8e0e8')]),
]

GRASSES = [
    ('calamagrostis', 0.8, 1.2, '#9a9258'), ('stipa', 0.9, 0.9, '#a8a06a'), ('miscanthus', 1.1, 1.5, '#8a8a52'),
    ('carex', 0.7, 0.5, '#76804a'), ('pennisetum', 0.8, 0.8, '#9c9460'), ('calamagrostis', 0.6, 0.9, '#a39a5c'),
]


def plant_canvas(d, h):
    w = d + 1.0
    top = d / 2 + h * TAN + 0.3
    bottom = d / 2 + 0.4
    cw, ch = math.ceil(w * 2) / 2, math.ceil((top + bottom) * 2) / 2
    return (cw, ch), ((d / 2 + 0.5) / cw, top / ch)


def shadow(out, name, d, h, half=None):
    sw = math.ceil((d + 1 + h * 0.6) * 2) / 2
    sh = math.ceil((d + 1 + h * 0.75) * 2) / 2
    eisen.shadow_render(out, f'{name}.shadow', 'flora', (sw, sh), ((d / 2 + 0.5) / sw, (d / 2 + 0.5) / sh),
                        half=h > 3 if half is None else half)


def bark(tone='#4a3b2c'):
    return gw_ground.pmat(f'ww_bark{tone}', lin(tone), 0.92, 0.35, 0.9, 14)


def moss():
    return gw_ground.pmat('ww_moss', lin('#4f5f32'), 0.95, 0.3, 0.8, 30)


def tufts(rnd, n, r0, r1, hmin=0.06, hmax=0.2):
    bm = bmesh.new()
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(r0, r1)
        gw_ground.blade(bm, math.cos(a) * rr, math.sin(a) * rr, 0, rnd.uniform(hmin, hmax), a + rnd.uniform(-0.5, 0.5),
                        rnd.uniform(0.3, 0.8), 0.006, k % 3)
    gm = bpy.data.meshes.new('gr')
    bm.to_mesh(gm)
    bm.free()
    go = gw_lib.link(bpy.data.objects.new('gr', gm), outline=False)
    for h_ in ('#a89a5e', '#8f8c4c', '#7c8243'):
        go.data.materials.append(gw_ground.pmat(f'g{h_}', lin(h_), 0.65, 0.12, 0.0, 10, 0.3, 0.6))
    return go


def stump(v):
    rnd = random.Random(4100 + v)
    r = [0.32, 0.26, 0.4, 0.22][v]
    h = [0.45, 0.3, 0.55, 0.7][v]
    b = bark(['#4a3b2c', '#5a4a36', '#3e3226', '#6a6050'][v])
    eisen.cylinder('st', r, h, (0, 0, h / 2), b, segments=14)
    ring = gw_ground.pmat('ww_ring', lin('#9a7a50' if v != 3 else '#5a4a3a'), 0.85, 0.4, 0.6, 40)
    eisen.cylinder('top', r * 0.92, 0.02, (0, 0, h + 0.005), ring, segments=14)
    for k in range(5):  # Wurzelanläufe
        a = k / 5 * math.tau + rnd.uniform(-0.3, 0.3)
        eisen.box(f'w{k}', (r * 0.9, r * 0.35, r * 0.3), (math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, r * 0.12), b,
                  rot=(0, -0.35, a))
    if v in (0, 2):
        eisen.cylinder('moss', r * 1.02, h * 0.35, (0, 0, h * 0.18), moss(), segments=14)
    if v == 1:  # Pilze am Stumpf
        cap = gw_ground.pmat('ww_cap', lin('#b08a5a'), 0.7, 0.3, 0.4, 30)
        for k in range(5):
            a = rnd.uniform(0, math.tau)
            eisen.cylinder(f'p{k}', 0.06, 0.02, (math.cos(a) * r, math.sin(a) * r, rnd.uniform(0.08, 0.25)), cap, segments=10)
    tufts(rnd, 260, r * 0.9, r * 1.8)


def deadwood(v):
    """Liegendes Totholz: Äste und Reisig."""
    rnd = random.Random(4200 + v)
    b = bark(['#4a3b2c', '#5a4a36', '#6a5c48'][v])
    for k in range(3 + v * 2):
        L = rnd.uniform(0.6, 1.6)
        r = rnd.uniform(0.025, 0.07)
        a = rnd.uniform(0, math.pi)
        x, y = rnd.uniform(-0.4, 0.4), rnd.uniform(-0.25, 0.25)
        eisen.cylinder(f'a{k}', r, L, (x, y, r), b, segments=8, rot=(math.pi / 2, 0, a))
        for j in range(2):  # Zweige
            t = rnd.uniform(-0.4, 0.4) * L
            eisen.cylinder(f'z{k}{j}', r * 0.4, L * 0.3, (x + math.cos(a + math.pi / 2) * t * 0.1 + math.sin(a) * t,
                                                         y + math.cos(a) * t, r * 1.2), b, segments=6,
                           rot=(math.pi / 2, 0, a + rnd.uniform(0.5, 1.0)))
    tufts(rnd, 200, 0.1, 0.8, 0.05, 0.14)


def mushrooms(v):
    rnd = random.Random(4300 + v)
    tone = ['#c8b090', '#a8402a', '#8a6a42'][v]
    cap = gw_ground.pmat(f'ww_cap{v}', lin(tone), 0.6, 0.4, 0.5, 30)
    stem = gw_ground.pmat('ww_stem', lin('#e0d8c0'), 0.7, 0.2, 0.2, 30)
    dots = gw_ground.pmat('ww_dot', lin('#f0ece0'), 0.6, 0.1, 0.1, 30)
    for k in range(rnd.randint(4, 8)):
        x, y = rnd.gauss(0, 0.16), rnd.gauss(0, 0.16)
        hh = rnd.uniform(0.05, 0.12)
        eisen.cylinder(f's{k}', 0.012, hh, (x, y, hh / 2), stem, segments=6)
        c = eisen.cylinder(f'c{k}', rnd.uniform(0.03, 0.055), 0.025, (x, y, hh), cap, segments=12)
        c.scale.z = 1.4
        if v == 1:
            eisen.cylinder(f'd{k}', 0.008, 0.01, (x + 0.01, y, hh + 0.02), dots, segments=6)
    tufts(rnd, 140, 0.0, 0.35, 0.04, 0.1)


def litter(kind, v):
    """Bodenflecken von oben: Laubstreu, Nadelstreu, Moos, Unkraut in Ritzen, Pfütze."""
    rnd = random.Random(4400 + v + 17 * len(kind))
    o = []
    if kind == 'litter':
        base = gw_ground.pmat('ww_soil', lin('#3e3224'), 0.95, 0.5, 0.8, 18)
        o.append(eisen.cylinder('b', 0.46, 0.003, (0, 0, 0.0015), base, segments=24))
        mats = [gw_ground.pmat(f'ww_lf{i}', lin(c), 0.9, 0.4, 0.6, 30)
                for i, c in enumerate(('#6a5432', '#7a6236', '#55462c', '#6a6a3a', '#8a6a3a'))]
        for k in range(120):
            rr = 0.42 * math.sqrt(rnd.random())
            a = rnd.uniform(0, math.tau)
            o.append(eisen.box(f'l{k}', (0.05, 0.035, 0.003), (math.cos(a) * rr, math.sin(a) * rr, 0.004 + k * 0.00005),
                               rnd.choice(mats), rot=(0, 0, rnd.uniform(0, 3))))
    elif kind == 'needles':
        base = gw_ground.pmat('ww_needle', lin('#5a3e26'), 0.95, 0.5, 0.8, 40)
        o.append(eisen.cylinder('b', 0.46, 0.003, (0, 0, 0.0015), base, segments=24))
        cone = gw_ground.pmat('ww_cone', lin('#6a4a2a'), 0.9, 0.4, 0.6, 30)
        for k in range(8):
            rr = 0.38 * math.sqrt(rnd.random())
            a = rnd.uniform(0, math.tau)
            c = eisen.cylinder(f'z{k}', 0.02, 0.06, (math.cos(a) * rr, math.sin(a) * rr, 0.02), cone, segments=8,
                               rot=(math.pi / 2, 0, rnd.uniform(0, 3)))
            o.append(c)
    elif kind == 'moss':
        mats = [gw_ground.pmat(f'ww_ms{i}', lin(c), 0.95, 0.4, 0.8, 40) for i, c in enumerate(('#4a5a2e', '#5a6a34', '#3e4e28'))]
        for k in range(14):
            rr = 0.3 * math.sqrt(rnd.random())
            a = rnd.uniform(0, math.tau)
            o.append(eisen.cylinder(f'm{k}', rnd.uniform(0.06, 0.18), 0.01, (math.cos(a) * rr, math.sin(a) * rr, 0.005),
                                    rnd.choice(mats), segments=12))
    elif kind == 'weeds':
        go = tufts(rnd, 240, 0.0, 0.28, 0.03, 0.12)
        o.append(go)
        crack = gw_ground.pmat('ww_crack', lin('#26221e'), 0.95, 0.3, 0.6, 20)
        for k in range(5):
            o.append(eisen.box(f'c{k}', (rnd.uniform(0.15, 0.4), 0.012, 0.002),
                               (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0.001), crack, rot=(0, 0, rnd.uniform(0, 3))))
    else:  # puddle
        water = gw_ground.pmat('ww_water', lin('#3a4248'), 0.05, 0.1, 0.1, 10)
        mud = gw_ground.pmat('ww_mud', lin('#3a2e22'), 0.9, 0.4, 0.6, 30)
        o.append(eisen.cylinder('m', 0.44, 0.003, (0, 0, 0.0015), mud, segments=24))
        for k in range(3 + v):
            o.append(eisen.cylinder(f'w{k}', rnd.uniform(0.12, 0.3), 0.004, (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0.003),
                                    water, segments=20))
    return o


def render(out):
    # Bäume (fällbar über die Simulation, Index ab 8)
    for i, (sid, d, h, col, fruit) in enumerate(TREES):
        eisen.reset(samples=40)
        sp = {'id': sid, 'kind': 'tree', 'diameterMature': d, 'heightMature': h}
        gw_plants.tree(sp, {'color': col, 'bare': False, 'bloom': None, 'fruit': fruit}, 2100 + i * 13)
        canvas, anchor = plant_canvas(d, h)
        eisen.camera(*canvas, anchor=anchor)
        name = f'flora.tree.{8 + i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h)

    for prefix, items in SHRUBS:
        for i, (sid, d, h, col, bloom, fruit) in enumerate(items):
            eisen.reset(samples=40)
            sp = {'id': sid, 'kind': 'shrub', 'diameterMature': d, 'heightMature': h}
            gw_plants.shrub(sp, {'color': col, 'bare': False, 'bloom': bloom, 'fruit': fruit}, 2400 + i * 7 + len(prefix))
            canvas, anchor = plant_canvas(d, h)
            eisen.camera(*canvas, anchor=anchor)
            name = f'{prefix}.{i}'
            out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
            shadow(out, name, d, h, half=False)

    for prefix, items in PERENNIALS:
        for i, (sid, d, h, col, bloom) in enumerate(items):
            eisen.reset(samples=32)
            sp = {'id': sid, 'kind': 'perennial', 'diameterMature': d, 'heightMature': h}
            gw_plants.perennial(sp, {'color': col, 'bare': False, 'bloom': bloom, 'fruit': None}, 2600 + i * 5 + len(prefix))
            canvas, anchor = plant_canvas(d, h)
            eisen.camera(*canvas, anchor=anchor)
            name = f'{prefix}.{i}'
            out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
            shadow(out, name, d, h, half=False)

    for i, (sid, d, h, col) in enumerate(GRASSES):
        eisen.reset(samples=32)
        sp = {'id': sid, 'kind': 'grass', 'diameterMature': d, 'heightMature': h}
        gw_plants.grass(sp, {'color': col, 'bare': False, 'bloom': '#c8b88a' if i % 2 == 0 else None, 'fruit': None}, 2800 + i)
        canvas, anchor = plant_canvas(d, h)
        eisen.camera(*canvas, anchor=anchor)
        name = f'flora.tallgrass.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h, half=False)

    for prefix, fn, n, d, h in (('flora.stump', stump, 4, 1.2, 0.7), ('flora.deadwood', deadwood, 3, 1.8, 0.3),
                                ('flora.mushroom', mushrooms, 3, 0.8, 0.2)):
        for v in range(n):
            eisen.reset(samples=32)
            fn(v)
            canvas, anchor = plant_canvas(d, h)
            eisen.camera(*canvas, anchor=anchor)
            name = f'{prefix}.{v}'
            out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
            shadow(out, name, d, h, half=False)

    for kind in ('litter', 'needles', 'moss', 'weeds', 'puddle'):
        for v in range(3):
            name = f'decal.{kind}.{v}'
            eisen.reset(samples=16, ground=False)
            litter(kind, v)
            eisen.camera(1.0, 1.0, tilt=0.0)
            out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
