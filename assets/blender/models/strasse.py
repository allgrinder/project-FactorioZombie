"""Geschwungene Straßen (lib/strasse.py): road.slice.<v>, road.dash.<v>, track.slice.<v> – von oben ohne Neigung."""
import eisen
import strasse


def render(out):
    for prefix, fn, w, h in (('road.slice', strasse.road_slice, 0.75, 3.25), ('road.dash', strasse.dash, 1.0, 0.25), ('track.slice', strasse.track_slice, 0.75, 1.5)):
        for v in range(4):
            name = f'{prefix}.{v}'
            eisen.reset(samples=20, ground=False)
            fn(v)
            eisen.camera(w, h, tilt=0.0)
            out.add(name, 'decals', [out.render_frame(name, 0)], (0.5, 0.5))
