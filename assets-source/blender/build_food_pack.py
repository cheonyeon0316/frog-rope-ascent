"""Author all eight ecosystem food targets as small, readable GLB models."""
import bpy, math, json, os, random
from mathutils import Vector

ROOT=r"C:\Codex\frog-ascent-windows-20261013\frog-ascent-windows-20261013\workspace\Last\browser\frog-rope-ascent"
OUT=os.path.join(ROOT,"public","assets","eco-food")
SRC=os.path.join(ROOT,"assets-source","blender")
os.makedirs(OUT,exist_ok=True); os.makedirs(SRC,exist_ok=True)
random.seed(8)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)

def mat(name,c,rough=.65,metal=0,alpha=1,emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*c,alpha); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value=(*c,alpha); p.inputs["Roughness"].default_value=rough; p.inputs["Metallic"].default_value=metal
    if "Alpha" in p.inputs: p.inputs["Alpha"].default_value=alpha
    if emission and "Emission Color" in p.inputs:
        p.inputs["Emission Color"].default_value=(*c,1); p.inputs["Emission Strength"].default_value=emission
    if alpha<1: m.surface_render_method="DITHERED"
    return m
M={
"brown":mat("Food | fruit fly chestnut",(.48,.25,.10)),
"amber":mat("Food | amber",(.87,.48,.12),.4),
"dark":mat("Food | graphite",(.16,.20,.18),.35,.12),
"green":mat("Food | beetle enamel",(.10,.42,.31),.27,.22),
"gold":mat("Food | pollen gold",(.97,.68,.14),.45),
"yellow":mat("Food | bee gold",(.96,.65,.12),.4),
"black":mat("Food | charcoal",(.10,.10,.09),.5),
"cream":mat("Food | wing ivory",(.82,.94,.80),.4,alpha=.58),
"pink":mat("Food | moth wing",(.70,.43,.62),.58),
"pale":mat("Food | dew ice",(.36,.78,.88),.18,.08,alpha=.72),
"star":mat("Food | stardust glow",(1.0,.77,.30),.25,.15,emission=.45),
"eye":mat("Food | dark eyes",(.025,.03,.035),.2),
"white":mat("Food | eye highlight",(1,.96,.78),.2),
}

def ico(name,loc,scale,material,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc)
    ob=bpy.context.object; ob.name=name; ob.scale=scale; ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth=False
    return ob
def curve(name,pts,r,material):
    cu=bpy.data.curves.new(name+"Curve","CURVE"); cu.dimensions="3D"; cu.resolution_u=1; cu.bevel_depth=r; cu.bevel_resolution=1
    s=cu.splines.new("POLY"); s.points.add(len(pts)-1)
    for p,co in zip(s.points,pts): p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(ob); cu.materials.append(material); return ob
def wing(name,loc,scale,rotation,material):
    ob=ico(name,loc,scale,material,2); ob.rotation_euler=rotation; return ob
def anchor(name="AnchorSocket"):
    ob=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(ob); ob.empty_display_type="SPHERE"; ob.empty_display_size=.06; return ob
def eye_pair(group,mat_eye=M["eye"]):
    for side in (-1,1):
        group.append(ico("Eye",(side*.11,.02,.28),(.085,.085,.09),mat_eye,1))
        group.append(ico("Eye highlight",(side*.128,.085,.32),(.025,.018,.025),M["white"],1))
def legs(group,count=6,spread=.18):
    for i in range(count):
        side=-1 if i%2==0 else 1; row=i//2
        x=(row-1)*.13
        group.append(curve("Leg %02d"%i,[(x,0,-.02),(x+side*spread*.55,-.02,-.12),(x+side*spread,-.10,-.19)],.012,M["dark"]))
