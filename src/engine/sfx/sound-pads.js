/**
 * Sound FX Pads and Atmosphere Engine
 * 
 * Provides instant sound triggers:
 * Applause, Air Horn, Drum Roll, Rimshot, Laughter, Scratch, Crickets, Sad Trombone/Fail, Boo.
 * 
 * Uses studio-grade real audio samples with zero-latency buffer caching,
 * with resilient offline synthetic Web Audio synthesis fallback.
 */

import { audioEngine } from '../audio/audio-engine.js';

export const SOUND_DEFINITIONS = {
  applause: { file: 'applause.mp3', label: 'Applause', icon: '👏', gain: 0.9 },
  airhorn: { file: 'airhorn.mp3', label: 'Air Horn', icon: '📯', gain: 0.85 },
  drumroll: { file: 'drumroll.mp3', label: 'Drum Roll', icon: '🥁', gain: 0.9 },
  rimshot: { file: 'rimshot.mp3', label: 'Rimshot', icon: '💥', gain: 0.95 },
  laughter: { file: 'laughter.mp3', label: 'Laughter', icon: '😂', gain: 0.85 },
  scratch: { file: 'scratch.wav', label: 'Scratch', icon: '🎧', gain: 0.85 },
  crickets: { file: 'crickets.mp3', label: 'Crickets', icon: '🦗', gain: 0.8 },
  fail: { file: 'fail.mp3', label: 'Sad Trombone', icon: '🎺', gain: 0.85 },
  boo: { file: 'boo.mp3', label: 'Crowd Boo', icon: '👎', gain: 0.85 }
};

export const SOUND_ALIASES = {
  laugh: 'laughter',
  trombone: 'fail',
  'sad-trombone': 'fail',
  'sad_trombone': 'fail',
  booing: 'boo'
};

/**
 * Resolves static SFX asset URL honoring Vite BASE_PATH and deployment subdirectories
 */
export function getSfxUrl(filename) {
  try {
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const baseUrl = (typeof document !== 'undefined' && document.baseURI)
      ? document.baseURI
      : (typeof window !== 'undefined' && window.location ? window.location.href : 'http://localhost/');
    const resolvedBase = new URL(base, baseUrl);
    return new URL(`sfx/${filename}`, resolvedBase).href;
  } catch {
    return `sfx/${filename}`;
  }
}

export class SoundPads {
  constructor() {
    this.bufferCache = new Map();
    this.loadingPromises = new Map();
    this.customSounds = {};
    this.onPlay = null;
    this.isMuted = false;
  }

  /**
   * Resolve pad alias or canonical key
   */
  resolveKey(padId) {
    if (!padId) return null;
    const clean = String(padId).trim().toLowerCase();
    return SOUND_ALIASES[clean] || clean;
  }

