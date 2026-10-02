import test from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import { MediaLoader, mediaLoader } from './media-loader.js';

test('MediaLoader.parseFilename extracts Code, Artist, and Title', () => {
  const result = MediaLoader.parseFilename('SC8812 - Bon Jovi - Livin On A Prayer.zip');
  assert.equal(result.code, 'SC8812');
  assert.equal(result.artist, 'Bon Jovi');
  assert.equal(result.title, 'Livin On A Prayer');
});

test('MediaLoader.parseFilename extracts Artist and Title when no disc code is present', () => {
  const result = MediaLoader.parseFilename('Queen - Bohemian Rhapsody.mp4');
  assert.equal(result.code, '');
  assert.equal(result.artist, 'Queen');
  assert.equal(result.title, 'Bohemian Rhapsody');
});

test('MediaLoader.parseFilename handles artist with internal hyphens like Blink-182', () => {
  const result = MediaLoader.parseFilename('Blink-182 - All The Small Things.zip');
  assert.equal(result.code, '');
  assert.equal(result.artist, 'Blink-182');
  assert.equal(result.title, 'All The Small Things');
});

test('MediaLoader.parseFilename handles titles with multiple parts', () => {
  const result = MediaLoader.parseFilename('CB9001 - Linkin Park - In The End - Live.zip');
  assert.equal(result.code, 'CB9001');
  assert.equal(result.artist, 'Linkin Park');
  assert.equal(result.title, 'In The End - Live');
});

test('MediaLoader.parseFilename handles filenames with no hyphen delimiter', () => {
  const result = MediaLoader.parseFilename('Imagine.mp4');
  assert.equal(result.code, '');
  assert.equal(result.artist, 'Unknown Artist');
  assert.equal(result.title, 'Imagine');
});

test('MediaLoader extracts ZIP archives containing .cdg and .mp3', async () => {
  // Construct a synthetic in-memory ZIP
  const mockCdgBytes = new Uint8Array([0x09, 0x01, 0x00, 0x00, 0x05, 0x00]);
  const mockMp3Bytes = new Uint8Array([0xFF, 0xFB, 0x90, 0x64]); // MP3 sync header

  const zipData = fflate.zipSync({
    'song.cdg': mockCdgBytes,
    'song.mp3': mockMp3Bytes
  });

  // Polyfill File/Blob for Node.js test environment if needed
  const fileBlob = new Blob([zipData], { type: 'application/zip' });
  const mockFile = {
    name: 'SC1234 - Journey - Don\'t Stop Believin\'.zip',
    arrayBuffer: async () => fileBlob.arrayBuffer()
  };

  // Mock URL.createObjectURL / revokeObjectURL in Node environment
  const originalCreate = globalThis.URL.createObjectURL;
  const originalRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:mock-audio-url';
  globalThis.URL.revokeObjectURL = () => {};

  try {
    const loaded = await mediaLoader.loadFile(mockFile);
    assert.equal(loaded.type, 'cdg');
    assert.equal(loaded.code, 'SC1234');
    assert.equal(loaded.artist, 'Journey');
    assert.equal(loaded.title, 'Don\'t Stop Believin\'');
    assert.ok(loaded.cdgData);
    assert.equal(loaded.cdgData.length, mockCdgBytes.length);
    assert.equal(loaded.audioUrl, 'blob:mock-audio-url');
  } finally {
    globalThis.URL.createObjectURL = originalCreate;
    globalThis.URL.revokeObjectURL = originalRevoke;
  }
});
