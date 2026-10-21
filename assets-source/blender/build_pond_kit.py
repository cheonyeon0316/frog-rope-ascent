"""Create a reusable low-poly pond ecosystem kit and GLB exports."""
import bpy, math, json, os, random
from mathutils import Vector

ROOT = r"C:\Codex\frog-ascent-windows-20261013\frog-ascent-windows-20261013\workspace\Last\browser\frog-rope-ascent"
OUT = os.path.join(ROOT, "public", "assets", "eco-pond")
SRC = os.path.join(ROOT, "assets-source", "blender")
os.makedirs(OUT, exist_ok=True)
os.makedirs(SRC, exist_ok=True)
random.seed(23)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

def mat(name, color, rough=.82):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    return m

M = {
    "soil": mat("Loam | warm umber", (.29,.20,.12)),
    "clay": mat("Loam | sunlit edge", (.43,.31,.18)),
    "stone": mat("River stone | moss slate", (.31,.39,.36)),
    "stone2": mat("River stone | pale face", (.48,.55,.48)),
    "water": mat("Water | quiet teal", (.08,.39,.40), .3),
    "leaf": mat("Leaf | deep green", (.23,.44,.16)),
    "leaf2": mat("Leaf | vein light", (.48,.64,.24)),
    "reed": mat("Reed | olive", (.34,.43,.15)),
    "root": mat("Root | chestnut", (.29,.17,.085)),
    "root2": mat("Root | sunlit bark", (.46,.30,.14)),
}

def mesh(name, vs, fs, mats, ids=None):
    me=bpy.data.meshes.new(name+"Mesh"); me.from_pydata(vs,[],fs); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
    for m in mats: me.materials.append(m)
    for i,p in enumerate(me.polygons):
        p.use_smooth=False
        if ids: p.material_index=ids[i%len(ids)]%len(mats)
    return ob

def curve(name, pts, radius, material):
    cu=bpy.data.curves.new(name+"Curve","CURVE"); cu.dimensions="3D"; cu.resolution_u=1
    cu.bevel_depth=radius; cu.bevel_resolution=1
    s=cu.splines.new("POLY"); s.points.add(len(pts)-1)
    for p,co in zip(s.points,pts): p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(ob); cu.materials.append(material)
    return ob

def ico(name, loc, scale, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc)
    ob=bpy.context.object; ob.name=name; rng=random.Random(seed)
    for v in ob.data.vertices:
        q=rng.uniform(.90,1.10); v.co.x*=scale[0]*q; v.co.y*=scale[1]*q; v.co.z*=scale[2]*rng.uniform(.95,1.05)
    for m in (M["stone"],M["stone2"]): ob.data.materials.append(m)
    for p in ob.data.polygons: p.material_index=(p.index*7+seed)%2; p.use_smooth=False
    return ob

