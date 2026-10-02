import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PartyHost } from './party-host.js';
import { PartyAction, createAddSongMessage, createSfxMessage } from './party-protocol.js';

class MockTransport {
  constructor() {
    this.room = null;
    this.broadcastedMessages = [];
    this.listeners = new Map();
    this.connected = false;
  }

  async connect(room) {
    this.room = room;
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  send(data) {
    this.broadcastedMessages.push(data);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // Helper to simulate incoming peer message
  simulatePeerMessage(data) {
    const callbacks = this.listeners.get('message') || [];
    callbacks.forEach(cb => cb(data));
  }
}

describe('PartyHost Engine', () => {
  it('starts room with generated code and connects transport', async () => {
    const transport = new MockTransport();
    const host = new PartyHost({ transport });

    assert.equal(host.isActive, false);
    const roomCode = await host.start('SING7');

    assert.equal(roomCode, 'SING7');
    assert.equal(host.roomCode, 'SING7');
    assert.equal(host.isActive, true);
    assert.equal(transport.connected, true);
  });

  it('processes incoming ADD_SONG message and invokes onAddSong callback', async () => {
    const transport = new MockTransport();
    let receivedSong = null;

    const host = new PartyHost({
      transport,
      onAddSong: (song) => {
        receivedSong = song;
      }
    });

    await host.start('ROCK4');

    const songMsg = createAddSongMessage({
      singer: 'Dave',
      title: 'Wonderwall',
      artist: 'Oasis',
      preferredKey: -1
    });

    transport.simulatePeerMessage(songMsg);

    assert.ok(receivedSong);
    assert.equal(receivedSong.singer, 'Dave');
    assert.equal(receivedSong.title, 'Wonderwall');
    assert.equal(receivedSong.preferredKey, -1);
  });

  it('processes incoming TRIGGER_SFX message and invokes onTriggerSfx callback', async () => {
    const transport = new MockTransport();
    let triggeredSfx = null;

    const host = new PartyHost({
      transport,
      onTriggerSfx: (sfx) => {
        triggeredSfx = sfx;
      }
    });

    await host.start('BEAT1');
    const sfxMsg = createSfxMessage('airhorn', 'Crowd Member');

    transport.simulatePeerMessage(sfxMsg);

    assert.ok(triggeredSfx);
    assert.equal(triggeredSfx.pad, 'airhorn');
    assert.equal(triggeredSfx.sender, 'Crowd Member');
  });

  it('broadcasts queue update to connected party guests', async () => {
    const transport = new MockTransport();
    const host = new PartyHost({ transport });
    await host.start('SING9');

    const queue = [{ id: '1', singer: 'Alice', title: 'Song A' }];
    const currentTrack = { title: 'Now Playing Song' };

    host.broadcastQueue(queue, currentTrack);

    assert.equal(transport.broadcastedMessages.length, 1);
    const lastMsg = transport.broadcastedMessages[0];
    assert.equal(lastMsg.action, PartyAction.QUEUE_UPDATE);
    assert.equal(lastMsg.payload.queue[0].singer, 'Alice');
  });

  it('stops and disconnects cleanly', async () => {
    const transport = new MockTransport();
    const host = new PartyHost({ transport });
    await host.start('TEST5');

    assert.equal(host.isActive, true);
    host.stop();

    assert.equal(host.isActive, false);
    assert.equal(transport.connected, false);
  });
});
