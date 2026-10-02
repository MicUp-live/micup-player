import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPartyActive,
  partyRoomCode,
  partyActivityLogs,
  startPartyHost,
  stopPartyHost
} from './party-state.js';
import { queue } from './player-state.js';
import { createAddSongMessage, createSfxMessage } from '../engine/party/party-protocol.js';

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
    const code = await startPartyHost('TEST1', transport);

    assert.equal(code, 'TEST1');
    assert.equal(isPartyActive.value, true);
    assert.equal(partyRoomCode.value, 'TEST1');
    assert.ok(partyActivityLogs.value.length > 0);
  });

  it('adds incoming party song to playerState queue', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST2', transport);

    const songMsg = createAddSongMessage({
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

  it('stops party host cleanly', async () => {
    const transport = new MockTransport();
    await startPartyHost('TEST3', transport);
    assert.equal(isPartyActive.value, true);

    stopPartyHost();
    assert.equal(isPartyActive.value, false);
    assert.equal(partyRoomCode.value, '');
  });
});
