"""Item-Symbole des späten Spiels: Beton, Montagemaschine 3, Radar."""
import math

import anlagen
import eisen
import spaet
import stufen


def finish(out, name, root=None, scale=1.0, z=0.0, rot=0.0):
    if root is not None:
        root.scale = (scale, scale, scale)
        root.location.z += z
        if rot:
            root.rotation_euler = (0, 0, math.radians(rot))
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add(name, 'items', [out.render_frame(name, 0)], (0.5, 0.5))


def concrete(m):
    mat = eisen.material('conc', eisen.srgb('#8f8a80'), rough=0.9, noise=0.3, noise_scale=30)
    o = [eisen.box(f'b{k}', (0.5, 0.5, 0.12), (-0.08 + k * 0.08, -0.06 + k * 0.06, 0.06 + k * 0.12), mat, bevel=0.02) for k in range(3)]
    return eisen.parent_all(o, 'concrete')


def render(out):
    eisen.reset(samples=40)
    finish(out, 'item.concrete', concrete(anlagen.Mats()), scale=1.2, rot=15)
    builds = [
        ('assembling-machine-3', lambda m: stufen.assembler3(m, 0.0), 0.3), ('radar', lambda m: spaet.radar(m, 0.1), 0.28),
    ]
    for item, fn, sc in builds:
        eisen.reset(samples=40)
        finish(out, f'item.{item}', fn(anlagen.Mats()), scale=sc, z=-0.05)
