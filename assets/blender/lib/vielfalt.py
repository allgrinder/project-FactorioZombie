"""Vielfalt (eigene Entwürfe für „Letzte Schicht“): Fahrzeugwracks (Bus, Transporter, Streifenwagen, Krankenwagen,
Traktor), Hof- und Straßenkram (Briefkasten, Mülltonne, Gartenhaus, Picknicktisch, Schaukel, Wäscheleine, Hundehütte,
Bank, Bushaltestelle, Telefonzelle, Ölfässer, Palettenstapel, Reifenstapel, Leitkegel, Absperrung, Sandsäcke,
umgestürzter Baum), Dachaufbauten (Schornstein, Antenne, Solarmodul, Dachfenster, Satellitenschüssel) und
Bodenflecken (Blut, Müll, Laub, Brandfleck, Reifenspuren). Ursprung = Mitte der Grundfläche; x Ost, y Nord."""
import math
import random

import bauten
import eisen
import gw_ground
import ruinen

lin = gw_ground.lin
W = bauten.weathered


def _paint(name, hex_, rust=0.6, metal=0.55):
    return W(name, hex_, metal=metal, rough=0.55, rust=rust, dust=0.5, edge=0.7, grime=0.7, streaks=0.6)


def _tire():
    return W('vf_tire', '#1c1b1a', metal=0.0, rough=0.9, rust=0.0, dust=0.6, edge=0.0)


def _chrome():
    return W('vf_chrome', '#6f706c', metal=0.85, rough=0.4, rust=0.4, dust=0.4, edge=0.4)


def _dark():
    return eisen.material('vf_dark', (0.012, 0.012, 0.014), rough=0.25)


def _wheels(o, xs, half_w, r=0.2, flat=(), y_off=0.0):
    tire = _tire()
    rim = _chrome()
    for k, x in enumerate(xs):
        for s in (-1, 1):
            rr = r * (0.8 if (k, s) in flat else 1)
            pos = (x, s * half_w + y_off, rr)
            o.append(eisen.cylinder(f'wh{k}{s}', rr, 0.16, pos, tire, segments=14, rot=(math.pi / 2, 0, 0)))
            o.append(eisen.cylinder(f'rm{k}{s}', rr * 0.5, 0.17, pos, rim, segments=10, rot=(math.pi / 2, 0, 0)))


def _rubble(o, rnd, w, h, n=10):
    tones = [gw_ground.pmat(f'vf_e{i}', lin(c), 1.0, 0.3, 0.6, 25) for i, c in enumerate(('#4a3d2e', '#3a3128', '#5a4a36'))]
    ruinen.rubble(o, rnd, -w / 2, -h / 2, w / 2, h / 2, n, tones, (0.02, 0.05))


# --------------------------------------------------------------------------- Fahrzeugwracks

def van(variant=0):
    """Transporter 3×2: hoher Kasten, Schiebetür offen, platte Reifen."""
    rnd = random.Random(1100 + variant)
    body = _paint(f'vf_van{variant}', ('#c8c4b4', '#5a6a7a', '#7a5a3a')[variant % 3])
    dark = _dark()
    o = [eisen.box('box', (2.6, 1.2, 0.95), (-0.1, 0, 0.62), body, bevel=0.08)]
    o.append(eisen.box('cab', (0.55, 1.18, 0.6), (1.4, 0, 0.45), body, bevel=0.1))
    o.append(eisen.box('wind', (0.04, 1.0, 0.32), (1.55, 0, 0.82), dark, rot=(0, -0.5, 0)))
    o.append(eisen.box('door', (0.7, 0.02, 0.6), (0.3, -0.61, 0.6), dark))
    o.append(eisen.box('slide', (0.7, 0.04, 0.6), (-0.45, -0.66, 0.6), body))
    o.append(eisen.box('roofdent', (0.8, 0.6, 0.02), (rnd.uniform(-0.8, 0.4), 0, 1.1), _paint('vf_rust', '#5a3320', 0.9, 0.4)))
    _wheels(o, (-0.9, 1.2), 0.58, flat={(0, -1)})
    _rubble(o, rnd, 3.0, 2.0)
    return eisen.parent_all(o, 'van')


