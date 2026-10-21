// Sound effects synthesised with WebAudio (no audio files): hits, blocks, whooshes, parries, supers, KOs,
// plus spoken round calls through the browser's speech synthesis when it has a voice.

import type { GameEvent } from '../sim/types';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  voice = true;

  // browsers only allow audio after a user gesture
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(e: GameEvent) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const p = e.power;
    switch (e.type) {
      case 'hit':
        this.burst(0.12 + p * 0.05, 900 + p * 300, 0.9, 0.5 + p * 0.15, 'lowpass');
        this.tone(0.14 + p * 0.06, 160 - p * 20, 45, 0.6 + p * 0.1);
        break;
      case 'block':
        this.burst(0.06, 3200, 3, 0.35, 'bandpass');
        this.tone(0.05, 900, 500, 0.15, 'square');
        break;
      case 'parry':
      case 'perfectParry':
        this.tone(0.25, 1300, 2600, 0.25, 'triangle');
        this.tone(0.3, 1950, 3900, 0.15, 'sine', 0.03);
        if (e.type === 'perfectParry') this.tone(0.6, 520, 1040, 0.3, 'sawtooth', 0.05);
        break;
      case 'armor':
        this.tone(0.15, 220, 180, 0.4, 'square');
        break;
      case 'throw':
        this.burst(0.25, 400, 1, 0.5, 'lowpass');
        break;
      case 'tech':
        this.tone(0.12, 700, 350, 0.3, 'square');
        break;
      case 'super':
      case 'heat':
      case 'heatSmash':
      case 'rageArt':
        for (const [i, f] of [262, 330, 392, 523].entries()) this.tone(0.7, f, f * 2, 0.16, 'sawtooth', i * 0.04);
        this.burst(0.8, 300, 0.7, 0.4, 'lowpass', 4000);
        break;
      case 'driveRush':
        this.burst(0.3, 600, 1, 0.35, 'bandpass', 3000);
        break;
      case 'driveImpact':
        this.tone(0.4, 90, 40, 0.6, 'sawtooth');
        this.burst(0.4, 200, 0.6, 0.4, 'lowpass', 2000);
        break;
      case 'wallSplat':
        this.tone(0.5, 70, 30, 0.8);
        this.burst(0.35, 500, 0.6, 0.6, 'lowpass');
        break;
      case 'justFrame':
        this.burst(0.3, 5000, 2, 0.4, 'highpass');
        this.tone(0.3, 2400, 600, 0.2, 'sawtooth');
        break;
      case 'ko':
        this.tone(1.2, 110, 30, 0.9);
        this.burst(1.0, 800, 0.5, 0.6, 'lowpass', 80);
        this.say('K.O.');
        break;
      case 'projectile':
        this.burst(0.35, 900, 2, 0.3, 'bandpass', 2500);
        this.tone(0.3, 300, 600, 0.12, 'triangle');
        break;
      case 'jump':
      case 'evade':
        this.burst(0.12, 1500, 1, 0.12, 'bandpass', 3000);
        break;
      case 'land':
        this.burst(0.08, 300, 1, 0.15, 'lowpass');
        break;
      case 'knockdown':
        this.tone(0.3, 80, 40, 0.5);
        this.burst(0.25, 250, 0.8, 0.35, 'lowpass');
        break;
      case 'burnout':
        this.tone(0.6, 400, 100, 0.25, 'sawtooth');
        break;
      case 'counter':
      case 'punish':
        this.tone(0.2, 1800, 1200, 0.15, 'square');
        break;
      case 'round':
        this.say(`Round ${e.power}`);
        break;
      case 'fight':
        this.say('Fight!');
        break;
      case 'timeover':
        this.say('Time!');
        break;
    }
  }

  whoosh(power: number) {
    if (!this.enabled || !this.ctx) return;
    this.burst(0.09 + power * 0.04, 1200 + power * 400, 1.2, 0.08 + power * 0.04, 'bandpass', 400);
  }

  say(text: string) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 0.6;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* no voices */
    }
  }
}
