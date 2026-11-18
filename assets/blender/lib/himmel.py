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


def wreck():
    """Abgestürzter Hubschrauber (Wrack 5×4): Rumpf auf der Seite, Heckausleger abgeknickt, Rotorblätter verbogen,
    Erdwall und Brandspuren. Heller Tarnlack, damit er sich vom Wald abhebt."""
    import random
    import gw_ground
    rnd = random.Random(9700)
    body = W('hw_body', '#7a7a5e', metal=0.5, rough=0.6, rust=0.5, dust=0.7, edge=0.7, grime=0.7, streaks=0.6)
    stripe = W('hw_stripe', '#c8c0a0', metal=0.3, rough=0.6, rust=0.3, dust=0.5, edge=0.5, grime=0.5, streaks=0.3)
    soot = eisen.material('hw_soot', (0.03, 0.028, 0.025), rough=0.95)
    glass = eisen.material('hw_glass', (0.05, 0.06, 0.07), rough=0.15)
    blade = eisen.material('hw_blade', (0.08, 0.08, 0.08), rough=0.6)
    dirt = gw_ground.pmat('hw_dirt', gw_ground.lin('#4a3a28'), 1.0, 0.4, 0.8, 30)
    o = [sphere('cabin', 0.5, (0, -0.4, 0.55), body, 20, (1.3, 2.6, 1.0))]
    o.append(sphere('glass', 0.5, (0, -1.4, 0.65), glass, 14, (1.0, 0.9, 0.7)))
    o.append(eisen.box('stripe', (1.32, 0.25, 0.9), (0, 0.2, 0.55), stripe))
    o.append(sphere('burn', 0.5, (0.35, 0.3, 0.95), soot, 12, (0.9, 1.4, 0.3)))
    o.append(eisen.cylinder('boom', 0.14, 1.9, (0.5, 1.7, 0.35), body, segments=10, rot=(math.pi / 2, 0, -0.5)))
    o.append(eisen.box('fin', (0.08, 0.45, 0.6), (1.0, 2.5, 0.35), body, rot=(0.0, 1.2, -0.5)))
    for k in range(3):
        a = k * 2.1 + 0.4
        o.append(eisen.box(f'b{k}', (2.0, 0.18, 0.03), (math.cos(a) * 1.2, math.sin(a) * 1.2 - 0.3, 0.12 + k * 0.05), blade,
                           rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.2, 0.2), a)))
    for k in range(10):
        o.append(eisen.rock(f'd{k}', rnd.uniform(0.15, 0.35), (rnd.uniform(-1.8, 1.8), rnd.uniform(-1.6, 1.6), 0.03), dirt, 9800 + k, squash=0.4, detail=1))
    for k in range(4):
        o.append(eisen.cylinder(f's{k}', rnd.uniform(0.3, 0.6), 0.004, (rnd.uniform(-1.5, 1.5), rnd.uniform(-1.4, 1.4), 0.002), soot, segments=14))
    root = eisen.parent_all(o, 'heliwreck')
    root.rotation_euler = (0, 0, 0.5)
    return root