def police():
    """Streifenwagen 3×2: weiß-blau, Lichtbalken, offene Tür."""
    rnd = random.Random(1120)
    white = _paint('vf_pw', '#d6d4cc', 0.4)
    blue = _paint('vf_pb', '#2f4a7a', 0.3)
    dark = _dark()
    o = [eisen.box('chassis', (2.5, 1.15, 0.32), (0, 0, 0.36), white, bevel=0.07)]
    o.append(eisen.box('stripe', (2.52, 1.17, 0.1), (0, 0, 0.38), blue))
    o.append(eisen.box('cabin', (1.2, 1.05, 0.32), (-0.15, 0, 0.66), white, bevel=0.1))
    o.append(eisen.box('wind', (0.05, 0.9, 0.24), (0.47, 0, 0.66), dark, rot=(0, -0.5, 0)))
    o.append(eisen.box('lightbar', (0.2, 0.7, 0.07), (-0.1, 0, 0.86), blue, bevel=0.02))
    for s in (-1, 1):
        o.append(eisen.box(f'lamp{s}', (0.16, 0.2, 0.08), (-0.1, s * 0.22, 0.88), eisen.emission_material(f'vf_pl{s}', (0.2, 0.3, 1.0) if s < 0 else (1.0, 0.15, 0.1), 0.6)))
    o.append(eisen.box('door', (0.5, 0.04, 0.45), (0.05, -0.78, 0.5), white, rot=(0, 0, 0.8)))
    _wheels(o, (-0.8, 0.8), 0.56, flat={(1, 1)})
    _rubble(o, rnd, 2.9, 1.9, 8)
    return eisen.parent_all(o, 'police')


def ambulance():
    """Krankenwagen 3×2: weißer Kasten, rote Streifen, rotes Kreuz auf dem Dach, Hecktüren offen."""
    rnd = random.Random(1130)
    white = _paint('vf_aw', '#dcdad2', 0.35)
    red = _paint('vf_ar', '#a02a22', 0.3)
    dark = _dark()
    o = [eisen.box('box', (1.9, 1.2, 1.0), (-0.35, 0, 0.65), white, bevel=0.06)]
    o.append(eisen.box('cab', (0.7, 1.15, 0.65), (0.95, 0, 0.47), white, bevel=0.1))
    o.append(eisen.box('stripe', (1.92, 1.22, 0.1), (-0.35, 0, 0.6), red))
    o.append(eisen.box('wind', (0.04, 0.95, 0.3), (1.2, 0, 0.85), dark, rot=(0, -0.5, 0)))
    o.append(eisen.box('cross1', (0.6, 0.18, 0.02), (-0.35, 0, 1.16), red))
    o.append(eisen.box('cross2', (0.18, 0.6, 0.02), (-0.35, 0, 1.16), red))
    for s in (-1, 1):
        o.append(eisen.box(f'rear{s}', (0.04, 0.55, 0.85), (-1.45, s * 0.75, 0.6), white, rot=(0, 0, s * 1.2)))
    o.append(eisen.box('inside', (0.04, 1.0, 0.8), (-1.31, 0, 0.62), dark))
    _wheels(o, (-0.9, 0.95), 0.58)
    _rubble(o, rnd, 3.0, 2.0, 8)
    return eisen.parent_all(o, 'ambulance')


