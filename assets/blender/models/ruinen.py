"""Fundorte der alten Welt (lib/ruinen.py): Wracks, Ruinen, Kisten, Container – je mit Schatten – und Asphalt.
Varianten heißen <name>.v<n>; das Spiel wählt sie nach der Gebäude-ID."""
import eisen
import ruinen

# Name, Grundfläche, Höhe, Varianten, Bau-Funktion
SITES = (
    ('car-wreck', 3, 2, 0.9, 3, ruinen.car_wreck),
    ('ruin-house', 5, 4, 2.0, 2, ruinen.ruin_house),
    ('ruin-shed', 3, 3, 1.4, 2, ruinen.ruin_shed),
    ('ruin-store', 6, 4, 1.5, 2, ruinen.ruin_store),
    ('ruin-garage', 4, 4, 1.6, 2, ruinen.ruin_garage),
    ('supply-crate', 1, 1, 0.7, 1, lambda v: ruinen.supply_crate(False)),
    ('military-crate', 1, 1, 0.6, 1, lambda v: ruinen.supply_crate(True)),
    ('dumpster', 2, 1, 1.1, 1, ruinen.dumpster),
)


def render(out):
    for name, w, h, height, variants, build in SITES:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height)
        for v in range(variants):
            key = f'{name}.v{v}'
            eisen.reset(samples=40)
            build(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=24)
            build(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha, half=w > 3)
    for v in range(4):
        eisen.reset(samples=32, ground=False)
        ruinen.asphalt(v)
        eisen.camera(1.0, 1.0)
        out.add(f'floor.asphalt.{v}', 'decals', [out.render_frame(f'floor.asphalt.{v}', 0)], (0.5, 0.5))
