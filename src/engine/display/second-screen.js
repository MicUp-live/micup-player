/**
 * Second Screen / Audience Stage Display Controller
 * 
 * Synchronizes host playback state, lyrics, video, and singer announcements
 * with a secondary TV or projector window via BroadcastChannel.
 */

export const STAGE_CHANNEL_NAME = 'micup_stage_broadcast';

export class SecondScreenController {
  constructor({ channel = null } = {}) {
    this.channel = channel || new BroadcastChannel(STAGE_CHANNEL_NAME);
    if (this.channel && typeof this.channel.unref === 'function') {
      this.channel.unref();
    }
    this.stageWindow = null;
    this.isConnected = false;
    this.monitorInterval = null;
    this.lastHeartbeat = 0;

    this.onStageConnected = null;
    this.onStageDisconnected = null;
    this.onStageTimeUpdate = null;
    this.onStagePlayState = null;
    this.onStagePlaybackEnded = null;

    // Listen for handshake, heartbeats, and events from stage window
    this.channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'STAGE_READY') {
        this.isConnected = true;
        this.lastHeartbeat = Date.now();
        this.startMonitoring();
        this.onStageConnected?.();
      } else if (msg.type === 'STAGE_CLOSED') {
        // If window reference exists and is still open, ignore spurious close event
        if (this.stageWindow && !this.stageWindow.closed) {
          return;
        }
        this.handleDisconnect('Stage window was closed');
      } else if (msg.type === 'STAGE_HEARTBEAT') {
        this.lastHeartbeat = Date.now();
      } else if (msg.type === 'STAGE_TIME_UPDATE') {
        this.lastHeartbeat = Date.now();
        this.onStageTimeUpdate?.(msg.payload);
      } else if (msg.type === 'STAGE_PLAY_STATE') {
        this.lastHeartbeat = Date.now();
        this.onStagePlayState?.(msg.payload);
      } else if (msg.type === 'STAGE_PLAYBACK_ENDED') {
        this.lastHeartbeat = Date.now();
        this.onStagePlaybackEnded?.(msg.payload);
      }
    };
  }

  /**
   * Monitor window state and heartbeat to alert host immediately upon close
   */
  startMonitoring() {
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    this.lastHeartbeat = Date.now();
    this.monitorInterval = setInterval(() => {
      // 1. Direct window reference check: 100% accurate, immune to background throttling
      if (this.stageWindow) {
        if (this.stageWindow.closed) {
          this.handleDisconnect('Stage window was closed');
        }
        return;
      }

      // 2. Generous heartbeat fallback for manually navigated windows (45s to avoid background throttling false positives)
      if (this.isConnected && this.lastHeartbeat > 0 && Date.now() - this.lastHeartbeat > 45000) {
        this.handleDisconnect('Stage window timed out');
      }
    }, 400);
    if (this.monitorInterval && typeof this.monitorInterval.unref === 'function') {
      this.monitorInterval.unref();
    }
  }

  handleDisconnect(reason = 'Disconnected') {
    if (!this.isConnected) return;
    this.isConnected = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.stageWindow?.closed) {
      this.stageWindow = null;
    }
    this.onStageDisconnected?.(reason);
  }

  destroy() {
    this.isConnected = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.channel) {
      try {
        this.channel.close();
      } catch (e) {}
    }
    this.stageWindow = null;
  }

  /**
   * Open the pristine Second Screen window (for TV / Projector)
   */
  async openStageWindow() {
    // Check if window already open
    if (this.stageWindow && !this.stageWindow.closed) {
      this.stageWindow.focus();
      return;
    }

    // Try Window Management API if available to find secondary screen
    let windowFeatures = 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no';

    if ('getScreenDetails' in window) {
      try {
        const screenDetails = await window.getScreenDetails();
        const secondScreen = screenDetails.screens.find(s => s !== screenDetails.currentScreen);
        if (secondScreen) {
          windowFeatures = `left=${secondScreen.availLeft},top=${secondScreen.availTop},width=${secondScreen.availWidth},height=${secondScreen.availHeight},fullscreen=yes`;
        }
      } catch (err) {
        // Fallback to standard popup
      }
    }

    const stageUrl = typeof window !== 'undefined' && window.location
      ? new URL('stage.html', window.location.href).href
      : '/stage.html';

    this.stageWindow = window.open(stageUrl, 'MicUpStageWindow', windowFeatures);
    this.startMonitoring();
  }

  /**
   * Send Play command to Second Screen
   */
  sendPlay() {
    this.channel.postMessage({ type: 'STAGE_PLAY' });
  }

  /**
   * Send Pause command to Second Screen
   */
  sendPause() {
    this.channel.postMessage({ type: 'STAGE_PAUSE' });
  }

  /**
   * Send Seek command to Second Screen
   */
  sendSeek(time) {
    this.channel.postMessage({ type: 'STAGE_SEEK', payload: { time } });
  }

  /**
   * Send Pitch Shift command to Second Screen
   */
  sendPitch(semitones) {
    this.channel.postMessage({
      type: 'STAGE_PITCH',
      payload: { semitones }
    });
  }

  /**
   * Send Volume command to Second Screen
   */
  sendVolume(volume) {
    this.channel.postMessage({
      type: 'STAGE_VOLUME',
      payload: { volume }
    });
  }

  /**
   * Broadcast state changes to stage screen
   */
  sendState(state) {
    this.channel.postMessage({
      type: 'STATE_UPDATE',
      payload: state
    });
  }

  /**
   * Broadcast CD+G data to stage window so it renders crisp lyrics on the TV
   */
  sendCDGData(buffer) {
    this.channel.postMessage({
      type: 'CDG_LOAD',
      payload: buffer
    });
  }

  /**
   * Broadcast time sync
   */
  sendTimeSync(time, isPlaying, isSeek = false) {
    this.channel.postMessage({
      type: 'TIME_SYNC',
      payload: { time, isPlaying, isSeek }
    });
  }

  /**
   * Broadcast alert announcement (e.g. "Up Next on Stage: Sarah!")
   */
  sendAnnouncement(text, durationMs = 5000) {
    this.channel.postMessage({
      type: 'ANNOUNCEMENT',
      payload: { text, durationMs }
    });
  }

  /**
   * Broadcast party room state to stage window
   */
  sendPartyState(isPartyActive, partyRoomCode, partyBroker = 'hivemq', partySessionId = '') {
    this.channel.postMessage({
      type: 'PARTY_STATE',
      payload: { isPartyActive, partyRoomCode, partyBroker, partySessionId }
    });
  }

  /**
   * Broadcast SFX trigger to stage screen so audio plays through TV / stage speakers
   */
  sendSfx(padId) {
    this.channel.postMessage({
      type: 'STAGE_SFX',
      payload: { padId }
    });
  }
}

export const secondScreen = new SecondScreenController();