def bus():
    """Linienbus 6×2: lang, Fensterreihe, Werbestreifen, eingeschlagene Scheiben, Dachluken."""
    rnd = random.Random(1140)
    body = _paint('vf_bus', '#c9a640', 0.55)
    band = _paint('vf_busb', '#3a5a7a', 0.4)
    dark = _dark()
    o = [eisen.box('body', (5.7, 1.4, 1.05), (0, 0, 0.72), body, bevel=0.1)]
    o.append(eisen.box('band', (5.72, 1.42, 0.14), (0, 0, 0.45), band))
    for k in range(9):
        x = -2.4 + k * 0.6
        broken = rnd.random() < 0.35
        o.append(eisen.box(f'win{k}', (0.48, 1.42, 0.32), (x, 0, 0.92), dark if broken else eisen.material('vf_bglass', (0.05, 0.07, 0.08), rough=0.05, metal=0.2)))
    o.append(eisen.box('front', (0.04, 1.2, 0.5), (2.86, 0, 0.85), dark))
    for k in range(2):
        o.append(eisen.box(f'hatch{k}', (0.5, 0.5, 0.05), (-1.2 + k * 2.2, 0, 1.27), band, bevel=0.01))
    o.append(eisen.box('door', (0.6, 0.02, 0.85), (2.0, -0.71, 0.62), dark))
    _wheels(o, (-1.9, 1.9), 0.68, r=0.27, flat={(0, 1)})
    _rubble(o, rnd, 6.0, 2.0, 14)
    return eisen.parent_all(o, 'bus')


def tractor(variant=0):
    """Traktor 3×2: große Hinterräder, kleine Vorderräder, Haube, Kabine ohne Scheiben."""
    rnd = random.Random(1150 + variant)
    body = _paint(f'vf_tr{variant}', ('#4a6a2a', '#9a2a1e')[variant % 2], 0.6)
    steel = _chrome()
    tire = _tire()
    o = [eisen.box('hood', (1.2, 0.6, 0.5), (0.55, 0, 0.6), body, bevel=0.06)]
    o.append(eisen.box('frame', (2.0, 0.5, 0.2), (0.1, 0, 0.35), steel))
    o.append(eisen.box('seat', (0.4, 0.5, 0.15), (-0.45, 0, 0.75), _paint('vf_seat', '#2a2a28', 0.2, 0.1)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.box(f'post{sx}{sy}', (0.05, 0.05, 0.8), (-0.45 + sx * 0.3, sy * 0.45, 1.0), steel))
    o.append(eisen.box('roof', (0.75, 1.0, 0.05), (-0.45, 0, 1.42), body, bevel=0.02))
    o.append(eisen.cylinder('exhaust', 0.04, 0.6, (0.9, 0.2, 1.0), steel, segments=8))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'rear{s}', 0.48, 0.32, (-0.45, s * 0.6, 0.48), tire, segments=18, rot=(math.pi / 2, 0, 0)))
        o.append(eisen.cylinder(f'rearr{s}', 0.25, 0.33, (-0.45, s * 0.6, 0.48), body, segments=12, rot=(math.pi / 2, 0, 0)))
        o.append(eisen.cylinder(f'front{s}', 0.24, 0.2, (0.95, s * 0.42, 0.24), tire, segments=14, rot=(math.pi / 2, 0, 0)))
    _rubble(o, rnd, 3.0, 2.0, 8)
    return eisen.parent_all(o, 'tractor')


# --------------------------------------------------------------------------- Hof- und Straßenkram

def mailbox():
    post = ruinen._wood('vf_post', '#5a4430')
    box = _paint('vf_mail', '#b0902a', 0.5)
    return eisen.parent_all([eisen.box('post', (0.08, 0.08, 0.6), (0, 0, 0.3), post),
                             eisen.box('box', (0.3, 0.22, 0.22), (0, 0, 0.66), box, bevel=0.04),
                             eisen.box('flag', (0.02, 0.1, 0.12), (0.16, 0, 0.74), _paint('vf_flag', '#a02a22', 0.3))], 'mailbox')


