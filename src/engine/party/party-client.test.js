import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PartyClient } from './party-client.js';
import { PartyAction, createQueueUpdateMessage } from './party-protocol.js';

class MockTransport {
  constructor() {
    this.room = null;
    this.sentMessages = [];
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
    this.sentMessages.push(data);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  simulateHostMessage(data) {
    const callbacks = this.listeners.get('message') || [];
    callbacks.forEach(cb => cb(data));
  }
}

describe('PartyClient Engine', () => {
  it('joins room and tracks singer identity', async () => {
    const transport = new MockTransport();
    const client = new PartyClient({ transport });

    assert.equal(client.isConnected, false);
    await client.join('ROCK4', 'Sarah');

    assert.equal(client.isConnected, true);
    assert.equal(client.roomCode, 'ROCK4');
    assert.equal(client.singerName, 'Sarah');
  });

  it('sends song request message to host', async () => {
    const transport = new MockTransport();
    const client = new PartyClient({ transport });
    await client.join('ROCK4', 'Dave');

    client.requestSong({
      title: 'Creep',
      artist: 'Radiohead',
      preferredKey: -1,
      source: 'youtube',
      youtubeId: 'XFkzRNyygfk'
    });

    assert.equal(transport.sentMessages.length, 2);
    assert.equal(transport.sentMessages[0].action, PartyAction.PEER_JOIN);
    const msg = transport.sentMessages[1];
    assert.equal(msg.action, PartyAction.ADD_SONG);
    assert.equal(msg.payload.singer, 'Dave');
    assert.equal(msg.payload.title, 'Creep');
    assert.equal(msg.payload.preferredKey, -1);
    assert.equal(msg.payload.youtubeId, 'XFkzRNyygfk');
  });

  it('sends sound effect reaction to host', async () => {
    const transport = new MockTransport();
    const client = new PartyClient({ transport });
    await client.join('PARTY1', 'Alex');

    client.triggerSfx('applause');

    assert.equal(transport.sentMessages.length, 2);
    assert.equal(transport.sentMessages[0].action, PartyAction.PEER_JOIN);
    const msg = transport.sentMessages[1];
    assert.equal(msg.action, PartyAction.TRIGGER_SFX);
    assert.equal(msg.payload.pad, 'applause');
    assert.equal(msg.payload.sender, 'Alex');
  });

  it('updates local queue and calls onQueueUpdate when host broadcasts update', async () => {
    const transport = new MockTransport();
    let updatedQueue = null;

    const client = new PartyClient({
      transport,
      onQueueUpdate: (queue) => {
        updatedQueue = queue;
      }
    });

    await client.join('PARTY1', 'Singer');

    const updateMsg = createQueueUpdateMessage([
      { id: '1', singer: 'Sarah', title: 'Song 1' },
      { id: '2', singer: 'Dave', title: 'Song 2' }
    ], { title: 'Now Playing' });

    transport.simulateHostMessage(updateMsg);

    assert.equal(client.queue.length, 2);
    assert.equal(client.currentTrack.title, 'Now Playing');
    assert.ok(updatedQueue);
    assert.equal(updatedQueue.length, 2);
  });
});
