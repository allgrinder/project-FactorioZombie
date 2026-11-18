"""Wildtiere (eigene Entwürfe): Reh, Hase, Wildschwein, Krähe. Vierbeiner aus Rumpf, Hals, Kopf und vier Beinen mit
Gelenk; nach Süden (−Y, zur Kamera) modelliert, die Pipeline dreht sie in 8 Richtungen.
phase 0..1: Laufzyklus (Beine schwingen gegenläufig), graze=True: Kopf unten, dead=True: auf der Seite liegend."""
import math

import bauten
import eisen
from zombie import limb, sphere

W = bauten.weathered


def _fur(name, hex_, rough=0.95):
    return W(name, hex_, metal=0.0, rough=rough, rust=0.0, dust=0.25, edge=0.1, grime=0.3, streaks=0.0,
             rust_hex='#3a0e0b', dust_hex='#6d6250')


# Fell, Bauch/Spiegel, Huf/Schnauze; Maße: Rumpflänge, -höhe (Mitte über Boden), Beinlänge, Beindicke
LOOKS = {
    'deer': dict(fur='#6a4e34', belly='#c8b898', dark='#2a2420', body=(0.95, 0.38, 0.42), z=0.78, leg=0.6, legw=0.06,
                 neck=0.42, head=(0.14, 0.26, 0.15)),
    'rabbit': dict(fur='#8a7a62', belly='#e0d8c8', dark='#3a3028', body=(0.34, 0.2, 0.2), z=0.17, leg=0.1, legw=0.05,
                   neck=0.06, head=(0.1, 0.13, 0.1)),
    'boar': dict(fur='#4a3e34', belly='#3a322a', dark='#1e1a16', body=(1.0, 0.48, 0.5), z=0.52, leg=0.32, legw=0.09,
                 neck=0.12, head=(0.2, 0.42, 0.24)),
}


def animal(kind='deer', phase=0.0, graze=False, dead=False):
    L = LOOKS[kind]
    fur = _fur(f'{kind}_fur', L['fur'])
    belly = _fur(f'{kind}_belly', L['belly'])
    dark = _fur(f'{kind}_dark', L['dark'], 0.6)
    bl, bw, bh = L['body']
    z = L['z']
    objs = []
    # Rumpf entlang −Y (Kopf zur Kamera)
    body = sphere('body', 0.5, (0, 0, z), fur, 18, (bw, bl, bh))
    objs.append(body)
    objs.append(sphere('belly', 0.5, (0, 0.02, z - bh * 0.18), belly, 14, (bw * 0.8, bl * 0.8, bh * 0.7)))
    if kind == 'boar':  # Borstenkamm, Buckel vorn
        objs.append(sphere('hump', 0.5, (0, -bl * 0.18, z + bh * 0.22), fur, 14, (bw * 0.75, bl * 0.5, bh * 0.6)))
    # Beine: vorn und hinten, gegenläufiger Schwung
    swing = 0.0 if graze or dead else math.sin(phase * math.tau) * (0.55 if kind != 'rabbit' else 0.9)
    lw = L['legw']
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        ph = swing * (1 if (i in (0, 3)) else -1)
        if kind == 'rabbit':  # Hase hoppelt: Vorder- und Hinterbeine paarweise
            ph = swing * (1 if sy < 0 else -1)
        px, py = sx * bw * 0.28, sy * bl * 0.34
        upper = limb(f'leg{i}', (lw, lw * 1.2, L['leg'] * 0.55), (px, py, z - bh * 0.25), (ph, 0, 0), fur)
        lower = limb(f'shin{i}', (lw * 0.7, lw * 0.8, L['leg'] * 0.55), (0, 0, -L['leg'] * 0.5), (-abs(ph) * 0.6, 0, 0), dark if kind != 'rabbit' else fur)
        lower.parent = upper
        objs.append(upper)
    if kind == 'rabbit':  # große Hinterläufe
        for sx in (-1, 1):
            objs.append(sphere(f'haunch{sx}', 0.5, (sx * bw * 0.32, bl * 0.25, z - 0.02), fur, 12, (0.1, 0.2, 0.14)))
    # Hals und Kopf
    hx, hy, hz = L['head']
    nz = z + bh * 0.3 + L['neck'] * (0.2 if graze else 0.8)
    ny = -bl * 0.45 - (0.25 if graze else 0.05) * L['neck'] * 2
    head_z = nz - (L['neck'] * 0.9 if graze else 0)
    if kind == 'boar':
        head_z = z + 0.02 - (0.18 if graze else 0)
        ny = -bl * 0.5
    if L['neck'] > 0.1:
        by_, bz = -bl * 0.36, z + bh * 0.12
        dy, dz = ny - by_, head_z - bz
        ln = math.hypot(dy, dz)
        neck = eisen.cylinder('neck', bw * 0.15, ln + 0.08, (0, (ny + by_) / 2, (head_z + bz) / 2), fur, segments=12,
                              rot=(math.atan2(-dy, dz), 0, 0))
        objs.append(neck)
    head = sphere('head', 0.5, (0, ny - hy * 0.25, head_z), fur, 14, (hx, hy, hz))
    objs.append(head)
    snout = sphere('snout', 0.5, (0, ny - hy * 0.68, head_z - hz * 0.15), dark, 10, (hx * 0.55, hy * 0.35, hz * 0.55))
    objs.append(snout)
    if kind == 'boar':  # Hauer
        for sx in (-1, 1):
            objs.append(eisen.cylinder(f'tusk{sx}', 0.012, 0.08, (sx * hx * 0.25, ny - hy * 0.7, head_z + 0.0), _fur('tusk', '#e8e0c8', 0.4),
                                       segments=6, rot=(0.6, sx * 0.3, 0)))
    # Ohren
    ear_l = {'deer': 0.13, 'rabbit': 0.2, 'boar': 0.09}[kind]
    for sx in (-1, 1):
        e = sphere(f'ear{sx}', 0.5, (sx * hx * 0.45, ny - hy * 0.05, head_z + hz * 0.45 + ear_l * 0.4), fur, 8,
                   (ear_l * 0.35, ear_l * 0.18, ear_l))
        e.rotation_euler = (0.2 if kind != 'rabbit' else 0.5, sx * 0.4, 0)
        objs.append(e)
    # Schwanz bzw. Spiegel
    if kind == 'deer':
        objs.append(sphere('mirror', 0.5, (0, bl * 0.48, z + 0.05), belly, 10, (bw * 0.5, 0.08, bh * 0.45)))
    elif kind == 'rabbit':
        objs.append(sphere('tail', 0.5, (0, bl * 0.52, z + 0.04), belly, 8, (0.08, 0.08, 0.08)))
    else:
        objs.append(eisen.cylinder('tail', 0.015, 0.2, (0, bl * 0.52, z), dark, segments=6, rot=(0.6, 0, 0)))
    root = eisen.parent_all(objs, kind)
    if dead:
        root.rotation_euler = (0, math.pi / 2 * 0.97, 0)
        root.location = (-z, 0, bw * 0.42)
    return root


