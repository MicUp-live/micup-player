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
