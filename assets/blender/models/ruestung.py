"""Rüstung (Symbol): schwere Rüstung als Brustpanzer im Endzeit-Stil."""
import math

import eisen
import kleinteile


def finish(out, name, root, scale=1.0, z=0.0, rot=25):
    root.scale = (scale, scale, scale)
    root.location.z += z
    root.rotation_euler = (0, 0, math.radians(rot))
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add(name, 'items', [out.render_frame(name, 0)], (0.5, 0.5))


def armor(m, plate_hex, accent_hex):
    """Brustpanzer liegend: Brust- und Rückenplatte, Schulterstücke, Gürtel, Nieten."""
    o = []
    plate = kleinteile.W('r_plate', plate_hex, metal=0.6, rough=0.45, rust=0.35, dust=0.4, edge=0.7)
    accent = kleinteile.W('r_acc', accent_hex, metal=0.3, rough=0.55, rust=0.1, dust=0.3, edge=0.5)
    o.append(eisen.box('chest', (0.5, 0.62, 0.12), (0, 0, 0.08), plate, bevel=0.05))
    o.append(eisen.box('neck', (0.22, 0.08, 0.06), (0, 0.33, 0.13), m.dark, bevel=0.02))
    for s in (-1, 1):
        o.append(eisen.cylinder(f'sh{s}', 0.12, 0.2, (s * 0.31, 0.2, 0.12), accent, segments=20, bevel=0.03, rot=(0, math.pi / 2, 0)))
        o.append(eisen.box(f'strap{s}', (0.06, 0.5, 0.03), (s * 0.15, 0.0, 0.155), m.dark, bevel=0.01))
    o.append(eisen.box('belt', (0.54, 0.09, 0.08), (0, -0.28, 0.12), m.dark, bevel=0.02))
    o.append(eisen.box('buckle', (0.09, 0.07, 0.03), (0, -0.28, 0.17), m.bright, bevel=0.01))
    for k, (x, y) in enumerate(((-0.2, 0.22), (0.2, 0.22), (-0.2, -0.18), (0.2, -0.18))):
        o.append(eisen.cylinder(f'rv{k}', 0.018, 0.02, (x, y, 0.145), m.bright, segments=10))
    return eisen.parent_all(o, 'armor')


def render(out):
    eisen.reset(samples=48)
    finish(out, 'item.heavy-armor', armor(kleinteile.Mats('#5d6248', 2), '#5a5c56', '#6b4a2e'), 1.05, -0.05)
