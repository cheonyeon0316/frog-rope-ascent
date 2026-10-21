# Asset production status

## Effort estimate

The current working estimate for the full planned asset scope is **about 490–1,000 artist-hours**, or roughly **3–6 months for one full-time artist**. This includes models, materials and textures, rigging and animation, audio, UI, effects, implementation, and QA. It is a broad range because the original **205-item / 240-deliverable catalog** was drafted for an older biome layout; it needs reconciliation against the current eight-course ecosystem before the remaining workload can be estimated more tightly.

The estimate is for finished, integrated assets. The models below are first-pass review assets; they still need art-direction approval, production polish, collision and LOD work where needed, and placement/playtesting. No hours have been subtracted from the total yet.

## Created in this pass

**26 reusable GLB models** with Blender source files, generation scripts, manifests, and preview renders:

- Pond: 6 models — open pond bank, round leaf, reeds, root bridge, stone cluster, young lily cluster.
- Current food targets: 8 models — fruit fly, fly, beetle, pollen, bee, moth, dew, stardust.
- Meadow and flower transition: 7 models — 3 sparse grass silhouettes, mossy boulder cluster, mushroom cluster, large wildflower, wildflower patch.
- Upper biomes: 4 models — old tree branch, cracked mountain ridge, cloud shelf, five-point starway platform.
- Player: 1 model — low-poly frog hero with a 7-bone rigid-part starter rig and `Frog_Idle`, `Frog_Jump`, `Frog_Dash` clips.

Sources and previews are in [`blender/`](blender/). Runtime GLBs are in `public/assets/eco-pond/`, `public/assets/eco-food/`, `public/assets/eco-meadow/`, `public/assets/eco-upper/`, and `public/assets/character/`.

## Validation and remaining work

All 26 GLBs import into Blender 5.2 with non-empty mesh geometry and non-zero bounds; the frog character exports its 7-bone armature and three animation clips. `pnpm build` passes. The GLBs are not wired into the live Three.js renderer yet, and gameplay collision still comes from course data. The next production work is to refine the frog look and animation timing, finish distinct landmarks and material sets for every biome, add audio/UI/VFX, then integrate and playtest the authored models and collision surfaces.

`blender/validate_asset_glbs.py` can be rerun after generating more assets to check the exported GLBs.
