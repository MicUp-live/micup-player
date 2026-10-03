import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from './audio-engine.js';

test('AudioEngine clamps semitones between -12 and +12', () => {
  const engine = new AudioEngine();
  engine.setPitch(15);
  assert.equal(engine.currentSemitones, 12);

  engine.setPitch(-20);
  assert.equal(engine.currentSemitones, -12);

  engine.setPitch(3);
  assert.equal(engine.currentSemitones, 3);
});

test('Pitch ratio calculation matches musical intervals', () => {
  // +12 semitones = exactly 2x frequency (one octave up)
  const octaveUp = Math.pow(2, 12 / 12);
  assert.equal(octaveUp, 2.0);

  // -12 semitones = exactly 0.5x frequency (one octave down)
  const octaveDown = Math.pow(2, -12 / 12);
  assert.equal(octaveDown, 0.5);

  // 0 semitones = exactly 1.0 (unity pitch)
  const unity = Math.pow(2, 0 / 12);
  assert.equal(unity, 1.0);

  // +7 semitones (perfect fifth) ~ 1.4983x
  const fifth = Math.pow(2, 7 / 12);
  assert.ok(Math.abs(fifth - 1.4983) < 0.001);
});

test('PitchShifterProcessor: standard key to shifted key produces finite, valid audio samples', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Provide AudioWorklet globals
  globalThis.AudioWorkletProcessor = class {};
  let registeredClass = null;
  globalThis.registerProcessor = (name, cls) => {
    registeredClass = cls;
  };

  const workletPath = path.resolve('public/pitch-shifter-worklet.js');
  const workletCode = fs.readFileSync(workletPath, 'utf-8');
  // Evaluate the worklet code
  const fn = new Function(workletCode);
  fn();

  assert.ok(registeredClass, 'Processor should be registered');
  const processor = new registeredClass();

  const blockSize = 128;
  const inputChannel = new Float32Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    inputChannel[i] = Math.sin((i / blockSize) * 2 * Math.PI);
  }

  // 1. Process block at standard key (0 semitones)
  const output0 = [[new Float32Array(blockSize)]];
  processor.process([[inputChannel]], output0, { semitones: [0] });

  assert.ok(!Number.isNaN(processor.writeIndex), 'writeIndex must not be NaN after standard key');
  assert.equal(processor.writeIndex, blockSize % processor.bufferSize);

  for (let i = 0; i < blockSize; i++) {
    assert.ok(Number.isFinite(output0[0][0][i]), `Sample ${i} must be finite`);
    assert.equal(output0[0][0][i], inputChannel[i]);
  }

  // 2. Process next block with shifted pitch (+2 semitones)
  const outputShifted = [[new Float32Array(blockSize)]];
  processor.process([[inputChannel]], outputShifted, { semitones: [2] });

  assert.ok(!Number.isNaN(processor.writeIndex), 'writeIndex must not be NaN after pitch shift');
  for (let i = 0; i < blockSize; i++) {
    assert.ok(Number.isFinite(outputShifted[0][0][i]), `Shifted sample ${i} must be finite`);
    assert.ok(!Number.isNaN(outputShifted[0][0][i]), `Shifted sample ${i} must not be NaN`);
  }

  // 3. Process another block with negative pitch (-3 semitones)
  const outputDown = [[new Float32Array(blockSize)]];
  processor.process([[inputChannel]], outputDown, { semitones: [-3] });

  assert.ok(!Number.isNaN(processor.writeIndex), 'writeIndex must not be NaN after negative pitch shift');
  for (let i = 0; i < blockSize; i++) {
    assert.ok(Number.isFinite(outputDown[0][0][i]), `Shifted down sample ${i} must be finite`);
    assert.ok(!Number.isNaN(outputDown[0][0][i]), `Shifted down sample ${i} must not be NaN`);
  }
});

