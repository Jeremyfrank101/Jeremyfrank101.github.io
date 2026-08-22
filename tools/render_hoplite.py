# render_hoplite.py — builds a hoplite in Blender and renders the six poses
# Wrath needs, as a correctly anchored sprite atlas.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#       --python tools/render_hoplite.py -- --character Achilles
#
# Everything about the framing is derived from the engine's own numbers, so the
# output drops into art/warriors/ without anyone measuring anything by hand:
#
#   The figure buffer is 250 x 248 figure units with the origin between the feet
#   on the ground line, reaching 160 units left, 90 right, 190 up and 58 down.
#   An orthographic camera 250 units wide, centred on the middle of that box,
#   therefore puts the world origin at a known pixel — which is the anchor. The
#   camera setup and the anchor cannot drift apart, because one computes the
#   other and both are written to render_meta.json for the packer.
#
# The figure is built from primitives rather than sculpted. That is the honest
# constraint of generating this from a script, and it is why the result reads as
# stylised rather than photoreal — but it is real geometry with real materials
# under real light, which is the thing flat canvas drawing cannot fake.

import bpy, bmesh, math, json, os, sys
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- engine facts

BUF_W, BUF_H = 250, 248        # figure units, from Iliad.drawWarrior
OX, OY = 160, 190              # origin inside that buffer
SS = 3                         # author at 3x, matching Iliad.SS
TURN_DEG = 40.0                # three-quarter stance, the 3D reading of Iliad.TURN

CELL_W, CELL_H = BUF_W * SS, BUF_H * SS

# The camera frames exactly the buffer, so the anchor follows from the geometry.
CAM_CX = (-OX + (BUF_W - OX)) / 2.0          # -35
CAM_CZ = (OY + (-(BUF_H - OY))) / 2.0        #  66
ANCHOR = [round((0 - CAM_CX) * SS + CELL_W / 2.0),
          round(CELL_H / 2.0 - (0 - CAM_CZ) * SS)]     # -> [480, 570]

SAMPLES = [160]          # overridden by --samples for quick looks

POSE_ORDER = ['ready', 'attack', 'cast', 'hurt', 'win', 'fallen']

# Angles in degrees, read as: how far the joint swings forward (+) or back (-).
# These are the three-dimensional reading of Iliad.POSES.
POSES = {
    'ready':  dict(lean=  2, sh_f=-18, el_f= 62, sh_b= 16, el_b= 28,
                   spear=-64, shield_sw=  6, knee_f=  4, knee_b=  8, head= 4),
    'attack': dict(lean= 26, sh_f=-88, el_f= 14, sh_b= 54, el_b= 30,
                   spear=6, shield_sw=-16, knee_f= 34, knee_b= 10, head= 8),
    'cast':   dict(lean=-14, sh_f=-142, el_f= 26, sh_b=-128, el_b= 22,
                   spear=-114, shield_sw= 20, knee_f=  2, knee_b=  4, head=-16),
    'hurt':   dict(lean=-30, sh_f= 34, el_f= 74, sh_b= 40, el_b= 56,
                   spear=44, shield_sw= 30, knee_f= 16, knee_b= 26, head=-22),
    'win':    dict(lean= -8, sh_f=-150, el_f= 10, sh_b= 22, el_b= 34,
                   spear=-122, shield_sw=-10, knee_f=  2, knee_b=  6, head=-12),
    'fallen': dict(lean= 18, sh_f= 52, el_f= 40, sh_b= 68, el_b= 24,
                   spear=82, shield_sw= 18, knee_f= 42, knee_b= 22, head= 18,
                   fall=78, drop=-4),
}

# Palettes mirror Iliad.ROSTER[].palette, read as physical materials.
CHARACTERS = {
    'Achilles':  dict(h=1.06, w=1.00, crest=1.30, bronze=(0.79,0.60,0.20),
                      cape=(0.42,0.06,0.04), crest_col=(0.62,0.13,0.09),
                      tunic=(0.84,0.78,0.64), skin=(0.78,0.52,0.33)),
    'Hector':    dict(h=1.03, w=1.08, crest=1.10, bronze=(0.72,0.52,0.22),
                      cape=(0.16,0.20,0.42), crest_col=(0.72,0.24,0.18),
                      tunic=(0.76,0.70,0.58), skin=(0.72,0.47,0.29)),
}

