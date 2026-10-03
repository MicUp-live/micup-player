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
    let connectedPayload = null;
    const client = new PartyClient({
      transport,
      onConnected: (data) => {
        connectedPayload = data;
      }
    });

    assert.equal(client.isConnected, false);
    assert.equal(client.isBrokerConnected, false);
    await client.join('ROCK4', 'Sarah');

    // Broker connected and subscribed, but waiting for host WELCOME
    assert.equal(client.isBrokerConnected, true);
    assert.equal(client.isConnected, false);
    assert.equal(client.roomCode, 'ROCK4');
    assert.equal(client.singerName, 'Sarah');

    // Simulate host WELCOME handshake response
    transport.simulateHostMessage({
      action: PartyAction.WELCOME,
      payload: {
        sessionId: 'sess-abc',
        queue: [{ id: '1', title: 'Song 1' }],
        revision: 1
      }
    });

    assert.equal(client.isConnected, true);
    assert.ok(connectedPayload);
    assert.equal(connectedPayload.sessionId, 'sess-abc');
  });

  it('retries handshake and reports failure when joining room with no responsive host', async () => {
    const transport = new MockTransport();
    let failureError = null;
    const client = new PartyClient({
      transport,
      maxHandshakeAttempts: 2,
      onConnectionFailed: (err) => {
        failureError = err;
      }
    });

    await client.join('NOHOST', 'Guest');
    assert.equal(client.isConnected, false);
    assert.equal(client.isBrokerConnected, true);
    assert.equal(client.handshakeAttempts, 1);

    // Initial HELLO was sent
    const hellos = transport.sentMessages.filter(m => m.action === PartyAction.HELLO);
    assert.equal(hellos.length, 1);

    // Fast-forward timeout
    client.performHandshake(); // Attempt 2
    assert.equal(client.handshakeAttempts, 2);

    // Clear timeout and simulate final failure callback
    clearTimeout(client.handshakeTimeoutId);
    if (typeof client.onConnectionFailed === 'function') {
      client.onConnectionFailed(new Error('No host found in room'));
    }

    assert.ok(failureError);
    assert.match(failureError.message, /No host/i);
    assert.equal(client.isConnected, false);
    client.destroy();
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

    const addSongMsg = transport.sentMessages.find(m => m.action === PartyAction.ADD_SONG);
    assert.ok(addSongMsg, 'ADD_SONG message must be sent');
    assert.equal(addSongMsg.payload.singer, 'Dave');
    assert.equal(addSongMsg.payload.title, 'Creep');
    assert.equal(addSongMsg.payload.preferredKey, -1);
    assert.equal(addSongMsg.payload.youtubeId, 'XFkzRNyygfk');
    client.destroy();
  });

  it('sends sound effect reaction to host', async () => {
    const transport = new MockTransport();
    const client = new PartyClient({ transport });
    await client.join('PARTY1', 'Alex');

    client.triggerSfx('applause');

    const sfxMsg = transport.sentMessages.find(m => m.action === PartyAction.TRIGGER_SFX);
    assert.ok(sfxMsg, 'TRIGGER_SFX message must be sent');
    assert.equal(sfxMsg.payload.pad, 'applause');
    assert.equal(sfxMsg.payload.sender, 'Alex');
    client.destroy();
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
    client.destroy();
  });

  it('reports visible handshake failure and prevents song requests when disconnected', async () => {
    const transport = new MockTransport();
    let failureNotice = null;

    const client = new PartyClient({
      transport,
      maxHandshakeAttempts: 1,
      onConnectionFailed: (err) => {
        failureNotice = err.message;
      }
    });

    await client.join('EMPTY', 'Singer');
    assert.equal(client.isConnected, false);

    // Simulate handshake timeout exceeding max attempts
    client.handleHandshakeTimeout();
    assert.ok(failureNotice, 'Handshake failure must trigger callback');
    assert.match(failureNotice, /Party host did not respond/i);
    assert.equal(client.isConnected, false);

    // Verify client rejects song requests when disconnected
    client.disconnect();
    assert.throws(() => {
      client.requestSong({ title: 'Should Fail' });
    }, /Cannot request song while disconnected/i);

    client.destroy();
  });
});
