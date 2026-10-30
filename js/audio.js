// Sons sintetizados na hora (sem arquivos): ronco da pedra no gelo, batida de granito, vassoura,
// plateia (murmúrio, aplauso, "ohhh"), cliques. Só liga depois de um clique ou da entrada no VR.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3, false);
      this.brown = this.makeNoise(3, true);
      this.rumble = this.loop(this.brown, 'lowpass', 160, 1.5);
      this.broom = this.loop(this.white, 'bandpass', 3800, 0.8);
      this.crowd = this.loop(this.brown, 'bandpass', 420, 0.6);
      this.crowd.g.gain.value = 0.05;
      this.crowdT = 0;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  makeNoise(sec, brown) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 7; } else d[i] = w * 0.5;
    }
    return buf;
  }

  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }

  // Ronco das pedras deslizando: speed em m/s, near 0..1 (quanto mais perto de quem ouve, mais alto).
  setRumble(speed, near) {
    if (!this.rumble) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 4);
    this.rumble.g.gain.setTargetAtTime(s < 0.01 ? 0 : (0.12 + 0.5 * s) * near, t, 0.08);
    this.rumble.f.frequency.setTargetAtTime(90 + s * 220, t, 0.1);
  }

  // Vassoura no gelo: intensidade 0..1, com o "chiado" das passadas.
  setBroom(v, time) {
    if (!this.broom) return;
    const t = this.ctx.currentTime;
    const stroke = 0.55 + 0.45 * Math.abs(Math.sin(time * 11));
    this.broom.g.gain.setTargetAtTime(v * 0.32 * stroke, t, 0.03);
    this.broom.f.frequency.setTargetAtTime(3000 + v * 1800, t, 0.05);
  }

  // Murmúrio da plateia: varia devagar sozinho.
  updateCrowd(dt, level = 1) {
    if (!this.crowd) return;
    this.crowdT -= dt;
    if (this.crowdT <= 0) {
      this.crowdT = 0.6 + Math.random() * 1.2;
      this.crowd.g.gain.setTargetAtTime((0.03 + Math.random() * 0.04) * level, this.ctx.currentTime, 0.6);
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  // Granito contra granito: estalo seco e agudo com um "toc" de corpo.
  hit(strength) {
    const s = Math.min(1, Math.max(0.15, strength));
    this.noise(0.05, { vol: 0.5 * s, freq: 2600, q: 1.6, type: 'bandpass' });
    this.tone(1180 + Math.random() * 120, 0.09, { vol: 0.22 * s, type: 'triangle' });
    this.tone(2350 + Math.random() * 200, 0.06, { vol: 0.12 * s });
    this.tone(330, 0.12, { vol: 0.18 * s, type: 'sine', slide: 0.7 });
  }
  // Pedra batendo na tabela do fundo/lado
  board() { this.noise(0.12, { vol: 0.25, freq: 500, q: 1, type: 'lowpass' }); this.tone(150, 0.18, { vol: 0.2, slide: 0.6 }); }
  grab() { this.tone(220, 0.08, { vol: 0.12, type: 'triangle', slide: 1.4 }); }
  release() { this.noise(0.4, { vol: 0.18, freq: 300, q: 0.7, type: 'lowpass', attack: 0.05 }); }
  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }

  // Plateia comemorando: um "uhhh" crescendo e palmas soltas.
  cheer(strength = 1) {
    if (!this.ctx) return;
    const s = Math.min(1, strength);
    this.noise(1.8, { vol: 0.14 * s, freq: 900, q: 0.7, attack: 0.25 });
    this.noise(1.4, { vol: 0.08 * s, freq: 1800, q: 1.2, attack: 0.2 });
    this.claps(Math.round(18 + 30 * s), 1.8);
  }
  claps(n, spread) {
    for (let i = 0; i < n; i++) this.noise(0.03, { vol: 0.08 + Math.random() * 0.08, freq: 1200 + Math.random() * 1400, q: 1.5, at: Math.random() * spread });
  }
  groan() { this.noise(1.2, { vol: 0.1, freq: 350, q: 0.9, attack: 0.15 }); this.tone(220, 1.0, { vol: 0.03, slide: 0.7, attack: 0.15 }); }
  horn() {
    this.tone(233, 0.9, { vol: 0.09, type: 'sawtooth', attack: 0.03 });
    this.tone(294, 0.9, { vol: 0.07, type: 'sawtooth', attack: 0.03 });
  }
  star(n) { this.tone(784 * (1 + n * 0.26), 0.35, { vol: 0.12, type: 'triangle' }); }
}
