"""Innen: Teppiche (decal.rug.<n>, 2×3 Felder, von oben), verstreute Papiere (decal.papers.<n>) und Glasscherben
(decal.glass.<n>) für Hausböden."""
import math
import random

import eisen
import gw_ground

lin = gw_ground.lin
RUGS = (('#7a2a24', '#c8a060'), ('#2a3a5a', '#b8b0a0'), ('#5a6a3a', '#d0c098'), ('#6a4a3a', '#2a2420'))


def rug(v):
    base, border = RUGS[v]
    rnd = random.Random(8100 + v)
    mb = gw_ground.pmat(f'rug{v}', lin(base), 0.95, 0.35, 0.3, 60)
    mr = gw_ground.pmat(f'rugb{v}', lin(border), 0.95, 0.3, 0.3, 60)
    eisen.box('rug', (1.7, 2.6, 0.01), (0, 0, 0.005), mr)
    eisen.box('field', (1.45, 2.35, 0.012), (0, 0, 0.007), mb)
    for k in range(6):  # Muster
        eisen.box(f'm{k}', (0.9 - k * 0.12, 0.05, 0.013), (0, -0.9 + k * 0.36, 0.008), mr)
    for k in range(rnd.randint(1, 3)):  # Flecken
        eisen.cylinder(f's{k}', rnd.uniform(0.1, 0.25), 0.002, (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.9, 0.9), 0.015),
                       eisen.material('rugstain', eisen.srgb('#2a1a12'), rough=0.9), segments=12)


def papers(v):
    rnd = random.Random(8200 + v)
    mats = [gw_ground.pmat(f'pap{i}', lin(c), 0.8, 0.1, 0.1, 60) for i, c in enumerate(('#e8e4d8', '#d8d0b8', '#c8c4b8', '#e0d8c0'))]
    for k in range(10 + v * 4):
        a = rnd.uniform(0, math.tau)
        r = abs(rnd.gauss(0, 0.25))
        eisen.box(f'p{k}', (0.16, 0.22, 0.002), (math.cos(a) * r, math.sin(a) * r, 0.002 + k * 0.0004), rnd.choice(mats), rot=(0, 0, rnd.uniform(0, 3)))


def glass(v):
    rnd = random.Random(8300 + v)
    m = gw_ground.pmat('shard', lin('#b8ccd4'), 0.08, 0.05, 0.05, 80)
    for k in range(26):
        a = rnd.uniform(0, math.tau)
        r = abs(rnd.gauss(0, 0.22))
        s = rnd.uniform(0.02, 0.07)
        eisen.box(f'g{k}', (s, s * rnd.uniform(0.4, 1.0), 0.003), (math.cos(a) * r, math.sin(a) * r, 0.002), m, rot=(0, 0, rnd.uniform(0, 3)))


def render(out):
    for v in range(len(RUGS)):
        eisen.reset(samples=16, ground=False)
        rug(v)
        eisen.camera(2.0, 3.0, tilt=0.0)
        out.add(f'decal.rug.{v}', 'decals', [out.render_frame(f'decal.rug.{v}', 0)], (0.5, 0.5))
    for kind, fn in (('papers', papers), ('glass', glass)):
        for v in range(3):
            eisen.reset(samples=16, ground=False)
            fn(v)
            eisen.camera(1.0, 1.0, tilt=0.0)
            out.add(f'decal.{kind}.{v}', 'decals', [out.render_frame(f'decal.{kind}.{v}', 0)], (0.5, 0.5))
    # Symbol: Obst (Äpfel und eine Birne)
    eisen.reset(samples=40)
    red = gw_ground.pmat('apple_r', lin('#b8382a'), 0.45, 0.2, 0.2, 40)
    yel = gw_ground.pmat('apple_y', lin('#c8a838'), 0.45, 0.2, 0.2, 40)
    stem = gw_ground.pmat('apple_s', lin('#4a3424'), 0.8, 0.1, 0.1, 40)
    for k, (x, y, m) in enumerate(((-0.18, 0.05, red), (0.16, 0.1, red), (0.0, -0.18, yel))):
        eisen.rock(f'a{k}', 0.17, (x, y, 0.16), m, 90 + k, squash=0.95, detail=2)
        eisen.cylinder(f'st{k}', 0.012, 0.08, (x, y, 0.33), stem, segments=5)
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add('item.fruit', 'items', [out.render_frame('item.fruit', 0)], (0.5, 0.5))
