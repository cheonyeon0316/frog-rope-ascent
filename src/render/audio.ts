import type { GameEvent } from '../game/types';
export class Audio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  mute = false;
  volume = .45;
  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
  }
  play(e: GameEvent): void {
    if (e.type === 'touch') return;
    if (!this.context || !this.master || this.mute) return;
    const map = { shoot: [530, 180, .07], catch: [820, 380, .1], recovery: [620, 960, .2], release: [410, 110, .1], eat: [330, 120, .22], dash: [680, 210, .12], miss: [180, 110, .06],
      blocked: [140, 90, .12], land: [120, 55, .12], fall: [240, 170, .13], reset: [120, 180, .2], summit: [440, 880, .5],
      'water-enter': [280, 520, .25], 'water-exit': [510, 270, .15], bounce: [160, 650, .2] };
    const [a, b, duration] = e.type === 'dash' && e.reason === 'launch' ? [950, 220, .25] : map[e.type];
    const now = this.context.currentTime;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = e.type === 'land' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(a, now); osc.frequency.exponentialRampToValueAtTime(b, now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.08 * this.volume + .0001, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(now); osc.stop(now + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    if (e.type === 'eat') this.note(180, now + .32);
    if (e.type === 'summit') for (const [delay, frequency] of [[.15, 554], [.3, 660], [.45, 880]]) this.note(frequency, now + delay);
  }
  private note(frequency: number, time: number): void {
    if (!this.context || !this.master) return;
    const o = this.context.createOscillator(), g = this.context.createGain();
    o.frequency.value = frequency; g.gain.setValueAtTime(.04 * this.volume, time); g.gain.exponentialRampToValueAtTime(.0001, time + .4);
    o.connect(g); g.connect(this.master); o.start(time); o.stop(time + .4);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
}
