"""Kriecher (eigener Entwurf): Zombie ohne Beine, zieht sich mit den Armen über den Boden. Nach Süden (−Y) modelliert;
phase 0..1: Kriechzyklus (Arme greifen abwechselnd nach vorn), dead=True: flach liegend."""
import math
import random

import eisen
from zombie import _mat, limb, sphere


def crawler(phase=0.0, variant=0, dead=False):
    p = f'zc{variant}'
    shirt = _mat(p + 'shirt', ('#5a5048', '#4a5a62', '#6a4a3a')[variant % 3], stain=0.7)
    skin = _mat(p + 'skin', '#7a8468', stain=0.4, rough=0.75)
    wound = eisen.material(p + 'wound', eisen.srgb('#4a0c0a'), rough=0.5)
    rnd = random.Random(900 + variant)
    t = phase * math.tau
    s = math.sin(t)
    o = []
    # Oberkörper flach am Boden, leicht angehoben am Kopfende
    lift = 0.0 if dead else 0.04 + 0.03 * abs(s)
    torso = eisen.box('torso', (0.3, 0.42, 0.17), (0, 0.02, 0.12 + lift), shirt, bevel=0.05, rot=(-0.15, 0, 0.05 * s))
    o.append(torso)
    # abgerissenes Ende: Wunde und Blutschliere hinter dem Körper
    o.append(eisen.box('stump', (0.26, 0.04, 0.12), (0, 0.24, 0.1), wound, bevel=0.02))
    smear = eisen.material(p + 'smear', eisen.srgb('#2e0a08'), rough=0.8)
    for k in range(3):
        o.append(eisen.box(f'trail{k}', (0.16 - k * 0.03, 0.18, 0.003), (rnd.uniform(-0.03, 0.03), 0.3 + k * 0.15, 0.002), smear,
                           rot=(0, 0, rnd.uniform(-0.2, 0.2))))
    # Kopf vorn, nach oben gereckt
    o.append(sphere('head', 0.1, (0, -0.28, 0.2 + lift), skin, 12, squash=(1, 1.05, 1)))
    o.append(sphere('hair', 0.085, (0, -0.25, 0.27 + lift), _mat(p + 'hair', '#2a241e', 0.2), 10, squash=(1.1, 1.0, 0.6)))
    # Arme: greifen abwechselnd weit nach vorn und ziehen
    for side, sg in (('L', -1), ('R', 1)):
        reach = 0.0 if dead else (0.9 + 0.7 * s * sg)
        ar = limb('arm' + side, (0.075, 0.08, 0.3), (sg * 0.18, -0.12, 0.16 + lift), (-1.35 - reach * 0.25, 0, sg * 0.3), shirt)
        o.append(ar)
        fore = eisen.box('fore' + side, (0.065, 0.07, 0.17), (0, 0, -0.27), skin, bevel=0.02)
        fore.parent = ar
        hand = sphere('hand' + side, 0.045, (0, 0, -0.38), skin, 8)
        hand.parent = ar
    root = eisen.parent_all(o, 'crawler')
    if dead:
        root.rotation_euler = (0, 0, 0.4)
    return root
