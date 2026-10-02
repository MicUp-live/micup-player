/**
 * Second Screen / Audience Stage Display Controller
 * 
 * Synchronizes host playback state, lyrics, video, and singer announcements
 * with a secondary TV or projector window via BroadcastChannel.
 */

export const STAGE_CHANNEL_NAME = 'micup_stage_broadcast';

export class SecondScreenController {
  constructor() {
    this.channel = new BroadcastChannel(STAGE_CHANNEL_NAME);
    this.stageWindow = null;
    this.isConnected = false;

    // Listen for handshake from stage window
    this.channel.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'STAGE_READY') {
        this.isConnected = true;
        this.onStageConnected?.();
      }
    };
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

    const baseUrl = import.meta.env?.BASE_URL || './';
    const stagePath = baseUrl.endsWith('/') ? `${baseUrl}stage.html` : `${baseUrl}/stage.html`;
    const stageUrl = typeof window !== 'undefined' && window.location ? new URL(stagePath, window.location.href).href : '/stage.html';

    this.stageWindow = window.open(stageUrl, 'MicUpStageWindow', windowFeatures);
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
  sendTimeSync(time, isPlaying) {
    this.channel.postMessage({
      type: 'TIME_SYNC',
      payload: { time, isPlaying }
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
}

export const secondScreen = new SecondScreenController();
