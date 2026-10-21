"""Build four landmark meshes for the tree, mountain, cloud, and star courses."""
import bpy, json, math, os
from mathutils import Vector

ROOT=r"C:\Codex\frog-ascent-windows-20261013\frog-ascent-windows-20261013\workspace\Last\browser\frog-rope-ascent"
OUT=os.path.join(ROOT,"public","assets","eco-upper"); SRC=os.path.join(ROOT,"assets-source","blender")
os.makedirs(OUT,exist_ok=True)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)
def mat(n,c,r=.7,m=0,e=0):
    a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;p=next(x for x in a.node_tree.nodes if x.type=="BSDF_PRINCIPLED");p.inputs["Base Color"].default_value=(*c,1);p.inputs["Roughness"].default_value=r;p.inputs["Metallic"].default_value=m
    if e and "Emission Color" in p.inputs:p.inputs["Emission Color"].default_value=(*c,1);p.inputs["Emission Strength"].default_value=e
    return a
M={"bark":mat("Upper | old bark",(.27,.15,.08)),"barklight":mat("Upper | bark ridges",(.43,.27,.13)),"leaf":mat("Upper | canopy green",(.16,.34,.12)),"leaflight":mat("Upper | sunlit leaves",(.40,.53,.17)),"rock":mat("Upper | mountain slate",(.34,.40,.44)),"rocklight":mat("Upper | warm granite",(.55,.54,.46)),"snow":mat("Upper | pale lichen",(.77,.84,.78)),"cloud":mat("Upper | cloud white",(.86,.93,.98)),"cloudshade":mat("Upper | cloud shade",(.60,.76,.87)),"gold":mat("Upper | star gold",(.98,.70,.24),.32,.18,.25),"glow":mat("Upper | star glow",(1,.83,.42),.3,.1,.32)}
items=[]
def ico(n,l,s,ma,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=l);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(ma);return o
def curve(n,pts,r,ma):
    c=bpy.data.curves.new(n+"Curve","CURVE");c.dimensions="3D";c.resolution_u=1;c.bevel_depth=r;c.bevel_resolution=2;sp=c.splines.new("POLY");sp.points.add(len(pts)-1)
    for p,v in zip(sp.points,pts):p.co=(*v,1)
    o=bpy.data.objects.new(n,c);bpy.context.collection.objects.link(o);c.materials.append(ma);return o
def finish(key,label,g,desc):
    a=bpy.data.objects.new("AnchorSocket",None);bpy.context.collection.objects.link(a);a.empty_display_type="SPHERE";a.empty_display_size=.1;g.append(a)
    bpy.ops.object.select_all(action="DESELECT")
    for o in g:o.select_set(True)
    bpy.context.view_layer.objects.active=g[0];path=os.path.join(OUT,key+".glb");bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True)
    items.append({"id":key,"name":label,"file":"public/assets/eco-upper/"+key+".glb","purpose":desc,"objectCount":len(g)})

# Tree branch landing with a visible tapered trunk, forks, knots, and broken bark plates.
g=[curve("Main branch",[(0,0,0),(.25,0,.18),(.72,0,.28),(1.45,0,.36),(2.35,.02,.43)],.30,M["bark"]),curve("Fork",[(.88,0,.28),(1.12,.04,.55),(1.42,.08,.78)],.16,M["bark"]),curve("Root spur",[(.10,0,.10),(-.34,-.05,.03),(-.82,-.12,.02)],.17,M["barklight"])]
for i,(x,z) in enumerate([(.25,.46),(.94,.54),(1.55,.69),(2.08,.76)]):
    g.append(ico("Bark ridge",(x,-.25,z),(.31,.08,.11),M["barklight" if i%2 else "bark"],1))
for i,(x,y,z,s) in enumerate([(.45,.32,.52,.43),(1.23,.38,.72,.55),(1.92,.35,.82,.48),(.92,-.38,.67,.38),(1.63,-.35,.82,.41)]):
    g.append(ico("Canopy leaf cluster",(x,y,z),(s,s*.72,s*.45),M["leaflight" if i%2 else "leaf"],2))
finish("mdl_env_old_tree_branch","오래된 나무 가지 발판",g,"굵은 가지와 갈라진 뿌리, 드문 잎 덩이가 이어지는 착지 발판")

# Mountain ridge: fractured rock ledges with a readable narrow route and pale lichen caps.
g=[]
for i,(loc,sc,ma) in enumerate([((-.60,0,.25),(.70,.72,.92),M["rock"]),((.18,.02,.48),(.64,.60,1.25),M["rocklight"]),((.91,.08,.31),(.73,.68,.82),M["rock"]),((1.42,.15,.08),(.47,.55,.48),M["rocklight"]) ]):
    g.append(ico("Fractured ridge stone",loc,sc,ma,2))
