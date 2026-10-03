import { useState, useEffect, useRef } from 'preact/hooks';
import { Header } from './components/Header.jsx';
import { StageMonitor } from './components/StageMonitor.jsx';
import { TransportBar } from './components/TransportBar.jsx';
import { QueuePanel } from './components/QueuePanel.jsx';
import { LibraryModal } from './components/LibraryModal.jsx';
import { SoundPadsDrawer } from './components/SoundPadsDrawer.jsx';
import { HousePartyModal } from './components/HousePartyModal.jsx';

import {
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  semitones,
  volume,
  queue,
  activeQueueItemId,
  upNextSinger,
  autoApplause,
  isSecondScreenConnected,
  audioOutputTarget
} from './state/player-state.js';

import { isPartyActive, partyRoomCode, partyBroker, partySessionId, broadcastCurrentPartyQueue, startPartyHost } from './state/party-state.js';

import { CDGRenderer } from './engine/cdg/cdg-renderer.js';
import { audioEngine } from './engine/audio/audio-engine.js';
import { mediaLoader } from './engine/media/media-loader.js';
import { libraryStore } from './engine/library/library-store.js';
import { secondScreen } from './engine/display/second-screen.js';
import { soundPads } from './engine/sfx/sound-pads.js';
import { YouTubePlayerController } from './engine/youtube/youtube-player-controller.js';
import { saveShowStateToCookie, loadShowStateFromCookie } from './state/show-persistence.js';
import { isPlayableYouTube, normalizeQueueItem, matchTrackInLibrary } from './engine/model/track-model.js';

