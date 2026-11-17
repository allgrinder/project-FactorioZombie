"""Spielfigur: 8 Richtungen × (16 Lauf-, 8 Ruhe-, 8 Abbau-Frames) mit Spitzhacke, Schatten im Bild.

Richtung k: 0 = Norden, im Uhrzeigersinn in 45°-Schritten. Die Figur ist nach Süden (zur Kamera) modelliert.
"""
import math

import bmesh
import bpy
import eisen
import parts

WALK = 16
IDLE = 8
MINE = 8
CANVAS = (1.25, 1.5)
ANCHOR = (0.5, 1.05 / 1.5)


def sphere(name, r, loc, mat, seg=16):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(mat)
    o.location = loc
    for p in me.polygons:
        p.use_smooth = True
    eisen.link(o)
    return o


def limb(name, size, pivot, angle, mat, axis=0):
    """Glied, das am oberen Ende (pivot) hängt und um die x-Achse (Vor/Zurück) schwingt."""
    w, d, h = size
    me = eisen.box(name, size, (0, 0, -h / 2), mat, bevel=min(w, d) * 0.3)
    root = bpy.data.objects.new(name + 'P', None)
    eisen.link(root)
    me.parent = root
    root.location = pivot
    rot = [0.0, 0.0, 0.0]
    rot[axis] = angle
    root.rotation_euler = rot
    return root, me


def pickaxe(m, name='pick'):
    """Brecheisen (Letzte Schicht: Ausschlachten und Nahkampf): Stange entlang -Z vom Griffpunkt, Klaue am Ende."""
    bar = eisen.material(name + 'mat', eisen.srgb('#34495a'), rough=0.45, metal=0.8, noise=0.2)
    o = []
    o.append(eisen.cylinder(name + 's', 0.016, 0.52, (0, 0, -0.24), bar, segments=8))
    hook = eisen.box(name + 'h', (0.026, 0.12, 0.03), (0, 0.05, -0.5), bar, bevel=0.006)
    hook.rotation_euler = (0.5, 0, 0)
    o.append(hook)
    o.append(eisen.box(name + 'tip', (0.03, 0.05, 0.012), (0, -0.01, 0.03), bar))
    return eisen.parent_all(o, name)


