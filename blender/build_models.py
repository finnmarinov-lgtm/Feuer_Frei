"""Baut alle eigenen Modelle von Feuer Frei und exportiert sie als GLB nach public/assets/models.

Aufruf (über npm run models oder direkt):
  blender --background --factory-startup --python blender/build_models.py -- [--preview] [name ...]

Koordinaten in Blender: +Y = vorne (Laufrichtung), +Z = oben, +X = rechts. Einheit Meter.
Der Ursprung jeder Waffe liegt oben am Pistolengriff, dort wo die Schusshand sitzt.
"""
import sys, os, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from lib import (reset, mat, textured_mat, box, cyl, cyl_between, sphere, dome, torus, tube, profile, empty,
                 parent_all, export, render_preview, join_meshes, triangle_count, ROOT,
                 pbr_mat, tex_brushed, tex_grain, tex_stipple, text_mesh)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
ONLY = [a for a in ARGS if not a.startswith('--')]


# ---------- gemeinsame Materialien ----------
def M():
    return {
        'gun': mat('Gunmetal', (0.045, 0.047, 0.05), 0.85, 0.38),
        'gun_dark': mat('GunDark', (0.025, 0.026, 0.028), 0.7, 0.5),
        'polymer': mat('Polymer', (0.035, 0.036, 0.038), 0.0, 0.62),
        'wood': mat('Wood', (0.32, 0.14, 0.055), 0.0, 0.42),
        'olive': mat('OliveStock', (0.23, 0.27, 0.16), 0.0, 0.6),
        'steel': mat('Steel', (0.56, 0.57, 0.6), 1.0, 0.24),
        'rubber': mat('Rubber', (0.02, 0.02, 0.022), 0.0, 0.85),
        'bore': mat('Bore', (0.004, 0.004, 0.004), 0.3, 0.8),
        'lens': mat('Lens', (0.02, 0.05, 0.08), 0.6, 0.05),
        'glove': mat('Glove', (0.035, 0.035, 0.038), 0.0, 0.78),
        'sleeve': mat('Sleeve', (0.2, 0.21, 0.15), 0.0, 0.92),
    }


def arm(side, hand_center, hand_size, elbow, m, hand_rot=None, wrist=None, parent=None):
    """Handschuh-Faust plus Unterarm mit Ärmel, der aus dem Bild nach hinten läuft.
    Mit parent bewegt sich der Arm mit einem beweglichen Teil (z. B. dem Pumpschaft)."""
    tag = 'R' if side > 0 else 'L'
    box(f'Hand{tag}', hand_size, hand_center, m['glove'], bevel=min(hand_size) * 0.38, segs=4,
        rot=hand_rot, angle=30, parent=parent)
    wx, wy, wz = wrist if wrist else (hand_center[0] + 0.01 * side, hand_center[1] - hand_size[1] * 0.45, hand_center[2] - 0.012)
    ex, ey, ez = elbow
    # Handgelenk (Handschuh) und Ärmel
    t = 0.14
    mid = (wx + (ex - wx) * t, wy + (ey - wy) * t, wz + (ez - wz) * t)
    cyl_between(f'Wrist{tag}', (wx, wy, wz), mid, 0.03, 0.033, m['glove'], bevel=0.003, parent=parent)
    cyl_between(f'Sleeve{tag}', mid, (ex, ey, ez), 0.041, 0.05, m['sleeve'], bevel=0.006, parent=parent)


def left_arm(hand_center, hand_size, elbow, m, wrist=None):
    """Linker Arm an einem eigenen Gelenk (ArmL): so kann die Hand beim Nachladen
    ein neues Magazin holen und einschieben."""
    node = empty('ArmL', hand_center)
    arm(-1, hand_center, hand_size, elbow, m, wrist=wrist, parent=node)
    return node


def trigger_group(m, y0, y1, z_bottom, front_h, material=None, width=0.008):
    mt = material or m['gun']
    box('GuardBottom', (width, y1 - y0, 0.005), (0, (y0 + y1) / 2, z_bottom), mt, bevel=0.0015)
    box('GuardFront', (width, 0.005, front_h), (0, y1, z_bottom + front_h / 2), mt, bevel=0.0015)
    box('Trigger', (0.005, 0.006, 0.026), (0, y0 + (y1 - y0) * 0.55, z_bottom + 0.022), m['gun_dark'],
        bevel=0.0012, rot=(0.28, 0, 0))


# ---------- Sturmgewehr "Wolf" ----------
def build_wolf():
    m = M()
    root = empty('Wolf')
    box('Receiver', (0.042, 0.29, 0.058), (0, 0.045, 0.022), m['gun'], bevel=0.003)
    box('DustCover', (0.039, 0.26, 0.024), (0, 0.035, 0.058), m['gun'], bevel=0.009, segs=4)
    box('RearSight', (0.03, 0.05, 0.026), (0, 0.205, 0.064), m['gun'], bevel=0.004)
    box('RearSightLeaf', (0.02, 0.045, 0.006), (0, 0.2, 0.08), m['gun_dark'], bevel=0.0015)
    for sx in (-1, 1):
        box(f'RearNotch{sx}', (0.005, 0.012, 0.005), (0.0048 * sx, 0.2, 0.0855), m['gun_dark'], bevel=0.0008)
    cyl('Barrel', 0.0085, 0.39, (0, 0.385, 0.035), m['gun_dark'])
    box('GasBlock', (0.024, 0.035, 0.05), (0, 0.43, 0.055), m['gun'], bevel=0.004)
    cyl('GasTube', 0.011, 0.21, (0, 0.325, 0.072), m['gun'])
    # oben flach genug, damit das Korn beim Zielen frei in der Kimme steht
    box('UpperGuard', (0.034, 0.175, 0.022), (0, 0.3125, 0.074), m['wood'], bevel=0.008, segs=3)
    profile('LowerGuard', [(0.2, 0.058), (0.395, 0.058), (0.405, 0.047), (0.405, 0.0), (0.393, -0.013),
                           (0.21, -0.019), (0.2, -0.01)], 0.052, m['wood'], bevel=0.008, segs=3)
    box('GuardBand', (0.055, 0.012, 0.078), (0, 0.405, 0.021), m['gun'], bevel=0.003)
    box('FrontSightBase', (0.022, 0.03, 0.045), (0, 0.535, 0.058), m['gun'], bevel=0.004)
    for sx in (-1, 1):
        box(f'SightEar{sx}', (0.004, 0.012, 0.03), (0.008 * sx, 0.54, 0.087), m['gun'], bevel=0.001)
    box('SightPost', (0.0025, 0.004, 0.02), (0, 0.54, 0.084), m['gun_dark'], bevel=0.0006)
    cyl('MuzzleBrake', 0.0125, 0.045, (0, 0.6025, 0.035), m['gun'])
    cyl('Bore', 0.006, 0.002, (0, 0.6255, 0.035), m['bore'], bevel=0)
    profile('Grip', [(-0.008, -0.004), (0.036, -0.004), (0.028, -0.03), (0.012, -0.115), (-0.026, -0.118),
                     (-0.032, -0.105), (-0.016, -0.03)], 0.03, m['wood'], bevel=0.006, segs=3)
    trigger_group(m, 0.03, 0.105, -0.042, 0.042)
    profile('Stock', [(-0.098, 0.052), (-0.3, 0.034), (-0.306, 0.027), (-0.306, -0.082), (-0.298, -0.088),
                      (-0.23, -0.07), (-0.098, -0.003)], 0.038, m['wood'], bevel=0.008, segs=3)
    box('ButtPlate', (0.04, 0.008, 0.12), (0, -0.31, -0.028), m['gun'], bevel=0.003)
    cyl('ChargingHandle', 0.006, 0.026, (0.033, 0.14, 0.04), m['gun'], axis='X')
    box('Selector', (0.004, 0.11, 0.012), (0.023, 0.02, 0.03), m['gun'], bevel=0.0015, rot=(0.08, 0, 0))
    mag = empty('Mag', (0, 0.105, -0.005))
    profile('MagBody', [(0.072, 0.0), (0.074, -0.06), (0.084, -0.12), (0.102, -0.175), (0.118, -0.215),
                        (0.178, -0.2), (0.16, -0.155), (0.148, -0.1), (0.14, -0.05), (0.138, 0.0)],
            0.026, m['gun_dark'], bevel=0.004, segs=2, parent=mag)
    arm(1, (0, 0.004, -0.058), (0.07, 0.085, 0.1), (0.13, -0.42, -0.26), m, hand_rot=(-0.2, 0, 0))
    left_arm((-0.02, 0.3, -0.012), (0.062, 0.09, 0.07), (-0.22, -0.02, -0.3), m,
             wrist=(-0.035, 0.26, -0.035))
    empty('Muzzle', (0, 0.63, 0.035))
    empty('Eject', (0.025, 0.06, 0.05))
    # Visierlinie: Oberkante Kimme -> Kornspitze
    empty('SightRear', (0, 0.2, 0.088))
    empty('SightFront', (0, 0.54, 0.094))
    parent_all(root)
    return root