# ------------------------------------------------------------------- utilities

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def mat(name, colour, metallic=0.0, rough=0.5, sheen=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']

    def put(key, value):
        if key in b.inputs:
            b.inputs[key].default_value = value

    put('Base Color', (*colour, 1.0))
    put('Metallic', metallic)
    put('Roughness', rough)
    put('Sheen Weight', sheen)
    put('IOR', 1.45)
    return m


def finish(obj, material, bevel=0.6, smooth=True, segments=2):
    obj.data.materials.append(material)
    if bevel:
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(50)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.rotation_euler = [math.radians(a) for a in rot]
    return o


def cyl(name, r, depth, loc, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc,
                                        vertices=verts)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = [math.radians(a) for a in rot]
    return o


def ball(name, r, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24,
                                         ring_count=14)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return o


def swing(obj, pivot, angle_deg, axis='Y'):
    """Rotate an object about a world-space pivot — how every joint is posed.

    The view layer update is load-bearing: matrix_world is not recomputed from
    rotation_euler/scale until the depsgraph runs, so without it this composes
    against a stale matrix and throws away the object's own orientation.
    """
    bpy.context.view_layer.update()
    R = Matrix.Rotation(math.radians(angle_deg), 4, axis)
    T = Matrix.Translation(pivot)
    obj.matrix_world = T @ R @ T.inverted() @ obj.matrix_world


def limb(name, top, length, radius, angle, taper=0.82, material=None,
         axis='Y'):
    """A tapered segment hanging from `top`, swung by `angle`. Returns the
    far end, so the next segment can hang off it."""
    mid = Vector(top) + Vector((0, 0, -length / 2.0))
    o = cyl(name, radius, length, mid)
    # taper toward the far end
    bm = bmesh.new(); bm.from_mesh(o.data)
    zs = [v.co.z for v in bm.verts]
    lo = min(zs)
    for v in bm.verts:
        if abs(v.co.z - lo) < 1e-4:
            v.co.x *= taper; v.co.y *= taper
    bm.to_mesh(o.data); bm.free()
    swing(o, Vector(top), angle, axis)
    if material:
        finish(o, material, bevel=radius * 0.28)
    end = Vector(top) + (Matrix.Rotation(math.radians(angle), 4, axis)
                         @ Vector((0, 0, -length)))
    return o, end

# --------------------------------------------------------------- the figure

def build_figure(ch, pose):
    P = POSES[pose]
    H, WD = ch['h'], ch['w']

    bronze = mat('bronze', ch['bronze'], metallic=1.0, rough=0.24)
    bronze_d = mat('bronze_dark', [c * 0.62 for c in ch['bronze']],
                   metallic=1.0, rough=0.46)
    iron = mat('iron', (0.58, 0.60, 0.64), metallic=1.0, rough=0.28)
    leather = mat('leather', (0.30, 0.17, 0.09), rough=0.78)
    tunic = mat('tunic', ch['tunic'], rough=0.88, sheen=0.3)
    cape = mat('cape', ch['cape'], rough=0.82, sheen=0.4)
    crest = mat('crest', ch['crest_col'], rough=0.74, sheen=0.6)
    skin = mat('skin', ch['skin'], rough=0.56)
    wood = mat('wood', (0.52, 0.37, 0.21), rough=0.66)

    parts = []

    hip_z, sh_z, head_z = 68 * H, 110 * H, 127 * H
    lean = P['lean']

    # ---- legs. Built first so the torso lean does not carry them.
    for side, (dx, knee, foot_sw) in {
        'f': (5.5 * WD, P['knee_f'],  6),
        'b': (-6.5 * WD, P['knee_b'], -10),
    }.items():
        thigh, knee_pt = limb(f'thigh_{side}', (dx, (7 if side == 'f' else -7), hip_z),
                              30 * H, 6.2 * WD, -knee * 0.55, material=skin)
        shin, ankle = limb(f'shin_{side}', knee_pt, 30 * H, 5.0 * WD,
                           knee * 0.9, material=skin)
        shin_mid = (Vector(knee_pt) + Vector(ankle)) / 2.0
        greave = cyl(f'greave_{side}', 5.9 * WD, 24 * H,
                     shin_mid + Vector((0, 0, -1)))
        greave.rotation_euler = (0, math.radians(knee * 0.9), 0)
        finish(greave, bronze, bevel=1.0)
        foot = box(f'foot_{side}', (17, 8.5, 5), ankle + Vector((3, 0, -2)),
                   rot=(0, foot_sw, 0))
        finish(foot, leather, bevel=1.0)
        parts += [thigh, shin, greave, foot]

    # ---- torso: pelvis, cuirass, pteruges
    pelvis = ball('pelvis', 12 * WD, (0, 0, hip_z + 3), scale=(1.15, 0.86, 0.8))
    finish(pelvis, tunic, bevel=0)
    parts.append(pelvis)

    chest_mid = (0, 0, (hip_z + sh_z) / 2 + 4)
    cuirass = ball('cuirass', 1.0, chest_mid,
                   scale=(15.0 * WD, 10.5 * WD, 25 * H))
    # flare the top of the cuirass so the shoulders read broader than the waist
    bm = bmesh.new(); bm.from_mesh(cuirass.data)
    for v in bm.verts:
        t = max(0.0, v.co.z)
        v.co.x *= 1.0 + t * 0.34
        v.co.y *= 1.0 + t * 0.20
    bm.to_mesh(cuirass.data); bm.free()
    finish(cuirass, bronze, bevel=0)
    parts.append(cuirass)
    # the muscled front of the cuirass catches the key light
    pecs = ball('pecs', 1.0, (5.5, -7.5 * WD, sh_z - 14 * H),
                scale=(9 * WD, 5 * WD, 7 * H))
    finish(pecs, bronze, bevel=0)
    parts.append(pecs)

    for i in range(9):
        a = -14 + i * 3.6
        strip = box(f'pteruge{i}', (7.0, 3.2, 17 * H),
                    (a * 1.5, -8.5 + (i % 2) * 0.6, hip_z - 6 * H))
        finish(strip, leather, bevel=0.5)
        parts.append(strip)

    # ---- shoulders and arms. 'f' is the spear arm, 'b' carries the hoplon.
    sh_f_pt = Vector((2, -11.5 * WD, sh_z))
    sh_b_pt = Vector((-2, 11.5 * WD, sh_z))

    for tag, pt, sh_a, el_a in (('f', sh_f_pt, P['sh_f'], P['el_f']),
                                ('b', sh_b_pt, P['sh_b'], P['el_b'])):
        pad = ball(f'pauldron_{tag}', 8.2 * WD, pt, scale=(1, 1, 0.78))
        finish(pad, bronze, bevel=0)
        upper, elbow = limb(f'upper_{tag}', pt, 26 * H, 4.9 * WD, sh_a,
                            material=skin)
        fore, hand_pt = limb(f'fore_{tag}', elbow, 24 * H, 4.1 * WD,
                             sh_a + el_a, material=skin)
        fist = ball(f'fist_{tag}', 5.0 * WD, hand_pt)
        finish(fist, skin, bevel=0)
        parts += [pad, upper, fore, fist]
        if tag == 'f':
            spear_hand = hand_pt
        else:
            shield_hand = hand_pt

    # ---- neck and head
    neck = cyl('neck', 5.2 * WD, 12 * H, (0, 0, sh_z + 5 * H))
    finish(neck, skin, bevel=0.6)
    head = ball('head', 9.2 * WD, (1, 0, head_z), scale=(1, 1.06, 1.12))
    finish(head, skin, bevel=0)
    parts += [neck, head]

    # Corinthian helmet: dome, nose guard, cheek plates, neck flare.
    dome = ball('helm', 10.4 * WD, (1, 0, head_z + 1.5), scale=(1, 1.05, 1.1))
    finish(dome, bronze, bevel=0)
    void = ball('facevoid', 1.0, (7.2 * WD, 0, head_z - 2.5),
                scale=(4.2, 6.6 * WD, 8.0))
    finish(void, mat('void', (0.05, 0.04, 0.05), rough=0.9), bevel=0)
    nose = box('noseguard', (3.0, 2.6, 15), (9.2 * WD, 0, head_z - 3))
    finish(nose, bronze, bevel=0.5)
    parts += [dome, void, nose]
    for s_ in (-1, 1):
        slot = box(f'eyeslot{s_}', (3.0, 3.4, 2.6),
                   (8.6 * WD, s_ * 4.4 * WD, head_z + 2.5), rot=(0, -10, 0))
        finish(slot, mat('void', (0.05, 0.04, 0.05), rough=0.9), bevel=0.3)
        parts.append(slot)
    for s in (-1, 1):
        cheek = box(f'cheek{s}', (7, 2.6, 12),
                    (4.0 * WD, s * 7.4 * WD, head_z - 5), rot=(0, -8, 0))
        finish(cheek, bronze, bevel=0.8)
        parts.append(cheek)
    flare = box('helmflare', (9, 15, 3.2), (-6 * WD, 0, head_z - 6),
                rot=(0, 22, 0))
    finish(flare, bronze_d, bevel=0.8)
    parts.append(flare)

    # crest: a blade of horsehair running fore-and-aft over the dome
    cr = ball('crest', 1.0, (-1, 0, head_z + 9.5 * ch['crest']),
              scale=(15.0, 2.4, 7.0 * ch['crest']))
    bm = bmesh.new(); bm.from_mesh(cr.data)
    for v in bm.verts:      # comb it back into a wedge, tall at the front
        v.co.z *= 1.0 - 0.34 * max(0.0, -v.co.x / 17.5)
    bm.to_mesh(cr.data); bm.free()
    finish(cr, crest, bevel=0)
    holder = box('crestbox', (24, 3.6, 3.0), (0, 0, head_z + 8))
    finish(holder, bronze_d, bevel=0.6)
    parts += [cr, holder]

    # ---- hoplon: a domed round shield on the off arm
    sh_c = shield_hand + Vector((10, -13, 12))
    face = cyl('hoplon', 33 * WD, 4.5, sh_c, rot=(90, 0, 12))
    finish(face, bronze, bevel=1.4)
    dome_s = ball('hoplon_dome', 1.0, sh_c + Vector((0, -3.4, 0)),
                  scale=(31 * WD, 7.0, 31 * WD))
    finish(dome_s, bronze, bevel=0)
    boss = ball('boss', 6.4, sh_c + Vector((0, -7.2, 0)), scale=(1, 0.7, 1))
    finish(boss, bronze_d, bevel=0)
    rim = cyl('hoplon_rim', 34.5 * WD, 2.6, sh_c + Vector((0, -1, 0)),
              rot=(90, 0, 12))
    finish(rim, bronze_d, bevel=0.8)
    swing(face, shield_hand, P['shield_sw'])
    swing(dome_s, shield_hand, P['shield_sw'])
    swing(boss, shield_hand, P['shield_sw'])
    swing(rim, shield_hand, P['shield_sw'])
    parts += [face, dome_s, boss, rim]

    # ---- dory: shaft, leaf-shaped head, butt-spike.
    # Built horizontal along +x and gripped a third of the way back from the
    # balance point, then swung as one piece. Spear angles read 0 = level and
    # pointing forward, negative = raised.
    sp_ang = P['spear']
    L = 205
    grip_fwd, grip_back = L * 0.62, L * 0.38
    ctr = spear_hand + Vector(((grip_fwd - grip_back) / 2.0, 0, 0))
    shaft = cyl('shaft', 2.4, L, ctr, rot=(0, 90, 0))
    finish(shaft, wood, bevel=0)
    tip = ball('speartip', 1.0, spear_hand + Vector((grip_fwd, 0, 0)),
               scale=(13, 1.6, 4.0))
    finish(tip, iron, bevel=0)
    butt = ball('buttspike', 1.0, spear_hand + Vector((-grip_back, 0, 0)),
                scale=(8, 1.6, 2.6))
    finish(butt, iron, bevel=0)
    for o in (shaft, tip, butt):
        swing(o, spear_hand, sp_ang)
    parts += [shaft, tip, butt]

    # ---- cape, hanging off the shoulders behind
    cp = ball('cape', 1.0, (-11, 6, sh_z - 30 * H),
              scale=(13, 15.5, 34 * H))
    finish(cp, cape, bevel=0)
    parts.append(cp)

    # ---- lean the upper body. Legs and feet stay planted.
    upper_names = ('cuirass', 'pecs', 'pauldron', 'upper_', 'fore_', 'fist_',
                   'neck', 'head', 'helm', 'noseguard', 'cheek', 'crest',
                   'hoplon', 'boss', 'shaft', 'speartip', 'buttspike', 'cape',
                   'pteruge', 'pelvis')
    for o in parts:
        if any(o.name.startswith(n) for n in upper_names):
            swing(o, Vector((0, 0, hip_z)), lean * 0.5)
    for o in parts:
        if o.name.startswith(('head', 'helm', 'noseguard', 'cheek', 'crest')):
            swing(o, Vector((0, 0, sh_z)), P['head'])

    # ---- turn to the three-quarter stance, then tip over if fallen
    root = bpy.data.objects.new('root', None)
    bpy.context.collection.objects.link(root)
    for o in parts:
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)

    # Seat the figure on the ground rather than trusting the joint arithmetic
    # to land there. Limb lengths and knee bends do not add up to exactly the
    # hip height, and the residual is precisely the hover this whole contract
    # exists to prevent — so measure the lowest vertex and drop onto z=0.
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z
              for o in parts for v in o.data.vertices)
    for o in parts:
        o.matrix_world = Matrix.Translation(Vector((0, 0, -low))) @ o.matrix_world
    bpy.context.view_layer.update()

    turn = Matrix.Rotation(math.radians(-(90 - TURN_DEG)), 4, 'Z')
    if 'fall' in P:
        fall = Matrix.Rotation(math.radians(P['fall']), 4, 'Y')
        drop = Matrix.Translation(Vector((-34, 0, 0)))
        root.matrix_world = drop @ fall @ turn
    else:
        root.matrix_world = turn
    return root