def worker(m, mode='walk', phase=0.0):
    """mode: walk (Laufzyklus), idle (Atmen, Gewicht verlagern), mine (Spitzhacke von oben nach vorn)."""
    o = []
    t = phase * math.tau
    if mode == 'walk':
        swing = math.sin(t) * 0.5
        bob = abs(math.sin(t)) * 0.03
        arm_r = -swing * 0.8
        arm_l = swing * 0.8
        lean = 0.06
    elif mode == 'idle':
        swing = 0.0
        bob = math.sin(t) * 0.006
        arm_r = 0.05 + math.sin(t) * 0.03
        arm_l = -0.05 - math.sin(t) * 0.03
        lean = 0.0
    else:
        swing = 0.12
        # Ausholen (0..0,55), Schlag (0,55..0,7), Zurückziehen
        if phase < 0.55:
            k = phase / 0.55
            arm_r = -0.4 - 2.3 * math.sin(k * math.pi / 2)
        elif phase < 0.7:
            k = (phase - 0.55) / 0.15
            arm_r = -2.7 + 2.5 * k
        else:
            k = (phase - 0.7) / 0.3
            arm_r = -0.2 - 0.2 * k
        arm_l = arm_r * 0.85
        bob = -0.02 if 0.55 <= phase < 0.75 else 0.0
        lean = 0.12 if 0.55 <= phase < 0.8 else 0.04
    body = []
    for side, s in (('L', -1), ('R', 1)):
        leg, _ = limb('leg' + side, (0.1, 0.11, 0.36), (s * 0.075, 0, 0.38), swing * s, m.cloth)
        o.append(leg)
        boot = eisen.box('boot' + side, (0.11, 0.17, 0.07), (s * 0.075, -0.03 - math.sin(swing * s) * 0.17, 0.035), m.dark, bevel=0.02)
        o.append(boot)
    body.append(eisen.box('torso', (0.3, 0.2, 0.34), (0, 0, 0.55 + bob), m.suit, bevel=0.05))
    body.append(eisen.box('belt', (0.31, 0.21, 0.05), (0, 0, 0.4 + bob), m.dark))
    body.append(eisen.box('buckle', (0.06, 0.02, 0.04), (0, -0.11, 0.4 + bob), m.brass))
    # Rucksack aus Segeltuch mit Schlafsackrolle
    canvas = eisen.material('packcloth', eisen.srgb('#5a5236'), rough=0.9, noise=0.25)
    body.append(eisen.box('pack', (0.25, 0.13, 0.3), (0, 0.16, 0.57 + bob), canvas, bevel=0.05))
    body.append(eisen.cylinder('roll', 0.055, 0.28, (0, 0.17, 0.75 + bob), eisen.material('roll', eisen.srgb('#3f4a3a'), rough=0.9, noise=0.2),
                               segments=12, rot=(0, math.pi / 2, 0)))
    body.append(eisen.box('strapL', (0.04, 0.22, 0.03), (-0.09, 0.0, 0.7 + bob), m.dark))
    body.append(eisen.box('strapR', (0.04, 0.22, 0.03), (0.09, 0.0, 0.7 + bob), m.dark))
    for side, s, ang in (('L', -1, arm_l), ('R', 1, arm_r)):
        arm, _ = limb('arm' + side, (0.085, 0.09, 0.31), (s * 0.2, 0, 0.69 + bob), ang, m.suit)
        o.append(arm)
        glove = sphere('glove' + side, 0.045, (0, 0, -0.32), m.dark, 10)
        glove.parent = arm
        if side == 'R' and mode == 'mine':
            pk = pickaxe(m)
            pk.parent = arm
            pk.location = (0, -0.02, -0.33)
            pk.rotation_euler = (-math.pi / 2 + 0.25, 0, 0)
    if mode != 'mine':
        # Brecheisen schräg im Rucksack
        pk = pickaxe(m, 'back')
        pk.location = (0.08, 0.25, 0.98 + bob)
        pk.rotation_euler = (0.15, 0.55, 0)
        o.append(pk)
    body.append(eisen.cylinder('neck', 0.05, 0.06, (0, 0, 0.74 + bob), m.skin, segments=10))
    body.append(sphere('head', 0.11, (0, -0.005, 0.85 + bob), m.skin))
    # Strickmütze statt Helm
    beanie = sphere('beanie', 0.118, (0, 0.008, 0.88 + bob), m.ochre, 16)
    beanie.scale = (1.0, 1.0, 0.8)
    body.append(beanie)
    body.append(eisen.cylinder('cuff', 0.12, 0.035, (0, 0.008, 0.875 + bob), m.ochre, segments=16))
    upper = eisen.parent_all(body, 'upper')
    upper.rotation_euler = (lean, 0, 0)
    o.append(upper)
    return eisen.parent_all(o, 'worker')


class SurvivorMats(parts.Mats):
    """Die Figur als Überlebende: ochsenblutrote Jacke, Jeans, dunkle Mütze."""

    def __init__(self):
        super().__init__()
        S = eisen.srgb
        self.suit = eisen.material('s_jacket', S('#6a3a2c'), rough=0.8, noise=0.25)
        self.cloth = eisen.material('s_jeans', S('#3a4250'), rough=0.85, noise=0.25)
        self.ochre = eisen.material('s_beanie', S('#2e2e2a'), rough=0.95, noise=0.2)


def render(out):
    for k in range(8):
        rot = math.pi - k * math.pi / 4
        for mode, n, fps in (('walk', WALK, 24), ('idle', IDLE, 6), ('mine', MINE, 12)):
            frames = []
            for f in range(n):
                eisen.reset(samples=40)
                root = worker(SurvivorMats(), mode, f / n)
                root.rotation_euler = (0, 0, rot)
                eisen.shadow_catcher(4)
                eisen.camera(*CANVAS, anchor=ANCHOR)
                frames.append(out.render_frame(f'player.{mode}.{k}', f))
            out.add(f'player.{mode}.{k}', 'entities', frames, ANCHOR, fps=fps)
