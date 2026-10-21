"""Build a small reusable meadow-to-flower transition kit for the ecosystem courses."""
import bpy, json, math, os, random
from mathutils import Vector

ROOT=r"C:\Codex\frog-ascent-windows-20261013\frog-ascent-windows-20261013\workspace\Last\browser\frog-rope-ascent"
OUT=os.path.join(ROOT,"public","assets","eco-meadow")
SRC=os.path.join(ROOT,"assets-source","blender")
os.makedirs(OUT,exist_ok=True); random.seed(42)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)

def mat(name,color,rough=.78,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value=(*color,1); p.inputs["Roughness"].default_value=rough; p.inputs["Metallic"].default_value=metal
    return m
M={"earth":mat("Meadow | damp loam",(.22,.14,.085)),"soil":mat("Meadow | cut soil",(.34,.22,.12)),"moss":mat("Meadow | moss",(.19,.34,.11)),"grass1":mat("Meadow | blade sage",(.23,.43,.12)),"grass2":mat("Meadow | blade light",(.42,.58,.19)),"grass3":mat("Meadow | blade shadow",(.12,.28,.10)),"stone":mat("Meadow | riverstone",(.39,.42,.35)),"stone2":mat("Meadow | warm stone",(.53,.48,.37)),"stem":mat("Meadow | stems",(.18,.34,.13)),"leaf":mat("Meadow | leaves",(.27,.46,.15)),"cap":mat("Meadow | mushroom cap",(.66,.25,.12)),"cap2":mat("Meadow | pale cap",(.76,.66,.44)),"underside":mat("Meadow | gills",(.80,.61,.39)),"petal":mat("Meadow | ivory petals",(.93,.82,.59)),"petal2":mat("Meadow | blush petals",(.82,.42,.40)),"center":mat("Meadow | pollen center",(.92,.62,.13)),"gold":mat("Meadow | pollen",(.97,.76,.27))}
items=[]

def ico(name,loc,scale,material,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=False
    return o
def curve(name,pts,r,material):
    cu=bpy.data.curves.new(name+"Curve","CURVE");cu.dimensions="3D";cu.resolution_u=1;cu.bevel_depth=r;cu.bevel_resolution=1
    s=cu.splines.new("POLY");s.points.add(len(pts)-1)
    for p,v in zip(s.points,pts):p.co=(*v,1)
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);cu.materials.append(material);return o
def blade(name,base,lean,height,width,material):
    x,y,z=base; lx,ly=lean
    verts=[(x-width/2,y,z),(x+width/2,y,z),(x+lx*.45+width*.18,y+ly*.45,z+height*.55),(x+lx*.45-width*.18,y+ly*.45,z+height*.55),(x+lx,y+ly,z+height)]
    me=bpy.data.meshes.new(name+"Mesh");me.from_pydata(verts,[],[(0,1,2,3),(3,2,4)]);me.materials.append(material)
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
def petal(name,center,angle,length,width,material,tilt=.25):
    o=ico(name,center,(width,length*.54,width*.50),material,1);o.rotation_euler=(tilt,0,angle);return o
def ground_tile(group,name="Loam base"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=9,radius=1,depth=.34,location=(0,0,-.12));o=bpy.context.object;o.name=name;o.scale=(1,.8,1);o.data.materials.append(M["earth"]);group.append(o)
    # a broken upper soil rim and scattered moss cushions keep the edge organic
    for i in range(5):
        a=2*math.pi*i/5+.2;group.append(ico("Moss cushion",(math.cos(a)*.68,math.sin(a)*.54,.02),(.34,.28,.10),M["moss"],1))
def finish(key,label,group,description):
    a=bpy.data.objects.new("AnchorSocket",None);bpy.context.collection.objects.link(a);a.empty_display_type="SPHERE";a.empty_display_size=.08;group.append(a)
    path=os.path.join(OUT,key+".glb");bpy.ops.object.select_all(action="DESELECT")
    for ob in group:ob.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True)
    items.append({"id":key,"name":label,"file":"public/assets/eco-meadow/"+key+".glb","purpose":description,"objectCount":len(group)})

# Three restrained grass silhouettes, with the ground and blades exported as one placement unit.
for key,label,seed,scale in [("mdl_env_meadow_grass_a","낮고 성긴 풀",0,1.0),("mdl_env_meadow_grass_b","옆으로 눕는 풀",1,.88),("mdl_env_meadow_grass_c","가늘게 솟는 풀",2,1.12)]:
    g=[];ground_tile(g)
    for i in range(7):
        a=i*2.399+seed*.73;r=.14+random.random()*.42
        base=(math.cos(a)*r,math.sin(a)*r,.02);lean=(math.cos(a+.7)*(.12+random.random()*.13),math.sin(a+.7)*(.12+random.random()*.13))
        g.append(blade("Grass blade",base,lean,(.52+random.random()*.45)*scale,.09,random.choice([M["grass1"],M["grass2"],M["grass3"]])))
    finish(key,label,g,"흙과 이끼 바닥에 드문드문 자란 풀잎 7개, 서로 다른 실루엣 변형")

# Moss-covered boulder cluster with visible rock planes and low moss patches.
g=[]
for loc,sc,ma in [((-.48,0,.05),(.64,.52,.55),M["stone"]),((.28,.05,.10),(.54,.48,.72),M["stone2"]),((.78,.10,-.01),(.38,.35,.42),M["stone"])]:
    g.append(ico("Weathered river rock",loc,sc,ma,2))
