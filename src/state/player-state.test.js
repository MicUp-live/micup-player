import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queue,
  currentTime,
  duration,
  semitones,
  pitchDisplay,
  formattedCurrentTime,
  remainingTime,
  upNextSinger
} from './player-state.js';

test('pitchDisplay formats semitones with sharp and flat symbols', () => {
  semitones.value = 0;
  assert.equal(pitchDisplay.value, '0 (Standard)');

  semitones.value = 2;
  assert.equal(pitchDisplay.value, '+2 ♯');

  semitones.value = -3;
  assert.equal(pitchDisplay.value, '-3 ♭');
});

test('formattedCurrentTime formats seconds into mm:ss', () => {
  currentTime.value = 0;
  assert.equal(formattedCurrentTime.value, '0:00');

  currentTime.value = 65;
  assert.equal(formattedCurrentTime.value, '1:05');

  currentTime.value = 214;
  assert.equal(formattedCurrentTime.value, '3:34');
});

test('remainingTime calculates countdown from duration and currentTime', () => {
  duration.value = 200;
  currentTime.value = 50; // 150 seconds left = 2m 30s
  assert.equal(remainingTime.value, '-2:30');

  currentTime.value = 200;
  assert.equal(remainingTime.value, '-0:00');
});

test('upNextSinger returns the first singer in rotation', () => {
  queue.value = [
    { id: '1', singerName: 'Sarah', title: 'Hello', artist: 'Adele' },
    { id: '2', singerName: 'Dave', title: 'Creep', artist: 'Radiohead' }
  ];

  assert.ok(upNextSinger.value);
  assert.equal(upNextSinger.value.singerName, 'Sarah');

  queue.value = [];
  assert.equal(upNextSinger.value, null);
});
