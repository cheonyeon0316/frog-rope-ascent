import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { type Course, type Anchor, type Platform, type WaterVolume, type Vec, clamp, COLORS } from '../game/types';
import { FLY_TIMING, type Simulation } from '../game/simulation';
import { landscapeMesh, starMesh, cloudClumps, platformMesh, bladeHeight } from '../game/environment';
import { WORLD_SCALE } from '../game/ecosystem-v5';

const V = (p: Vec) => new THREE.Vector3(p.x, p.y, p.z);
const material = (color: THREE.ColorRepresentation, roughness = .85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
type LoadedModel = Awaited<ReturnType<GLTFLoader['loadAsync']>>;
type SlimeDrop = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number };

const MODEL_FILES: Record<string, string> = {
  'pond-basin': 'assets/eco-pond/mdl_env_pond_basin.glb', 'pond-leaf': 'assets/eco-pond/mdl_env_leaf_round.glb',
  'pond-reed': 'assets/eco-pond/mdl_env_reed.glb', 'pond-root-bridge': 'assets/eco-pond/mdl_env_root_bridge.glb',
  'pond-stones': 'assets/eco-pond/mdl_env_stone_cluster.glb', 'pond-lilies': 'assets/eco-pond/mdl_env_lily_cluster.glb',
  'meadow-grass-a': 'assets/eco-meadow/mdl_env_meadow_grass_a.glb', 'meadow-grass-b': 'assets/eco-meadow/mdl_env_meadow_grass_b.glb',
  'meadow-grass-c': 'assets/eco-meadow/mdl_env_meadow_grass_c.glb', 'meadow-boulders': 'assets/eco-meadow/mdl_env_moss_boulder_cluster.glb',
  'meadow-mushrooms': 'assets/eco-meadow/mdl_env_mushroom_cluster.glb', 'meadow-flower': 'assets/eco-meadow/mdl_env_wildflower_landmark.glb',
  'meadow-flower-patch': 'assets/eco-meadow/mdl_env_wildflower_patch.glb',
  'upper-branch': 'assets/eco-upper/mdl_env_old_tree_branch.glb', 'upper-ridge': 'assets/eco-upper/mdl_env_mountain_ridge.glb',
  'upper-clouds': 'assets/eco-upper/mdl_env_cloud_shelf.glb', 'upper-star': 'assets/eco-upper/mdl_env_starway_platform.glb',
};

