"""Flur: Feldfrüchte auf verwilderten Äckern, Hecken in den Gärten, Seerosen auf den Seen.

Feldfrüchte crop.<art>.<stufe>.<v> (je ein Feld, zwei Reihen; Schatten im Bild): Weizen, Mais, Sonnenblumen, Rüben in
den Stufen jung (Frühling), reif (Sommer), dürr (Herbst/Winter). Die Darstellung wählt Art je Acker und Stufe je
Jahreszeit (src/render/renderer.ts, drawCrops).
Hecken hedge.v<n> (Requisite 1×1, Hainbuche, Liguster, Thuja, je zwei Formen), Seerosen decal.lily.<v> (von oben).
"""
import math
import random

import bmesh
import bpy
import eisen
import gw_ground
import gw_lib
import gw_plants
import ruinen
from mathutils import Vector

lin = gw_ground.lin
TAN = math.tan(eisen.TILT)

ROWS = (-0.25, 0.25)


def _mat(name, hex_, rough=0.8):
    return gw_ground.pmat(name, lin(hex_), rough, 0.25, 0.4, 30)


def wheat(stage, rnd):
    col = {'young': '#7a9a4a', 'ripe': '#c8a850', 'dry': '#8a7a58'}[stage]
    H = {'young': 0.35, 'ripe': 0.95, 'dry': 0.6}[stage]
    stalk = _mat(f'wh_st{stage}', col)
    ear = _mat(f'wh_ear{stage}', {'young': '#8aa858', 'ripe': '#d8b860', 'dry': '#7a6a4a'}[stage])
    for ry in ROWS:
        for k in range(46):
            x = rnd.uniform(-0.48, 0.48)
            y = ry + rnd.gauss(0, 0.06)
            h = H * rnd.uniform(0.8, 1.1)
            lean = rnd.uniform(-0.15, 0.15) + (0.35 if stage == 'dry' and rnd.random() < 0.4 else 0)
            eisen.cylinder(f's{ry}{k}', 0.006, h, (x + math.sin(lean) * h / 2, y, h / 2 * math.cos(lean)), stalk, segments=4, rot=(0, lean, 0))
            if stage != 'young':
                eisen.cylinder(f'e{ry}{k}', 0.016, 0.08, (x + math.sin(lean) * h, y, h * math.cos(lean)), ear, segments=6, rot=(0, lean, 0))


def maize(stage, rnd):
    col = {'young': '#6a8a42', 'ripe': '#5f7e3c', 'dry': '#a8955e'}[stage]
    H = {'young': 0.6, 'ripe': 2.0, 'dry': 1.7}[stage]
    stalk = _mat(f'mz_st{stage}', col)
    for ry in ROWS:
        for k in range(3):
            x = -0.33 + k * 0.33 + rnd.uniform(-0.05, 0.05)
            h = H * rnd.uniform(0.85, 1.05)
            eisen.cylinder(f'm{ry}{k}', 0.018, h, (x, ry, h / 2), stalk, segments=6)
            ob = gw_plants.strap_leaves(0.3, h * 0.9, 9, 0.035, 0.6, col, rnd)
            ob.location = (x, ry, 0)
            if stage != 'young':
                cob = _mat(f'mz_cob{stage}', '#c8b060' if stage == 'ripe' else '#8a7a50')
                eisen.cylinder(f'c{ry}{k}', 0.035, 0.2, (x + 0.05, ry, h * 0.55), cob, segments=8, rot=(0, 0.4, 0))
                tas = _mat(f'mz_t{stage}', '#b8a060')
                eisen.cylinder(f't{ry}{k}', 0.01, 0.2, (x, ry, h + 0.08), tas, segments=4)


def sunflower(stage, rnd):
    col = {'young': '#6a8a44', 'ripe': '#5c7a3a', 'dry': '#6a5a3a'}[stage]
    H = {'young': 0.5, 'ripe': 1.8, 'dry': 1.6}[stage]
    stalk = _mat(f'sf_st{stage}', col)
    for ry in ROWS:
        for k in range(3):
            x = -0.33 + k * 0.33 + rnd.uniform(-0.05, 0.05)
            h = H * rnd.uniform(0.85, 1.1)
            eisen.cylinder(f'f{ry}{k}', 0.02, h, (x, ry, h / 2), stalk, segments=6)
            leafm = _mat(f'sf_l{stage}', col)
            for j in range(4):
                a = rnd.uniform(0, math.tau)
                z = h * (0.25 + j * 0.15)
                lf = eisen.cylinder(f'l{ry}{k}{j}', 0.09, 0.005, (x + math.cos(a) * 0.08, ry + math.sin(a) * 0.08, z), leafm, segments=10, rot=(0.3, 0, a))
                lf.scale = (1.0, 0.6, 1)
            if stage == 'ripe':
                disc = _mat('sf_disc', '#4a3220')
                petals = gw_plants.flower_obj('#e8b828', 0.17, 'daisy')
                inst = gw_lib.link(bpy.data.objects.new('head', petals.data), outline=False)
                inst.location = (x, ry - 0.03, h)
                inst.rotation_euler = (0.6, 0, 0)
                eisen.cylinder(f'd{ry}{k}', 0.07, 0.03, (x, ry - 0.04, h + 0.01), disc, segments=14, rot=(0.6, 0, 0))
            elif stage == 'dry':
                head = _mat('sf_dry', '#3a2a1c')
                eisen.cylinder(f'd{ry}{k}', 0.08, 0.04, (x, ry - 0.06, h - 0.08), head, segments=14, rot=(1.6, 0, 0))


