// Alle Geräusche werden per WebAudio erzeugt, es gibt keine Audiodateien.

const GUN = {
  pistol: { crack: 2600, crackDecay: 0.06, body: 950, bodyDecay: 0.12, thump: 150, thumpDecay: 0.07, gain: 0.75, tail: 0.35 },
  heavy: { crack: 1900, crackDecay: 0.09, body: 620, bodyDecay: 0.22, thump: 85, thumpDecay: 0.15, gain: 1.0, tail: 0.7 },
  smg: { crack: 3000, crackDecay: 0.045, body: 1150, bodyDecay: 0.085, thump: 160, thumpDecay: 0.055, gain: 0.62, tail: 0.28 },
  rifle: { crack: 2100, crackDecay: 0.07, body: 720, bodyDecay: 0.16, thump: 105, thumpDecay: 0.1, gain: 0.9, tail: 0.55 },
  sniper: { crack: 1500, crackDecay: 0.11, body: 430, bodyDecay: 0.32, thump: 62, thumpDecay: 0.22, gain: 1.15, tail: 1.1 },
  rifle2: { crack: 2500, crackDecay: 0.06, body: 820, bodyDecay: 0.13, thump: 120, thumpDecay: 0.085, gain: 0.85, tail: 0.5 },
  shotgun: { crack: 1300, crackDecay: 0.1, body: 380, bodyDecay: 0.34, thump: 58, thumpDecay: 0.24, gain: 1.25, tail: 0.95 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Sofort stumm (z. B. für den Notizblock) und wieder an */
  mute(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  // Innenhof-Hall: frühe Echos an den Wänden plus diffuser Nachhall
  _impulse(duration) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * 0.5;
      }
      for (const [ms, g] of [[38, 0.7], [71, 0.5], [115, 0.35], [168, 0.22]]) {
        const at = Math.floor((ms + c * 7) * rate / 1000);
        for (let k = 0; k < 240 && at + k < len; k++) ch[at + k] += (Math.random() * 2 - 1) * g * (1 - k / 240);
      }
    }
    return buf;
  }

  updateListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  // Ziel-Knoten: mit Position räumlich (HRTF), sonst direkt. reverb = Anteil in den Hall,
  // ref = Abstand, ab dem es leiser wird (Schüsse tragen weiter als Schritte).
  _out(position, gain = 1, reverb = 0.5, ref = 2.5) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head = g;
    if (position) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = 1.1;
      p.maxDistance = 120;
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
      g.connect(p);
      head = p;
    }
    head.connect(this.master);
    if (reverb > 0) {
      const r = ctx.createGain();
      r.gain.value = reverb;
      head.connect(r).connect(this.reverb);
    }
    return g;
  }

  _env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + Math.max(attack, 0.001));
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _noise(dest, t0, { type = 'bandpass', freq = 1000, freqEnd, q = 1, gain = 1, attack = 0.001, decay = 0.1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t0, gain, attack, decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + attack + decay + 0.05);
  }

  _tone(dest, t0, { type = 'sine', freq = 440, freqEnd, gain = 0.5, attack = 0.002, decay = 0.2 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + attack + decay);
    const g = ctx.createGain();
    this._env(g, t0, gain, attack, decay);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + attack + decay + 0.05);
  }

  // Rauschen, das gut 40-mal pro Sekunde aufknallt und abklingt (Sägezahn als Lautstärke, so
  // schnell wie die Einschläge), darunter ein tiefes Brummen im selben Takt: "Drrrrrt"
  _cannon(t, dur, pos, vol) {
    const ctx = this.ctx;
    const o = this._out(pos, 2.4 * vol, 1.1, 60);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.03);
    env.gain.setValueAtTime(1, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.22);
    env.connect(o);
    const rate = 40 + Math.random() * 5;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = rate;
    // fallender Sägezahn: jeder Schuss knallt sofort und klingt bis zum nächsten ab
    const depth = ctx.createGain();
    depth.gain.value = -0.5;
    lfo.connect(depth).connect(am.gain);
    src.connect(lp).connect(am).connect(env);
    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = rate;
    const glp = ctx.createBiquadFilter();
    glp.type = 'lowpass';
    glp.frequency.value = 340;
    const gg = ctx.createGain();
    gg.gain.value = 0.6;
    growl.connect(glp).connect(gg).connect(env);
    const end = t + dur + 0.3;
    src.start(t, Math.random());
    lfo.start(t);
    growl.start(t);
    src.stop(end);
    lfo.stop(end);
    growl.stop(end);
    // Nachhall über den Hof
    this._noise(o, t + dur, { type: 'lowpass', freq: 700, freqEnd: 150, q: 0.6, gain: 0.45, attack: 0.02, decay: 1.2 });
  }

  /** Schuss; mit position (Gegner) räumlich und mit mehr Hall */
  shot(profile, position = null) {
    if (!this.ctx) return;
    const p = GUN[profile] || GUN.rifle;
    const t = this.ctx.currentTime;
    const pitch = 0.95 + Math.random() * 0.1;
    const out = position ? this._out(position, p.gain * 1.1, 1.3, 14) : this._out(null, p.gain, 0.9);
    this._noise(out, t, { type: 'bandpass', freq: p.crack * pitch, q: 0.7, gain: 1.0, decay: p.crackDecay });
    this._noise(out, t, { type: 'lowpass', freq: p.body * 2.2 * pitch, freqEnd: p.body * 0.5, q: 0.8, gain: 1.1, decay: p.bodyDecay });
    this._tone(out, t, { type: 'sine', freq: p.thump * 2.2 * pitch, freqEnd: p.thump * 0.6, gain: 1.0, decay: p.thumpDecay });
    this._noise(out, t + 0.012, { type: 'lowpass', freq: 900, freqEnd: 300, q: 0.5, gain: 0.22, attack: 0.02, decay: p.tail });
    this._noise(out, t, { type: 'highpass', freq: 5000, q: 0.5, gain: 0.35, decay: 0.012 });
  }

  play(name, opt = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (opt.delay || 0);
    const pos = opt.position || null;
    const vol = opt.volume ?? 1;
    switch (name) {
      case 'dry': {
        const o = this._out(pos, 0.5 * vol, 0.1);
        this._noise(o, t, { type: 'bandpass', freq: 3200, q: 4, gain: 1, decay: 0.03 });
        break;
      }
      case 'magOut': {
        const o = this._out(pos, 0.45 * vol, 0.15);
        this._noise(o, t, { type: 'bandpass', freq: 2600, q: 3, gain: 1, decay: 0.03 });
        this._noise(o, t + 0.03, { type: 'bandpass', freq: 1500, q: 2, gain: 0.6, decay: 0.12 });
        break;
      }
      // leeres Magazin fällt auf den Boden: zwei metallische Aufschläge
      case 'magDrop': {
        const o = this._out(pos, 0.35 * vol, 0.25);
        this._noise(o, t, { type: 'bandpass', freq: 2300, q: 4, gain: 0.9, decay: 0.05 });
        this._tone(o, t, { freq: 1650 + Math.random() * 300, gain: 0.12, decay: 0.12 });
        this._noise(o, t + 0.09, { type: 'bandpass', freq: 3100, q: 5, gain: 0.5, decay: 0.04 });
        this._noise(o, t, { type: 'lowpass', freq: 500, q: 1, gain: 0.4, decay: 0.05 });
        break;
      }
      case 'magIn': {
        const o = this._out(pos, 0.55 * vol, 0.15);
        this._noise(o, t, { type: 'bandpass', freq: 1800, q: 2, gain: 1, decay: 0.05 });
        this._noise(o, t, { type: 'lowpass', freq: 400, q: 1, gain: 0.8, decay: 0.06 });
        this._tone(o, t, { freq: 2200, gain: 0.08, decay: 0.08 });
        break;
      }
      case 'rack': {
        const o = this._out(pos, 0.5 * vol, 0.15);
        this._noise(o, t, { type: 'bandpass', freq: 2200, q: 3, gain: 0.8, decay: 0.04 });
        this._noise(o, t + 0.11, { type: 'bandpass', freq: 2800, q: 3, gain: 1, decay: 0.05 });
        this._tone(o, t + 0.11, { freq: 1900, gain: 0.08, decay: 0.12 });
        break;
      }
      case 'pump': {
        const o = this._out(pos, 0.6 * vol, 0.2);
        this._noise(o, t, { type: 'bandpass', freq: 700, freqEnd: 1400, q: 1.5, gain: 0.7, attack: 0.02, decay: 0.1 });
        this._noise(o, t + 0.1, { type: 'bandpass', freq: 2200, q: 3, gain: 1, decay: 0.05 });
        this._noise(o, t + 0.2, { type: 'bandpass', freq: 1400, freqEnd: 700, q: 1.5, gain: 0.6, attack: 0.02, decay: 0.08 });
        this._noise(o, t + 0.29, { type: 'bandpass', freq: 2600, q: 3, gain: 1, decay: 0.05 });
        this._tone(o, t + 0.29, { freq: 1500, gain: 0.08, decay: 0.12 });
        break;
      }
      case 'shellIn': {
        const o = this._out(pos, 0.45 * vol, 0.1);
        this._noise(o, t, { type: 'bandpass', freq: 1600, q: 2, gain: 0.8, decay: 0.04 });
        this._noise(o, t + 0.05, { type: 'bandpass', freq: 2400, q: 3, gain: 0.7, decay: 0.03 });
        break;
      }
      case 'bolt': {
        const o = this._out(pos, 0.5 * vol, 0.15);
        this._noise(o, t, { type: 'bandpass', freq: 1400, q: 2, gain: 0.6, decay: 0.05 });
        this._noise(o, t + 0.18, { type: 'bandpass', freq: 2400, q: 3, gain: 0.8, decay: 0.06 });
        this._noise(o, t + 0.36, { type: 'bandpass', freq: 2000, q: 3, gain: 0.9, decay: 0.05 });
        this._tone(o, t + 0.36, { freq: 1700, gain: 0.07, decay: 0.12 });
        break;
      }
      case 'draw': {
        const o = this._out(pos, 0.35 * vol, 0.1);
        this._noise(o, t, { type: 'bandpass', freq: 1200, q: 0.6, gain: 0.5, attack: 0.04, decay: 0.16 });
        this._noise(o, t + 0.14, { type: 'bandpass', freq: 2600, q: 3, gain: 0.8, decay: 0.035 });
        break;
      }
      case 'scope': {
        const o = this._out(null, 0.3 * vol, 0.05);
        this._noise(o, t, { type: 'bandpass', freq: 3500, q: 5, gain: 1, decay: 0.03 });
        break;
      }
      case 'step': {
        const s = opt.surface || 'sand';
        const o = this._out(pos, 0.34 * vol, 0.12);
        if (s === 'metal') {
          this._noise(o, t, { type: 'bandpass', freq: 1100, q: 7, gain: 0.8, decay: 0.16 });
          this._noise(o, t, { type: 'bandpass', freq: 2900, q: 9, gain: 0.4, decay: 0.12 });
        } else if (s === 'wood') {
          this._noise(o, t, { type: 'lowpass', freq: 900, q: 2, gain: 0.9, decay: 0.07 });
          this._tone(o, t, { freq: 190, freqEnd: 140, gain: 0.35, decay: 0.08 });
        } else if (s === 'sand') {
          this._noise(o, t, { type: 'lowpass', freq: 1500, q: 0.7, gain: 0.8, decay: 0.06 });
          this._noise(o, t + 0.02, { type: 'bandpass', freq: 3200, q: 1, gain: 0.35, decay: 0.06 });
        } else {
          this._noise(o, t, { type: 'bandpass', freq: 2200, q: 1.2, gain: 0.7, decay: 0.045 });
          this._noise(o, t, { type: 'lowpass', freq: 500, q: 1, gain: 0.5, decay: 0.05 });
        }
        break;
      }
      case 'land': {
        const o = this._out(pos, 0.5 * vol, 0.15);
        this._noise(o, t, { type: 'lowpass', freq: 350, q: 1, gain: 1, decay: 0.12 });
        this._noise(o, t, { type: 'lowpass', freq: 1500, q: 0.7, gain: 0.4, decay: 0.08 });
        break;
      }
      case 'impact': {
        const s = opt.surface || 'stone';
        const o = this._out(pos, 0.35 * vol, 0.2);
        if (s === 'metal') {
          this._tone(o, t, { freq: 2400 + Math.random() * 1200, gain: 0.25, decay: 0.18 });
          this._noise(o, t, { type: 'highpass', freq: 3000, q: 1, gain: 0.8, decay: 0.03 });
        } else if (s === 'wood') {
          this._noise(o, t, { type: 'lowpass', freq: 1200, q: 2, gain: 1, decay: 0.05 });
        } else {
          this._noise(o, t, { type: 'bandpass', freq: 3500, q: 0.8, gain: 1, decay: 0.035 });
          this._noise(o, t, { type: 'lowpass', freq: 700, q: 1, gain: 0.5, decay: 0.06 });
        }
        break;
      }
      case 'ding':
      case 'dingHead': {
        const f = (name === 'dingHead' ? 1350 : 780) * (0.97 + Math.random() * 0.06);
        const o = this._out(pos, 0.55 * vol, 0.5);
        this._tone(o, t, { freq: f, gain: 0.8, decay: 0.55 });
        this._tone(o, t, { freq: f * 2.76, gain: 0.35, decay: 0.3 });
        this._tone(o, t, { freq: f * 5.4, gain: 0.15, decay: 0.15 });
        this._noise(o, t, { type: 'highpass', freq: 4000, q: 1, gain: 0.6, decay: 0.02 });
        if (name === 'dingHead') {
          const u = this._out(null, 0.25 * vol, 0);
          this._tone(u, t + 0.02, { freq: 2600, gain: 0.5, decay: 0.12 });
        }
        break;
      }
      case 'targetUp': {
        const o = this._out(pos, 0.45 * vol, 0.3);
        this._noise(o, t, { type: 'bandpass', freq: 500, freqEnd: 1200, q: 2, gain: 0.5, attack: 0.05, decay: 0.25 });
        this._noise(o, t + 0.3, { type: 'bandpass', freq: 1400, q: 3, gain: 0.9, decay: 0.06 });
        this._tone(o, t + 0.3, { freq: 600, gain: 0.2, decay: 0.2 });
        break;
      }
      case 'targetDown': {
        const o = this._out(pos, 0.6 * vol, 0.4);
        this._tone(o, t + 0.28, { freq: 420, gain: 0.5, decay: 0.45 });
        this._tone(o, t + 0.28, { freq: 1130, gain: 0.25, decay: 0.3 });
        this._noise(o, t + 0.28, { type: 'lowpass', freq: 600, q: 1, gain: 1, decay: 0.15 });
        break;
      }
      case 'swing': {
        const o = this._out(pos, 0.4 * vol, 0.1);
        this._noise(o, t, { type: 'bandpass', freq: 500, freqEnd: 2200, q: 1.5, gain: 0.8, attack: 0.08, decay: 0.14 });
        break;
      }
      case 'knifeHit': {
        const o = this._out(pos, 0.7 * vol, 0.3);
        this._noise(o, t, { type: 'lowpass', freq: 800, q: 2, gain: 1, decay: 0.08 });
        this._tone(o, t, { freq: 620, gain: 0.35, decay: 0.3 });
        break;
      }
      case 'pin': {
        const o = this._out(pos, 0.4 * vol, 0.05);
        this._tone(o, t, { freq: 3200, gain: 0.3, decay: 0.06 });
        this._tone(o, t + 0.05, { freq: 4600, gain: 0.25, decay: 0.08 });
        break;
      }
      case 'throw': {
        const o = this._out(pos, 0.4 * vol, 0.1);
        this._noise(o, t, { type: 'bandpass', freq: 400, freqEnd: 1400, q: 1.2, gain: 0.8, attack: 0.05, decay: 0.2 });
        break;
      }
      case 'bounce': {
        const o = this._out(pos, 0.45 * vol, 0.2);
        this._tone(o, t, { freq: 1700 + Math.random() * 500, gain: 0.5, decay: 0.09 });
        this._tone(o, t, { freq: 3300 + Math.random() * 600, gain: 0.3, decay: 0.06 });
        this._noise(o, t, { type: 'lowpass', freq: 900, q: 1, gain: 0.5, decay: 0.04 });
        break;
      }
      case 'explosion': {
        const o = this._out(pos, 1.6 * vol, 1.2);
        this._noise(o, t, { type: 'lowpass', freq: 1400, freqEnd: 120, q: 0.7, gain: 1.4, decay: 1.4 });
        this._noise(o, t, { type: 'bandpass', freq: 1600, q: 0.6, gain: 1, decay: 0.12 });
        this._tone(o, t, { freq: 70, freqEnd: 28, gain: 1.4, decay: 0.8 });
        this._noise(o, t + 0.15, { type: 'highpass', freq: 2500, q: 0.5, gain: 0.15, attack: 0.1, decay: 0.8 });
        break;
      }
      case 'flashbang': {
        const o = this._out(pos, 1.3 * vol, 1.0);
        this._noise(o, t, { type: 'highpass', freq: 700, q: 0.6, gain: 1.4, decay: 0.3 });
        this._tone(o, t, { freq: 110, freqEnd: 40, gain: 1, decay: 0.4 });
        break;
      }
      case 'tinnitus': {
        const dur = opt.duration || 2;
        const o = this._out(null, 0.14 * vol, 0);
        this._tone(o, t, { freq: 3520, gain: 1, attack: 0.05, decay: dur });
        this._tone(o, t, { freq: 3585, gain: 0.6, attack: 0.05, decay: dur * 0.8 });
        break;
      }
      case 'smoke': {
        const o = this._out(pos, 0.5 * vol, 0.3);
        this._noise(o, t, { type: 'bandpass', freq: 2600, q: 0.6, gain: 1, attack: 0.08, decay: 3.2 });
        this._noise(o, t, { type: 'lowpass', freq: 500, q: 1, gain: 0.6, decay: 0.3 });
        break;
      }
      case 'buy': {
        const o = this._out(null, 0.25 * vol, 0);
        this._tone(o, t, { type: 'triangle', freq: 1320, gain: 0.8, decay: 0.08 });
        this._tone(o, t + 0.07, { type: 'triangle', freq: 1760, gain: 0.8, decay: 0.14 });
        break;
      }
      case 'deny': {
        const o = this._out(null, 0.2 * vol, 0);
        this._tone(o, t, { type: 'square', freq: 170, gain: 0.5, decay: 0.16 });
        break;
      }
      case 'beep': {
        const o = this._out(null, 0.22 * vol, 0);
        this._tone(o, t, { freq: opt.freq || 880, gain: 0.8, decay: 0.12 });
        break;
      }
      case 'roundStart': {
        const o = this._out(null, 0.25 * vol, 0.2);
        this._tone(o, t, { type: 'triangle', freq: 660, gain: 0.8, decay: 0.15 });
        this._tone(o, t + 0.15, { type: 'triangle', freq: 990, gain: 0.8, decay: 0.3 });
        break;
      }
      case 'roundWin': {
        const o = this._out(null, 0.22 * vol, 0.3);
        [523, 659, 784, 1046].forEach((f, i) => this._tone(o, t + i * 0.11, { type: 'triangle', freq: f, gain: 0.8, decay: 0.35 }));
        break;
      }
      case 'roundLose': {
        const o = this._out(null, 0.22 * vol, 0.3);
        [392, 330, 262].forEach((f, i) => this._tone(o, t + i * 0.16, { type: 'triangle', freq: f, gain: 0.8, decay: 0.4 }));
        break;
      }
      case 'hurt': {
        const o = this._out(null, 0.5 * vol, 0.1);
        this._noise(o, t, { type: 'lowpass', freq: 500, q: 1, gain: 1, decay: 0.15 });
        break;
      }
      // Rückmeldung für den Schützen: dumpfer Körpertreffer, heller Helmtreffer
      case 'hitBody': {
        const o = this._out(null, 0.5 * vol, 0.05);
        this._noise(o, t, { type: 'lowpass', freq: 700, q: 1.2, gain: 1, decay: 0.07 });
        this._tone(o, t, { freq: 180, freqEnd: 90, gain: 0.5, decay: 0.08 });
        break;
      }
      case 'hitHead': {
        const o = this._out(null, 0.45 * vol, 0.1);
        this._tone(o, t, { freq: 2300 + Math.random() * 200, gain: 0.5, decay: 0.16 });
        this._tone(o, t, { freq: 5200, gain: 0.2, decay: 0.08 });
        this._noise(o, t, { type: 'lowpass', freq: 800, q: 1, gain: 0.7, decay: 0.06 });
        break;
      }
      case 'chat': {
        const o = this._out(null, 0.2 * vol, 0.05);
        this._tone(o, t, { type: 'sine', freq: 1047, gain: 0.7, decay: 0.09 });
        this._tone(o, t + 0.07, { type: 'sine', freq: 1397, gain: 0.6, decay: 0.12 });
        break;
      }
      // Treffer auf einen Gegner mit Spawn-Schutz: heller, abprallender Klang
      case 'shield': {
        const o = this._out(null, 0.3 * vol, 0.1);
        this._tone(o, t, { type: 'triangle', freq: 1900, freqEnd: 1300, gain: 0.6, decay: 0.12 });
        this._noise(o, t, { type: 'highpass', freq: 5000, q: 1, gain: 0.3, decay: 0.03 });
        break;
      }
      case 'kill': {
        const o = this._out(null, 0.3 * vol, 0.1);
        this._tone(o, t, { type: 'triangle', freq: 880, gain: 0.7, decay: 0.12 });
        this._tone(o, t + 0.09, { type: 'triangle', freq: 1320, gain: 0.7, decay: 0.2 });
        break;
      }
      // ---------- Bombe ----------
      // Tastendruck beim Legen (auch beim Gegner zu hören)
      case 'plantKey': {
        const o = this._out(pos, 0.35 * vol, 0.1, 3);
        this._noise(o, t, { type: 'bandpass', freq: 2600, q: 5, gain: 0.7, decay: 0.02 });
        this._tone(o, t + 0.01, { type: 'square', freq: 1800 + Math.random() * 400, gain: 0.12, decay: 0.07 });
        break;
      }
      case 'bombBeep': {
        const o = this._out(pos, 0.5 * vol, 0.25, 6);
        this._tone(o, t, { type: 'sine', freq: opt.freq || 2800, gain: 0.8, decay: 0.08 });
        this._tone(o, t, { type: 'square', freq: (opt.freq || 2800) / 2, gain: 0.05, decay: 0.06 });
        break;
      }
      case 'bombPlanted': {
        const o = this._out(null, 0.3 * vol, 0.2);
        [988, 988, 1318].forEach((f, i) => this._tone(o, t + i * 0.12, { type: 'square', freq: f, gain: 0.35, decay: 0.09 }));
        this._tone(o, t + 0.36, { type: 'triangle', freq: 660, gain: 0.7, decay: 0.45 });
        break;
      }
      case 'defuseTick': {
        const o = this._out(pos, 0.4 * vol, 0.1, 3);
        this._noise(o, t, { type: 'bandpass', freq: 3200, q: 6, gain: 0.8, decay: 0.025 });
        this._noise(o, t + 0.04, { type: 'bandpass', freq: 1900, q: 4, gain: 0.4, decay: 0.03 });
        break;
      }
      case 'bombDefused': {
        const o = this._out(pos, 0.5 * vol, 0.3, 8);
        this._tone(o, t, { type: 'sine', freq: 1500, freqEnd: 260, gain: 0.6, attack: 0.01, decay: 0.7 });
        this._noise(o, t, { type: 'bandpass', freq: 2400, q: 3, gain: 0.8, decay: 0.05 });
        break;
      }
      case 'bombExplode': {
        const o = this._out(pos, 2.4 * vol, 1.6, 30);
        this._noise(o, t, { type: 'lowpass', freq: 1100, freqEnd: 50, q: 0.7, gain: 1.6, attack: 0.005, decay: 3.2 });
        this._noise(o, t, { type: 'bandpass', freq: 1400, q: 0.5, gain: 1.2, decay: 0.2 });
        this._tone(o, t, { freq: 55, freqEnd: 18, gain: 1.8, attack: 0.01, decay: 2.2 });
        this._noise(o, t + 0.3, { type: 'highpass', freq: 2200, q: 0.5, gain: 0.2, attack: 0.2, decay: 2.4 });
        break;
      }
      // ---------- Luftschlag ----------
      case 'specialReady': {
        const o = this._out(null, 0.22 * vol, 0.2);
        [660, 880, 1320].forEach((f, i) => this._tone(o, t + i * 0.09, { type: 'triangle', freq: f, gain: 0.8, decay: 0.3 }));
        break;
      }
      // Funkspruch: kurzes Rauschen, dann Bestätigungston
      case 'radio': {
        const o = this._out(null, 0.3 * vol, 0.05);
        this._noise(o, t, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.6, attack: 0.01, decay: 0.25 });
        this._tone(o, t + 0.28, { type: 'square', freq: 1046, gain: 0.25, decay: 0.12 });
        this._tone(o, t + 0.42, { type: 'square', freq: 1568, gain: 0.25, decay: 0.16 });
        break;
      }
      // Warnung im Zielgebiet: schnelles Piepen
      case 'airWarn': {
        const o = this._out(null, 0.2 * vol, 0);
        for (let i = 0; i < 6; i++) this._tone(o, t + i * 0.16, { type: 'square', freq: i % 2 ? 740 : 988, gain: 0.5, decay: 0.1 });
        break;
      }
      // Überflug: anschwellendes Dröhnen, das am höchsten Punkt vorbeizieht
      case 'jet': {
        const dur = opt.duration || 2.6;
        const o = this._out(null, 0.9 * vol, 0.6);
        this._noise(o, t, { type: 'bandpass', freq: 260, freqEnd: 900, q: 0.6, gain: 1, attack: dur * 0.55, decay: dur * 0.45 });
        this._noise(o, t, { type: 'lowpass', freq: 500, freqEnd: 120, q: 0.7, gain: 0.8, attack: dur * 0.6, decay: dur * 0.6 });
        this._tone(o, t, { type: 'sawtooth', freq: 150, freqEnd: 95, gain: 0.05, attack: dur * 0.55, decay: dur * 0.4 });
        break;
      }
      // Bordkanone: so schnelle Schussfolge, dass sie zu einem ratternden "Drrrrrt" verschwimmt
      case 'cannon': {
        this._cannon(t, opt.duration || 1.2, pos, vol);
        break;
      }
      // Granate der Bordkanone schlägt ein: harter Knall mit dumpfem Nachdröhnen
      case 'cannonHit': {
        const o = this._out(pos, 0.9 * vol, 0.6, 8);
        this._noise(o, t, { type: 'bandpass', freq: 1500 + Math.random() * 400, q: 0.7, gain: 1, decay: 0.07 });
        this._noise(o, t, { type: 'lowpass', freq: 650, freqEnd: 120, q: 0.8, gain: 1, decay: 0.28 });
        this._tone(o, t, { freq: 95, freqEnd: 40, gain: 0.7, decay: 0.18 });
        break;
      }
      default:
        break;
    }
  }
}