# ---------- Maschinenpistole "Falke" ----------
def build_falke():
    m = M()
    root = empty('Falke')
    cyl('ReceiverTube', 0.024, 0.38, (0, 0.1, 0.045), m['gun'])
    box('TopRail', (0.016, 0.26, 0.01), (0, 0.06, 0.072), m['gun_dark'], bevel=0.002)
    # Ring-Diopter hinten, Korn mit Kornschutz vorne, beide auf der Visierhöhe 0.095
    box('RearSightBase', (0.018, 0.02, 0.016), (0, -0.07, 0.08), m['gun'], bevel=0.002)
    torus('RearAperture', 0.0055, 0.0022, (0, -0.07, 0.095), m['gun_dark'], axis='Y', seg=20, rseg=6)
    box('FrontSightBase', (0.024, 0.02, 0.012), (0, 0.272, 0.078), m['gun'], bevel=0.002)
    torus('FrontHood', 0.011, 0.0025, (0, 0.272, 0.095), m['gun'], axis='Y', seg=24, rseg=6)
    box('FrontPost', (0.002, 0.003, 0.011), (0, 0.272, 0.0895), m['gun_dark'], bevel=0.0004)
    box('LowerReceiver', (0.036, 0.15, 0.03), (0, 0.015, 0.012), m['polymer'], bevel=0.004)
    box('MagWell', (0.034, 0.045, 0.03), (0, 0.125, 0.012), m['gun'], bevel=0.003)
    profile('Grip', [(-0.012, -0.002), (0.03, -0.002), (0.022, -0.03), (0.008, -0.11), (-0.028, -0.112),
                     (-0.034, -0.1), (-0.02, -0.03)], 0.032, m['polymer'], bevel=0.006, segs=3)
    trigger_group(m, 0.028, 0.098, -0.04, 0.04, material=m['polymer'])
    profile('ForeEnd', [(0.15, 0.05), (0.262, 0.05), (0.272, 0.04), (0.272, 0.004), (0.258, -0.012),
                          (0.16, -0.016), (0.15, 0.0)], 0.052, m['polymer'], bevel=0.009, segs=3)
    cyl('Barrel', 0.0085, 0.05, (0, 0.314, 0.045), m['gun_dark'])
    cyl('BarrelLugs', 0.0112, 0.012, (0, 0.3, 0.045), m['gun'])
    cyl('Bore', 0.005, 0.002, (0, 0.3395, 0.045), m['bore'], bevel=0)
    cyl('CockingTube', 0.0065, 0.14, (-0.018, 0.19, 0.075), m['gun'])
    cyl('CockingHandle', 0.005, 0.02, (-0.029, 0.245, 0.078), m['gun_dark'], axis='X')
    box('EjectPort', (0.004, 0.035, 0.014), (0.0235, 0.07, 0.05), m['bore'], bevel=0.001)
    for sx in (-1, 1):
        cyl(f'StockRod{sx}', 0.0042, 0.23, (0.021 * sx, -0.19, 0.04), m['gun'])
    box('StockPad', (0.052, 0.02, 0.105), (0, -0.305, 0.012), m['rubber'], bevel=0.008, segs=3)
    mag = empty('Mag', (0, 0.125, -0.005))
    profile('MagBody', [(0.108, 0.0), (0.108, -0.06), (0.112, -0.12), (0.12, -0.17), (0.148, -0.172),
                        (0.142, -0.12), (0.14, -0.06), (0.142, 0.0)], 0.024, m['gun_dark'],
            bevel=0.003, parent=mag)
    arm(1, (0, 0.002, -0.056), (0.07, 0.085, 0.098), (0.13, -0.42, -0.26), m, hand_rot=(-0.18, 0, 0))
    left_arm((-0.016, 0.215, 0.004), (0.062, 0.085, 0.07), (-0.22, -0.1, -0.3), m,
             wrist=(-0.032, 0.18, -0.02))
    empty('Muzzle', (0, 0.342, 0.045))
    empty('Eject', (0.026, 0.07, 0.05))
    empty('SightRear', (0, -0.07, 0.095))
    empty('SightFront', (0, 0.272, 0.095))
    parent_all(root)
    return root


# ---------- Scharfschützengewehr "Adler" ----------
def build_adler():
    m = M()
    root = empty('Adler')
    profile('Forend', [(0.08, 0.035), (0.6, 0.035), (0.62, 0.02), (0.62, -0.01), (0.6, -0.025),
                       (0.1, -0.03), (0.08, -0.02)], 0.056, m['olive'], bevel=0.01, segs=3)
    box('Bedding', (0.056, 0.22, 0.046), (0, 0.0, 0.02), m['olive'], bevel=0.008, segs=3)
    profile('Buttstock', [(-0.1, 0.045), (-0.36, 0.066), (-0.4, 0.066), (-0.41, 0.056), (-0.41, -0.105),
                          (-0.4, -0.112), (-0.33, -0.11), (-0.15, -0.04), (-0.1, -0.012)],
            0.05, m['olive'], bevel=0.01, segs=3)
    profile('Grip', [(-0.01, -0.003), (0.035, -0.003), (0.028, -0.03), (0.014, -0.11), (-0.024, -0.113),
                     (-0.03, -0.1), (-0.016, -0.03)], 0.034, m['olive'], bevel=0.007, segs=3)
    profile('ThumbholeBar', [(-0.022, -0.094), (-0.022, -0.118), (-0.17, -0.074), (-0.158, -0.046)],
            0.04, m['olive'], bevel=0.008, segs=3)
    box('ButtPad', (0.052, 0.015, 0.176), (0, -0.417, -0.023), m['rubber'], bevel=0.006, segs=3)
    cyl('Receiver', 0.021, 0.22, (0, 0.01, 0.058), m['gun'])
    cyl('Barrel', 0.012, 0.68, (0, 0.46, 0.058), m['gun'], r2=0.0095)
    cyl('Brake', 0.017, 0.06, (0, 0.83, 0.058), m['gun_dark'], bevel=0.003)
    for i, yy in enumerate((0.815, 0.835, 0.85)):
        box(f'BrakePort{i}', (0.036, 0.006, 0.012), (0, yy, 0.058), m['bore'], bevel=0.001)
    cyl('Bore', 0.006, 0.002, (0, 0.8605, 0.058), m['bore'], bevel=0)
    # Zielfernrohr
    cyl('ScopeTube', 0.015, 0.27, (0, 0.065, 0.125), m['gun_dark'])
    cyl('ScopeBell', 0.016, 0.05, (0, 0.225, 0.125), m['gun_dark'], r2=0.026)
    cyl('ScopeObjective', 0.026, 0.04, (0, 0.27, 0.125), m['gun_dark'], bevel=0.003)
    cyl('ScopeEyepiece', 0.022, 0.05, (0, -0.095, 0.125), m['gun_dark'], r2=0.016)
    cyl('ScopeEyeRing', 0.0225, 0.02, (0, -0.13, 0.125), m['rubber'], bevel=0.003)
    cyl('LensFront', 0.0235, 0.002, (0, 0.2905, 0.125), m['lens'], bevel=0)
    cyl('LensRear', 0.019, 0.002, (0, -0.1405, 0.125), m['lens'], bevel=0)
    cyl('TurretTop', 0.011, 0.02, (0, 0.07, 0.148), m['gun'], axis='Z')
    cyl('TurretSide', 0.011, 0.02, (0.025, 0.07, 0.125), m['gun'], axis='X')
    for i, yy in enumerate((-0.03, 0.14)):
        box(f'ScopeMount{i}', (0.03, 0.02, 0.03), (0, yy, 0.095), m['gun'], bevel=0.003)
        cyl(f'ScopeRing{i}', 0.019, 0.02, (0, yy, 0.125), m['gun'])
    bolt = empty('Bolt', (0.021, -0.06, 0.06))
    cyl('BoltBody', 0.012, 0.07, (0, -0.125, 0.06), m['steel'], parent=bolt)
    cyl_between('BoltHandle', (0.018, -0.06, 0.06), (0.062, -0.07, 0.044), 0.005, 0.005, m['steel'],
                parent=bolt)
    sphere('BoltKnob', 0.011, (0.066, -0.072, 0.042), m['gun_dark'], parent=bolt)
    mag = empty('Mag', (0, 0.04, -0.005))
    box('MagBody', (0.03, 0.08, 0.05), (0, 0.04, -0.03), m['gun_dark'], bevel=0.003, parent=mag)
    box('MagPlate', (0.034, 0.085, 0.006), (0, 0.04, -0.056), m['gun'], bevel=0.002, parent=mag)
    trigger_group(m, 0.032, 0.1, -0.04, 0.04)
    arm(1, (0, 0.006, -0.056), (0.07, 0.085, 0.1), (0.13, -0.42, -0.26), m, hand_rot=(-0.2, 0, 0))
    left_arm((-0.012, 0.3, -0.036), (0.068, 0.09, 0.062), (-0.22, -0.02, -0.3), m,
             wrist=(-0.032, 0.262, -0.055))
    empty('Muzzle', (0, 0.865, 0.058))
    empty('Eject', (0.022, 0.05, 0.07))
    # optische Achse des Zielfernrohrs (hintere und vordere Linse)
    empty('SightRear', (0, -0.1405, 0.125))
    empty('SightFront', (0, 0.2905, 0.125))
    parent_all(root)
    return root