for i in range(7):
    a=i*2.399;r=.48+random.random()*.38
    g.append(ico("Moss patch",(math.cos(a)*r,-.24+math.sin(a)*.18,.24+random.random()*.22),(.24,.10,.13),M["moss"],1))
finish("mdl_env_moss_boulder_cluster","이끼 낀 바위 군락",g,"크기와 색이 다른 둥근 바위에 드문 이끼 얼룩이 붙은 군락")

# Small mushrooms emerge from a shared piece of damp earth rather than floating as isolated props.
g=[];ground_tile(g,"Mushroom soil hummock")
for i,(x,y,h,r,cap) in enumerate([(-.38,-.04,.43,.31,M["cap"]),(.10,.08,.60,.36,M["cap2"]),(.48,-.08,.35,.27,M["cap"]) ]):
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.105,radius2=.075,depth=h,location=(x,y,.08+h/2));stem=bpy.context.object;stem.name="Mushroom stem";stem.data.materials.append(M["underside"]);g.append(stem)
    g.append(ico("Mushroom underside",(x,y,.08+h), (r*.84,r*.84,.075),M["underside"],1))
    g.append(ico("Mushroom cap",(x,y,.16+h),(r,r*.94,.17),cap,2))
    for j in range(2):g.append(ico("Cap fleck",(x+(j-.5)*r*.42,y-.22,.26+h),(.035,.03,.018),M["petal"],1))
finish("mdl_env_mushroom_cluster","낙엽 사이 버섯 군락",g,"젖은 흙과 세 개의 크기가 다른 버섯으로 초원에서 나무 구역으로 전환")

# A large wildflower landmark on a sturdy curved stem, with leaves and seed center.
g=[]
g.append(curve("Curved flower stalk",[(0,0,0),(.05,0,.48),(-.04,0,.98),(0,0,1.50)],.075,M["stem"]))
g.append(ico("Leaf L",(-.26,-.02,.50),(.31,.105,.11),M["leaf"],2));g[-1].rotation_euler[1]=-.35
g.append(ico("Leaf R",(.25,.02,.83),(.28,.10,.10),M["grass1"],2));g[-1].rotation_euler[1]=.32
for i in range(9):
    a=i*2*math.pi/9;g.append(petal("Flower outer petal",(-.02,0,1.57),a,.42,.19,M["petal2"] if i%3==0 else M["petal"],.55))
g.append(ico("Flower seed head",(-.02,-.01,1.59),(.20,.20,.15),M["center"],2))
for i in range(7):
    a=i*2*math.pi/7;g.append(ico("Pollen grain",(-.02+math.cos(a)*.13,-.02+math.sin(a)*.13,1.70),(.035,.035,.035),M["gold"],1))
finish("mdl_env_wildflower_landmark","큰 야생화",g,"휘어진 줄기와 잎, 겹쳐진 꽃잎이 있는 초원 랜드마크")

# Low multi-flower patch creates a readable transition in scale before the giant flower biome.
g=[];ground_tile(g,"Wildflower patch earth")
for i,(x,y,h,ma) in enumerate([(-.48,-.1,.50,M["petal"]),(-.05,.14,.72,M["petal2"]),(.40,-.05,.48,M["petal"]),(.12,-.36,.38,M["gold"]) ]):
    g.append(curve("Small flower stem",[(x,y,.02),(x+.04,y,h*.55),(x,y,h)],.025,M["stem"]))
    for j in range(6):g.append(petal("Small bloom",(x,y,h),j*math.tau/6,.16,.075,ma,.22))
    g.append(ico("Bloom center",(x,y-.01,h+.015),(.065,.065,.045),M["center"],1))
finish("mdl_env_wildflower_patch","들꽃 패치",g,"바닥 지형과 네 송이 높낮이가 다른 들꽃을 묶은 경계 장식")

# Preview layout is separate from exported geometry; re-import clean copies for the review scene.
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)
for idx,item in enumerate(items):
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,os.path.basename(item["file"])))
    imported=list(bpy.context.selected_objects);dx=(idx%3)*3.0;dy=(idx//3)*2.7
    for ob in imported:ob.location.x+=dx;ob.location.y+=dy

scene=bpy.context.scene;scene.render.engine="BLENDER_EEVEE"
scene.render.resolution_x=1500;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format="PNG";scene.render.filepath=os.path.join(SRC,"meadow-kit-preview.png")
scene.view_settings.view_transform="AgX";scene.world.use_nodes=True;bg=next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND");bg.inputs["Color"].default_value=(.76,.81,.72,1);bg.inputs["Strength"].default_value=.8
target=Vector((3,2.7,.65));bpy.ops.object.camera_add(location=(3,-13,9));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.type="ORTHO";cam.data.ortho_scale=11.5;scene.camera=cam
bpy.ops.object.light_add(type="AREA",location=(2,-6,12));light=bpy.context.object;light.data.energy=1700;light.data.shape="DISK";light.data.size=8;light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
with open(os.path.join(SRC,"meadow-kit-manifest.json"),"w",encoding="utf-8") as f:json.dump({"pack":"eco-meadow-first-pass","units":"metres","status":"first-pass-review","assets":items,"notes":["Six reusable ecology transition models; collision remains authorable in course data."]},f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,"meadow-kit.blend"));bpy.ops.render.render(write_still=True)
print("MEADOW_KIT_RESULT "+json.dumps({"assets":items,"preview":scene.render.filepath},ensure_ascii=False))
