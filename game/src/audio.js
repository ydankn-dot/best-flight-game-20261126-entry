// Procedural sound for the Kestrel: an engine hum that follows the
// throttle, wind that follows the speed, a chime for each ring, and a thud
// for a landing. Everything is synthesised with WebAudio — no sound files.
// Audio starts only after the pilot's first key or click, and never in
// screenshot mode.

export function createAudio() {
  const audio = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    enabled: false,
  };

  audio.start = function start() {
    if (audio.ctx || audio.enabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audio.ctx = ctx;
      audio.enabled = true;
      // Engine: two detuned sawtooths through a low-pass filter.
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 70;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 71.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      audio.engineOsc = osc1;
      audio.engineOsc2 = osc2;
      audio.engineGain = gain;
      // Wind: looped noise through a band-pass filter.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 600;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
      audio.windGain = windGain;
    } catch (err) {
      audio.enabled = false;
    }
  };

  audio.update = function update(throttle, speed) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const freq = 55 + throttle * 95;
    audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(freq * 1.02, t, 0.08);
    audio.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1);
    audio.windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0012), t, 0.15);
  };

  audio.chime = function chime() {
    if (!audio.ctx || audio.muted) return;
    const ctx = audio.ctx;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.55);
    });
  };

  audio.thud = function thud() {
    if (!audio.ctx || audio.muted) return;
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.ctx) {
      audio.engineGain.gain.value = 0;
      audio.windGain.gain.value = 0;
    }
    return audio.muted;
  };

  return audio;
}