assets=[]
def export_asset(asset_id, display, group, purpose):
    path=os.path.join(OUT,asset_id+".glb")
    bpy.ops.object.select_all(action="DESELECT")
    for ob in group: ob.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True)
    offset=len(assets)
    for ob in group:
        ob.location.x+=(offset%3)*4.2
        ob.location.y+=(offset//3)*4.2
    assets.append({"id":asset_id,"name":display,"file":"public/assets/eco-pond/"+asset_id+".glb","purpose":purpose,"objectCount":len(group)})

# 01: irregular loam rim and a shallow teal water inset
n=24; rings=[(.92,-.24),(1.0,.02),(1.28,.42),(1.62,-.30)]; vs=[]; fs=[]; ids=[]
for ri,(r,z0) in enumerate(rings):
    for i in range(n):
        a=-.12+(math.pi+.24)*i/(n-1); wob=1+.065*math.sin(3*a+.4)+.035*math.sin(7*a)
        vs.append((math.cos(a)*2.45*r*wob,math.sin(a)*1.9*r*wob-.42,z0+.1*math.sin(2*a+.6)+.045*math.sin(5*a)))
for ri in range(len(rings)-1):
    for i in range(n-1):
        a=ri*n+i; b=ri*n+i+1; c=(ri+1)*n+i+1; d=(ri+1)*n+i
        fs.append((a,b,c,d)); ids.append(1 if (i+ri)%5==0 else (0 if ri<2 else 2))
basin=mesh("Pond bank | sculpted loam rim",vs,fs,[M["soil"],M["clay"],M["stone"]],ids)
water_n=32; wv=[(-.18,-.48,-.11)]+[(-.18+math.cos(2*math.pi*i/water_n)*1.78,-.48+math.sin(2*math.pi*i/water_n)*1.24,-.11+.018*math.sin(3*i)) for i in range(water_n)]
water=mesh("Pond bank | open water pocket",wv,[(0,i+1,(i+1)%water_n+1) for i in range(water_n)],[M["water"]])
shore=[ico("Shore stone %02d"%i,(math.cos(a)*2.2,math.sin(a)*1.66-.42,-.12),(.25+.07*(i%2),.22,.25+.08*(i%3)),101+i) for i,a in enumerate([.2,.58,1.02,1.5,2.1,2.8,3.35,4.15,5.1])]
export_asset("mdl_env_pond_basin","열린 물가 흙둑",[basin,water]+shore,"완전히 닫히지 않은 반달형 자연 둑, 얕은 물주머니와 흩어진 자갈")

# 02: cupped broad lily leaf with raised center rib
def leaf(name,length,width,lift):
    na,nb=12,8; vs=[]; fs=[]; ids=[]
    for layer in (1,-1):
        base=len(vs)
        for i in range(na+1):
            t=i/na; env=max(.015,math.sin(math.pi*t)**.82)*(.68+.32*t)
            for j in range(nb+1):
                s=2*j/nb-1; z=lift*math.sin(math.pi*t)+(1-abs(s))*.12-abs(s)**1.7*.065
                vs.append(((t-.5)*length,s*width*env,z-(.04 if layer<0 else 0)))
        for i in range(na):
            for j in range(nb):
                a=base+i*(nb+1)+j; b=a+nb+1
                fs.append((a,b,b+1,a+1) if layer>0 else (a+1,b+1,b,a))
                ids.append(1 if j in (3,4) else 0)
    ob=mesh(name,vs,fs,[M["leaf"],M["leaf2"]],ids)
    rib=curve(name+" | central vein",[((t-.5)*length,0,lift*math.sin(math.pi*t)+.12) for t in [i/12 for i in range(13)]],.018,M["leaf2"])
    return [ob,rib]
export_asset("mdl_env_leaf_round","넓은 연잎 발판",leaf("Lily pad | cupped",2.25,.92,.18),"높은 중앙맥과 낮게 말린 가장자리가 있는 넓은 착지면")

# 03: 5 reed stems with sparse blades so the route remains visible
reed_group=[]
for i,(x,y,h) in enumerate([(-.35,0,1.55),(.18,.1,1.95),(.55,-.08,1.35),(-.7,-.06,1.2),(.02,-.32,1.7)]):
    bend=.12 if i%2 else -.10
    reed_group.append(curve("Reed stem %02d"%i,[(x,y,0),(x+bend*.4,y,h*.48),(x+bend,y+.03,h)],.036,M["reed"]))
    for side in (-1,1):
        z=h*(.25+.08*(i%3))
        reed_group.append(curve("Reed blade %02d %s"%(i,side),[(x,y,z),(x+side*.17,y,z+.25),(x+side*.27,y+.02,z+.52)],.022,M["leaf2"]))
    reed_group.append(ico("Reed seed head %02d"%i,(x+bend,y+.03,h+.07),(.085,.07,.21),70+i))
export_asset("mdl_env_reed","드문 갈대 군락",reed_group,"높이가 다른 다섯 줄기와 절제된 잎으로 경로 여백을 남김")

# 04: interwoven roots form a low bridge from water edge toward the bank
root_group=[
    curve("Root bridge | main arch",[(-1.8,.05,-.18),(-1.2,.02,.10),(-.5,0,.42),(.2,.03,.52),(.95,.04,.24),(1.75,0,.10)],.18,M["root"]),
    curve("Root bridge | crossing",[(-1.5,-.18,-.15),(-.8,-.22,.03),(-.15,-.2,.34),(.65,-.16,.39),(1.5,-.1,.1)],.095,M["root2"]),
    curve("Root bridge | trailing",[(-1.25,.18,-.2),(-.5,.32,-.05),(.25,.35,.12),(1.3,.26,-.04)],.085,M["root"]),
]
export_asset("mdl_env_root_bridge","드러난 뿌리 다리",root_group,"세 겹의 비대칭 뿌리가 연못에서 풀숲으로 이어짐")

# 05: three facets and scales, bundled as a reusable dressing cluster
stones=[
    ico("River stone | oval",(-.75,0,0),(.62,.45,.38),17),
    ico("River stone | flat",( .25,-.04,-.08),(.72,.56,.25),29),
    ico("River stone | angular",(1.18,.05,.08),(.44,.40,.50),41),
]
export_asset("mdl_env_stone_cluster","물가 자갈 세 변형",stones,"둥근·낮은·각진 세 실루엣으로 크기와 접촉감을 구분")

# 06: a small floating cluster distinct from the wide gameplay pad
lily_group=[]
for i,(loc,sc,ang) in enumerate([((-.38,0,.02),(.90,.62),-.18),((.4,.08,.1),(.70,.48),.5)]):
    parts=leaf("Lily cluster leaf %02d"%i,1.55*sc[0],.55*sc[1],.10)
    for ob in parts: ob.location=loc; ob.rotation_euler.z=ang
    lily_group.extend(parts)
lily_group.append(curve("Lily cluster | new shoot",[(0,0,-.12),(.03,.02,.12),(.26,.1,.34),(.46,.14,.30)],.03,M["reed"]))
export_asset("mdl_env_lily_cluster","어린 연잎 군락",lily_group,"크기가 다른 두 잎과 새잎이 겹친 작은 수면 군집")

scene=bpy.context.scene
scene.unit_settings.system="METRIC"
valid_engines=[item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine="BLENDER_EEVEE" if "BLENDER_EEVEE" in valid_engines else valid_engines[0]
scene.render.resolution_x=1440; scene.render.resolution_y=960; scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"; scene.render.filepath=os.path.join(SRC,"pond-kit-preview.png")
scene.view_settings.view_transform="AgX"
scene.world.use_nodes=True
world_bg=next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND")
world_bg.inputs["Color"].default_value=(.78,.84,.75,1)
world_bg.inputs["Strength"].default_value=.55
target=Vector((4.2,2.1,.0))
bpy.ops.object.camera_add(location=(4.2,-12,9)); cam=bpy.context.object; cam.name="Review camera"
cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler(); cam.data.type="ORTHO"; cam.data.ortho_scale=15.5; scene.camera=cam
bpy.ops.object.light_add(type="AREA",location=(1,-5,11)); key=bpy.context.object; key.name="Soft key"; key.data.energy=1350; key.data.shape="DISK"; key.data.size=8
key.rotation_euler=(target-key.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.light_add(type="AREA",location=(11,8,7)); fill=bpy.context.object; fill.name="Cool fill"; fill.data.energy=650; fill.data.color=(.75,.88,1); fill.data.size=7
fill.rotation_euler=(target-fill.location).to_track_quat("-Z","Y").to_euler()

manifest={"pack":"eco-pond-first-pass","units":"metres","status":"first-pass-review","assets":assets,"notes":["Each GLB is a reusable independent asset.","Gameplay collision remains in course data until the visual surfaces are playtested."]}
with open(os.path.join(SRC,"pond-kit-manifest.json"),"w",encoding="utf-8") as f: json.dump(manifest,f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,"pond-kit.blend"))
bpy.ops.render.render(write_still=True)
print("POND_KIT_RESULT "+json.dumps({"assets":assets,"preview":scene.render.filepath,"source":os.path.join(SRC,"pond-kit.blend")},ensure_ascii=False))
