"""Stätten (lib/staetten.py): Friedhof und Evakuierungs-Sammelstelle, je Bild und Schatten, Varianten <name>.v<n>."""
import eisen
import ruinen
import staetten as st

# Name, Breite, Höhe (Felder), Modellhöhe, Varianten, Bau-Funktion
PARTS = (
    ('grave', 1, 1, 0.8, 5, st.grave),
    ('army-tent', 3, 3, 2.1, 2, st.tent),
    ('medical-tent', 3, 3, 2.1, 1, lambda v: st.tent(2)),
    ('army-truck', 4, 2, 2.0, 2, st.army_truck),
    ('site-fence', 1, 1, 1.9, 1, lambda v: st.site_fence()),
    ('porta-potty', 1, 1, 2.0, 1, lambda v: st.porta_potty()),
    ('body-bags', 2, 1, 0.4, 2, st.body_bags),
    ('cot', 1, 1, 0.5, 1, lambda v: st.cot()),
)


def render(out):
    for name, w, h, height, variants, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.2)
        for v in range(variants):
            key = f'{name}.v{v}'
            eisen.reset(samples=32)
            build(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=14)
            build(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha, half=w > 3)
