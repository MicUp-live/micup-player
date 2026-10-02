import {
  PartyAction,
  generateRoomCode,
  createQueueUpdateMessage,
  createWelcomeMessage,
  createAddSongAckMessage,
  parsePartyMessage
} from './party-protocol.js';
import { MqttPartyTransport, DEFAULT_BROKER } from './mqtt-transport.js';

export class PartyHost {
  constructor({
    transport = null,
    brokerId = DEFAULT_BROKER,
    onAddSong = null,
    onTriggerSfx = null,
    onSearch = null,
    onPeersChange = null
  } = {}) {
    this.brokerId = brokerId;
    this.transport = transport || new MqttPartyTransport({ isHost: true, brokerId });
    this.onAddSong = onAddSong;
    this.onTriggerSfx = onTriggerSfx;
    this.onSearch = onSearch;
    this.onPeersChange = onPeersChange;

    this.roomCode = null;
    this.sessionId = Math.random().toString(36).substring(2, 9);
    this.isActive = false;
    this.revision = 1;
    this.currentQueue = [];
    this.currentTrack = null;

    // Track active guest clients (clientId -> { singer, lastSeen })
    this.activePeers = new Map();
    // Idempotency: Map<requestId, { accepted: boolean, songId: string, revision: number }>
    this.requestReceipts = new Map();

    this.setupTransportListeners();
  }

  get connectedPeersCount() {
    return this.activePeers.size;
  }

  setupTransportListeners() {
    this.transport.on('message', (raw) => {
      const msg = parsePartyMessage(raw);
      if (!msg) return;

      switch (msg.action) {
        // Correlated HELLO -> WELCOME handshake
        case PartyAction.HELLO:
        case PartyAction.PEER_JOIN: {
          const payload = msg.payload || {};
          const clientId = payload.clientId || `guest_${Date.now()}`;
          this.activePeers.set(clientId, {
            singer: payload.singer || 'Guest',
            lastSeen: Date.now()
          });

          if (typeof this.onPeersChange === 'function') {
            this.onPeersChange(this.activePeers.size);
          }

          // Reply with WELCOME containing full current snapshot and session
          const welcomeMsg = createWelcomeMessage({
            nonce: payload.nonce || '',
            sessionId: this.sessionId,
            revision: this.revision,
            queue: this.currentQueue,
            currentTrack: this.currentTrack
          });
          this.transport.send(welcomeMsg, 1);
          break;
        }

        // Song request with idempotency & explicit ACK
        case PartyAction.ADD_SONG: {
          const req = msg.payload || {};
          const reqId = req.requestId;

          // 1. Check idempotency: Replay original receipt if duplicate
          if (reqId && this.requestReceipts.has(reqId)) {
            const receipt = this.requestReceipts.get(reqId);
            const ackMsg = createAddSongAckMessage({
              requestId: reqId,
              accepted: receipt.accepted,
              songId: receipt.songId,
              revision: receipt.revision,
              error: receipt.error
            });
            this.transport.send(ackMsg, 1);
            return;
          }

          // 2. Validate request
          const title = String(req.title || '').trim();
          if (!title) {
            if (reqId) {
              const rejectMsg = createAddSongAckMessage({
                requestId: reqId,
                accepted: false,
                error: 'Song title is required'
              });
              this.transport.send(rejectMsg, 1);
            }
            return;
          }

          // 3. Commit mutation
          let committedSong = null;
          if (typeof this.onAddSong === 'function') {
            committedSong = this.onAddSong(req);
          }

          this.revision++;
          const songId = committedSong?.id || req.id || `song_${Date.now()}`;

          if (reqId) {
            this.requestReceipts.set(reqId, {
              accepted: true,
              songId,
              revision: this.revision
            });

            // Send explicit ACK to guest
            const ackMsg = createAddSongAckMessage({
              requestId: reqId,
              accepted: true,
              songId,
              revision: this.revision
            });
            this.transport.send(ackMsg, 1);
          }
          break;
        }

        case PartyAction.TRIGGER_SFX: {
          if (typeof this.onTriggerSfx === 'function') {
            this.onTriggerSfx(msg.payload);
          }
          break;
        }

        case PartyAction.SEARCH_REQ: {
          if (typeof this.onSearch === 'function') {
            const results = this.onSearch(msg.payload.query);
            this.transport.send({
              action: PartyAction.SEARCH_RES,
              payload: {
                reqId: msg.payload.reqId,
                results
              }
            }, 1);
          }
          break;
        }

        default:
          break;
      }
    });

    this.transport.on('disconnected', () => {
      // Host network disconnected
    });
  }

  /**
   * Start the house party room
   */
  async start(preferredCode = null) {
    this.roomCode = preferredCode ? String(preferredCode).toUpperCase().trim() : generateRoomCode();
    await this.transport.connect(this.roomCode, { brokerId: this.brokerId });
    this.isActive = true;
    return this.roomCode;
  }

  /**
   * Broadcast current queue state to all connected guests
   */
  broadcastQueue(queue = [], currentTrack = null) {
    this.currentQueue = Array.isArray(queue) ? queue : [];
    this.currentTrack = currentTrack || null;
    if (!this.isActive) return;

    const msg = createQueueUpdateMessage(this.currentQueue, this.currentTrack, this.revision);
    this.transport.send(msg, 1);
  }

  /**
   * Stop the house party room
   */
  stop() {
    this.isActive = false;
    this.roomCode = null;
    this.activePeers.clear();
    this.requestReceipts.clear();
    if (this.transport && typeof this.transport.disconnect === 'function') {
      this.transport.disconnect();
    }
  }
}
