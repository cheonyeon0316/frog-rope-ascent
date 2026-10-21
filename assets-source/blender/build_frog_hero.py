"""Create a friendly low-poly frog hero mesh with a lightweight skeletal rig."""
import bpy, json, math, os
from mathutils import Vector

ROOT=r"C:\Codex\frog-ascent-windows-20261013\frog-ascent-windows-20261013\workspace\Last\browser\frog-rope-ascent"
OUT=os.path.join(ROOT,"public","assets","character");SRC=os.path.join(ROOT,"assets-source","blender")
os.makedirs(OUT,exist_ok=True)
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
def mat(n,c,r=.68,metal=0):
    m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=next(x for x in m.node_tree.nodes if x.type=="BSDF_PRINCIPLED");p.inputs["Base Color"].default_value=(*c,1);p.inputs["Roughness"].default_value=r;p.inputs["Metallic"].default_value=metal;return m
M={"green":mat("Frog | warm leaf green",(.21,.43,.12)),"light":mat("Frog | sunlit green",(.35,.54,.17)),"shadow":mat("Frog | deep green",(.13,.27,.09)),"belly":mat("Frog | soft cream throat",(.68,.64,.46)),"mouth":mat("Frog | mouth line",(.22,.20,.13)),"eye":mat("Frog | amber iris",(.93,.67,.20),.38),"pupil":mat("Frog | dark pupil",(.055,.065,.04),.25),"glint":mat("Frog | eye glint",(.98,.96,.81),.2),"toe":mat("Frog | muted golden toe pads",(.66,.52,.21))}
groups={"Torso":[],"Head":[],"ForeLeg.L":[],"ForeLeg.R":[],"HindLeg.L":[],"HindLeg.R":[]}
def ico(name,loc,scale,material,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=False
    return o
def uv(name,loc,scale,material,seg=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=False
    return o
def rod(name,a,b,r,material,r2=None,vertices=8):
    mid=(Vector(a)+Vector(b))/2;d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r if r2 is None else r2,radius2=r,depth=d.length,location=mid)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(material);return o
def curve(name,points,r,material):
    c=bpy.data.curves.new(name+"Curve","CURVE");c.dimensions="3D";c.resolution_u=1;c.bevel_depth=r;c.bevel_resolution=2;s=c.splines.new("POLY");s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);c.materials.append(material);return o

# Body: a broad, compact torso with a pale throat and gently sloped snout.
groups["Torso"] += [ico("Frog | body",(0,-.02,.42),(.43,.66,.34),M["green"],3),ico("Frog | back mantle",(0,-.16,.57),(.33,.42,.16),M["light"],2),uv("Frog | belly",(0,.27,.31),(.32,.36,.21),M["belly"],12,8)]
# Hind legs have substantial thighs and long folded shins, with splayed round toe pads.
for side,label in [(-1,"L"),(1,"R")]:
    role="HindLeg."+label
    hip=(side*.30,-.36,.42);knee=(side*.55,-.05,.24);ankle=(side*.48,.48,.105)
    groups[role] += [ico("Frog | hind thigh "+label,(side*.43,-.34,.40),(.30,.39,.26),M["green"],2),rod("Frog | hind shin "+label,knee,ankle,.105,M["green"],.07),uv("Frog | rear palm "+label,(side*.47,.47,.10),(.18,.23,.075),M["shadow"],10,6)]
    for i in range(3):
        spread=(i-1)*.14;start=(side*.47,.53,.10);end=(side*.47+spread,.78+(.06 if i==1 else 0),.075)
        groups[role].append(rod("Frog | rear toe "+label+str(i),start,end,.038,M["green"],.026,7))
        groups[role].append(uv("Frog | rear toe pad "+label+str(i),end,(.047,.055,.033),M["toe"],8,5))
    # Small forearms reach forward, ending in a three-toed planted hand.
    role="ForeLeg."+label
    shoulder=(side*.30,.22,.46);elbow=(side*.38,.45,.24);wrist=(side*.36,.70,.10)
    groups[role] += [rod("Frog | upper foreleg "+label,shoulder,elbow,.095,M["green"],.075),rod("Frog | lower foreleg "+label,elbow,wrist,.066,M["light"],.05),uv("Frog | front palm "+label,(side*.36,.72,.095),(.13,.18,.055),M["green"],10,6)]
    for i in range(3):
        spread=(i-1)*.11;start=(side*.36,.78,.09);end=(side*.36+spread,.94+(.04 if i==1 else 0),.07)
        groups[role].append(rod("Frog | front toe "+label+str(i),start,end,.028,M["green"],.021,7))
        groups[role].append(uv("Frog | front toe pad "+label+str(i),end,(.034,.039,.026),M["toe"],8,5))