# ---------- Pump-Schrotflinte "Keiler" ----------
def build_keiler():
    m = M()
    root = empty('Keiler')
    recv = mat('ShotgunReceiver', (0.03, 0.031, 0.034), 0.8, 0.42)
    box('Receiver', (0.04, 0.2, 0.062), (0, 0.04, 0.019), recv, bevel=0.004)
    box('EjectPort', (0.004, 0.06, 0.022), (0.0205, 0.065, 0.03), m['bore'], bevel=0.001)
    box('LoadingPort', (0.03, 0.07, 0.004), (0, 0.075, -0.0125), m['bore'], bevel=0.001)
    # Lauf mit Laufschiene, Messingkorn und Röhrenmagazin darunter
    cyl('Barrel', 0.012, 0.53, (0, 0.405, 0.035), m['gun'])
    box('VentRib', (0.009, 0.52, 0.004), (0, 0.4, 0.049), m['gun_dark'], bevel=0.001)
    sphere('Bead', 0.0028, (0, 0.655, 0.0535), mat('BeadBrass', (0.8, 0.62, 0.3), 1.0, 0.3))
    cyl('MagTube', 0.0105, 0.47, (0, 0.375, 0.003), m['gun_dark'])
    cyl('MagCap', 0.012, 0.022, (0, 0.62, 0.003), m['gun'], bevel=0.002)
    box('BarrelClamp', (0.028, 0.018, 0.044), (0, 0.585, 0.019), m['gun'], bevel=0.003)
    cyl('Bore', 0.008, 0.002, (0, 0.6705, 0.035), m['bore'], bevel=0)
    # Pumpschaft: gleitet beim Repetieren zurück, die linke Hand fährt mit
    pump = empty('Pump', (0, 0.31, 0.003))
    box('PumpWood', (0.05, 0.17, 0.046), (0, 0.31, 0.0), m['wood'], bevel=0.012, segs=3, parent=pump)
    for i, yy in enumerate((0.255, 0.28, 0.305, 0.33, 0.355)):
        box(f'PumpGroove{i}', (0.0515, 0.005, 0.047), (0, yy, 0.0), m['gun_dark'], bevel=0.001, parent=pump)
    for sx in (-1, 1):
        box(f'ActionBar{sx}', (0.003, 0.12, 0.006), (0.0145 * sx, 0.18, 0.004), m['gun'], bevel=0, parent=pump)
    arm(-1, (-0.018, 0.31, -0.022), (0.064, 0.095, 0.07), (-0.22, -0.02, -0.3), m,
        wrist=(-0.035, 0.27, -0.042), parent=pump)
    trigger_group(m, 0.03, 0.1, -0.045, 0.034, material=recv)
    profile('Grip', [(-0.022, -0.012), (0.026, -0.012), (0.018, -0.04), (0.004, -0.115), (-0.034, -0.118),
                     (-0.04, -0.105), (-0.028, -0.04)], 0.032, m['wood'], bevel=0.006, segs=3)
    # Schaft mit Senkung: liegt deutlich unter der Visierlinie, damit man beim Zielen über die Schiene sieht
    profile('Stock', [(-0.058, 0.03), (-0.33, 0.006), (-0.338, 0.0), (-0.338, -0.108), (-0.328, -0.114),
                      (-0.2, -0.08), (-0.058, -0.012)], 0.04, m['wood'], bevel=0.008, segs=3)
    box('ButtPad', (0.042, 0.02, 0.13), (0, -0.348, -0.054), m['rubber'], bevel=0.006, segs=2)
    arm(1, (0, -0.004, -0.06), (0.07, 0.085, 0.1), (0.13, -0.42, -0.26), m, hand_rot=(-0.2, 0, 0))
    empty('Muzzle', (0, 0.672, 0.035))
    empty('Eject', (0.024, 0.065, 0.03))
    # Visierlinie: über das Gehäuse hinweg auf die Mitte des Korns
    empty('SightRear', (0, -0.05, 0.0535))
    empty('SightFront', (0, 0.655, 0.0535))
    parent_all(root)
    return root


