// Procedural background music → 16-bit PCM WAV, rendered in pure JS (no WebAudio needed).
// Each style is a tiny step-sequenced track: kick, bass, pad and hats.

export const MUSIC_STYLES = [
  { id: 'none', label: 'No music' },
  { id: 'lofi', label: 'Lo-fi chill', bpm: 76, root: 110.0, minor: true, kick: 0.5, bass: 0.5, pad: 0.8, hats: 0.35, snare: 0.3 },
  { id: 'trap', label: 'Trap energy', bpm: 140, root: 82.4, minor: true, kick: 1.0, bass: 0.9, pad: 0.5, hats: 0.8, snare: 0.7 },
  { id: 'cinematic', label: 'Cinematic rise', bpm: 90, root: 98.0, minor: true, kick: 0.8, bass: 0.6, pad: 1.0, hats: 0.25, snare: 0.4 },
  { id: 'phonk', label: 'Phonk drive', bpm: 130, root: 73.4, minor: true, kick: 1.0, bass: 0.8, pad: 0.4, hats: 0.6, snare: 0.6 },
  { id: 'upbeat', label: 'Upbeat pop', bpm: 118, root: 130.8, minor: false, kick: 0.8, bass: 0.7, pad: 0.7, hats: 0.6, snare: 0.5 },
  { id: 'ambient', label: 'Ambient pads', bpm: 60, root: 110.0, minor: false, kick: 0.0, bass: 0.25, pad: 1.0, hats: 0.0, snare: 0.0 },
  { id: 'funk', label: 'Funk groove', bpm: 104, root: 98.0, minor: false, kick: 0.7, bass: 0.9, pad: 0.4, hats: 0.7, snare: 0.6 },
];

const SR = 44100;

function noteHz(root, semis) { return root * Math.pow(2, semis / 12); }

export function renderMusicWav(styleId, seconds = 30) {
  const st = MUSIC_STYLES.find((s) => s.id === styleId) || MUSIC_STYLES[0];
  const n = Math.max(1, Math.round(seconds * SR));
  const out = new Float32Array(n);
  if (st.id === 'none') return wavFromFloats(out);

  const beat = 60 / st.bpm;
  const steps = Math.ceil(seconds / beat) + 8;
  // chord: root, third, fifth, octave
  const third = st.minor ? 3 : 4;
  const chord = [0, third, 7, 12];

  const at = (t) => Math.floor(t * SR);

  for (let i = 0; i < steps; i++) {
    const t0 = i * beat;
    // kick on every beat (or half-time feel)
    if (st.kick > 0 && (st.bpm < 120 || i % 2 === 0)) addKick(out, t0, st.kick);
    // snare on 2 & 4
    if (st.snare > 0 && i % 4 === 2) addSnare(out, t0, st.snare);
    // hats on off-beats
    if (st.hats > 0) addHat(out, t0 + beat / 2, st.hats * (i % 2 ? 0.7 : 1));
    // bass on 8ths
    if (st.bass > 0) {
      const deg = [0, 0, 7, 3][i % 4];
      addBass(out, t0, noteHz(st.root / 2, deg), beat * 0.9, st.bass);
      addBass(out, t0 + beat / 2, noteHz(st.root / 2, deg), beat * 0.4, st.bass * 0.6);
    }
    // pad at bar starts
    if (st.pad > 0 && i % 4 === 0) {
      for (const c of chord) addPad(out, t0, noteHz(st.root, c), beat * 4, st.pad * 0.35);
    }
  }

  // gentle limiter / fade in-out
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.85 / peak : 1;
  const fade = Math.min(Math.floor(SR * 0.4), Math.floor(n / 4));
  for (let i = 0; i < n; i++) {
    let g = gain;
    if (i < fade) g *= i / fade;
    if (i > n - fade) g *= (n - i) / fade;
    out[i] *= g;
  }
  return wavFromFloats(out);
}

function addKick(out, t, vel) {
  const start = Math.floor(t * SR), len = Math.floor(SR * 0.16);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const p = i / len;
    const f = 130 * Math.pow(0.32, p) + 42;
    const env = Math.pow(1 - p, 2.2);
    out[start + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * 0.95 * vel;
  }
}

function addSnare(out, t, vel) {
  const start = Math.floor(t * SR), len = Math.floor(SR * 0.13);
  let s = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const p = i / len;
    const noise = Math.random() * 2 - 1;
    s = s * 0.72 + noise * 0.28;
    const env = Math.pow(1 - p, 1.6);
    out[start + i] += s * env * 0.6 * vel;
  }
}

function addHat(out, t, vel) {
  const start = Math.floor(t * SR), len = Math.floor(SR * 0.045);
  let prev = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const p = i / len;
    const noise = Math.random() * 2 - 1;
    const hp = noise - prev; // crude high-pass
    prev = noise;
    out[start + i] += hp * Math.pow(1 - p, 3) * 0.32 * vel;
  }
}

function addBass(out, t, freq, dur, vel) {
  const start = Math.floor(t * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const p = i / len;
    const env = Math.min(1, p * 12) * Math.pow(1 - p, 1.4);
    const ph = 2 * Math.PI * freq * (i / SR);
    // 2-harmonic "sawish" bass
    const v = Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.25 + Math.sin(ph * 3) * 0.08;
    out[start + i] += v * env * 0.5 * vel;
  }
}

function addPad(out, t, freq, dur, vel) {
  const start = Math.floor(t * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const p = i / len;
    const env = Math.min(1, p * 6) * Math.min(1, (1 - p) * 6);
    const detune = 1 + (Math.random() - 0.5) * 0.0015;
    const ph = 2 * Math.PI * freq * detune * (i / SR);
    const v = Math.sin(ph) * 0.6 + Math.sin(ph * 1.005) * 0.3 + Math.sin(ph * 2.002) * 0.1;
    out[start + i] += v * env * vel;
  }
}

function wavFromFloats(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);          // PCM
  v.setUint16(22, 1, true);          // mono
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buf;
}
