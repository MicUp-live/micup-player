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
  upNextSinger,
  knownSingers,
  addKnownSinger,
  removeKnownSinger,
  clearKnownSingers,
  allShowSingers,
  currentTrack
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

test('addKnownSinger adds new singers, deduplicates case-insensitively, and ignores generic placeholders', () => {
  clearKnownSingers();
  assert.deepEqual(knownSingers.value, []);

  // Add new singers
  addKnownSinger('Alice');
  addKnownSinger('Bob');
  assert.equal(knownSingers.value.length, 2);
  assert.ok(knownSingers.value.includes('Alice'));
  assert.ok(knownSingers.value.includes('Bob'));

  // Duplicate with different case should not duplicate
  addKnownSinger('alice');
  assert.equal(knownSingers.value.length, 2);

  // Generic placeholders should not be saved
  addKnownSinger('Host Selection');
  addKnownSinger('Singer');
  addKnownSinger('Guest');
  addKnownSinger('   ');
  assert.equal(knownSingers.value.length, 2);

  // removeKnownSinger
  removeKnownSinger('Alice');
  assert.equal(knownSingers.value.length, 1);
  assert.ok(knownSingers.value.includes('Bob'));

  // allShowSingers reactive aggregation
  queue.value = [
    { id: 'q1', singerName: 'Charlie', title: 'Song 1' },
    { id: 'q2', singerName: 'Bob', title: 'Song 2' } // Bob already in knownSingers
  ];
  currentTrack.value = { singerName: 'Diana', title: 'Live Song' };

  const allSingers = allShowSingers.value;
  assert.ok(allSingers.includes('Bob'));
  assert.ok(allSingers.includes('Charlie'));
  assert.ok(allSingers.includes('Diana'));
  // Should not contain duplicate Bob
  assert.equal(allSingers.filter(s => s.toLowerCase() === 'bob').length, 1);

  // Cleanup
  clearKnownSingers();
  queue.value = [];
  currentTrack.value = null;
});