# ---------- Sturmgewehr mit Rotpunktvisier "Luchs" ----------
def build_luchs():
    m = M()
    root = empty('Luchs')
    alu = mat('Anodized', (0.045, 0.047, 0.05), 0.55, 0.5)
    box('Lower', (0.034, 0.2, 0.046), (0, 0.035, 0.003), alu, bevel=0.003)
    box('MagWell', (0.036, 0.075, 0.03), (0, 0.1, -0.03), alu, bevel=0.003)
    box('Upper', (0.035, 0.2, 0.04), (0, 0.035, 0.046), alu, bevel=0.003)
    box('Rail', (0.021, 0.42, 0.007), (0, 0.13, 0.0695), m['gun_dark'], bevel=0.001)
    teeth = [box(f'RailTooth{i}', (0.021, 0.004, 0.003), (0, -0.075 + i * 0.01, 0.0745), m['gun_dark'], bevel=0)
             for i in range(41)]
    join_meshes(teeth, 'RailTeeth')
    box('EjectPort', (0.004, 0.05, 0.016), (0.018, 0.05, 0.045), m['bore'], bevel=0.001)
    cyl('ForwardAssist', 0.005, 0.016, (0.022, -0.012, 0.054), alu, axis='X')
    box('ChargingHandle', (0.03, 0.018, 0.009), (0, -0.075, 0.062), alu, bevel=0.002)
    # Handschutz mit abgeschrägten Kanten, kurzer Lauf, Mündungsfeuerdämpfer
    box('RailGuard', (0.046, 0.24, 0.05), (0, 0.255, 0.04), m['polymer'], bevel=0.011, segs=1)
    cyl('Barrel', 0.0085, 0.17, (0, 0.46, 0.035), m['gun_dark'])
    cyl('FlashHider', 0.011, 0.05, (0, 0.565, 0.035), m['gun_dark'], bevel=0.002)
    cyl('Bore', 0.006, 0.002, (0, 0.5905, 0.035), m['bore'], bevel=0)
    # Schiebeschaft auf dem Pufferrohr
    cyl('BufferTube', 0.015, 0.22, (0, -0.17, 0.035), alu)
    profile('Stock', [(-0.2, 0.056), (-0.31, 0.056), (-0.318, 0.05), (-0.318, -0.07), (-0.308, -0.076),
                      (-0.26, -0.045), (-0.2, 0.012)], 0.046, m['polymer'], bevel=0.007, segs=2)
    box('ButtPad', (0.048, 0.012, 0.13), (0, -0.323, -0.01), m['rubber'], bevel=0.004)
    profile('Grip', [(-0.014, -0.018), (0.022, -0.018), (0.014, -0.045), (0.0, -0.12), (-0.034, -0.122),
                     (-0.04, -0.11), (-0.026, -0.045)], 0.03, m['polymer'], bevel=0.006, segs=3)
    trigger_group(m, 0.025, 0.09, -0.042, 0.024, material=alu)
    mag = empty('Mag', (0, 0.1, -0.03))
    profile('MagBody', [(0.072, -0.02), (0.072, -0.09), (0.077, -0.16), (0.085, -0.21), (0.14, -0.2),
                        (0.133, -0.15), (0.13, -0.09), (0.13, -0.02)], 0.024, m['gun_dark'],
            bevel=0.003, parent=mag)
    # Rotpunktvisier: Montage, hohles Rohr, Frontlinse, Verstelltürme
    box('OpticMount', (0.024, 0.035, 0.022), (0, 0.05, 0.084), m['gun_dark'], bevel=0.002)
    tube('OpticTube', 0.0195, 0.0155, 0.09, (0, 0.05, 0.114), m['gun_dark'], axis='Y')
    cyl('OpticLens', 0.0156, 0.0015, (0, 0.093, 0.114), mat('RedDotGlass', (0.35, 0.5, 0.6), 0.0, 0.05), bevel=0)
    cyl('OpticTurretTop', 0.0075, 0.012, (0, 0.05, 0.1395), m['gun_dark'], axis='Z')
    cyl('OpticTurretSide', 0.0075, 0.012, (0.0255, 0.05, 0.114), m['gun_dark'], axis='X')
    empty('RedDot', (0, 0.0915, 0.114))
    arm(1, (0, 0.004, -0.058), (0.07, 0.085, 0.1), (0.13, -0.42, -0.26), m, hand_rot=(-0.2, 0, 0))
    left_arm((-0.018, 0.27, 0.008), (0.062, 0.09, 0.07), (-0.22, -0.02, -0.3), m,
             wrist=(-0.034, 0.23, -0.018))
    empty('Muzzle', (0, 0.592, 0.035))
    empty('Eject', (0.02, 0.05, 0.045))
    # optische Achse durch das Rotpunktrohr
    empty('SightRear', (0, 0.005, 0.114))
    empty('SightFront', (0, 0.095, 0.114))
    parent_all(root)
    return root


