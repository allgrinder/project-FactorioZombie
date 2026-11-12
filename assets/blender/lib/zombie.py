"""Zombies (eigene Entwürfe für „Letzte Schicht“): Schlurfer, Läufer, Brocken, Schreier.
Die Figur ist nach Süden (−Y, zur Kamera) modelliert; die Pipeline dreht sie in 8 Richtungen.
phase 0..1: Laufzyklus. dead=True: liegender Kadaver (variant wählt die Lage)."""
import math
import random

import bauten
import bmesh
import bpy
import eisen

W = bauten.weathered

# Kleidung je Art: (Oberteil, Hose) – verblichen, mit dunklen Flecken (Blut/Dreck über den „Rost“-Kanal)
LOOKS = {
    'walker': [('#5a6a52', '#3d3f44'), ('#6a5a48', '#33362e'), ('#4d5866', '#40372e')],
    'runner': [('#7a4a3a', '#2e3238'), ('#8a7a4a', '#30302c')],
    'brute': [('#4a4f3c', '#2c2b28')],
    'screamer': [('#8a8478', '#4a3f44')],
}
SKIN = {'walker': '#7d8a6a', 'runner': '#8a8068', 'brute': '#6a7660', 'screamer': '#a3a79a'}


def _mat(name, hex_, stain=0.45, rough=0.9):
    return W(name, hex_, metal=0.0, rough=rough, rust=stain, dust=0.35, edge=0.15, grime=0.6, streaks=0.5,
             rust_hex='#3a0e0b', dust_hex='#6d6250')


