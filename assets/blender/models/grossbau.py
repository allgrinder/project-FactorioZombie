"""Großbauten (lib/grossbau.py): Kühlturm, Schornstein, Trafo, Silo, Schiffscontainer (3 Varianten), Gefängnis-
Wachturm – je Bild und Schatten."""
import eisen
import grossbau
import ruinen

PARTS = (
    # Name, Breite, Höhe (Felder), Modellhöhe, Bau-Funktion
    ('cooling-tower', 6, 6, 4.6, grossbau.cooling_tower),
    ('chimney', 2, 2, 5.3, grossbau.chimney),
    ('transformer', 2, 2, 1.5, grossbau.transformer),
    ('silo', 3, 3, 4.2, grossbau.silo),
    ('prison-tower', 2, 2, 3.3, grossbau.prison_tower),
)


def render(out):
    for name, w, h, height, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height)
        eisen.reset(samples=36)
        build()
        eisen.camera(*canvas, anchor=anchor)
        out.add(name, 'entities', [out.render_frame(name, 0)], anchor)
        eisen.reset(samples=16)
        build()
        sh2 = (sh[0] + height, sh[1] + height * 0.6)
        eisen.shadow_render(out, f'{name}.shadow', 'entities', sh2, ((w / 2 + 0.25) / sh2[0], (h / 2 + 0.25) / sh2[1]), half=True)
    canvas, anchor, sh, sha = ruinen.spec(3, 1, 1.0)
    for v in range(3):
        key = f'container.v{v}'
        eisen.reset(samples=32)
        grossbau.container(v)
        eisen.camera(*canvas, anchor=anchor)
        out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
        eisen.reset(samples=16)
        grossbau.container(v)
        eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha)
