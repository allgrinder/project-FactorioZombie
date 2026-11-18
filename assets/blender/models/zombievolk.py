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
]


def render(out):
    count = {}
    for kind, top, pants, skin in OUTFITS:
        zombie.LOOKS[kind] = [(top, pants)]
        zombie.SKIN[kind] = skin
        v = count[kind] = count.get(kind, 0) + 1
        base = f'zombie.{kind}.v{v}'
        for k in range(DIRS):
            frames = []
            for f in range(WALK):
                eisen.reset(samples=28)
                root = zombie.zombie(kind, f / WALK, variant=v)
                root.rotation_euler = (0, 0, math.pi - k * math.pi / 4)
                eisen.shadow_catcher(5)
                eisen.camera(*SIZE[0], anchor=SIZE[1])
                frames.append(out.render_frame(f'{base}.{k}', f))
            out.add(f'{base}.{k}', 'entities', frames, SIZE[1], fps=10, meta={'angles': DIRS})
        eisen.reset(samples=28)
        root = zombie.zombie(kind, 0.2, variant=v, dead=True)
        eisen.shadow_catcher(5)
        eisen.camera(2.25, 2.0, anchor=(0.5, 0.55))
        out.add(f'{base}.dead', 'entities', [out.render_frame(f'{base}.dead', 0)], (0.5, 0.55))
