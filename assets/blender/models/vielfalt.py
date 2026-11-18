"""Vielfalt (lib/vielfalt.py): Fahrzeugwracks und Kram je Bild und Schatten, Varianten <name>.v<n>; Dachaufbauten
roof.<art> und Bodenflecken decal.<art>.<v> von oben."""
import eisen
import ruinen
import vielfalt as vf

# Name, Breite, Höhe (Felder), Modellhöhe, Varianten, Bau-Funktion
PARTS = (
    ('van-wreck', 3, 2, 1.2, 3, vf.van),
    ('police-wreck', 3, 2, 0.95, 1, lambda v: vf.police()),
    ('ambulance-wreck', 3, 2, 1.2, 1, lambda v: vf.ambulance()),
    ('bus-wreck', 6, 2, 1.3, 1, lambda v: vf.bus()),
    ('tractor-wreck', 3, 2, 1.45, 2, vf.tractor),
    ('mailbox', 1, 1, 0.8, 1, lambda v: vf.mailbox()),
    ('trash-bin', 1, 1, 0.8, 3, vf.trash_bin),
    ('garden-shed', 2, 2, 1.1, 3, vf.garden_shed),
    ('picnic-table', 2, 1, 0.55, 1, lambda v: vf.picnic_table()),
    ('swing', 2, 1, 1.3, 1, lambda v: vf.swing()),
    ('laundry-line', 3, 1, 1.1, 1, lambda v: vf.laundry()),
    ('dog-house', 1, 1, 0.7, 1, lambda v: vf.dog_house()),
    ('bench', 2, 1, 0.75, 1, lambda v: vf.bench()),
    ('bus-stop', 3, 1, 1.55, 1, lambda v: vf.bus_stop()),
    ('phone-booth', 1, 1, 1.6, 1, lambda v: vf.phone_booth()),
    ('oil-drums', 1, 1, 0.65, 2, vf.oil_drums),
    ('pallets', 1, 1, 0.6, 1, lambda v: vf.pallets()),
    ('tire-pile', 1, 1, 0.5, 1, lambda v: vf.tire_pile()),
    ('traffic-cone', 1, 1, 0.45, 1, lambda v: vf.cone()),
    ('road-barrier', 2, 1, 0.75, 1, lambda v: vf.barrier()),
    ('sandbags', 2, 1, 0.45, 1, lambda v: vf.sandbags()),
    ('fallen-log', 3, 1, 0.55, 1, lambda v: vf.fallen_log()),
)

ROOF = (('roof.chimney', vf.roof_chimney), ('roof.antenna', vf.roof_antenna), ('roof.solar', vf.roof_solar),
        ('roof.skylight', vf.roof_skylight), ('roof.dish', vf.roof_dish))


def render(out):
    for name, w, h, height, variants, build in PARTS:
        canvas, anchor, sh, sha = ruinen.spec(w, h, height, margin=0.2)
        for v in range(variants):
            key = f'{name}.v{v}'
            eisen.reset(samples=32)
            build(v)
            eisen.camera(*canvas, anchor=anchor)
            out.add(key, 'entities', [out.render_frame(key, 0)], anchor)
            eisen.reset(samples=14)
            build(v)
            eisen.shadow_render(out, f'{key}.shadow', 'entities', sh, sha, half=w > 3)
    for name, fn in ROOF:
        eisen.reset(samples=20, ground=False)
        fn()
        eisen.camera(1.0, 1.0, tilt=0.0)
        out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
    for kind in ('blood', 'trash', 'leaves', 'burnt', 'tracks'):
        for v in range(3):
            name = f'decal.{kind}.{v}'
            eisen.reset(samples=16, ground=False)
            vf.stain(kind, v)
            eisen.camera(1.0, 1.0, tilt=0.0)
            out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
