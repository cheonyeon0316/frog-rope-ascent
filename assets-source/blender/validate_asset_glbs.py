"""Import every generated environment/food GLB and check it has usable geometry."""
import bpy
import json
import sys
from pathlib import Path

ASSET_ROOT = Path(__file__).resolve().parents[2] / "public" / "assets"
folders = ["eco-pond", "eco-food", "eco-meadow", "eco-upper", "character"]
results = []
errors = []

for folder in folders:
    directory = ASSET_ROOT / folder
    for path in sorted(directory.glob("*.glb")):
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        try:
            bpy.ops.import_scene.gltf(filepath=str(path))
            meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
            if not meshes:
                raise RuntimeError("no mesh geometry found")
            vertex_count = sum(len(o.data.vertices) for o in meshes)
            dimensions = [max(o.dimensions[i] for o in meshes) for i in range(3)]
            if vertex_count <= 0 or any(d <= 0.0001 for d in dimensions):
                raise RuntimeError("mesh geometry has zero bounds")
            armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
            if folder == "character" and not armatures:
                raise RuntimeError("character has no exported armature")
            action_names = sorted(a.name for a in bpy.data.actions)
            if folder == "character" and not {"Frog_Idle", "Frog_Jump", "Frog_Dash"}.issubset(set(action_names)):
                raise RuntimeError("character is missing one or more expected animation clips: " + str(action_names))
            results.append({"file": f"{folder}/{path.name}", "meshes": len(meshes),
                            "vertices": vertex_count, "maxMeshDimensions": dimensions,
                            "objects": len(bpy.context.scene.objects),
                            "bones": len(armatures[0].data.bones) if armatures else 0,
                            "animations": action_names if folder == "character" else []})
        except Exception as error:
            errors.append({"file": f"{folder}/{path.name}", "error": str(error)})

report = {"validated": len(results), "errors": errors, "assets": results}
print("ASSET_GLB_VALIDATION " + json.dumps(report))
if errors or not results:
    sys.exit(1)
