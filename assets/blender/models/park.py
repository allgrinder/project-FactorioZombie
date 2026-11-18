"""Park (lib/park.py): Brunnen, Rutsche, Sandkasten, Klettergerüst, Steg als <name>.v0 mit Schatten."""
import eisen
import park
import ruinen

PARTS = (
    ('fountain', 3, 3, 1.5, park.fountain), ('slide', 2, 1, 1.4, park.slide), ('sandbox', 2, 2, 0.3, park.sandbox),
    ('climber', 2, 2, 1.6, park.climber), ('jetty', 2, 1, 0.3, park.jetty),
)


def render(out):
    for name, w, h, height, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.2)
        key = f'{name}.v0'
        eisen.reset(samples=32)
        build()
        eisen.camera(*canvas, anchor=anchor)
        out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
        eisen.reset(samples=12)
        build()
        eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha)
