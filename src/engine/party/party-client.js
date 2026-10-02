import {
  PartyAction,
  createHelloMessage,
  createAddSongMessage,
  createSfxMessage,
  parsePartyMessage,
  generateNonce
} from './party-protocol.js';
import { MqttPartyTransport, DEFAULT_BROKER } from './mqtt-transport.js';

export class PartyClient {
  constructor({
    transport = null,
    brokerId = DEFAULT_BROKER,
    onQueueUpdate = null,
    onConnected = null,
    onDisconnected = null,
    onSongAck = null
  } = {}) {
    this.brokerId = brokerId;
    this.transport = transport || new MqttPartyTransport({ isHost: false, brokerId });
    this.onQueueUpdate = onQueueUpdate;
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.onSongAck = onSongAck;

    this.clientId = `guest_${Math.random().toString(36).substring(2, 9)}`;
    this.roomCode = null;
    this.singerName = 'Guest';
    this.sessionId = null;
    this.revision = 0;
    this.isConnected = false;
    this.isSubscribed = false;
    this.queue = [];
    this.currentTrack = null;

    this.pendingHelloNonce = null;
    this.handshakeTimeoutId = null;

    this.setupTransportListeners();
  }

  setupTransportListeners() {
    this.transport.on('message', (raw) => {
      const msg = parsePartyMessage(raw);
      if (!msg) return;

      switch (msg.action) {
        // Correlated WELCOME response from host
        case PartyAction.WELCOME: {
          const payload = msg.payload || {};
          if (this.pendingHelloNonce && payload.nonce && payload.nonce !== this.pendingHelloNonce) {
            // Uncorrelated response from a previous handshake attempt, ignore
            return;
          }

          if (this.handshakeTimeoutId) {
            clearTimeout(this.handshakeTimeoutId);
            this.handshakeTimeoutId = null;
          }

          this.isConnected = true;
          this.sessionId = payload.sessionId || null;
          this.revision = payload.revision || 1;
          this.queue = payload.queue || [];
          this.currentTrack = payload.currentTrack || null;

          if (typeof this.onConnected === 'function') {
            this.onConnected({
              queue: this.queue,
              currentTrack: this.currentTrack,
              sessionId: this.sessionId,
              revision: this.revision
            });
          }

          if (typeof this.onQueueUpdate === 'function') {
            this.onQueueUpdate(this.queue, this.currentTrack, this.revision);
          }
          break;
        }

        // Host confirmation of song request
        case PartyAction.ADD_SONG_ACK: {
          if (typeof this.onSongAck === 'function') {
            this.onSongAck(msg.payload);
          }
          break;
        }

        // Broadcasted queue revision from host
        case PartyAction.QUEUE_UPDATE: {
          const payload = msg.payload || {};
          this.queue = payload.queue || [];
          this.currentTrack = payload.currentTrack || null;
          if (payload.revision) {
            this.revision = payload.revision;
          }

          if (typeof this.onQueueUpdate === 'function') {
            this.onQueueUpdate(this.queue, this.currentTrack, this.revision);
          }
          break;
        }

        default:
          break;
      }
    });

    this.transport.on('subscribed', () => {
      this.isSubscribed = true;
      this.performHandshake();
    });

    this.transport.on('disconnected', () => {
      this.isConnected = false;
      this.isSubscribed = false;
      if (this.handshakeTimeoutId) {
        clearTimeout(this.handshakeTimeoutId);
        this.handshakeTimeoutId = null;
      }
      if (typeof this.onDisconnected === 'function') {
        this.onDisconnected();
      }
    });
  }

  /**
   * Perform HELLO -> WELCOME handshake with host
   */
  performHandshake() {
    this.pendingHelloNonce = generateNonce();
    const helloMsg = createHelloMessage({
      clientId: this.clientId,
      singer: this.singerName,
      nonce: this.pendingHelloNonce,
      session: this.sessionId
    });

    this.transport.send(helloMsg, 1);

    // Timeout if host doesn't respond within 5 seconds
    if (this.handshakeTimeoutId) clearTimeout(this.handshakeTimeoutId);
    this.handshakeTimeoutId = setTimeout(() => {
      if (!this.isConnected && this.isSubscribed) {
        console.warn('Host handshake timed out, retrying HELLO...');
        this.performHandshake();
      }
    }, 4500);
  }

  /**
   * Join a house party room
   */
  async join(roomCode, singerName = 'Guest', brokerId = null) {
    this.roomCode = String(roomCode || '').toUpperCase().trim();
    this.singerName = String(singerName || 'Guest').trim();
    if (brokerId) {
      this.brokerId = brokerId;
    }

    await this.transport.connect(this.roomCode, { brokerId: this.brokerId });
    this.isConnected = true;
    this.isSubscribed = true;

    // Send peer join announcement for immediate backward compatibility
    this.transport.send({
      action: PartyAction.PEER_JOIN,
      payload: { clientId: this.clientId, singer: this.singerName }
    }, 1);

    this.performHandshake();
  }

  /**
   * Request a song with unique requestId
   */
  requestSong({
    title,
    artist = '',
    preferredKey = 0,
    source = 'local',
    youtubeId = null,
    notes = '',
    requestId = null
  }) {
    if (!this.isSubscribed && !this.isConnected) {
      throw new Error('Cannot request song while disconnected from party room');
    }

    const msg = createAddSongMessage({
      requestId,
      sessionId: this.sessionId,
      clientId: this.clientId,
      singer: this.singerName,
      title,
      artist,
      preferredKey,
      source,
      youtubeId,
      notes
    });

    this.transport.send(msg, 1);
    return msg.payload;
  }

  /**
   * Trigger crowd sound reaction
   */
  triggerSfx(pad) {
    if (!this.isSubscribed && !this.isConnected) return;
    const msg = createSfxMessage(pad, this.singerName);
    this.transport.send(msg, 1);
  }

  /**
   * Disconnect from party room
   */
  disconnect() {
    this.isConnected = false;
    this.isSubscribed = false;
    this.roomCode = null;
    this.queue = [];
    this.currentTrack = null;
    if (this.handshakeTimeoutId) {
      clearTimeout(this.handshakeTimeoutId);
      this.handshakeTimeoutId = null;
    }
    if (this.transport && typeof this.transport.disconnect === 'function') {
      this.transport.disconnect();
    }
  }
}
