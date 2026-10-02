import {
  PartyAction,
  createAddSongMessage,
  createSfxMessage,
  parsePartyMessage
} from './party-protocol.js';
import { MqttPartyTransport } from './mqtt-transport.js';

export class PartyClient {
  constructor({
    transport = null,
    onQueueUpdate = null,
    onConnected = null,
    onDisconnected = null
  } = {}) {
    this.transport = transport || new MqttPartyTransport({ isHost: false });
    this.onQueueUpdate = onQueueUpdate;
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;

    this.roomCode = null;
    this.singerName = 'Guest';
    this.isConnected = false;
    this.queue = [];
    this.currentTrack = null;

    this.setupTransportListeners();
  }

  setupTransportListeners() {
    this.transport.on('message', (raw) => {
      const msg = parsePartyMessage(raw);
      if (!msg) return;

      if (msg.action === PartyAction.QUEUE_UPDATE) {
        this.queue = msg.payload.queue || [];
        this.currentTrack = msg.payload.currentTrack || null;
        if (typeof this.onQueueUpdate === 'function') {
          this.onQueueUpdate(this.queue, this.currentTrack);
        }
      }
    });

    this.transport.on('connected', () => {
      this.isConnected = true;
      if (typeof this.onConnected === 'function') {
        this.onConnected();
      }
    });

    this.transport.on('disconnected', () => {
      this.isConnected = false;
      if (typeof this.onDisconnected === 'function') {
        this.onDisconnected();
      }
    });
  }

  /**
   * Join a house party room
   */
  async join(roomCode, singerName = 'Guest') {
    this.roomCode = String(roomCode || '').toUpperCase().trim();
    this.singerName = String(singerName || 'Guest').trim();

    await this.transport.connect(this.roomCode);
    this.isConnected = true;

    // Send peer join announcement
    this.transport.send({
      action: PartyAction.PEER_JOIN,
      payload: { singer: this.singerName }
    });
  }

  /**
   * Request a song
   */
  requestSong({
    title,
    artist = '',
    preferredKey = 0,
    source = 'local',
    youtubeId = null,
    notes = ''
  }) {
    if (!this.isConnected) {
      throw new Error('Cannot request song while disconnected from party room');
    }

    const msg = createAddSongMessage({
      singer: this.singerName,
      title,
      artist,
      preferredKey,
      source,
      youtubeId,
      notes
    });

    this.transport.send(msg);
    return msg.payload;
  }

  /**
   * Trigger a crowd sound effect reaction (airhorn, applause, etc.)
   */
  triggerSfx(pad) {
    if (!this.isConnected) return;
    const msg = createSfxMessage(pad, this.singerName);
    this.transport.send(msg);
  }

  /**
   * Disconnect from party room
   */
  disconnect() {
    this.isConnected = false;
    this.roomCode = null;
    this.queue = [];
    this.currentTrack = null;
    if (this.transport && typeof this.transport.disconnect === 'function') {
      this.transport.disconnect();
    }
  }
}
