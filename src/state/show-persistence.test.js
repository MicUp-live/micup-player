import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCookieString,
  formatCookieString,
  compactShowState,
  serializeShowState,
  deserializeShowState,
  saveShowStateToCookie,
  loadShowStateFromCookie
} from './show-persistence.js';

test('parseCookieString extracts cookie values by name', () => {
  const cookieStr = 'micup_show_code=ABC12; micup_show_state=%7B%22autoApplause%22%3Atrue%7D; other=xyz';
  assert.equal(parseCookieString(cookieStr, 'micup_show_code'), 'ABC12');
  assert.deepEqual(JSON.parse(parseCookieString(cookieStr, 'micup_show_state')), { autoApplause: true });
  assert.equal(parseCookieString(cookieStr, 'nonexistent'), null);
});

test('formatCookieString constructs valid cookie with Max-Age and Path', () => {
  const cookie = formatCookieString('micup_test', 'val123', {
    maxAge: 3600,
    path: '/'
  });
  assert.ok(cookie.includes('micup_test=val123'));
  assert.ok(cookie.includes('Max-Age=3600'));
  assert.ok(cookie.includes('Path=/'));
  assert.ok(cookie.includes('SameSite=Lax'));
});

test('compactShowState extracts essential show data without bloated object handles', () => {
  const rawQueue = [
    {
      id: 'q-1',
      singerName: 'Alice',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      semitones: 2,
      source: 'youtube',
      type: 'youtube',
      videoId: '9Lxm0iSnKNc',
      youtubeId: '9Lxm0iSnKNc',
      trackMatch: { very: 'large', unneeded: 'metadata' },
      handle: { fileHandle: 'not-serializable' }
    }
  ];

  const compacted = compactShowState({
    queue: rawQueue,
    showCode: 'STAGE-9',
    isCloudLinked: true,
    autoApplause: false,
    isPartyActive: true,
    partyRoomCode: 'P2P77'
  });

  assert.equal(compacted.queue.length, 1);
  assert.equal(compacted.queue[0].singerName, 'Alice');
  assert.equal(compacted.queue[0].videoId, '9Lxm0iSnKNc');
  assert.equal(compacted.queue[0].trackMatch, undefined);
  assert.equal(compacted.queue[0].handle, undefined);
  assert.equal(compacted.showCode, 'STAGE-9');
  assert.equal(compacted.isCloudLinked, true);
  assert.equal(compacted.autoApplause, false);
  assert.equal(compacted.isPartyActive, true);
  assert.equal(compacted.partyRoomCode, 'P2P77');
});

test('serializeShowState and deserializeShowState round-trip successfully', () => {
  const original = {
    queue: [
      { id: '1', singerName: 'Bob', title: 'Yesterday', artist: 'Beatles', semitones: 0 }
    ],
    showCode: 'BEATLES1',
    isCloudLinked: true,
    autoApplause: true
  };

  const serialized = serializeShowState(original);
  assert.ok(typeof serialized === 'string');

  const restored = deserializeShowState(serialized);
  assert.equal(restored.showCode, 'BEATLES1');
  assert.equal(restored.queue.length, 1);
  assert.equal(restored.queue[0].singerName, 'Bob');
});

test('saveShowStateToCookie and loadShowStateFromCookie use document.cookie when available', () => {
  const fakeDoc = { cookie: '' };
  const state = {
    queue: [{ id: '10', singerName: 'Dana', title: 'Hello', artist: 'Adele', semitones: -1 }],
    showCode: 'SHOW99',
    autoApplause: true,
    isCloudLinked: false
  };

  saveShowStateToCookie(state, fakeDoc);
  assert.ok(fakeDoc.cookie.includes('micup_show_state='));

  const loaded = loadShowStateFromCookie(fakeDoc);
  assert.ok(loaded);
  assert.equal(loaded.showCode, 'SHOW99');
  assert.equal(loaded.queue.length, 1);
  assert.equal(loaded.queue[0].singerName, 'Dana');
  assert.equal(loaded.queue[0].semitones, -1);
});