def beet(stage, rnd):
    col = {'young': '#6a8a44', 'ripe': '#4f7038', 'dry': '#7a6a44'}[stage]
    sp = {'id': 'lettuce', 'kind': 'vegetable', 'diameterMature': 0.28 if stage == 'young' else 0.4, 'heightMature': 0.3}
    for ry in ROWS:
        for k in range(4):
            before = set(bpy.data.objects)
            gw_plants.vegetable(sp, {'color': col}, rnd.randint(1, 9999))
            off = Vector((-0.36 + k * 0.24 + rnd.uniform(-0.03, 0.03), ry, 0))
            for o in set(bpy.data.objects) - before:
                if o.parent is None:
                    o.location += off


def soil_rows():
    """Ackerfurchen unter den Pflanzen (verdecken den Belag nicht ganz)."""
    m = _mat('furrow', '#4a3a28', 0.95)
    for ry in ROWS:
        eisen.box(f'fur{ry}', (1.0, 0.16, 0.04), (0, ry, 0.0), m)


CROPS = (('wheat', wheat), ('maize', maize), ('sunflower', sunflower), ('beet', beet))
HEDGES = (('carpinus-hedge', '#5f7440'), ('ligustrum-hedge', '#4f6a38'), ('thuja-hedge', '#3f5a34'))


def render(out):
    for name, fn in CROPS:
        for stage in ('young', 'ripe', 'dry'):
            for v in range(2):
                eisen.reset(samples=24)
                rnd = random.Random(sum(map(ord, name + stage)) * 7 + v)
                soil_rows()
                fn(stage, rnd)
                key = f'crop.{name}.{stage}.{v}'
                h = 2.2 if name in ('maize', 'sunflower') else 1.1
                top = 0.5 + h * TAN + 0.25
                canvas = (1.25, math.ceil((top + 0.75) * 4) / 4)
                anchor = (0.5, top / canvas[1])
                eisen.camera(*canvas, anchor=anchor)
                out.add(key, 'flora', [out.render_frame(key, 0)], anchor)
    for i, (sid, col) in enumerate(HEDGES):
        for v in range(2):
            eisen.reset(samples=32)
            sp = {'id': sid, 'kind': 'hedge', 'diameterMature': 1.15, 'heightMature': 1.4 + 0.2 * v}
            gw_plants.shrub(sp, {'color': col, 'bare': False, 'bloom': None, 'fruit': None}, 3100 + i * 5 + v)
            key = f'hedge.v{i * 2 + v}'
            canvas, anchor, sh, sha = ruinen.spec(1, 1, 1.7, margin=0.3)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=12)
            gw_plants.shrub(sp, {'color': col, 'bare': False, 'bloom': None, 'fruit': None}, 3100 + i * 5 + v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha)
    for v in range(4):
        eisen.reset(samples=16, ground=False)
        rnd = random.Random(3300 + v)
        pad = _mat('lily_pad', '#4a6a34', 0.5)
        pad2 = _mat('lily_pad2', '#5a7a3a', 0.5)
        for k in range(5 + v):
            r = rnd.uniform(0.08, 0.16)
            a = rnd.uniform(0, math.tau)
            d = rnd.uniform(0, 0.32)
            p = eisen.cylinder(f'p{k}', r, 0.006, (math.cos(a) * d, math.sin(a) * d, 0.003), pad if k % 2 else pad2, segments=16)
            p.rotation_euler = (0, 0, rnd.uniform(0, 6))
        for k in range(1 + v % 3):
            fl = gw_plants.flower_obj('#f0e8f0' if (v + k) % 2 else '#e8a0b8', 0.06, 'saucer')
            inst = gw_lib.link(bpy.data.objects.new('lily', fl.data), outline=False)
            inst.location = (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.02)
        key = f'decal.lily.{v}'
        eisen.camera(1.0, 1.0, tilt=0.0)
        out.add(key, 'decals', [out.render_frame(key, 0)], (0.5, 0.5))
