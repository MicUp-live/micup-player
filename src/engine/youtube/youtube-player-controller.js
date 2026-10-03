/**
 * YouTube Player Controller & Event Bridge
 * 
 * Provides unified playback control for YouTube iframes using HTML5 postMessage
 * and parses YouTube state changes, time sync, and embed restriction errors.
 */

export function formatYouTubeEmbedUrl(videoId, options = {}) {
  const params = new URLSearchParams();
  params.set('enablejsapi', '1');
  params.set('rel', '0');
  params.set('playsinline', '1');

  if (options.autoplay !== false) {
    params.set('autoplay', '1');
  }
  if (options.controls === false) {
    params.set('controls', '0');
  } else {
    params.set('controls', '1');
  }
  if (options.muted) {
    params.set('mute', '1');
  }
  if (options.origin) {
    params.set('origin', options.origin);
  } else if (typeof window !== 'undefined' && window.location?.origin) {
    params.set('origin', window.location.origin);
  }

  const domain = options.nocookie ? 'www.youtube-nocookie.com' : 'www.youtube.com';
  return `https://${domain}/embed/${videoId}?${params.toString()}`;
}

export function parseYouTubeMessage(rawData) {
  let data = rawData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      return null;
    }
  }

  if (!data || typeof data !== 'object') return null;

  // YouTube player states:
  // -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
  const stateMap = {
    '-1': 'unstarted',
    0: 'ended',
    1: 'playing',
    2: 'paused',
    3: 'buffering',
    5: 'cued'
  };

  if (data.event === 'onStateChange') {
    const rawState = data.info;
    const state = stateMap[rawState] || 'unknown';
    return {
      type: 'stateChange',
      rawState,
      state,
      isEnded: rawState === 0
    };
  }

  if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
    const currentTime = typeof data.info.currentTime === 'number' ? data.info.currentTime : 0;
    const duration = typeof data.info.duration === 'number' ? data.info.duration : 0;
    const playerState = typeof data.info.playerState === 'number' ? data.info.playerState : undefined;
    const state = playerState !== undefined ? (stateMap[playerState] || 'unknown') : undefined;
    const isEnded = playerState === 0 || (duration > 0 && currentTime > 0 && currentTime >= duration - 0.3);

    return {
      type: 'timeUpdate',
      currentTime,
      duration,
      playerState,
      state,
      isEnded
    };
  }

  if (data.event === 'onError') {
    const code = Number(data.info);
    return {
      type: 'error',
      errorCode: code,
      isEmbedRestricted: code === 101 || code === 150
    };
  }

  return null;
}

export class YouTubePlayerController {
  constructor(options = {}) {
    this.iframe = null;
    this.endedTriggered = false;
    this.onStateChange = options.onStateChange || null;
    this.onTimeUpdate = options.onTimeUpdate || null;
    this.onEnded = options.onEnded || null;
    this.onError = options.onError || null;
    this.messageListener = this.handleWindowMessage.bind(this);

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('message', this.messageListener);
    }
  }

  attachIframe(iframeEl) {
    this.iframe = iframeEl;
    this.endedTriggered = false;
    this.sendListening();
    if (iframeEl && typeof iframeEl.addEventListener === 'function') {
      iframeEl.addEventListener('load', () => this.sendListening());
    }
  }

  sendListening() {
    if (this.iframe?.contentWindow && typeof this.iframe.contentWindow.postMessage === 'function') {
      try {
        this.iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
        this.iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch (e) {}
    }
  }

  resetEnded() {
    this.endedTriggered = false;
  }

  handleWindowMessage(event) {
    const parsed = parseYouTubeMessage(event.data);
    if (!parsed) return;

    if (parsed.type === 'stateChange') {
      this.onStateChange?.(parsed.state, parsed.rawState);
      if (parsed.state === 'ended' || parsed.isEnded) {
        if (!this.endedTriggered) {
          this.endedTriggered = true;
          this.onEnded?.();
        }
      } else if (parsed.state === 'playing') {
        this.endedTriggered = false;
      }
    } else if (parsed.type === 'timeUpdate') {
      if (parsed.state) {
        this.onStateChange?.(parsed.state, parsed.playerState);
      }
      this.onTimeUpdate?.(parsed.currentTime, parsed.duration);
      if (parsed.isEnded || parsed.state === 'ended' || parsed.playerState === 0) {
        if (!this.endedTriggered) {
          this.endedTriggered = true;
          this.onEnded?.();
        }
      } else if (parsed.playerState === 1) {
        this.endedTriggered = false;
      }
    } else if (parsed.type === 'error') {
      this.onError?.(parsed.errorCode, parsed.isEmbedRestricted);
    }
  }

  sendCommand(func, args = []) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func,
        args
      }), '*');
    }
  }

  play() {
    this.endedTriggered = false;
    this.sendListening();
    this.sendCommand('playVideo');
  }

  pause() {
    this.sendCommand('pauseVideo');
  }

  seekTo(seconds, allowSeekAhead = true) {
    this.sendCommand('seekTo', [seconds, allowSeekAhead]);
  }

  setVolume(volume0to1) {
    const pct = Math.max(0, Math.min(100, Math.round(volume0to1 * 100)));
    this.sendCommand('setVolume', [pct]);
  }

  setMuted(muted) {
    if (muted) {
      this.sendCommand('mute');
    } else {
      this.sendCommand('unMute');
    }
  }

  stop() {
    this.sendCommand('stopVideo');
  }

  destroy() {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('message', this.messageListener);
    }
    this.iframe = null;
  }
}