# ---------- Pistole "Natter" ----------
# nach dem Vorbild moderner Polymerpistolen: Schlitten aus schwarz nitriertem Stahl mit
# eingefrästen Griffrillen, Lauf in Bronze (im Auswurffenster und an der Mündung zu sehen),
# Rahmen aus Kunststoff mit genarbtem Griff, Visier mit drei weißen Punkten, Gravur links
def build_natter():
    m = M()
    s_arm, s_nor = tex_brushed('NatterSlide', seed=11, rough=(0.24, 0.42), metal=0.82)
    f_arm, f_nor = tex_grain('NatterFrame', seed=12)
    g_arm, g_nor = tex_stipple('NatterGrip', seed=13)
    steel = pbr_mat('SlideNitride', (0.03, 0.031, 0.034), arm=s_arm, normal=s_nor, normal_strength=0.25)
    poly = pbr_mat('FramePolymer', (0.026, 0.027, 0.029), arm=f_arm, normal=f_nor, normal_strength=0.35)
    grip = pbr_mat('GripStipple', (0.024, 0.025, 0.027), arm=g_arm, normal=g_nor, normal_strength=1.0)
    bronze = mat('BarrelBronze', (0.62, 0.43, 0.2), 1.0, 0.3)
    dark = mat('PortDark', (0.006, 0.006, 0.007), 0.4, 0.7)
    sight = mat('SightBlack', (0.018, 0.018, 0.02), 0.6, 0.5)
    dot = pbr_mat('SightDot', (0.9, 0.92, 0.86), rough=0.45, emission=0.35)
    engrave = mat('Engrave', (0.3, 0.31, 0.33), 0.9, 0.38)
    trig = mat('TriggerBlack', (0.02, 0.02, 0.022), 0.0, 0.5)
    root = empty('Natter')

    # --- Schlitten (bewegt sich beim Schuss) ---
    slide = empty('Slide', (0, 0.06, 0.042))
    W, Z0, Z1 = 0.0236, 0.027, 0.058
    zc, zh = (Z0 + Z1) / 2, Z1 - Z0
    uv = dict(uv_tile=0.05, uv_long=1)
    box('SlideFront', (W, 0.146, zh), (0, 0.082, zc), steel, bevel=0.0024, parent=slide, **uv)
    # hinten: Kern 1 mm schmaler, darauf volle Stege -> sieben eingefräste Rillen je Seite
    box('SlideRear', (W - 0.0022, 0.044, zh), (0, -0.013, zc), steel, bevel=0.0012, parent=slide, **uv)
    box('SlideBack', (W, 0.0052, zh), (0, -0.0324, zc), steel, bevel=0.0012, parent=slide, **uv)
    for i in range(6):
        y = -0.0272 + i * 0.0036
        box(f'Serr{i}', (W, 0.002, zh), (0, y, zc), steel, bevel=0.0005, segs=1, parent=slide, **uv)
    box('SlideMid', (W, 0.0156, zh), (0, 0.0012, zc), steel, bevel=0.0012, parent=slide, **uv)
    # Auswurffenster oben rechts: dunkle Öffnung, darin das Patronenlager in Bronze
    box('PortTop', (0.0106, 0.038, 0.0008), (0.0062, 0.066, Z1 + 0.0003), dark, bevel=0.0003, segs=1, parent=slide)
    box('PortSide', (0.0008, 0.038, 0.012), (W / 2 + 0.0003, 0.066, 0.052), dark, bevel=0.0003, segs=1, parent=slide)
    box('BarrelHood', (0.0092, 0.033, 0.0006), (0.0058, 0.0665, Z1 + 0.0009), bronze, bevel=0.0002, segs=1, parent=slide)
    box('BarrelSide', (0.0005, 0.033, 0.0085), (W / 2 + 0.0008, 0.0665, 0.0525), bronze, bevel=0.0002, segs=1, parent=slide)
    box('Extractor', (0.0008, 0.012, 0.0028), (W / 2 + 0.0003, 0.093, 0.0535), sight, bevel=0.0003, segs=1, parent=slide)
    # Mündung: Laufkrone in Bronze, Bohrung, darunter die Führungsstange der Schließfeder
    cyl('BarrelCrown', 0.0066, 0.004, (0, 0.1537, 0.0448), bronze, segs=20, bevel=0.0006, parent=slide)
    cyl('Bore', 0.0046, 0.002, (0, 0.155, 0.0448), dark, segs=16, bevel=0, parent=slide)
    cyl('SpringHole', 0.0037, 0.002, (0, 0.1549, 0.0335), dark, segs=16, bevel=0, parent=slide)
    cyl('GuideRod', 0.0021, 0.003, (0, 0.1558, 0.0335), m['steel'], segs=12, bevel=0, parent=slide)
    # Visier: Kimme mit zwei, Korn mit einem weißen Punkt (zeigen zum Auge)
    box('RearSightBase', (0.0175, 0.008, 0.004), (0, -0.0285, Z1 + 0.002), sight, bevel=0.0008, parent=slide)
    for sx in (-1, 1):
        box(f'RearSight{sx}', (0.0062, 0.008, 0.0036), (0.0048 * sx, -0.0285, 0.0632), sight, bevel=0.0006, parent=slide)
        sphere(f'RearDot{sx}', 0.00105, (0.0048 * sx, -0.0325, 0.0631), dot, segs=10, parent=slide)
    box('FrontSight', (0.0034, 0.005, 0.0072), (0, 0.148, Z1 + 0.0033), sight, bevel=0.0006, parent=slide)
    sphere('FrontDot', 0.0011, (0, 0.1455, 0.0627), dot, segs=10, parent=slide)
    # Gravur auf der linken Seite
    text_mesh('Engraving', 'NATTER', 0.0056, (-W / 2 - 0.00016, 0.078, 0.0445), engrave, parent=slide)
    text_mesh('Caliber', '9x19', 0.0042, (-W / 2 - 0.00016, 0.126, 0.0445), engrave, parent=slide)

    # --- Rahmen ---
    puv = dict(uv_tile=0.03, uv_long=1)
    profile('Frame', [(-0.036, 0.0265), (0.152, 0.0265), (0.1535, 0.012), (0.151, 0.0035), (-0.036, 0.0035)],
            0.0222, poly, bevel=0.0018, **puv)
    box('Rail', (0.0205, 0.044, 0.0075), (0, 0.129, -0.0002), poly, bevel=0.0012, **puv)
    for i, y in enumerate((0.118, 0.13, 0.142)):
        box(f'RailSlot{i}', (0.021, 0.0032, 0.0034), (0, y, -0.0022), dark, bevel=0.0003, segs=1)
    # kräftiger Abzugsbügel (vorne eckig) und geschwungener Abzug mit Sicherungszunge
    box('GuardBottom', (0.016, 0.076, 0.0085), (0, 0.052, -0.0292), poly, bevel=0.0028, **puv)
    box('GuardFront', (0.016, 0.009, 0.037), (0, 0.0858, -0.0125), poly, bevel=0.0028, rot=(-0.14, 0, 0), **puv)
    profile('Trigger', [(0.046, 0.0035), (0.0515, 0.0025), (0.0535, -0.006), (0.052, -0.015), (0.047, -0.0215),
                        (0.0435, -0.0195), (0.0465, -0.0135), (0.0475, -0.006), (0.0445, 0.0015)],
            0.0056, trig, bevel=0.0009, segs=2)
    box('TriggerSafety', (0.0022, 0.0026, 0.011), (0, 0.0525, -0.0085), trig, bevel=0.0005, rot=(0.25, 0, 0))
    # Griff mit Handballenauflage oben hinten, rundum genarbt
    profile('Grip', [(0.018, 0.0035), (0.014, -0.02), (0.008, -0.05), (0.002, -0.08), (-0.004, -0.1045),
                     (-0.047, -0.1065), (-0.046, -0.095), (-0.0405, -0.06), (-0.0365, -0.02), (-0.034, 0.0035)],
            0.0295, grip, bevel=0.0045, segs=3, uv_tile=0.012)
    # Handballenauflage: kleiner Sporn hinten oben, eigenes Teil (die Kantenrundung verträgt keine spitzen Ecken)
    profile('Beavertail', [(-0.034, 0.0035), (-0.0375, -0.004), (-0.0445, 0.0055), (-0.0455, 0.0115),
                           (-0.041, 0.0145), (-0.0345, 0.012)],
            0.0232, poly, bevel=0.0018, segs=2, **puv)
    # Bedienelemente links: Magazinhalter, Schlittenfanghebel, Zerlegehebel; Stifte quer durch
    box('MagRelease', (0.0024, 0.0085, 0.0085), (-0.0152, 0.0112, -0.0045), trig, bevel=0.0008)
    box('SlideStop', (0.0014, 0.017, 0.0034), (-0.0117, 0.069, 0.0205), sight, bevel=0.0005)
    box('SlideStopPad', (0.0024, 0.0055, 0.0042), (-0.0121, 0.0635, 0.0205), sight, bevel=0.0007)
    for sx in (-1, 1):
        box(f'Takedown{sx}', (0.0012, 0.0095, 0.0022), (0.0115 * sx, 0.095, 0.0212), sight, bevel=0.0004)
    cyl('PinFront', 0.0012, 0.0228, (0, 0.034, 0.0115), m['steel'], axis='X', segs=12, bevel=0)
    cyl('PinRear', 0.0012, 0.0228, (0, -0.024, 0.009), m['steel'], axis='X', segs=12, bevel=0)

    # --- Magazin (fällt beim Nachladen heraus) ---
    mag = empty('Mag', (0, -0.022, -0.03))
    box('MagBody', (0.019, 0.03, 0.085), (0, -0.019, -0.066), m['gun_dark'], bevel=0.0018, parent=mag)
    box('MagPlate', (0.0305, 0.047, 0.0085), (0, -0.0255, -0.1118), poly, bevel=0.0026, parent=mag, **puv)

    arm(1, (-0.002, -0.005, -0.056), (0.066, 0.08, 0.095), (0.14, -0.4, -0.3), m, hand_rot=(-0.15, 0, 0))
    left_arm((-0.036, 0.004, -0.064), (0.046, 0.075, 0.086), (-0.2, -0.38, -0.3), m,
             wrist=(-0.045, -0.03, -0.085))
    empty('Muzzle', (0, 0.158, 0.0448))
    empty('Eject', (0.013, 0.066, 0.058))
    # Visierlinie: Oberkante der Kimme -> Oberkante des Korns
    empty('SightRear', (0, -0.0285, 0.065))
    empty('SightFront', (0, 0.148, 0.065))
    parent_all(root)
    return root


# ---------- Schwere Pistole "Kobra" ----------
def build_kobra():
    m = M()
    root = empty('Kobra')
    slide = empty('Slide', (0, 0.09, 0.057))
    box('SlideBody', (0.03, 0.26, 0.045), (0, 0.09, 0.057), m['steel'], bevel=0.003, parent=slide)
    box('TopRib', (0.012, 0.25, 0.007), (0, 0.09, 0.083), m['steel'], bevel=0.002, parent=slide)
    for sx in (-1, 1):
        box(f'RearSight{sx}', (0.0065, 0.01, 0.008), (0.0058 * sx, -0.032, 0.089), m['gun_dark'], bevel=0.001, parent=slide)
    box('FrontSight', (0.005, 0.008, 0.008), (0, 0.21, 0.089), m['gun_dark'], bevel=0.001, parent=slide)
    box('EjectPort', (0.004, 0.04, 0.014), (0.0142, 0.07, 0.064), m['bore'], bevel=0.0008, parent=slide)
    for i in range(6):
        for sx in (-1, 1):
            box(f'Serr{i}{sx}', (0.002, 0.0025, 0.03), (0.0145 * sx, -0.033 + i * 0.005, 0.057),
                m['gun_dark'], bevel=0, parent=slide)
    cyl('Bore', 0.0065, 0.002, (0, 0.2205, 0.06), m['bore'], bevel=0, parent=slide)
    box('Frame', (0.028, 0.23, 0.035), (0, 0.085, 0.017), m['steel'], bevel=0.003)
    box('Hammer', (0.008, 0.012, 0.018), (0, -0.046, 0.066), m['gun_dark'], bevel=0.002, rot=(-0.4, 0, 0))
    profile('Grip', [(-0.036, 0.002), (0.03, 0.002), (0.026, -0.02), (0.012, -0.115), (-0.036, -0.118),
                     (-0.046, -0.106), (-0.036, -0.03)], 0.033, m['rubber'], bevel=0.007, segs=3)
    trigger_group(m, 0.026, 0.1, -0.035, 0.035, material=m['steel'], width=0.009)
    mag = empty('Mag', (0, -0.01, -0.035))
    box('MagBody', (0.024, 0.04, 0.08), (0, -0.008, -0.075), m['gun_dark'], bevel=0.002, parent=mag)
    box('MagPlate', (0.034, 0.05, 0.01), (0, -0.012, -0.12), m['gun_dark'], bevel=0.003, parent=mag)
    arm(1, (-0.004, -0.008, -0.06), (0.07, 0.085, 0.1), (0.14, -0.4, -0.3), m, hand_rot=(-0.15, 0, 0))
    left_arm((-0.04, 0.0, -0.068), (0.048, 0.08, 0.09), (-0.2, -0.38, -0.3), m,
             wrist=(-0.05, -0.035, -0.09))
    empty('Muzzle', (0, 0.225, 0.06))
    empty('Eject', (0.016, 0.08, 0.07))
    empty('SightRear', (0, -0.032, 0.093))
    empty('SightFront', (0, 0.21, 0.093))
    parent_all(root)
    return root


