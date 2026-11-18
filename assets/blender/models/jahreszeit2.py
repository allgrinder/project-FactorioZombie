"""Jahreszeiten 2: Obstblüte im Frühling (flora.blossom.<n>), Sträucher im Herbst (flora.autumnshrub.<n>) und kahl
im Winter (flora.bareshrub.<n>). Die Darstellung tauscht Obstbäume bzw. Sträucher je Jahreszeit."""
import math

import eisen
import gw_plants

TAN = math.tan(eisen.TILT)

BLOSSOM = [
    ('malus-topaz', 3.8, 4.4, '#7a9050', '#f4e4ea'), ('malus-topaz', 3.4, 4.0, '#829852', '#f0c8d4'),
    ('pyrus-communis', 3.2, 5.4, '#7a9050', '#f8f6f0'), ('prunus-avium', 4.0, 5.6, '#78904e', '#faf6f4'),
    ('prunus-serrulata', 4.2, 5.0, '#7a8a50', '#f0b8c8'),
]
SHRUBS = [('viburnum', 2.0, 1.8), ('cornus', 2.2, 2.0), ('spiraea', 1.6, 1.2), ('rubus-idaeus', 1.8, 1.3)]
AUTUMN = ['#c8902e', '#b8482c', '#d0a038', '#a85a2a']


def canvas(d, h):
    w = d + 1.0
    top = d / 2 + h * TAN + 0.3
    bottom = d / 2 + 0.4
    cw, ch = math.ceil(w * 2) / 2, math.ceil((top + bottom) * 2) / 2
    return (cw, ch), ((d / 2 + 0.5) / cw, top / ch)


def shadow(out, name, d, h, half):
    sw = math.ceil((d + 1 + h * 0.6) * 2) / 2
    sh = math.ceil((d + 1 + h * 0.75) * 2) / 2
    eisen.shadow_render(out, f'{name}.shadow', 'flora', (sw, sh), ((d / 2 + 0.5) / sw, (d / 2 + 0.5) / sh), half=half)


def render(out):
    for i, (sid, d, h, col, bloom) in enumerate(BLOSSOM):
        eisen.reset(samples=40)
        gw_plants.tree({'id': sid, 'kind': 'tree', 'diameterMature': d, 'heightMature': h}, {'color': col, 'bare': False, 'bloom': bloom, 'fruit': None}, 5500 + i * 11)
        cv, anchor = canvas(d, h)
        eisen.camera(*cv, anchor=anchor)
        name = f'flora.blossom.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h, True)
    for i, (sid, d, h) in enumerate(SHRUBS):
        for prefix, look in (('flora.autumnshrub', {'color': AUTUMN[i], 'bare': False}), ('flora.bareshrub', {'color': '#6b5a43', 'bare': True})):
            eisen.reset(samples=40)
            gw_plants.shrub({'id': sid, 'kind': 'shrub', 'diameterMature': d, 'heightMature': h}, {**look, 'bloom': None, 'fruit': None}, 5700 + i * 7)
            cv, anchor = canvas(d, h)
            eisen.camera(*cv, anchor=anchor)
            name = f'{prefix}.{i}'
            out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
            shadow(out, name, d, h, False)
