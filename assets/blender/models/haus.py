"""Begehbare Häuser (lib/haus.py): Wandstücke hwall.<bauart>.<maske> (16 Masken, Schatten je Maske gemeinsam),
Fenster hwin.<bauart>.<achse>[.broken], Türen hdoor.<achse>[.open], Bretter boards.<achse>.<n>, Möbel, Böden
floor.planks/floor.tiles und Dachkacheln roof.<art>.<teil>.<v> bzw. roof.flat.<v> (von oben, ohne Neigung)."""
import eisen
import haus
import ruinen


def piece(out, name, build, w=1, h=1, height=haus.H, shadow=None, samples=24):
    canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.12)
    eisen.reset(samples=samples)
    build()
    eisen.camera(*canvas, anchor=anchor)
    out.add(name, 'entities', [out.render_frame(name, 0)], anchor)
    if shadow:
        eisen.reset(samples=12)
        build()
        eisen.shadow_render(out, shadow, 'entities', sh, sha)


def render(out):
    for mask in range(16):
        for k, kind in enumerate(haus.MATS):
            piece(out, f'hwall.{kind}.{mask}', lambda kd=kind, m=mask: haus.wall(kd, m), shadow=f'hwall.{mask}.shadow' if k == 0 else None)
    for kind in haus.MATS:
        for axis in ('h', 'v'):
            piece(out, f'hwin.{kind}.{axis}', lambda kd=kind, a=axis: haus.window(kd, a), shadow=f'hwin.{axis}.shadow' if kind == 'brick' else None)
            piece(out, f'hwin.{kind}.{axis}.broken', lambda kd=kind, a=axis: haus.window(kd, a, True))
    for axis in ('h', 'v'):
        piece(out, f'hdoor.{axis}', lambda a=axis: haus.door(a), shadow=f'hdoor.{axis}.shadow')
        piece(out, f'hdoor.{axis}.open', lambda a=axis: haus.door(a, True))
        for n in (1, 2, 3):
            piece(out, f'boards.{axis}.{n}', lambda a=axis, k=n: haus.boards(a, k))
    for name, (w, h, height) in haus.FURNITURE.items():
        piece(out, name, lambda nm=name: haus.furniture(nm), w, h, height, shadow=f'{name}.shadow', samples=32)
    for prefix, fn in (('floor.planks', haus.planks), ('floor.tiles', haus.tiles)):
        for v in range(4):
            eisen.reset(samples=24, ground=False)
            fn(v)
            eisen.camera(1.0, 1.0)
            out.add(f'{prefix}.{v}', 'decals', [out.render_frame(f'{prefix}.{v}', 0)], (0.5, 0.5))
    for kind in haus.ROOFS:
        for part in ('n', 's', 'r', 'e', 'w', 'rv'):
            for v in range(2):
                name = f'roof.{kind}.{part}.{v}'
                eisen.reset(samples=20, ground=False)
                haus.roof(kind, part, v)
                eisen.camera(1.0, 1.0, tilt=0.0)
                out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
    for part in ('c', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'):
        for v in range(2 if part == 'c' else 1):
            name = f'roof.flat.{part}.{v}'
            eisen.reset(samples=20, ground=False)
            haus.flat_roof(v, part)
            eisen.camera(1.0, 1.0, tilt=0.0)
            out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
