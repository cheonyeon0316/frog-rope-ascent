import { type Controls } from './types';

export function cameraRelativeAxes(side: number, forward: number, yaw: number) {
  return { x: side * Math.cos(yaw) - forward * Math.sin(yaw), z: -side * Math.sin(yaw) - forward * Math.cos(yaw) };
}

export class Input {
  keys = new Set<string>();
  mouseHeld = false;
  padHeld = false;
  toggle = false;
  active = false;
  device: 'mouse' | 'pad' = 'mouse';
  private right = false;
  private lastX = 0;
  private lastY = 0;
  private events: ('press' | 'release')[] = [];
  private jump = false;
  private padJump = false;
  private padDive = false;
  private padPause = false;
  private stick = { x: 0, z: 0 };
  lookX = 0;
  lookY = 0;
  onPause = () => {};
  onFocusLost = () => {};

  constructor(readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) this.onPause();
      if (e.code === 'Space' && !e.repeat) this.jump = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      if (!this.active) return;
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      this.device = 'mouse';
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock().catch(() => {});
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button === 0 && !this.mouseHeld) { this.mouseHeld = true; this.events.push('press'); }
      if (e.button === 2) { this.right = true; canvas.style.cursor = 'grabbing'; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0 && this.mouseHeld) { this.mouseHeld = false; if (this.active && !this.toggle) this.events.push('release'); }
      if (e.button === 2) { this.right = false; canvas.style.cursor = ''; }
    });
    canvas.addEventListener('pointercancel', () => { this.clear(); this.onFocusLost(); });
    window.addEventListener('pointermove', e => {
      if (!this.active) return;
      if (document.pointerLockElement === canvas) {
        this.lookX += e.movementX * .003;
        this.lookY += e.movementY * .0025;
      } else if (this.right || this.mouseHeld) {
        this.lookX += (e.clientX - this.lastX) * .003;
        this.lookY += (e.clientY - this.lastY) * .0025;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      canvas.style.cursor = document.pointerLockElement === canvas ? 'none' : this.right ? 'grabbing' : '';
    });
    window.addEventListener('blur', () => { this.clear(); this.onFocusLost(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); this.onFocusLost(); } });
    window.addEventListener('gamepaddisconnected', () => { if (this.device === 'pad') { this.clear(); this.onFocusLost(); } });
  }

  pollPad(dt: number): void {
    if (!this.active) return;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    if (!pad) { this.stick = { x: 0, z: 0 }; return; }
    const axis = (n: number) => Math.abs(n) < .15 ? 0 : Math.sign(n) * (Math.abs(n) - .15) / .85;
    this.stick.x = axis(pad.axes[0] ?? 0); this.stick.z = -axis(pad.axes[1] ?? 0);
    const lx = axis(pad.axes[2] ?? 0), ly = axis(pad.axes[3] ?? 0);
    const trigger = pad.buttons[7]?.value ?? 0;
    if (Math.abs(lx) + Math.abs(ly) + Math.abs(this.stick.x) + Math.abs(this.stick.z) + trigger > .1) {
      this.device = 'pad';
      this.lookX += lx * dt * 2.4; this.lookY += ly * dt * 1.7;
    }
    const pressed = this.padHeld ? trigger > .35 : trigger > .55;
    if (pressed && !this.padHeld) this.events.push('press');
    if (!pressed && this.padHeld && !this.toggle) this.events.push('release');
    this.padHeld = pressed;
    const jump = pad.buttons[0]?.pressed ?? false;
    if (jump && !this.padJump) this.jump = true;
    this.padJump = jump;
    this.padDive = pad.buttons[1]?.pressed ?? false;
    const pause = pad.buttons[9]?.pressed ?? false;
    if (pause && !this.padPause) this.onPause();
    this.padPause = pause;
  }

  read(yaw: number, attached: boolean): Controls {
    const side = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.stick.x;
    const fwd = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) + this.stick.z;
    const event = this.events.shift();
    const forward = cameraRelativeAxes(0, 1, yaw);
    const result: Controls = { ...cameraRelativeAxes(side, fwd, yaw), cameraForward: { ...forward, y: 0 },
      jump: this.jump, grapplePress: event === 'press' && !(this.toggle && attached), grappleRelease: event === 'release' || event === 'press' && this.toggle && attached };
    result.swim = Number(this.keys.has('Space') || this.padJump) - Number(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.padDive);
    this.jump = false;
    return result;
  }

  get held() { return this.mouseHeld || this.padHeld; }
  clear(): void {
    this.keys.clear(); this.events.length = 0; this.jump = false; this.right = false; this.mouseHeld = false; this.padHeld = false;
    this.padJump = false; this.padPause = false; this.lookX = 0; this.lookY = 0; this.stick = { x: 0, z: 0 };
    this.padDive = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.style.cursor = '';
  }
}
