"""Flora und Findlinge (im Spiel nach y sortiert, Spieler läuft dahinter): Sträucher, Findlinge, Bäume.

Bäume und Sträucher mit den Gartenwerk-Generatoren (gw_plants.tree/shrub), in jungen, spieltauglichen
Größen (Krone 4–6 m). Bäume bekommen eine eigene Schattenebene (halbe Auflösung, im Spiel ×2);
Sträucher und Findlinge tragen ihren Schatten im Bild.
"""
import math
import random

import bmesh
import bpy
import eisen
import gw_ground
import gw_lib
import gw_plants
from mathutils import Euler

P = gw_lib.P
lin = gw_ground.lin
TAN = math.tan(eisen.TILT)

TREES = [
    # (Art, Krone, Höhe, Laubfarbe)
    ('acer-campestre', 4.6, 7, '#87985c'),
    ('carpinus-betulus', 4.4, 7.5, '#7c905a'),
    ('quercus-rubra', 5.4, 8, '#748954'),
    ('pinus-sylvestris', 4.4, 8.5, '#687b4d'),
]
SHRUBS = [
    ('viburnum', 2.0, 1.8, '#748958', 'shrub'),
    ('cornus', 2.2, 2.0, '#7f955d', 'shrub'),
    ('spiraea', 1.6, 1.2, '#849558', 'shrub'),
    ('laurocerasus', 2.0, 1.8, '#60784e', 'shrub'),
]


def plant_canvas(d, h, shadow_margin):
    """Bildgröße (Felder) und Anker (Stammfuß) für eine Pflanze mit Krone d und Höhe h."""
    w = d + 1.0 + shadow_margin
    top = d / 2 + h * TAN + 0.3
    bottom = d / 2 + 0.4 + shadow_margin
    hgt = top + bottom
    return (math.ceil(w * 2) / 2, math.ceil(hgt * 2) / 2), ((d / 2 + 0.5) / (math.ceil(w * 2) / 2), top / (math.ceil(hgt * 2) / 2))


def shadow(out, name, d, h, half=None):
    """Schattenebene: Sonne von links oben, Schatten fällt nach rechts unten (≈0,8 × Höhe)."""
    sw = math.ceil((d + 1 + h * 0.6) * 2) / 2
    sh = math.ceil((d + 1 + h * 0.75) * 2) / 2
    sa = ((d / 2 + 0.5) / sw, (d / 2 + 0.5) / sh)
    eisen.shadow_render(out, f'{name}.shadow', 'flora', (sw, sh), sa, half=h > 3 if half is None else half)


def render(out):
    # Sträucher
    for i, (sid, d, h, col, kind) in enumerate(SHRUBS):
        eisen.reset(samples=48)
        sp = {'id': sid, 'kind': kind, 'diameterMature': d, 'heightMature': h}
        gw_plants.shrub(sp, {'color': col, 'bare': False, 'bloom': None, 'fruit': None}, 700 + i)
        canvas, anchor = plant_canvas(d, h, 0.0)
        eisen.camera(*canvas, anchor=anchor)
        name = f'flora.shrub.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h)

    # Schilf und Rohrkolben am Ufer
    for i in range(4):
        eisen.reset(samples=48)
        rnd = random.Random(850 + i)
        sp = {'id': 'calamagrostis', 'kind': 'grass', 'diameterMature': 0.7 + 0.1 * (i % 2), 'heightMature': 1.0 + 0.2 * (i % 3)}
        gw_plants.grass(sp, {'color': ['#6f7a45', '#7a8049', '#66703f', '#858351'][i], 'bare': False, 'bloom': None, 'fruit': None}, 860 + i)
        head = gw_ground.pmat('cattail', lin('#5a3d24'), 0.8, 0.2, 0.3, 30)
        stalk = gw_ground.pmat('stalk', lin('#6d7344'), 0.7, 0.1, 0.0, 10)
        for k in range(rnd.randint(4, 8)):
            a = rnd.uniform(0, math.tau)
            r = rnd.uniform(0.0, 0.25)
            x, y = math.cos(a) * r, math.sin(a) * r
            hgt = rnd.uniform(1.0, 1.45)
            lean = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08))
            st = eisen.cylinder(f'st{k}', 0.006, hgt, (x + lean[0] / 2, y + lean[1] / 2, hgt / 2), stalk, segments=6)
            st.rotation_euler = (lean[1] * -1.2, lean[0] * 1.2, 0)
            eisen.cylinder(f'hd{k}', 0.022, 0.16, (x + lean[0], y + lean[1], hgt - 0.1), head, segments=10)
        canvas, anchor = plant_canvas(0.9, 1.5, 0.0)
        eisen.camera(*canvas, anchor=anchor)
        name = f'flora.reed.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, 0.9, 1.4, half=False)

    # Findlinge
    for i in range(4):
        eisen.reset(samples=48)
        rnd = random.Random(800 + i)
        r = rnd.uniform(0.45, 0.75)
        me = gw_ground.pebble_mesh('boulder', 1.0, rnd, 0.62, 2, i % 2 == 0, 0.18)
        ob = gw_lib.link(bpy.data.objects.new('boulder', me), outline=False)
        ob.scale = (r, r * rnd.uniform(0.8, 1.1), r)
        ob.location = P(0, 0, r * 0.62 * 0.55)
        ob.rotation_euler = Euler((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(0, 6.28)))
        tone = ['#6a645a', '#756d61', '#5d5850', '#7a7164'][i]
        m = gw_ground.pmat(f'bd{i}', lin(tone), 0.85, 0.35, 0.8, 9)
        ob.data.materials.append(m)
        # Moos- und Grasfuß
        bm = bmesh.new()
        for k in range(500):
            a = rnd.uniform(0, math.tau)
            rr = r * rnd.uniform(0.85, 1.35)
            gw_ground.blade(bm, math.cos(a) * rr, math.sin(a) * rr, 0, rnd.uniform(0.08, 0.22), a + rnd.uniform(-0.5, 0.5), rnd.uniform(0.3, 0.8), 0.006, k % 3)
        gm = bpy.data.meshes.new('gr')
        bm.to_mesh(gm)
        bm.free()
        go = gw_lib.link(bpy.data.objects.new('gr', gm), outline=False)
        for h_ in ('#a89a5e', '#8f8c4c', '#7c8243'):
            go.data.materials.append(gw_ground.pmat(f'g{h_}', lin(h_), 0.65, 0.12, 0.0, 10, 0.3, 0.6))
        canvas, anchor = plant_canvas(2 * r + 0.4, r * 1.3, 0.0)
        eisen.camera(*canvas, anchor=anchor)
        name = f'flora.boulder.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, 2 * r + 0.4, r * 1.3, half=False)

    # Bäume: je Art zwei Exemplare, Schatten separat in halber Auflösung
    for i, (sid, d, h, col) in enumerate(TREES):
        for v in range(2):
            eisen.reset(samples=48)
            sp = {'id': sid, 'kind': 'tree', 'diameterMature': d * (1 - 0.1 * v), 'heightMature': h * (1 - 0.08 * v)}
            gw_plants.tree(sp, {'color': col, 'bare': False, 'bloom': None, 'fruit': None}, 900 + i * 13 + v)
            canvas, anchor = plant_canvas(d, h, 0.0)
            eisen.camera(*canvas, anchor=anchor)
            name = f'flora.tree.{i * 2 + v}'
            out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
            shadow(out, name, d, h)
