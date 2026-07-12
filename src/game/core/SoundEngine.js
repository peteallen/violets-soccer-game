const STORAGE_KEY = 'violet_soccer_muted';

export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = localStorage.getItem(STORAGE_KEY) === 'true';
    this.lastKickAt = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, String(muted));
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.context.currentTime, 0.025);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    if (!this.muted) this.play('ui');
    return this.muted;
  }

  play(kind) {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    if (kind === 'kick' && now - this.lastKickAt < 0.06) return;
    if (kind === 'kick') this.lastKickAt = now;
    const patterns = {
      ui: [{ frequency: 620, end: 940, duration: 0.11, gain: 0.11, type: 'sine' }],
      kick: [{ frequency: 130, end: 64, duration: 0.09, gain: 0.22, type: 'triangle' }],
      pass: [{ frequency: 180, end: 90, duration: 0.07, gain: 0.12, type: 'triangle' }],
      whistle: [
        { frequency: 1780, end: 2150, duration: 0.15, gain: 0.09, type: 'sine' },
        { frequency: 2010, end: 1650, duration: 0.12, gain: 0.07, type: 'sine', delay: 0.16 },
      ],
      save: [{ frequency: 92, end: 54, duration: 0.16, gain: 0.2, type: 'sine' }],
      goal: [
        { frequency: 392, end: 523, duration: 0.18, gain: 0.13, type: 'triangle' },
        { frequency: 523, end: 659, duration: 0.22, gain: 0.12, type: 'triangle', delay: 0.12 },
        { frequency: 659, end: 784, duration: 0.3, gain: 0.1, type: 'triangle', delay: 0.25 },
      ],
    };
    for (const note of patterns[kind] ?? patterns.ui) this.playTone(note, now);
  }

  playTone({ frequency, end = frequency, duration, gain, type, delay = 0 }, now) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const start = now + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.018, duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
