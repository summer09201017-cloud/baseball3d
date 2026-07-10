// 音效+中文語音播報(參考籃球CO的 AudioManager;Web Audio 合成音+SpeechSynthesis zh-TW)
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.enabled = true;
    this.lastAnnouncementAt = 0;
    this.speechEnabled = "speechSynthesis" in window;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.masterGain) this.masterGain.gain.value = enabled ? 0.2 : 0;
  }

  ensureContext() {
    if (this.context) return this.context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    this.context = new Ctor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.enabled ? 0.2 : 0;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  unlock() {
    const context = this.ensureContext();
    if (context && context.state === "suspended") context.resume().catch(() => {});
  }

  tone({ frequency = 440, frequencyEnd = null, duration = 0.12, type = "sine", gain = 0.12, when = 0 }) {
    const context = this.ensureContext();
    if (!context || !this.enabled) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const g = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (frequencyEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 0.4), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  uiTap() { this.tone({ frequency: 520, frequencyEnd: 760, duration: 0.08, type: "triangle", gain: 0.06 }); }
  pitchWhoosh() { this.tone({ frequency: 300, frequencyEnd: 180, duration: 0.16, type: "sine", gain: 0.06 }); }
  batCrack() {
    this.tone({ frequency: 900, frequencyEnd: 240, duration: 0.07, type: "square", gain: 0.16 });
    this.tone({ frequency: 180, frequencyEnd: 90, duration: 0.12, type: "sawtooth", gain: 0.1, when: 0.01 });
  }
  catchPop() { this.tone({ frequency: 220, frequencyEnd: 140, duration: 0.08, type: "square", gain: 0.09 }); }
  cheer() {
    this.tone({ frequency: 523, duration: 0.12, type: "triangle", gain: 0.1 });
    this.tone({ frequency: 659, duration: 0.12, type: "triangle", gain: 0.1, when: 0.1 });
    this.tone({ frequency: 784, duration: 0.22, type: "triangle", gain: 0.1, when: 0.2 });
  }
  buzz() { this.tone({ frequency: 200, frequencyEnd: 160, duration: 0.22, type: "square", gain: 0.08 }); }
  horn() {
    this.tone({ frequency: 190, frequencyEnd: 150, duration: 0.42, type: "sawtooth", gain: 0.12 });
    this.tone({ frequency: 290, frequencyEnd: 240, duration: 0.42, type: "square", gain: 0.08, when: 0.02 });
  }
  vibrate(pattern) { if ("vibrate" in navigator) navigator.vibrate(pattern); }

  // ── 觀眾音效(07-10 使用者點名):環境人聲+喝采浪+節奏加油拍手 ──
  makeNoiseBuffer() {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (this._noiseBuf) return this._noiseBuf;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
    this._noiseBuf = buf;
    return buf;
  }

  startCrowd() {
    const ctx = this.ensureContext();
    if (!ctx || this._crowd) return;
    const buf = this.makeNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 620; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(this.masterGain);
    src.start();
    this._crowd = { src, gain: g };
  }

  stopCrowd() {
    if (!this._crowd) return;
    try { this._crowd.src.stop(); } catch { /* ignore */ }
    this._crowd = null;
  }

  crowdCheer(strength = 1) {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    this.startCrowd();
    if (this._crowd) {
      const g = this._crowd.gain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.05, g.value), now);
      g.linearRampToValueAtTime(0.05 + 0.2 * strength, now + 0.12);
      g.exponentialRampToValueAtTime(0.05, now + 1.9);
    }
    // 零星拍手(短噪音爆)
    const buf = this.makeNoiseBuffer();
    for (let i = 0; i < 5; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 1600;
      const g2 = ctx.createGain();
      const t0 = ctx.currentTime + Math.random() * 0.6;
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.07 * strength, t0 + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      src.connect(hp); hp.connect(g2); g2.connect(this.masterGain);
      src.start(t0); src.stop(t0 + 0.1);
    }
  }

  crowdChant() {
    // 加油!加油!——「咚咚・咚」節奏拍手×2
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    const buf = this.makeNoiseBuffer();
    const pattern = [0, 0.22, 0.55, 1.0, 1.22, 1.55];
    for (const off of pattern) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.2;
      const g2 = ctx.createGain();
      const t0 = ctx.currentTime + off;
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.11, t0 + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      src.connect(bp); bp.connect(g2); g2.connect(this.masterGain);
      src.start(t0); src.stop(t0 + 0.12);
    }
  }

  announce(text) {
    if (!this.enabled || !this.speechEnabled || !text) return;
    const now = performance.now();
    if (now - this.lastAnnouncementAt < 650) return;
    this.lastAnnouncementAt = now;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-TW";
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }
}
