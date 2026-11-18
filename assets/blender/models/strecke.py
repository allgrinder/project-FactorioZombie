"""Bahnstrecke (lib/strecke.py): rail.slice.<v> von oben (1×3 Felder), Wagen und Lok als Fundorte <name>.v<n>."""
import eisen
import ruinen
import strecke

PARTS = (
    ('freight-car', 6, 2, 1.9, 3, strecke.freight_car),
    ('tank-car', 6, 2, 1.9, 2, strecke.tank_car),
    ('locomotive', 7, 2, 2.0, 1, lambda v: strecke.locomotive()),
    ('platform-roof', 6, 2, 1.8, 1, lambda v: strecke.platform_roof()),
)


def render(out):
    for v in range(4):
        eisen.reset(samples=16, ground=False)
        strecke.rail_slice(v)
        eisen.camera(1.0, 3.0, tilt=0.0)
        out.add(f'rail.slice.{v}', 'decals', [out.render_frame(f'rail.slice.{v}', 0)], (0.5, 0.5))
    for name, w, h, height, variants, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.3)
        for v in range(variants):
            key = f'{name}.v{v}'
            eisen.reset(samples=28)
            build(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=12)
            build(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha, half=True)