# ----------------------------------------------------------------- the studio

def setup_world():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('[render] GPU unavailable, using CPU:', e)
        scene.cycles.device = 'CPU'

    scene.cycles.samples = SAMPLES[0]
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = CELL_W
    scene.render.resolution_y = CELL_H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.compression = 20
    # Standard keeps the palette predictable against flat 2D backdrops; AgX
    # would roll the bronze highlights off into something duller.
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'

    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.19, 0.26, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    scene.world = world

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = BUF_W
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (CAM_CX, -900, CAM_CZ)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    # Key from the upper right, warm — agreeing with Iliad.SUN at [548, 58].
    key = bpy.data.lights.new('key', 'SUN')
    key.energy = 7.4
    key.color = (1.0, 0.93, 0.76)
    key.angle = math.radians(3.5)
    ko = bpy.data.objects.new('key', key)
    ko.rotation_euler = (math.radians(58), 0, math.radians(-128))
    bpy.context.collection.objects.link(ko)

    # Cool fill from the lower left, standing in for sky bounce off the plain.
    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 60000
    fill.color = (0.55, 0.68, 1.0)
    fill.size = 260
    fo = bpy.data.objects.new('fill', fill)
    fo.location = (-230, -260, 30)
    fo.rotation_euler = (math.radians(76), 0, math.radians(-42))
    bpy.context.collection.objects.link(fo)

    # Warm rim from behind right, to lift the silhouette off the backdrop.
    rim = bpy.data.lights.new('rim', 'AREA')
    rim.energy = 260000
    rim.color = (1.0, 0.86, 0.62)
    rim.size = 180
    ro = bpy.data.objects.new('rim', rim)
    ro.location = (210, 300, 150)
    ro.rotation_euler = (math.radians(120), 0, math.radians(150))
    bpy.context.collection.objects.link(ro)

# ---------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    name = 'Achilles'
    only = None
    for i, a in enumerate(argv):
        if a == '--character' and i + 1 < len(argv):
            name = argv[i + 1]
        if a == '--pose' and i + 1 < len(argv):
            only = argv[i + 1]
        if a == '--samples' and i + 1 < len(argv):
            SAMPLES[0] = int(argv[i + 1])
    ch = CHARACTERS[name]

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    outdir = os.path.join(root, 'art', 'warriors', '_build',
                          name.lower().replace(' ', '-'))
    os.makedirs(outdir, exist_ok=True)

    poses = [only] if only else POSE_ORDER
    for pose in poses:
        clear_scene()
        setup_world()
        build_figure(ch, pose)
        bpy.context.scene.render.filepath = os.path.join(outdir, f'{pose}.png')
        print(f'[render] {name} {pose} -> {bpy.context.scene.render.filepath}')
        bpy.ops.render.render(write_still=True)

    meta = dict(character=name, scale=SS, cell=[CELL_W, CELL_H],
                anchor=ANCHOR, poses=POSE_ORDER,
                buffer=[BUF_W, BUF_H], origin=[OX, OY])
    with open(os.path.join(outdir, 'render_meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    print('[render] meta:', json.dumps(meta))


main()
