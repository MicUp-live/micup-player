import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPartyActive,
  partyRoomCode,
  partyBroker,
  partySessionId,
  partyActivityLogs,
  connectedPeersCount,
  startPartyHost,
  stopPartyHost
} from './party-state.js';
import { queue } from './player-state.js';
import {
  createAddSongMessage,
  createHelloMessage,
  createSfxMessage,
  PartyAction
} from '../engine/party/party-protocol.js';

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

  simulatePeerMessage(data) {
    const callbacks = this.listeners.get('message') || [];
    callbacks.forEach(cb => cb(data));
  }
}

describe('Party State Integration', () => {
  beforeEach(() => {
    stopPartyHost();
    queue.value = [];
    partyActivityLogs.value = [];
  });

  it('starts party host with mock transport and updates signals', async () => {
    const transport = new MockTransport();
    const code = await startPartyHost('TEST1', transport, 'hivemq');

    assert.equal(code, 'TEST1');
    assert.equal(isPartyActive.value, true);
    assert.equal(partyRoomCode.value, 'TEST1');
    assert.equal(partyBroker.value, 'hivemq');
    assert.ok(partySessionId.value.length > 0);
    assert.ok(partyActivityLogs.value.length > 0);
  });

  it('adds incoming party YouTube song to playerState queue', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST2', transport);

    // Register guest
    transport.simulatePeerMessage(createHelloMessage({ clientId: 'guest-1', singer: 'Jessica' }));

    const songMsg = createAddSongMessage({
      clientId: 'guest-1',
      sessionId: partySessionId.value,
      singer: 'Jessica',
      title: 'Since U Been Gone',
      artist: 'Kelly Clarkson',
      preferredKey: 1,
      source: 'youtube',
      youtubeId: 'R7UrFYvl5TE'
    });

    transport.simulatePeerMessage(songMsg);

    assert.equal(queue.value.length, 1);
    const added = queue.value[0];
    assert.equal(added.singerName, 'Jessica');
    assert.equal(added.title, 'Since U Been Gone');
    assert.equal(added.semitones, 1);
    assert.equal(added.source, 'youtube');
  });

  it('adds incoming party manual song without throwing (critical regression test)', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST3', transport);

    // Register guest
    transport.simulatePeerMessage(createHelloMessage({ clientId: 'guest-2', singer: 'Dave' }));

    const manualMsg = createAddSongMessage({
      clientId: 'guest-2',
      sessionId: partySessionId.value,
      singer: 'Dave',
      title: 'Wonderwall',
      artist: 'Oasis',
      preferredKey: 0,
      source: 'local',
      youtubeId: null
    });

    transport.simulatePeerMessage(manualMsg);

    assert.equal(queue.value.length, 1);
    const added = queue.value[0];
    assert.equal(added.singerName, 'Dave');
    assert.equal(added.title, 'Wonderwall');
    assert.equal(added.source, 'local');

    // Verify ADD_SONG_ACK was sent back to transport
    const ack = transport.sentMessages.find(m => m.action === PartyAction.ADD_SONG_ACK);
    assert.ok(ack, 'ADD_SONG_ACK should be emitted');
    assert.equal(ack.payload.accepted, true);
  });

  it('deduplicates duplicate ADD_SONG messages with identical requestId', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST4', transport);

    // Register guest
    transport.simulatePeerMessage(createHelloMessage({ clientId: 'guest-3', singer: 'Sam' }));

    const songMsg = createAddSongMessage({
      clientId: 'guest-3',
      sessionId: partySessionId.value,
      requestId: 'req-unique-12345',
      singer: 'Sam',
      title: 'Sweet Caroline',
      artist: 'Neil Diamond',
      preferredKey: 0
    });

    // Send first time
    transport.simulatePeerMessage(songMsg);
    assert.equal(queue.value.length, 1);

    // Replay duplicate with same requestId
    transport.simulatePeerMessage(songMsg);
    assert.equal(queue.value.length, 1, 'Duplicate request must not be queued twice');
  });

  it('responds with WELCOME and tracks peer count on HELLO handshake', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST5', transport);

    const helloMsg = createHelloMessage({
      clientId: 'guest_client_99',
      singer: 'Alex',
      nonce: 'nonce_123'
    });

    transport.simulatePeerMessage(helloMsg);

    const welcome = transport.sentMessages.find(m => m.action === PartyAction.WELCOME);
    assert.ok(welcome, 'WELCOME message must be sent');
    assert.equal(welcome.payload.nonce, 'nonce_123');
    assert.equal(connectedPeersCount.value, 1);
  });

  it('handles soundboard triggers cleanly without throwing', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST6', transport);

    // Register guest
    transport.simulatePeerMessage(createHelloMessage({ clientId: 'guest-4', singer: 'Sarah' }));

    const sfxMsg = createSfxMessage('applause', 'Sarah', 'guest-4', partySessionId.value);
    transport.simulatePeerMessage(sfxMsg);

    assert.ok(partyActivityLogs.value.some(log => log.text.includes('Sarah triggered applause')));
  });

  it('stops party host cleanly', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST7', transport);
    assert.equal(isPartyActive.value, true);

    stopPartyHost();
    assert.equal(isPartyActive.value, false);
    assert.equal(partyRoomCode.value, '');
  });
});
