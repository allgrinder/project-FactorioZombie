"""Wurfgegenstände: Granate, Klippensprengstoff (Sprengladungen mit Zünder im Fass); dazu Massengreifarm und Militärpaket."""
import math

import anlagen
import eisen
import kleinteile


def finish(out, name, root, scale=1.0, z=0.0):
    root.scale = (scale, scale, scale)
    root.location.z += z
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add(name, 'items', [out.render_frame(name, 0)], (0.5, 0.5))


def grenade(m):
    """Stielgranate aus Rohrstück: geriffelter Körper, Zündkopf mit Splint und Ring."""
    o = []
    body = kleinteile.W('k_gren', '#4f5a3e', metal=0.5, rough=0.5, rust=0.3, dust=0.4, edge=0.6)
    o.append(eisen.cylinder('body', 0.17, 0.34, (0, 0, 0.2), body, segments=24, bevel=0.06))
    for k in range(4):
        o.append(eisen.cylinder(f'rib{k}', 0.178, 0.02, (0, 0, 0.08 + k * 0.08), m.dark, segments=24))
    o.append(eisen.cylinder('fuse', 0.07, 0.1, (0, 0, 0.41), m.steel, segments=16, bevel=0.01))
    o.append(eisen.box('lever', (0.04, 0.03, 0.28), (0.1, 0, 0.32), m.steel, bevel=0.006, rot=(0, 0.25, 0)))
    o.append(eisen.cylinder('ring', 0.05, 0.012, (-0.1, 0, 0.45), m.bright, segments=16, rot=(math.pi / 2, 0, 0)))
    return eisen.parent_all(o, 'grenade')


def cliff_explosives(m):
    """Fass mit Warnstreifen, obenauf ein Bündel Sprengladungen mit Zündschnur und Granate als Zünder."""
    o = []
    o.append(eisen.cylinder('barrel', 0.22, 0.42, (0, 0, 0.21), m.paint, segments=28, bevel=0.03))
    o.append(eisen.cylinder('haz', 0.225, 0.1, (0, 0, 0.22), m.hazard, segments=28))
    red = kleinteile.W('k_tnt', '#8a2f22', metal=0.0, rough=0.7, rust=0.0, dust=0.3, edge=0.2)
    for k in range(5):
        a = k / 5 * math.tau
        o.append(eisen.cylinder(f'stick{k}', 0.05, 0.3, (math.cos(a) * 0.09, math.sin(a) * 0.09, 0.56), red, segments=12, bevel=0.01))
    o.append(eisen.cylinder('tape', 0.15, 0.05, (0, 0, 0.56), m.dark, segments=20))
    o.append(eisen.cylinder('det', 0.05, 0.12, (0, 0, 0.74), m.steel, segments=12))
    return eisen.parent_all(o, 'cliffexp')


def bulk_inserter_icon():
    m = kleinteile.Mats('#4f7a3a', 2)
    base = kleinteile.inserter_base(m, False)
    arm = kleinteile.inserter_arm(m, 0.55)
    arm.rotation_euler = (0, 0, math.radians(-40))
    return eisen.parent_all([base, arm])


def render(out):
    eisen.reset(samples=48)
    finish(out, 'item.bulk-inserter', bulk_inserter_icon(), 0.92, -0.1)
    eisen.reset(samples=48)
    finish(out, 'item.military-science-pack', anlagen.flask(anlagen.Mats(), (0.18, 0.17, 0.16)), 1.2, -0.08)
    for name, fn, sc in (('item.grenade', grenade, 1.1), ('item.cliff-explosives', cliff_explosives, 0.95)):
        eisen.reset(samples=48)
        root = fn(kleinteile.Mats('#5d6248', 2))
        root.rotation_euler = (0, 0, math.radians(25))
        finish(out, name, root, sc, -0.08)
