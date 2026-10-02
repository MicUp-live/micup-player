import {
  PartyAction,
  generateRoomCode,
  createQueueUpdateMessage,
  parsePartyMessage
} from './party-protocol.js';
import { MqttPartyTransport } from './mqtt-transport.js';

export class PartyHost {
  constructor({
    transport = null,
    onAddSong = null,
    onTriggerSfx = null,
    onSearch = null
  } = {}) {
    this.transport = transport || new MqttPartyTransport({ isHost: true });
    this.onAddSong = onAddSong;
    this.onTriggerSfx = onTriggerSfx;
    this.onSearch = onSearch;

    this.roomCode = null;
    this.isActive = false;
    this.connectedPeersCount = 0;

    this.setupTransportListeners();
  }

  setupTransportListeners() {
    this.transport.on('message', (raw) => {
      const msg = parsePartyMessage(raw);
      if (!msg) return;

      switch (msg.action) {
        case PartyAction.ADD_SONG:
          if (typeof this.onAddSong === 'function') {
            this.onAddSong(msg.payload);
          }
          break;

        case PartyAction.TRIGGER_SFX:
          if (typeof this.onTriggerSfx === 'function') {
            this.onTriggerSfx(msg.payload);
          }
          break;

        case PartyAction.SEARCH_REQ:
          if (typeof this.onSearch === 'function') {
            const results = this.onSearch(msg.payload.query);
            this.transport.send({
              action: PartyAction.SEARCH_RES,
              payload: {
                reqId: msg.payload.reqId,
                results
              }
            });
          }
          break;

        default:
          break;
      }
    });

    this.transport.on('connected', () => {
      this.connectedPeersCount++;
    });

    this.transport.on('disconnected', () => {
      if (this.connectedPeersCount > 0) {
        this.connectedPeersCount--;
      }
    });
  }

  /**
   * Start the house party room
   */
  async start(preferredCode = null) {
    this.roomCode = preferredCode ? String(preferredCode).toUpperCase().trim() : generateRoomCode();
    await this.transport.connect(this.roomCode);
    this.isActive = true;
    return this.roomCode;
  }

  /**
   * Broadcast current queue state to all connected guests
   */
  broadcastQueue(queue = [], currentTrack = null) {
    if (!this.isActive) return;
    const msg = createQueueUpdateMessage(queue, currentTrack);
    this.transport.send(msg);
  }

  /**
   * Stop the house party room
   */
  stop() {
    this.isActive = false;
    this.roomCode = null;
    this.connectedPeersCount = 0;
    if (this.transport && typeof this.transport.disconnect === 'function') {
      this.transport.disconnect();
    }
  }
}
