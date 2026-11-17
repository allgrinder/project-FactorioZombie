"""Sammler: die Spielfigur (models/player.py) in Arbeitskleidung – olivgrüne Jacke, Mütze statt Helm, Seesack auf
dem Rücken. 8 Richtungen × 8 Lauf- und 4 Arbeitsbilder."""
import importlib.util
import math
import os

import eisen
import parts

_spec = importlib.util.spec_from_file_location('player_model', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'player.py'))
player = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(player)

WALK = 8
WORK = 4


class WorkerMats(parts.Mats):
    def __init__(self):
        super().__init__()
        S = eisen.srgb
        self.suit = eisen.material('w_suit', S('#4f5a3a'), rough=0.85, noise=0.25)
        self.ochre = eisen.material('w_cap', S('#5a4630'), rough=0.9, noise=0.2)
        self.cloth = eisen.material('w_cloth', S('#3d3a33'), rough=0.9, noise=0.2)


def render(out):
    for k in range(8):
        rot = math.pi - k * math.pi / 4
        for mode, n, fps, key in (('walk', WALK, 12, 'walk'), ('mine', WORK, 8, 'mine')):
            frames = []
            for f in range(n):
                eisen.reset(samples=28)
                root = player.worker(WorkerMats(), mode, f / n)
                sack = eisen.cylinder('sack', 0.13, 0.36, (0, 0.2, 0.62), eisen.material('w_sack', eisen.srgb('#8a7d5a'), rough=0.95, noise=0.3),
                                      segments=12, rot=(0, math.pi / 2, 0))
                sack.parent = root
                root.rotation_euler = (0, 0, rot)
                eisen.shadow_catcher(4)
                eisen.camera(*player.CANVAS, anchor=player.ANCHOR)
                frames.append(out.render_frame(f'worker.{key}.{k}', f))
            out.add(f'worker.{key}.{k}', 'entities', frames, player.ANCHOR, fps=fps)
