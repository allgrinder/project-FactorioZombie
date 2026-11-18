"""Schrift (eigener Entwurf): mit dem Pinsel auf Dächer und Straßen gemalte Botschaften, von oben (decal.paint.<n>).
Blenders eingebaute Schrift als Werkzeug; Farbe mit Tropfen und Lücken, leicht schräg."""
import math
import random

import bpy
import eisen

MESSAGES = (('SOS', '#e8e4dc', 3.0), ('HILFE', '#e8e4dc', 4.0), ('INFIZIERT', '#a82a20', 5.0), ('LEBEN HIER', '#e8e4dc', 5.0),
            ('NICHT BETRETEN', '#a82a20', 6.0), ('SOS', '#a82a20', 3.0))


def paint(text, hex_, width, seed):
    rnd = random.Random(seed)
    bpy.ops.object.text_add(location=(0, 0, 0.002))
    ob = bpy.context.object
    ob.data.body = text
    ob.data.align_x = 'CENTER'
    ob.data.align_y = 'CENTER'
    ob.data.extrude = 0.001
    ob.data.size = 1.0
    bpy.context.view_layer.update()
    w = max(ob.dimensions.x, 0.01)
    k = width / w
    ob.scale = (k, k * rnd.uniform(0.9, 1.15), 1)
    ob.rotation_euler = (0, 0, rnd.uniform(-0.08, 0.08))
    mat = eisen.material('paint' + hex_, eisen.srgb(hex_), rough=0.8)
    ob.data.materials.append(mat)
    # Tropfen und Spritzer
    for k in range(int(width * 6)):
        x = rnd.uniform(-width / 2, width / 2)
        ln = rnd.uniform(0.08, 0.3)
        eisen.box(f'drip{k}', (rnd.uniform(0.015, 0.03), ln, 0.001), (x, -0.42 - ln / 2, 0.0005), mat)
    return ob


def render(out):
    for i, (text, col, width) in enumerate(MESSAGES):
        eisen.reset(samples=12, ground=False)
        paint(text, col, width * 0.85, 7000 + i)
        h = 2.0
        eisen.camera(width, h, tilt=0.0)
        out.add(f'decal.paint.{i}', 'decals', [out.render_frame(f'decal.paint.{i}', 0)], (0.5, 0.5))
