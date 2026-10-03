import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecondScreenController, STAGE_CHANNEL_NAME } from './second-screen.js';
import { StagePlaybackController } from './stage-playback-controller.js';

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    MockBroadcastChannel.channels.push(this);
  }

  postMessage(data) {
    for (const ch of MockBroadcastChannel.channels) {
      if (ch !== this && ch.name === this.name && typeof ch.onmessage === 'function') {
        ch.onmessage({ data });
      }
    }
  }

  close() {
    const idx = MockBroadcastChannel.channels.indexOf(this);
    if (idx !== -1) {
      MockBroadcastChannel.channels.splice(idx, 1);
    }
  }
}
MockBroadcastChannel.channels = [];

function createMockVideoElement() {
  return {
    src: '',
    paused: true,
    currentTime: 0,
    duration: 180,
    volume: 1.0,
    muted: false,
    playCount: 0,
    pauseCount: 0,
    removeAttributeCalls: [],
    loadCalls: 0,
    play() {
      this.playCount++;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.pauseCount++;
      this.paused = true;
    },
    removeAttribute(attr) {
      this.removeAttributeCalls.push(attr);
      if (attr === 'src') this.src = '';
    },
    load() {
      this.loadCalls++;
    }
  };
}

function createMockYouTubeWindow() {
  const sentCommands = [];
  return {
    sentCommands,
    postMessage(msgStr) {
      try {
        const data = typeof msgStr === 'string' ? JSON.parse(msgStr) : msgStr;
        sentCommands.push(data);
      } catch (e) {
        sentCommands.push(msgStr);
      }
    }
  };
}

function createMockAudioEngine() {
  return {
    pitch: 0,
    volume: 1.0,
    attachedElement: null,
    setPitch(semitones) {
      this.pitch = semitones;
    },
    setVolume(vol) {
      this.volume = vol;
    },
    attachMediaElement(el) {
      this.attachedElement = el;
      return Promise.resolve();
    }
  };
}

