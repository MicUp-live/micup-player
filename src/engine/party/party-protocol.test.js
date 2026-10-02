import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PartyAction,
  createAddSongMessage,
  createQueueUpdateMessage,
  createSfxMessage,
  parsePartyMessage,
  generateRoomCode
} from './party-protocol.js';

describe('Party Protocol', () => {
  it('generateRoomCode creates an uppercase 5-character alphanumeric room code', () => {
    const code = generateRoomCode();
    assert.equal(typeof code, 'string');
    assert.equal(code.length, 5);
    assert.match(code, /^[A-Z0-9]{5}$/);
  });

  it('createAddSongMessage normalizes and validates song request payload', () => {
    const msg = createAddSongMessage({
      singer: '  Sarah & Dave  ',
      title: '  Bohemian Rhapsody  ',
      artist: 'Queen',
      preferredKey: -2,
      source: 'youtube',
      youtubeId: 'fJ9rUzIMcZQ'
    });

    assert.equal(msg.action, PartyAction.ADD_SONG);
    assert.equal(msg.payload.singer, 'Sarah & Dave');
    assert.equal(msg.payload.title, 'Bohemian Rhapsody');
    assert.equal(msg.payload.artist, 'Queen');
    assert.equal(msg.payload.preferredKey, -2);
    assert.equal(msg.payload.source, 'youtube');
    assert.equal(msg.payload.youtubeId, 'fJ9rUzIMcZQ');
    assert.ok(msg.payload.id);
  });

  it('createAddSongMessage clamps preferredKey between -6 and +6', () => {
    const highKey = createAddSongMessage({ singer: 'Alex', title: 'Song', preferredKey: 15 });
    assert.equal(highKey.payload.preferredKey, 6);

    const lowKey = createAddSongMessage({ singer: 'Alex', title: 'Song', preferredKey: -10 });
    assert.equal(lowKey.payload.preferredKey, -6);

    const defaultKey = createAddSongMessage({ singer: 'Alex', title: 'Song', preferredKey: 'invalid' });
    assert.equal(defaultKey.payload.preferredKey, 0);
  });

  it('createQueueUpdateMessage packages queue items and current track state', () => {
    const queue = [
      { id: '1', singer: 'Mike', title: 'Creep', artist: 'Radiohead', preferredKey: 0 }
    ];
    const currentTrack = { title: 'Valerie', artist: 'Amy Winehouse', singer: 'Sarah' };

    const msg = createQueueUpdateMessage(queue, currentTrack);
    assert.equal(msg.action, PartyAction.QUEUE_UPDATE);
    assert.equal(msg.payload.queue.length, 1);
    assert.equal(msg.payload.queue[0].singer, 'Mike');
    assert.equal(msg.payload.currentTrack.singer, 'Sarah');
  });

  it('createSfxMessage formats sound effect trigger with sender name', () => {
    const msg = createSfxMessage('airhorn', 'Dave');
    assert.equal(msg.action, PartyAction.TRIGGER_SFX);
    assert.equal(msg.payload.pad, 'airhorn');
    assert.equal(msg.payload.sender, 'Dave');
  });

  it('parsePartyMessage safely parses valid JSON string or object', () => {
    const raw = JSON.stringify({
      action: PartyAction.TRIGGER_SFX,
      payload: { pad: 'applause', sender: 'Crowd' }
    });

    const parsed = parsePartyMessage(raw);
    assert.ok(parsed);
    assert.equal(parsed.action, PartyAction.TRIGGER_SFX);
    assert.equal(parsed.payload.pad, 'applause');
  });

  it('parsePartyMessage returns null for invalid JSON or missing action', () => {
    assert.equal(parsePartyMessage('bad-json-string'), null);
    assert.equal(parsePartyMessage({}), null);
    assert.equal(parsePartyMessage(null), null);
    assert.equal(parsePartyMessage({ action: 'UNKNOWN_ACTION' }), null);
  });
});
