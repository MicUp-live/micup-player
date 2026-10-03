import { parseYouTubeMessage } from '../youtube/youtube-player-controller.js';
import { CDGRenderer } from '../cdg/cdg-renderer.js';
import { AudioEngine } from '../audio/audio-engine.js';

/**
 * StagePlaybackController
 * 
 * Production playback controller for the TV / Second Screen stage monitor.
 * Coordinates media element lifecycles (Video, YouTube, CD+G Canvas, Standalone Audio),
 * enforces strict media-type command routing, inactive media teardown, track identity
 * verification, and real-time audio pitch/volume control.
 */
export class StagePlaybackController {
  constructor({
    channel,
    videoRef = null,
    youtubeRef = null,
    canvasRef = null,
    cdgRendererRef = null,
    audioEngineRef = null,
    onStateChange = null
  } = {}) {
    this.channel = channel;
    this.videoRef = videoRef;
    this.youtubeRef = youtubeRef;
    this.canvasRef = canvasRef;
    this.cdgRendererRef = cdgRendererRef;
    this.audioEngineRef = audioEngineRef;
    this.onStateChange = onStateChange;

    this.activeTrackId = null;
    this.activeVideoId = null;
    this.playbackGeneration = 0;
    this.mediaType = 'idle';
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 1.0;
    this.semitones = 0;
    this.stageAudioMuted = false;
    this.videoUrl = null;
    this.hasEndedForTrack = false;
  }

  get videoElement() {
    return this.videoRef && 'current' in this.videoRef ? this.videoRef.current : (this.videoRef || null);
  }

  get youtubeContentWindow() {
    const target = this.youtubeRef && 'current' in this.youtubeRef ? this.youtubeRef.current : this.youtubeRef;
    if (!target) return null;
    if (target.contentWindow) return target.contentWindow;
    if (typeof target.postMessage === 'function') return target;
    return null;
  }

  get cdgRenderer() {
    return this.cdgRendererRef && 'current' in this.cdgRendererRef ? this.cdgRendererRef.current : (this.cdgRendererRef || null);
  }

  set cdgRenderer(renderer) {
    if (this.cdgRendererRef && 'current' in this.cdgRendererRef) {
      this.cdgRendererRef.current = renderer;
    } else {
      this.cdgRendererRef = renderer;
    }
  }

  get audioEngine() {
    return this.audioEngineRef && 'current' in this.audioEngineRef ? this.audioEngineRef.current : (this.audioEngineRef || null);
  }

  get canvasElement() {
    return this.canvasRef && 'current' in this.canvasRef ? this.canvasRef.current : (this.canvasRef || null);
  }

  /**
   * Handle incoming message from host via BroadcastChannel
   */
  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { type, payload } = msg;

