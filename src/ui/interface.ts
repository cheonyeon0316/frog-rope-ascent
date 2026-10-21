import { ZONES, FOOD_NAMES, type Mode, type Session, type Anchor, type SaveState } from '../game/types';
import type { Simulation } from '../game/simulation';
import type { Settings } from '../game/storage';

export class Interface {
  onStart = (_mode: Mode, _saved?: SaveState) => {};
  onResume = () => {};
  onPause = () => {};
  onRestart = () => {};
  onExit = () => {};
  onSettings = (_settings: Settings) => {};
  onRetrySave = () => {};
  onExport = () => {};
  onImport = (_file: File) => {};
  saved: SaveState | null = null;
  private panel: HTMLElement;
  private height: HTMLElement;
  private peak: HTMLElement;
  private hint: HTMLElement;
  private reticle: HTMLElement;
  private zone: HTMLElement;
  private timer: HTMLElement;
  private toast: HTMLElement;
  private lookHint: HTMLElement;
  private toastUntil = 0;
  private previous: Session = 'menu';
  private state: Session = 'menu';
  private currentSim?: Simulation;
  private activeSettings: Settings;

  constructor(readonly root: HTMLElement, settings: Settings) {
    this.activeSettings = { ...settings };
    root.innerHTML = `
      <div id="hud" hidden>
        <div class="height-cluster"><div class="eyebrow"><span class="tiny-leaf"></span><span id="zone">웅덩이 가장자리</span></div><div class="height-number"><span id="height">0</span><span class="unit">m</span></div><div class="height-meta">시도 최고 <strong id="peak">0 m</strong><span id="timer">00:00</span></div></div>
        <button id="pause-button" class="round-button" title="일시정지 (Esc)" aria-label="일시정지">Ⅱ</button>
        <div id="reticle" class="reticle" aria-hidden="true"><i></i></div>
        <div id="toast" class="toast" role="status" hidden></div>
        <div class="play-hint"><span class="control-dot"></span><span id="hint">마우스로 파리 조준 · 꾹 눌러 연결 · 놓으면 도약</span></div>
        <div class="look-hint">WASD 이동·스윙 <span>·</span> Space 점프 <span>·</span> 우클릭 드래그 시점</div>
      </div>
      <section id="panel" class="overlay" aria-label="게임 메뉴">
        <div class="title-panel">
          <div class="eyebrow"><span class="tiny-leaf"></span> FROG ASCENT</div>
          <h1>Tongumble<span class="title-dot">.</span></h1>
          <p class="tagline">한 번 더,<br>더 높은 곳으로.</p>
          <p class="intro">연못에서 풀숲, 바위와 꽃, 나무와 구름을 넘어 별까지.<br>초파리·꽃가루·벌에 혀를 걸고, 다음 풍경으로 도약하세요.</p>
          <div class="menu-actions"><button class="primary" id="start">생태계 오르기 <span>↗</span></button><button class="secondary" id="continue" hidden>계속 오르기</button><button class="text-button" id="training">짧은 연습부터</button></div>
          <div class="title-bottom"><button class="text-button small" id="settings-title">설정</button><span>8개 생태계 · 180m · 3D 로프 액션</span></div>
        </div>
        <div class="title-note"><span>FIELD NOTE 01</span><strong>높은 곳에도<br>벌레는 있습니다.</strong><small>느긋하게 관찰하고, 과감하게 도약하세요.</small></div>
      </section>
      <section id="settings" class="overlay centered" hidden aria-label="설정">
        <div class="dialog settings-dialog"><div class="eyebrow">YOUR OWN PACE</div><h2>내 손에 맞게</h2>
          <label class="setting"><span><strong>연결 방식</strong><small>홀드: 누르는 동안 연결 / 토글: 클릭으로 연결·해제</small></span><select id="setting-toggle"><option value="false">꾹 누르기</option><option value="true">클릭 토글</option></select></label>
          <label class="setting"><span><strong>넉넉한 조준</strong><small>작은 파리를 잡기 쉽게 조준 범위를 넓힙니다.</small></span><input id="setting-assisted" type="checkbox"></label>
          <label class="setting"><span><strong>소리</strong><small>연결·도약·착지의 작은 소리</small></span><input id="setting-volume" type="range" min="0" max="100"></label>
          <label class="setting"><span><strong>음소거</strong></span><input id="setting-mute" type="checkbox"></label>
          <label class="setting"><span><strong>몸의 보조 흔들림</strong><small>카메라 수평은 언제나 유지됩니다.</small></span><input id="setting-motion" type="checkbox"></label>
          <label class="setting"><span><strong>그래픽</strong><small>낮음은 그림자와 렌더 해상도를 줄입니다.</small></span><select id="setting-quality"><option value="high">부드러운 그림자</option><option value="low">가볍게 보기</option></select></label>
          <div class="button-row"><button class="secondary" id="backup-export">저장 내보내기</button><button class="secondary" id="backup-import">저장 가져오기</button></div>
          <input id="backup-file" type="file" accept=".json,application/json" hidden>
          <p class="dialog-note" id="backup-status" role="status">진행·최고 기록·설정을 JSON 파일로 옮깁니다.</p>
          <button class="primary full" id="settings-close">좋아요</button><p class="dialog-note">표준 패드: 왼쪽 스틱 이동 · 오른쪽 스틱 시점 · RT 혀 · A 점프</p>
        </div>
      </section>
      <div class="small-device">넓은 화면에서 키보드·마우스 또는 패드로 플레이해 주세요.</div>`;
    this.panel = root.querySelector('#panel')!;
    this.height = root.querySelector('#height')!; this.peak = root.querySelector('#peak')!;
    this.hint = root.querySelector('#hint')!; this.reticle = root.querySelector('#reticle')!;
    this.zone = root.querySelector('#zone')!; this.timer = root.querySelector('#timer')!; this.toast = root.querySelector('#toast')!;
    this.lookHint = root.querySelector('.look-hint')!;
    this.bindTitle();
    root.querySelector('#pause-button')!.addEventListener('click', () => this.onPause());
    root.querySelector('#settings-close')!.addEventListener('click', () => this.closeSettings());
    root.querySelector('#backup-export')!.addEventListener('click', () => this.onExport());
    const backupFile = root.querySelector<HTMLInputElement>('#backup-file')!;
    root.querySelector('#backup-import')!.addEventListener('click', () => backupFile.click());
    backupFile.addEventListener('change', () => { const file = backupFile.files?.[0]; if (file) this.onImport(file); backupFile.value = ''; });
    for (const id of ['toggle', 'assisted', 'volume', 'mute', 'motion', 'quality']) root.querySelector(`#setting-${id}`)!.addEventListener('change', () => this.updateSettings());
  }