def trash_bin(variant=0):
    col = ('#3a4a3a', '#5a5e62', '#6a4a2a')[variant % 3]
    b = _paint(f'vf_bin{variant}', col, 0.3, 0.2)
    o = [eisen.box('bin', (0.5, 0.55, 0.7), (0, 0, 0.36), b, bevel=0.03)]
    o.append(eisen.box('lid', (0.54, 0.6, 0.05), (0, 0.1, 0.76), b, bevel=0.02, rot=(0.5 if variant else 0.1, 0, 0)))
    trash = [gw_ground.pmat(f'vf_t{i}', lin(c), 0.9, 0.4, 0.6, 30) for i, c in enumerate(('#d0c8b0', '#4a6a8a', '#8a3a2a'))]
    rnd = random.Random(1200 + variant)
    for k in range(5):
        o.append(eisen.box(f't{k}', (rnd.uniform(0.06, 0.15), rnd.uniform(0.06, 0.15), 0.03), (rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, -0.2), 0.02), rnd.choice(trash), rot=(0, 0, rnd.uniform(0, 3))))
    return eisen.parent_all(o, 'trashbin')


def garden_shed(variant=0):
    """Gartenhaus 2×2: Bretter, Satteldach aus Pappe, Tür angelehnt."""
    rnd = random.Random(1210 + variant)
    wood = W(f'vf_sh{variant}', ('#6a4a32', '#5a6a4a', '#8a6a4a')[variant % 3], metal=0.0, rough=0.9, rust=0.2, dust=0.5, edge=0.6, grime=0.6, streaks=0.6)
    roof = gw_ground.pmat('vf_shroof', lin('#2e2e2c'), 0.95, 0.3, 0.5, 22)
    dark = _dark()
    o = [eisen.box('walls', (1.6, 1.4, 0.8), (0, 0, 0.4), wood, bevel=0.02)]
    for s in (-1, 1):
        o.append(eisen.box(f'roof{s}', (1.8, 0.85, 0.04), (0, s * 0.36, 0.98), roof, rot=(s * -0.45, 0, 0)))
    o.append(eisen.box('door', (0.5, 0.03, 0.65), (0.2, -0.72, 0.33), dark))
    o.append(eisen.box('leaf', (0.5, 0.04, 0.65), (0.55, -0.88, 0.33), wood, rot=(0, 0, 0.7)))
    for k in range(4):
        o.append(eisen.box(f'pl{k}', (0.015, 0.01, 0.78), (-0.75 + k * 0.4, -0.705, 0.4), dark))
    _rubble(o, rnd, 2.0, 2.0, 5)
    return eisen.parent_all(o, 'shed')


def picnic_table():
    wood = ruinen._wood('vf_pt', '#7a5a3a')
    o = [eisen.box('top', (1.6, 0.6, 0.05), (0, 0, 0.5), wood, bevel=0.01)]
    for s in (-1, 1):
        o.append(eisen.box(f'bench{s}', (1.6, 0.22, 0.04), (0, s * 0.45, 0.3), wood))
        o.append(eisen.box(f'leg{s}', (0.06, 1.1, 0.06), (s * 0.6, 0, 0.25), wood, rot=(0, 0, 0)))
    return eisen.parent_all(o, 'picnic')


def swing():
    steel = _paint('vf_sw', '#a03a2a', 0.6)
    chain = _chrome()
    o = [eisen.box('bar', (1.8, 0.06, 0.06), (0, 0, 1.2), steel)]
    for s in (-1, 1):
        for t in (-1, 1):
            o.append(eisen.box(f'leg{s}{t}', (0.06, 0.06, 1.3), (s * 0.85, t * 0.3, 0.6), steel, rot=(t * 0.25, 0, 0)))
    for k, x in enumerate((-0.4, 0.4)):
        for s in (-1, 1):
            o.append(eisen.box(f'ch{k}{s}', (0.015, 0.015, 0.8), (x + s * 0.15, 0, 0.8), chain, rot=(0.2 * (k - 0.5), 0, 0)))
        o.append(eisen.box(f'seat{k}', (0.38, 0.15, 0.03), (x, 0.08 * (k - 0.5), 0.4), _tire()))
    return eisen.parent_all(o, 'swing')


