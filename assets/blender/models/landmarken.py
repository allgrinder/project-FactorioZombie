"""Landmarken (lib/landmarken.py): Windradturm turbine.v0 und Rotor turbine.rotor (6 Drehbilder; .broken 1 Bild),
Hochspannungsmast pylon.v0, Wohnwagen caravan.v<n>, Sägewerk saw-hall.v0, Stammstapel log-stack.v0,
Parkplatz-Markierung decal.parking.<n>."""
import math

import eisen
import landmarken as lm
import ruinen

TAN = math.tan(eisen.TILT)


def render(out):
    # Windrad: Turm mit Schatten, Rotor getrennt (gleicher Anker, wird über den Turm gelegt)
    canvas, anchor, sh, sha = ruinen.spec(3, 3, lm.HUB + 4.4, margin=1.6)
    eisen.reset(samples=32)
    lm.turbine_tower()
    eisen.camera(*canvas, anchor=anchor)
    out.add('turbine.v0', 'entities', [out.render_frame('turbine.v0', 0)], anchor)
    eisen.reset(samples=12)
    lm.turbine_tower()
    lm.turbine_rotor(0.0)
    eisen.shadow_render(out, 'turbine.v0.shadow', 'entities', (sh[0] + 6, sh[1] + 4), sha, half=True)
    frames = []
    for f in range(6):
        eisen.reset(samples=24, ground=False)
        lm.turbine_rotor(f / 6)
        eisen.camera(*canvas, anchor=anchor)
        frames.append(out.render_frame('turbine.rotor', f))
    out.add('turbine.rotor', 'entities', frames, anchor, fps=6)
    eisen.reset(samples=24, ground=False)
    lm.turbine_rotor(0.15, broken=True)
    eisen.camera(*canvas, anchor=anchor)
    out.add('turbine.broken', 'entities', [out.render_frame('turbine.broken', 0)], anchor)
    for name, w, h, height, n, fn in (('pylon', 2, 2, 7.4, 1, lambda v: lm.pylon()), ('caravan', 3, 2, 1.7, 3, lm.caravan),
                                       ('saw-hall', 6, 4, 3.0, 1, lambda v: lm.saw_hall()), ('log-stack', 3, 2, 1.1, 1, lambda v: lm.log_stack())):
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.4)
        for v in range(n):
            key = f'{name}.v{v}'
            eisen.reset(samples=28)
            fn(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=12)
            fn(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', (sh[0] + height * 0.6, sh[1] + height * 0.3), sha, half=True)
    for v in range(2):
        eisen.reset(samples=12, ground=False)
        lm.parking(v)
        eisen.camera(1.0, 2.0, tilt=0.0)
        out.add(f'decal.parking.{v}', 'decals', [out.render_frame(f'decal.parking.{v}', 0)], (0.5, 0.5))
