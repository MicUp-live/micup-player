/**
 * WebRTC DataChannel transport using VDO.Ninja SDK v1.6.1 (MPL-2.0)
 * Handles P2P room connection in data-only mode via announce & joinRoom
 */

export class VDONinjaTransport {
  constructor() {
    this.sdk = null;
    this.room = null;
    this.connected = false;
    this.listeners = new Map();
  }

  /**
   * Load the official VDO.Ninja SDK dynamically
   * Tries local public asset first, then falls back to official CDN
   */
  async loadSDK() {
    if (typeof window === 'undefined') {
      throw new Error('VDONinjaTransport requires a browser environment');
    }

    if (window.VDONinjaSDK) {
      return window.VDONinjaSDK;
    }

    const localUrl = window.location ? new URL('vdoninja-sdk.min.js', window.location.href).href : '/vdoninja-sdk.min.js';
    const cdnUrl = 'https://sdk.vdo.ninja/vdoninja-sdk.min.js';

    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (window.VDONinjaSDK) {
          resolve(window.VDONinjaSDK);
        } else {
          reject(new Error(`Loaded ${src} but window.VDONinjaSDK not defined`));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load script from ${src}`));
      document.head.appendChild(script);
    });

    try {
      return await loadScript(localUrl);
    } catch (err) {
      console.warn(`Local VDO.Ninja SDK load failed (${err.message}), trying CDN...`);
      return await loadScript(cdnUrl);
    }
  }

  /**
   * Connect to room
   */
  async connect(roomCode) {
    this.room = String(roomCode || '').toLowerCase().trim();
    const cleanRoom = `micup_${this.room}`;
    const streamID = `user_${Math.random().toString(36).substring(2, 8)}`;

    const SDKClass = await this.loadSDK();
    this.sdk = new SDKClass({
      room: cleanRoom,
      password: false
    });

    this.sdk.addEventListener('dataReceived', (e) => {
      const data = e.detail?.data !== undefined ? e.detail.data : e.data;
      this.emit('message', data);
    });

    this.sdk.addEventListener('connected', () => {
      this.connected = true;
      this.emit('connected');
    });

    this.sdk.addEventListener('peerConnected', () => {
      this.connected = true;
      this.emit('connected');
    });

    this.sdk.addEventListener('peerDisconnected', () => {
      this.emit('disconnected');
    });

    this.sdk.addEventListener('disconnected', () => {
      this.connected = false;
      this.emit('disconnected');
    });

    // 1. Connect to signaling
    await this.sdk.connect();

    // 2. Announce data-only stream
    await this.sdk.announce({
      streamID,
      room: cleanRoom
    });

    // 3. Join room mesh
    await this.sdk.joinRoom({
      room: cleanRoom
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
        if (typeof this.sdk.leaveRoom === 'function') this.sdk.leaveRoom();
        if (typeof this.sdk.disconnect === 'function') this.sdk.disconnect();
      } catch (err) {
        console.warn('Error closing VDO.Ninja connection:', err);
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
      try {
        this.sdk.sendData(data);
      } catch (err) {
        console.warn('Error sending data over VDO.Ninja DataChannel:', err);
      }
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