def laundry():
    post = _chrome()
    cloths = [gw_ground.pmat(f'vf_cl{i}', lin(c), 0.9, 0.4, 0.6, 30) for i, c in enumerate(('#d8d4c8', '#7a8aa0', '#a05a4a', '#6a7a4a'))]
    rnd = random.Random(1230)
    o = []
    for s in (-1, 1):
        o.append(eisen.box(f'post{s}', (0.06, 0.06, 1.1), (s * 1.3, 0, 0.55), post))
    o.append(eisen.box('line', (2.6, 0.01, 0.01), (0, 0, 1.05), post))
    x = -1.1
    while x < 1.1:
        w = rnd.uniform(0.25, 0.45)
        o.append(eisen.box(f'c{len(o)}', (w, 0.02, rnd.uniform(0.3, 0.55)), (x + w / 2, 0, 0.82), rnd.choice(cloths), rot=(0, rnd.uniform(-0.05, 0.05), 0)))
        x += w + 0.08
    return eisen.parent_all(o, 'laundry')


def dog_house():
    wood = ruinen._wood('vf_dh', '#8a5a3a')
    roof = _paint('vf_dhr', '#7a3a2a', 0.4, 0.1)
    dark = _dark()
    o = [eisen.box('box', (0.8, 0.7, 0.5), (0, 0, 0.25), wood, bevel=0.02)]
    for s in (-1, 1):
        o.append(eisen.box(f'r{s}', (0.9, 0.45, 0.04), (0, s * 0.19, 0.6), roof, rot=(s * -0.6, 0, 0)))
    o.append(eisen.box('hole', (0.3, 0.02, 0.32), (0, -0.36, 0.18), dark))
    o.append(eisen.cylinder('bowl', 0.1, 0.05, (0.3, -0.55, 0.025), _chrome(), segments=12))
    return eisen.parent_all(o, 'doghouse')


def bench():
    wood = ruinen._wood('vf_bn', '#6a4a30')
    steel = _paint('vf_bns', '#2a3a2a', 0.5)
    o = []
    for k in range(3):
        o.append(eisen.box(f'seat{k}', (1.7, 0.1, 0.03), (0, -0.12 + k * 0.12, 0.42), wood))
    for k in range(2):
        o.append(eisen.box(f'back{k}', (1.7, 0.03, 0.09), (0, 0.22, 0.6 + k * 0.13), wood))
    for s in (-1, 1):
        o.append(eisen.box(f'leg{s}', (0.06, 0.45, 0.42), (s * 0.7, 0.05, 0.21), steel))
    return eisen.parent_all(o, 'bench')


def bus_stop():
    """Bushaltestelle 3×1: Wartehäuschen mit gesplittertem Glas, Bank, Fahrplanschild."""
    steel = _paint('vf_bs', '#5a6a6a', 0.5)
    glass = eisen.material('vf_bsg', (0.15, 0.2, 0.22), rough=0.05, metal=0.2)
    roof = _paint('vf_bsr', '#3a4a4a', 0.4)
    o = [eisen.box('roof', (2.6, 0.9, 0.06), (0, 0.05, 1.3), roof, bevel=0.02)]
    for s in (-1, 1):
        o.append(eisen.box(f'post{s}', (0.06, 0.06, 1.3), (s * 1.25, 0.4, 0.65), steel))
        o.append(eisen.box(f'side{s}', (0.02, 0.7, 0.9), (s * 1.25, 0.05, 0.75), glass))
    o.append(eisen.box('back', (2.5, 0.02, 0.9), (0, 0.42, 0.75), glass))
    o.append(eisen.box('bench', (1.6, 0.3, 0.05), (0, 0.22, 0.42), steel))
    o.append(eisen.box('sign', (0.3, 0.04, 0.3), (1.45, -0.3, 1.5), _paint('vf_bss', '#c9a640', 0.3)))
    o.append(eisen.box('pole', (0.05, 0.05, 1.4), (1.45, -0.3, 0.7), steel))
    rnd = random.Random(1260)
    for k in range(8):
        o.append(eisen.box(f'sh{k}', (0.06, 0.05, 0.004), (rnd.uniform(-1.2, 1.2), rnd.uniform(-0.4, 0.1), 0.003), glass, rot=(0, 0, rnd.uniform(0, 3))))
    return eisen.parent_all(o, 'busstop')