for i,(x,y,z,s) in enumerate([(-.4,-.1,.93,.38),(.2,-.1,1.60,.25),(.92,-.08,1.00,.33),(1.42,.02,.52,.20)]):
    g.append(ico("Lichen cap",(x,y,z),(s,s*.8,.09),M["snow"],1))
g.append(curve("Crack seam",[(-.22,-.48,.54),(-.05,-.53,.40),(.10,-.54,.18)],.018,M["rocklight"]))
finish("mdl_env_mountain_ridge","금 간 암릉 발판",g,"서로 이어진 단단한 암석과 옅은 이끼 띠가 만든 불규칙 능선")

# Cloud stepping shelf, pale and soft in silhouette but grounded by shaded lower lobes.
g=[]
for loc,sc,ma in [((0,0,.0),(1.0,.72,.34),M["cloudshade"]),((-.65,0,.15),(.63,.58,.42),M["cloud"]),((-.18,.12,.32),(.72,.62,.48),M["cloud"]),((.52,.02,.18),(.69,.55,.40),M["cloud"]),((.98,.05,.04),(.42,.42,.30),M["cloudshade"]),((.10,-.22,.13),(.60,.48,.34),M["cloud"])]:
    g.append(ico("Cloud puff",loc,sc,ma,2))
finish("mdl_env_cloud_shelf","구름 발판 군락",g,"겹쳐진 부드러운 구름 덩이가 넓고 안정된 착지 면을 형성")

# Five-point stepping star with a shallow rim and a small cluster of orbiting lights.
verts=[];faces=[]
for z in (.10,-.10):
    for i in range(10):
        a=math.pi/2+i*math.pi/5;r=1.32 if i%2==0 else .68;verts.append((math.cos(a)*r,math.sin(a)*r,z))
verts.extend([(0,0,.10),(0,0,-.10)])
for i in range(10):faces.append((20,i,(i+1)%10));faces.append((21,10+(i+1)%10,10+i));faces.append((i,(i+1)%10,10+(i+1)%10,10+i))
me=bpy.data.meshes.new("Star platform mesh");me.from_pydata(verts,[],faces);me.materials.append(M["gold"]);me.materials.append(M["glow"]);me.update();star=bpy.data.objects.new("Five point star platform",me);bpy.context.collection.objects.link(star);g=[star]
for p in me.polygons:
    if p.index%3==0:p.material_index=1
for i,a in enumerate([.35,2.5,4.5]):g.append(ico("Orbiting star mote",(math.cos(a)*1.57,math.sin(a)*1.57,.20),(.11,.11,.11),M["glow"],1))
finish("mdl_env_starway_platform","별길 오각 발판",g,"두꺼운 오각별 발판과 주변을 도는 작은 빛 알갱이")

# Preview using exported GLBs to review the shipping representation.
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
for i,item in enumerate(items):
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,os.path.basename(item["file"])))
    dx=(i%2)*3.5;dy=(i//2)*4.5
    for o in bpy.context.selected_objects:o.location.x+=dx;o.location.y+=dy
scene=bpy.context.scene;scene.render.engine="BLENDER_EEVEE";scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format="PNG";scene.render.filepath=os.path.join(SRC,"upper-kit-preview.png");scene.view_settings.view_transform="AgX";scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND");bg.inputs["Color"].default_value=(.72,.78,.84,1);bg.inputs["Strength"].default_value=.75
target=Vector((1.75,2.25,.8));bpy.ops.object.camera_add(location=(1.75,-12,10));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.type="ORTHO";cam.data.ortho_scale=10.0;scene.camera=cam
bpy.ops.object.light_add(type="AREA",location=(0,-5,11));light=bpy.context.object;light.data.energy=1800;light.data.shape="DISK";light.data.size=8;light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
with open(os.path.join(SRC,"upper-kit-manifest.json"),"w",encoding="utf-8") as f:json.dump({"pack":"eco-upper-first-pass","units":"metres","status":"first-pass-review","assets":items,"notes":["Tree, mountain, cloud and star landmark assets; collision and gameplay placement remain course data."]},f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,"upper-kit.blend"));bpy.ops.render.render(write_still=True)
print("UPPER_KIT_RESULT "+json.dumps({"assets":items,"preview":scene.render.filepath},ensure_ascii=False))