def sphere(name, r, loc, mat, seg=14, squash=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    for v in bm.verts:
        v.co.x *= squash[0]
        v.co.y *= squash[1]
        v.co.z *= squash[2]
    o = eisen.mesh_obj(name, bm, mat, smooth=True)
    o.location = loc
    return o


def limb(name, size, pivot, rot, mat):
    """Glied, das am oberen Ende (pivot) hängt; rot = (x, y, z)-Drehung am Gelenk. Liefert (Gelenk, Ende lokal)."""
    w, d, h = size
    me = eisen.box(name, size, (0, 0, -h / 2), mat, bevel=min(w, d) * 0.3)
    root = bpy.data.objects.new(name + 'P', None)
    eisen.link(root)
    me.parent = root
    root.location = pivot
    root.rotation_euler = rot
    return root


def _child(o, parent, loc=None, rot=None):
    o.parent = parent
    if loc is not None:
        o.location = loc
    if rot is not None:
        o.rotation_euler = rot
    return o


def zombie(kind='walker', phase=0.0, variant=0, dead=False):
    look = LOOKS[kind][variant % len(LOOKS[kind])]
    p = f'z{kind[0]}{variant}'
    shirt = _mat(p + 'shirt', look[0], stain=0.6)
    pants = _mat(p + 'pants', look[1], stain=0.4)
    skin = _mat(p + 'skin', SKIN[kind], stain=0.35, rough=0.75)
    dark = _mat(p + 'dark', '#1c1a18', stain=0.2)
    wound = eisen.material(p + 'wound', eisen.srgb('#5a0f0c'), rough=0.5)
    rnd = random.Random(sum(map(ord, kind)) + variant * 7)
    t = phase * math.tau
    # Körperbau und Gangart je Art
    if kind == 'brute':
        sw, sd, sh = 0.52, 0.34, 0.44      # Torso
        leg = (0.17, 0.18, 0.36)
        arm = (0.15, 0.16, 0.42)
        head_r, hip = 0.105, 0.42
        swing, arms_fwd, lean, bob_a = 0.32, 0.5, 0.28, 0.02
    elif kind == 'runner':
        sw, sd, sh = 0.27, 0.17, 0.32
        leg = (0.09, 0.1, 0.38)
        arm = (0.07, 0.075, 0.32)
        head_r, hip = 0.1, 0.4
        swing, arms_fwd, lean, bob_a = 0.8, 0.45, 0.5, 0.045
    elif kind == 'screamer':
        sw, sd, sh = 0.26, 0.16, 0.34
        leg = (0.085, 0.09, 0.38)
        arm = (0.065, 0.07, 0.34)
        head_r, hip = 0.11, 0.4
        swing, arms_fwd, lean, bob_a = 0.35, 0.3, -0.12, 0.02
    else:
        sw, sd, sh = 0.3, 0.19, 0.33
        leg = (0.1, 0.11, 0.37)
        arm = (0.08, 0.085, 0.32)
        head_r, hip = 0.105, 0.39
        swing, arms_fwd, lean, bob_a = 0.38, 1.15, 0.2, 0.02
    s = math.sin(t)
    bob = abs(s) * bob_a
    o = []
    # Beine: ein Bein zieht nach (Schlurfen)
    for side, sg in (('L', -1), ('R', 1)):
        a = swing * s * sg * (0.6 if (kind == 'walker' and sg < 0) else 1.0)
        lg = limb('leg' + side, leg, (sg * sw * 0.26, 0, hip), (a, 0, sg * 0.04), pants)
        o.append(lg)
        foot = eisen.box('foot' + side, (leg[0] * 1.05, leg[1] * 1.5, 0.06), (0, -0.03, -leg[2] + 0.02), dark, bevel=0.015)
        _child(foot, lg)
    upper = []
    cz = hip + sh / 2 + bob
    upper.append(eisen.box('torso', (sw, sd, sh), (0, 0, cz), shirt, bevel=0.05))
    upper.append(eisen.box('hipb', (sw * 0.95, sd * 1.02, 0.08), (0, 0, hip + 0.02 + bob), pants, bevel=0.02))
    # zerrissenes Hemd: Riss mit Wunde
    upper.append(eisen.box('gash', (sw * 0.3, 0.012, sh * 0.35), (rnd.uniform(-0.06, 0.06), -sd / 2 - 0.002, cz + rnd.uniform(-0.04, 0.05)), wound,
                           rot=(0, rnd.uniform(-0.5, 0.5), 0)))
    # Blutflecken auf Schultern und Rücken (von oben gut sichtbar)
    for k in range(3 if kind != 'screamer' else 2):
        bx = rnd.uniform(-sw * 0.35, sw * 0.35)
        by = rnd.uniform(-sd * 0.3, sd * 0.35)
        upper.append(sphere(f'blood{k}', rnd.uniform(0.035, 0.07), (bx, by, hip + sh + bob - 0.012), wound, 8, squash=(1.3, 1.0, 0.25)))
    if kind == 'brute':
        upper.append(sphere('hump', 0.2, (0, 0.1, cz + 0.16), shirt, squash=(1.25, 0.9, 0.7)))
        upper.append(eisen.box('belly', (sw * 0.8, 0.1, sh * 0.6), (0, -sd / 2, cz - 0.06), skin, bevel=0.04))
    shoulder = hip + sh - 0.03 + bob
    for side, sg in (('L', -1), ('R', 1)):
        # Arme: Schlurfer streckt sie nach vorn, Läufer schwingt weit, Schreier spreizt sie
        if kind == 'screamer':
            rot = (-0.4 + 0.15 * s * sg, -sg * (1.15 + 0.1 * math.sin(t * 2)), 0)
        else:
            rot = (-arms_fwd - swing * s * sg * (0.75 if kind == 'runner' else 0.25), -sg * 0.14, 0)
        if kind == 'walker' and sg > 0:
            rot = (rot[0] * 0.55, rot[1], 0)  # ein Arm hängt
        ar = limb('arm' + side, arm, (sg * (sw / 2 + arm[0] * 0.45), 0, shoulder), rot, shirt if kind != 'screamer' else skin)
        upper.append(ar)
        fore = eisen.box('fore' + side, (arm[0] * 0.85, arm[1] * 0.85, arm[2] * 0.5), (0, 0, -arm[2] * 0.8), skin, bevel=0.02)
        _child(fore, ar)
        hand = sphere('hand' + side, arm[0] * 0.62, (0, 0, -arm[2] * 1.08), skin, 8)
        _child(hand, ar)
    # Kopf: schief, beim Schreier nach hinten geworfen mit offenem Mund
    neck_z = hip + sh + bob
    hz = neck_z + head_r * 0.85
    tilt = 0.25 * math.sin(t + 1.0) if kind != 'screamer' else 0.0
    head = sphere('head', head_r, (0, -0.02, hz), skin, 14, squash=(0.95, 1.0, 1.08))
    head.rotation_euler = (-0.55 if kind == 'screamer' else 0.15, 0.3 + tilt if kind == 'walker' else tilt, 0)
    upper.append(head)
    upper.append(eisen.cylinder('neck', head_r * 0.45, 0.07, (0, 0, neck_z), skin, segments=8))
    hair = sphere('hair', head_r * 0.98, (0, 0.015, hz + head_r * 0.2), dark, 10, squash=(1.0, 1.0, 0.75))
    if kind != 'brute':
        upper.append(hair)
    else:
        bpy.data.objects.remove(hair)
    mouth_z = hz - head_r * 0.45 + (0.05 if kind == 'screamer' else 0)
    my = -head_r * (0.75 if kind == 'screamer' else 0.9)
    upper.append(sphere('mouth', head_r * (0.42 if kind == 'screamer' else 0.25), (0, my, mouth_z), wound, 8, squash=(1.0, 0.5, 1.2 if kind == 'screamer' else 0.6)))
    eye = eisen.emission_material(p + 'eye', (0.95, 0.9, 0.55) if kind != 'screamer' else (1.0, 0.35, 0.3), 1.2)
    for sg in (-1, 1):
        upper.append(sphere(f'eye{sg}', head_r * 0.13, (sg * head_r * 0.38, -head_r * 0.86, hz + head_r * 0.12), eye, 6))
    up = eisen.parent_all(upper, 'upper')
    # Vorbeugen um die Hüfte
    up.location = (0, 0, hip)
    for c in upper:
        c.location.z -= hip
    up.rotation_euler = (lean + 0.05 * math.sin(t * 2), 0, 0.06 * s)
    o.append(up)
    root = eisen.parent_all(o, 'zombie')
    if dead:
        # Kadaver: umgekippt, leicht verdreht, flach am Boden
        root.rotation_euler = (math.pi / 2 * (1 if variant % 2 == 0 else -1), 0, 0.6 + variant * 1.3)
        root.location = (0.0, 0.25 if variant % 2 == 0 else -0.25, sd / 2 + 0.02)
        # Blutlache unter dem Oberkörper
        phi = root.rotation_euler[2]
        sgn = -1 if variant % 2 == 0 else 1
        cx = root.location[0] - sgn * math.sin(phi) * 0.5
        cy = root.location[1] + sgn * math.cos(phi) * 0.5
        blood = eisen.material(p + 'pool', eisen.srgb('#2e0806'), rough=0.35)
        pool = sphere('pool', 0.24, (cx, cy, 0.004), blood, 16, squash=(1.15, 0.85, 0.02))
        return eisen.parent_all([root, pool], 'cadaver')
    return root
