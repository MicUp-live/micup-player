/**
 * Sound FX Pads and Atmosphere Engine
 * 
 * Provides instant sound triggers (Applause, Air Horn, Drum Roll, Rimshot, Laugh, Scratch).
 * Synthesizes realistic audio using Web Audio API nodes so pads work 100% offline
 * with zero external asset dependencies.
 */

import { audioEngine } from '../audio/audio-engine.js';

export class SoundPads {
  constructor() {
    this.customSounds = {};
  }

  async play(padId) {
    await audioEngine.init();
    const ctx = audioEngine.ctx;
    if (!ctx) return;

    switch (padId) {
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
    }
  }

  // --- Synthetic Sound Generators ---

  /**
   * Generates white/pink noise buffer
   */
  createNoiseBuffer(ctx, durationSec) {
    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Crowd Applause: Filtered noise with multi-burst claps
   */
  playApplause(ctx) {
    const now = ctx.currentTime;
    const duration = 3.5;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, duration);

    // Bandpass filter for crowd clapping frequency (800Hz - 2500Hz)
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
    gain.connect(audioEngine.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Dancehall / Reggae Air Horn: Classic tri-tone multi-burst sound
   */
  playAirHorn(ctx) {
    const now = ctx.currentTime;
    // Classic air horn frequencies: Eb4 (~311Hz), G4 (~392Hz), Bb4 (~466Hz)
    const freqs = [311.13, 392.00, 466.16];
    const bursts = [0, 0.22, 0.44];

    bursts.forEach(startTime => {
      const burstStart = now + startTime;
      const burstLen = 0.18;

      freqs.forEach(f => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, burstStart);
        // Slight pitch drop for authentic horn feel
        osc.frequency.exponentialRampToValueAtTime(f * 0.96, burstStart + burstLen);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, burstStart);
        gain.gain.exponentialRampToValueAtTime(0.001, burstStart + burstLen);

        osc.connect(gain);
        gain.connect(audioEngine.masterGain);

        osc.start(burstStart);
        osc.stop(burstStart + burstLen);
      });
    });
  }

  /**
   * Snare Drum Roll with crescendo
   */
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
    gain.connect(audioEngine.masterGain);

    noise.start(now);
    noise.stop(now + duration);

    // Final crash/hit
    setTimeout(() => {
      this.playRimshot(ctx);
    }, (duration - 0.05) * 1000);
  }

  /**
   * Rimshot: "Ba-dum-tss"
   */
  playRimshot(ctx) {
    const now = ctx.currentTime;

    // Drum hit (low sine punch)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(oscGain);
    oscGain.connect(audioEngine.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Cymbal crash / snap (filtered noise)
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
    cymbalGain.connect(audioEngine.masterGain);
    noise.start(now);
    noise.stop(now + 0.7);
  }

  /**
   * Laughter: Modulated pitch formant
   */
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
      gain.connect(audioEngine.masterGain);

      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  /**
   * DJ Vinyl Scratch / Tape Rewind
   */
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
    gain.connect(audioEngine.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }
}

export const soundPads = new SoundPads();
