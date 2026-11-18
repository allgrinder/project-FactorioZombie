"""Mehr Zombie-Vielfalt (lib/zombie.py unverändert): weitere Kleidungen für Schlurfer und Läufer, je 8 Richtungen ×
6 Laufbilder plus Kadaver, als zombie.<art>.v<n>.<richtung> bzw. zombie.<art>.v<n>.dead. Die Darstellung wählt die
Variante je Zombie (src/render/renderer.ts, ZOMBIE_VARIANTS)."""
import math

import eisen
import zombie

DIRS = 8
WALK = 6
SIZE = ((1.25, 1.5), (0.5, 1.05 / 1.5))

# (Art, Oberteil, Hose, Hautton): Warnweste, Polizei, Kittel, Latzhose, Anzug, Flecktarn, Strickjacke, Trainingsanzug
OUTFITS = [
    ('walker', '#c8742a', '#3a3c40', '#7d8a6a'),
    ('walker', '#2e3a52', '#262a34', '#86907a'),
    ('walker', '#c8c4b8', '#5a6070', '#8a9480'),
    ('walker', '#3e5a7a', '#3e5a7a', '#7a866a'),
    ('walker', '#38383a', '#2a2a2c', '#909a88'),
    ('walker', '#5a6040', '#4a5034', '#7a8468'),
    ('runner', '#8a3a4a', '#30343a', '#8a8068'),
    ('runner', '#2a4a6a', '#2a4a6a', '#8a8a70'),
    ('runner', '#c8742a', '#30343a', '#8a8068'),
    ('brute', '#3e5a7a', '#3e5a7a', '#6a7660'),
    ('brute', '#6a5a48', '#2c2b28', '#707a64'),
    ('screamer', '#5a3a4a', '#3a3036', '#a3a79a'),
    ('screamer', '#c8c4b8', '#5a6070', '#9aa090'),
]
# Leinwand und Maßstab je Art wie in models/zombies.py
SIZES = {'brute': (((1.75, 2.0), (0.5, 1.4 / 2.0)), 1.45), 'screamer': (((1.5, 1.5), (0.5, 1.05 / 1.5)), 1.0)}


def render(out):
    count = {}
    for kind, top, pants, skin in OUTFITS:
        zombie.LOOKS[kind] = [(top, pants)]
        zombie.SKIN[kind] = skin
        v = count[kind] = count.get(kind, 0) + 1
        base = f'zombie.{kind}.v{v}'
        (canvas, anchor), scale = SIZES.get(kind, (SIZE, 0.97 if kind == 'runner' else 1.0))
        for k in range(DIRS):
            frames = []
            for f in range(WALK):
                eisen.reset(samples=28)
                root = zombie.zombie(kind, f / WALK, variant=v)
                root.scale = (scale,) * 3
                root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
                eisen.shadow_catcher(5)
                eisen.camera(*canvas, anchor=anchor)
                frames.append(out.render_frame(f'{base}.{k}', f))
            out.add(f'{base}.{k}', 'entities', frames, anchor, fps=10, meta={'angles': DIRS})
        eisen.reset(samples=28)
        root = zombie.zombie(kind, 0.2, variant=v, dead=True)
        root.scale = (scale,) * 3
        eisen.shadow_catcher(5)
        eisen.camera(2.25, 2.0, anchor=(0.5, 0.55))
        out.add(f'{base}.dead', 'entities', [out.render_frame(f'{base}.dead', 0)], (0.5, 0.55))
