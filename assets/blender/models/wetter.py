"""Wetter-Partikel (lib/wetter.py): fx.rain, fx.snow.<v> – von oben ohne Neigung."""
import eisen
import wetter


def render(out):
    eisen.reset(samples=12, ground=False)
    wetter.raindrop()
    eisen.camera(0.125, 0.375, tilt=0.0)
    out.add('fx.rain', 'decals', [out.render_frame('fx.rain', 0)], (0.5, 0.5))
    for v in range(3):
        eisen.reset(samples=12, ground=False)
        wetter.snowflake(v)
        eisen.camera(0.125, 0.125, tilt=0.0)
        out.add(f'fx.snow.{v}', 'decals', [out.render_frame(f'fx.snow.{v}', 0)], (0.5, 0.5))
