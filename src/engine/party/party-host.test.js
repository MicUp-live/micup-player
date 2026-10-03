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

    // Register guest
    transport.simulatePeerMessage({
      action: PartyAction.HELLO,
      payload: { clientId: 'dave-1', singer: 'Dave' }
    });

    const songMsg = createAddSongMessage({
      clientId: 'dave-1',
      sessionId: host.sessionId,
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

    // Register guest
    transport.simulatePeerMessage({
      action: PartyAction.HELLO,
      payload: { clientId: 'crowd-1', singer: 'Crowd Member' }
    });

    const sfxMsg = createSfxMessage('airhorn', 'Crowd Member', 'crowd-1', host.sessionId);

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

  it('rejects anonymous, unregistered, and stale session song requests', async () => {
    const transport = new MockTransport();
    let onAddSongCalled = false;

    const host = new PartyHost({
      transport,
      onAddSong: () => {
        onAddSongCalled = true;
      }
    });

    await host.start('SAFE1');

    // 1. Send anonymous ADD_SONG (no clientId or sessionId)
    transport.simulatePeerMessage({
      action: PartyAction.ADD_SONG,
      payload: {
        requestId: 'req-anon',
        title: 'Anonymous Hack Song',
        singer: 'Anonymous'
      }
    });

    assert.equal(onAddSongCalled, false, 'onAddSong must not be called for anonymous request');
    const anonAck = transport.broadcastedMessages.find(m => m.payload?.requestId === 'req-anon');
    assert.ok(anonAck, 'Rejection ACK must be sent for anonymous request');
    assert.equal(anonAck.payload.accepted, false);
    assert.match(anonAck.payload.error, /stale|registered/i);

    // 2. Send ADD_SONG from unregistered client with matching session
    transport.simulatePeerMessage({
      action: PartyAction.ADD_SONG,
      payload: {
        requestId: 'req-bad-client',
        clientId: 'unregistered_guest',
        sessionId: host.sessionId,
        title: 'Hacked Song',
        singer: 'Bad Actor'
      }
    });

    assert.equal(onAddSongCalled, false, 'onAddSong must not be called for unregistered client');
    const rejectAck = transport.broadcastedMessages.find(m => m.payload?.requestId === 'req-bad-client');
    assert.ok(rejectAck, 'Rejection ACK must be sent');
    assert.equal(rejectAck.payload.accepted, false);
    assert.match(rejectAck.payload.error, /Client not registered/i);

    // 3. Register client via HELLO
    transport.simulatePeerMessage({
      action: PartyAction.HELLO,
      payload: {
        clientId: 'good_guest',
        singer: 'Good Singer'
      }
    });

    // 4. Send ADD_SONG with stale session
    transport.simulatePeerMessage({
      action: PartyAction.ADD_SONG,
      payload: {
        requestId: 'req-stale-session',
        clientId: 'good_guest',
        sessionId: 'old-session-123',
        title: 'Valid Title',
        singer: 'Good Singer'
      }
    });

    assert.equal(onAddSongCalled, false, 'onAddSong must not be called for stale session');
    const staleAck = transport.broadcastedMessages.find(m => m.payload?.requestId === 'req-stale-session');
    assert.ok(staleAck);
    assert.equal(staleAck.payload.accepted, false);
    assert.match(staleAck.payload.error, /Stale party session/i);

    // 5. Send valid ADD_SONG from registered client with matching session
    transport.simulatePeerMessage({
      action: PartyAction.ADD_SONG,
      payload: {
        requestId: 'req-valid',
        clientId: 'good_guest',
        sessionId: host.sessionId,
        title: 'Valid Song',
        singer: 'Good Singer'
      }
    });

    assert.equal(onAddSongCalled, true, 'onAddSong must be called for verified client');
    const validAck = transport.broadcastedMessages.find(m => m.payload?.requestId === 'req-valid');
    assert.ok(validAck);
    assert.equal(validAck.payload.accepted, true);
  });

  it('throttles rapid-fire TRIGGER_SFX messages from peers', async () => {
    const transport = new MockTransport();
    let sfxTriggerCount = 0;

    const host = new PartyHost({
      transport,
      onTriggerSfx: () => {
        sfxTriggerCount++;
      }
    });

    await host.start('SAFE2');

    // Register peer
    transport.simulatePeerMessage({
      action: PartyAction.HELLO,
      payload: { clientId: 'peer-sfx', singer: 'SFX Peer' }
    });

    // Rapid-fire SFX messages
    transport.simulatePeerMessage(createSfxMessage('airhorn', 'Singer 1', 'peer-sfx', host.sessionId));
    transport.simulatePeerMessage(createSfxMessage('applause', 'Singer 2', 'peer-sfx', host.sessionId));
    transport.simulatePeerMessage(createSfxMessage('scratch', 'Singer 3', 'peer-sfx', host.sessionId));

    assert.equal(sfxTriggerCount, 1, 'Only first SFX within cooldown window should trigger');
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
