"""Ausrüstung (lib/ausruestung.py): Symbole item.fishing-rod, item.raw-fish, item.cooked-fish, item.warm-coat."""
import eisen
import ausruestung as ar

ITEMS = (('fishing-rod', ar.rod), ('raw-fish', lambda: ar.fish(False)), ('cooked-fish', lambda: ar.fish(True)), ('warm-coat', ar.coat))


def render(out):
    for name, fn in ITEMS:
        eisen.reset(samples=40)
        fn()
        eisen.camera(1, 1, anchor=(0.5, 0.56))
        out.add(f'item.{name}', 'items', [out.render_frame(f'item.{name}', 0)], (0.5, 0.5))
