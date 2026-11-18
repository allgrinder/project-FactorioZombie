"""Jahreszeiten: Laubbäume in Herbstfarben (flora.autumn.<n>) und kahl im Winter (flora.bare.<n>), mit eigener
Schattenebene. Die Darstellung tauscht Laubbäume je Jahreszeit gegen diese Bilder (src/render/renderer.ts, treeSprite)."""
import math

import eisen
import gw_plants

TAN = math.tan(eisen.TILT)

AUTUMN = [
    ('acer-campestre', 4.6, 7, '#d8a838'), ('quercus-rubra', 5.4, 8, '#b8482c'), ('carpinus-betulus', 4.4, 7.5, '#d08a34'),
    ('betula-pendula', 3.4, 7.5, '#e0c048'), ('castanea-sativa', 6.0, 8.2, '#c0842e'), ('aesculus-hippocastanum', 5.4, 8.2, '#c89a3c'),
    ('acer-campestre', 4.0, 6.4, '#e07a2c'), ('prunus-avium', 4.0, 5.6, '#b83a2c'), ('quercus-rubra', 7.0, 9.2, '#a8602e'),
    ('carpinus-betulus', 2.4, 3.6, '#d8b040'),
]
BARE = [
    ('acer-campestre', 4.6, 7), ('quercus-rubra', 5.4, 8), ('carpinus-betulus', 4.4, 7.5), ('betula-pendula', 3.4, 7.5),
    ('castanea-sativa', 6.0, 8.2), ('aesculus-hippocastanum', 5.4, 8.2), ('quercus-rubra', 7.0, 9.2), ('carpinus-betulus', 2.4, 3.6),
]


def canvas(d, h):
    w = d + 1.0
    top = d / 2 + h * TAN + 0.3
    bottom = d / 2 + 0.4
    cw, ch = math.ceil(w * 2) / 2, math.ceil((top + bottom) * 2) / 2
    return (cw, ch), ((d / 2 + 0.5) / cw, top / ch)


def shadow(out, name, d, h):
    sw = math.ceil((d + 1 + h * 0.6) * 2) / 2
    sh = math.ceil((d + 1 + h * 0.75) * 2) / 2
    eisen.shadow_render(out, f'{name}.shadow', 'flora', (sw, sh), ((d / 2 + 0.5) / sw, (d / 2 + 0.5) / sh), half=True)


def render(out):
    for i, (sid, d, h, col) in enumerate(AUTUMN):
        eisen.reset(samples=40)
        gw_plants.tree({'id': sid, 'kind': 'tree', 'diameterMature': d, 'heightMature': h}, {'color': col, 'bare': False, 'bloom': None, 'fruit': None}, 5100 + i * 11)
        cv, anchor = canvas(d, h)
        eisen.camera(*cv, anchor=anchor)
        name = f'flora.autumn.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h)
    for i, (sid, d, h) in enumerate(BARE):
        eisen.reset(samples=40)
        gw_plants.tree({'id': sid, 'kind': 'tree', 'diameterMature': d, 'heightMature': h}, {'color': '#6b5a43', 'bare': True, 'bloom': None, 'fruit': None}, 5300 + i * 11)
        cv, anchor = canvas(d, h)
        eisen.camera(*cv, anchor=anchor)
        name = f'flora.bare.{i}'
        out.add(name, 'flora', [out.render_frame(name, 0)], anchor)
        shadow(out, name, d, h)