// Each tuft is a small, low-poly plant made from several individually bent leaves.
// Seven silhouettes share one instanced draw per variant across each patch.
const makeGrassShapes = (): THREE.BufferGeometry[] => {
  const profiles = [
    { leaves: 4, height: .42, width: .105, spread: .14, bend: .1 },
    { leaves: 5, height: .34, width: .135, spread: .2, bend: .045 },
    { leaves: 4, height: .49, width: .085, spread: .16, bend: .16 },
    { leaves: 3, height: .39, width: .11, spread: .23, bend: -.095 },
    { leaves: 6, height: .31, width: .12, spread: .21, bend: .07 },
    { leaves: 4, height: .46, width: .115, spread: .13, bend: -.13 },
    { leaves: 5, height: .4, width: .09, spread: .25, bend: .12 },
  ];
  return profiles.map((profile, variant) => {
    const vertices: number[] = [], indices: number[] = [];
    for (let blade = 0; blade < profile.leaves; blade++) {
      const angle = blade / profile.leaves * Math.PI * 2 + variant * .31;
      const radialX = Math.cos(angle), radialZ = Math.sin(angle);
      const sideX = -radialZ, sideZ = radialX;
      const height = profile.height * (.82 + ((blade * 7 + variant * 3) % 5) * .055);
      const width = profile.width * (.82 + (blade % 3) * .16);
      const baseX = radialX * profile.spread * .2, baseZ = radialZ * profile.spread * .2;
      const start = vertices.length / 3, steps = 5;
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, rise = height * t;
        const bend = profile.bend * t * t;
        const cx = baseX + radialX * profile.spread * t + sideX * bend;
        const cz = baseZ + radialZ * profile.spread * t + sideZ * bend;
        const taper = Math.sin(Math.PI * (.04 + t * .9)) ** .7;
        const w = width * taper * (1 - t * .72);
        vertices.push(cx - sideX * w, rise, cz - sideZ * w, cx + sideX * w, rise, cz + sideZ * w);
        if (step < steps) {
          const a = start + step * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  });
};

const FROG_GRASS_COLORS = ['#72a84a', '#8cb953', '#abc76b', '#5f9345', '#b1bd65', '#7eaa5d', '#96bb72'];
type FrogLimb = { root: THREE.Group; lower: THREE.Group; foot: THREE.Group; front: boolean; side: number };

class Tongue {
  readonly mesh: THREE.Mesh;
  private segments = 20;
  private sides = 6;
  private positions: THREE.BufferAttribute;
  private normals: THREE.BufferAttribute;
  constructor(private readonly tongueMaterial: THREE.Material = material('#ec8198', .4),
    private readonly baseRadius = .06, private readonly taperRadius = .017) {
    const geo = new THREE.BufferGeometry();
    const vertices = (this.segments + 1) * this.sides;
    this.positions = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    this.normals = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    geo.setAttribute('position', this.positions); geo.setAttribute('normal', this.normals);
    const index: number[] = [];
    for (let i = 0; i < this.segments; i++) for (let j = 0; j < this.sides; j++) {
      const a = i * this.sides + j, b = i * this.sides + (j + 1) % this.sides;
      index.push(a, b, a + this.sides, b, b + this.sides, a + this.sides);
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, tongueMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  update(a: THREE.Vector3, b: THREE.Vector3, slack: number, scale = 1): void {
    this.mesh.visible = true;
    const direction = new THREE.Vector3().subVectors(b, a).normalize();
    const right = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > .96 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * slack;
      const radius = (this.baseRadius - this.taperRadius * t) * scale;
      for (let j = 0; j < this.sides; j++) {
        const angle = j / this.sides * Math.PI * 2;
        const normal = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
        this.positions.setXYZ(i * this.sides + j, p.x + normal.x * radius, p.y + normal.y * radius, p.z + normal.z * radius);
        this.normals.setXYZ(i * this.sides + j, normal.x, normal.y, normal.z);
      }
    }
    this.positions.needsUpdate = true; this.normals.needsUpdate = true;
  }
}

export class Garden {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, .1, 330);
  readonly renderer: THREE.WebGLRenderer;
  readonly frog = new THREE.Group();
  readonly tongue = new Tongue();
  private slimeTongue!: Tongue;
  private slimeDrops: SlimeDrop[] = [];
  private slimeDropCursor = 0;
  private nextSlimeDrop = 0;
  private readonly modelLoader = new GLTFLoader();
  private readonly modelAssets = new Map<string, LoadedModel>();
  private readonly modelAssetsReady: Promise<void>;
  private modelLoadVersion = 0;
  private world = new THREE.Group();
  private frogBody = new THREE.Group();
  private frogLegs: FrogLimb[] = [];
  private grassShapes = makeGrassShapes();
  private grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .92, side: THREE.DoubleSide, flatShading: true });
  private pupils: THREE.Mesh[] = [];
  private frogMouth!: THREE.Mesh;
  private frogMouthLine!: THREE.Mesh;
  private frogJaw!: THREE.Mesh;
  private frogBelly!: THREE.Mesh;
  private cheeks: THREE.Mesh[] = [];
  private swingBurst = new THREE.Group();
  private waterSurfaces: { volume: WaterVolume; surface: THREE.Mesh; bubbles: THREE.Mesh[] }[] = [];
  private flies = new Map<string, THREE.Group>();
  private targetRing = new THREE.Mesh(new THREE.TorusGeometry(.58, .035, 6, 28), new THREE.MeshBasicMaterial({ color: '#ecf5a2', depthTest: false }));
  private attachedRing = new THREE.Mesh(new THREE.TorusGeometry(.53, .017, 6, 28), new THREE.MeshBasicMaterial({ color: '#fff3ce', depthTest: false }));
  private sun: THREE.DirectionalLight;
  private landing = -1;
  private squash = 0;
  private blink = 0;
  private hopPhase = 0;
  private lastAnimationTime = 0;
  private cameraBank = 0;
  private cameraFov = 60;
  private renderedYaw = .52;
  yaw = .52;
  pitch = .36;
  private distance = 8;
  private focus = new THREE.Vector3();
  private sceneReady = false;
  private raycaster = new THREE.Raycaster();
  private missUntil = 0;
  private lastTongueEnd = new THREE.Vector3();
  private wallRay = new THREE.Raycaster();
  private collisionMeshes: THREE.Object3D[] = [];
  private frogOcclusionElapsed = 0;
  private occlusionHits: THREE.Intersection[] = [];
  private requestedLowQuality = false;
  private adaptiveLowQuality = false;
  private slowFrameSeconds = 0;
  private platformRoots = new Map<string, THREE.Group>();
  private pondDecoration: THREE.Object3D[] = [];
  private frogGhostMaterials = new Map<THREE.Mesh, { original: THREE.Material | THREE.Material[]; ghost: THREE.Material | THREE.Material[]; renderOrder: number }>();
  private frogOccluded = false;
  private ownedMaterials = new Set<THREE.Material>();
  private biomeColors: string[] = [];
  private skyColors: THREE.Color[] = [];
  private skyZenithColors: THREE.Color[] = [];
  private skyDomeMaterial!: THREE.ShaderMaterial;
  private stars: THREE.Points | null = null;
  private sunDisc!: THREE.Sprite;
  private mats = {
    frog: material('#719b58', .72), belly: material('#ded8b0', .82), dark: material('#354235', .52), white: material('#fff9e7', .28),
    toe: material('#c6b35f', .68), iris: material('#a9965d', .48),
    bark: material('#755848'), leaf: material('#6c9651'), leafTop: material('#a0bc6b'), pot: material('#bc805b'),
    metal: material('#61938a', .5), water: material('#8bbbc0', .35), fly: material('#5e6557'), pink: material('#e99da6'),
    swing: new THREE.MeshBasicMaterial({ color: '#fff6d7', transparent: true, opacity: .6, depthWrite: false }),
    slime: new THREE.MeshPhysicalMaterial({ color: '#a4d987', roughness: .2, metalness: 0, transparent: true, opacity: .72, depthWrite: false, clearcoat: .9, clearcoatRoughness: .12 }),
  };

  get movementYaw() { return this.renderedYaw; }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.scene.background = new THREE.Color('#dce4d0');
    this.scene.fog = new THREE.FogExp2('#dce4d0', .008);
    this.skyDomeMaterial = new THREE.ShaderMaterial({
      uniforms: { horizon: { value: new THREE.Color('#dce8ce') }, zenith: { value: new THREE.Color('#a9cee5') } },
      vertexShader: 'varying vec3 vDirection; void main(){ vec4 worldPosition=modelMatrix*vec4(position,1.0); vDirection=normalize(worldPosition.xyz-cameraPosition); gl_Position=projectionMatrix*viewMatrix*worldPosition; }',
      fragmentShader: 'uniform vec3 horizon; uniform vec3 zenith; varying vec3 vDirection; void main(){ vec3 d=normalize(vDirection); float h=smoothstep(-0.28,0.72,d.y); float haze=pow(1.0-abs(d.y-0.08),5.0); float az=atan(d.z,d.x); float ridge=sin(az*4.7+0.7)*0.025+sin(az*9.3+1.8)*0.016+sin(az*17.1-0.6)*0.009; float farLine=0.205+ridge*1.25; float nearLine=0.125+ridge; vec3 color=mix(horizon,zenith,h); color=mix(color,vec3(0.55,0.65,0.69),1.0-smoothstep(farLine-0.006,farLine+0.006,d.y)); color=mix(color,vec3(0.45,0.57,0.43),1.0-smoothstep(nearLine-0.005,nearLine+0.005,d.y)); float cloudWave=sin(az*11.0+sin(az*3.0)*1.7)+sin(az*23.0+1.4)*0.32; float cloudBand=smoothstep(0.34,0.62,cloudWave)*smoothstep(0.15,0.27,d.y)*(1.0-smoothstep(0.52,0.7,d.y)); color=mix(color,vec3(1.0,0.87,0.73),cloudBand*0.25); color=mix(color,vec3(1.0,0.83,0.66),haze*0.06); gl_FragColor=vec4(color,1.0); }',
      side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 40), this.skyDomeMaterial);
    skyDome.name = 'ecosystem-sky-gradient'; skyDome.frustumCulled = false; skyDome.renderOrder = -1000; this.scene.add(skyDome);
    this.scene.add(new THREE.HemisphereLight('#fff2d7', '#546f51', 1.45));
    const fill = new THREE.DirectionalLight('#c8e8f0', .72); fill.position.set(-18, 12, -20); this.scene.add(fill);
    this.sun = new THREE.DirectionalLight('#ffe1ad', 3.2);
    this.sun.intensity = 2.55;
    this.sun.position.set(20, 28, 16); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -20; this.sun.shadow.camera.right = 20;
    this.sun.shadow.camera.top = 20; this.sun.shadow.camera.bottom = -20;
    this.sun.shadow.camera.near = .5; this.sun.shadow.camera.far = 90;
    this.sun.shadow.normalBias = .04;
    this.scene.add(this.sun, this.sun.target, this.world);
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext('2d')!;
    const glow = glowContext.createRadialGradient(64, 64, 3, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255,250,220,1)'); glow.addColorStop(.18, 'rgba(255,235,175,.95)');
    glow.addColorStop(.46, 'rgba(255,205,135,.38)'); glow.addColorStop(1, 'rgba(255,196,130,0)');
    glowContext.fillStyle = glow; glowContext.fillRect(0, 0, 128, 128);
    const sunTexture = new THREE.CanvasTexture(glowCanvas); sunTexture.colorSpace = THREE.SRGBColorSpace;
    const sunMaterial = new THREE.SpriteMaterial({ map: sunTexture, color: '#fff6dd', transparent: true,
      depthWrite: false, depthTest: false, toneMapped: false, opacity: .9 });
    this.sunDisc = new THREE.Sprite(sunMaterial); this.sunDisc.name = 'low-poly-garden-sun';
    this.sunDisc.scale.set(8, 8, 1); this.sunDisc.renderOrder = -900; this.scene.add(this.sunDisc);
    this.slimeTongue = new Tongue(this.mats.slime, .024, .009);
    this.makeFrog(); this.frog.scale.setScalar(.64); this.prepareFrogGhostMaterials(); this.scene.add(this.frog, this.tongue.mesh, this.slimeTongue.mesh, this.targetRing, this.attachedRing);
    const slimeGeometry = new THREE.SphereGeometry(1, 8, 6);
    this.slimeDrops = Array.from({ length: 9 }, () => {
      const drop = this.mesh(slimeGeometry, this.mats.slime, this.scene);
      drop.visible = false; drop.castShadow = false; drop.receiveShadow = false;
      return { mesh: drop, velocity: new THREE.Vector3(), life: 0, maxLife: .72 };
    });
    for (let i = 0; i < 7; i++) this.mesh(new THREE.ConeGeometry(.06, .22, 4), this.mats.swing, this.swingBurst);
    this.swingBurst.visible = false; this.scene.add(this.swingBurst);
    this.targetRing.renderOrder = 3; this.attachedRing.renderOrder = 3;
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.modelAssetsReady = this.preloadModelAssets();
  }

  private async preloadModelAssets(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    let embeddedAssets: Record<string, string> = {};
    const embeddedScript = document.querySelector<HTMLScriptElement>('#game-model-assets');
    if (embeddedScript?.textContent) {
      try { embeddedAssets = JSON.parse(embeddedScript.textContent) as Record<string, string>; }
      catch (error) { console.error('Could not read embedded game models.', error); }
    }
    await Promise.all(Object.entries(MODEL_FILES).map(async ([id, path]) => {
      try {
        let gltf: LoadedModel;
        const embedded = embeddedAssets[path];
        if (embedded) {
          const binary = atob(embedded), bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          gltf = await this.modelLoader.parseAsync(bytes.buffer, '');
        } else gltf = await this.modelLoader.loadAsync(`${base}${path}`);
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        this.modelAssets.set(id, gltf);
      } catch (error) {
        console.error(`Failed to load game model ${id} (${path})`, error);
      }
    }));
    this.canvas.dataset.assetModelsLoaded = String(this.modelAssets.size);
    this.canvas.dataset.assetModelsExpected = String(Object.keys(MODEL_FILES).length);
  }

  private mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, position?: THREE.Vector3): THREE.Mesh {
    if (!(Object.values(this.mats) as THREE.Material[]).includes(mat)) this.ownedMaterials.add(mat);
    const m = new THREE.Mesh(geometry, mat); m.castShadow = true; m.receiveShadow = true;
    if (position) m.position.copy(position); parent.add(m); return m;
  }

  private makeFrog(): void {
    this.frog.add(this.frogBody);
    const body = this.mesh(new THREE.IcosahedronGeometry(.46, 2), this.mats.frog, this.frogBody, new THREE.Vector3(0, -.015, -.12));
    body.scale.set(1.04, .76, 1.38);
    const head = this.mesh(new THREE.IcosahedronGeometry(.36, 1), this.mats.frog, this.frogBody, new THREE.Vector3(0, .085, .27));
    head.scale.set(1.18, .8, 1.12);
    const snout = this.mesh(new THREE.IcosahedronGeometry(.26, 1), this.mats.frog, this.frogBody, new THREE.Vector3(0, .015, .55));
    snout.scale.set(1.32, .72, 1.35);
    const belly = this.mesh(new THREE.IcosahedronGeometry(.31, 1), this.mats.belly, this.frogBody, new THREE.Vector3(0, -.19, .36));
    belly.scale.set(1.14, .9, 1.15);
    this.frogBelly = belly;
    for (const side of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(side * .265, .265, .35); eye.rotation.y = side * .1; this.frogBody.add(eye);
      const socket = this.mesh(new THREE.IcosahedronGeometry(.145, 1), this.mats.frog, eye);
      socket.scale.set(1.08, 1.04, .9);
      this.mesh(new THREE.SphereGeometry(.098, 12, 9), this.mats.iris, eye, new THREE.Vector3(0, .005, .09));
      const irisRing = this.mesh(new THREE.TorusGeometry(.09, .009, 5, 20), this.mats.dark, eye, new THREE.Vector3(0, .005, .105));
      irisRing.renderOrder = 2;
      const pupil = this.mesh(new THREE.SphereGeometry(.062, 10, 8), this.mats.dark, eye, new THREE.Vector3(.012, .008, .18));
      pupil.scale.set(.92, 1.06, .48); this.pupils.push(pupil);
      this.mesh(new THREE.SphereGeometry(.016, 6, 5), this.mats.white, eye, new THREE.Vector3(-.012, .03, .22));
      for (const front of [true, false]) {
        const root = new THREE.Group(); root.position.set(side * (front ? .28 : .3), front ? -.03 : -.12, front ? .34 : -.27); this.frogBody.add(root);
        const upperLength = front ? .32 : .4, lowerLength = front ? .29 : .36;
        if (!front) {
          const thigh = this.mesh(new THREE.IcosahedronGeometry(.23, 1), this.mats.frog, root,
            new THREE.Vector3(side * -.055, -.105, -.025));
          thigh.scale.set(.9, 1.25, 1.38);
        }
        const upper = this.mesh(new THREE.CapsuleGeometry(front ? .064 : .095, upperLength, 3, 7), this.mats.frog, root,
          new THREE.Vector3(side * (front ? .035 : .11), -upperLength * .48, front ? .035 : -.025));
        upper.rotation.z = side * (front ? -.22 : -.5);
        const lower = new THREE.Group(); lower.position.set(side * (front ? .055 : .15), -upperLength * .9, front ? .05 : -.08); root.add(lower);
        this.mesh(new THREE.CapsuleGeometry(front ? .05 : .065, lowerLength, 3, 6), this.mats.frog, lower,
          new THREE.Vector3(side * (front ? .015 : -.035), -lowerLength * .43, front ? .045 : -.035));
        const foot = new THREE.Group(); foot.position.set(0, -lowerLength * .86, front ? .1 : -.015); lower.add(foot);
        const palm = this.mesh(new THREE.SphereGeometry(front ? .09 : .12, 9, 6), this.mats.frog, foot,
          new THREE.Vector3(side * (front ? .035 : -.03), 0, .045));
        palm.scale.set(front ? 1.15 : 1.5, .34, 1.35);
        for (let toe = 0; toe < 3; toe++) {
          const digit = this.mesh(new THREE.CapsuleGeometry(.018, front ? .09 : .14, 2, 5), this.mats.frog, foot,
            new THREE.Vector3(side * (front ? .035 : -.03) + (toe - 1) * .065, -.006, .14 + Math.abs(toe - 1) * -.012));
          digit.rotation.x = Math.PI / 2 - .12;
          digit.rotation.y = (toe - 1) * .18;
          const tip = this.mesh(new THREE.SphereGeometry(.027, 7, 5), this.mats.toe, digit,
            new THREE.Vector3(0, 0, front ? .066 : .09));
          tip.scale.set(1.3, 1.1, .75);
        }
        this.frogLegs.push({ root, lower, foot, front, side });
      }
    }
    this.frogMouth = this.mesh(new THREE.SphereGeometry(.13, 12, 8), this.mats.dark, this.frogBody, new THREE.Vector3(0, -.075, .72));
    this.frogMouth.scale.set(1.35, .02, .12); this.frogMouth.visible = false;
    const smile = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.25, -.065, .67), new THREE.Vector3(-.13, -.074, .72),
      new THREE.Vector3(0, -.078, .735), new THREE.Vector3(.13, -.074, .72), new THREE.Vector3(.25, -.065, .67),
    ]);
    this.frogMouthLine = this.mesh(new THREE.TubeGeometry(smile, 16, .006, 5, false), this.mats.dark, this.frogBody);
    this.frogJaw = this.mesh(new THREE.IcosahedronGeometry(.13, 1), this.mats.frog, this.frogBody, new THREE.Vector3(0, -.14, .64));
    this.frogJaw.scale.set(1.4, .27, .65);
    for (const side of [-1, 1]) {
      const cheek = this.mesh(new THREE.IcosahedronGeometry(.055, 1), this.mats.frog, this.frogBody, new THREE.Vector3(side * .2, -.015, .54));
      cheek.scale.set(1.05, .72, .8); this.cheeks.push(cheek);
    }
    for (const side of [-1, 1]) this.mesh(new THREE.SphereGeometry(.018, 6, 4), this.mats.dark, this.frogBody, new THREE.Vector3(side * .105, .105, .82));
  }

  private grassField(parent: THREE.Object3D, positions: THREE.Vector3[], seed: number): void {
    if (!positions.length) return;
    const batches = this.grassShapes.map((geometry, variant) => {
      const count = Math.ceil(positions.length / this.grassShapes.length);
      const mesh = new THREE.InstancedMesh(geometry, this.grassMaterial, count);
      mesh.name = `grass-variant-${variant + 1}`;
      mesh.castShadow = false; mesh.receiveShadow = true;
      parent.add(mesh);
      return { mesh, used: 0 };
    });
    const dummy = new THREE.Object3D();
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const colors = FROG_GRASS_COLORS.map(color => new THREE.Color(color));
    positions.forEach((position, index) => {
      const variant = (index * 5) % 7, batch = batches[variant];
      dummy.position.copy(position);
      dummy.rotation.set((random() - .5) * .08, random() * Math.PI * 2, (random() - .5) * .08);
      const scale = .52 + random() * .34;
      dummy.scale.set(scale * (.82 + random() * .4), scale * (.78 + random() * .55), scale * (.82 + random() * .4));
      dummy.updateMatrix(); batch.mesh.setMatrixAt(batch.used, dummy.matrix);
      batch.mesh.setColorAt(batch.used, colors[Math.floor(random() * colors.length)]);
      batch.used++;
    });
    for (const { mesh, used } of batches) {
      mesh.count = used;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private grassOnLandscape(parent: THREE.Object3D, land: NonNullable<Course['landscapes']>[number], course: Course): void {
    if (land.zone !== 0 && land.zone !== 1) return;
    // Keep enough grass to soften the broad starting island while leaving a clear
    // corridor around every landing and food anchor.
    const authoredEcosystem = ['ecosystem-main-v3', 'ecosystem-main-v4', 'ecosystem-main-v5'].includes(course.id);
    const points: THREE.Vector3[] = [];
    let state = 0x51f15e + land.zone;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const nextPads = course.platforms.filter(p => p.zone === land.zone).map(p => p.position);
    const foods = course.anchors.filter(a => a.zone === land.zone).map(a => a.position);
    const resolution = land.resolution, stride = resolution + 1;
    for (let i = 0; i < (authoredEcosystem ? 480 : land.zone === 0 ? 185 : 175); i++) {
      const lx = (random() - .5) * land.size.x * .94, lz = (random() - .5) * land.size.z * .94;
      const gx = (lx / land.size.x + .5) * resolution, gz = (lz / land.size.z + .5) * resolution;
      const x0 = Math.min(resolution - 1, Math.floor(gx)), z0 = Math.min(resolution - 1, Math.floor(gz));
      const fx = gx - x0, fz = gz - z0;
      const h00 = land.heights[x0 * stride + z0], h10 = land.heights[(x0 + 1) * stride + z0];
      const h01 = land.heights[x0 * stride + z0 + 1], h11 = land.heights[(x0 + 1) * stride + z0 + 1];
      const h = THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00, h10, fx), THREE.MathUtils.lerp(h01, h11, fx), fz);
      const x = land.position.x + lx, y = land.position.y + h + .025, z = land.position.z + lz;
      if (Math.hypot(lx, lz) > land.size.x * .44 || nextPads.some(p => Math.hypot(p.x - x, p.z - z) < 1.8)
        || foods.some(a => Math.hypot(a.x - x, a.z - z) < 1.15)
        || course.id === 'ecosystem-main-v5' && land.zone === 0 && Math.hypot(x - course.start.x, z - course.start.z) < 9.8
        || land.zone === 0 && (Math.hypot(x + 6, z + 4) < 7.4 || Math.hypot(x, z - 3.5) < 1.8)) continue;
      points.push(new THREE.Vector3(x, y, z));
    }
    this.grassField(parent, points, 0x6a4d3 + land.zone);
  }

  private flowersOnIsland(parent: THREE.Object3D, land: NonNullable<Course['landscapes']>[number], course: Course): void {
    if (land.zone !== 0 || !['ecosystem-main-v3', 'ecosystem-main-v4', 'ecosystem-main-v5'].includes(course.id)) return;
    let seed = 0x41c64e6d;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const pads = course.platforms.filter(p => p.zone === 0).map(p => p.position);
    const foods = course.anchors.filter(a => a.zone === 0).map(a => a.position);
    const positions: { x: number; y: number; z: number; height: number; color: THREE.Color }[] = [];
    const colors = ['#fff4d3', '#f4d6bc', '#f5c5c4', '#f0dc9f'].map(color => new THREE.Color(color));
    for (let attempt = 0; attempt < 420 && positions.length < 78; attempt++) {
      const x = (random() - .5) * land.size.x * .9, z = (random() - .5) * land.size.z * .9;
      if (Math.hypot(x, z) > land.size.x * .43 || Math.hypot(x + 6, z + 4) < 7.7 || Math.hypot(x, z - 3.5) < 2.2
        || course.id === 'ecosystem-main-v5' && Math.hypot(land.position.x + x - course.start.x, land.position.z + z - course.start.z) < 9.8
        || pads.some(p => Math.hypot(p.x - land.position.x - x, p.z - land.position.z - z) < 2.2)
        || foods.some(a => Math.hypot(a.x - land.position.x - x, a.z - land.position.z - z) < 1.4)) continue;
      positions.push({ x: land.position.x + x, y: this.landscapeHeightAt(land, land.position.x + x, land.position.z + z) + .025,
        z: land.position.z + z, height: .28 + random() * .32, color: colors[Math.floor(random() * colors.length)] });
    }
    if (!positions.length) return;
    const stemsMat = material('#587d42', .95); this.ownedMaterials.add(stemsMat);
    const petalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .78, flatShading: true }); this.ownedMaterials.add(petalMat);
    const heartMat = new THREE.MeshStandardMaterial({ color: '#f1c65f', roughness: .65, flatShading: true }); this.ownedMaterials.add(heartMat);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(.012, .022, 1, 4), stemsMat, positions.length);
    const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), petalMat, positions.length * 5);
    const hearts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), heartMat, positions.length);
    stems.name = 'island-wildflower-stems'; petals.name = 'island-wildflower-petals'; hearts.name = 'island-wildflower-centers';
    stems.castShadow = petals.castShadow = hearts.castShadow = false;
    stems.receiveShadow = petals.receiveShadow = hearts.receiveShadow = false;
    const dummy = new THREE.Object3D();
    positions.forEach((flower, index) => {
      const headY = flower.y + flower.height;
      dummy.position.set(flower.x, flower.y + flower.height * .45, flower.z); dummy.scale.set(1, flower.height, 1); dummy.updateMatrix(); stems.setMatrixAt(index, dummy.matrix);
      dummy.position.set(flower.x, headY, flower.z); dummy.scale.set(.075, .045, .075); dummy.updateMatrix(); hearts.setMatrixAt(index, dummy.matrix);
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5 + index * .83;
        dummy.position.set(flower.x + Math.cos(angle) * .085, headY, flower.z + Math.sin(angle) * .085);
        dummy.rotation.set(0, -angle, .08 * Math.sin(angle)); dummy.scale.set(.085, .035, .12); dummy.updateMatrix();
        const instance = index * 5 + petal; petals.setMatrixAt(instance, dummy.matrix); petals.setColorAt(instance, flower.color);
      }
    });
    stems.instanceMatrix.needsUpdate = true; petals.instanceMatrix.needsUpdate = true; hearts.instanceMatrix.needsUpdate = true;
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    parent.add(stems, petals, hearts);
  }

  private floraOnLandscape(parent: THREE.Object3D, land: NonNullable<Course['landscapes']>[number], course: Course): void {
    if (land.zone !== 0 && land.zone !== 1 && land.zone !== 3) return;
    let seed = 0x3d17a5 + land.zone * 131;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const pads = course.platforms.filter(p => p.zone === land.zone).map(p => p.position);
    const foods = course.anchors.filter(a => a.zone === land.zone).map(a => a.position);
    const n = land.resolution, stride = n + 1;
    const foliage = material(land.zone === 3 ? '#567c43' : '#607f46', .98);
    const flowerColors = land.zone === 3 ? ['#f2d17e', '#e8a6a0', '#f2e6c2'].map(c => material(c, .78)) : [];
    for (let attempt = 0, placed = 0; attempt < 220 && placed < (land.zone === 3 ? 26 : land.zone === 0 ? 13 : 16); attempt++) {
      const x = (random() - .5) * land.size.x * .82, z = (random() - .5) * land.size.z * .82;
      const radius = Math.hypot(x, z);
      if (radius > land.size.x * .4 || land.zone === 0 && radius < 7.8 || land.zone === 1 && radius < 3.4
        || pads.some(p => Math.hypot(p.x - land.position.x - x, p.z - land.position.z - z) < 2.3)
        || foods.some(a => Math.hypot(a.x - land.position.x - x, a.z - land.position.z - z) < 1.6)) continue;
      const gx = (x / land.size.x + .5) * n, gz = (z / land.size.z + .5) * n;
      const ix = Math.min(n - 1, Math.floor(gx)), iz = Math.min(n - 1, Math.floor(gz)), fx = gx - ix, fz = gz - iz;
      const h00 = land.heights[ix * stride + iz], h10 = land.heights[(ix + 1) * stride + iz];
      const h01 = land.heights[ix * stride + iz + 1], h11 = land.heights[(ix + 1) * stride + iz + 1];
      const h = THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00, h10, fx), THREE.MathUtils.lerp(h01, h11, fx), fz);
      const bush = new THREE.Group();
      bush.position.set(land.position.x + x, land.position.y + h, land.position.z + z); parent.add(bush);
      if (land.zone === 3) {
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * .4;
          const bloom = this.mesh(new THREE.IcosahedronGeometry(.16, 0), flowerColors[placed % flowerColors.length], bush,
            new THREE.Vector3(Math.cos(angle) * .13, .25 + Math.sin(angle) * .045, Math.sin(angle) * .13));
          bloom.scale.set(1, .55, .8);
        }
        this.mesh(new THREE.CylinderGeometry(.018, .025, .3, 5), foliage, bush, new THREE.Vector3(0, .09, 0));
      } else {
        const size = .32 + random() * .16;
        for (let leaf = 0; leaf < 3; leaf++) {
          const angle = leaf * Math.PI * 2 / 3 + random() * .4;
          const shrub = this.mesh(new THREE.IcosahedronGeometry(size, 1), foliage, bush,
            new THREE.Vector3(Math.cos(angle) * size * .5, size * (.4 + random() * .4), Math.sin(angle) * size * .5));
          shrub.scale.set(1.2, .78 + random() * .35, 1);
        }
      }
      placed++;
    }
  }

  private makeFly(a: Anchor): void {
    const group = new THREE.Group(); group.position.copy(V(a.position)); group.userData.anchor = a; this.world.add(group);
    group.userData.baseScale = a.food === 'fruit-fly' ? .72 : a.food === 'moth' ? 1.18 : 1;
    const visual = new THREE.Group(); visual.name = 'procedural-food'; group.add(visual);
    if (a.transition) {
      const glow = new THREE.MeshBasicMaterial({ color: '#ffe3a0' });
      for (const y of [-.09, .09]) this.mesh(new THREE.TorusGeometry(.48, .022, 5, 32), glow, group, new THREE.Vector3(0, y, 0));
    }
    if (a.food === 'pollen' || a.food === 'dew' || a.food === 'stardust') {
      if (a.food === 'pollen') {
        const gold = material('#efc25e', .5);
        this.mesh(new THREE.IcosahedronGeometry(.28, 1), gold, visual);
        for (let i = 0; i < 9; i++) {
          const angle = i * 2.399, y = (i / 8 - .5) * .5;
          this.mesh(new THREE.IcosahedronGeometry(.09, 0), gold, visual, new THREE.Vector3(Math.sin(angle) * .3, y, Math.cos(angle) * .3));
        }
      } else if (a.food === 'dew') {
        const water = new THREE.MeshStandardMaterial({ color: '#9ae9f4', roughness: .15, metalness: .15, transparent: true, opacity: .82 });
        this.mesh(new THREE.SphereGeometry(.23, 12, 8), water, visual);
        this.mesh(new THREE.ConeGeometry(.19, .35, 12), water, visual, new THREE.Vector3(0, .2, 0));
        this.mesh(new THREE.SphereGeometry(.05, 6, 4), this.mats.white, visual, new THREE.Vector3(-.1, .07, .17));
      } else {
        const gold = new THREE.MeshStandardMaterial({ color: '#ffe7a4', emissive: '#e7a43e', emissiveIntensity: .8, roughness: .3 });
        this.mesh(new THREE.OctahedronGeometry(.35), gold, visual);
        for (let i = 0; i < 4; i++) {
          const spark = this.mesh(new THREE.OctahedronGeometry(.07), gold, visual, new THREE.Vector3(Math.sin(i * Math.PI / 2) * .48, Math.cos(i * Math.PI / 2) * .48, 0));
          spark.scale.set(.6, 1.6, .6);
        }
      }
      this.flies.set(a.id, group);
    } else {
      const food = a.food ?? 'fly';
      const bodyMat = food === 'bee' ? material('#e9b74d') : food === 'fruit-fly' ? material('#ad7748')
        : food === 'beetle' ? material('#3b7b65', .35) : food === 'moth' ? material('#857297') : this.mats.fly;
      const body = this.mesh(new THREE.IcosahedronGeometry(.24, 1), bodyMat, visual); body.scale.set(food === 'bee' ? .85 : 1.2, .8, food === 'bee' ? 1.45 : 1);
      if (food === 'bee') for (let i = 0; i < 3; i++) {
        const band = this.mesh(new THREE.TorusGeometry(.185, .027, 5, 12), this.mats.dark, visual, new THREE.Vector3(0, 0, (i - 1) * .15));
        band.scale.y = .8;
      }
      const stripe = this.mesh(new THREE.IcosahedronGeometry(.20, 0), material('#7e8766'), visual, new THREE.Vector3(0, -.03, -.12));
      stripe.scale.set(1, .7, 1.1);
      const wingMat = new THREE.MeshStandardMaterial({ color: food === 'moth' ? '#cfb1d2' : food === 'beetle' ? '#4eaa7d' : '#e8f5da', transparent: food !== 'moth', opacity: .77, roughness: .7, side: THREE.DoubleSide, flatShading: true });
      for (const side of [-1, 1]) {
        const eye = this.mesh(new THREE.SphereGeometry(.125, 8, 6), this.mats.white, visual, new THREE.Vector3(side * .115, .095, .16));
        const pupil = this.mesh(new THREE.SphereGeometry(.058, 6, 4), this.mats.dark, eye, new THREE.Vector3(0, .018, .10));
        pupil.userData.pupil = true;
        const brow = this.mesh(new THREE.BoxGeometry(.17, .023, .026), this.mats.dark, visual, new THREE.Vector3(side * .115, .225, .17));
        brow.userData.brow = side;
        const wing = this.mesh(new THREE.SphereGeometry(.23, 6, 3), wingMat, visual, new THREE.Vector3(side * .3, .1, -.06));
        wing.scale.set(food === 'moth' ? 2 : 1.35, .07, food === 'moth' ? 1.4 : .75); wing.userData.wing = side;
        if (food === 'moth') this.mesh(new THREE.SphereGeometry(.065, 6, 4), material('#9f7958'), wing, new THREE.Vector3(side * .06, .03, 0));
        for (let j = 0; j < 2; j++) {
          const leg = this.mesh(new THREE.CylinderGeometry(.014, .014, .17, 4), this.mats.dark, visual, new THREE.Vector3(side * .16, -.14, j ? -.1 : .1));
          leg.rotation.z = side * .7;
          leg.userData.leg = side; leg.userData.offset = j;
        }
      }
      const mouth = this.mesh(new THREE.SphereGeometry(.052, 8, 6), this.mats.dark, visual, new THREE.Vector3(0, -.015, .235));
      mouth.userData.mouth = true;
      const sweat = this.mesh(new THREE.ConeGeometry(.043, .13, 6), this.mats.white, visual, new THREE.Vector3(.24, .2, .15));
      sweat.userData.sweat = true; sweat.visible = false;
    }
    if (a.recovery) {
      const halo = this.mesh(new THREE.TorusGeometry(.35, .012, 4, 20), material('#cce3a8'), group);
      halo.rotation.x = Math.PI / 2;
    }
    if (a.motion) {
      const halo = this.mesh(new THREE.TorusGeometry(.35, .018, 5, 20), material('#e5c479'), group);
      halo.rotation.x = Math.PI / 2;
    }
    this.flies.set(a.id, group);
  }

  private prepareFrogGhostMaterials(): void {
    const makeGhost = (material: THREE.Material) => {
      const ghost = material.clone();
      ghost.transparent = true;
      ghost.opacity = .38;
      ghost.depthTest = false;
      ghost.depthWrite = false;
      ghost.needsUpdate = true;
      return ghost;
    };
    this.frog.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const ghost = Array.isArray(original) ? original.map(makeGhost) : makeGhost(original);
      this.frogGhostMaterials.set(object, { original, ghost, renderOrder: object.renderOrder });
    });
  }

  private setFrogOccluded(occluded: boolean): void {
    if (this.frogOccluded === occluded) return;
    this.frogOccluded = occluded;
    for (const [mesh, state] of this.frogGhostMaterials) {
      mesh.material = occluded ? state.ghost : state.original;
      mesh.renderOrder = occluded ? 20 : state.renderOrder;
    }
  }

  private updateFrogOcclusion(dt: number): void {
    this.frogOcclusionElapsed += dt;
    if (this.frogOcclusionElapsed < .08) return;
    this.frogOcclusionElapsed = 0;
    const frogPoint = this.frog.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .35, 0));
    const direction = frogPoint.sub(this.camera.position);
    const distance = direction.length();
    if (distance < .05) {
      this.setFrogOccluded(false);
      return;
    }
    this.wallRay.set(this.camera.position, direction.multiplyScalar(1 / distance));
    this.wallRay.far = Math.max(0, distance - .2);
    let occluded = false;
    for (const obstacle of this.collisionMeshes) {
      this.occlusionHits.length = 0;
      obstacle.raycast(this.wallRay, this.occlusionHits);
      if (this.occlusionHits.length) { occluded = true; break; }
    }
    this.setFrogOccluded(occluded);
  }

  private platform(p: Platform, naturalSupports = false): void {
    const root = new THREE.Group(); root.name = `platform-${p.id}`; root.userData.platformId = p.id;
    root.position.copy(V(p.position)); this.world.add(root); this.platformRoots.set(p.id, root);
    if (p.rotation) root.rotation.set(p.rotation.x,p.rotation.y,p.rotation.z);
    if (p.form) {
      this.landform(p, root);
      // Refuge landforms keep their existing collision surface. This separate skirt
      // only gives the checkpoint a layered, natural underside in the render.
      if (p.refuge && p.form !== 'branch' && p.form !== 'root') {
        const cliffMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, flatShading: false, side: THREE.DoubleSide });
        const cliff = this.mesh(this.islandCliffGeometry(p.size, p.zone), cliffMaterial, root);
        cliff.position.y = -.045; cliff.scale.y = .92; cliff.castShadow = false;
      }
      return;
    }
    if (p.kind === 'cloud' && !p.refuge) {
      for (const [i, clump] of cloudClumps(p.size).entries()) {
        const puff = this.mesh(new THREE.IcosahedronGeometry(1, 0), material(i ? '#dce8f5' : '#f4f7fc'), root, V(clump.position));
        puff.scale.copy(V(clump.size)); this.collisionMeshes.push(puff);
      }
      return;
    }
    const terrain = ['grass', 'rock', 'petal', 'branch', 'cloud', 'star'].includes(p.kind);
    const mat = p.refuge ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
      : terrain ? material(this.biomeColors[p.zone] ?? '#8c9d74') : p.kind === 'terrace' ? material(COLORS[p.zone]) : p.kind === 'pot' ? this.mats.pot : p.kind === 'metal' ? this.mats.metal : p.kind === 'wood' ? this.mats.bark : p.kind === 'flower' ? this.mats.pink : this.mats.leaf;
    let topGeometry: THREE.BufferGeometry = p.refuge ? this.islandCliffGeometry(p.size, p.zone)
      : p.round ? new THREE.CylinderGeometry(p.size.x / 2, p.size.x / 2, p.size.y, 48)
      : p.kind === 'ground' || p.kind === 'terrace' ? new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z) : this.beveledPlatform(p.size);
    if (p.kind === 'star' && !p.refuge) {
      const data = starMesh(p.size); topGeometry = new THREE.BufferGeometry();
      topGeometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3)); topGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); topGeometry.computeVertexNormals();
    }
    const top = this.mesh(topGeometry, mat, root);
    if (p.refuge) top.receiveShadow = false;
    this.collisionMeshes.push(top);
    if (terrain) { this.terrainDetail(p, root); return; }
    if (p.kind === 'terrace') {
      // Flat inlays show the actual catch boundary without decorative collision walls.
      const trim = material('#f5e5b3');
      const y = p.size.y / 2 + .008;
      for (const side of [-1, 1]) {
        this.mesh(new THREE.BoxGeometry(p.size.x - .12, .012, .09), trim, root, new THREE.Vector3(0, y, side * (p.size.z / 2 - .08)));
        this.mesh(new THREE.BoxGeometry(.09, .012, p.size.z - .12), trim, root, new THREE.Vector3(side * (p.size.x / 2 - .08), y, 0));
      }
      for (let i = 1; i < 7; i++) this.mesh(new THREE.BoxGeometry(p.size.x - .3, .01, .025), this.mats.bark, root,
        new THREE.Vector3(0, y, -p.size.z / 2 + i * p.size.z / 7));
      return;
    }
    if (p.kind === 'ground') {
      top.material = material('#879966');
      this.ownedMaterials.add(top.material);
      const pondGeometry = new THREE.CircleGeometry(1, 48);
      const pondPositions = pondGeometry.getAttribute('position');
      for (let i = 1; i < pondPositions.count; i++) {
        const x = pondPositions.getX(i), z = pondPositions.getY(i), angle = Math.atan2(z, x);
        const radius = 6.7 * (1 + .035 * Math.sin(angle * 3 + .5) + .022 * Math.cos(angle * 5 - .8));
        pondPositions.setXYZ(i, x * radius, z * radius, .012 * Math.sin(angle * 4));
      }
      pondGeometry.rotateX(-Math.PI / 2); pondGeometry.computeVertexNormals();
      const pond = this.mesh(pondGeometry, this.mats.water, root, new THREE.Vector3(-6, .33, -4));
      pond.name = 'procedural-pond-water'; this.pondDecoration.push(pond);
      pond.receiveShadow = true;
      const shoreGeometry = new THREE.TorusGeometry(6.76, .24, 5, 48);
      const shorePositions = shoreGeometry.getAttribute('position');
      for (let i = 0; i < shorePositions.count; i++) {
        const x = shorePositions.getX(i), y = shorePositions.getY(i), angle = Math.atan2(y, x);
        const wobble = 1 + .035 * Math.sin(angle * 3 + .5) + .022 * Math.cos(angle * 5 - .8);
        shorePositions.setXYZ(i, x * wobble, y * wobble, shorePositions.getZ(i));
      }
      shoreGeometry.computeVertexNormals();
      const shore = this.mesh(shoreGeometry, material('#b6ae81'), root, new THREE.Vector3(-6, .28, -4));
      shore.name = 'procedural-pond-shore'; this.pondDecoration.push(shore);
      shore.rotation.x = Math.PI / 2;
      const lilyMaterial = material('#789d4f');
      for (const [x, z, size, angle] of [[-7.5, -5.1, .82, .4], [-4.2, -6.4, .64, 2.2], [-8.3, -2.4, .54, 4.1]] as const) {
        const lily = this.mesh(new THREE.CircleGeometry(size, 12, .18, Math.PI * 1.78), lilyMaterial, root, new THREE.Vector3(x, .355, z));
        lily.name = 'procedural-pond-lily'; this.pondDecoration.push(lily);
        lily.rotation.x = -Math.PI / 2; lily.rotation.z = angle;
      }
      return;
    }
    if (p.kind === 'leaf' || p.kind === 'flower') {
      const topColor = material(p.kind === 'flower' ? '#f1bbbd' : p.bounce ? '#d7d982' : p.recovery ? '#bdcc83' : '#9bb965');
      this.mesh(new THREE.BoxGeometry(p.size.x * .96, .018, p.size.z * .94), topColor, root, new THREE.Vector3(0, p.size.y / 2 + .006, 0));
      const veinMaterial = material(p.kind === 'flower' ? '#ffd8c6' : '#cbd49c');
      this.mesh(new THREE.BoxGeometry(.038, .016, p.size.z * .88), veinMaterial, root, new THREE.Vector3(0, p.size.y / 2 + .023, 0));
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const v = this.mesh(new THREE.BoxGeometry(p.size.x * .36, .012, .022), veinMaterial, root, new THREE.Vector3(side * p.size.x * .2, p.size.y / 2 + .024, (i - 1) * p.size.z * .22));
        v.rotation.y = side * -.4;
      }
    }
    if (p.bounce) {
      const springMat = material('#f5d495', .5);
      for (let i = 0; i < 3; i++) {
        const coil = this.mesh(new THREE.TorusGeometry(.23, .032, 5, 12), springMat, root, new THREE.Vector3(0, -.24 - i * .11, 0));
        coil.rotation.x = Math.PI / 2;
        const ring = this.mesh(new THREE.TorusGeometry(.22 + i * .16, .02, 5, 24), springMat, root, new THREE.Vector3(0, p.size.y / 2 + .045, 0));
        ring.rotation.x = Math.PI / 2;
      }
    }
    if (p.kind === 'pot') {
      const radius = Math.min(p.size.x, p.size.z) * .43;
      const pot = this.mesh(new THREE.CylinderGeometry(radius, radius, 1.6, 12), this.mats.pot, root, new THREE.Vector3(0, -.95, 0));
      this.collisionMeshes.push(pot);
      this.mesh(new THREE.TorusGeometry(radius, .09, 5, 12), material('#d7a079'), root, new THREE.Vector3(0, -.17, 0)).rotation.x = Math.PI / 2;
      this.mesh(new THREE.CylinderGeometry(radius * .92, radius * .92, .025, 12), material('#6c5946'), root, new THREE.Vector3(0, -.14, 0));
    }
    if (p.kind === 'metal') {
      for (const side of [-1, 1]) this.mesh(new THREE.CylinderGeometry(.045, .045, 1.2, 5), this.mats.metal, root, new THREE.Vector3(side * (p.size.x / 2 - .1), -.55, 0));
      for (let i = 0; i < 3; i++) this.mesh(new THREE.SphereGeometry(.06, 6, 4), material('#d6d9ae'), root, new THREE.Vector3((i - 1) * .8, p.size.y / 2, -.8));
      for (let i = 0; i < 6; i++) this.mesh(new THREE.BoxGeometry(.025, .012, p.size.z * .86), this.mats.dark, root, new THREE.Vector3((i - 2.5) * p.size.x / 7, p.size.y / 2 + .015, 0));
    }
    if (p.kind === 'wood') for (let i = 0; i < 5; i++) {
      const plank = this.mesh(new THREE.BoxGeometry(p.size.x * .97, .015, p.size.z / 5 * .92), material(i % 2 ? '#947457' : '#a38661'), root, new THREE.Vector3(0, p.size.y / 2 + .01, (i - 2) * p.size.z / 5));
      for (const side of [-1, 1]) this.mesh(new THREE.SphereGeometry(.035, 5, 4), this.mats.metal, plank, new THREE.Vector3(side * p.size.x * .43, .012, 0));
    }
    if (p.kind === 'flower') {
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        const petal = this.mesh(new THREE.IcosahedronGeometry(1, 1), this.mats.pink, root, new THREE.Vector3(Math.sin(angle) * p.size.x * .45, -.08, Math.cos(angle) * p.size.z * .45));
        petal.scale.set(.9, .13, 1.4); petal.rotation.y = angle;
      }
      if (p.id === 'summit') {
        this.mesh(new THREE.CylinderGeometry(1.05, 1.05, .1, 12), material('#eed582'), root, new THREE.Vector3(0, p.size.y / 2 + .05, 0));
        for (let i = 0; i < 9; i++) this.mesh(new THREE.IcosahedronGeometry(.13, 0), material('#fff0b2'), root, new THREE.Vector3(Math.sin(i * 2.4) * .8, .32, Math.cos(i * 2.4) * .8));
      }
    }
    if (!naturalSupports && p.position.y > 1) {
      const end = V(p.position).clone(); end.y -= .4;
      const begin = new THREE.Vector3(0, p.position.y - 1.2, 0);
      const stem = this.mesh(new THREE.CylinderGeometry(.075, .11, begin.distanceTo(end), 5), this.mats.bark, this.world);
      stem.position.copy(begin).add(end).multiplyScalar(.5); stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(begin).normalize());
    }
  }

  private landform(p: Platform, root: THREE.Group): void {
    const data = platformMesh(p), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices,3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices,1)); geometry.computeVertexNormals();
    const palette: Record<string,string[]> = {leaf:['#648a3c','#a8ba64'],petal:['#bd6f92','#f3c6ba'],stone:['#7d857c','#c3c4a2'],branch:['#725036','#b08b56'],root:['#62563b','#9e925a'],cloud:['#bfd4e9','#fbfcff']};
    const [dark,light] = palette[p.form!];
    const base = new THREE.Color(p.color ?? dark), accent = new THREE.Color(p.color ?? light);
    if(p.color) { base.multiplyScalar(.78); accent.lerp(new THREE.Color('#fff5d6'),.2); }
    const colors: number[] = [];
    for(let i=0;i<data.vertices.length;i+=3) {
      const x=data.vertices[i],y=data.vertices[i+1],z=data.vertices[i+2];
      const shade=clamp(.3+y/Math.max(.4,p.size.y)*.35+.13*Math.sin(x*1.7+z*.8),.1,.95);
      const c=base.clone().lerp(accent,shade); colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,flatShading:true,side:THREE.DoubleSide,emissive:base.clone().multiplyScalar(.12)});
    this.collisionMeshes.push(this.mesh(geometry,mat,root));
    if(p.form==='leaf'||p.form==='petal') {
      const vein=material(p.form==='petal'?'#f1c0c0':'#b4c47a');
      const points:THREE.Vector3[]=[];
      for(let i=0;i<=12;i++) { const z=(i/12-.5)*p.size.z*.94; points.push(new THREE.Vector3(0,bladeHeight(p,0,z)+.025,z)); }
      this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.025,4,false),vein,root);
      for(const side of [-1,1]) for(let j=0;j<4;j++) {
        const z=(j/4-.35)*p.size.z*.7,x=side*p.size.x*.34;
        const a=new THREE.Vector3(0,bladeHeight(p,0,z)+.03,z);
        const b=new THREE.Vector3(x,bladeHeight(p,x,z+.6)+.03,z+.6);
        this.mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a,b),1,.012,3,false),vein,root);
      }
    }
    if(p.form==='stone'&&p.zone<6) {
      const moss=material(p.zone===5?'#adb9a7':'#8caa65');
      for(let i=0;i<4;i++) {
        const a=i*2.4+.3;
        const tuft=this.mesh(new THREE.IcosahedronGeometry(1,0),moss,root,new THREE.Vector3(Math.cos(a)*p.size.x*.28,p.size.y/2+.03,Math.sin(a)*p.size.z*.28));
        tuft.scale.set(.32,.055,.23);
      }
    }
    if(p.form==='branch'||p.form==='root') {
      const bark=material('#5f4834');
      for(const side of [-1,1]) for(let i=0;i<3;i++) {
        const line=this.mesh(new THREE.BoxGeometry(.022,.018,p.size.z*.65),bark,root,new THREE.Vector3(side*p.size.x*(.12+i*.06),p.size.y*.44,0));
        line.rotation.y=side*.04;
      }
    }
  }

  private islandCliffGeometry(size: Vec, zone: number): THREE.BufferGeometry {
    // Leave the top open: the matching collision landscape above supplies its uneven surface.
    // A tapered, stratified underside reads as a natural floating bank instead of a cut cylinder.
    const rings = [
      { y: .5, radius: .72 }, { y: .2, radius: .96 }, { y: -.12, radius: .88 }, { y: -.5, radius: .7 },
    ];
    const segments = 32, vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const palettes = [
      ['#66764c', '#899361', '#77775a'], ['#536f43', '#7d8b53', '#777253'], ['#77766a', '#aaa18a', '#77786e'],
      ['#856b66', '#b4877d', '#766b64'], ['#674d3c', '#8a6849', '#705b46'], ['#686c69', '#919797', '#777d81'],
      ['#b9c7d4', '#e3e6e5', '#a3b5c7'], ['#4e5068', '#73728a', '#424b68'],
    ][zone] ?? ['#66764c', '#899361', '#77775a'];
    const tones = palettes.map(color => new THREE.Color(color));
    for (let r = 0; r < rings.length; r++) for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const irregular = 1 + .035 * Math.sin(angle * 3 + zone * .8) + .022 * Math.cos(angle * 7 - zone);
      const ridge = 1 + .025 * Math.sin(angle * 5 + r * 1.7);
      const radius = size.x * .5 * rings[r].radius * irregular * ridge;
      vertices.push(Math.cos(angle) * radius, rings[r].y * size.y, Math.sin(angle) * radius);
      const tint = tones[(r + Math.floor(i / 4) % 3) % tones.length];
      const color = tint.clone().multiplyScalar(.9 + ((i * 13 + r * 7) % 9) * .025);
      colors.push(color.r, color.g, color.b);
    }
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < segments; i++) {
      const a = r * segments + i, b = r * segments + (i + 1) % segments, c = a + segments, d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  private terrainDetail(p: Platform, root: THREE.Group): void {
    const y = p.size.y / 2 + .008;
    if (p.kind === 'grass') {
      if (p.refuge) return;
      this.mesh(new THREE.BoxGeometry(p.size.x * .985, .016, p.size.z * .985), material('#92b95c'), root, new THREE.Vector3(0, y, 0));
      const count = p.refuge ? 72 : Math.min(42, Math.max(12, Math.round(p.size.x * p.size.z * .22)));
      const positions: THREE.Vector3[] = [];
      let seed = p.id.length * 971 + p.zone * 173;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
      for (let i = 0; i < count * 2 && positions.length < count; i++) {
        const x = (random() - .5) * p.size.x * .88, z = (random() - .5) * p.size.z * .88;
        if (p.refuge && Math.hypot(x, z) < 2.2) continue;
        positions.push(new THREE.Vector3(x, y + .006, z));
      }
      this.grassField(root, positions, seed);
    } else if (p.kind === 'rock') {
      for (let i = 0; i < 3; i++) {
        const chip = this.mesh(new THREE.IcosahedronGeometry(.12 + i * .035, 0), material('#7e8275'), root,
          new THREE.Vector3((i - 1) * p.size.x * .21, y, (i % 2 ? 1 : -1) * p.size.z * .19));
        chip.scale.set(1.6, .24, .72);
      }
    } else if (p.kind === 'petal') {
      this.mesh(new THREE.BoxGeometry(p.size.x * .97, .012, .09), material('#f9d3de'), root, new THREE.Vector3(0, y, 0));
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const vein = this.mesh(new THREE.BoxGeometry(p.size.x * .36, .012, .025), material('#f6c1d1'), root, new THREE.Vector3(side * p.size.x * .22, y, (i - 1) * p.size.z * .22));
        vein.rotation.y = side * .3;
      }
    } else if (p.kind === 'branch') {
      for (let i = 0; i < 4; i++) this.mesh(new THREE.BoxGeometry(p.size.x * .88, .014, .04), material(i % 2 ? '#a18159' : '#614c38'), root,
        new THREE.Vector3(0, y, (i - 1.5) * p.size.z / 5));
    } else if (p.kind === 'cloud') {
      // Rounded volumes stay beneath the real flat cloud surface.
      for (let i = 0; i < 7; i++) {
        const puff = this.mesh(new THREE.SphereGeometry(Math.min(p.size.x, p.size.z) * .23, 12, 8), material(i % 2 ? '#f7f7fb' : '#cbdcf0'), root,
          new THREE.Vector3(Math.sin(i * 2.399) * p.size.x * .25, -p.size.y / 2 - .1, Math.cos(i * 2.399) * p.size.z * .25));
        puff.scale.y = Math.min(.35, p.size.y * .22 / (Math.min(p.size.x, p.size.z) * .23));
        puff.position.y = -p.size.y * .1;
      }
    } else if (p.kind === 'star') {
      const gold = new THREE.MeshStandardMaterial({ color: '#ffe9a7', emissive: '#bd8a2f', emissiveIntensity: .35, roughness: .45 });
      const ring = this.mesh(new THREE.TorusGeometry(Math.min(p.size.x, p.size.z) * .34, .018, 5, 32), gold, root, new THREE.Vector3(0, y + .004, 0));
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        this.mesh(new THREE.OctahedronGeometry(.1), gold, root, new THREE.Vector3(Math.sin(a) * p.size.x * .3, y + .08, Math.cos(a) * p.size.z * .3));
      }
    }
  }

  private beveledPlatform(size: Vec): THREE.BufferGeometry {
    const x = size.x / 2 - .045, z = size.z / 2 - .045, r = .09;
    const shape = new THREE.Shape();
    shape.moveTo(-x + r, -z); shape.lineTo(x - r, -z); shape.quadraticCurveTo(x, -z, x, -z + r);
    shape.lineTo(x, z - r); shape.quadraticCurveTo(x, z, x - r, z);
    shape.lineTo(-x + r, z); shape.quadraticCurveTo(-x, z, -x, z - r);
    shape.lineTo(-x, -z + r); shape.quadraticCurveTo(-x, -z, -x + r, -z);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.01, size.y - .08), bevelEnabled: true, bevelSize: .045, bevelThickness: .04, bevelSegments: 1, steps: 1, curveSegments: 3 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -(size.y - .08) / 2, 0); return geo;
  }

  private fittedAsset(assetId: string, dimension: number, mode: 'largest' | 'horizontal', align: 'center' | 'ground'): THREE.Group | null {
    const source = this.modelAssets.get(assetId);
    if (!source) return null;
    const object = cloneSkinned(source.scene) as THREE.Group;
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const measure = mode === 'horizontal' ? Math.max(size.x, size.z) : Math.max(size.x, size.y, size.z);
    if (measure < .0001) return null;
    const scale = dimension / measure;
    object.scale.setScalar(scale);
    object.position.set(-center.x * scale, (align === 'ground' ? -bounds.min.y : -center.y) * scale, -center.z * scale);
    object.updateMatrixWorld(true);
    object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
        child.userData.sharedAsset = true;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  }

  private placeScenery(assetId: string, position: Vec, width: number, yaw = 0, backdrop = false): THREE.Group | null {
    const visual = this.fittedAsset(assetId, width, 'horizontal', 'ground');
    if (!visual) return null;
    const placement = new THREE.Group(); placement.name = `asset-placement-${assetId}`;
    placement.position.copy(V(position)); placement.rotation.y = yaw; placement.add(visual); this.world.add(placement);
    placement.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh) {
        object.castShadow = !backdrop; object.receiveShadow = !backdrop;
        if (!backdrop) this.collisionMeshes.push(object);
      }
    });
    return placement;
  }

  private installPanorama(course: Course): number {
    const biomes = course.biomes?.length ? course.biomes : [{
      id: 'meadow', name: '정원', start: 0, end: Math.max(40, course.height), center: { ...course.start },
      kind: 'grass' as const, foods: ['fly' as const], sky: '#dce8ce', color: '#749d4c',
    }];
    let placed = 0;
    const dummy = new THREE.Object3D();
    for (const [zone, biome] of biomes.entries()) {
      let seed = (0x5f3759df ^ Math.imul(zone + 1, 0x27d4eb2d)) >>> 0;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
      const span = biome.end - biome.start;
      const addBackdrop = (name: string, geometry: THREE.BufferGeometry, color: string, position: THREE.Vector3, scale: THREE.Vector3) => {
        const mat = material(color, .98); this.ownedMaterials.add(mat);
        const object = this.mesh(geometry, mat, this.world, position); object.name = `biome-${biome.id}-${name}`;
        object.scale.copy(scale); object.castShadow = false; object.receiveShadow = false; placed++;
        return object;
      };
      // Meadow woods: use the trees only in the grassland zones, so later themes
      // get silhouettes that belong to their biome instead of repeating treetops.
      if (biome.kind === 'grass') {
        const count = 42;
        const trunkMat = material('#70563d', .98), crownMat = material('#557b46', .98);
        this.ownedMaterials.add(trunkMat); this.ownedMaterials.add(crownMat);
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .22, 1, 5), trunkMat, count);
        const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), crownMat, count);
        trunks.name = `panorama-trees-${biome.id}`; crowns.name = `panorama-canopies-${biome.id}`;
        trunks.castShadow = crowns.castShadow = false; trunks.receiveShadow = crowns.receiveShadow = false;
        trunks.frustumCulled = crowns.frustumCulled = false;
        for (let i = 0; i < count; i++) {
          const angle = i / count * Math.PI * 2 + zone * .28 + (random() - .5) * .28;
          const radius = 50 + random() * 28, x = biome.center.x + Math.cos(angle) * radius, z = biome.center.z + Math.sin(angle) * radius;
          const height = 4.5 + random() * 3.8;
          dummy.position.set(x, biome.start - 1 + height * .34, z); dummy.scale.set(.26 + random() * .16, height * .68, .26); dummy.rotation.y = random() * Math.PI; dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
          dummy.position.set(x, biome.start - 1 + height * .78, z);
          const canopy = 2.1 + random() * 1.5; dummy.scale.set(canopy, canopy * (.82 + random() * .35), canopy * (.8 + random() * .5)); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
          const shade = .78 + random() * .36; crowns.setColorAt(i, new THREE.Color(shade, shade, shade));
        }
        trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
        if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
        this.world.add(trunks, crowns); placed += count;
      }

      if (biome.kind === 'rock') {
        const colors = biome.id === 'mountain' ? ['#7f8c92', '#9ca7a5', '#687b82'] : ['#878779', '#a4a08f', '#74776c'];
        const peaks = biome.id === 'mountain' ? 12 : 9;
        for (let i = 0; i < peaks; i++) {
          const angle = i * Math.PI * 2 / peaks + zone * .29 + (random() - .5) * .22;
          const radius = 43 + random() * 22, height = span * (.48 + random() * .32);
          addBackdrop('cliff', new THREE.IcosahedronGeometry(1, 1), colors[i % colors.length],
            new THREE.Vector3(biome.center.x + Math.cos(angle) * radius, biome.start + height * .38, biome.center.z + Math.sin(angle) * radius),
            new THREE.Vector3(7 + random() * 6, height, 7 + random() * 6));
        }
      } else if (biome.kind === 'petal' || biome.kind === 'flower') {
        const colors = biome.id === 'dawn' ? ['#f3a3a0', '#f4bd88', '#f7d3a1'] : ['#de91ad', '#f0b3c1', '#e9a1b7'];
        for (let i = 0; i < 14; i++) {
          const angle = i * Math.PI * 2 / 14 + zone * .3, radius = 30 + random() * 20;
          const petal = addBackdrop('giant-petal', new THREE.IcosahedronGeometry(1, 0), colors[i % colors.length],
            new THREE.Vector3(biome.center.x + Math.cos(angle) * radius, biome.start + span * (.18 + random() * .3), biome.center.z + Math.sin(angle) * radius),
            new THREE.Vector3(4.5 + random() * 2.8, span * (.28 + random() * .12), 1.7 + random() * .8));
          petal.rotation.set(.1 + random() * .35, -angle, Math.cos(angle * 2) * .18);
        }
      } else if (biome.kind === 'branch') {
        if (biome.id === 'roots') {
          for (let i = 0; i < 18; i++) {
            const angle = i * Math.PI * 2 / 18 + .2, radius = 24 + random() * 18, length = 12 + random() * 15;
            const root = addBackdrop('hanging-root', new THREE.ConeGeometry(1, 1, 6), '#75634f',
              new THREE.Vector3(biome.center.x + Math.cos(angle) * radius, biome.start + span * .68, biome.center.z + Math.sin(angle) * radius),
              new THREE.Vector3(.8 + random() * .8, length, .8 + random() * .8));
            root.rotation.x = Math.PI;
          }
        } else {
          for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI * 2 / 10 + zone * .27, radius = 32 + random() * 17, height = span * (1.1 + random() * .3);
            const trunk = addBackdrop('giant-trunk', new THREE.CylinderGeometry(.55, 1, 1, 7), '#654b35',
              new THREE.Vector3(biome.center.x + Math.cos(angle) * radius, biome.start + span * .37, biome.center.z + Math.sin(angle) * radius),
              new THREE.Vector3(1, height, 1));
            trunk.rotation.z = (random() - .5) * .26; trunk.rotation.x = (random() - .5) * .18;
            const branch = addBackdrop('giant-branch', new THREE.CylinderGeometry(.25, .7, 1, 6), '#74583c',
              trunk.position.clone().add(new THREE.Vector3(Math.cos(angle + .8) * 6, height * .14, Math.sin(angle + .8) * 6)),
              new THREE.Vector3(.75, height * .34, .75));
            branch.rotation.z = -.92; branch.rotation.y = angle;
          }
        }
      } else if (biome.kind === 'cloud') {
        const cloudMaterial = new THREE.MeshStandardMaterial({ color: '#f2f7ff', roughness: 1, flatShading: true, transparent: true, opacity: .72, depthWrite: false });
        this.ownedMaterials.add(cloudMaterial);
        const cloudPuffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cloudMaterial, 48);
        cloudPuffs.name = 'biome-cloud-shelves'; cloudPuffs.castShadow = cloudPuffs.receiveShadow = false; cloudPuffs.frustumCulled = false;
        for (let i = 0; i < 48; i++) {
          const angle = i * Math.PI * 2 / 12 + random() * .2, radius = 34 + Math.floor(i / 12) * 10 + random() * 6;
          dummy.position.set(biome.center.x + Math.cos(angle) * radius, biome.start + span * (.2 + Math.floor(i / 24) * .45) + random() * 4,
            biome.center.z + Math.sin(angle) * radius);
          const size = 3.5 + random() * 5; dummy.scale.set(size, 2.5 + random() * 3, size * (.7 + random() * .5));
          dummy.rotation.set(0, random() * Math.PI, 0); dummy.updateMatrix(); cloudPuffs.setMatrixAt(i, dummy.matrix);
        }
        cloudPuffs.instanceMatrix.needsUpdate = true; this.world.add(cloudPuffs); placed += 48;
      } else if (biome.kind === 'star') {
        for (let i = 0; i < 9; i++) {
          const angle = i * Math.PI * 2 / 9, radius = 48 + random() * 24, size = 2 + random() * 3;
          addBackdrop('floating-meteor', new THREE.IcosahedronGeometry(1, 0), i % 2 ? '#766c69' : '#9b8b76',
            new THREE.Vector3(biome.center.x + Math.cos(angle) * radius, biome.start + span * (.2 + random() * .65), biome.center.z + Math.sin(angle) * radius),
            new THREE.Vector3(size, size * (.6 + random()), size * 1.3));
        }
      }
    }
    return placed;
  }

  private landscapeHeightAt(land: NonNullable<Course['landscapes']>[number], x: number, z: number): number {
    const resolution = land.resolution, stride = resolution + 1;
    const gx = clamp((x - land.position.x) / land.size.x + .5, 0, 1) * resolution;
    const gz = clamp((z - land.position.z) / land.size.z + .5, 0, 1) * resolution;
    const x0 = Math.min(resolution - 1, Math.floor(gx)), z0 = Math.min(resolution - 1, Math.floor(gz));
    const fx = gx - x0, fz = gz - z0;
    const h00 = land.heights[x0 * stride + z0], h10 = land.heights[(x0 + 1) * stride + z0];
    const h01 = land.heights[x0 * stride + z0 + 1], h11 = land.heights[(x0 + 1) * stride + z0 + 1];
    return land.position.y + THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00, h10, fx), THREE.MathUtils.lerp(h01, h11, fx), fz);
  }

  /** Distant low-poly trees and cloud bands keep the full climb framed in a living landscape. */
  private distantGarden(course: Course): void {
    const biomes = course.biomes?.length ? course.biomes : [{
      id: 'meadow', name: '정원', start: 0, end: Math.max(40, course.height), center: { ...course.start },
      kind: 'grass' as const, foods: ['fly' as const], sky: '#dce8ce', color: '#749d4c',
    }];
    const dummy = new THREE.Object3D();
    for (const [zone, biome] of biomes.entries()) {
      const random = (() => {
        let seed = (0x6d2b79f5 ^ Math.imul(zone + 1, 0x45d9f3b)) >>> 0;
        return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
      })();
      const span = Math.max(28, biome.end - biome.start), tiers = [.08, .6];
      const flower = biome.kind === 'petal' || biome.kind === 'flower';
      const stone = biome.kind === 'rock' || biome.kind === 'star';
      const cloud = biome.kind === 'cloud';
      if (!stone && !cloud) {
        const count = 30;
        const trunkMat = material(flower ? '#81724f' : '#735638', .98);
        const crownMat = material(flower ? new THREE.Color(biome.color).lerp(new THREE.Color('#fff1d2'), .2) : '#6f9853', .94);
        this.ownedMaterials.add(trunkMat); this.ownedMaterials.add(crownMat);
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .36, 1, 6), trunkMat, count);
        const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), crownMat, count);
        trunks.name = `distant-tree-trunks-${biome.id}`; crowns.name = `distant-tree-crowns-${biome.id}`;
        trunks.castShadow = crowns.castShadow = false; trunks.receiveShadow = crowns.receiveShadow = false;
        trunks.frustumCulled = crowns.frustumCulled = false;
        for (let i = 0; i < count; i++) {
          const tier = Math.floor(i / 15), angle = (i % 15) / 15 * Math.PI * 2 + zone * .57 + (random() - .5) * .16;
          const radius = (38 + random() * 24) * WORLD_SCALE, x = biome.center.x + Math.cos(angle) * radius, z = biome.center.z + Math.sin(angle) * radius;
          const height = (flower ? 4 + random() * 2 : 4.5 + random() * 3.2) * WORLD_SCALE;
          const baseY = biome.start + span * tiers[tier] - 1;
          dummy.position.set(x, baseY + height * .35, z); dummy.rotation.set(0, random() * Math.PI * 2, 0);
          const trunk = (flower ? .2 : .3 + random() * .2) * WORLD_SCALE;
          dummy.scale.set(trunk, height * .7, trunk); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
          dummy.position.set(x, baseY + height * .78, z);
          const width = (flower ? 2 + random() * 1.2 : 2.4 + random() * 1.7) * WORLD_SCALE;
          dummy.scale.set(width, flower ? 1.5 + random() * .7 : 2.1 + random() * 1.2, width * (.8 + random() * .35));
          dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
          const shade = .86 + random() * .2; crowns.setColorAt(i, new THREE.Color(shade, shade, shade));
        }
        trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
        if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
        this.world.add(trunks, crowns);
      }

      const puffCount = cloud ? 24 : 12;
      const cloudMat = new THREE.MeshStandardMaterial({ color: cloud ? '#f8fbff' : '#fff1df', roughness: 1,
        transparent: true, opacity: cloud ? .72 : .52, depthWrite: false, flatShading: true });
      this.ownedMaterials.add(cloudMat);
      const cloudMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5), cloudMat, puffCount);
      cloudMesh.name = `distant-clouds-${biome.id}`; cloudMesh.castShadow = false; cloudMesh.receiveShadow = false; cloudMesh.frustumCulled = false;
      for (let i = 0; i < puffCount; i++) {
        const tier = Math.floor(i / Math.max(1, puffCount / 3)), cluster = i % 3;
        const angle = cluster * Math.PI * 2 / 3 + zone * .41 + (random() - .5) * .24;
        const radius = (100 + random() * 34) * WORLD_SCALE, width = (2.1 + random() * 2.1) * WORLD_SCALE;
        dummy.position.set(biome.center.x + Math.cos(angle) * radius + (random() - .5) * 5 * WORLD_SCALE,
          biome.start + span * tiers[Math.min(1, tier)] + 11 * WORLD_SCALE + (random() - .5) * 4 * WORLD_SCALE,
          biome.center.z + Math.sin(angle) * radius + (random() - .5) * 5 * WORLD_SCALE);
        dummy.scale.set(width, (1.3 + random() * 1.1) * WORLD_SCALE, width * .72); dummy.rotation.set(0, random() * Math.PI, 0);
        dummy.updateMatrix(); cloudMesh.setMatrixAt(i, dummy.matrix);
      }
      cloudMesh.instanceMatrix.needsUpdate = true; this.world.add(cloudMesh);
    }
  }
  private pondBackdrop(): void {
    const waterMaterial = new THREE.MeshPhongMaterial({ color: '#60b7c0', specular: '#c7fbf1', shininess: 85,
      transparent: true, opacity: .86, depthWrite: false, side: THREE.DoubleSide });
    const lake = this.mesh(new THREE.CircleGeometry(230, 128), waterMaterial, this.world, new THREE.Vector3(0, -1.2, 0));
    lake.name = 'wide-pond-surround'; lake.rotation.x = -Math.PI / 2; lake.castShadow = false; lake.receiveShadow = false;
    const glintMaterial = new THREE.MeshBasicMaterial({ color: '#d7f7dc', transparent: true, opacity: .42, depthWrite: false });
    const glints = this.mesh(new THREE.TorusGeometry(1, .045, 4, 96), glintMaterial, this.world, new THREE.Vector3(0, -1.16, 0));
    glints.name = 'pond-water-ripple'; glints.rotation.x = Math.PI / 2; glints.scale.set(70, 46, 1);
    glints.castShadow = false; glints.receiveShadow = false;
    let seed = 0x31b72c;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const lilyGeometry = new THREE.CircleGeometry(1, 12, .22, Math.PI * 1.72); lilyGeometry.rotateX(-Math.PI / 2);
    const lilyMaterial = material('#86a94b', .84); this.ownedMaterials.add(lilyMaterial);
    const pads = new THREE.InstancedMesh(lilyGeometry, lilyMaterial, 30); pads.name = 'distant-pond-lily-pads';
    pads.castShadow = false; pads.receiveShadow = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 30; i++) {
      const angle = i * 2.399 + random() * .4, radius = 16 + random() * 60, size = .8 + random() * 1.8;
      dummy.position.set(Math.cos(angle) * radius, -.08 + random() * .025, Math.sin(angle) * radius);
      dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.scale.set(size, size, size); dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix);
    }
    pads.instanceMatrix.needsUpdate = true; this.world.add(pads);
  }

  private installEcosystemAssets(course: Course): number {
    if (!course.biomes || !['ecosystem-main-v3', 'ecosystem-main-v4', 'ecosystem-main-v5'].includes(course.id)) return 0;
    const land = course.landscapes?.find(item => item.zone === 0);
    const pads = new Map(course.platforms.map(platform => [platform.id, platform]));
    const atGround = (x: number, z: number) => land ? this.landscapeHeightAt(land, x, z) : 0;
    const atPad = (id: string, dx = 0, dz = 0): Vec | null => {
      const pad = pads.get(id); if (!pad) return null;
      return { x: pad.position.x + dx, y: pad.position.y + pad.size.y / 2, z: pad.position.z + dz };
    };
    let count = 0;
    const place = (asset: string, position: Vec | null, width: number, yaw = 0) => {
      if (!position) return;
      if (this.placeScenery(asset, position, width, yaw)) count++;
    };

    // The authored pond bank replaces the old flat water disk and ring. The gameplay
    // terrain mesh remains underneath as the actual collision/camera surface.
    if (land) {
      place('pond-basin', { x: -6, y: atGround(-6, -4), z: -4 }, 9.3, -.12);
      this.pondDecoration.forEach(object => { object.visible = false; });
      place('pond-lilies', { x: -6.8, y: atGround(-6.8, -4.2) + .22, z: -4.2 }, 2.7, .35);
      place('pond-reed', { x: -11, y: atGround(-11, -1.2), z: -1.2 }, 3.3, .28);
      place('pond-stones', { x: -10.5, y: atGround(-10.5, -7), z: -7 }, 3.4, -.42);
      place('pond-root-bridge', { x: -1.8, y: atGround(-1.8, 1.8), z: 1.8 }, 5.1, -.3);
    }

    const firstLeaf = atPad('pad-1');
    if (firstLeaf) { firstLeaf.y -= .015; place('pond-leaf', firstLeaf, 4.35, .08); }
    place('meadow-mushrooms', atPad('basin-grass', 5.5, 2.2), 3.1, .25);
    place('meadow-flower-patch', atPad('basin-grass', -5.1, 2.1), 4.2, -.25);
    place('meadow-boulders', atPad('basin-rocks', 1.05, 3.2), 3.5, .32);

    // One large flower grows above the authored crown as its central landmark.
    place('meadow-flower', { x: 47, y: course.id === 'ecosystem-main-v5' ? 82.7 * 3.5 : 82.7, z: -31 }, 4.6, .15);
    place('upper-branch', atPad('pad-18'), 6.2, .14);
    place('upper-ridge', atPad('pad-24'), 6.5, -.18);
    place('upper-clouds', atPad('pad-29'), 7.1, .12);
    place('upper-star', atPad('summit'), 7.7, .05);
    return count;
  }

  async load(course: Course): Promise<void> {
    const loadVersion = ++this.modelLoadVersion;
    this.camera.far = Math.max(330, course.height + 130);
    this.camera.updateProjectionMatrix();
    this.canvas.dataset.assetState = 'loading';
    this.canvas.dataset.course=course.id;
    this.world.traverse(o => {
      if ((o instanceof THREE.Mesh || o instanceof THREE.Points) && !this.grassShapes.includes(o.geometry) && !o.userData.sharedAsset) o.geometry.dispose();
    });
    this.ownedMaterials.forEach(m => m.dispose()); this.ownedMaterials.clear();
    this.scene.remove(this.world); this.world = new THREE.Group(); this.scene.add(this.world);
    this.flies.clear(); this.collisionMeshes.length = 0; this.waterSurfaces.length = 0;
    this.platformRoots.clear(); this.pondDecoration.length = 0;
    this.biomeColors = course.biomes?.map(b => b.color) ?? [];
    this.skyColors = course.biomes?.map(b => new THREE.Color(b.sky)) ?? [];
    this.skyZenithColors = course.biomes?.map(b => {
      const color = new THREE.Color(b.sky);
      return b.id === 'stars' ? color.clone().multiplyScalar(.65) : color.clone().lerp(new THREE.Color('#92b8d5'), .28);
    }) ?? [];
    this.stars = null;
    if (course.biomes) {
      const points: number[] = [];
      const starHeightScale = course.id === 'ecosystem-main-v5' ? 3.5 : 1;
      for (let i = 0; i < 180; i++) points.push(Math.sin(i * 18.7) * 80, (148 + i % 43 * 1.5) * starHeightScale, Math.cos(i * 7.3) * 80);
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const mat = new THREE.PointsMaterial({ color: '#fff3cf', size: .16, transparent: true, opacity: .9 });
      this.ownedMaterials.add(mat);
      this.stars = new THREE.Points(geometry, mat); this.world.add(this.stars);
    }
    for (const p of course.platforms) this.platform(p, !!course.biomes);
    const terrainAccents = ['#9aac66', '#abc276', '#b2a78e', '#b77986', '#aa9b68', '#778794', '#f7f8fc', '#85754c'];
    for (const land of course.landscapes ?? []) {
      const data = landscapeMesh(land), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3)); geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const base = new THREE.Color(this.biomeColors[land.zone] ?? '#8c9d74'), accent = new THREE.Color(terrainAccents[land.zone] ?? '#bac78a');
      const colors: number[] = [];
      for (let i = 0; i < data.vertices.length; i += 3) {
        const x = data.vertices[i], y = data.vertices[i + 1], z = data.vertices[i + 2];
        const mottling = .12 + .24 * (.5 + .5 * Math.sin(x * .67 + z * .29) * Math.cos(z * .51 - x * .36));
        const heightTint = clamp(y / 12, 0, .16);
        const color = base.clone().lerp(accent, mottling + heightTint);
        colors.push(color.r, color.g, color.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const surfaceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, side: THREE.DoubleSide });
      this.ownedMaterials.add(surfaceMaterial);
      const surface = this.mesh(geometry, surfaceMaterial, this.world, V(land.position));
      surface.receiveShadow = false;
      this.collisionMeshes.push(surface);
      this.grassOnLandscape(this.world, land, course);
      this.floraOnLandscape(this.world, land, course);
      this.flowersOnIsland(this.world, land, course);
    }
    if (course.mode === 'main' && course.landscapes?.some(land => land.zone === 0)) this.pondBackdrop();
    for (const a of course.anchors) this.makeFly(a);
    for (const rock of course.rocks ?? []) {
      const stone = this.mesh(new THREE.IcosahedronGeometry(1, 0), material('#9a9c87'), this.world, V(rock.position));
      stone.scale.copy(V(rock.size)); this.collisionMeshes.push(stone);
    }
    for (const solid of course.solids ?? []) {
      const m = this.mesh(new THREE.CylinderGeometry(solid.radius, solid.radius, solid.height, 16),
        solid.kind === 'trunk' ? this.mats.bark : material(solid.kind === 'rock' ? '#756f63' : solid.kind === 'grass' ? '#648d3c' : '#71954a'), this.world, V(solid.position));
      if (solid.direction) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(solid.direction).normalize());
      this.collisionMeshes.push(m);
    }
    for (const volume of course.waters ?? []) {
      const group = new THREE.Group(); group.position.copy(V(volume.position)); this.world.add(group);
      const waterMat = new THREE.MeshPhongMaterial({ color: '#78c9de', specular: '#f3ffff', shininess: 120,
        transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
      const surface = this.mesh(new THREE.SphereGeometry(volume.radius, 32, 24), waterMat, group);
      surface.castShadow = false; surface.receiveShadow = false;
      const glintMat = new THREE.MeshBasicMaterial({ color: '#e0f9ff', transparent: true, opacity: .68, depthWrite: false });
      for (let j = 0; j < 2; j++) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const a = .45 + i / 10 * (.5 - j * .2);
          points.push(new THREE.Vector3(Math.cos(a) * volume.radius * .72, Math.sin(a) * volume.radius,
            Math.sqrt(Math.max(0, volume.radius ** 2 - (Math.cos(a) * volume.radius * .72) ** 2 - (Math.sin(a) * volume.radius) ** 2))));
        }
        const glint = this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, .026 - j * .01, 5, false), glintMat, group);
        glint.castShadow = false; glint.receiveShadow = false;
      }
      const bubbles: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const bubble = this.mesh(new THREE.SphereGeometry(.07 + i % 3 * .025, 8, 6), glintMat, group);
        bubble.castShadow = false; bubble.receiveShadow = false; bubbles.push(bubble);
      }
      this.waterSurfaces.push({ volume, surface, bubbles });
    }
    if (course.id === 'garden-main-v1') {
      const trunk = this.mesh(new THREE.CylinderGeometry(.8, .8, 176, 16), this.mats.bark, this.world, new THREE.Vector3(0, 88, 0));
      this.collisionMeshes.push(trunk);
      for (let i = 0; i < 18; i++) {
        const y = 9 + i * 9, angle = i * 2.2;
        const leaf = this.mesh(new THREE.IcosahedronGeometry(1, 0), material(COLORS[Math.min(5, Math.floor(y / 30))]), this.world, new THREE.Vector3(Math.sin(angle) * 2.2, y, Math.cos(angle) * 2.2));
        leaf.scale.set(2.5, .28, 1.7); leaf.rotation.set(.18, angle, -.18);
      }
    }
    this.sceneReady = false; this.yaw = .52; this.renderedYaw = .52; this.pitch = .36; this.distance = course.route ? 12 : 8;
    this.landing = -1; this.missUntil = 0;
    this.hopPhase = 0; this.lastAnimationTime = 0;
    await this.modelAssetsReady;
    if (loadVersion !== this.modelLoadVersion) return;
    const sceneryInstalled = this.installEcosystemAssets(course) + this.installPanorama(course);
    this.canvas.dataset.frogAsset = 'procedural';
    this.canvas.dataset.proceduralFrogVisible = String(this.frogBody.visible);
    this.canvas.dataset.foodAssets = '0';
    this.canvas.dataset.proceduralFoods = String(this.flies.size);
    this.canvas.dataset.ecologyAssets = String(sceneryInstalled);
    this.canvas.dataset.assetState = 'ready';
    this.canvas.dataset.assetInstances = String(sceneryInstalled);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  quality(low: boolean): void {
    this.requestedLowQuality = low;
    this.adaptiveLowQuality = false;
    this.slowFrameSeconds = 0;
    this.applyQuality();
  }
  private applyQuality(): void {
    const low = this.requestedLowQuality || this.adaptiveLowQuality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.5));
    this.renderer.shadowMap.enabled = !low;
    this.canvas.dataset.qualityMode = low ? 'low' : 'high';
    this.resize();
  }
  private adaptQualityToFrameTime(dt: number): void {
    if (this.requestedLowQuality || this.adaptiveLowQuality || document.visibilityState === 'hidden') return;
    if (dt > 1 / 34) this.slowFrameSeconds += Math.min(dt, .05);
    else this.slowFrameSeconds = Math.max(0, this.slowFrameSeconds - dt * .75);
    if (this.slowFrameSeconds >= 1.25) {
      this.adaptiveLowQuality = true;
      this.applyQuality();
    }
  }
  aim(pointerX: number, pointerY: number): { camera: Vec; direction: Vec } {
    this.raycaster.setFromCamera(new THREE.Vector2(pointerX, pointerY), this.camera);
    return { camera: this.raycaster.ray.origin, direction: this.raycaster.ray.direction };
  }

  react(type: string, now: number, point?: Vec): void {
    if (type === 'land') { this.landing = now; this.squash = 1; }
    if (type === 'miss' || type === 'release' || type === 'blocked') {
      this.missUntil = now + (type === 'miss' ? .1 : .14);
      if (point) this.lastTongueEnd.copy(V(point));
    }
  }

  private updateSlimeDrops(sim: Simulation, p: THREE.Vector3, velocity: THREE.Vector3, mouth: THREE.Vector3,
    speed: number, dt: number, now: number): void {
    if (sim.attached && now >= this.nextSlimeDrop) {
      const index = this.slimeDropCursor++;
      const drop = this.slimeDrops[index % this.slimeDrops.length];
      if (index % 3 === 0) {
        const anchor = V(sim.anchorPosition(sim.attached)!);
        const t = .22 + ((index * 37) % 57) / 100;
        drop.mesh.position.lerpVectors(mouth, anchor, t);
        drop.mesh.position.y -= .035;
      } else {
        const side = index % 2 ? 1 : -1;
        drop.mesh.position.copy(this.frogBody.localToWorld(new THREE.Vector3(side * (.15 + (index % 3) * .055), -.22, -.16)));
      }
      drop.velocity.set(-velocity.x * .035 + Math.sin(index * 2.3) * .28,
        -.42 - Math.min(.55, speed * .018), -velocity.z * .035 + Math.cos(index * 1.7) * .28);
      drop.maxLife = .48 + (index % 4) * .09;
      drop.life = drop.maxLife;
      const size = .042 + Math.min(.025, speed * .0012);
      drop.mesh.scale.set(size, size * (1.1 + index % 3 * .22), size);
      drop.mesh.visible = true;
      this.nextSlimeDrop = now + Math.max(.17, .34 - Math.min(.14, speed * .006));
    }
    for (const drop of this.slimeDrops) {
      if (drop.life <= 0) continue;
      drop.life = Math.max(0, drop.life - dt);
      drop.velocity.y -= 2.2 * dt;
      drop.mesh.position.addScaledVector(drop.velocity, dt);
      const fade = clamp(drop.life / drop.maxLife, 0, 1);
      drop.mesh.scale.multiplyScalar(.985 + fade * .015);
      if (!drop.life || drop.mesh.position.y < p.y - 2.3) drop.mesh.visible = false;
    }
  }

  update(sim: Simulation, target: Anchor | null, dt: number, now: number, motion: boolean): void {
    const p = V(sim.position), v = V(sim.velocity), speed = v.length();
    const sky = this.skyColors[sim.zone];
    if (sky) {
      if (!this.sceneReady) (this.scene.background as THREE.Color).copy(sky);
      else (this.scene.background as THREE.Color).lerp(sky, 1 - Math.exp(-dt * 1.5));
      const zenith = this.skyZenithColors[sim.zone] ?? sky;
      const horizon = sim.zone === 7 ? sky.clone().lerp(new THREE.Color('#625273'), .48) : sky.clone().lerp(new THREE.Color('#f5e5c7'), .3);
      const blend = this.sceneReady ? 1 - Math.exp(-dt * 1.25) : 1;
      this.skyDomeMaterial.uniforms.horizon.value.lerp(horizon, blend);
      this.skyDomeMaterial.uniforms.zenith.value.lerp(zenith, blend);
      (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
      (this.scene.fog as THREE.FogExp2).density = sim.zone >= 6 ? .003 : .008;
    } else {
      (this.scene.background as THREE.Color).set('#dce4d0');
      (this.scene.fog as THREE.FogExp2).color.set('#dce4d0');
      (this.scene.fog as THREE.FogExp2).density = .008;
    }
    if (this.stars) this.stars.visible = sim.position.y >= 140;
    const animationDt = clamp(now - this.lastAnimationTime, 0, .1); this.lastAnimationTime = now;
    const horizontalSpeed = Math.hypot(v.x, v.z);
    const running = sim.grounded && horizontalSpeed > .2;
    if (running) this.hopPhase += animationDt * (4 + horizontalSpeed * 2);
    const hop = sim.grounded ? Math.sin(this.hopPhase) * Math.min(1, horizontalSpeed / 2) : 0;
    const water = sim.water;
    for (const { volume, surface, bubbles } of this.waterSurfaces) {
      (surface.material as THREE.MeshPhongMaterial).opacity = this.camera.position.distanceTo(V(volume.position)) < volume.radius ? .08 : .2;
      bubbles.forEach((bubble, i) => bubble.position.set(Math.sin(i * 2.4) * volume.radius * .38,
        (((now * .25 + i / 6) % 1) - .5) * volume.radius * 1.6, Math.cos(i * 2.4) * volume.radius * .38));
    }
    const launchState = sim.dash?.kind === 'launch' ? sim.dash : undefined;
    const swingState = launchState ? { remaining: launchState.remaining, duration: launchState.duration ?? .3,
      direction: launchState.direction, kind: 'eat-swing' as const } : undefined;
    const feedbackState = swingState ?? sim.impulse;
    const eatSwing = !!launchState || swingState?.kind === 'eat-swing';
    const swingProgress = feedbackState ? clamp(1 - feedbackState.remaining / feedbackState.duration, 0, 1) : 0;
    const recoilStroke = eatSwing ? Math.sin(clamp(swingProgress / .72, 0, 1) * Math.PI) : 0;
    this.swingBurst.visible = !!eatSwing && swingProgress < .92;
    if (eatSwing && feedbackState) {
      const direction = V(feedbackState!.direction);
      const right = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > .96 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      this.mats.swing.opacity = (1 - swingProgress) * .78;
      this.mats.swing.color.set('#f7eab2');
      this.swingBurst.children.forEach((leaf, i) => {
        const angle = i * Math.PI * 2 / this.swingBurst.children.length + swingProgress * .8;
        const spread = .18 + swingProgress * .7;
        leaf.position.copy(p).addScaledVector(direction, -.24 + swingProgress * .22)
          .addScaledVector(right, Math.cos(angle) * spread).add(new THREE.Vector3(0, Math.sin(angle) * spread, 0));
        leaf.rotation.set(Math.sin(angle) * .9, angle, Math.cos(angle) * .8);
        leaf.scale.setScalar((1 - swingProgress) * (.72 + .28 * Math.sin(angle * 2)));
      });
    }
    if (target && sim.flyLife(target.id).phase !== 'alive') target = null;
    const meals = sim.course.anchors.map(anchor => ({ anchor, life: sim.flyLife(anchor.id) }))
      .filter(meal => meal.life.remaining > 0 && meal.life.elapsed < FLY_TIMING.retract + FLY_TIMING.swallow);
    const pulling = meals.filter(meal => meal.life.phase === 'retracting').sort((a, b) => a.life.elapsed - b.life.elapsed)[0];
    let open = 0, gulp = 0;
    for (const meal of meals) {
      const t = meal.life.elapsed;
      open = Math.max(open, t < FLY_TIMING.retract ? .2 + .8 * Math.sin(clamp(t / .18, 0, 1) * Math.PI / 2) : 1 - clamp((t - FLY_TIMING.retract) / .1, 0, 1));
      if (t >= FLY_TIMING.retract) gulp = Math.max(gulp, Math.sin(clamp((t - FLY_TIMING.retract) / FLY_TIMING.swallow, 0, 1) * Math.PI));
    }
    this.frog.position.copy(p);
    const look = sim.anchor ? V(sim.anchor.position).sub(p) : pulling ? V(sim.anchorPosition(pulling.anchor.id)!).sub(p) : speed > .3 ? v.clone() : new THREE.Vector3(0, 0, 1);
    const goalYaw = Math.atan2(look.x, look.z);
    let diff = goalYaw - this.frog.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.frog.rotation.y += diff * Math.min(1, dt * 10);
    const tilt = sim.grounded ? 0 : clamp(speed / 18, 0, .55);
    this.frogBody.rotation.x = THREE.MathUtils.lerp(this.frogBody.rotation.x, sim.attached ? -.25 : water ? -.08 - Math.min(.3, speed * .04) : eatSwing && swingState ? -Math.asin(clamp(swingState.direction.y, -1, 1)) * .48 : v.y > 0 ? -.15 - tilt : .1 + tilt * .45, Math.min(1, dt * 9));
    this.frogBody.rotation.z = motion && !sim.grounded ? Math.sin(now * 2.3) * Math.min(.22, speed * .012)
      + (eatSwing ? (feedbackState?.direction.x ?? 0) * recoilStroke * .12 : 0) : 0;
    const bounce = Math.max(0, 1 - (now - this.landing) / .26) * this.squash;
    this.frogBody.scale.set(1 + bounce * .15 + gulp * .08 + recoilStroke * .08,
      1 - bounce * .25 + gulp * .06 - recoilStroke * .12,
      1 + bounce * .12 + recoilStroke * .26);
    this.frogBody.position.y = Math.max(0, hop) * .11;
    this.frogBody.scale.y += hop * .08;
    this.frogMouth.scale.set(1.15 + open * .2, .07 + open * .5, .2);
    this.frogMouth.position.y = -.075 - open * .025;
    this.frogMouth.visible = open > .12;
    this.frogMouthLine.visible = open <= .12;
    this.frogJaw.position.y = -.1 - open * .07;
    this.frogBelly.scale.set(1.05 + gulp * .16, .63 + gulp * .13, .93 + gulp * .18);
    this.cheeks.forEach(cheek => cheek.scale.set(1 + gulp * .55, .8 + gulp * .25, .75 + gulp * .4));
    this.blink = Math.sin(now * 1.1) > .995 ? .14 : 1;
    this.pupils.forEach(eye => { eye.scale.y = 1.15 * this.blink * (1 - gulp * .35); });
    this.frogLegs.forEach((limb, i) => {
      const { root, lower, foot, front, side } = limb;
      const phase = this.hopPhase + (front ? Math.PI : 0) + (side < 0 ? Math.PI : 0);
      const gait = Math.sin(phase);
      let hip = front ? -.28 : .42, knee = front ? -.38 : -.22, ankle = 0;
      if (water) {
        hip = Math.sin(now * 9 + (front ? 0 : Math.PI)) * (front ? .68 : .9);
        knee = -.3 + Math.max(0, Math.sin(now * 9 + (front ? Math.PI : 0))) * .9;
        ankle = Math.sin(now * 9 + i * Math.PI) * .2;
      } else if (running) {
        hip = (front ? .28 : -.62) + gait * (front ? .58 : .92);
        knee = (front ? -.2 : .48) + Math.max(0, -gait) * (front ? .48 : .88);
        ankle = -gait * .16;
      } else if (sim.attached) {
        const pedal = Math.sin(now * 7.5 + (front ? 0 : Math.PI) + (side < 0 ? Math.PI : 0));
        hip = front ? -.92 + pedal * .18 : .58 + pedal * .58;
        knee = front ? -.48 + Math.max(0, pedal) * .2 : -.1 + Math.max(0, -pedal) * .68;
        ankle = pedal * .14;
      } else if (eatSwing) {
        const recoil = 1 - clamp(swingProgress / .3, 0, 1);
        hip = front ? -.62 * recoil + .42 + recoilStroke * .42 : .72 * recoil + .38 - recoilStroke * .62;
        knee = front ? -.3 + recoil * .35 - recoilStroke * .14 : -.12 + recoil * .22 + recoilStroke * .48;
        ankle = -.12 + swingProgress * .16;
      } else if (swingState) {
        hip = front ? .8 : .7;
        knee = front ? -.24 : -.48;
        ankle = -.16;
      } else if (!sim.grounded) {
        const tuck = v.y > 0 ? 1 : 0;
        hip = front ? -.58 - tuck * .3 : .48 + tuck * .48;
        knee = front ? -.62 + tuck * .32 : -.18 - tuck * .3;
        ankle = clamp(-v.y * .018, -.2, .2);
      }
      root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, hip, Math.min(1, animationDt * 12));
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, side * (front ? -.12 : .16) + (running ? side * gait * .13 : 0), Math.min(1, animationDt * 12));
      lower.rotation.x = THREE.MathUtils.lerp(lower.rotation.x, knee, Math.min(1, animationDt * 14));
      lower.rotation.z = THREE.MathUtils.lerp(lower.rotation.z, side * (front ? .08 : -.06), Math.min(1, animationDt * 12));
      foot.rotation.x = THREE.MathUtils.lerp(foot.rotation.x, ankle, Math.min(1, animationDt * 14));
      foot.rotation.z = THREE.MathUtils.lerp(foot.rotation.z, side * (running ? -.12 : 0), Math.min(1, animationDt * 12));
    });
    this.frog.updateMatrixWorld(true);
    const mouth = this.frogBody.localToWorld(new THREE.Vector3(0, -.075 - open * .035, .78));
    for (const [id, fly] of this.flies) {
      const a = fly.userData.anchor as Anchor;
      const point = sim.anchorPosition(id)!;
      const life = sim.flyLife(id);
      fly.visible = V(point).distanceTo(p) < 36 && Math.abs(point.y - p.y) < 26;
      fly.position.copy(V(point));
      fly.rotation.y = Math.atan2(p.x - point.x, p.z - point.z);
      fly.rotation.z = 0;
      const struggling = sim.attached === id || life.phase === 'retracting';
      fly.traverse(child => {
        if (child.userData.wing) child.rotation.z = Number(child.userData.baseWingRotation ?? 0)
          + child.userData.wing * (Math.sin(now * (struggling ? 96 : 42)) * (struggling ? .85 : .5) + (struggling ? Math.sin(now * 37) * .18 : 0));
        if (child.userData.pupil) { child.scale.setScalar(struggling ? .63 : 1); child.position.y = struggling ? .035 : .018; }
        if (child.userData.brow) child.rotation.z = child.userData.brow * (struggling ? -.5 : .08);
        if (child.userData.leg) child.rotation.x = struggling ? Math.sin(now * 29 + child.userData.offset * 2) * .9 : .05;
        if (child.userData.mouth) child.scale.set(1, struggling ? 1.3 : .15, struggling ? .65 : .4);
        if (child.userData.sweat) { child.visible = struggling; child.position.y = .2 - (now * 1.8 % .25); }
      });
      fly.userData.struggling = struggling;
      const baseScale = Number(fly.userData.baseScale ?? 1);
      fly.scale.setScalar(baseScale * (id === target?.id ? 1.08 : 1));
      if (life.phase === 'hidden') fly.visible = false;
      else if (life.phase === 'retracting') {
        const t = clamp(life.elapsed / FLY_TIMING.retract, 0, 1);
        const eased = t * t * (3 - 2 * t);
        fly.position.lerp(mouth, eased); fly.position.y += Math.sin(t * Math.PI) * .15;
        fly.rotation.z = Math.sin(t * Math.PI) * .5;
        fly.scale.setScalar(baseScale * (1 - THREE.MathUtils.smoothstep(t, .7, 1)));
      } else if (life.phase === 'respawning') {
        const t = 1 - life.remaining / FLY_TIMING.appear;
        fly.scale.setScalar(baseScale * Math.sin(t * Math.PI / 2) * (1 + Math.sin(t * Math.PI) * .15));
        fly.rotation.z = Math.sin(t * Math.PI * 2) * .15;
      }
    }
    if (sim.anchor) {
      this.lastTongueEnd.copy(V(sim.anchor.position));
      this.tongue.update(mouth, this.lastTongueEnd, Math.min(1.2, Math.max(0, sim.ropeLength - mouth.distanceTo(this.lastTongueEnd)) * .5));
      const slimeEnd = this.lastTongueEnd.clone();
      const toward = slimeEnd.clone().sub(mouth).normalize();
      const side = new THREE.Vector3().crossVectors(toward, new THREE.Vector3(0, 1, 0)).normalize();
      this.slimeTongue.update(mouth.clone().addScaledVector(side, .045).add(new THREE.Vector3(0, -.025, 0)),
        slimeEnd.addScaledVector(side, .045), Math.min(1.24, Math.max(0, sim.ropeLength - mouth.distanceTo(slimeEnd)) * .5));
    } else if (pulling) {
      const fly = this.flies.get(pulling.anchor.id)!;
      this.tongue.update(mouth, fly.position, .1 * Math.sin(pulling.life.elapsed / FLY_TIMING.retract * Math.PI), Math.max(.15, fly.scale.x));
      this.slimeTongue.update(mouth.clone().add(new THREE.Vector3(.045, -.025, 0)), fly.position.clone().add(new THREE.Vector3(.045, 0, 0)), .1 * Math.sin(pulling.life.elapsed / FLY_TIMING.retract * Math.PI), Math.max(.15, fly.scale.x));
    } else {
      this.slimeTongue.mesh.visible = false;
      if (now < this.missUntil) this.tongue.update(mouth, new THREE.Vector3().lerpVectors(mouth, this.lastTongueEnd, Math.max(0, (this.missUntil - now) / .14)), 0);
      else this.tongue.mesh.visible = false;
    }
    this.updateSlimeDrops(sim, p, v, mouth, speed, dt, now);
    this.targetRing.visible = !!target && target.id !== sim.attached;
    if (target) { this.targetRing.position.copy(V(target.position)); this.targetRing.quaternion.copy(this.camera.quaternion); }
    this.attachedRing.visible = !!sim.anchor;
    if (sim.anchor) { this.attachedRing.position.copy(V(sim.anchor.position)); this.attachedRing.quaternion.copy(this.camera.quaternion); }
    const authored = !!sim.course.route;
    const goalFocus = p.clone().add(new THREE.Vector3(0, authored ? 1.9 : 1.05, 0));
    if (sim.anchor) goalFocus.lerp(V(sim.anchor.position), .1);
    // Retain the normal camera lead and follow response from before center-aim controls.
    const cameraLead = v.clone().multiplyScalar(sim.anchor ? .022 : .038);
    cameraLead.x = clamp(cameraLead.x, -.42, .42);
    cameraLead.z = clamp(cameraLead.z, -.42, .42);
    cameraLead.y = clamp(cameraLead.y, -.32, .62);
    goalFocus.add(cameraLead);
    if (!this.sceneReady) { this.focus.copy(goalFocus); this.sceneReady = true; }
    else this.focus.lerp(goalFocus, 1 - Math.exp(-dt * (8 + Math.min(10, speed * .3))));
    const wanted = (sim.anchor ? clamp(sim.ropeLength * .62 + (authored ? 5.2 : 3.4), authored ? 9.5 : 7.5, authored ? 12.5 : 10.5) : authored ? 10.5 : 8)
      + Math.min(.45, speed * .018);
    this.distance = THREE.MathUtils.lerp(this.distance, wanted, 1 - Math.exp(-dt * 2.8));
    const drift = motion && !sim.attached ? Math.sin(now * .42) * .026 : 0;
    // Keep biome transitions from rotating the view underneath camera-relative WASD.
    const yaw = this.yaw + drift;
    this.renderedYaw = yaw;
    const pitch = this.pitch + (motion && !sim.attached ? Math.sin(now * .31 + 1.4) * .009 : 0);
    const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(offset);
    this.camera.lookAt(this.focus);
    this.updateFrogOcclusion(dt);
    const speedFactor = clamp((speed - 3) / 22, 0, 1);
    const wantedFov = 60 + speedFactor * 3.5 + (sim.attached && horizontalSpeed > 5 ? .6 : 0);
    this.cameraFov = THREE.MathUtils.lerp(this.cameraFov, wantedFov, 1 - Math.exp(-dt * 2.6));
    if (Math.abs(this.camera.fov - this.cameraFov) > .05) {
      this.camera.fov = this.cameraFov;
      this.camera.updateProjectionMatrix();
    }
    const lateralSpeed = v.x * Math.cos(yaw) - v.z * Math.sin(yaw);
    const wantedBank = motion ? clamp(-lateralSpeed * .0014, -.035, .035) : 0;
    this.cameraBank = THREE.MathUtils.lerp(this.cameraBank, wantedBank, 1 - Math.exp(-dt * 3.2));
    this.camera.rotateZ(this.cameraBank);
    this.canvas.dataset.cameraYaw = yaw.toFixed(4);
    this.canvas.dataset.cameraPitch = this.pitch.toFixed(4);
    this.canvas.dataset.cameraX = this.camera.position.x.toFixed(4);
    this.canvas.dataset.cameraY = this.camera.position.y.toFixed(4);
    this.canvas.dataset.cameraZ = this.camera.position.z.toFixed(4);
    const attachedFly = sim.attached ? this.flies.get(sim.attached) : null;
    this.canvas.dataset.attachedFlyX = attachedFly?.position.x.toFixed(4) ?? '';
    this.canvas.dataset.attachedFlyY = attachedFly?.position.y.toFixed(4) ?? '';
    this.canvas.dataset.attachedFlyZ = attachedFly?.position.z.toFixed(4) ?? '';
    this.sun.target.position.copy(p); this.sun.position.copy(p).add(new THREE.Vector3(20, 30, 16)); this.sun.target.updateMatrixWorld();
    this.sunDisc.visible = sim.zone !== 7;
    this.sunDisc.position.copy(p).add(new THREE.Vector3(24, 20, -80));
    this.sunDisc.material.opacity = sim.zone >= 6 && sim.zone !== 7 ? .72 : .9;
    this.adaptQualityToFrameTime(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