describe('Playback Ownership & Stage Playback Controller Integration', () => {
  it('broadcasts local video state with videoUrl and coordinates play/pause/seek with production stage controller', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const mockVideo = createMockVideoElement();
      const mockAudioEngine = createMockAudioEngine();

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        videoRef: mockVideo,
        audioEngineRef: mockAudioEngine
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      // 1. Stage connects
      stageChannel.postMessage({ type: 'STAGE_READY' });
      assert.equal(hostController.isConnected, true);

      // 2. Host starts local video track
      const videoState = {
        mediaType: 'video',
        videoUrl: 'blob:http://localhost:3000/mock-video-uuid',
        trackId: 'track-vid-1',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        singerName: 'Dave',
        semitones: 0,
        isPlaying: true,
        volume: 0.9,
        stageAudioMuted: false
      };
      hostController.sendState(videoState);

      assert.equal(stageController.mediaType, 'video');
      assert.equal(stageController.activeTrackId, 'track-vid-1');
      assert.equal(stageController.videoUrl, 'blob:http://localhost:3000/mock-video-uuid');
      assert.equal(mockVideo.src, 'blob:http://localhost:3000/mock-video-uuid');
      assert.equal(mockVideo.paused, false, 'Stage controller must play video when isPlaying is true');
      assert.equal(mockVideo.volume, 0.9);

      // 3. Host pauses and seeks
      hostController.sendPause();
      assert.equal(stageController.isPlaying, false);
      assert.equal(mockVideo.paused, true, 'Stage video must be paused upon STAGE_PAUSE');

      hostController.sendSeek(45.5);
      assert.equal(stageController.currentTime, 45.5);
      assert.equal(mockVideo.currentTime, 45.5, 'Stage video currentTime must update upon STAGE_SEEK');

      // 4. Stage reports playback progress and completion back to host
      let reportedPayload = null;
      let reportedEnded = false;

      hostController.onStageTimeUpdate = (payload) => {
        reportedPayload = payload;
      };
      hostController.onStagePlaybackEnded = (payload) => {
        if (payload?.trackId === 'track-vid-1') {
          reportedEnded = true;
        }
      };

      stageController.handleVideoTimeUpdate(46.2, 180);
      assert.ok(reportedPayload);
      assert.equal(reportedPayload.currentTime, 46.2);
      assert.equal(reportedPayload.trackId, 'track-vid-1', 'STAGE_TIME_UPDATE must include activeTrackId');

      stageController.handleVideoEnded();
      assert.equal(reportedEnded, true);

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('stops video on transition to CD+G, unloads video element, and prevents resume from restarting hidden video', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const mockVideo = createMockVideoElement();
      const mockAudioEngine = createMockAudioEngine();

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        videoRef: mockVideo,
        audioEngineRef: mockAudioEngine
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      let hostActiveTrack = { trackId: 'track-vid-1', id: 'track-vid-1', title: 'Video Performance' };
      let hostQueue = [
        { trackId: 'track-vid-1', id: 'track-vid-1' },
        { trackId: 'track-cdg-2', id: 'track-cdg-2' }
      ];
      let songsFinished = 0;

      // Host completion listener with strict track identity verification (production logic from app.jsx)
      hostController.onStagePlaybackEnded = (payload) => {
        const activeId = hostActiveTrack?.trackId || hostActiveTrack?.id;
        if (activeId && (!payload?.trackId || payload.trackId !== activeId)) {
          return; // Ignore mismatched or missing trackId
        }
        songsFinished++;
        hostQueue = hostQueue.filter(item => item.id !== activeId);
        hostActiveTrack = hostQueue[0] || null;
      };

      // 1. Stage connects and starts playing video
      stageChannel.postMessage({ type: 'STAGE_READY' });
      hostController.sendState({
        mediaType: 'video',
        videoUrl: 'blob:video-1.mp4',
        trackId: 'track-vid-1',
        isPlaying: true
      });

      assert.equal(stageController.mediaType, 'video');
      assert.equal(stageController.activeTrackId, 'track-vid-1');
      assert.equal(mockVideo.paused, false);
      const initialPlayCount = mockVideo.playCount;

      // 2. Host transitions to CD+G track
      hostActiveTrack = hostQueue[1]; // Switch host to track-cdg-2
      hostController.sendState({
        mediaType: 'cdg',
        trackId: 'track-cdg-2',
        title: 'CD+G Performance',
        isPlaying: true
      });

      // Assert video was torn down
      assert.equal(stageController.mediaType, 'cdg');
      assert.equal(stageController.activeTrackId, 'track-cdg-2');
      assert.equal(mockVideo.paused, true, 'Video must be paused upon transition away to CD+G');
      assert.equal(mockVideo.src, '', 'Video src attribute must be unloaded upon transition away');
      assert.ok(mockVideo.removeAttributeCalls.includes('src'), 'removeAttribute src must be invoked');

      // 3. User pauses and then resumes CD+G track: send STAGE_PAUSE then STAGE_PLAY
      hostController.sendPause();
      assert.equal(stageController.isPlaying, false);

      hostController.sendPlay();
      assert.equal(stageController.isPlaying, true);
      // Because mediaType is 'cdg', STAGE_PLAY must NOT have called video.play()!
      assert.equal(mockVideo.playCount, initialPlayCount, 'STAGE_PLAY must NOT restart hidden video element in CD+G mode');
      assert.equal(mockVideo.paused, true, 'Hidden video must remain paused during CD+G playback');

      // 4. Stale video event on stage: video element triggers ended handler
      const videoEndedResult = stageController.handleVideoEnded();
      assert.equal(videoEndedResult, false, 'handleVideoEnded must return false when mediaType is not video');

      // 5. Host rejection of stale or missing trackId
      // A: Missing trackId
      hostController.channel.onmessage({
        data: { type: 'STAGE_PLAYBACK_ENDED', payload: {} }
      });
      assert.equal(songsFinished, 0, 'Host must reject STAGE_PLAYBACK_ENDED with missing trackId');

      // B: Stale old trackId
      hostController.channel.onmessage({
        data: { type: 'STAGE_PLAYBACK_ENDED', payload: { trackId: 'track-vid-1' } }
      });
      assert.equal(songsFinished, 0, 'Host must reject STAGE_PLAYBACK_ENDED with mismatched trackId');
      assert.equal(hostActiveTrack.trackId, 'track-cdg-2', 'Active CD+G track must remain active');

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('coordinates Stage YouTube progress and completion, blocking stale events when switching away', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const mockYouTube = createMockYouTubeWindow();

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        youtubeRef: mockYouTube
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      let receivedPlayState = null;
      let receivedTimeUpdate = null;
      let receivedEnded = false;

      hostController.onStagePlayState = (payload) => {
        receivedPlayState = payload;
      };
      hostController.onStageTimeUpdate = (payload) => {
        receivedTimeUpdate = payload;
      };
      hostController.onStagePlaybackEnded = (payload) => {
        if (payload?.trackId === 'track-yt-9') {
          receivedEnded = true;
        }
      };

      // 1. Stage connects and starts YouTube track
      stageChannel.postMessage({ type: 'STAGE_READY' });
      hostController.sendState({
        mediaType: 'youtube',
        videoId: 'dQw4w9WgXcQ',
        trackId: 'track-yt-9',
        isPlaying: true,
        volume: 0.8
      });

      assert.equal(stageController.mediaType, 'youtube');
      assert.equal(stageController.activeTrackId, 'track-yt-9');

      // 2. YouTube iframe reports playing state (info: 1)
      const playEventHandled = stageController.handleYouTubeMessage({
        event: 'onStateChange',
        info: 1
      });
      assert.equal(playEventHandled, true);
      assert.ok(receivedPlayState);
      assert.equal(receivedPlayState.trackId, 'track-yt-9');
      assert.equal(receivedPlayState.isPlaying, true);

      // 3. YouTube iframe reports time update
      const timeEventHandled = stageController.handleYouTubeMessage({
        event: 'infoDelivery',
        info: { currentTime: 15.3, duration: 212, playerState: 1 }
      });
      assert.equal(timeEventHandled, true);
      assert.ok(receivedTimeUpdate);
      assert.equal(receivedTimeUpdate.trackId, 'track-yt-9');
      assert.equal(receivedTimeUpdate.currentTime, 15.3);
      assert.equal(receivedTimeUpdate.duration, 212);

      // 4. Host pauses: stageController sends pause command to YouTube iframe
      hostController.sendPause();
      assert.ok(mockYouTube.sentCommands.some(c => c.func === 'pauseVideo'), 'pauseVideo must be sent to YouTube iframe');

      // 5. Host switches to CD+G
      hostController.sendState({
        mediaType: 'cdg',
        trackId: 'track-cdg-next',
        title: 'Next Track'
      });
      assert.equal(stageController.mediaType, 'cdg');

      // 6. Stale YouTube ended event arrives after mediaType changed to CD+G
      receivedEnded = false;
      const staleEndedHandled = stageController.handleYouTubeMessage({
        event: 'onStateChange',
        info: 0 // ended
      });
      assert.equal(staleEndedHandled, false, 'handleYouTubeMessage must reject events when mediaType !== youtube');
      assert.equal(receivedEnded, false, 'Host must not receive ended event from inactive YouTube player');

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('detects YouTube completion via infoDelivery playerState:0 and near-duration fallback, deduplicating ended events', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const mockYouTube = createMockYouTubeWindow();

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        youtubeRef: mockYouTube
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      let endedCalls = 0;
      let lastEndedPayload = null;
      hostController.onStagePlaybackEnded = (payload) => {
        endedCalls++;
        lastEndedPayload = payload;
      };

      // 1. Stage connects and starts YouTube performance
      stageChannel.postMessage({ type: 'STAGE_READY' });
      hostController.sendState({
        mediaType: 'youtube',
        videoId: 'video-test-123',
        trackId: 'track-yt-ended-test',
        isPlaying: true
      });

      // Verification: Stage controller sends listening handshake to iframe
      const listeningMsgs = mockYouTube.sentCommands.filter(m => m.event === 'listening');
      assert.ok(listeningMsgs.length >= 1, 'Stage controller must send listening handshake to YouTube contentWindow');

      // 2. YouTube reports infoDelivery during active playback
      stageController.handleYouTubeMessage({
        event: 'infoDelivery',
        info: { currentTime: 120.0, duration: 200.0, playerState: 1 }
      });
      assert.equal(endedCalls, 0);
      assert.equal(stageController.isPlaying, true);

      // 3. YouTube finishes song and emits infoDelivery with playerState: 0
      const endedHandled = stageController.handleYouTubeMessage({
        event: 'infoDelivery',
        info: { currentTime: 200.0, duration: 200.0, playerState: 0 }
      });
      assert.equal(endedHandled, true);
      assert.equal(endedCalls, 1, 'STAGE_PLAYBACK_ENDED must be received on infoDelivery playerState: 0');
      assert.equal(lastEndedPayload?.trackId, 'track-yt-ended-test');
      assert.equal(stageController.isPlaying, false);

      // 4. Duplicate infoDelivery at end of stream must not fire repeated STAGE_PLAYBACK_ENDED
      stageController.handleYouTubeMessage({
        event: 'infoDelivery',
        info: { currentTime: 200.0, duration: 200.0, playerState: 0 }
      });
      assert.equal(endedCalls, 1, 'Duplicate infoDelivery playerState: 0 must be deduplicated');

      // 5. Test near-duration fallback on next track
      hostController.sendState({
        mediaType: 'youtube',
        videoId: 'video-test-456',
        trackId: 'track-yt-fallback-test',
        isPlaying: true
      });
      assert.equal(stageController.activeTrackId, 'track-yt-fallback-test');

      // Near-duration (currentTime 179.8 of 180.0, playerState 1) triggers completion
      stageController.handleYouTubeMessage({
        event: 'infoDelivery',
        info: { currentTime: 179.8, duration: 180.0, playerState: 1 }
      });
      assert.equal(endedCalls, 2, 'Near-duration fallback must trigger STAGE_PLAYBACK_ENDED');
      assert.equal(lastEndedPayload?.trackId, 'track-yt-fallback-test');

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('supplies trackId and volume in initial connection snapshot and enforces track validation on host', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const stageController = new StagePlaybackController({ channel: stageChannel });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      // Host state variables (simulating app.jsx state)
      const currentTrack = { trackId: 'active-snap-10', id: 'active-snap-10', type: 'video' };
      const currentVolume = 0.72;
      const currentSemitones = -1;

      // Host connection handler mirroring app.jsx:104
      hostController.onStageConnected = () => {
        hostController.sendState({
          trackId: currentTrack.trackId,
          mediaType: currentTrack.type,
          volume: currentVolume,
          semitones: currentSemitones,
          isPlaying: true
        });
      };

      // 1. Stage connects (handshake)
      stageChannel.postMessage({ type: 'STAGE_READY' });

      // Stage controller must receive the connection snapshot with trackId and volume
      assert.equal(stageController.activeTrackId, 'active-snap-10', 'Stage controller must receive trackId from connection snapshot');
      assert.equal(stageController.mediaType, 'video');
      assert.equal(stageController.volume, 0.72, 'Stage controller must receive volume from connection snapshot');
      assert.equal(stageController.semitones, -1);

      // 2. Test host-side validation of play-state, time-update, and ended
      let acceptedPlayState = null;
      let acceptedTime = null;
      let acceptedEnded = false;

      // app.jsx logic for play state
      hostController.onStagePlayState = (payload) => {
        const isPlayingVal = typeof payload === 'boolean' ? payload : payload?.isPlaying;
        const trackId = typeof payload === 'object' ? payload?.trackId : null;
        if (currentTrack.trackId && (!trackId || trackId !== currentTrack.trackId)) {
          return; // Reject mismatched/missing trackId
        }
        acceptedPlayState = isPlayingVal;
      };

      // app.jsx logic for time update
      hostController.onStageTimeUpdate = (payload) => {
        if (currentTrack.trackId && (!payload?.trackId || payload.trackId !== currentTrack.trackId)) {
          return;
        }
        acceptedTime = payload.currentTime;
      };

      // app.jsx logic for playback ended
      hostController.onStagePlaybackEnded = (payload) => {
        if (currentTrack.trackId && (!payload?.trackId || payload.trackId !== currentTrack.trackId)) {
          return;
        }
        acceptedEnded = true;
      };

      // Send message with missing trackId -> REJECTED
      stageChannel.postMessage({
        type: 'STAGE_PLAY_STATE',
        payload: { isPlaying: false }
      });
      assert.equal(acceptedPlayState, null, 'Host must reject play state with missing trackId');

      stageChannel.postMessage({
        type: 'STAGE_TIME_UPDATE',
        payload: { currentTime: 10.5 }
      });
      assert.equal(acceptedTime, null, 'Host must reject time update with missing trackId');

      stageChannel.postMessage({
        type: 'STAGE_PLAYBACK_ENDED',
        payload: {}
      });
      assert.equal(acceptedEnded, false, 'Host must reject playback ended with missing trackId');

      // Send message with mismatched trackId -> REJECTED
      stageChannel.postMessage({
        type: 'STAGE_PLAY_STATE',
        payload: { trackId: 'wrong-track', isPlaying: false }
      });
      assert.equal(acceptedPlayState, null);

      // Send message with valid matching trackId -> ACCEPTED
      stageChannel.postMessage({
        type: 'STAGE_PLAY_STATE',
        payload: { trackId: 'active-snap-10', isPlaying: false }
      });
      assert.equal(acceptedPlayState, false, 'Host must accept play state with matching trackId');

      stageChannel.postMessage({
        type: 'STAGE_TIME_UPDATE',
        payload: { trackId: 'active-snap-10', currentTime: 10.5, duration: 100 }
      });
      assert.equal(acceptedTime, 10.5, 'Host must accept time update with matching trackId');

      stageChannel.postMessage({
        type: 'STAGE_PLAYBACK_ENDED',
        payload: { trackId: 'active-snap-10' }
      });
      assert.equal(acceptedEnded, true, 'Host must accept playback ended with matching trackId');

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('controls pitch and volume on stage through StagePlaybackController and AudioEngine', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);
      const mockVideo = createMockVideoElement();
      const mockAudioEngine = createMockAudioEngine();

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        videoRef: mockVideo,
        audioEngineRef: mockAudioEngine
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      stageChannel.postMessage({ type: 'STAGE_READY' });

      // 1. Host sets pitch shift to +3 semitones via sendPitch
      hostController.sendPitch(3);
      assert.equal(stageController.semitones, 3);
      assert.equal(mockAudioEngine.pitch, 3, 'AudioEngine pitch must be updated to 3');

      // 2. Host changes volume to 0.75 via sendVolume
      hostController.sendVolume(0.75);
      assert.equal(stageController.volume, 0.75);
      assert.equal(mockVideo.volume, 0.75, 'Video element volume must be 0.75');
      assert.equal(mockAudioEngine.volume, 0.75, 'AudioEngine volume must be 0.75');

      // 3. Negative pitch shift (-2 semitones) and volume 0.5 via sendState
      hostController.sendState({ semitones: -2, volume: 0.5 });
      assert.equal(stageController.semitones, -2);
      assert.equal(mockAudioEngine.pitch, -2);
      assert.equal(stageController.volume, 0.5);
      assert.equal(mockVideo.volume, 0.5);
      assert.equal(mockAudioEngine.volume, 0.5);

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('handles first CD+G load with real ref shapes { current: null } without throwing', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);

      // Real Preact ref shape initially { current: null }
      const cdgRendererRef = { current: null };
      const mockCanvas = {
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {}
        })
      };
      const canvasRef = { current: mockCanvas };

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        cdgRendererRef,
        canvasRef
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      // CRITICAL ASSERTION: cdgRenderer getter must distinguish ref { current: null } from initialized instance
      assert.equal(stageController.cdgRenderer, null, 'Getter must return null for uninitialized { current: null } ref');

      // 1. Host starts CD+G track
      hostController.sendState({
        mediaType: 'cdg',
        trackId: 'track-cdg-init',
        title: 'Init Song',
        isPlaying: true
      });

      // 2. Host sends CDG binary subcode packets
      const mockSubcodePackets = new Uint8Array([0x09, 0x01, 0x00, 0x00]);
      hostController.sendCDGData(mockSubcodePackets);

      // Stage controller must initialize CDGRenderer upon first load and populate cdgRendererRef.current
      assert.ok(stageController.cdgRenderer, 'cdgRenderer must be initialized upon first CDG_LOAD');
      assert.equal(stageController.cdgRenderer, cdgRendererRef.current, 'cdgRendererRef.current must hold the renderer instance');
      assert.equal(typeof stageController.cdgRenderer.loadData, 'function');

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });

  it('isolates YouTube event provenance and rejects delayed events from prior YouTube tracks', () => {
    const origBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.channels = [];

    try {
      const hostController = new SecondScreenController();
      const stageChannel = new MockBroadcastChannel(STAGE_CHANNEL_NAME);

      // Track A window and iframe ref
      const winA = createMockYouTubeWindow();
      const winB = createMockYouTubeWindow();
      const youtubeRef = { current: { contentWindow: winA } };

      const stageController = new StagePlaybackController({
        channel: stageChannel,
        youtubeRef
      });
      stageChannel.onmessage = (e) => stageController.handleMessage(e.data);

      const receivedCompletions = [];
      hostController.onStagePlaybackEnded = (payload) => {
        receivedCompletions.push(payload);
      };

      // 1. Stage connects and starts YouTube Track A
      stageChannel.postMessage({ type: 'STAGE_READY' });
      hostController.sendState({
        mediaType: 'youtube',
        videoId: 'vid-A',
        trackId: 'track-yt-A',
        isPlaying: true
      });

      assert.equal(stageController.activeTrackId, 'track-yt-A');
      assert.equal(stageController.activeVideoId, 'vid-A');
      assert.equal(stageController.playbackGeneration, 1);

      // Normal playback on Track A
      const playedA = stageController.handleYouTubeMessage({
        data: '{"event":"onStateChange","info":1}',
        source: winA
      });
      assert.equal(playedA, true);

      // 2. Host transitions to YouTube Track B
      hostController.sendState({
        mediaType: 'youtube',
        videoId: 'vid-B',
        trackId: 'track-yt-B',
        isPlaying: true
      });

      // Stage remounts iframe with winB
      youtubeRef.current = { contentWindow: winB };

      assert.equal(stageController.activeTrackId, 'track-yt-B');
      assert.equal(stageController.activeVideoId, 'vid-B');
      assert.equal(stageController.playbackGeneration, 2);

      // 3. Delayed completion event from old Player A arrives (provenance mismatch: source is winA instead of winB)
      const delayedAHandled = stageController.handleYouTubeMessage({
        data: '{"event":"onStateChange","info":0}',
        source: winA
      });

      // Must be rejected by provenance check!
      assert.equal(delayedAHandled, false, 'Delayed event from old YouTube window must be rejected');
      assert.equal(receivedCompletions.length, 0, 'Delayed Player A completion must not be delivered to host');

      // 4. Also test generation mismatch check directly
      const generationMismatchHandled = stageController.handleYouTubeMessage(
        { data: '{"event":"onStateChange","info":0}', source: winB },
        { generation: 1 } // Stale generation
      );
      assert.equal(generationMismatchHandled, false, 'Message with stale playback generation must be rejected');
      assert.equal(receivedCompletions.length, 0);

      // 5. Legitimate completion from active Player B (provenance matches winB and active generation)
      const legitimateBHandled = stageController.handleYouTubeMessage({
        data: '{"event":"onStateChange","info":0}',
        source: winB
      });
      assert.equal(legitimateBHandled, true, 'Active Player B completion must be accepted');
      assert.equal(receivedCompletions.length, 1);
      assert.equal(receivedCompletions[0].trackId, 'track-yt-B');
      assert.equal(receivedCompletions[0].generation, 2);

      hostController.destroy();
      stageChannel.close();
    } finally {
      globalThis.BroadcastChannel = origBroadcastChannel;
      MockBroadcastChannel.channels = [];
    }
  });
});
