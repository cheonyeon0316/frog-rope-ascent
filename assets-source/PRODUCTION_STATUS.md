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

## Runtime integration and remaining work

All 26 GLBs import into Blender 5.2 with non-empty mesh geometry and non-zero bounds. The live Three.js scene now loads all 26 through `GLTFLoader`: the frog hero replaces the procedural character and uses its `Frog_Idle`, `Frog_Jump`, and `Frog_Dash` clips; all eight food models replace their procedural food visuals across 83 anchors; and 18 hand-placed ecology instances dress the pond, meadow, flower, tree, mountain, cloud, and summit areas. The dense procedural grass is disabled on `ecosystem-main-v3`, leaving four sparse GLB grass clumps. `pnpm test:assets` verifies the loaded model count, rendered instance counts, no browser errors, and the jump animation.

The models remain first-pass art. Gameplay collision and traversal still use course data and the authored procedural platform meshes; the imported ecology models are visual dressing, not new colliders. The single-file `frog-ascent.html` build embeds the GLBs so it works when opened directly. Next production work is art-direction polish, closer visual/collision alignment where a model appears to be a platform, and broader human playtesting.

`blender/validate_asset_glbs.py` can be rerun after generating more assets to check the exported GLBs.
