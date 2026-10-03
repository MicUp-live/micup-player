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
    onPeersChange = null,
    onDisconnected = null
  } = {}) {
    this.brokerId = brokerId;
    this.transport = transport || new MqttPartyTransport({ isHost: true, brokerId });
    this.onAddSong = onAddSong;
    this.onTriggerSfx = onTriggerSfx;
    this.onSearch = onSearch;
    this.onPeersChange = onPeersChange;
    this.onDisconnected = onDisconnected;

    this.roomCode = null;
    this.sessionId = Math.random().toString(36).substring(2, 9);
    this.isActive = false;
    this.revision = 1;
    this.currentQueue = [];
    this.currentTrack = null;

    // Track active guest clients (clientId -> { singer, lastSeen })
    this.activePeers = new Map();
    // Track rate limits (clientId -> timestamp)
    this.peerLastSongRequest = new Map();
    this.lastSfxTime = 0;

    // Idempotency: Map<requestId, { accepted: boolean, songId: string, revision: number, error?: string }>
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

        // Song request with trust verification, idempotency & explicit ACK
        case PartyAction.ADD_SONG: {
          const req = msg.payload || {};
          const reqId = req.requestId || req.id;
          const clientId = typeof req.clientId === 'string' ? req.clientId.trim() : '';
          const sessionId = typeof (req.sessionId || req.session) === 'string' ? (req.sessionId || req.session).trim() : '';

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

          // 2. Trust boundary: require and verify active session ID (reject missing or mismatching session)
          if (!sessionId || sessionId !== this.sessionId) {
            if (reqId) {
              this.requestReceipts.set(reqId, { accepted: false, error: 'Stale party session' });
              const rejectMsg = createAddSongAckMessage({
                requestId: reqId,
                accepted: false,
                error: 'Stale party session. Please refresh and rejoin.'
              });
              this.transport.send(rejectMsg, 1);
            }
            return;
          }

          // 3. Trust boundary: require and verify client membership (reject anonymous or unregistered)
          if (!clientId || !this.activePeers.has(clientId)) {
            if (reqId) {
              this.requestReceipts.set(reqId, { accepted: false, error: 'Unregistered client' });
              const rejectMsg = createAddSongAckMessage({
                requestId: reqId,
                accepted: false,
                error: 'Client not registered. Please join room first.'
              });
              this.transport.send(rejectMsg, 1);
            }
            return;
          }

          // 4. Rate limiting: max 1 request every 2000ms per client
          const now = Date.now();
          if (this.peerLastSongRequest.has(clientId)) {
            const lastTime = this.peerLastSongRequest.get(clientId);
            if (now - lastTime < 2000) {
              if (reqId) {
                const rejectMsg = createAddSongAckMessage({
                  requestId: reqId,
                  accepted: false,
                  error: 'Rate limit exceeded. Please wait a moment before submitting another song.'
                });
                this.transport.send(rejectMsg, 1);
              }
              return;
            }
          }
          this.peerLastSongRequest.set(clientId, now);

          // 5. Host-side data validation & sanitization
          const title = String(req.title || '').trim().substring(0, 150);
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

          const singer = String(req.singer || req.singerName || (clientId && this.activePeers.get(clientId)?.singer) || 'Guest').trim().substring(0, 50);
          const artist = String(req.artist || 'Unknown Artist').trim().substring(0, 150);
          let preferredKey = typeof req.preferredKey === 'number' ? req.preferredKey : 0;
          preferredKey = Math.max(-12, Math.min(12, Math.round(preferredKey)));

          let source = req.source;
          let youtubeId = req.youtubeId || req.videoId || null;
          if (source === 'youtube') {
            if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(String(youtubeId).trim())) {
              source = 'request';
              youtubeId = null;
            } else {
              youtubeId = String(youtubeId).trim();
            }
          } else {
            source = source || 'request';
          }

          const sanitizedReq = {
            ...req,
            requestId: reqId,
            title,
            artist,
            singer,
            singerName: singer,
            preferredKey,
            semitones: preferredKey,
            source,
            youtubeId,
            videoId: youtubeId
          };

          // 6. Commit mutation
          let committedSong = null;
          if (typeof this.onAddSong === 'function') {
            committedSong = this.onAddSong(sanitizedReq);
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

        // Host-throttled Sound Effects
        case PartyAction.TRIGGER_SFX: {
          const payload = msg.payload || {};
          const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
          const sessionId = typeof (payload.sessionId || payload.session) === 'string' ? (payload.sessionId || payload.session).trim() : '';
          const now = Date.now();

          // Drop unverified peer SFX (requires registered client)
          if (!clientId || !this.activePeers.has(clientId)) {
            return;
          }

          // Verify session if provided
          if (sessionId && sessionId !== this.sessionId) {
            return;
          }

          if (now - this.lastSfxTime < 1000) {
            // Drop rapid-fire SFX spam
            return;
          }
          this.lastSfxTime = now;

          if (typeof this.onTriggerSfx === 'function') {
            this.onTriggerSfx(payload);
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
      this.isActive = false;
      if (typeof this.onDisconnected === 'function') {
        this.onDisconnected();
      }
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
