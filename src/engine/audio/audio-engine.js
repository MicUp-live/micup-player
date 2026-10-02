/**
 * Web Audio Engine for MicUp Player
 * 
 * Routes MediaElement (Audio/Video), Pitch Shifter Worklet, Master Gain,
 * and AnalyserNode for real-time VU metering.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sourceNode = null;
    this.pitchNode = null;
    this.masterGain = null;
    this.analyser = null;
    this.dataArray = null;
    this.isWorkletLoaded = false;
    this.workletError = false;
    this.currentSemitones = 0;
    this.currentElement = null;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master volume gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Audio level analyser for VU meters
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Load Pitch Shifter AudioWorklet
    try {
      await this.ctx.audioWorklet.addModule('/pitch-shifter-worklet.js');
      this.pitchNode = new AudioWorkletNode(this.ctx, 'pitch-shifter-processor');
      this.pitchNode.connect(this.masterGain);
      this.isWorkletLoaded = true;
      this.setPitch(this.currentSemitones);
    } catch (err) {
      console.warn('AudioWorklet pitch shifter not supported or failed to load:', err);
      this.workletError = true;
      // Direct pass-through if worklet fails
    }
  }

  /**
   * Attach an HTMLMediaElement (either <audio> or <video>) into the audio graph
   */
  async attachMediaElement(element) {
    await this.init();

    if (this.currentElement === element && this.sourceNode) {
      return;
    }

    // Clean up previous source if changing elements
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {}
    }

    this.currentElement = element;
    this.sourceNode = this.ctx.createMediaElementSource(element);

    if (this.isWorkletLoaded && this.pitchNode) {
      this.sourceNode.connect(this.pitchNode);
    } else {
      this.sourceNode.connect(this.masterGain);
    }
  }

  /**
   * Set pitch shift in semitones (-12 to +12)
   */
  setPitch(semitones) {
    this.currentSemitones = Math.max(-12, Math.min(12, semitones));
    if (this.pitchNode && this.pitchNode.parameters) {
      const param = this.pitchNode.parameters.get('semitones');
      if (param) {
        param.setTargetAtTime(this.currentSemitones, this.ctx.currentTime, 0.05);
      }
    }
  }

  /**
   * Set Master Volume (0.0 to 1.0)
   */
  setVolume(volume) {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Smoothly duck or fade volume (e.g. For singer speaking or BGM)
   */
  fadeTo(targetVolume, durationSec = 0.5) {
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(targetVolume, now + durationSec);
    }
  }

  /**
   * Get current audio output peak level (0.0 to 1.0) for VU meters
   */
  getAudioLevel() {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const avg = sum / this.dataArray.length;
    return avg / 255;
  }
}

export const audioEngine = new AudioEngine();
