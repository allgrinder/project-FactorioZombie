"""Flurstücke (lib/flurstuecke.py): Hochsitz, Vogelscheuche, Wegkreuz, Wegweiser, Feldsteinmauer – <name>.v<n> mit Schatten."""
import eisen
import flurstuecke as fs
import ruinen

PARTS = (
    ('hunting-stand', 2, 2, 3.6, 1, lambda v: fs.hunting_stand()), ('scarecrow', 1, 1, 2.0, 3, fs.scarecrow),
    ('wayside-cross', 1, 1, 2.3, 1, lambda v: fs.wayside_cross()), ('signpost', 1, 1, 2.0, 2, fs.signpost),
    ('field-wall', 1, 1, 0.6, 3, fs.stone_wall),
)


def render(out):
    for name, w, h, height, variants, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.25)
        for v in range(variants):
            key = f'{name}.v{v}'
            eisen.reset(samples=28)
            build(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=12)
            build(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', (sh[0] + height * 0.5, sh[1] + height * 0.25), sha)
