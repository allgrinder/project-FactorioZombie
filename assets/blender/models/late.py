"""Radar (drehende Antenne). Geometrie in lib/spaet.py."""
import anlagen
import spaet


def render(out):
    anlagen.building(out, 'radar', spaet.radar, (3.5, 4.75), (0.5, 3.0 / 4.75),
                     (4.5, 4.5), (1.9 / 4.5, 1.9 / 4.5), frames=8, samples=32, tier=2)
