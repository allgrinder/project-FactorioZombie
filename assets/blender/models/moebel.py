"""Mehr Möbel (lib/moebel.py): je Stück Bild und Schatten (<name>, <name>.shadow)."""
import eisen
import moebel
import ruinen


def render(out):
    for name, (w, h, height, build) in moebel.PIECES.items():
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.12)
        eisen.reset(samples=32)
        build()
        eisen.camera(*canvas, anchor=anchor)
        out.add(name, 'entities', [out.render_frame(name, 0)], anchor)
        eisen.reset(samples=12)
        build()
        eisen.shadow_render(out, f'{name}.shadow', 'entities', sh, sha)
