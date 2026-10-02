import { useState, useEffect, useRef } from 'preact/hooks';
import { Header } from './components/Header.jsx';
import { StageMonitor } from './components/StageMonitor.jsx';
import { TransportBar } from './components/TransportBar.jsx';
import { QueuePanel } from './components/QueuePanel.jsx';
import { LibraryModal } from './components/LibraryModal.jsx';
import { SoundPadsDrawer } from './components/SoundPadsDrawer.jsx';
import { CloudSyncModal } from './components/CloudSyncModal.jsx';
import { cloudQueueClient } from './engine/sync/cloud-queue-client.js';

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
  showCode
} from './state/player-state.js';

import { CDGRenderer } from './engine/cdg/cdg-renderer.js';
import { audioEngine } from './engine/audio/audio-engine.js';
import { mediaLoader } from './engine/media/media-loader.js';
import { libraryStore } from './engine/library/library-store.js';
import { secondScreen } from './engine/display/second-screen.js';
import { soundPads } from './engine/sfx/sound-pads.js';

export function App() {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isPadsOpen, setIsPadsOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const cdgRendererRef = useRef(null);

  // Restore saved folder from IndexedDB on startup
  useEffect(() => {
    libraryStore.restoreSavedDirectory().catch(() => {});
  }, []);

  // Initialize CDG Renderer on canvas mount
  useEffect(() => {
    if (canvasRef.current && !cdgRendererRef.current) {
      cdgRendererRef.current = new CDGRenderer(canvasRef.current);
    }
  }, [canvasRef.current]);

  /**
   * Play a track (from File or Library item)
   */
  const playTrack = async (trackSource, singerName = '', targetSemitones = 0) => {
    try {
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
          showCode: showCode.value
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
          showCode: showCode.value
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
    // Try to auto-match track from local library
    const matched = libraryStore.matchRequest(queueItem.artist, queueItem.title);
    if (matched) {
      await playTrack(matched, queueItem.singerName, queueItem.semitones);
    } else {
      // If not in library, open library modal to let host choose
      setIsLibraryOpen(true);
    }
  };

  /**
   * Play / Pause toggle
   */
  const handlePlayPause = async () => {
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

    // Notify MicUp.live cloud backend if linked
    const finishedSinger = queue.value.length > 0 ? queue.value[0] : null;
    if (finishedSinger && finishedSinger.id) {
      cloudQueueClient.updateStatus(finishedSinger.id, 'completed');
    }

    // Stop current
    const mediaEl = currentTrack.value?.type === 'video' ? videoRef.current : audioRef.current;
    if (mediaEl) {
      mediaEl.pause();
    }
    isPlaying.value = false;
    currentTrack.value = null;

    // Pop finished singer from queue
    if (queue.value.length > 0) {
      queue.value = queue.value.slice(1);
    }

    // Reset Second Screen to Idle
    secondScreen.sendState({
      mediaType: 'idle',
      upNextSinger: queue.value[0] || null,
      showCode: showCode.value
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
        onOpenCloud={() => setIsCloudModalOpen(true)}
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
          queue.value = [
            ...queue.value,
            {
              id: `q-${Date.now()}`,
              singerName: 'Host Selection',
              title: track.title,
              artist: track.artist,
              semitones: 0,
              trackMatch: track
            }
          ];
        }}
      />

      <SoundPadsDrawer
        isOpen={isPadsOpen}
        onClose={() => setIsPadsOpen(false)}
      />

      <CloudSyncModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
      />
    </div>
  );
}
