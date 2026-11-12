"""Lager und Verteidigung (lib/lager.py) sowie die Symbole der neuen Gegenstände (lib/kram.py)."""
import math

import anlagen
import eisen
import kram
import lager
import ruinen


def icon(out, name, root, scale=1.0, z=0.0, rot=0.0, tilt=0.0):
    root.scale = (scale, scale, scale)
    root.location.z += z
    root.rotation_euler = (math.radians(tilt), 0, root.rotation_euler[2] + math.radians(rot))
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add(name, 'items', [out.render_frame(name, 0)], (0.5, 0.5))


# Name, Grundfläche, Höhe, Bau-Funktion, Symbolmaßstab
BUILDINGS = (
    ('wooden-barricade', 1, 1, 0.9, lager.barricade, 0.8),
    ('gate', 1, 1, 1.0, lambda m=None: lager.gate(m, False), 0.8),
    ('barbed-wire', 1, 1, 0.5, lager.barbed_wire, 0.8),
    ('spike-trap', 1, 1, 0.3, lager.spike_trap, 0.85),
    ('bed', 1, 2, 0.5, lager.bed, 0.45),
    ('garden', 2, 2, 0.5, lambda m=None: lager.garden(m, 1.0), 0.42),
    ('rain-barrel', 1, 1, 1.0, lager.rain_barrel, 0.75),
)


def render(out):
    for name, w, h, height, build, iscale in BUILDINGS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height)
        anlagen.building(out, name, lambda m, ph, b=build: b(m), canvas, anchor, sh, sha, frames=1, samples=40)
        eisen.reset(samples=40)
        icon(out, f'item.{name}', build(), iscale, rot=20)
    # Tor offen, kahles Beet
    canvas, anchor, sh, sha = ruinen.spec(1, 1, 1.0)
    eisen.reset(samples=40)
    lager.gate(None, True)
    eisen.camera(*canvas, anchor=anchor)
    out.add('gate.open', 'entities', [out.render_frame('gate.open', 0)], anchor)
    canvas, anchor, sh, sha = ruinen.spec(2, 2, 0.5)
    eisen.reset(samples=40)
    lager.garden(None, 0.0)
    eisen.camera(*canvas, anchor=anchor)
    out.add('garden.bare', 'entities', [out.render_frame('garden.bare', 0)], anchor)
    # Funkturm mit Warnlicht (Leuchtebene im Betrieb)
    canvas, anchor, sh, sha = ruinen.spec(3, 3, 5.2)
    anlagen.building(out, 'radio-tower', lambda m, ph: lager.radio_tower(m, ph, 0.0), canvas, anchor, sh, sha, frames=1, samples=40,
                     glow=([1.0], lambda m, lv: lager.radio_tower(m, 0.0, lv)))
    eisen.reset(samples=40)
    icon(out, 'item.radio-tower', lager.radio_tower(None, 0, 0), 0.19, z=0.0, rot=20)
    # Gegenstände
    items = (
        ('canned-food', lambda: kram.can(), 1.0, 15), ('snack', kram.snack, 1.0, 10), ('vegetables', kram.vegetables, 1.0, 0),
        ('stew', kram.stew, 1.0, 0), ('water-bottle', lambda: kram.bottle(True), 1.0, 0), ('empty-bottle', lambda: kram.bottle(False), 1.0, 0),
        ('soda', lambda: kram.bottle(True, True), 1.0, 0), ('coffee', kram.coffee, 1.0, 15), ('cloth', kram.cloth, 1.0, 20),
        ('bandage', kram.bandage, 1.1, 0), ('first-aid-kit', kram.first_aid, 1.0, 20), ('antibiotics', kram.antibiotics, 1.0, 0),
        ('axe', kram.axe, 1.0, 0), ('crowbar', kram.crowbar, 1.0, 0), ('baseball-bat', kram.bat, 1.0, 0), ('spear', kram.spear, 1.0, 0),
        ('knife', kram.knife, 1.0, 0), ('radio-parts', kram.radio_parts, 1.0, 20), ('noise-lure', kram.noise_lure, 1.0, 10),
    )
    for name, fn, scale, rot in items:
        eisen.reset(samples=44)
        icon(out, f'item.{name}', fn(), scale, rot=rot)