# Head and face: broad frog eye sockets, amber irises, soft snout, nostrils and smile.
groups["Head"] += [ico("Frog | head",(0,.35,.57),(.38,.40,.30),M["green"],2),ico("Frog | muzzle",(0,.68,.47),(.31,.25,.17),M["light"],2),uv("Frog | throat",(0,.40,.28),(.28,.24,.14),M["belly"],12,8)]
for side,label in [(-1,"L"),(1,"R")]:
    x=side*.245
    groups["Head"] += [uv("Frog | eye dome "+label,(x,.38,.79),(.135,.15,.14),M["green"],10,7),uv("Frog | iris "+label,(x,.512,.80),(.088,.048,.089),M["eye"],12,8),uv("Frog | pupil "+label,(x,.552,.805),(.052,.028,.060),M["pupil"],10,7),uv("Frog | catchlight "+label,(x-.022,.578,.835),(.019,.010,.021),M["glint"],8,5)]
    groups["Head"].append(uv("Frog | nostril "+label,(side*.095,.882,.51),(.018,.012,.012),M["shadow"],8,5))
groups["Head"].append(curve("Frog | quiet smile",[(-.255,.75,.405),(-.16,.83,.385),(0,.89,.38),(.16,.83,.385),(.255,.75,.405)],.012,M["mouth"]))

# Neutral crouch rig. Individual low-poly parts are rigidly attached to bones, ready for animator refinement.
arm_data=bpy.data.armatures.new("Frog Hero | skeleton");arm=bpy.data.objects.new("Frog Hero | rig",arm_data);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bones={"Root":((0,0,.05),(0,0,.30)),"Torso":((0,-.18,.30),(0,.05,.60)),"Head":((0,.28,.50),(0,.40,.84)),"ForeLeg.L":((-.30,.22,.45),(-.40,.50,.23)),"ForeLeg.R":((.30,.22,.45),(.40,.50,.23)),"HindLeg.L":((-.30,-.34,.42),(-.55,-.04,.24)),"HindLeg.R":((.30,-.34,.42),(.55,-.04,.24))}
for name,(head,tail) in bones.items():b=arm_data.edit_bones.new(name);b.head=head;b.tail=tail
for child,parent in [("Torso","Root"),("Head","Torso"),("ForeLeg.L","Torso"),("ForeLeg.R","Torso"),("HindLeg.L","Torso"),("HindLeg.R","Torso")]:arm_data.edit_bones[child].parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT");arm.show_in_front=True
for role,objects in groups.items():
    for o in objects:
        world=o.matrix_world.copy();o.parent=arm;o.parent_type="BONE";o.parent_bone=role;o.matrix_parent_inverse=(arm.matrix_world @ arm.pose.bones[role].matrix).inverted();o.matrix_world=world