def finish(identifier,label,group,description):
    group.append(anchor())
    path=os.path.join(OUT,identifier+".glb")
    bpy.ops.object.select_all(action="DESELECT")
    for ob in group: ob.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True)
    # Tighten only the review layout so the small food models remain legible in the preview.
    off=len(items); dx=(off%4)*1.75; dy=(off//4)*1.75
    for ob in group: ob.location.x+=dx; ob.location.y+=dy
    items.append({"id":identifier,"name":label,"file":"public/assets/eco-food/"+identifier+".glb","purpose":description,"objectCount":len(group)})

items=[]
# Fruit fly: warm segmented body and short clear wings
g=[ico("Fruit fly | abdomen",(0,0,0),(.18,.14,.14),M["brown"]),ico("Fruit fly | thorax",(0,0,.15),(.13,.12,.11),M["amber"])]
eye_pair(g); legs(g)
g += [wing("Wing L",(-.11,-.02,.23),(.19,.065,.035),(0,.18,-.27),M["cream"]),wing("Wing R",(.11,-.02,.23),(.19,.065,.035),(0,-.18,.27),M["cream"])]
g += [curve("Antenna L",[(-.06,.02,.24),(-.1,.05,.34),(-.14,.05,.38)],.009,M["dark"]),curve("Antenna R",[(.06,.02,.24),(.1,.05,.34),(.14,.05,.38)],.009,M["dark"])]
finish("food_fruit_fly","초파리",g,"가장 작은 목표, 따뜻한 몸색과 짧은 반투명 날개")

# Common fly: larger dark body, conspicuous eyes and broad flight wings
g=[ico("Fly | abdomen",(0,0,0),(.26,.19,.19),M["dark"]),ico("Fly | thorax",(0,0,.19),(.17,.16,.15),M["dark"])]
eye_pair(g); legs(g,6,.23)
g += [wing("Wing L",(-.16,-.02,.28),(.28,.08,.035),(0,.16,-.24),M["cream"]),wing("Wing R",(.16,-.02,.28),(.28,.08,.035),(0,-.16,.24),M["cream"])]
finish("food_fly","파리",g,"표준 목표 파리, 굵은 몸통과 넓은 날개")

# Beetle: green plated shell with a visible center seam
g=[ico("Beetle | body",(0,0,0),(.24,.19,.18),M["dark"]),ico("Beetle | elytra",(0,.01,.10),(.26,.20,.19),M["green"]),ico("Beetle | head",(0,.04,.25),(.12,.12,.11),M["green"])]
g.append(curve("Elytra seam",[(0,-.185,.08),(0,-.12,.22),(0,-.02,.28)],.009,M["gold"]))
eye_pair(g); legs(g)
g += [curve("Beetle antenna L",[(-.06,.06,.31),(-.12,.07,.42),(-.16,.06,.44)],.012,M["dark"]),curve("Beetle antenna R",[(.06,.06,.31),(.12,.07,.42),(.16,.06,.44)],.012,M["dark"])]
finish("food_beetle","풍뎅이",g,"낮고 단단한 청록 딱지날개와 중앙 봉합선")

# Pollen: a warm cluster whose spherical silhouette reads at a distance
g=[]
for i,(loc,sc) in enumerate([((-.12,0,.0),(.15,.15,.15)),((.10,0,.05),(.13,.13,.13)),((0,.04,.19),(.12,.12,.12))]):
    g.append(ico("Pollen grain %02d"%i,loc,sc,M["gold"],1))
g.append(curve("Pollen filament",[ (0,0,.25),(0,0,.40),(.05,.02,.49)],.018,M["amber"]))
for i in range(5):
    a=i*2*math.pi/5
    g.append(ico("Pollen spark %02d"%i,(math.cos(a)*.22,math.sin(a)*.18,.18),(.035,.035,.07),M["star"],1))
finish("food_pollen","꽃가루",g,"서로 붙은 황금빛 꽃가루 입자와 작은 광점")

# Bee: golden abdomen with dark bands, clear wings and six legs
g=[ico("Bee | abdomen",(0,0,0),(.23,.19,.20),M["yellow"]),ico("Bee | thorax",(0,0,.18),(.16,.15,.14),M["yellow"]),ico("Bee | head",(0,0,.31),(.12,.12,.12),M["amber"])]
for z in (-.08,.03,.14):
    band=ico("Bee | dark band",(0,-.008,z),(.232,.193,.035),M["black"],2)
    g.append(band)
eye_pair(g); legs(g,6,.2)
g += [wing("Bee wing L",(-.15,.0,.27),(.24,.08,.035),(0,.22,-.2),M["cream"]),wing("Bee wing R",(.15,.0,.27),(.24,.08,.035),(0,-.22,.2),M["cream"])]
finish("food_bee","벌",g,"노란 몸과 검은 띠, 옅은 날개와 작은 다리")

# Moth: wider patterned wings with a small body and feather-like antennae
g=[ico("Moth | body",(0,0,0),(.12,.12,.29),M["pink"]),ico("Moth | thorax",(0,0,.22),(.15,.14,.15),M["pink"])]
for side in (-1,1):
    g.append(wing("Moth | upper wing %s"%side,(side*.22,.02,.22),(.29,.08,.26),(0,side*.12,side*.20),M["pink"]))
    g.append(wing("Moth | lower wing %s"%side,(side*.20,.02,-.02),(.20,.07,.18),(0,-side*.10,side*.3),M["amber"]))
    g.append(ico("Moth | wing eye %s"%side,(side*.29,-.055,.25),(.045,.025,.055),M["gold"],1))
    g.append(curve("Moth antenna %s"%side,[(side*.05,0,.32),(side*.11,0,.43),(side*.16,0,.48)],.012,M["dark"]))
legs(g)
finish("food_moth","나방",g,"큰 자주빛 날개와 따뜻한 눈무늬로 구분되는 목표")

# Dew: faceted translucent droplet on a tiny leaf cradle
g=[ico("Dew | drop",(0,0,.12),(.17,.17,.24),M["pale"],2),ico("Dew | tip",(0,0,.32),(.085,.085,.15),M["pale"],1)]
g.append(ico("Dew | leaf",(0,0,-.13),(.25,.12,.035),M["leaf"] if "leaf" in M else M["green"],1))
finish("food_dew","이슬",g,"맑은 청록 물방울과 작은 잎 받침")

# Stardust: solid five-point star and three orbiting grains
verts=[]; faces=[]
for z in (.06,-.06):
    for i in range(10):
        a=math.pi/2+i*math.pi/5; r=.32 if i%2==0 else .145
        verts.append((math.cos(a)*r,math.sin(a)*r,z))
verts.extend([(0,0,.06),(0,0,-.06)])
for i in range(10): faces.append((20,i,(i+1)%10))
for i in range(10): faces.append((21,10+(i+1)%10,10+i))
for i in range(10): faces.append((i,(i+1)%10,10+(i+1)%10,10+i))
star=mesh=None
me=bpy.data.meshes.new("StardustStarMesh"); me.from_pydata(verts,[],faces); me.materials.append(M["star"]); me.update()
star=bpy.data.objects.new("Stardust | five point star",me); bpy.context.collection.objects.link(star); g=[star]
for i,a in enumerate([.2,2.3,4.2]): g.append(ico("Orbit grain %02d"%i,(math.cos(a)*.43,math.sin(a)*.43,.02),(.055,.055,.055),M["star"],1))
finish("food_stardust","별가루",g,"짧은 거리에서도 별로 읽히는 입체 오각 발판형 토큰과 세 입자")

scene=bpy.context.scene; scene.unit_settings.system="METRIC"; scene.render.engine="BLENDER_EEVEE"
scene.render.resolution_x=1440; scene.render.resolution_y=960; scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"; scene.render.filepath=os.path.join(SRC,"food-kit-preview.png")
scene.view_settings.view_transform="AgX"; scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND"); bg.inputs["Color"].default_value=(.74,.82,.76,1); bg.inputs["Strength"].default_value=.7
target=Vector((2.625,.875,.05))
bpy.ops.object.camera_add(location=(2.625,-12,8)); cam=bpy.context.object; cam.name="Food review camera"; cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler(); cam.data.type="ORTHO"; cam.data.ortho_scale=8.5; scene.camera=cam
bpy.ops.object.light_add(type="AREA",location=(1,-5,9)); light=bpy.context.object; light.data.energy=1200; light.data.shape="DISK"; light.data.size=7; light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
manifest={"pack":"ecosystem-food-first-pass","units":"metres","status":"first-pass-review","assets":items,"notes":["All 8 in-game food types have separate GLB models.","Target anchors are present; game behavior and collision remain in course data."]}
with open(os.path.join(SRC,"food-kit-manifest.json"),"w",encoding="utf-8") as f: json.dump(manifest,f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,"food-kit.blend"))
bpy.ops.render.render(write_still=True)
print("FOOD_KIT_RESULT "+json.dumps({"assets":items,"preview":scene.render.filepath},ensure_ascii=False))
