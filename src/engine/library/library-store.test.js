import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryStore } from './library-store.js';

test('LibraryStore search finds tracks by title, artist, and disc code', () => {
  const store = new LibraryStore();
  store.tracks = [
    { id: '1', code: 'SC8812', artist: 'Bon Jovi', title: 'Livin On A Prayer' },
    { id: '2', code: 'CB9001', artist: 'Queen', title: 'Bohemian Rhapsody' },
    { id: '3', code: 'KV0100', artist: 'Adele', title: 'Rolling In The Deep' },
    { id: '4', code: 'SC8813', artist: 'Bon Jovi', title: 'You Give Love A Bad Name' }
  ];

  // Search by artist
  const bonJovi = store.search('bon jovi');
  assert.equal(bonJovi.length, 2);
  assert.equal(bonJovi[0].artist, 'Bon Jovi');

  // Search by title
  const rhapsody = store.search('bohemian');
  assert.equal(rhapsody.length, 1);
  assert.equal(rhapsody[0].title, 'Bohemian Rhapsody');

  // Search by disc code
  const codeMatch = store.search('KV0100');
  assert.equal(codeMatch.length, 1);
  assert.equal(codeMatch[0].artist, 'Adele');

  // Empty query returns list
  const all = store.search('');
  assert.equal(all.length, 4);
});

test('LibraryStore matchRequest matches cloud request to local track', () => {
  const store = new LibraryStore();
  store.tracks = [
    { id: '1', code: 'SC1001', artist: 'Journey', title: 'Don\'t Stop Believin\'' },
    { id: '2', code: 'SC1002', artist: 'Neil Diamond', title: 'Sweet Caroline (Party Version)' }
  ];

  // Exact match
  const match1 = store.matchRequest('Journey', 'Don\'t Stop Believin\'');
  assert.ok(match1);
  assert.equal(match1.artist, 'Journey');

  // Case-insensitive match with extra whitespace
  const match2 = store.matchRequest('  journey  ', 'don\'t stop believin\'');
  assert.ok(match2);
  assert.equal(match2.id, '1');

  // Substring match
  const match3 = store.matchRequest('Neil Diamond', 'Sweet Caroline');
  assert.ok(match3);
  assert.equal(match3.id, '2');

  // No match
  const noMatch = store.matchRequest('Eminem', 'Lose Yourself');
  assert.equal(noMatch, null);
});

test('LibraryStore notifies subscribers when scanning status updates', () => {
  const store = new LibraryStore();
  let notifications = 0;

  const unsubscribe = store.subscribe(() => {
    notifications++;
  });

  store.notify();
  assert.equal(notifications, 1);

  unsubscribe();
  store.notify();
  assert.equal(notifications, 1); // Not called after unsubscribe
});