# Three first-pass clips use rigidly attached parts and provide a useful animation test in a runtime.
arm.animation_data_create()
clips={
    "Frog_Idle": [(1,{"Torso":(0,0,0),"Head":(0,0,0)}),(8,{"Torso":(.025,0,0),"Head":(-.02,0,0)}),(16,{"Torso":(0,0,0),"Head":(0,0,0)})],
    "Frog_Jump": [(1,{"Torso":(0,0,0),"ForeLeg.L":(0,0,0),"ForeLeg.R":(0,0,0),"HindLeg.L":(0,0,0),"HindLeg.R":(0,0,0)}),(5,{"Torso":(-.12,0,0),"ForeLeg.L":(-.22,0,0),"ForeLeg.R":(-.22,0,0),"HindLeg.L":(.18,0,0),"HindLeg.R":(.18,0,0)}),(9,{"Torso":(.18,0,0),"ForeLeg.L":(.22,0,0),"ForeLeg.R":(.22,0,0),"HindLeg.L":(-.26,0,0),"HindLeg.R":(-.26,0,0)}),(13,{"Torso":(0,0,0),"ForeLeg.L":(0,0,0),"ForeLeg.R":(0,0,0),"HindLeg.L":(0,0,0),"HindLeg.R":(0,0,0)})],
    "Frog_Dash": [(1,{"Torso":(0,0,0),"Head":(0,0,0),"ForeLeg.L":(0,0,0),"ForeLeg.R":(0,0,0),"HindLeg.L":(0,0,0),"HindLeg.R":(0,0,0)}),(4,{"Torso":(.20,0,0),"Head":(-.16,0,0),"ForeLeg.L":(-.36,0,0),"ForeLeg.R":(-.36,0,0),"HindLeg.L":(.30,0,0),"HindLeg.R":(.30,0,0)}),(8,{"Torso":(.04,0,0),"Head":(-.04,0,0),"ForeLeg.L":(-.12,0,0),"ForeLeg.R":(-.12,0,0),"HindLeg.L":(.14,0,0),"HindLeg.R":(.14,0,0)}),(12,{"Torso":(0,0,0),"Head":(0,0,0),"ForeLeg.L":(0,0,0),"ForeLeg.R":(0,0,0),"HindLeg.L":(0,0,0),"HindLeg.R":(0,0,0)})]
}
for clip_name,keys in clips.items():
    action=bpy.data.actions.new(clip_name);arm.animation_data.action=action
    for frame,pose in keys:
        bpy.context.scene.frame_set(frame)
        for bone,rotation in pose.items():
            pb=arm.pose.bones[bone];pb.rotation_mode="XYZ";pb.rotation_euler=rotation;pb.keyframe_insert(data_path="rotation_euler",frame=frame,group=bone)
    arm.animation_data.action=None
    track=arm.animation_data.nla_tracks.new();track.name=clip_name;track.strips.new(clip_name,1,action)
bpy.context.scene.frame_set(1)

# Center the model's ground point at z=0 and use a standard named root socket.
root=bpy.data.objects.new("AnchorSocket",None);bpy.context.collection.objects.link(root);root.empty_display_type="CIRCLE";root.empty_display_size=.10
# Export all visible parts and the skeleton, no preview camera/lights.
path=os.path.join(OUT,"frog_hero_lowpoly.glb");bpy.ops.object.select_all(action="DESELECT")
for o in list(groups.values()):
    for ob in o:ob.select_set(True)
arm.select_set(True);root.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True,export_animations=True,export_nla_strips=True)

# Save the editable character scene and a simple studio preview.
for o in list(bpy.context.scene.objects):
    if o.type not in {"ARMATURE","MESH","EMPTY"}:bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.render.engine="BLENDER_EEVEE";scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format="PNG";scene.render.filepath=os.path.join(SRC,"frog-hero-preview.png");scene.view_settings.view_transform="AgX";scene.world.use_nodes=True;bg=next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND");bg.inputs["Color"].default_value=(.78,.81,.72,1);bg.inputs["Strength"].default_value=.8
target=Vector((0,.10,.47));bpy.ops.object.camera_add(location=(2.5,5,2.2));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.type="ORTHO";cam.data.ortho_scale=2.45;scene.camera=cam
bpy.ops.object.light_add(type="AREA",location=(2,3,5));light=bpy.context.object;light.data.energy=850;light.data.shape="DISK";light.data.size=4;light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
with open(os.path.join(SRC,"frog-hero-manifest.json"),"w",encoding="utf-8") as f:json.dump({"pack":"frog-hero-first-pass","units":"metres","status":"first-pass-review","assets":[{"id":"frog_hero_lowpoly","name":"개구리 주인공","file":"public/assets/character/frog_hero_lowpoly.glb","purpose":"따뜻한 녹색 등과 크림색 목, 호박색 눈, 길게 뻗은 발과 둥근 발끝을 가진 낮은 폴리곤 개구리","rigBones":list(bones.keys()),"animations":list(clips.keys())}],"notes":["Rigid-part starter rig and three first-pass clips; refine timing and arcs against gameplay before shipping.","Model is a visual review asset and is not yet wired into the live renderer."]},f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,"frog-hero.blend"));bpy.ops.render.render(write_still=True)
print("FROG_HERO_RESULT "+json.dumps({"glb":path,"preview":scene.render.filepath,"bones":list(bones.keys())},ensure_ascii=False))
