"""Trümmerfelder: je Material 6 Varianten × 4 Dichtestufen (lib/truemmer.py).

Jede Kachel ist 1,5 × 1,5 Felder groß und überlappt ihre Nachbarn: aufgewühlter, weich auslaufender Grund und
Trümmer bis über den Feldrand. So entsteht ein zusammenhängendes Trümmerfeld statt eines Rasters; gemischte
Felder gehen ineinander über, weil jede Kachel etwas Fremdmaterial enthält. Schatten im Bild.
"""
import random

import eisen
import truemmer
from natur import disc, patch_material

RESOURCES = ('iron-ore', 'coal', 'stone', 'copper-ore')
COUNTS = (4, 7, 11, 15)
SIZE = 1.5


def render(out):
    for ri, res in enumerate(RESOURCES):
        for v in range(6):
            for d in range(4):
                eisen.reset(samples=40, ground=False)
                rnd = random.Random(1000 * ri + 17 * v + d + 1)
                # weicher, unregelmäßiger Rand; dünne Stufen lassen die Wiese durchscheinen
                m = patch_material(f'og{ri}{v}{d}', truemmer.GROUND[res], v * 4 + d, noise_amp=0.48, opacity=0.5 + 0.13 * d, bump_strength=0.4)
                disc(0.7 + 0.04 * d, m)
                mats = truemmer.Mats(f'tm{ri}{v}{d}')
                truemmer.pieces(res, mats, rnd, COUNTS[d], 0.56, size=(0.06 + 0.008 * d, 0.115 + 0.012 * d))
                eisen.shadow_catcher(6)
                eisen.camera(SIZE, SIZE)
                name = f'res.{res}.{v}.{d}'
                out.add(name, 'terrain', [out.render_frame(name, 0)], (0.5, 0.5))
