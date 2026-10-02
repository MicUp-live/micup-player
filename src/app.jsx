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
  upNextSinger,
  autoApplause,
  isSecondScreenConnected
} from './state/player-state.js';

import { isPartyActive, partyRoomCode, broadcastCurrentPartyQueue, startPartyHost } from './state/party-state.js';

import { CDGRenderer } from './engine/cdg/cdg-renderer.js';
import { audioEngine } from './engine/audio/audio-engine.js';
import { mediaLoader } from './engine/media/media-loader.js';
import { libraryStore } from './engine/library/library-store.js';
import { secondScreen } from './engine/display/second-screen.js';
import { soundPads } from './engine/sfx/sound-pads.js';
import { YouTubePlayerController } from './engine/youtube/youtube-player-controller.js';
import { saveShowStateToCookie, loadShowStateFromCookie } from './state/show-persistence.js';

export function App() {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isPadsOpen, setIsPadsOpen] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

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
          queue.value = cleanedQueue;
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
      autoApplause: autoApplause.value,
      isPartyActive: isPartyActive.value,
      partyRoomCode: partyRoomCode.value
    });
  }, [
    queue.value,
    autoApplause.value,
    isPartyActive.value,
    partyRoomCode.value
  ]);

  // Handshake listener for Second Screen window
  useEffect(() => {
    secondScreen.onStageConnected = () => {
      isSecondScreenConnected.value = true;
      const current = currentTrack.value;
      secondScreen.sendState({
        mediaType: current ? current.type : 'idle',
        videoId: current?.videoId || null,
        title: current?.title || null,
        artist: current?.artist || null,
        singerName: current?.singerName || null,
        semitones: semitones.value,
        isPlaying: isPlaying.value,
        upNextSinger: current ? (queue.value[1] || null) : (queue.value[0] || null),
        isPartyActive: isPartyActive.value,
        partyRoomCode: partyRoomCode.value
      });
      secondScreen.sendPartyState(isPartyActive.value, partyRoomCode.value);
    };
  }, []);

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
  const playTrack = async (trackSource, singerName = '', targetSemitones = 0) => {
    try {
      const isYt = trackSource.type === 'youtube' ||
        Boolean(trackSource.videoId) ||
        Boolean(trackSource.youtubeId) ||
        Boolean(trackSource.trackMatch?.videoId) ||
        trackSource.trackMatch?.type === 'youtube';

      if (isYt) {
        const ytId = trackSource.videoId || trackSource.youtubeId || trackSource.trackMatch?.videoId;
        if (audioRef.current) {
          audioRef.current.pause();
        }
        if (videoRef.current) {
          videoRef.current.pause();
        }

        const loaded = {
          type: 'youtube',
          videoId: ytId,
          title: trackSource.title || 'YouTube Karaoke',
          artist: trackSource.channel || trackSource.artist || 'YouTube',
          singerName: singerName || (upNextSinger.value?.singerName || '')
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
          semitones: targetSemitones,
          isPlaying: true,
          upNextSinger: queue.value[1] || null,
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
      loaded.singerName = singerName || (upNextSinger.value?.singerName || '');

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
          semitones: targetSemitones,
          isPlaying: true,
          upNextSinger: queue.value[1] || null,
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
          await videoRef.current.play();
          isPlaying.value = true;
        }

        secondScreen.sendState({
          mediaType: 'video',
          title: loaded.title,
          artist: loaded.artist,
          singerName: loaded.singerName,
          semitones: targetSemitones,
          isPlaying: true,
          upNextSinger: queue.value[1] || null,
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
    const isYt = queueItem.type === 'youtube' ||
      Boolean(queueItem.videoId) ||
      Boolean(queueItem.youtubeId) ||
      queueItem.source === 'youtube' ||
      Boolean(queueItem.trackMatch?.videoId) ||
      queueItem.trackMatch?.type === 'youtube';

    if (isYt) {
      const ytId = queueItem.videoId || queueItem.youtubeId || queueItem.trackMatch?.videoId;
      await playTrack({
        type: 'youtube',
        videoId: ytId,
        title: queueItem.title,
        artist: queueItem.artist
      }, queueItem.singerName, queueItem.semitones);
      return;
    }

    // Try to auto-match track from local library
    const matched = queueItem.mediaItem || queueItem.trackMatch || libraryStore.matchRequest(queueItem.artist, queueItem.title);
    if (matched) {
      await playTrack(matched, queueItem.singerName, queueItem.semitones);
    } else {
      // If not in library, open library modal to let host choose (local or YouTube)
      setIsLibraryOpen(true);
    }
  };

  /**
   * Play / Pause toggle
   */
  const handlePlayPause = async () => {
    if (currentTrack.value?.type === 'youtube') {
      if (isPlaying.value) {
        youtubeControllerRef.current?.pause();
        isPlaying.value = false;
      } else {
        youtubeControllerRef.current?.play();
        isPlaying.value = true;
      }
      secondScreen.sendTimeSync(currentTime.value, isPlaying.value);
      return;
    }

    await audioEngine.init();
    const mediaEl = currentTrack.value?.type === 'video' ? videoRef.current : audioRef.current;
    if (!mediaEl || !currentTrack.value) return;

    if (isPlaying.value) {
      mediaEl.pause();
      isPlaying.value = false;
    } else {
      await mediaEl.play();
      isPlaying.value = true;
    }

    secondScreen.sendTimeSync(mediaEl.currentTime, isPlaying.value);
  };

  /**
   * Seek to timestamp
   */
  const handleSeek = (newTime) => {
    if (currentTrack.value?.type === 'youtube') {
      youtubeControllerRef.current?.seekTo(newTime);
      currentTime.value = newTime;
      secondScreen.sendTimeSync(newTime, isPlaying.value);
      return;
    }

    const mediaEl = currentTrack.value?.type === 'video' ? videoRef.current : audioRef.current;
    if (!mediaEl) return;

    mediaEl.currentTime = newTime;
    currentTime.value = newTime;

    if (cdgRendererRef.current && currentTrack.value?.type === 'cdg') {
      cdgRendererRef.current.seek(newTime);
    }

    secondScreen.sendTimeSync(newTime, isPlaying.value);
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
    if (autoApplause.value) {
      soundPads.play('applause');
    }

    // Stop current track
    if (currentTrack.value?.type === 'youtube') {
      youtubeControllerRef.current?.stop();
    }
    const mediaEl = currentTrack.value?.type === 'video' ? videoRef.current : audioRef.current;
    if (mediaEl) {
      mediaEl.pause();
    }
    isPlaying.value = false;
    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = 0;

    // Pop finished singer from queue
    if (queue.value.length > 0) {
      queue.value = queue.value.slice(1);
    }

    // Reset Second Screen to Idle
    secondScreen.sendState({
      mediaType: 'idle',
      title: null,
      artist: null,
      singerName: null,
      isPlaying: false,
      upNextSinger: queue.value[0] || null,
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
  };

  /**
   * Volume Change
   */
  const handleVolumeChange = (newVolume) => {
    volume.value = newVolume;
    audioEngine.setVolume(newVolume);
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
      upNextSinger: currentTrack.value ? (queue.value[1] || null) : (queue.value[0] || null)
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
          const isYt = track.type === 'youtube' || Boolean(track.videoId);
          queue.value = [
            ...queue.value,
            {
              id: `q-${Date.now()}`,
              singerName: 'Host Selection',
              title: track.title,
              artist: track.artist || track.channel || 'Unknown Artist',
              semitones: 0,
              type: isYt ? 'youtube' : 'local',
              videoId: track.videoId || null,
              youtubeId: track.videoId || null,
              source: isYt ? 'youtube' : 'local',
              trackMatch: track
            }
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
