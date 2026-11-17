"""Basis und Plündern (lib/basis.py): Schrotthaufen (je 2 Varianten + halb), Lagerfeuer, Feuerschale, Scheinwerfer
(mit Leuchtebene), Wachturm (Sockel + Schütze in 16 Richtungen), Sammelstelle, Versorgungsabwurf mit Fallschirm,
Requisiten und Symbole."""
import math

import anlagen
import basis
import eisen
import ruinen

PILES = (('scrap-pile', 'scrap'), ('rubble-pile', 'rubble'), ('coal-pile', 'coal'), ('parts-pile', 'parts'), ('ewaste-pile', 'ewaste'))
DIRS = 16


def icon(out, name, root, scale=1.0, z=0.0, rot=20.0):
    root.scale = (scale, scale, scale)
    root.location.z += z
    root.rotation_euler = (0, 0, root.rotation_euler[2] + math.radians(rot))
    eisen.camera(1, 1, anchor=(0.5, 0.56))
    out.add(name, 'items', [out.render_frame(name, 0)], (0.5, 0.5))


def static(out, name, build, w, h, height, samples=36):
    """Ein Bild + Schatten (Gebäude ohne Arbeitsanimation)."""
    canvas, anchor, sh, sha = ruinen.spec(w, h, height)
    anlagen.building(out, name, lambda m, ph: build(), canvas, anchor, sh, sha, frames=1, samples=samples)


def render(out):
    # Schrotthaufen: zwei Varianten und ein halb ausgeschlachteter
    for name, kind in PILES:
        canvas, anchor, sh, sha = ruinen.spec(2, 2, 0.6)
        for v in range(2):
            eisen.reset(samples=36)
            basis.pile(kind, v, 1.0)
            eisen.camera(*canvas, anchor=anchor)
            out.add(f'{name}.v{v}', 'entities', [out.render_frame(f'{name}.v{v}', 0)], anchor)
        eisen.reset(samples=24)
        basis.pile(kind, 0, 1.0)
        eisen.shadow_render(out, f'{name}.v0.shadow', 'entities', sh, sha)
        eisen.shadow_render(out, f'{name}.v1.shadow', 'entities', sh, sha)
        eisen.reset(samples=36)
        basis.pile(kind, 1, 0.4)
        eisen.camera(*canvas, anchor=anchor)
        out.add(f'{name}.half', 'entities', [out.render_frame(f'{name}.half', 0)], anchor)
    canvas, anchor, sh, sha = ruinen.spec(2, 1, 0.6)
    for v in range(2):
        eisen.reset(samples=36)
        basis.pile('wood', v)
        eisen.camera(*canvas, anchor=anchor)
        out.add(f'wood-pile.v{v}', 'entities', [out.render_frame(f'wood-pile.v{v}', 0)], anchor)
        eisen.reset(samples=24)
        basis.pile('wood', v)
        eisen.shadow_render(out, f'wood-pile.v{v}.shadow', 'entities', sh, sha)
    eisen.reset(samples=36)
    basis.pile('wood', 1, 0.4)
    eisen.camera(*canvas, anchor=anchor)
    out.add('wood-pile.half', 'entities', [out.render_frame('wood-pile.half', 0)], anchor)

    # Feuer und Licht: ruhendes Bild + Leuchtebene (Flammen)
    for name, fn, w, h, height in (('campfire', basis.campfire, 2, 2, 1.0), ('brazier', basis.brazier, 1, 1, 1.0), ('floodlight', basis.floodlight, 1, 1, 1.9)):
        canvas, anchor, sh, sha = ruinen.spec(w, h, height)
        anlagen.building(out, name, lambda m, ph, f=fn: f(m, 0.0), canvas, anchor, sh, sha, frames=1, samples=36,
                         glow=([1.0, 0.8, 1.15, 0.9] if name != 'floodlight' else [1.0], lambda m, lv, f=fn: f(m, lv)))

    # Wachturm: Sockel und Schütze (16 Richtungen)
    canvas, anchor, sh, sha = ruinen.spec(2, 2, 2.6)
    anlagen.building(out, 'watchtower.base', lambda m, ph: basis.watchtower_base(m), canvas, anchor, sh, sha, frames=1, samples=36)
    frames = []
    for k in range(DIRS):
        eisen.reset(samples=28)
        root = basis.watchtower_head()
        root.rotation_euler = (0, 0, -k / DIRS * math.tau)
        eisen.camera(*canvas, anchor=anchor)
        frames.append(out.render_frame('watchtower.head', k))
    out.add('watchtower.head', 'entities', frames, anchor, meta={'angles': DIRS})

    static(out, 'scavenger-camp', basis.scavenger_camp, 3, 3, 1.3)
    canvas, anchor, sh, sha = ruinen.spec(2, 2, 0.9)
    anlagen.building(out, 'airdrop.v0', lambda m, ph: basis.airdrop_crate(m), canvas, anchor, sh, sha, frames=1, samples=36)
    eisen.reset(samples=28)
    basis.parachute()
    canvas, anchor, _, _ = ruinen.spec(3, 3, 2.7, margin=0.1)
    eisen.camera(*canvas, anchor=anchor)
    out.add('airdrop.chute', 'entities', [out.render_frame('airdrop.chute', 0)], anchor)

    # Requisiten
    for hz, key in ((True, 'fence.h'), (False, 'fence.v')):
        static(out, key, lambda hz=hz: basis.fence(hz), 1, 1, 0.9, samples=28)
    static(out, 'hay-bale', basis.hay_bale, 1, 1, 0.9, samples=28)
    static(out, 'town-sign', basis.town_sign, 1, 1, 1.3, samples=28)
    static(out, 'utility-pole', basis.utility_pole, 1, 1, 2.7, samples=28)
    static(out, 'street-lamp', basis.street_lamp, 1, 1, 2.4, samples=28)

    # Symbole
    for name, fn, scale in (
        ('campfire', lambda: basis.campfire(None, 0.6), 0.42), ('brazier', lambda: basis.brazier(None, 0.6), 0.75), ('floodlight', basis.floodlight, 0.5),
        ('watchtower', lambda: _tower_icon(), 0.32), ('scavenger-camp', basis.scavenger_camp, 0.3), ('scavenger-kit', basis.scavenger_kit, 1.0),
        ('backpack', basis.backpack, 0.95),
    ):
        eisen.reset(samples=44)
        icon(out, f'item.{name}', fn(), scale)


def _tower_icon():
    b = basis.watchtower_base()
    h = basis.watchtower_head()
    h.parent = b
    return b