export function App() {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isPadsOpen, setIsPadsOpen] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [stageAlert, setStageAlert] = useState(null);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const youtubeIframeRef = useRef(null);
  const youtubeControllerRef = useRef(null);
  const cdgRendererRef = useRef(null);

  // Restore saved folder from IndexedDB on startup
  useEffect(() => {
    libraryStore.restoreSavedDirectory().catch(() => {});
  }, []);

  // Restore show state from cookies on initial load
  useEffect(() => {
    try {
      const saved = loadShowStateFromCookie();
      if (saved) {
        if (Array.isArray(saved.queue)) {
          const cleanedQueue = saved.queue.filter(item => !String(item.id || '').startsWith('demo-'));
          queue.value = cleanedQueue.map(item => normalizeQueueItem(item));
        }
        if (saved.activeQueueItemId) {
          activeQueueItemId.value = saved.activeQueueItemId;
        }
        if (saved.autoApplause !== undefined) {
          autoApplause.value = Boolean(saved.autoApplause);
        }
        if (saved.isPartyActive && saved.partyRoomCode) {
          isPartyActive.value = true;
          partyRoomCode.value = saved.partyRoomCode;
          startPartyHost(saved.partyRoomCode).catch((err) => {
            console.warn('Failed to auto-resume party host on page reload:', err);
          });
        }
      }
    } catch (err) {
      console.warn('Failed to restore show state from cookie:', err);
    }
  }, []);

  // Persist show state to cookies on state changes
  useEffect(() => {
    saveShowStateToCookie({
      queue: queue.value,
      activeQueueItemId: activeQueueItemId.value,
      currentTrack: currentTrack.value,
      autoApplause: autoApplause.value,
      isPartyActive: isPartyActive.value,
      partyRoomCode: partyRoomCode.value
    });
  }, [
    queue.value,
    activeQueueItemId.value,
    currentTrack.value,
    autoApplause.value,
    isPartyActive.value,
    partyRoomCode.value
  ]);

  // Handshake and disconnect listeners for Second Screen window
  useEffect(() => {
    secondScreen.onStageConnected = () => {
      isSecondScreenConnected.value = true;
      setStageAlert(null);
      const current = currentTrack.value;
      secondScreen.sendState({
        trackId: current?.trackId || current?.id || null,
        mediaType: current ? current.type : 'idle',
        videoId: current?.videoId || null,
        title: current?.title || null,
        artist: current?.artist || null,
        singerName: current?.singerName || null,
        videoUrl: current?.videoUrl || null,
        volume: volume.value,
        semitones: semitones.value,
        isPlaying: isPlaying.value,
        stageAudioMuted: audioOutputTarget.value === 'host',
        upNextSinger: upNextSinger.value,
        isPartyActive: isPartyActive.value,
        partyRoomCode: partyRoomCode.value,
        partyBroker: partyBroker.value,
        partySessionId: partySessionId.value
      });

      // Replay complete lyric data if CDG track is active
      if (current?.type === 'cdg' && current?.cdgData) {
        secondScreen.sendCDGData(current.cdgData);
      }

      secondScreen.sendPartyState(isPartyActive.value, partyRoomCode.value, partyBroker.value, partySessionId.value);
    };

    // Alert host immediately if second screen is closed or disconnected
    secondScreen.onStageDisconnected = () => {
      isSecondScreenConnected.value = false;
      setStageAlert({
        type: 'warning',
        message: 'The TV stage screen window was closed. Playback has returned to this screen.',
        timestamp: Date.now()
      });
    };

    secondScreen.onStageTimeUpdate = (payload) => {
      if (!isSecondScreenConnected.value) return;
      const activeId = currentTrack.value?.trackId || currentTrack.value?.id;
      if (activeId && (!payload?.trackId || payload.trackId !== activeId)) {
        return;
      }
      currentTime.value = payload.currentTime;
      if (payload.duration > 0) duration.value = payload.duration;
      if (typeof payload.isPlaying === 'boolean') isPlaying.value = payload.isPlaying;
    };

    secondScreen.onStagePlayState = (payload) => {
      if (!isSecondScreenConnected.value) return;
      const isPlayingVal = typeof payload === 'boolean' ? payload : payload?.isPlaying;
      const trackId = typeof payload === 'object' ? payload?.trackId : null;
      const activeId = currentTrack.value?.trackId || currentTrack.value?.id;
      if (activeId && (!trackId || trackId !== activeId)) {
        return;
      }
      if (typeof isPlayingVal === 'boolean') {
        isPlaying.value = isPlayingVal;
      }
    };

    secondScreen.onStagePlaybackEnded = (payload) => {
      if (!isSecondScreenConnected.value) return;
      const activeId = currentTrack.value?.trackId || currentTrack.value?.id;
      if (!activeId || !payload?.trackId || payload.trackId !== activeId) {
        console.warn('Ignoring stage playback ended for mismatched or missing track:', payload?.trackId, 'active:', activeId);
        return;
      }
      handleNextSong();
    };
  }, []);

  // Sync sound effects routing with second screen audio target
  useEffect(() => {
    soundPads.isMuted = isSecondScreenConnected.value && audioOutputTarget.value === 'stage';
    soundPads.onPlay = (padId) => {
      if (isSecondScreenConnected.value && audioOutputTarget.value === 'stage') {
        secondScreen.sendSfx(padId);
      }
    };
  }, [isSecondScreenConnected.value, audioOutputTarget.value]);

  // Initialize CDG Renderer on canvas mount
  useEffect(() => {
    if (canvasRef.current && !cdgRendererRef.current) {
      cdgRendererRef.current = new CDGRenderer(canvasRef.current);
    }
  }, [canvasRef.current]);

  // Initialize YouTube Player Controller
  useEffect(() => {
    youtubeControllerRef.current = new YouTubePlayerController({
      onStateChange: (state) => {
        if (state === 'playing') {
          isPlaying.value = true;
        } else if (state === 'paused') {
          isPlaying.value = false;
        }
      },
      onTimeUpdate: (cur, dur) => {
        if (currentTrack.value?.type === 'youtube') {
          currentTime.value = cur;
          if (dur > 0) duration.value = dur;
          secondScreen.sendTimeSync(cur, isPlaying.value);
        }
      },
      onEnded: () => {
        if (currentTrack.value?.type === 'youtube') {
          handleNextSong();
        }
      },
      onError: (code, isRestricted) => {
        if (isRestricted) {
          alert('Embedding is restricted by YouTube for this video. Please select another karaoke version.');
        }
      }
    });

    return () => {
      youtubeControllerRef.current?.destroy();
    };
  }, []);

  // Bind YouTube iframe element
  useEffect(() => {
    if (currentTrack.value?.type === 'youtube' && youtubeIframeRef.current) {
      youtubeControllerRef.current?.attachIframe(youtubeIframeRef.current);
    }
  }, [currentTrack.value, youtubeIframeRef.current]);

  // Volume synchronization
  useEffect(() => {
    if (currentTrack.value?.type === 'youtube') {
      youtubeControllerRef.current?.setVolume(volume.value);
    }
  }, [volume.value]);

  /**
   * Play a track (from File or Library item)
   */
  const playTrack = async (trackSource, singerName = '', targetSemitones = 0, queueItemId = null) => {
    try {
      activeQueueItemId.value = queueItemId;

      // Clean up previous track Object URLs
      if (currentTrack.value?.audioUrl) {
        try { URL.revokeObjectURL(currentTrack.value.audioUrl); } catch (e) {}
      }
      if (currentTrack.value?.videoUrl) {
        try { URL.revokeObjectURL(currentTrack.value.videoUrl); } catch (e) {}
      }

      const isYt = isPlayableYouTube(trackSource);

      if (isYt) {
        const ytId = trackSource.videoId || trackSource.youtubeId || trackSource.trackMatch?.videoId;
        if (audioRef.current) {
          audioRef.current.pause();
        }
        if (videoRef.current) {
          videoRef.current.pause();
        }

        const trackId = queueItemId || `yt_${ytId}_${Date.now()}`;
        const loaded = {
          type: 'youtube',
          videoId: ytId,
          title: trackSource.title || 'YouTube Karaoke',
          artist: trackSource.channel || trackSource.artist || 'YouTube',
          singerName: singerName || (upNextSinger.value?.singerName || ''),
          queueItemId,
          trackId
        };
        currentTrack.value = loaded;
        semitones.value = targetSemitones;
        isPlaying.value = true;
        currentTime.value = 0;
        duration.value = 0;

        secondScreen.sendState({
          mediaType: 'youtube',
          videoId: loaded.videoId,
          title: loaded.title,
          artist: loaded.artist,
          singerName: loaded.singerName,
          trackId,
          volume: volume.value,
          semitones: targetSemitones,
          isPlaying: true,
          stageAudioMuted: audioOutputTarget.value === 'host',
          upNextSinger: upNextSinger.value,
          isPartyActive: isPartyActive.value,
          partyRoomCode: partyRoomCode.value
        });
        return;
      }

      let file = trackSource.file;
      if (!file && trackSource.handle) {
        file = await trackSource.handle.getFile();
      }

      if (!file) {
        alert('File handle not found. Please re-select the music folder.');
        return;
      }

      const loaded = await mediaLoader.loadFile(file);
      const trackId = queueItemId || loaded.id || `track_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      loaded.trackId = trackId;
      loaded.singerName = singerName || (upNextSinger.value?.singerName || '');
      loaded.queueItemId = queueItemId;
      loaded.code = trackSource.code || loaded.code || '';
      loaded.filename = trackSource.filename || loaded.filename || file.name;

      currentTrack.value = loaded;
      semitones.value = targetSemitones;

      if (loaded.type === 'cdg') {
        if (!cdgRendererRef.current && canvasRef.current) {
          cdgRendererRef.current = new CDGRenderer(canvasRef.current);
        }
        if (cdgRendererRef.current) {
          cdgRendererRef.current.loadData(loaded.cdgData);
        }

        // Setup audio element
        if (audioRef.current && loaded.audioUrl) {
          audioRef.current.src = loaded.audioUrl;
          await audioRef.current.load();
          await audioEngine.attachMediaElement(audioRef.current);
          audioEngine.setPitch(targetSemitones);
          await audioRef.current.play();
          isPlaying.value = true;
        }

        // Broadcast to Second Screen
        secondScreen.sendState({
          mediaType: 'cdg',
          title: loaded.title,
          artist: loaded.artist,
          singerName: loaded.singerName,
          trackId,
          volume: volume.value,
          semitones: targetSemitones,
          isPlaying: true,
          upNextSinger: upNextSinger.value,
          isPartyActive: isPartyActive.value,
          partyRoomCode: partyRoomCode.value
        });
        secondScreen.sendCDGData(loaded.cdgData);

      } else if (loaded.type === 'video') {
        if (videoRef.current && loaded.videoUrl) {
          videoRef.current.src = loaded.videoUrl;
          await videoRef.current.load();
          await audioEngine.attachMediaElement(videoRef.current);
          audioEngine.setPitch(targetSemitones);
          if (!isSecondScreenConnected.value) {
            await videoRef.current.play();
            isPlaying.value = true;
          }
        }

        secondScreen.sendState({
          mediaType: 'video',
          videoUrl: loaded.videoUrl,
          title: loaded.title,
          artist: loaded.artist,
          singerName: loaded.singerName,
          trackId,
          volume: volume.value,
          semitones: targetSemitones,
          isPlaying: true,
          stageAudioMuted: audioOutputTarget.value === 'host',
          upNextSinger: upNextSinger.value,
          isPartyActive: isPartyActive.value,
          partyRoomCode: partyRoomCode.value
        });

      } else if (loaded.type === 'audio') {
        if (audioRef.current && loaded.audioUrl) {
          audioRef.current.src = loaded.audioUrl;
          await audioRef.current.load();
          await audioEngine.attachMediaElement(audioRef.current);
          audioEngine.setPitch(targetSemitones);
          await audioRef.current.play();
          isPlaying.value = true;
        }

        secondScreen.sendState({
          mediaType: 'audio',
          title: loaded.title,
          artist: loaded.artist,
          singerName: loaded.singerName,
          trackId,
          volume: volume.value,
          semitones: targetSemitones,
          isPlaying: true,
          upNextSinger: upNextSinger.value,
          isPartyActive: isPartyActive.value,
          partyRoomCode: partyRoomCode.value
        });
      }
    } catch (err) {
      console.error('Failed to load track:', err);
      alert(`Error playing file: ${err.message}`);
    }
  };

  /**
   * Start song from Up Next in queue
   */
  const handleStartQueueItem = async (queueItem) => {
    const isYt = isPlayableYouTube(queueItem);

    if (isYt) {
      const ytId = queueItem.videoId || queueItem.youtubeId || queueItem.trackMatch?.videoId;
      await playTrack({
        type: 'youtube',
        videoId: ytId,
        title: queueItem.title,
        artist: queueItem.artist
      }, queueItem.singerName, queueItem.semitones, queueItem.id);
      return;
    }

    // Try to auto-match track from local library (by disc code, filename, or artist+title)
    const matched = queueItem.mediaItem || queueItem.trackMatch || matchTrackInLibrary(queueItem, libraryStore);
    if (matched) {
      await playTrack(matched, queueItem.singerName, queueItem.semitones, queueItem.id);
    } else {
      // If not in library, open library modal to let host choose (local or YouTube)
      setIsLibraryOpen(true);
    }
  };

  /**
   * Play / Pause toggle
   */
  const handlePlayPause = async () => {
    const type = currentTrack.value?.type;
    if (!type) return;

    if (type === 'youtube') {
      if (isSecondScreenConnected.value) {
        const nextPlaying = !isPlaying.value;
        isPlaying.value = nextPlaying;
        if (nextPlaying) {
          secondScreen.sendPlay();
        } else {
          secondScreen.sendPause();
        }
      } else {
        if (isPlaying.value) {
          youtubeControllerRef.current?.pause();
          isPlaying.value = false;
        } else {
          youtubeControllerRef.current?.play();
          isPlaying.value = true;
        }
      }
      secondScreen.sendTimeSync(currentTime.value, isPlaying.value);
      return;
    }

    if (type === 'cdg' || type === 'audio') {
      // Host ALWAYS owns the audio element for CD+G and standalone audio
      await audioEngine.init();
      if (!audioRef.current) return;

      if (isPlaying.value) {
        audioRef.current.pause();
        isPlaying.value = false;
        if (isSecondScreenConnected.value) {
          secondScreen.sendPause();
        }
      } else {
        await audioRef.current.play();
        isPlaying.value = true;
        if (isSecondScreenConnected.value) {
          secondScreen.sendPlay();
        }
      }
      secondScreen.sendTimeSync(audioRef.current.currentTime, isPlaying.value);
      return;
    }

    if (type === 'video') {
      if (isSecondScreenConnected.value) {
        const nextPlaying = !isPlaying.value;
        isPlaying.value = nextPlaying;
        if (nextPlaying) {
          secondScreen.sendPlay();
        } else {
          secondScreen.sendPause();
        }
        if (videoRef.current) {
          if (nextPlaying) videoRef.current.play().catch(() => {});
          else videoRef.current.pause();
        }
      } else {
        await audioEngine.init();
        if (!videoRef.current) return;
        if (isPlaying.value) {
          videoRef.current.pause();
          isPlaying.value = false;
        } else {
          await videoRef.current.play();
          isPlaying.value = true;
        }
      }
      secondScreen.sendTimeSync(currentTime.value, isPlaying.value);
      return;
    }
  };

  /**
   * Seek to timestamp
   */
  const handleSeek = (newTime) => {
    currentTime.value = newTime;
    const type = currentTrack.value?.type;

    if (type === 'youtube') {
      if (isSecondScreenConnected.value) {
        secondScreen.sendSeek(newTime);
      } else {
        youtubeControllerRef.current?.seekTo(newTime);
      }
      secondScreen.sendTimeSync(newTime, isPlaying.value, true);
      return;
    }

    if (type === 'cdg') {
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
      }
      if (cdgRendererRef.current) {
        cdgRendererRef.current.seek(newTime);
      }
      if (isSecondScreenConnected.value) {
        secondScreen.sendSeek(newTime);
      }
      secondScreen.sendTimeSync(newTime, isPlaying.value, true);
      return;
    }

    if (type === 'audio') {
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
      }
      if (isSecondScreenConnected.value) {
        secondScreen.sendSeek(newTime);
      }
      secondScreen.sendTimeSync(newTime, isPlaying.value, true);
      return;
    }

    if (type === 'video') {
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
      if (isSecondScreenConnected.value) {
        secondScreen.sendSeek(newTime);
      }
      secondScreen.sendTimeSync(newTime, isPlaying.value, true);
      return;
    }
  };

  /**
   * Restart song
   */
  const handleRestart = () => {
    handleSeek(0);
  };

  /**
   * Next Song / Finish Performance
   */
  const handleNextSong = () => {
    if (!currentTrack.value && !activeQueueItemId.value) {
      return;
    }

    if (autoApplause.value) {
      soundPads.play('applause');
    }

    // Stop current track
    if (currentTrack.value?.type === 'youtube') {
      youtubeControllerRef.current?.stop();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    isPlaying.value = false;

    // Revoke any created Object URLs for the finished track
    if (currentTrack.value?.audioUrl) {
      try { URL.revokeObjectURL(currentTrack.value.audioUrl); } catch (e) {}
    }
    if (currentTrack.value?.videoUrl) {
      try { URL.revokeObjectURL(currentTrack.value.videoUrl); } catch (e) {}
    }

    // Target the specific active request ID from the queue
    const activeId = activeQueueItemId.value || currentTrack.value?.queueItemId;
    if (activeId) {
      queue.value = queue.value.filter(item => item.id !== activeId);
    }
    activeQueueItemId.value = null;

    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = 0;

    // Reset Second Screen to Idle
    secondScreen.sendState({
      trackId: null,
      mediaType: 'idle',
      title: null,
      artist: null,
      singerName: null,
      isPlaying: false,
      upNextSinger: upNextSinger.value,
      isPartyActive: isPartyActive.value,
      partyRoomCode: partyRoomCode.value
    });
  };

  /**
   * Pitch Shift Change
   */
  const handlePitchChange = (newSemitones) => {
    semitones.value = newSemitones;
    audioEngine.setPitch(newSemitones);
    secondScreen.sendState({ semitones: newSemitones });
    secondScreen.sendPitch(newSemitones);
  };

  /**
   * Volume Change
   */
  const handleVolumeChange = (newVolume) => {
    volume.value = newVolume;
    audioEngine.setVolume(newVolume);
    secondScreen.sendState({ volume: newVolume });
    secondScreen.sendVolume(newVolume);
  };

  // Time update listener
  const handleTimeUpdate = (e) => {
    const time = e.target.currentTime;
    const dur = e.target.duration || 0;
    currentTime.value = time;
    duration.value = dur;

    if (cdgRendererRef.current && currentTrack.value?.type === 'cdg') {
      cdgRendererRef.current.syncToTime(time);
    }

    secondScreen.sendTimeSync(time, isPlaying.value);
  };

  const handleSongEnded = () => {
    handleNextSong();
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleRestart();
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextSong();
      } else if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handlePitchChange(Math.min(12, semitones.value + 1));
      } else if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handlePitchChange(Math.max(-12, semitones.value - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [semitones.value, isPlaying.value, currentTrack.value]);

  // Broadcast party queue and stage updates whenever party or queue changes
  useEffect(() => {
    if (isPartyActive.value) {
      broadcastCurrentPartyQueue();
    }
    secondScreen.sendPartyState(isPartyActive.value, partyRoomCode.value);
    secondScreen.sendState({
      isPartyActive: isPartyActive.value,
      partyRoomCode: partyRoomCode.value,
      upNextSinger: upNextSinger.value
    });
  }, [queue.value, currentTrack.value, isPartyActive.value, partyRoomCode.value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Hidden Audio Element for CD+G tracks */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleSongEnded}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <Header
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenPads={() => setIsPadsOpen(!isPadsOpen)}
        onOpenParty={() => setIsPartyModalOpen(true)}
      />

      {/* Second Screen Disconnect Warning Banner */}
      {stageAlert && (
        <div style={{
          position: 'fixed',
          top: '72px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.96), rgba(185, 28, 28, 0.96))',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#fff',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(239, 68, 68, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          backdropFilter: 'blur(12px)',
          maxWidth: '90vw'
        }}>
          <span style={{ fontSize: '22px' }}>⚠️</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ fontSize: '13px', letterSpacing: '0.02em' }}>Stage Screen Closed!</strong>
            <span style={{ fontSize: '12px', opacity: 0.95 }}>{stageAlert.message}</span>
          </div>
          <button
            onClick={() => {
              secondScreen.openStageWindow();
              setStageAlert(null);
            }}
            style={{
              background: '#fff',
              color: '#b91c1c',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
            }}
          >
            Reopen Stage Screen
          </button>
          <button
            onClick={() => setStageAlert(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '2px 8px',
              opacity: 0.75
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Queue & Rotation */}
        <QueuePanel
          onStartSong={handleStartQueueItem}
          onAddFromLibrary={() => setIsLibraryOpen(true)}
        />

        {/* Right Column: Stage Monitor & Player Area */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '12px',
          minWidth: 0,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255, 42, 95, 0.05) 0%, transparent 60%)'
        }}>
          {/* Live Stage Monitor */}
          <StageMonitor
            canvasRef={canvasRef}
            videoRef={videoRef}
            youtubeRef={youtubeIframeRef}
            onDropFile={(file) => playTrack({ file })}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleSongEnded}
          />

          {/* Transport Bar */}
          <TransportBar
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onRestart={handleRestart}
            onNextSong={handleNextSong}
            onPitchChange={handlePitchChange}
            onVolumeChange={handleVolumeChange}
          />
        </main>
      </div>

      {/* Modals & Drawers */}
      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectTrack={(track) => playTrack(track)}
        onQueueTrack={(track) => {
          queue.value = [
            ...queue.value,
            normalizeQueueItem({
              singerName: 'Host Selection',
              title: track.title,
              artist: track.artist || track.channel || 'Unknown Artist',
              code: track.code || '',
              filename: track.filename || '',
              handle: track.handle || null,
              file: track.file || null,
              videoId: track.videoId || null,
              youtubeId: track.videoId || null,
              trackMatch: track
            })
          ];
        }}
      />

      <SoundPadsDrawer
        isOpen={isPadsOpen}
        onClose={() => setIsPadsOpen(false)}
      />

      <HousePartyModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
      />
    </div>
  );
}
