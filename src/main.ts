import RAPIER from '@dimforge/rapier3d-compat';
import './styles.css';
import { makeCourse, courseForSave } from './game/course';
import { Simulation, DT } from './game/simulation';
import { Input } from './game/input';
import { Store } from './game/storage';
import { parseBackup } from './game/backup';
import { Garden } from './render/garden';
import { Audio } from './render/audio';
import { Interface } from './ui/interface';
import { clamp, FOOD_NAMES, type Mode, type Session, type SaveState, type Anchor } from './game/types';

async function boot(): Promise<void> {
  await RAPIER.init();
  const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
  const store = new Store(); await store.init();
  const garden = new Garden(canvas);
  const input = new Input(canvas);
  const audio = new Audio();
  const ui = new Interface(document.querySelector('#ui')!, store.settings); ui.captureTitle();
  let sim = new Simulation(makeCourse('main'));
  await garden.load(sim.course);
  let state: Session = 'menu';
  let accumulator = 0, lastFrame = performance.now(), lastSave = 0;
  let awaitingGrip = false, starting = false, ignoreSaveError = false;
  let target: Anchor | null = null;
  let lastZone = 0;
  let seenMoving = false, seenSpring = false;
  const reachedRefuges = new Set<string>();
  let currentRefuge: string | undefined;
  ui.setSave(await store.load(), store.available);

  function applySettings(): void {
    input.toggle = store.settings.toggle;
    garden.quality(store.settings.quality === 'low');
    audio.volume = store.settings.volume; audio.mute = store.settings.mute;
  }
  applySettings();

  async function save(): Promise<boolean> {
    if (ignoreSaveError || sim.course.mode === 'training') return true;
    try { await store.save(sim.snapshot()); return true; }
    catch (e) {
      state = 'error'; input.active = false; input.clear(); accumulator = 0;
      ui.show('error', sim, `진행을 저장하지 못해 이 순간을 보존하고 있습니다. ${e instanceof Error ? e.message : ''}`);
      return false;
    }
  }

  function pause(): void {
    if (state !== 'playing') return;
    state = 'paused'; input.active = false; input.clear(); accumulator = 0;
    ui.show(state, sim); void save();
  }

  function resume(): void {
    if (state === 'error') ignoreSaveError = true;
    state = 'playing'; accumulator = 0; input.clear(); input.active = true;
    awaitingGrip = !!sim.attached && !store.settings.toggle;
    audio.unlock(); ui.show(state, sim);
  }

  async function start(mode: Mode, saved?: SaveState): Promise<void> {
    if (starting) return;
    starting = true; input.active = false; input.clear(); accumulator = 0;
    try {
      if (sim.course.mode === 'main' && mode === 'training' && sim.time > 0) await save();
      const next = new Simulation(saved ? courseForSave(saved) : makeCourse(mode));
      if (saved) next.restore(saved);
      sim.dispose(); sim = next; await garden.load(sim.course);
      lastSave = sim.time; lastZone = sim.zone; ignoreSaveError = false;
      seenMoving = false; seenSpring = false;
      reachedRefuges.clear(); currentRefuge = undefined;
      if (mode === 'main' && !saved) await store.save(sim.snapshot());
      state = saved ? 'paused' : 'playing'; awaitingGrip = false;
      input.active = state === 'playing'; audio.unlock(); ui.show(state, sim);
      if (!saved) ui.notify(mode === 'training' ? 'Space 점프 → 먹이 연결 → 매달린 채 Space로 먹고 스윙을 만들어 보세요!' : '먹이를 먹으면 기존 스윙 방향으로 튕겨 나가요. 다음 지형 위 먹이에 다시 연결하세요.', 5200);
    } catch (e) {
      state = 'error'; ui.show(state, sim, e instanceof Error ? e.message : '시작하지 못했습니다.');
    } finally { starting = false; }
  }

  ui.onStart = (mode, saved) => { void start(mode, saved); };
  ui.onPause = input.onPause = pause;
  input.onFocusLost = pause;
  ui.onResume = resume;
  ui.onRestart = () => { void start(sim.course.mode); };
  ui.onExit = () => {
    void (async () => {
      input.active = false; input.clear(); state = 'paused';
      if (!await save()) return;
      state = 'menu'; ui.saved = await store.load(); ui.show('menu', sim);
    })();
  };
  ui.onSettings = settings => { store.settings = settings; applySettings(); void store.saveSettings(); };
  ui.onRetrySave = () => { ignoreSaveError = false; void save().then(ok => { if (ok) { state = 'paused'; ui.show('paused', sim); } }); };
  ui.onExport = () => {
    void (async () => {
      try {
        if (state === 'playing') pause();
        const backup = await store.backup(state !== 'menu' ? sim.snapshot() : undefined);
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `frog-ascent-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        ui.backupStatus('백업 파일을 내려받았습니다. 새 PC의 설정에서 가져오세요.');
      } catch (e) { ui.backupStatus(e instanceof Error ? e.message : '백업하지 못했습니다.'); }
    })();
  };
  ui.onImport = file => {
    void (async () => {
      try {
        if (file.size > 1_000_000) throw new Error('저장 파일이 너무 큽니다.');
        const backup = parseBackup(await file.text());
        // Validate course-specific anchor IDs before changing the existing browser save.
        for (const saved of [backup.current, backup.previous]) if (saved) {
          const check = new Simulation(courseForSave(saved));
          try { check.restore(saved); } finally { check.dispose(); }
        }
        if (await store.load() && !confirm('가져온 진행과 설정으로 바꿀까요? 현재 진행은 이전 기록으로 보관됩니다.')) return;
        await store.importBackup(backup); applySettings(); ui.syncSettings(store.settings);
        sim.dispose(); sim = new Simulation(makeCourse('main')); await garden.load(sim.course);
        input.active = false; input.clear(); accumulator = 0; awaitingGrip = false;
        state = 'menu'; ui.saved = await store.load(); ui.show('menu', sim);
        alert('저장을 가져왔습니다. 계속 오르기를 눌러 이어서 플레이하세요.');
      } catch (e) { ui.backupStatus(e instanceof Error ? e.message : '가져오지 못했습니다.'); }
    })();
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); ui.notify('그래픽이 잠시 중단되어 진행을 멈췄습니다.', 6000); });
  canvas.addEventListener('webglcontextrestored', () => { state = 'paused'; input.active = false; ui.show('paused', sim); });
  document.querySelector('#boot')!.remove();

  function frame(now: number): void {
    const dt = Math.min(.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    input.pollPad(dt);
    if (state === 'playing') {
      garden.yaw -= input.lookX; garden.pitch = clamp(garden.pitch + input.lookY, -.95, 1.35);
    }
    input.lookX = 0; input.lookY = 0;
    const aim = garden.aim(input.pointerX, input.pointerY);
    target = sim.selectTarget(aim.camera, aim.direction, store.settings.assisted);
    if (awaitingGrip && input.held) awaitingGrip = false;
    if (state === 'playing' && !awaitingGrip) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= DT && steps++ < 12) {
        const movementYaw = garden.movementYaw;
        const controls = input.read(movementYaw, !!sim.attached);
        canvas.dataset.movementYaw = movementYaw.toFixed(4);
        canvas.dataset.inputX = controls.x.toFixed(4); canvas.dataset.inputZ = controls.z.toFixed(4);
        sim.step(controls, target?.id ?? null);
        accumulator -= DT;
      }
      if (accumulator >= DT) accumulator = 0;
      for (const e of sim.events.splice(0)) {
        audio.play(e); garden.react(e.type, sim.time, e.anchor ? sim.anchorPosition(e.anchor) ?? undefined : undefined);
        const food = sim.course.anchors.find(a => a.id === e.anchor)?.food;
        if (e.type === 'miss') ui.notify('가까운 먹이를 조준해 보세요. 사거리는 10m입니다.', 1300);
        if (e.type === 'blocked') ui.notify('혀가 지형에 막혔어요. 다른 각도로 연결해 보세요.', 1600);
        if (e.type === 'recovery') ui.notify('붙잡았어요. 다시 위로!', 1400);
        if (e.type === 'eat') ui.notify(`${FOOD_NAMES[food ?? 'fly']} 꿀꺽! 3초 뒤 다시 나타나요.`, 1500);
        if (e.type === 'swing' && e.reason === 'eat-swing') ui.notify('먹기 스윙! 접선 방향으로 날아가요. 다음 지형에 다시 연결해 보세요.', 1500);
        if ((e.type === 'catch' || e.type === 'recovery') && sim.anchor?.motion && !seenMoving) {
          seenMoving = true; ui.notify('움직이는 먹이도 잡으면 멈춰요! 스윙한 뒤 다음 먹이로 도약하세요.', 3500);
        }
        if (e.type === 'water-enter') ui.notify('공중 물방울! Space 꾹 수영↑ · Shift 수영↓ · WASD 헤엄', 4200);
        if (e.type === 'water-exit') ui.notify('물 밖으로! 위쪽 파리에 혀를 걸어 상승을 이어가세요.', 2400);
        if (e.type === 'bounce' && !seenSpring) { seenSpring = true; ui.notify('탄성 잎! 튀어 오른 속도로 파리에 연결해 보세요.', 3200); }
        if (e.type === 'reset') ui.notify('다시 출발점. 최고 높이 기록은 남아 있어요.', 2200);
        if (e.type === 'summit') { state = 'complete'; input.active = false; input.clear(); ui.show('complete', sim); void save(); }
      }
      if (sim.course.mode === 'main' && sim.time - lastSave >= .5) { lastSave = sim.time; void save(); }
      const zone = sim.zone;
      if (zone > lastZone) { lastZone = zone; ui.notify(sim.biome ? `${sim.biome.name} 진입! 새로운 지형과 먹이를 관찰하세요.` : '조금 더 높은 풍경. 아래로 떨어져도 다시 연결할 수 있어요.', 2500); }
      const refuge = sim.refuge;
      if (refuge && currentRefuge !== refuge.id) {
        const first = !reachedRefuges.has(refuge.id);
        reachedRefuges.add(refuge.id);
        ui.notify(first ? `${refuge.refuge} 안쪽에 도착! 아래 지형을 발판 삼아 다시 도전하세요.`
          : `${refuge.refuge} 안으로 돌아왔어요. 다시 위로!`, 3200);
        if (first) audio.play({ type: 'recovery', position: sim.position });
      }
      currentRefuge = refuge?.id;
    } else accumulator = 0;
    if (target && sim.flyLife(target.id).phase !== 'alive') target = null;
    garden.update(sim, target, dt, sim.time, store.settings.motion);
    ui.update(sim, target, { x: input.pointerX, y: input.pointerY }, awaitingGrip, input.device);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot().catch(e => {
  const boot = document.querySelector('#boot')!;
  boot.innerHTML = '<strong>정원을 불러오지 못했습니다.</strong><span id="boot-error"></span><button class="primary" id="reload">다시 불러오기</button>';
  boot.querySelector('#boot-error')!.textContent = e instanceof Error ? e.message : String(e);
  boot.querySelector('#reload')!.addEventListener('click', () => location.reload());
  console.error(e);
});