  /**
   * Preload an audio sample buffer into Web Audio memory
   */
  async loadBuffer(ctx, key) {
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key);
    }
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key);
    }

    const def = SOUND_DEFINITIONS[key];
    if (!def) return null;

    const promise = (async () => {
      try {
        const url = getSfxUrl(def.file);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        const arrayBuffer = await res.arrayBuffer();
        // Defensive slice in case older implementations detach the buffer
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        this.bufferCache.set(key, audioBuffer);
        return audioBuffer;
      } catch (err) {
        // Fall back quietly if asset fetch/decode fails (offline, test env, etc)
        return null;
      } finally {
        this.loadingPromises.delete(key);
      }
    })();

    this.loadingPromises.set(key, promise);
    return promise;
  }

  /**
   * Preload all sound pad buffers for instantaneous zero-latency triggers
   */
  async preloadAll() {
    if (typeof window === 'undefined') return;
    try {
      await audioEngine.init();
      const ctx = audioEngine.ctx;
      if (!ctx) return;
      await Promise.all(
        Object.keys(SOUND_DEFINITIONS).map(key => this.loadBuffer(ctx, key))
      );
    } catch {
      // Ignore background preload errors
    }
  }

  /**
   * Play sound effect by ID (with instant multi-hit overlap and synthetic fallback)
   */
  async play(padId, options = {}) {
    const key = this.resolveKey(padId);
    if (!key) return;

    // Notify listeners (e.g. stage screen sync)
    this.onPlay?.(key);

    if (this.isMuted && !options.force) return;
    if (typeof window === 'undefined') return;

    await audioEngine.init();
    const ctx = audioEngine.ctx;
    if (!ctx) return;

    let buffer = this.bufferCache.get(key);
    if (!buffer) {
      buffer = await this.loadBuffer(ctx, key);
    }

    if (buffer) {
      this.playBuffer(ctx, buffer, key);
    } else {
      // Graceful fallback to synthetic audio generator
      this.playSynthetic(ctx, key);
    }
  }

  /**
   * Plays a preloaded AudioBuffer through the master audio engine gain
   */
  playBuffer(ctx, buffer, key) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const def = SOUND_DEFINITIONS[key];
    const gainNode = ctx.createGain();
    const gainVal = def?.gain ?? 0.85;
    gainNode.gain.setValueAtTime(gainVal, ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(audioEngine.masterGain || ctx.destination);

    source.start(0);
  }

  /**
   * Fallback: Synthetic sound generation if audio file is unavailable
   */
  playSynthetic(ctx, key) {
    switch (key) {
      case 'applause':
        this.playApplause(ctx);
        break;
      case 'airhorn':
        this.playAirHorn(ctx);
        break;
      case 'drumroll':
        this.playDrumRoll(ctx);
        break;
      case 'rimshot':
        this.playRimshot(ctx);
        break;
      case 'laughter':
        this.playLaughter(ctx);
        break;
      case 'scratch':
        this.playScratch(ctx);
        break;
      case 'crickets':
        this.playCrickets(ctx);
        break;
      case 'fail':
        this.playFail(ctx);
        break;
      case 'boo':
        this.playBoo(ctx);
        break;
    }
  }

  // --- Synthetic Sound Generators ---

  createNoiseBuffer(ctx, durationSec) {
    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playApplause(ctx) {
    const now = ctx.currentTime;
    const duration = 3.5;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.7, now + 0.3);
    gain.gain.setValueAtTime(0.65, now + duration - 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.masterGain || ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  playAirHorn(ctx) {
    const now = ctx.currentTime;
    const freqs = [311.13, 392.00, 466.16];
    const bursts = [0, 0.22, 0.44];

    bursts.forEach(startTime => {
      const burstStart = now + startTime;
      const burstLen = 0.18;

      freqs.forEach(f => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, burstStart);
        osc.frequency.exponentialRampToValueAtTime(f * 0.96, burstStart + burstLen);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, burstStart);
        gain.gain.exponentialRampToValueAtTime(0.001, burstStart + burstLen);

        osc.connect(gain);
        gain.connect(audioEngine.masterGain || ctx.destination);

        osc.start(burstStart);
        osc.stop(burstStart + burstLen);
      });
    });
  }

  playDrumRoll(ctx) {
    const now = ctx.currentTime;
    const duration = 2.0;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.6, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.masterGain || ctx.destination);

    noise.start(now);
    noise.stop(now + duration);

    setTimeout(() => {
      this.playRimshot(ctx);
    }, (duration - 0.05) * 1000);
  }

  playRimshot(ctx) {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(oscGain);
    oscGain.connect(audioEngine.masterGain || ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, 0.7);

    const cymbalFilter = ctx.createBiquadFilter();
    cymbalFilter.type = 'highpass';
    cymbalFilter.frequency.setValueAtTime(4000, now);

    const cymbalGain = ctx.createGain();
    cymbalGain.gain.setValueAtTime(0.5, now);
    cymbalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noise.connect(cymbalFilter);
    cymbalFilter.connect(cymbalGain);
    cymbalGain.connect(audioEngine.masterGain || ctx.destination);
    noise.start(now);
    noise.stop(now + 0.7);
  }

  playLaughter(ctx) {
    const now = ctx.currentTime;
    const haCount = 6;
    for (let i = 0; i < haCount; i++) {
      const t = now + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.12);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800 + i * 50, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioEngine.masterGain || ctx.destination);

      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  playScratch(ctx) {
    const now = ctx.currentTime;
    const duration = 0.45;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.15);
    osc.frequency.linearRampToValueAtTime(950, now + 0.3);
    osc.frequency.linearRampToValueAtTime(60, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.masterGain || ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCrickets(ctx) {
    const now = ctx.currentTime;
    for (let c = 0; c < 3; c++) {
      const chirpStart = now + c * 0.6;
      for (let p = 0; p < 4; p++) {
        const pulseStart = chirpStart + p * 0.04;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(4600 + (p % 2) * 200, pulseStart);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.08, pulseStart);
        gain.gain.exponentialRampToValueAtTime(0.001, pulseStart + 0.035);
        osc.connect(gain);
        gain.connect(audioEngine.masterGain || ctx.destination);
        osc.start(pulseStart);
        osc.stop(pulseStart + 0.04);
      }
    }
  }

  playFail(ctx) {
    const now = ctx.currentTime;
    const notes = [
      { f: 293.66, dur: 0.35, delay: 0 },
      { f: 277.18, dur: 0.35, delay: 0.4 },
      { f: 261.63, dur: 0.35, delay: 0.8 },
      { f: 246.94, dur: 1.2, delay: 1.2, slideTo: 220 }
    ];

    notes.forEach(n => {
      const start = now + n.delay;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.slideTo) {
        osc.frequency.linearRampToValueAtTime(n.slideTo, start + n.dur);
      }

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioEngine.masterGain || ctx.destination);

      osc.start(start);
      osc.stop(start + n.dur);
    });
  }

  playBoo(ctx) {
    const now = ctx.currentTime;
    const duration = 2.5;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.linearRampToValueAtTime(200, now + duration);
    filter.Q.setValueAtTime(2.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.4);
    gain.gain.setValueAtTime(0.45, now + duration - 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioEngine.masterGain || ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }
}

export const soundPads = new SoundPads();