# ---------- Karambit (Team Rot) ----------
# Fingerring oben um den Zeigefinger, Griff senkrecht durch die Faust, darunter die gebogene
# Klauenklinge nach vorne. Alles am Gelenk "Spin" (Mitte des Rings): so kann es beim Ziehen
# einmal um den Finger kreisen.
def build_karambit():
    m = M()
    b_arm, b_nor = tex_brushed('KarambitBlade', seed=21, rough=(0.16, 0.3), metal=1.0)
    h_arm, h_nor = tex_grain('KarambitG10', seed=22, rough=(0.55, 0.75), strength=3.0)
    blade_mat = pbr_mat('KarambitSteel', (0.62, 0.62, 0.64), arm=b_arm, normal=b_nor, normal_strength=0.3)
    g10 = pbr_mat('KarambitGrip', (0.035, 0.045, 0.036), arm=h_arm, normal=h_nor, normal_strength=0.8)
    root = empty('Karambit')
    spin = empty('Spin', (0, 0, 0))
    torus('Ring', 0.0165, 0.0048, (0, 0, 0), m['gun'], axis='X', seg=28, rseg=10, parent=spin)
    profile('KnifeGrip', [(-0.011, -0.012), (-0.012, -0.04), (-0.008, -0.07), (-0.002, -0.094), (0.016, -0.098),
                       (0.017, -0.075), (0.013, -0.045), (0.011, -0.012)],
            0.014, g10, bevel=0.0028, segs=2, parent=spin, uv_tile=0.03, uv_long=2)
    for i, (y, z) in enumerate(((0.001, -0.035), (0.005, -0.075))):
        cyl(f'GripPin{i}', 0.0022, 0.0152, (0, y, z), m['steel'], axis='X', segs=12, bevel=0.0004, parent=spin)
    # Klauenklinge: außen der Rücken, innen die hohle Schneide
    blade = [(-0.001, -0.093), (0.012, -0.112), (0.032, -0.126), (0.058, -0.13), (0.083, -0.122), (0.101, -0.104),
             (0.111, -0.082), (0.113, -0.07), (0.101, -0.088), (0.083, -0.101), (0.06, -0.108), (0.038, -0.105),
             (0.022, -0.097), (0.013, -0.088)]
    taper = [1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.6, 0.1, 0.16, 0.16, 0.16, 0.16, 0.2, 0.5]
    profile('Blade', blade, 0.0042, blade_mat, taper=taper, bevel=0.0004, segs=1, angle=60,
            parent=spin, uv_tile=0.06, uv_long=1)
    empty('Tip', (0, 0.113, -0.07), parent=spin)
    # Faust um den Griff, Zeigefinger im Ring
    arm(1, (0.004, 0.003, -0.056), (0.058, 0.068, 0.076), (0.13, -0.42, -0.26), m,
        wrist=(0.01, -0.03, -0.07))
    parent_all(root)
    return root


# ---------- Butterflymesser (Team Blau) ----------
# Zwei Griffhälften links und rechts der Klinge. Offen zeigt die Klinge nach vorne und beide
# Hälften liegen in der Faust. Beim Ziehen klappt es auf: Klinge (Gelenk "BladePivot") und die
# zweite Griffhälfte (Gelenk "BitePivot") drehen sich um die Stifte vorne am Griff.
def build_butterfly():
    m = M()
    b_arm, b_nor = tex_brushed('ButterflyBlade', seed=31, rough=(0.14, 0.28), metal=1.0)
    s_arm, s_nor = tex_brushed('ButterflyHandle', seed=32, rough=(0.3, 0.48), metal=0.75)
    blade_mat = pbr_mat('ButterflySteel', (0.64, 0.64, 0.66), arm=b_arm, normal=b_nor, normal_strength=0.3)
    handle_mat = pbr_mat('ButterflyAnodized', (0.028, 0.029, 0.034), arm=s_arm, normal=s_nor, normal_strength=0.3)
    dark = mat('PortDark', (0.006, 0.006, 0.007), 0.4, 0.7)
    root = empty('Butterfly')

    def half(side, parent=None):
        x = 0.0063 * side
        box(f'GripHalf{side}', (0.009, 0.108, 0.02), (x, -0.052, -0.001), handle_mat, bevel=0.0028,
            parent=parent, uv_tile=0.05, uv_long=1)
        # ausgefräste Fenster in der Griffhälfte
        for i, y in enumerate((-0.026, -0.052, -0.078)):
            box(f'GripSlot{side}{i}', (0.0007, 0.02, 0.0085), (x + 0.0044 * side, y, -0.001), dark,
                bevel=0.0003, segs=1, parent=parent)
    half(-1)
    blade_pivot = empty('BladePivot', (0, 0, 0))
    blade = [(0.0, 0.0045), (0.012, 0.0072), (0.07, 0.0072), (0.088, 0.003), (0.104, -0.003), (0.08, -0.0085),
             (0.03, -0.0092), (0.008, -0.0075), (-0.004, -0.004), (-0.005, 0.001)]
    taper = [1.0, 1.0, 1.0, 0.7, 0.1, 0.16, 0.16, 0.25, 0.9, 1.0]
    profile('Blade', blade, 0.0032, blade_mat, taper=taper, bevel=0.0003, segs=1, angle=60,
            parent=blade_pivot, uv_tile=0.06, uv_long=1)
    handle_pivot = empty('BitePivot', (0, 0, 0), parent=blade_pivot)
    half(1, parent=handle_pivot)
    box('Latch', (0.0042, 0.013, 0.0035), (0.0034, -0.097, 0.0102), m['steel'], bevel=0.0008, parent=handle_pivot)
    cyl('Pins', 0.0024, 0.0232, (0, 0, 0), m['steel'], axis='X', segs=16, bevel=0.0004)
    empty('Tip', (0, 0.104, -0.003), parent=blade_pivot)
    arm(1, (0.0, -0.055, -0.003), (0.058, 0.1, 0.07), (0.14, -0.43, -0.22), m,
        wrist=(0.008, -0.1, -0.02))
    parent_all(root)
    return root


# ---------- Granaten ----------
def grenade_common(m, top_z, body_r, round_body=False):
    grey = mat('FuzeMetal', (0.36, 0.37, 0.34), 0.75, 0.4)
    cyl('Fuze', 0.011, 0.024, (0, 0, top_z + 0.012), grey, axis='Z')
    cyl('FuzeCap', 0.013, 0.008, (0, 0, top_z + 0.026), grey, axis='Z', bevel=0.002)
    side = body_r + 0.0025
    reach = 0.014 if round_body else side
    box('SpoonTop', (0.012, reach - 0.004, 0.004), (0, -(reach + 0.004) / 2, top_z + 0.029), grey, bevel=0.001)
    if round_body:
        # liegt schräg an der runden Körperform an
        box('Spoon', (0.012, 0.004, 0.068), (0, -body_r * 0.7, top_z - 0.01), grey, bevel=0.001, rot=(-0.33, 0, 0))
    else:
        box('Spoon', (0.012, 0.004, 0.064), (0, -side, top_z - 0.003), grey, bevel=0.001)
    pin = empty('Pin', (0.018, 0, top_z + 0.014))
    torus('PinRing', 0.011, 0.0017, (0.03, 0, top_z + 0.014), grey, axis='Y', parent=pin)
    cyl('PinRod', 0.0015, 0.03, (0.012, 0, top_z + 0.014), grey, axis='X', bevel=0, parent=pin)


def grenade_hand(m):
    arm(1, (0.0, -0.012, -0.04), (0.074, 0.074, 0.07), (0.14, -0.4, -0.26), m,
        wrist=(0.01, -0.045, -0.06))


