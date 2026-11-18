"""Himmel (eigener Entwurf): Hubschrauber für Überflüge (nur Darstellung). Nase nach Süden (−Y); phase dreht den
Hauptrotor (vier Blätter, Bewegungsunschärfe über eine halbtransparente Scheibe)."""
import math

import bauten
import eisen
from zombie import sphere

W = bauten.weathered


def helicopter(phase=0.0):
    body = W('hl_body', '#4a5238', metal=0.5, rough=0.5, rust=0.2, dust=0.4, edge=0.5, grime=0.5, streaks=0.4)
    dark = eisen.material('hl_glass', (0.02, 0.03, 0.035), rough=0.15)
    blade = eisen.material('hl_blade', (0.05, 0.05, 0.05), rough=0.6)
    o = [sphere('cabin', 0.5, (0, -0.3, 1.2), body, 18, (1.6, 3.4, 1.6))]
    o.append(sphere('glass', 0.5, (0, -1.4, 1.35), dark, 14, (1.3, 1.2, 0.9)))
    o.append(eisen.cylinder('boom', 0.14, 3.2, (0, 2.3, 1.4), body, segments=10, rot=(math.pi / 2, 0, 0)))
    o.append(eisen.box('fin', (0.08, 0.5, 0.8), (0, 3.85, 1.7), body))
    o.append(eisen.box('stab', (1.0, 0.25, 0.06), (0, 3.6, 1.45), body))
    for s in (-1, 1):
        o.append(eisen.box(f'skid{s}', (0.06, 2.4, 0.06), (s * 0.7, -0.3, 0.45), blade))
    o.append(eisen.cylinder('mast', 0.08, 0.35, (0, -0.3, 1.95), blade, segments=8))
    a0 = phase * math.pi / 2
    for k in range(4):
        a = a0 + k * math.pi / 2
        o.append(eisen.box(f'b{k}', (3.6, 0.2, 0.03), (math.cos(a) * 1.8, -0.3 + math.sin(a) * 1.8, 2.12), blade, rot=(0, 0, a)))
    disc = eisen.material('hl_disc', (0.1, 0.1, 0.1), rough=0.6)
    o.append(eisen.cylinder('tailrotor', 0.6, 0.02, (0.12, 3.85, 1.75), disc, segments=16, rot=(0, math.pi / 2, 0)))
    return eisen.parent_all(o, 'heli')
