import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudQueueClient, normalizeCloudRequest } from './cloud-queue-client.js';

test('normalizeCloudRequest extracts and standardizes MicUp.live request fields', () => {
  const raw = {
    id: 'req-123',
    singer_name: 'Marcus Vance',
    song_title: 'Don\'t Stop Believin\'',
    song_artist: 'Journey',
    preferred_key: '+2',
    status: 'up_next',
    disc_code: 'SC8812',
    created_at: '2026-10-01T20:00:00Z'
  };

  const normalized = normalizeCloudRequest(raw);
  assert.equal(normalized.id, 'req-123');
  assert.equal(normalized.singerName, 'Marcus Vance');
  assert.equal(normalized.title, 'Don\'t Stop Believin\'');
  assert.equal(normalized.artist, 'Journey');
  assert.equal(normalized.semitones, 2);
  assert.equal(normalized.status, 'up_next');
  assert.equal(normalized.code, 'SC8812');
});

test('normalizeCloudRequest handles negative, null, and non-numeric preferred_key', () => {
  const req1 = normalizeCloudRequest({ preferred_key: '-3' });
  assert.equal(req1.semitones, -3);

  const req2 = normalizeCloudRequest({ preferred_key: 0 });
  assert.equal(req2.semitones, 0);

  const req3 = normalizeCloudRequest({ preferred_key: null });
  assert.equal(req3.semitones, 0);

  const req4 = normalizeCloudRequest({ preferred_key: 'invalid' });
  assert.equal(req4.semitones, 0);
});

test('CloudQueueClient processes and sorts active queue from MicUp.live', () => {
  const client = new CloudQueueClient();

  const mockRequests = [
    { id: '1', singer_name: 'David', song_title: 'Creep', song_artist: 'Radiohead', status: 'accepted', preferred_key: '0' },
    { id: '2', singer_name: 'Sarah', song_title: 'Hello', song_artist: 'Adele', status: 'up_next', preferred_key: '-1' },
    { id: '3', singer_name: 'Tom', song_title: 'Yesterday', song_artist: 'Beatles', status: 'completed', preferred_key: '0' },
    { id: '4', singer_name: 'Anna', song_title: 'Bad Romance', song_artist: 'Lady Gaga', status: 'declined', preferred_key: '0' }
  ];

  const activeQueue = client.processIncomingRequests(mockRequests);

  // Completed and declined requests should be excluded from the active playout queue
  assert.equal(activeQueue.length, 2);
  // 'up_next' should be prioritized at the head of the rotation
  assert.equal(activeQueue[0].id, '2');
  assert.equal(activeQueue[0].singerName, 'Sarah');
  assert.equal(activeQueue[0].semitones, -1);
  // 'accepted' comes next
  assert.equal(activeQueue[1].id, '1');
});

test('CloudQueueClient links local library media matches', () => {
  const client = new CloudQueueClient();
  const mockLibrary = [
    { id: 'track-1', artist: 'Adele', title: 'Hello', filename: 'Adele - Hello.zip' }
  ];

  const mockRequests = [
    { id: '1', singer_name: 'Sarah', song_title: 'Hello', song_artist: 'Adele', status: 'up_next' },
    { id: '2', singer_name: 'Bob', song_title: 'Unreleased Track', song_artist: 'Unknown', status: 'accepted' }
  ];

  const queue = client.processIncomingRequests(mockRequests, mockLibrary);

  // Sarah's track should be matched
  assert.equal(queue[0].isMatched, true);
  assert.equal(queue[0].matchedTrack.id, 'track-1');

  // Bob's track should be flagged as missing local media
  assert.equal(queue[1].isMatched, false);
  assert.equal(queue[1].matchedTrack, null);
});