def phone_booth():
    frame = _paint('vf_ph', '#c9a640', 0.4)
    glass = eisen.material('vf_phg', (0.12, 0.16, 0.18), rough=0.05, metal=0.2)
    o = [eisen.box('glass', (0.7, 0.7, 1.4), (0, 0, 0.75), glass)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.box(f'p{sx}{sy}', (0.06, 0.06, 1.5), (sx * 0.35, sy * 0.35, 0.75), frame))
    o.append(eisen.box('roof', (0.78, 0.78, 0.1), (0, 0, 1.52), frame, bevel=0.02))
    o.append(eisen.box('phone', (0.2, 0.08, 0.3), (0, 0.3, 0.95), _dark()))
    return eisen.parent_all(o, 'phone')


def oil_drums(variant=0):
    cols = ('#2a4a6a', '#7a2a1e', '#4a5a3a', '#6a6a62')
    o = []
    rnd = random.Random(1270 + variant)
    for k, (x, y) in enumerate(((-0.2, -0.15), (0.2, -0.1), (0.0, 0.22))[: 2 + variant % 2]):
        m = _paint(f'vf_drum{(k + variant) % 4}', cols[(k + variant) % 4], 0.8)
        tilt = (0.0, 0.0, 0.0) if rnd.random() < 0.8 else (1.5, 0, rnd.uniform(0, 3))
        o.append(eisen.cylinder(f'd{k}', 0.2, 0.62, (x, y, 0.31 if tilt[0] == 0 else 0.2), m, segments=18, rot=tilt))
        o.append(eisen.cylinder(f'r{k}', 0.205, 0.03, (x, y, 0.45 if tilt[0] == 0 else 0.2), m, segments=18, rot=tilt))
    return eisen.parent_all(o, 'drums')


def pallets():
    wood = ruinen._wood('vf_pal', '#9a7a52')
    rnd = random.Random(1280)
    o = []
    for lv in range(3 + rnd.randrange(2)):
        z = 0.06 + lv * 0.14
        rot = rnd.uniform(-0.1, 0.1)
        for k in range(5):
            o.append(eisen.box(f'b{lv}{k}', (0.8, 0.12, 0.025), (0, -0.36 + k * 0.18, z + 0.05), wood, rot=(0, 0, rot)))
        for k in range(3):
            o.append(eisen.box(f's{lv}{k}', (0.1, 0.8, 0.08), (-0.35 + k * 0.35, 0, z), wood, rot=(0, 0, rot)))
    return eisen.parent_all(o, 'pallets')


def tire_pile():
    tire = _tire()
    rnd = random.Random(1290)
    o = []
    for k in range(6):
        z = 0.08 + k * 0.12 if k < 4 else 0.08
        x = rnd.uniform(-0.06, 0.06) if k < 4 else (-0.3 if k == 4 else 0.32)
        y = rnd.uniform(-0.06, 0.06) if k < 4 else rnd.uniform(-0.3, 0.3)
        o.append(eisen.cylinder(f't{k}', 0.32, 0.13, (x, y, z), tire, segments=18))
        o.append(eisen.cylinder(f'h{k}', 0.16, 0.14, (x, y, z), _dark(), segments=14))
    return eisen.parent_all(o, 'tires')


def cone():
    orange = _paint('vf_cone', '#c85a1e', 0.2, 0.0)
    white = _paint('vf_conew', '#d8d4c8', 0.1, 0.0)
    return eisen.parent_all([eisen.box('base', (0.32, 0.32, 0.03), (0, 0, 0.015), orange),
                             eisen.cylinder('cone', 0.12, 0.42, (0, 0, 0.24), orange, segments=14),
                             eisen.cylinder('band', 0.095, 0.06, (0, 0, 0.3), white, segments=14)], 'cone')