def crow(flap=0.0, sitting=True):
    """Krähe: kleiner schwarzer Körper, Schnabel; sitzend oder fliegend (Flügel auf und ab)."""
    black = _fur('crow', '#1c1c20', 0.5)
    beak = _fur('beak', '#2e2a26', 0.4)
    objs = [sphere('body', 0.5, (0, 0, 0.1 if sitting else 0.6), black, 12, (0.1, 0.22, 0.1))]
    z = objs[0].location.z
    objs.append(sphere('head', 0.5, (0, -0.12, z + 0.06), black, 10, (0.08, 0.08, 0.08)))
    objs.append(sphere('beak', 0.5, (0, -0.18, z + 0.05), beak, 8, (0.025, 0.06, 0.025)))
    objs.append(sphere('tail', 0.5, (0, 0.15, z - 0.01), black, 8, (0.08, 0.12, 0.02)))
    if not sitting:
        a = math.sin(flap * math.tau) * 0.8
        for sx in (-1, 1):
            w = sphere(f'wing{sx}', 0.5, (sx * 0.17, 0, z + 0.02), black, 10, (0.28, 0.12, 0.02))
            w.rotation_euler = (0, sx * a, 0)
            objs.append(w)
    else:
        for sx in (-1, 1):
            objs.append(sphere(f'wing{sx}', 0.5, (sx * 0.07, 0.02, z + 0.02), black, 8, (0.06, 0.2, 0.08)))
            objs.append(eisen.cylinder(f'leg{sx}', 0.006, 0.08, (sx * 0.03, 0, 0.04), beak, segments=5))
    return eisen.parent_all(objs, 'crow')


def meat(cooked=False):
    """Fleischstück (roh: rot mit Fettrand, gebraten: braun mit Röstspuren, am Spieß)."""
    m = _fur('meat' + str(cooked), '#6a3a22' if cooked else '#9a2e2a', 0.5)
    fat = _fur('fat' + str(cooked), '#a87a4a' if cooked else '#e0c8b0', 0.5)
    o = [sphere('m', 0.5, (0, 0, 0.14), m, 16, (0.62, 0.42, 0.24)), sphere('f', 0.5, (0.04, 0.03, 0.12), fat, 14, (0.66, 0.46, 0.18))]
    if cooked:
        stick = _fur('stick', '#6a5032', 0.8)
        o.append(eisen.cylinder('spit', 0.02, 1.0, (0, 0, 0.16), stick, segments=6, rot=(0, math.pi / 2, 0.4)))
    else:
        bone = _fur('bone', '#e8e0cc', 0.5)
        o.append(eisen.cylinder('bone', 0.04, 0.3, (0.32, 0, 0.14), bone, segments=8, rot=(0, math.pi / 2, 0)))
        o.append(sphere('knob', 0.5, (0.48, 0, 0.14), bone, 8, (0.1, 0.1, 0.1)))
    return eisen.parent_all(o, 'meat')


def hide():
    """Fell: zusammengerolltes Tierfell, mit Schnur gebunden."""
    f = _fur('hide', '#8a6038')
    inner = _fur('hide_in', '#c8b090')
    o = [eisen.cylinder('roll', 0.18, 0.62, (0, 0, 0.18), f, segments=16, rot=(0, math.pi / 2, 0)),
         eisen.cylinder('in', 0.12, 0.64, (0, 0, 0.18), inner, segments=16, rot=(0, math.pi / 2, 0))]
    cord = _fur('cord', '#3a3028', 0.7)
    for x in (-0.18, 0.18):
        o.append(eisen.cylinder(f'c{x}', 0.19, 0.03, (x, 0, 0.18), cord, segments=16, rot=(0, math.pi / 2, 0)))
    return eisen.parent_all(o, 'hide')