def build_he():
    m = M()
    root = empty('HE')
    olive = mat('GrenadeOlive', (0.2, 0.24, 0.13), 0.1, 0.55)
    sphere('Body', 0.032, (0, 0, 0), olive, scale=(1, 1, 1.12))
    cyl('Neck', 0.014, 0.01, (0, 0, 0.036), olive, axis='Z')
    grenade_common(m, 0.038, 0.03, round_body=True)
    grenade_hand(m)
    parent_all(root)
    return root


def build_flash():
    m = M()
    root = empty('Flash')
    body = mat('FlashBody', (0.48, 0.5, 0.47), 0.65, 0.35)
    band = mat('FlashBand', (0.12, 0.12, 0.12), 0.3, 0.5)
    cyl('Body', 0.021, 0.1, (0, 0, 0), body, axis='Z', bevel=0.003)
    for i, zz in enumerate((-0.028, 0.028)):
        cyl(f'Band{i}', 0.0214, 0.008, (0, 0, zz), band, axis='Z', bevel=0.001)
    for i in range(6):
        a = i * math.pi / 3
        box(f'Hole{i}', (0.006, 0.006, 0.03), (0.0205 * math.cos(a), 0.0205 * math.sin(a), 0.0), band, bevel=0.0015)
    grenade_common(m, 0.05, 0.021)
    grenade_hand(m)
    parent_all(root)
    return root


def build_smoke():
    m = M()
    root = empty('Smoke')
    body = mat('SmokeBody', (0.16, 0.18, 0.15), 0.2, 0.6)
    band = mat('SmokeBand', (0.75, 0.75, 0.72), 0.0, 0.5)
    cyl('Body', 0.03, 0.115, (0, 0, 0), body, axis='Z', bevel=0.004)
    cyl('Band', 0.0304, 0.014, (0, 0, 0.03), band, axis='Z', bevel=0.001)
    grenade_common(m, 0.0575, 0.03)
    grenade_hand(m)
    parent_all(root)
    return root


# ---------- Gegner-Soldat für das 1 gegen 1 ----------
# Starre Körperteile an Gelenkpunkten (leere Objekte), bewegt wird im Spiel per Code.
# Blickrichtung +Y, Füße bei z = 0. Uniform und Helm bekommen im Spiel die Teamfarbe.
def build_soldier():
    uniform = mat('Uniform', (0.3, 0.27, 0.2), 0.0, 0.88)
    vest = mat('Vest', (0.15, 0.16, 0.12), 0.0, 0.82)
    glove = mat('Glove', (0.035, 0.035, 0.038), 0.0, 0.78)
    boot = mat('Boot', (0.11, 0.085, 0.06), 0.0, 0.72)
    helmet = mat('Helmet', (0.34, 0.33, 0.27), 0.0, 0.62)
    mask = mat('Mask', (0.05, 0.05, 0.055), 0.0, 0.92)
    goggle = mat('Goggles', (0.02, 0.03, 0.04), 0.7, 0.1)
    root = empty('Soldier')
    hips = empty('Hips', (0, 0, 0.95), parent=root)
    box('Pelvis', (0.34, 0.2, 0.2), (0, 0, 0.95), uniform, bevel=0.05, segs=3, parent=hips)
    box('Belt', (0.36, 0.22, 0.05), (0, 0, 1.03), vest, bevel=0.015, parent=hips)
    spine = empty('Spine', (0, 0, 1.03), parent=hips)
    box('Torso', (0.38, 0.22, 0.44), (0, 0, 1.25), uniform, bevel=0.07, segs=3, parent=spine)
    box('PlateCarrier', (0.4, 0.27, 0.34), (0, 0.01, 1.28), vest, bevel=0.04, segs=2, parent=spine)
    for i, x in enumerate((-0.11, 0.0, 0.11)):
        box(f'Pouch{i}', (0.085, 0.05, 0.1), (x, 0.15, 1.19), vest, bevel=0.012, parent=spine)
    for sx in (-1, 1):
        sphere(f'Shoulder{sx}', 0.068, (0.2 * sx, 0, 1.42), uniform, parent=spine)
    cyl_between('Neck', (0, 0, 1.46), (0, 0.005, 1.54), 0.055, 0.052, mask, parent=spine)
    head = empty('Head', (0, 0, 1.53), parent=spine)
    sphere('Skull', 0.1, (0, 0.012, 1.63), mask, scale=(0.92, 1.0, 1.08), parent=head)
    box('GoggleBand', (0.165, 0.05, 0.046), (0, 0.083, 1.642), goggle, bevel=0.016, segs=3, parent=head)
    dome('HelmetShell', 0.128, (0, -0.004, 1.652), helmet, scale=(1.0, 1.08, 0.86), parent=head)
    # Arme in Anschlagshaltung, die rechte Hand hält die Waffe am Griff
    cyl_between('UpperArmR', (0.2, 0, 1.42), (0.25, 0.14, 1.22), 0.056, 0.05, uniform, parent=spine)
    cyl_between('ForearmR', (0.25, 0.14, 1.22), (0.12, 0.28, 1.3), 0.047, 0.04, uniform, parent=spine)
    box('FistR', (0.08, 0.1, 0.085), (0.1, 0.3, 1.31), glove, bevel=0.026, segs=3, parent=spine)
    # linker Arm in zwei Varianten: am Handschutz (Gewehre) oder an der Schusshand (Pistole, Messer, Granate)
    long_arm = empty('ArmLLong', (-0.2, 0, 1.42), parent=spine)
    cyl_between('UpperArmL', (-0.2, 0, 1.42), (-0.15, 0.25, 1.22), 0.056, 0.05, uniform, parent=long_arm)
    cyl_between('ForearmL', (-0.15, 0.25, 1.22), (0.05, 0.53, 1.3), 0.047, 0.04, uniform, parent=long_arm)
    box('FistL', (0.08, 0.1, 0.08), (0.07, 0.56, 1.31), glove, bevel=0.025, segs=3, parent=long_arm)
    short_arm = empty('ArmLShort', (-0.2, 0, 1.42), parent=spine)
    cyl_between('UpperArmLS', (-0.2, 0, 1.42), (-0.2, 0.13, 1.2), 0.056, 0.05, uniform, parent=short_arm)
    cyl_between('ForearmLS', (-0.2, 0.13, 1.2), (0.0, 0.29, 1.28), 0.047, 0.04, uniform, parent=short_arm)
    box('FistLS', (0.075, 0.095, 0.08), (0.03, 0.31, 1.29), glove, bevel=0.025, segs=3, parent=short_arm)
    # Ursprung der Waffen liegt oben am Griff, knapp über der Faust
    empty('WeaponAnchor', (0.1, 0.3, 1.365), parent=spine)
    # Beine mit Knie- und Hüftgelenk
    for sx, tag in ((-1, 'L'), (1, 'R')):
        thigh = empty(f'Thigh{tag}', (0.1 * sx, 0, 0.93), parent=hips)
        cyl_between(f'ThighMesh{tag}', (0.1 * sx, 0, 0.95), (0.1 * sx, 0.01, 0.52), 0.1, 0.078, uniform, parent=thigh)
        shin = empty(f'Shin{tag}', (0.1 * sx, 0.01, 0.5), parent=thigh)
        box(f'KneePad{tag}', (0.1, 0.05, 0.11), (0.1 * sx, 0.08, 0.5), vest, bevel=0.02, parent=shin)
        cyl_between(f'ShinMesh{tag}', (0.1 * sx, 0.01, 0.5), (0.1 * sx, 0.0, 0.12), 0.074, 0.06, uniform, parent=shin)
        box(f'Boot{tag}', (0.125, 0.29, 0.12), (0.1 * sx, 0.05, 0.06), boot, bevel=0.03, segs=2, parent=shin)
    return root