  private bindTitle(): void {
    this.panel.querySelector('#start')?.addEventListener('click', () => {
      if (this.saved) this.confirmNew(); else this.onStart('main');
    });
    this.panel.querySelector('#continue')?.addEventListener('click', () => { if (this.saved) this.onStart('main', this.saved); });
    this.panel.querySelector('#training')?.addEventListener('click', () => this.onStart('training'));
    this.panel.querySelector('#settings-title')?.addEventListener('click', () => this.settings());
  }
  setSave(save: SaveState | null, available: boolean): void {
    this.saved = save;
    const button = this.panel.querySelector<HTMLButtonElement>('#continue');
    if (button) { button.hidden = !save; if (save) button.textContent = `${save.course === 'garden-main-v1' ? '이전 정원 이어가기' : save.course === 'ecosystem-main-v2' ? '이전 생태계 이어가기' : '계속 오르기'} · 최고 ${Math.floor(save.peak)}m`; }
    if (!available) this.notify('이 브라우저는 진행 저장을 허용하지 않습니다.', 5000);
  }
  show(state: Session, sim?: Simulation, message = ''): void {
    sim ??= this.currentSim;
    this.state = state;
    (this.root.querySelector('#hud') as HTMLElement).hidden = state === 'menu';
    this.panel.hidden = state === 'playing';
    (this.root.querySelector('#settings') as HTMLElement).hidden = true;
    if (state === 'playing') return;
    if (state === 'menu') {
      // The title is retained as a template across sessions.
      this.panel.className = 'overlay';
      this.panel.innerHTML = this.titleTemplate;
      this.bindTitle(); this.setSave(this.saved, true); return;
    }
    this.panel.className = 'overlay centered';
    if (state === 'paused') {
      this.panel.innerHTML = `<div class="dialog"><div class="eyebrow">TAKE A BREATH</div><h2>잠깐, 숨 고르기.</h2><p class="dialog-note">${sim?.course.mode === 'training' ? '연습 코스' : '수직 정원'} · 현재 ${Math.floor(sim?.height ?? 0)}m<br>이 순간의 위치와 혀 연결을 그대로 유지합니다.</p><button class="primary full" id="resume">다시 오르기 ↗</button><div class="button-row"><button class="secondary" id="settings-pause">설정</button><button class="secondary" id="restart">처음부터</button></div><button class="text-button full" id="exit">저장하고 메뉴로</button></div>`;
      this.panel.querySelector('#resume')!.addEventListener('click', () => this.onResume());
      this.panel.querySelector('#settings-pause')!.addEventListener('click', () => this.settings());
      this.panel.querySelector('#restart')!.addEventListener('click', () => this.confirmNew(true));
      this.panel.querySelector('#exit')!.addEventListener('click', () => this.onExit());
    } else if (state === 'complete') {
      this.panel.innerHTML = `<div class="dialog"><div class="eyebrow">A LITTLE HIGHER THAN BEFORE</div><h2>${sim?.course.mode === 'training' ? '준비됐어요.' : '정상에 도착했어요.'}</h2><p class="dialog-note">${sim?.course.mode === 'training' ? '이제 긴 정원에서 도전해 보세요.' : '작은 도약이 모여 여기까지.'}</p><div class="result"><strong>${Math.floor(sim?.course.height ?? 0)}<small>m</small></strong><span>${formatTime(sim?.time ?? 0)}<small>활성 플레이 시간</small></span></div><button class="primary full" id="again">${sim?.course.mode === 'training' ? '정원 오르기 ↗' : '한 번 더 오르기 ↗'}</button><button class="text-button full" id="exit">메뉴로</button></div>`;
      this.panel.querySelector('#again')!.addEventListener('click', () => this.onStart('main'));
      this.panel.querySelector('#exit')!.addEventListener('click', () => this.onExit());
    } else if (state === 'error') {
      this.panel.innerHTML = `<div class="dialog"><div class="eyebrow">HOLD ON</div><h2>잠깐 멈췄어요.</h2><p class="dialog-note" id="error-message"></p><button class="primary full" id="retry">다시 시도</button><button class="secondary full" id="export">현재 상태 내보내기</button><button class="text-button full" id="unsafe">저장 없이 계속</button></div>`;
      this.panel.querySelector('#error-message')!.textContent = message;
      this.panel.querySelector('#retry')!.addEventListener('click', () => this.onRetrySave());
      this.panel.querySelector('#export')!.addEventListener('click', () => this.onExport());
      this.panel.querySelector('#unsafe')!.addEventListener('click', () => this.onResume());
    }
    this.panel.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private titleTemplate = '';
  captureTitle(): void { this.titleTemplate = this.panel.innerHTML; }
  private confirmNew(restart = false): void {
    this.panel.hidden = false; this.panel.className = 'overlay centered';
    this.panel.innerHTML = `<div class="dialog"><div class="eyebrow">A NEW LEAP</div><h2>처음부터 시작할까요?</h2><p class="dialog-note">현재 시도의 위치를 지우고 출발점으로 돌아갑니다.<br>기기 최고 높이 기록은 남습니다.</p><button class="primary full" id="yes">새로 시작</button><button class="secondary full" id="no">아직 더 올라갈래요</button></div>`;
    this.panel.querySelector('#yes')!.addEventListener('click', () => restart ? this.onRestart() : this.onStart('main'));
    this.panel.querySelector('#no')!.addEventListener('click', () => this.show(restart ? 'paused' : 'menu'));
  }
  private settings(): void {
    this.previous = this.state;
    this.panel.hidden = true;
    (this.root.querySelector('#settings') as HTMLElement).hidden = false;
    for (const id of ['assisted', 'mute', 'motion']) (this.root.querySelector(`#setting-${id}`) as HTMLInputElement).checked = this.activeSettings[id as 'assisted' | 'mute' | 'motion'];
    (this.root.querySelector('#setting-toggle') as HTMLSelectElement).value = String(this.activeSettings.toggle);
    (this.root.querySelector('#setting-quality') as HTMLSelectElement).value = this.activeSettings.quality;
    (this.root.querySelector('#setting-volume') as HTMLInputElement).value = String(this.activeSettings.volume * 100);
  }
  private updateSettings(): void {
    const input = (id: string) => this.root.querySelector(`#setting-${id}`) as HTMLInputElement;
    this.activeSettings = { assisted: input('assisted').checked, mute: input('mute').checked, motion: input('motion').checked,
      volume: Number(input('volume').value) / 100, toggle: input('toggle').value === 'true', quality: input('quality').value as Settings['quality'] };
    this.onSettings(this.activeSettings);
  }
  private closeSettings(): void { this.show(this.previous); }
  backupStatus(text: string): void { this.root.querySelector('#backup-status')!.textContent = text; }
  syncSettings(settings: Settings): void { this.activeSettings = { ...settings }; }
  notify(text: string, duration = 1800): void { this.toast.textContent = text; this.toast.hidden = false; this.toastUntil = performance.now() + duration; }

  update(sim: Simulation, target: Anchor | null, pointer: { x: number; y: number }, grip: boolean, device: string): void {
    this.currentSim = sim;
    this.height.textContent = String(Math.floor(sim.height)); this.peak.textContent = `${Math.floor(sim.peak)} m`;
    const water = sim.water;
    const refuge = sim.refuge;
    this.zone.textContent = water ? '이슬 속 · 수영 중' : refuge ? `${refuge.refuge} · 안쪽 지형` : sim.course.mode === 'training' ? '첫 도약 연습 · 12m' : sim.biome?.name ?? ZONES[sim.zone];
    this.timer.textContent = formatTime(sim.time);
    this.reticle.style.left = `${(pointer.x + 1) / 2 * 100}%`; this.reticle.style.top = `${(1 - pointer.y) / 2 * 100}%`;
    this.reticle.className = `reticle ${target ? 'valid' : ''} ${sim.attached ? 'attached' : ''}`;
    const button = device === 'pad' ? 'RT' : '왼쪽 버튼';
    const launchButton = device === 'pad' ? 'A' : 'Space';
    const lookHint = device === 'pad' ? '오른쪽 스틱으로 시점' : '우클릭 드래그로 시점';
    this.hint.textContent = grip ? `${button}을 다시 꾹 눌러 매달린 상태로 재개` : sim.attached ? `WASD 스윙 · ${launchButton} 먹고 강하게 대쉬 · ${lookHint}` : target ? `${target.transition ? '다음 생태계 · ' : ''}${FOOD_NAMES[target.food ?? 'fly']} · ${button}으로 혀 걸기` : sim.grounded ? 'Space로 점프 · 마우스로 먹이 조준 · 꾹 눌러 연결' : '마우스로 다음 먹이 조준 · 꾹 눌러 연결';
    if (water && !grip && !sim.attached) this.hint.textContent = device === 'pad' ? 'A 꾹 수영↑ · B 수영↓ · 왼쪽 스틱 헤엄 · RT 먹이 연결' : 'Space 꾹 수영↑ · Shift 수영↓ · WASD 헤엄 · 먹이에 재연결';
    this.lookHint.textContent = water ? '물방울 밖의 파리를 관찰하고, 수면 위에서 다시 스윙하세요.' : 'WASD 이동·스윙 · Space 점프 · 우클릭 드래그 시점';
    if (performance.now() > this.toastUntil) this.toast.hidden = true;
    this.root.dataset.state = this.state;
    this.root.dataset.height = String(sim.height.toFixed(2)); this.root.dataset.attached = sim.attached ?? '';
    this.root.dataset.mode = sim.course.mode;
    this.root.dataset.refuge = refuge?.id ?? '';
    this.root.dataset.biome = sim.biome?.id ?? '';
    this.root.dataset.swimming = String(!!water);
    this.root.dataset.activeTime = sim.time.toFixed(4);
    this.root.dataset.dashing = String(!!sim.dash);
    this.root.dataset.dashKind = sim.dash?.kind ?? '';
    this.root.dataset.velocityX = sim.velocity.x.toFixed(3); this.root.dataset.velocityY = sim.velocity.y.toFixed(3); this.root.dataset.velocityZ = sim.velocity.z.toFixed(3);
  }
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds); return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
