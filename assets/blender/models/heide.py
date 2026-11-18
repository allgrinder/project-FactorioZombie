"""Heide und Moor: Heidekraut-Polster (flora.heather.<n>), Wacholder (flora.juniper.<n>), Wollgras (flora.cottongrass.<n>)
und Torfmoos-Flecken (decal.peat.<n>). Gartenwerk-Generatoren (Stauden, Gräser, Sträucher)."""
import math
import random

import eisen
import gw_ground
import gw_plants

lin = gw_ground.lin
TAN = math.tan(eisen.TILT)


def canvas(d, h):
    w = d + 1.0
    top = d / 2 + h * TAN + 0.3
    bottom = d / 2 + 0.4
    cw, ch = math.ceil(w * 2) / 2, math.ceil((top + bottom) * 2) / 2
    return (cw, ch), ((d / 2 + 0.5) / cw, top / ch)


def shadow(out, name, d, h):
    sw = math.ceil((d + 1 + h * 0.6) * 2) / 2
    sh = math.ceil((d + 1 + h * 0.75) * 2) / 2
    eisen.shadow_render(out, f'{name}.shadow', 'flora', (sw, sh), ((d / 2 + 0.5) / sw, (d / 2 + 0.5) / sh))


def render(out):
    heather = [('lavandula', 0.9, 0.45, '#5a6a48', '#a060a8'), ('lavandula', 0.7, 0.35, '#5e6a4a', '#b878b8'),
               ('nepeta', 1.0, 0.4, '#5a6648', '#9a5a9a'), ('lavandula', 0.8, 0.4, '#626a48', '#8a5090')]
    for i, (sid, d, h, col, bloom) in enumerate(heather):
        eisen.reset(samples=28)
        gw_plants.perennial({'id': sid, 'kind': 'perennial', 'diameterMature': d, 'heightMature': h}, {'color': col, 'bare': False, 'bloom': bloom, 'fruit': None}, 6100 + i)
        cv, an = canvas(d, h)
        eisen.camera(*cv, anchor=an)
        out.add(f'flora.heather.{i}', 'flora', [out.render_frame(f'flora.heather.{i}', 0)], an)
        shadow(out, f'flora.heather.{i}', d, h)
    for i in range(3):
        eisen.reset(samples=32)
        gw_plants.shrub({'id': 'taxus-column', 'kind': 'shrub', 'diameterMature': 0.9 + 0.2 * i, 'heightMature': 1.6 + 0.5 * i},
                        {'color': ('#3e5a3a', '#46603e', '#3a5236')[i], 'bare': False, 'bloom': None, 'fruit': None}, 6200 + i)
        d, h = 0.9 + 0.2 * i, 1.6 + 0.5 * i
        cv, an = canvas(d, h)
        eisen.camera(*cv, anchor=an)
        out.add(f'flora.juniper.{i}', 'flora', [out.render_frame(f'flora.juniper.{i}', 0)], an)
        shadow(out, f'flora.juniper.{i}', d, h)
    for i in range(3):
        eisen.reset(samples=28)
        gw_plants.grass({'id': 'carex', 'kind': 'grass', 'diameterMature': 0.7, 'heightMature': 0.5}, {'color': '#7a8048', 'bare': False, 'bloom': '#f4f2ea', 'fruit': None}, 6300 + i)
        rnd = random.Random(6310 + i)
        cotton = eisen.material('cotton', (0.92, 0.92, 0.9), rough=0.9)
        for k in range(10):
            a = rnd.uniform(0, math.tau)
            r = rnd.uniform(0, 0.25)
            eisen.cylinder(f'st{k}', 0.004, 0.55, (math.cos(a) * r, math.sin(a) * r, 0.28), gw_plants.leaf_material('#7a7a48'), segments=4)
            eisen.rock(f'c{k}', 0.035, (math.cos(a) * r, math.sin(a) * r, 0.58), cotton, 6320 + k, squash=1.2, detail=1)
        cv, an = canvas(0.8, 0.65)
        eisen.camera(*cv, anchor=an)
        out.add(f'flora.cottongrass.{i}', 'flora', [out.render_frame(f'flora.cottongrass.{i}', 0)], an)
        shadow(out, f'flora.cottongrass.{i}', 0.8, 0.65)
    for v in range(3):
        eisen.reset(samples=14, ground=False)
        rnd = random.Random(6400 + v)
        mats = [gw_ground.pmat(f'peat{i}', lin(c), 0.95, 0.4, 0.7, 40) for i, c in enumerate(('#7a6a3a', '#8a5a3a', '#6a7a3a', '#5a4a2a'))]
        water = gw_ground.pmat('peat_w', lin('#3a3e34'), 0.15, 0.1, 0.1, 10)
        for k in range(18):
            a = rnd.uniform(0, math.tau)
            r = abs(rnd.gauss(0, 0.2))
            eisen.cylinder(f'p{k}', rnd.uniform(0.06, 0.16), 0.008 + k * 0.001, (math.cos(a) * r, math.sin(a) * r, 0.004), rnd.choice(mats), segments=12)
        if v != 1:
            eisen.cylinder('w', rnd.uniform(0.1, 0.18), 0.03, (rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), 0.01), water, segments=16)
        eisen.camera(1.0, 1.0, tilt=0.0)
        out.add(f'decal.peat.{v}', 'decals', [out.render_frame(f'decal.peat.{v}', 0)], (0.5, 0.5))
