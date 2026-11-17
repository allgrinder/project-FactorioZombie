"""Pritschenwagen (lib/fahrzeug.py): fahrbereit in 16 Winkeln (0 = Osten, im Uhrzeigersinn) je mit Schatten,
das Wrack am Startfundort (pickup-wreck.v0) und das Symbol des Benzinkanisters."""
import math

import eisen
import fahrzeug
import ruinen

DIRS = 16


def render(out):
    for k in range(DIRS):
        name = f'pickup.{k}'
        eisen.reset(samples=36)
        root = fahrzeug.pickup()
        root.rotation_euler = (0, 0, -k * math.pi / 8)
        eisen.camera(4.0, 4.0, anchor=(0.5, 0.56))
        out.add(name, 'entities', [out.render_frame(name, 0)], (0.5, 0.56))
        eisen.reset(samples=24)
        root = fahrzeug.pickup()
        root.rotation_euler = (0, 0, -k * math.pi / 8)
        eisen.shadow_render(out, f'{name}.shadow', 'entities', (4.5, 4.5), (0.5, 0.5), half=True)
    canvas, anchor, sh, sha = ruinen.spec(3, 2, 0.9)
    eisen.reset(samples=40)
    fahrzeug.pickup(wreck=True)
    eisen.camera(*canvas, anchor=anchor)
    out.add('pickup-wreck.v0', 'entities', [out.render_frame('pickup-wreck.v0', 0)], anchor)
    eisen.reset(samples=24)
    fahrzeug.pickup(wreck=True)
    eisen.shadow_render(out, 'pickup-wreck.v0.shadow', 'entities', sh, sha, half=True)
    eisen.reset(samples=40)
    root = fahrzeug.fuel_can()
    root.scale = (1.1, 1.1, 1.1)
    root.rotation_euler = (0, 0, math.radians(25))
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add('item.fuel-can', 'items', [out.render_frame('item.fuel-can', 0)], (0.5, 0.5))
