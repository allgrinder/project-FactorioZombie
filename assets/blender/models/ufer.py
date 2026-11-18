"""Ufer und Zeltplatz (lib/ufer.py): Ruderboot, Kuppelzelt, Feuerstelle (<name>.v<n>) mit Schatten."""
import eisen
import ruinen
import ufer


def render(out):
    canvas, anchor, sh, sha = ruinen.spec(2, 1, 0.5, margin=0.3)
    for v in range(3):
        key = f'rowboat.v{v}'
        eisen.reset(samples=32)
        ufer.rowboat(v)
        eisen.camera(*canvas, anchor=anchor)
        out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
        eisen.reset(samples=14)
        ufer.rowboat(v)
        eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha)
    for name, w, h, height, n, fn in (('dome-tent', 2, 2, 1.2, 3, ufer.dome_tent), ('fire-ring', 1, 1, 0.2, 1, lambda v: ufer.fire_ring())):
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.25)
        for v in range(n):
            key = f'{name}.v{v}'
            eisen.reset(samples=32)
            fn(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=14)
            fn(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha)
