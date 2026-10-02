/**
 * Clean-Room AudioWorkletProcessor: Real-Time Time-Domain Pitch Shifter
 * 
 * Uses dual-delay line overlap-add with smooth raised-cosine windowing.
 * Preserves tempo while shifting pitch from -12 to +12 semitones.
 * Zero external dependencies.
 */

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'semitones',
        defaultValue: 0,
        minValue: -12,
        maxValue: 12,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor() {
    super();
    // Circular buffer: 4096 samples per channel (~92ms buffer at 44.1kHz)
    this.bufferSize = 4096;
    this.buffers = [
      new Float32Array(this.bufferSize),
      new Float32Array(this.bufferSize)
    ];
    this.writeIndex = 0;
    
    // Read phases (0.0 to 1.0) for the two delay taps
    this.phase1 = 0.0;
    this.phase2 = 0.5; // 180 degrees out of phase

    // Window size for the pitch shift tap (e.g. 2048 samples)
    this.windowSize = 2048;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const semitones = parameters.semitones[0];
    const numChannels = Math.min(input.length, output.length, 2);
    const blockSize = input[0].length;

    // Fast-path: When pitch is 0, pass-through directly without phase modulation
    if (Math.abs(semitones) < 0.01) {
      for (let ch = 0; ch < numChannels; ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    // Pitch ratio: R = 2^(semitones / 12)
    const pitchRatio = Math.pow(2, semitones / 12);
    // Relative rate: (1 - pitchRatio) / windowSize
    // If pitchRatio > 1 (shift up), read pointer advances faster, so relative delay decreases
    const phaseIncrement = (1 - pitchRatio) / this.windowSize;

    for (let i = 0; i < blockSize; i++) {
      // 1. Write incoming samples to circular buffer
      for (let ch = 0; ch < numChannels; ch++) {
        this.buffers[ch][this.writeIndex] = input[ch][i];
      }

      // 2. Compute window weights (raised-cosine window)
      // w = 0.5 * (1 - cos(2 * pi * phase))
      const w1 = 0.5 * (1 - Math.cos(2 * Math.PI * this.phase1));
      const w2 = 0.5 * (1 - Math.cos(2 * Math.PI * this.phase2));

      // 3. Compute read positions
      const delay1 = this.phase1 * this.windowSize;
      const delay2 = this.phase2 * this.windowSize;

      let readPos1 = this.writeIndex - delay1;
      let readPos2 = this.writeIndex - delay2;

      while (readPos1 < 0) readPos1 += this.bufferSize;
      while (readPos2 < 0) readPos2 += this.bufferSize;

      // 4. Interpolate and blend for each channel
      for (let ch = 0; ch < numChannels; ch++) {
        const buf = this.buffers[ch];

        // Linear interpolation for tap 1
        const idx1_0 = Math.floor(readPos1) % this.bufferSize;
        const idx1_1 = (idx1_0 + 1) % this.bufferSize;
        const frac1 = readPos1 - Math.floor(readPos1);
        const s1 = buf[idx1_0] * (1 - frac1) + buf[idx1_1] * frac1;

        // Linear interpolation for tap 2
        const idx2_0 = Math.floor(readPos2) % this.bufferSize;
        const idx2_1 = (idx2_0 + 1) % this.bufferSize;
        const frac2 = readPos2 - Math.floor(readPos2);
        const s2 = buf[idx2_0] * (1 - frac2) + buf[idx2_1] * frac2;

        output[ch][i] = s1 * w1 + s2 * w2;
      }

      // 5. Advance write index and phases
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      this.phase1 += phaseIncrement;
      while (this.phase1 >= 1.0) this.phase1 -= 1.0;
      while (this.phase1 < 0.0) this.phase1 += 1.0;

      this.phase2 += phaseIncrement;
      while (this.phase2 >= 1.0) this.phase2 -= 1.0;
      while (this.phase2 < 0.0) this.phase2 += 1.0;
    }

    return true;
  }
}

registerProcessor('pitch-shifter-processor', PitchShifterProcessor);
