"""Wetter (eigene Entwürfe für „Letzte Schicht“): Regentropfen-Strich und Schneeflocke als kleine Partikel von oben."""
import eisen
import gw_ground

lin = gw_ground.lin


def raindrop():
    mat = eisen.material('wt_rain', eisen.srgb('#a8c0d8'), rough=0.05, metal=0.0)
    return eisen.parent_all([eisen.box('drop', (0.02, 0.32, 0.01), (0, 0, 0), mat, bevel=0.004)], 'rain')


def snowflake(v):
    mat = eisen.material('wt_snow', eisen.srgb('#f2f4f8'), rough=0.6)
    r = 0.025 + 0.012 * v
    return eisen.parent_all([eisen.rock('flake', r, (0, 0, 0), mat, 300 + v, squash=0.5, detail=1)], 'snow')
