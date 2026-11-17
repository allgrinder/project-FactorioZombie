"""Besondere Orte (lib/orte.py): Polizeiwache, Arztpraxis, Tankstelle – je ein Bild mit Schatten (Variante v0)."""
import eisen
import orte


def render(out):
    for name, build, w, h, height in orte.SPECS:
        canvas, anchor, sh, sha = orte.spec(w, h, height)
        key = f'{name}.v0'
        eisen.reset(samples=40)
        build(0)
        eisen.camera(*canvas, anchor=anchor)
        out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
        eisen.reset(samples=24)
        build(0)
        eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha, half=True)