# ---------- Kisten ----------
def build_crates():
    wood = textured_mat('CrateWood', 'wood_planks')
    frame = textured_mat('CrateFrame', 'wood_planks')
    # Kanten nur einmal abgeschrägt (ein Segment): sieht im Spiel gleich aus, halb so viele Dreiecke
    for name, s, xo in (('Crate_S', 1.0, -0.8), ('Crate_L', 1.3, 0.9)):
        root = empty(name, (xo, 0, 0))
        t, inset = 0.08 * s, 0.03 * s
        box(f'{name}_Panels', (s - 2 * inset, s - 2 * inset, s - 2 * inset), (xo, 0, s / 2), wood,
            bevel=0.006, segs=1, uv_tile=1.0, parent=root)
        h = s / 2 - t / 2
        k = 0
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(f'{name}_Post{k}', (t, t, s), (xo + sx * h, sy * h, s / 2), frame, bevel=0.008, segs=1,
                    uv_tile=1.0, uv_long=2, parent=root)
                k += 1
        for sy in (-1, 1):
            for zz in (t / 2, s - t / 2):
                box(f'{name}_BeamX{k}', (s - 2 * t, t, t), (xo, sy * h, zz), frame, bevel=0.008, segs=1,
                    uv_tile=1.0, uv_long=0, parent=root)
                k += 1
        for sx in (-1, 1):
            for zz in (t / 2, s - t / 2):
                box(f'{name}_BeamY{k}', (t, s - 2 * t, t), (xo + sx * h, 0, zz), frame, bevel=0.008, segs=1,
                    uv_tile=1.0, uv_long=1, parent=root)
                k += 1
        # Diagonalstrebe auf zwei Seiten
        diag = math.sqrt(2) * (s - 2 * t)
        for sy in (-1, 1):
            box(f'{name}_Brace{sy}', (diag - 0.02, 0.03, t * 0.9), (xo, sy * (s / 2 - inset - 0.012), s / 2),
                frame, bevel=0.006, segs=1, rot=(0, math.radians(45 * sy), 0), uv_tile=1.0, uv_long=0, parent=root)
        obj = join_meshes(list(root.children), f'{name}_Mesh', parent=root)
        print(f'PROP Kiste {name}: {triangle_count(obj)} Dreiecke')
    shrink_images(PROP_TEXTURE_SIZE)
    return None


# ---------- Requisiten von Poly Haven: vereinfachen und bündeln ----------
PROP_SPECS = [
    # Name, Anteil der Dreiecke, der erhalten bleibt (Ziel: etwa 600 bis 1000 pro Requisit,
    # die Feinheiten übernimmt die Normal-Map)
    ('Barrel_01', 0.33), ('barrel_03', 0.5), ('wooden_crate_02', 0.15),
    ('old_military_crate', 0.05), ('concrete_road_barrier', 0.015), ('metal_jerrycan', 0.04),
]
# Requisiten sind im Spiel höchstens einen Meter groß: 512 Pixel reichen
PROP_TEXTURE_SIZE = 512


def shrink_images(size):
    for img in bpy.data.images:
        if img.size[0] > size or img.size[1] > size:
            img.scale(size, size)


def build_props():
    src = os.path.join(ROOT, 'assets-src', 'polyhaven')
    for pid, ratio in PROP_SPECS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(src, pid, pid + '.gltf'))
        new = [o for o in bpy.data.objects if o not in before]
        names = []
        for i, o in enumerate(new):
            o.name = f'tmp_{pid}_{i}'
            names.append(o.name)
        meshes = [o for o in new if o.type == 'MESH']
        if ratio < 1:
            for m in meshes:
                d = m.modifiers.new('Decimate', 'DECIMATE')
                d.ratio = ratio
        root = empty(pid)
        obj = join_meshes(meshes, f'{pid}_Mesh', parent=root)
        for n in names:
            o = bpy.data.objects.get(n)
            if o is not None:
                bpy.data.objects.remove(o, do_unlink=True)
        print(f'PROP {pid}: {triangle_count(obj)} Dreiecke')
    shrink_images(PROP_TEXTURE_SIZE)


# ---------- Klappziel (Stahl-Silhouette) ----------
def build_target():
    steel = mat('TargetSteel', (0.07, 0.075, 0.08), 0.85, 0.48)
    paint = mat('TargetPaint', (0.8, 0.76, 0.66), 0.0, 0.66)
    head_paint = mat('TargetHeadPaint', (0.85, 0.3, 0.1), 0.0, 0.58)
    root = empty('Target')
    base = [box('BasePlate', (0.56, 0.34, 0.14), (0, 0.02, 0.07), steel, bevel=0.012, segs=2)]
    for sx in (-1, 1):
        base.append(box(f'Skid{sx}', (0.06, 0.5, 0.03), (0.22 * sx, 0.02, 0.015), steel, bevel=0.006))
    base.append(cyl('Hinge', 0.026, 0.5, (0, 0, 0.165), steel, axis='X'))
    join_meshes(base, 'Base')
    pivot = empty('Pivot', (0, 0, 0.165))
    steel_parts = [box('PostBar', (0.05, 0.05, 1.47), (0, 0.0, 0.165 + 0.735), steel, bevel=0.006, parent=pivot)]
    profile('Body', [(-0.15, 0.92), (0.15, 0.92), (0.23, 1.02), (0.23, 1.38), (0.14, 1.5), (-0.14, 1.5),
                     (-0.23, 1.38), (-0.23, 1.02)], 0.012, paint, axis='Y', offset=-0.031,
            bevel=0.004, segs=2, parent=pivot)
    profile('Head', [(-0.05, 1.535), (0.05, 1.535), (0.082, 1.57), (0.082, 1.67), (0.05, 1.705),
                     (-0.05, 1.705), (-0.082, 1.67), (-0.082, 1.57)], 0.012, head_paint, axis='Y',
            offset=-0.031, bevel=0.004, segs=2, parent=pivot)
    # Schrauben und Pfosten sind aus demselben Stahl: ein Mesh, ein Zeichenaufruf
    # (Treffer zählen über eigene, unsichtbare Trefferzonen im Spiel)
    for name, zz in (('BodyBolt0', 1.1), ('BodyBolt1', 1.34), ('HeadBolt', 1.62)):
        steel_parts.append(cyl(name, 0.011, 0.01, (0, -0.042, zz), steel, bevel=0.002, parent=pivot))
    join_meshes(steel_parts, 'Post', parent=pivot)
    parent_all(root)
    return root


BUILDS = [
    ('wolf', build_wolf, (1.0, -0.2, 0.3)),
    ('falke', build_falke, (1.0, -0.2, 0.3)),
    ('adler', build_adler, (1.0, -0.2, 0.3)),
    ('keiler', build_keiler, (1.0, -0.2, 0.3)),
    ('luchs', build_luchs, (1.0, -0.2, 0.3)),
    ('natter', build_natter, (1.0, -0.3, 0.3)),
    ('kobra', build_kobra, (1.0, -0.3, 0.3)),
    ('karambit', build_karambit, (1.0, -0.3, 0.3)),
    ('butterfly', build_butterfly, (1.0, -0.3, 0.3)),
    ('he', build_he, (1.0, -0.6, 0.4)),
    ('flash', build_flash, (1.0, -0.6, 0.4)),
    ('smoke', build_smoke, (1.0, -0.6, 0.4)),
    ('crates', build_crates, (0.5, -1.0, 0.55)),
    ('target', build_target, (0.6, -1.0, 0.3)),
    ('props', build_props, (0.5, -1.0, 0.5)),
    ('soldier', build_soldier, (0.7, 1.0, 0.25)),
]

for name, fn, view in BUILDS:
    if ONLY and name not in ONLY:
        continue
    reset()
    fn()
    export(f'{name}.glb', jpeg=name in ('props', 'crates', 'natter', 'karambit', 'butterfly'))
    if PREVIEW:
        render_preview(name, direction=view)
        if name not in ('crates', 'target', 'props', 'soldier'):
            render_preview(name + '_detail', direction=(1.0, -0.12, 0.18), hide=('Hand', 'Wrist', 'Sleeve'))
        if name in ('natter', 'kobra'):
            # so ähnlich sieht man die Pistole im Spiel: von links hinten oben
            render_preview(name + '_left', direction=(-1.0, -0.75, 0.5), res=(1280, 720), hide=('Hand', 'Wrist', 'Sleeve'))
print('BUILD_DONE')