def barrier():
    red = _paint('vf_barr', '#a02a22', 0.3, 0.1)
    white = _paint('vf_barw', '#d8d4c8', 0.3, 0.1)
    steel = _chrome()
    o = []
    for k in range(6):
        o.append(eisen.box(f'b{k}', (0.3, 0.06, 0.2), (-0.75 + k * 0.3, 0, 0.62), red if k % 2 else white))
    for s in (-1, 1):
        for t in (-1, 1):
            o.append(eisen.box(f'l{s}{t}', (0.05, 0.05, 0.75), (s * 0.75, t * 0.12, 0.36), steel, rot=(t * 0.25, 0, 0)))
    return eisen.parent_all(o, 'barrier')


def sandbags():
    sack = W('vf_sand', '#8a7a52', metal=0.0, rough=0.95, rust=0.1, dust=0.7, edge=0.2, grime=0.5, streaks=0.2)
    o = []
    for row in range(3):
        n = 4 - (row % 2)
        for k in range(n):
            x = -0.75 + (k + (row % 2) * 0.5) * 0.5
            o.append(eisen.box(f's{row}{k}', (0.46, 0.32, 0.16), (x, 0, 0.09 + row * 0.15), sack, bevel=0.06))
    return eisen.parent_all(o, 'sandbags')


def fallen_log():
    bark = gw_ground.pmat('vf_bark', lin('#4a3a2a'), 0.95, 0.4, 0.6, 20)
    wood = gw_ground.pmat('vf_core', lin('#a0805a'), 0.9, 0.4, 0.6, 30)
    moss = gw_ground.pmat('vf_moss', lin('#4a5a2a'), 0.95, 0.4, 0.6, 30)
    o = [eisen.cylinder('log', 0.25, 2.8, (0, 0, 0.25), bark, segments=14, rot=(0, math.pi / 2, 0.08))]
    o.append(eisen.cylinder('cut', 0.23, 0.02, (1.41, 0.11, 0.25), wood, segments=14, rot=(0, math.pi / 2, 0.08)))
    for k in range(3):
        o.append(eisen.cylinder(f'br{k}', 0.06, 0.6, (-0.8 + k * 0.7, 0.25, 0.3), bark, segments=8, rot=(0.9, 0.3, k)))
    o.append(eisen.box('moss', (0.8, 0.3, 0.03), (-0.3, 0.02, 0.48), moss, bevel=0.03))
    return eisen.parent_all(o, 'log')


# --------------------------------------------------------------------------- Dachaufbauten (von oben)

def roof_chimney():
    brick = W('vf_ch', '#7a4434', metal=0.0, rough=0.9, rust=0.3, dust=0.5, edge=0.6, grime=0.9, streaks=0.8)
    return eisen.parent_all([eisen.box('c', (0.35, 0.35, 0.4), (0, 0, 0.2), brick, bevel=0.02),
                             eisen.box('top', (0.4, 0.4, 0.05), (0, 0, 0.42), _paint('vf_cht', '#3a3a38', 0.3, 0.2)),
                             eisen.box('soot', (0.2, 0.2, 0.01), (0, 0, 0.45), _dark())], 'chimney')


def roof_antenna():
    steel = _chrome()
    o = [eisen.box('mast', (0.03, 0.03, 0.7), (0, 0, 0.35), steel)]
    for k in range(4):
        o.append(eisen.box(f'el{k}', (0.5 - k * 0.08, 0.02, 0.02), (0, 0.0, 0.4 + k * 0.08), steel, rot=(0, 0, 0.4)))
    return eisen.parent_all(o, 'antenna')


def roof_solar():
    cell = eisen.material('vf_cell', (0.03, 0.05, 0.1), rough=0.1, metal=0.3)
    frame = _chrome()
    o = [eisen.box('frame', (0.9, 0.55, 0.03), (0, 0, 0.05), frame)]
    for i in range(4):
        for j in range(2):
            o.append(eisen.box(f'c{i}{j}', (0.2, 0.24, 0.01), (-0.33 + i * 0.22, -0.13 + j * 0.26, 0.07), cell))
    return eisen.parent_all(o, 'solar')


