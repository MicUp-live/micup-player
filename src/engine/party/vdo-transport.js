/**
 * WebRTC DataChannel transport using VDO.Ninja SDK (MPL-2.0)
 * Handles autoConnect to room in data-only mode (&datamode)
 */

export class VDONinjaTransport {
  constructor() {
    this.sdk = null;
    this.room = null;
    this.connected = false;
    this.listeners = new Map();
  }

  /**
   * Load the official VDO.Ninja SDK dynamically if not already loaded
   */
  async loadSDK() {
    if (typeof window === 'undefined') {
      throw new Error('VDONinjaTransport requires a browser environment');
    }

    if (window.VDONinjaSDK) {
      return window.VDONinjaSDK;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.vdo.ninja/vdoninja.js';
      script.async = true;
      script.onload = () => {
        if (window.VDONinjaSDK) {
          resolve(window.VDONinjaSDK);
        } else {
          reject(new Error('VDONinjaSDK script loaded but window.VDONinjaSDK is undefined'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load VDO.Ninja SDK from https://sdk.vdo.ninja/vdoninja.js'));
      document.head.appendChild(script);
    });
  }

  /**
   * Connect to room
   */
  async connect(roomCode) {
    this.room = roomCode;
    const SDKClass = await this.loadSDK();
    this.sdk = new SDKClass();

    this.sdk.addEventListener('dataReceived', (e) => {
      const data = e.detail?.data || e.data;
      this.emit('message', data);
    });

    this.sdk.addEventListener('connected', () => {
      this.connected = true;
      this.emit('connected');
    });

    this.sdk.addEventListener('disconnected', () => {
      this.connected = false;
      this.emit('disconnected');
    });

    // Auto-connect in data-only mode (&datamode)
    await this.sdk.autoConnect({
      room: `micup_party_${roomCode.toLowerCase()}`,
      datamode: true
    });

    this.connected = true;
  }

  /**
   * Disconnect from room
   */
  disconnect() {
    this.connected = false;
    if (this.sdk) {
      try {
        if (typeof this.sdk.close === 'function') this.sdk.close();
        if (typeof this.sdk.disconnect === 'function') this.sdk.disconnect();
      } catch (err) {
        console.warn('Error closing VDO.Ninja SDK connection:', err);
      }
      this.sdk = null;
    }
    this.emit('disconnected');
  }

  /**
   * Broadcast data to peers
   */
  send(data) {
    if (this.sdk && typeof this.sdk.sendData === 'function') {
      this.sdk.sendData(data);
    }
  }

  /**
   * Event listener management
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, payload) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`Error in transport ${event} listener:`, err);
      }
    });
  }
}