    switch (type) {
      case 'STATE_UPDATE':
        this.handleStateUpdate(payload || {});
        break;
      case 'STAGE_PLAY':
        this.handlePlay();
        break;
      case 'STAGE_PAUSE':
        this.handlePause();
        break;
      case 'STAGE_SEEK':
        this.handleSeek(payload?.time ?? 0);
        break;
      case 'TIME_SYNC':
        this.handleTimeSync(payload || {});
        break;
      case 'STAGE_PITCH':
        this.handlePitch(payload?.semitones ?? 0);
        break;
      case 'STAGE_VOLUME':
        this.handleVolume(payload?.volume ?? 1.0);
        break;
      case 'CDG_LOAD':
        this.handleCDGLoad(payload);
        break;
      default:
        break;
    }
  }

  /**
   * Handle authoritative state update from host
   */
  handleStateUpdate(payload) {
    const trackChanged = payload.trackId !== undefined && payload.trackId !== this.activeTrackId;
    const videoChanged = payload.videoId !== undefined && payload.videoId !== this.activeVideoId;
    const mediaChanged = payload.mediaType !== undefined && payload.mediaType !== this.mediaType;

    if (trackChanged || videoChanged || mediaChanged) {
      this.playbackGeneration++;
      this.hasEndedForTrack = false;
    }

    if (payload.trackId !== undefined) {
      this.activeTrackId = payload.trackId;
    } else if (payload.mediaType === 'idle') {
      this.activeTrackId = null;
    }

    if (payload.videoId !== undefined) {
      this.activeVideoId = payload.videoId;
    } else if (payload.mediaType === 'idle') {
      this.activeVideoId = null;
    }

    if (payload.mediaType) {
      this.mediaType = payload.mediaType;
    }
    if (typeof payload.isPlaying === 'boolean') {
      this.isPlaying = payload.isPlaying;
    }
    if (typeof payload.volume === 'number') {
      this.applyVolume(payload.volume);
    }
    if (typeof payload.semitones === 'number') {
      this.applyPitch(payload.semitones);
    }
    if (typeof payload.stageAudioMuted === 'boolean') {
      this.stageAudioMuted = payload.stageAudioMuted;
      this.applyMute(payload.stageAudioMuted);
    }

    // 1. Inactive media teardown:
    // If switching away from video, pause and unload the video element so it cannot restart or leak audio
    if (payload.mediaType && payload.mediaType !== 'video') {
      if (this.videoElement) {
        this.videoElement.pause?.();
        if (typeof this.videoElement.removeAttribute === 'function') {
          this.videoElement.removeAttribute('src');
          if (typeof this.videoElement.load === 'function') {
            this.videoElement.load();
          }
        } else {
          this.videoElement.src = '';
        }
      }
      this.videoUrl = null;
    }

    // If switching away from YouTube, pause YouTube
    if (payload.mediaType && payload.mediaType !== 'youtube') {
      this.sendYouTubeCommand('pauseVideo');
    }

    // If active media is YouTube, establish listening handshake
    if (payload.mediaType === 'youtube') {
      this.sendYouTubeListening();
    }

    // 2. Active video branch
    if (payload.mediaType === 'video' && payload.videoUrl) {
      this.videoUrl = payload.videoUrl;
      const vid = this.videoElement;
      if (vid) {
        if (vid.src !== payload.videoUrl) {
          vid.src = payload.videoUrl;
          vid.muted = Boolean(this.stageAudioMuted);
          if (this.audioEngine) {
            this.audioEngine.attachMediaElement(vid).catch(() => {});
          }
        }
        vid.volume = Math.max(0, Math.min(1, this.volume));
        if (payload.isPlaying) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      }
    }

    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        ...payload,
        trackId: this.activeTrackId,
        mediaType: this.mediaType,
        isPlaying: this.isPlaying,
        volume: this.volume,
        semitones: this.semitones
      });
    }
  }

  /**
   * Route play command EXCLUSIVELY to active media
   */
  handlePlay() {
    this.isPlaying = true;

    if (this.mediaType === 'video') {
      this.videoElement?.play()?.catch?.(() => {});
    } else if (this.mediaType === 'youtube') {
      this.sendYouTubeListening();
      this.sendYouTubeCommand('playVideo');
    }

    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ isPlaying: true });
    }
  }

  /**
   * Route pause command EXCLUSIVELY to active media
   */
  handlePause() {
    this.isPlaying = false;

    if (this.mediaType === 'video') {
      this.videoElement?.pause?.();
    } else if (this.mediaType === 'youtube') {
      this.sendYouTubeCommand('pauseVideo');
    }

    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ isPlaying: false });
    }
  }

  /**
   * Route seek command EXCLUSIVELY to active media
   */
  handleSeek(time) {
    this.currentTime = time;

    if (this.mediaType === 'video' && this.videoElement) {
      this.videoElement.currentTime = time;
    } else if (this.mediaType === 'youtube') {
      this.sendYouTubeCommand('seekTo', [time, true]);
    } else if (this.mediaType === 'cdg' && this.cdgRenderer) {
      this.cdgRenderer.syncToTime(time);
    }

    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ currentTime: time });
    }
  }

  /**
   * Route time sync EXCLUSIVELY to active media
   */
  handleTimeSync(payload) {
    const time = payload.time ?? 0;
    this.currentTime = time;

    if (this.mediaType === 'cdg' && this.cdgRenderer) {
      this.cdgRenderer.syncToTime(time);
    } else if (this.mediaType === 'video' && this.videoElement) {
      if (Math.abs(this.videoElement.currentTime - time) > 0.3) {
        this.videoElement.currentTime = time;
      }
    } else if (this.mediaType === 'youtube') {
      if (payload.isSeek) {
        this.sendYouTubeCommand('seekTo', [time, true]);
      }
    }
  }

  /**
   * Handle pitch shift change
   */
  handlePitch(semitones) {
    this.applyPitch(semitones);
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ semitones: this.semitones });
    }
  }

  applyPitch(semitones) {
    this.semitones = semitones;
    if (this.audioEngine) {
      this.audioEngine.setPitch(semitones);
    }
  }

  /**
   * Handle volume change
   */
  handleVolume(volume) {
    this.applyVolume(volume);
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ volume: this.volume });
    }
  }

  applyVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.videoElement) {
      this.videoElement.volume = this.volume;
    }
    if (this.audioEngine) {
      this.audioEngine.setVolume(this.volume);
    }
    this.sendYouTubeCommand('setVolume', [Math.round(this.volume * 100)]);
  }

  applyMute(muted) {
    if (this.videoElement) {
      this.videoElement.muted = Boolean(muted);
    }
    this.sendYouTubeCommand(muted ? 'mute' : 'unMute');
  }

  handleCDGLoad(data) {
    if (!this.cdgRenderer) {
      const canvas = this.canvasElement;
      if (canvas && typeof CDGRenderer === 'function') {
        try {
          this.cdgRenderer = new CDGRenderer(canvas);
        } catch (e) {}
      }
    }
    if (this.cdgRenderer && typeof this.cdgRenderer.loadData === 'function' && data) {
      this.cdgRenderer.loadData(data);
    }
  }

  sendYouTubeCommand(func, args = []) {
    const win = this.youtubeContentWindow;
    if (win && typeof win.postMessage === 'function') {
      win.postMessage(JSON.stringify({
        event: 'command',
        func,
        args
      }), '*');
    }
  }

  sendYouTubeListening() {
    const win = this.youtubeContentWindow;
    if (win && typeof win.postMessage === 'function') {
      try {
        win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
        win.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch (e) {}
    }
  }

  /**
   * Video element event handlers
   */
  handleVideoEnded() {
    if (this.mediaType !== 'video') {
      return false;
    }
    this.channel.postMessage({
      type: 'STAGE_PLAYBACK_ENDED',
      payload: { trackId: this.activeTrackId }
    });
    return true;
  }

  handleVideoTimeUpdate(currentTime, duration) {
    if (this.mediaType !== 'video') {
      return false;
    }
    this.currentTime = currentTime;
    this.duration = duration;

    this.channel.postMessage({
      type: 'STAGE_TIME_UPDATE',
      payload: {
        trackId: this.activeTrackId,
        currentTime,
        duration,
        isPlaying: !this.videoElement?.paused
      }
    });

    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        currentTime,
        duration,
        isPlaying: !this.videoElement?.paused
      });
    }
    return true;
  }

  handleVideoPlayState(isPlaying) {
    if (this.mediaType !== 'video') {
      return false;
    }
    this.isPlaying = isPlaying;
    this.channel.postMessage({
      type: 'STAGE_PLAY_STATE',
      payload: { trackId: this.activeTrackId, isPlaying }
    });
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({ isPlaying });
    }
    return true;
  }

  /**
   * YouTube iframe message handler
   */
  handleYouTubeMessage(rawOrEvent, options = {}) {
    const isEventObj = rawOrEvent && typeof rawOrEvent === 'object';
    const event = isEventObj ? rawOrEvent : { data: rawOrEvent };
    const rawData = event.data !== undefined ? event.data : rawOrEvent;

    // 1. Provenance check: Originating window must match current YouTube window if provided
    const source = event.source || options.source || null;
    const expectedWindow = this.youtubeContentWindow;
    if (source && expectedWindow && source !== expectedWindow) {
      return false; // Stale or mismatched iframe window
    }

    // 2. Playback generation check
    const eventGen = event.generation ?? options.generation ?? null;
    if (eventGen !== null && eventGen !== undefined && eventGen !== this.playbackGeneration) {
      return false; // Message belongs to an older playback generation
    }

    const parsed = typeof rawData === 'string'
      ? parseYouTubeMessage(rawData)
      : (rawData?.info !== undefined || rawData?.event !== undefined ? parseYouTubeMessage(rawData) : rawData);

    if (!parsed) return false;

    // Only process YouTube messages when YouTube is the active media!
    if (this.mediaType !== 'youtube') {
      return false;
    }

    const currentTrackId = this.activeTrackId;
    const currentGen = this.playbackGeneration;

    if (parsed.type === 'stateChange') {
      if (parsed.state === 'playing') {
        this.isPlaying = true;
        this.hasEndedForTrack = false;
        this.channel.postMessage({
          type: 'STAGE_PLAY_STATE',
          payload: { trackId: currentTrackId, isPlaying: true, generation: currentGen }
        });
        if (typeof this.onStateChange === 'function') {
          this.onStateChange({ isPlaying: true });
        }
      } else if (parsed.state === 'paused') {
        this.isPlaying = false;
        this.channel.postMessage({
          type: 'STAGE_PLAY_STATE',
          payload: { trackId: currentTrackId, isPlaying: false, generation: currentGen }
        });
        if (typeof this.onStateChange === 'function') {
          this.onStateChange({ isPlaying: false });
        }
      } else if (parsed.state === 'ended' || parsed.isEnded) {
        this.isPlaying = false;
        if (!this.hasEndedForTrack) {
          this.hasEndedForTrack = true;
          this.channel.postMessage({
            type: 'STAGE_PLAY_STATE',
            payload: { trackId: currentTrackId, isPlaying: false, generation: currentGen }
          });
          this.channel.postMessage({
            type: 'STAGE_PLAYBACK_ENDED',
            payload: { trackId: currentTrackId, generation: currentGen }
          });
          if (typeof this.onStateChange === 'function') {
            this.onStateChange({ isPlaying: false });
          }
        }
      }
      return true;
    }

    if (parsed.type === 'timeUpdate') {
      this.currentTime = parsed.currentTime;
      if (parsed.duration > 0) this.duration = parsed.duration;

      const isPlaying = parsed.playerState === 1 || (parsed.playerState === undefined && !parsed.isEnded && this.isPlaying);
      if (parsed.playerState === 1) {
        this.isPlaying = true;
        this.hasEndedForTrack = false;
      } else if (parsed.playerState === 2) {
        this.isPlaying = false;
      }

      this.channel.postMessage({
        type: 'STAGE_TIME_UPDATE',
        payload: {
          trackId: currentTrackId,
          currentTime: parsed.currentTime,
          duration: parsed.duration,
          isPlaying,
          generation: currentGen
        }
      });

      if (typeof this.onStateChange === 'function') {
        this.onStateChange({
          currentTime: parsed.currentTime,
          duration: parsed.duration || this.duration,
          isPlaying
        });
      }

      // Detect song end via playerState: 0, parsed.isEnded, state: 'ended', or duration reached
      const isEnded = parsed.isEnded || parsed.playerState === 0 || parsed.state === 'ended' ||
        (parsed.duration > 0 && parsed.currentTime > 0 && parsed.currentTime >= parsed.duration - 0.3);

      if (isEnded) {
        this.isPlaying = false;
        if (!this.hasEndedForTrack) {
          this.hasEndedForTrack = true;
          this.channel.postMessage({
            type: 'STAGE_PLAY_STATE',
            payload: { trackId: currentTrackId, isPlaying: false, generation: currentGen }
          });
          this.channel.postMessage({
            type: 'STAGE_PLAYBACK_ENDED',
            payload: { trackId: currentTrackId, generation: currentGen }
          });
          if (typeof this.onStateChange === 'function') {
            this.onStateChange({ isPlaying: false });
          }
        }
      }

      return true;
    }

    return false;
  }
}