def roof_skylight():
    glass = eisen.material('vf_sky', (0.1, 0.14, 0.16), rough=0.05, metal=0.2)
    return eisen.parent_all([eisen.box('f', (0.5, 0.4, 0.05), (0, 0, 0.03), _chrome()), eisen.box('g', (0.44, 0.34, 0.02), (0, 0, 0.06), glass)], 'sky')


def roof_dish():
    white = _paint('vf_dish', '#c8c4b8', 0.3, 0.2)
    o = [eisen.cylinder('dish', 0.22, 0.04, (0, 0, 0.25), white, segments=20, rot=(0.6, 0, 0.5)), eisen.box('arm', (0.03, 0.03, 0.3), (0, 0, 0.12), _chrome())]
    return eisen.parent_all(o, 'dish')


# --------------------------------------------------------------------------- Bodenflecken

def stain(kind, v):
    rnd = random.Random(1300 + v + 31 * len(kind))
    o = []
    if kind == 'blood':
        m = gw_ground.pmat('vf_blood', lin('#4a0e0a'), 0.4, 0.3, 0.5, 30)
        for k in range(6 + v * 2):
            r = rnd.uniform(0.04, 0.22) if k else 0.3
            o.append(eisen.cylinder(f'b{k}', r, 0.004, (rnd.uniform(-0.35, 0.35) * (k > 0), rnd.uniform(-0.35, 0.35) * (k > 0), 0.002), m, segments=12))
    elif kind == 'trash':
        mats = [gw_ground.pmat(f'vf_tr{i}', lin(c), 0.9, 0.4, 0.6, 30) for i, c in enumerate(('#d0c8b0', '#4a6a8a', '#8a3a2a', '#c8b040', '#3a3a38'))]
        for k in range(12):
            o.append(eisen.box(f't{k}', (rnd.uniform(0.04, 0.16), rnd.uniform(0.03, 0.12), 0.01), (rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), 0.005), rnd.choice(mats), rot=(0, 0, rnd.uniform(0, 3))))
        for k in range(3):
            o.append(eisen.cylinder(f'can{k}', 0.03, 0.1, (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0.03), _chrome(), segments=8, rot=(math.pi / 2, 0, rnd.uniform(0, 3))))
    elif kind == 'leaves':
        mats = [gw_ground.pmat(f'vf_lf{i}', lin(c), 0.9, 0.4, 0.6, 30) for i, c in enumerate(('#8a5a2a', '#a07a2a', '#6a3a1e', '#7a6a2a'))]
        for k in range(40):
            o.append(eisen.box(f'l{k}', (0.06, 0.04, 0.004), (rnd.gauss(0, 0.22), rnd.gauss(0, 0.22), 0.004 + k * 0.0003), rnd.choice(mats), rot=(0, 0, rnd.uniform(0, 3))))
    elif kind == 'burnt':
        soot = gw_ground.pmat('vf_soot', lin('#1a1816'), 0.95, 0.3, 0.6, 20)
        ash = gw_ground.pmat('vf_ash', lin('#5a5650'), 0.95, 0.3, 0.6, 30)
        o.append(eisen.cylinder('b', 0.45, 0.004, (0, 0, 0.002), soot, segments=20))
        for k in range(10):
            o.append(eisen.cylinder(f'a{k}', rnd.uniform(0.03, 0.1), 0.006, (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0.004), ash, segments=8))
    else:  # tracks: Reifenspuren
        mud = gw_ground.pmat('vf_mud', lin('#3a2e22'), 0.95, 0.4, 0.6, 30)
        for s in (-1, 1):
            for k in range(10):
                o.append(eisen.box(f'r{s}{k}', (0.1, 0.12, 0.004), (-0.45 + k * 0.1, s * 0.25 + math.sin(k * 0.6 + v) * 0.05, 0.002), mud))
    return eisen.parent_all(o, 'stain')
