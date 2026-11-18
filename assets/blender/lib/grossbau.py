"""Großbauten der alten Welt (eigene Entwürfe für „Letzte Schicht“): Kühlturm (Kraftwerk), Schornstein, Trafo,
Getreidesilo (Bauernhof), Schiffscontainer (Industrie, durchsuchbar, drei Farben), Gefängnis-Wachturm.
Ursprung = Mitte der Grundfläche; x nach Osten, y nach Norden."""
import math
import random

import bauten
import bmesh
import eisen
import gw_ground

lin = gw_ground.lin
W = bauten.weathered


def _concrete(name, hex_='#8e8a82'):
    return W(name, hex_, metal=0.0, rough=0.92, rust=0.3, dust=0.5, edge=0.5, grime=0.9, streaks=0.9,
             rust_hex='#4a4438', dust_hex='#8a8070')


def _lathe(name, profile, mat, segments=40):
    """Drehkörper aus (Radius, Höhe)-Paaren, offen oben und unten, mit Wandstärke über zwei Lagen."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z)) for k in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    return eisen.mesh_obj(name, bm, mat, smooth=True)


def cooling_tower():
    """Kühlturm 6×6: Hyperboloid aus Beton mit Rissen und Laufspuren, dunkles Inneres, Stützenkranz."""
    rnd = random.Random(900)
    con = _concrete('ct_con')
    dark = W('ct_dark', '#3a3a36', metal=0.0, rough=0.95, rust=0.2, dust=0.3, edge=0.2, grime=0.9, streaks=0.9)
    o = []
    def rad(t):
        # Hyperboloid: Fuß 2,85, Taille 2,05 bei 72 % der Höhe, Kragen 2,35
        return 2.05 + 0.8 * (t - 0.72) ** 2 / 0.5184 if t <= 0.72 else 2.05 + 0.3 * ((t - 0.72) / 0.28) ** 2
    prof = [(rad(t), 0.35 + t * 4.2) for t in [i / 16 for i in range(17)]]
    o.append(_lathe('shell', prof, con))
    o.append(_lathe('inner', [(r - 0.08, z) for r, z in prof], dark))
    o.append(eisen.cylinder('pool', 2.7, 0.05, (0, 0, 0.36), eisen.material('ct_water', (0.04, 0.05, 0.05), rough=0.1), segments=40))
    for k in range(24):
        a = 2 * math.pi * k / 24
        o.append(eisen.box(f'leg{k}', (0.12, 0.12, 0.42), (2.8 * math.cos(a), 2.8 * math.sin(a), 0.2), con, rot=(0, 0.25, a)))
    for k in range(6):
        a = rnd.uniform(0, 2 * math.pi)
        z = rnd.uniform(1.0, 3.6)
        r = rad((z - 0.35) / 4.2) + 0.01
        o.append(eisen.box(f'crack{k}', (0.02, 0.02, rnd.uniform(0.3, 0.8)), (r * math.cos(a), r * math.sin(a), z), dark, rot=(rnd.uniform(-0.3, 0.3), 0, a)))
    return eisen.parent_all(o, 'coolingtower')


def chimney():
    """Fabrikschornstein 2×2: Ziegel, Stahlbänder, Steigleiter."""
    brick = W('ch_brick', '#7a4434', metal=0.0, rough=0.9, rust=0.3, dust=0.4, edge=0.6, grime=0.9, streaks=0.8)
    steel = W('ch_steel', '#4a4a46', metal=0.8, rough=0.5, rust=0.7, dust=0.2, edge=0.3)
    o = [_lathe('stack', [(0.85, 0.0), (0.8, 1.0), (0.6, 4.5), (0.55, 5.2)], brick, 28)]
    o.append(eisen.cylinder('top', 0.6, 0.15, (0, 0, 5.2), steel, segments=28))
    o.append(eisen.cylinder('hole', 0.48, 0.16, (0, 0, 5.22), eisen.material('ch_soot', (0.02, 0.02, 0.02)), segments=28))
    for k, z in enumerate((1.2, 2.4, 3.6)):
        r = 0.8 - 0.2 * (z / 4.5) + 0.02
        o.append(eisen.cylinder(f'band{k}', r, 0.06, (0, 0, z), steel, segments=28))
    o.append(eisen.box('base', (1.9, 1.9, 0.5), (0, 0, 0.25), brick, bevel=0.04))
    return eisen.parent_all(o, 'chimney')


def transformer():
    """Trafo 2×2: Kessel mit Kühlrippen, drei Isolatoren, Betonsockel, Rost."""
    con = _concrete('tr_con')
    body = W('tr_body', '#5a6a5a', metal=0.6, rough=0.5, rust=0.6, dust=0.4, edge=0.5, streaks=0.6)
    ins = W('tr_ins', '#8a5a3a', metal=0.0, rough=0.3, rust=0.1, dust=0.3, edge=0.2)
    o = [eisen.box('pad', (1.9, 1.9, 0.12), (0, 0, 0.06), con)]
    o.append(eisen.box('tank', (1.1, 0.9, 0.9), (0, 0, 0.57), body, bevel=0.04))
    for k in range(7):
        o.append(eisen.box(f'fin{k}', (0.05, 0.25, 0.75), (-0.45 + k * 0.15, -0.58, 0.5), body))
        o.append(eisen.box(f'fn{k}', (0.05, 0.25, 0.75), (-0.45 + k * 0.15, 0.58, 0.5), body))
    for k in range(3):
        o.append(eisen.cylinder(f'ins{k}', 0.07, 0.4, (-0.35 + k * 0.35, 0, 1.2), ins, segments=10))
    return eisen.parent_all(o, 'transformer')


def silo():
    """Getreidesilo 3×3: Wellblechzylinder mit Kegeldach, Leiter, Rost."""
    tin = W('si_tin', '#9a9a92', metal=0.8, rough=0.45, rust=0.6, dust=0.3, edge=0.4, streaks=0.8)
    con = _concrete('si_con')
    o = [eisen.cylinder('pad', 1.45, 0.15, (0, 0, 0.075), con, segments=36)]
    o.append(_lathe('body', [(1.3, 0.15), (1.3, 3.4)], tin, 36))
    for k in range(10):
        o.append(eisen.cylinder(f'rib{k}', 1.31, 0.03, (0, 0, 0.4 + k * 0.3), tin, segments=36))
    o.append(_lathe('roof', [(1.36, 3.4), (0.9, 3.75), (0.2, 4.05), (0.05, 4.1)], tin, 36))
    o.append(_lathe('roofin', [(1.3, 3.39), (0.05, 3.4)], tin, 36))
    for k in range(12):
        o.append(eisen.box(f'lad{k}', (0.3, 0.03, 0.03), (0, -1.33, 0.3 + k * 0.27), tin))
    for s in (-1, 1):
        o.append(eisen.box(f'rail{s}', (0.03, 0.03, 3.3), (s * 0.15, -1.33, 1.8), tin))
    return eisen.parent_all(o, 'silo')


CONTAINER_COLORS = ('#7a3426', '#2e4a5e', '#5a6a3a')


def container(variant=0):
    """Schiffscontainer 3×1 (liegt Ost-West): Wellwände, Türen im Osten (eine offen), Rost, Beschriftung."""
    rnd = random.Random(920 + variant)
    body = W(f'co_body{variant}', CONTAINER_COLORS[variant % 3], metal=0.7, rough=0.5, rust=0.8, dust=0.4, edge=0.6, streaks=0.7)
    frame = W('co_frame', '#3a3a36', metal=0.8, rough=0.5, rust=0.7, dust=0.3, edge=0.4)
    dark = eisen.material('co_dark', (0.02, 0.02, 0.02))
    o = []
    L, B, H = 2.9, 0.92, 0.95
    o.append(eisen.box('box', (L, B, H), (0, 0, H / 2), body, bevel=0.02))
    for k in range(14):
        x = -L / 2 + 0.12 + k * 0.2
        o.append(eisen.box(f'rib{k}', (0.06, B + 0.03, H - 0.1), (x, 0, H / 2), body))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.box(f'post{sx}{sy}', (0.08, 0.08, H + 0.02), (sx * (L / 2 - 0.03), sy * (B / 2 - 0.03), H / 2), frame))
    o.append(eisen.box('roofdent', (0.6, 0.5, 0.02), (rnd.uniform(-0.8, 0.8), 0, H + 0.005), frame, rot=(0, 0, 0.2)))
    # Tür im Osten: ein Flügel offen
    o.append(eisen.box('door1', (0.03, B / 2 - 0.02, H - 0.08), (L / 2 + 0.01, -B / 4, H / 2), body))
    o.append(eisen.box('opening', (0.02, B / 2 - 0.04, H - 0.12), (L / 2 + 0.005, B / 4, H / 2), dark))
    o.append(eisen.box('door2', (B / 2 - 0.02, 0.03, H - 0.08), (L / 2 + B / 4, B / 2 + 0.01, H / 2), body))
    return eisen.parent_all(o, 'container')


def prison_tower():
    """Gefängnis-Wachturm 2×2: Betonschaft, verglaste Kanzel, Scheinwerfer, Flachdach."""
    con = _concrete('pt_con', '#8a877e')
    glass = eisen.material('pt_glass', (0.05, 0.07, 0.08), rough=0.05, metal=0.2)
    steel = W('pt_steel', '#4a4a46', metal=0.8, rough=0.5, rust=0.5, dust=0.2, edge=0.3)
    o = [eisen.box('shaft', (1.0, 1.0, 2.2), (0, 0, 1.1), con, bevel=0.03)]
    o.append(eisen.box('floor', (1.8, 1.8, 0.15), (0, 0, 2.25), con))
    o.append(eisen.box('cabin', (1.5, 1.5, 0.75), (0, 0, 2.7), glass))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(eisen.box(f'p{sx}{sy}', (0.1, 0.1, 0.75), (sx * 0.72, sy * 0.72, 2.7), steel))
    o.append(eisen.box('roof', (1.9, 1.9, 0.12), (0, 0, 3.12), con))
    o.append(eisen.cylinder('lamp', 0.14, 0.25, (0.6, -0.9, 3.0), steel, segments=12, rot=(1.2, 0, 0)))
    for k in range(3):
        o.append(eisen.box(f'rail{k}', (1.8, 0.04, 0.04), (0, -0.9, 2.35 + k * 0.15), steel))
    return eisen.parent_all(o, 'prisontower')
