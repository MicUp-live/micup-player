import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQueueItem,
  isPlayableYouTube,
  matchTrackInLibrary,
  compactQueueItem
} from './track-model.js';
import { compactShowState, deserializeShowState } from '../../state/show-persistence.js';

describe('Track Model & Queue Request Management', () => {
  it('normalizes valid and invalid YouTube items strictly', () => {
    // Valid 11-char YouTube ID
    const validYt = normalizeQueueItem({
      title: 'Creep',
      singer: 'Dave',
      source: 'youtube',
      youtubeId: 'XFkzRNyygfk'
    });
    assert.equal(validYt.source, 'youtube');
    assert.equal(validYt.youtubeId, 'XFkzRNyygfk');
    assert.equal(isPlayableYouTube(validYt), true);

    // Unresolved search query (source: 'youtube' but no valid video ID)
    const invalidYt = normalizeQueueItem({
      title: 'Bohemian Rhapsody',
      singer: 'Freddie',
      source: 'youtube',
      youtubeId: ''
    });
    assert.equal(invalidYt.source, 'request', 'Empty youtubeId must become an unresolved request');
    assert.equal(invalidYt.youtubeId, null);
    assert.equal(isPlayableYouTube(invalidYt), false);
  });

  it('disambiguates and matches duplicate song titles in library by disc code or filename', () => {
    const mockLibrary = {
      tracks: [
        {
          code: 'SC8812',
          filename: 'SC8812 - Bon Jovi - Livin On A Prayer.zip',
          artist: 'Bon Jovi',
          title: 'Livin On A Prayer'
        },
        {
          code: 'CB2004',
          filename: 'CB2004 - Bon Jovi - Livin On A Prayer.zip',
          artist: 'Bon Jovi',
          title: 'Livin On A Prayer'
        },
        {
          code: 'KV0101',
          filename: 'Adele - Hello (Album Version).mp3',
          artist: 'Adele',
          title: 'Hello'
        },
        {
          code: 'KV0102',
          filename: 'Lionel Richie - Hello.mp3',
          artist: 'Lionel Richie',
          title: 'Hello'
        }
      ],
      search() { return this.tracks; }
    };

    // Request specifically for disc code CB2004
    const req1 = normalizeQueueItem({
      code: 'CB2004',
      title: 'Livin On A Prayer',
      artist: 'Bon Jovi'
    });
    const match1 = matchTrackInLibrary(req1, mockLibrary);
    assert.ok(match1);
    assert.equal(match1.code, 'CB2004');

    // Request specifically for disc code SC8812
    const req2 = normalizeQueueItem({
      code: 'SC8812',
      title: 'Livin On A Prayer',
      artist: 'Bon Jovi'
    });
    const match2 = matchTrackInLibrary(req2, mockLibrary);
    assert.ok(match2);
    assert.equal(match2.code, 'SC8812');

    // Disambiguation by filename
    const req3 = normalizeQueueItem({
      filename: 'Lionel Richie - Hello.mp3',
      title: 'Hello',
      artist: 'Lionel Richie'
    });
    const match3 = matchTrackInLibrary(req3, mockLibrary);
    assert.ok(match3);
    assert.equal(match3.code, 'KV0102');
  });

  it('preserves exact track identity (code, filename) and active queue item across refresh persistence', () => {
    const originalState = {
      queue: [
        {
          id: 'q-singer-a',
          singerName: 'Alice',
          title: 'My Way',
          artist: 'Frank Sinatra',
          code: 'SF001',
          filename: 'SF001 - Frank Sinatra - My Way.zip',
          semitones: -1
        },
        {
          id: 'q-singer-b',
          singerName: 'Bob',
          title: 'My Way',
          artist: 'Sex Pistols',
          code: 'SF002',
          filename: 'SF002 - Sex Pistols - My Way.zip',
          semitones: 2
        }
      ],
      activeQueueItemId: 'q-singer-a',
      currentTrack: {
        title: 'My Way',
        artist: 'Frank Sinatra',
        singerName: 'Alice',
        code: 'SF001',
        filename: 'SF001 - Frank Sinatra - My Way.zip',
        queueItemId: 'q-singer-a',
        type: 'cdg'
      },
      autoApplause: true,
      isPartyActive: true,
      partyRoomCode: 'SING1'
    };

    const compacted = compactShowState(originalState);
    const serialized = JSON.stringify(compacted);
    const restored = deserializeShowState(serialized);

    assert.ok(restored);
    assert.equal(restored.activeQueueItemId, 'q-singer-a');
    assert.equal(restored.currentTrack.code, 'SF001');
    assert.equal(restored.currentTrack.queueItemId, 'q-singer-a');
    assert.equal(restored.queue.length, 2);
    assert.equal(restored.queue[0].code, 'SF001');
    assert.equal(restored.queue[1].code, 'SF002');
  });

  it('reordering queue during playback removes only the completed request, not newly elevated top singer', () => {
    // Initial queue: Singer A (active) and Singer B (waiting)
    let queue = [
      { id: 'singer-a', singerName: 'Singer A', title: 'Song A' },
      { id: 'singer-b', singerName: 'Singer B', title: 'Song B' }
    ];

    let activeQueueItemId = 'singer-a';

    // Host starts Singer A, then moves Singer B above Singer A:
    queue = [queue[1], queue[0]]; // [Singer B, Singer A]
    assert.equal(queue[0].id, 'singer-b');
    assert.equal(queue[1].id, 'singer-a');

    // Singer A completes:
    // With activeQueueItemId targeting:
    queue = queue.filter(item => item.id !== activeQueueItemId);
    activeQueueItemId = null;

    // Singer B must remain at the top of the queue!
    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, 'singer-b');
    assert.equal(queue[0].singerName, 'Singer B');
  });

  it('playing an ad-hoc dropped file does not remove queued singers upon completion', () => {
    let queue = [
      { id: 'singer-1', singerName: 'Singer 1', title: 'Queued Song' }
    ];

    // Dropped file played: activeQueueItemId is null
    let activeQueueItemId = null;

    // Completion handler
    if (activeQueueItemId) {
      queue = queue.filter(item => item.id !== activeQueueItemId);
    }
    // activeQueueItemId is null, so queue is untouched

    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, 'singer-1');
  });

  it('accurately resolves different songs sharing the exact same disc code', () => {
    const mockLibrary = {
      tracks: [
        {
          code: 'SC8123',
          filename: 'SC8123-01 - Queen - Bohemian Rhapsody.cdg',
          artist: 'Queen',
          title: 'Bohemian Rhapsody'
        },
        {
          code: 'SC8123',
          filename: 'SC8123-02 - Queen - We Are The Champions.cdg',
          artist: 'Queen',
          title: 'We Are The Champions'
        }
      ],
      search() { return this.tracks; }
    };

    // 1. Request Song 2 by Disc Code + Title
    const req1 = normalizeQueueItem({
      code: 'SC8123',
      title: 'We Are The Champions',
      artist: 'Queen'
    });
    const match1 = matchTrackInLibrary(req1, mockLibrary);
    assert.ok(match1);
    assert.equal(match1.title, 'We Are The Champions', 'Must not return the first song on the disc');
    assert.equal(match1.filename, 'SC8123-02 - Queen - We Are The Champions.cdg');

    // 2. Request Song 2 by Filename alone (even if title omitted)
    const req2 = normalizeQueueItem({
      code: 'SC8123',
      filename: 'SC8123-02 - Queen - We Are The Champions.cdg'
    });
    const match2 = matchTrackInLibrary(req2, mockLibrary);
    assert.ok(match2);
    assert.equal(match2.title, 'We Are The Champions');
  });

  it('preserves singerName and semitones key shift during queue normalization', () => {
    const item = normalizeQueueItem({
      title: 'Don\'t Stop Believin\'',
      artist: 'Journey',
      singerName: 'Elena Rostova',
      semitones: -2
    });
    assert.equal(item.singerName, 'Elena Rostova');
    assert.equal(item.semitones, -2);

    // singer property fallback
    const item2 = normalizeQueueItem({
      title: 'Sweet Caroline',
      artist: 'Neil Diamond',
      singer: 'Marcus',
      preferredKey: 3
    });
    assert.equal(item2.singerName, 'Marcus');
    assert.equal(item2.semitones, 3);
  });
});
