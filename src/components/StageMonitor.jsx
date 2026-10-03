import { useEffect, useRef, useState } from 'preact/hooks';
import { currentTrack, isPlaying, semitones, isSecondScreenConnected, audioOutputTarget } from '../state/player-state.js';
import { CDG_WIDTH, CDG_HEIGHT } from '../engine/cdg/cdg-renderer.js';
import { audioEngine } from '../engine/audio/audio-engine.js';

export function StageMonitor({ canvasRef, videoRef, youtubeRef, onDropFile, onTimeUpdate, onEnded }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [vuLevel, setVuLevel] = useState(0);
  const animFrameRef = useRef(null);

  // Animate VU meters when audio is playing
  useEffect(() => {
    const updateMeter = () => {
      if (isPlaying.value) {
        const level = audioEngine.getAudioLevel();
        setVuLevel(level);
      } else {
        setVuLevel(0);
      }
      animFrameRef.current = requestAnimationFrame(updateMeter);
    };
    animFrameRef.current = requestAnimationFrame(updateMeter);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFile(e.dataTransfer.files[0]);
    }
  };

  const track = currentTrack.value;
  const isCDG = track && track.type === 'cdg';
  const isVideo = track && track.type === 'video';
  const isYouTube = track && track.type === 'youtube';
  const isAudio = track && track.type === 'audio';
  const isIdle = !track;
  const shouldMuteHost = isSecondScreenConnected.value && audioOutputTarget.value === 'stage';

  // Dynamically sync mute state to iframe and video without reloading
  useEffect(() => {
    if (youtubeRef.current?.contentWindow && isYouTube) {
      youtubeRef.current.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: shouldMuteHost ? 'mute' : 'unMute',
        args: []
      }), '*');
    }
    if (videoRef.current && isVideo) {
      videoRef.current.muted = shouldMuteHost;
    }
  }, [shouldMuteHost, isYouTube, isVideo]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        minHeight: '260px',
        background: '#07080c',
        borderRadius: 'var(--radius-lg)',
        border: isDragOver ? '2px dashed var(--neon-coral)' : '1px solid var(--border-subtle)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.8)'
      }}
    >
      {/* Active Playback on TV Second Screen (Main screen plays NOTHING) */}
      {isSecondScreenConnected.value && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          textAlign: 'center',
          width: '100%',
          height: '100%',
          zIndex: 10
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(0, 240, 255, 0.12)',
            border: '1px solid rgba(0, 240, 255, 0.45)',
            borderRadius: '100px',
            padding: '6px 16px',
            marginBottom: '16px'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--neon-cyan)',
              boxShadow: '0 0 10px var(--neon-cyan)'
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--neon-cyan)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              TV Stage Screen Active
            </span>
          </div>

          {track ? (
            <div style={{ maxWidth: '520px' }}>
              <div style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#fff',
                marginBottom: '6px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {track.title}
              </div>
              <div style={{
                fontSize: '15px',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                marginBottom: '14px'
              }}>
                {track.artist}
              </div>
              {track.singerName && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 42, 95, 0.15)',
                  border: '1px solid rgba(255, 42, 95, 0.4)',
                  borderRadius: '8px',
                  padding: '4px 12px',
                  color: 'var(--neon-coral)',
                  fontSize: '13px',
                  fontWeight: 700
                }}>
                  <span>🎤 Performer:</span>
                  <span style={{ color: '#fff' }}>{track.singerName}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Second screen is connected and ready for the show.
            </div>
          )}

          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>🔇 Main screen is silent. Playback is streaming exclusively on the TV.</span>
          </div>
        </div>
      )}

      {/* CD+G Canvas Display (Only when NOT on second screen) */}
      <canvas
        ref={canvasRef}
        width={CDG_WIDTH}
        height={CDG_HEIGHT}
        style={{
          display: isCDG && !isSecondScreenConnected.value ? 'block' : 'none',
          maxWidth: 'calc(100% - 24px)',
          maxHeight: 'calc(100% - 24px)',
          aspectRatio: '300/216',
          borderRadius: 'var(--radius-sm)',
          imageRendering: 'pixelated',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)'
        }}
      />

      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        style={{
          display: isVideo && !isSecondScreenConnected.value ? 'block' : 'none',
          maxWidth: '100%',
          maxHeight: '100%',
          aspectRatio: '16/9'
        }}
      />

      {/* Standalone MP3/Audio Display (Only when NOT on second screen) */}
      {isAudio && !isSecondScreenConnected.value && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          textAlign: 'center',
          width: '100%',
          height: '100%'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255, 42, 95, 0.15)',
            border: '2px solid rgba(255, 42, 95, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            boxShadow: '0 0 20px rgba(255, 42, 95, 0.3)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--neon-coral)" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
            {track.title}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {track.artist}
          </div>
          {track.singerName && (
            <div className="badge badge-coral" style={{ fontSize: '11px', padding: '3px 10px' }}>
              🎤 {track.singerName}
            </div>
          )}
        </div>
      )}

      {/* YouTube Video Embed (Only when NOT on second screen) */}
      {isYouTube && !isSecondScreenConnected.value && (
        <iframe
          ref={youtubeRef}
          src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
          title={track.title}
          allow="autoplay; encrypted-media"
          allowFullScreen
          onLoad={() => {
            try {
              youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
              youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
            } catch (e) {}
          }}
          style={{
            width: 'calc(100% - 32px)',
            maxWidth: '800px',
            aspectRatio: '16/9',
            maxHeight: 'calc(100% - 32px)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)'
          }}
        />
      )}

      {/* Idle / Drag & Drop Dropzone */}
      {isIdle && !isSecondScreenConnected.value && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '32px',
          color: 'var(--text-muted)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: isDragOver ? 'rgba(255, 42, 95, 0.2)' : 'rgba(255, 255, 255, 0.04)',
            border: isDragOver ? '1px solid var(--neon-coral)' : '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            transition: 'all 0.2s'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? 'var(--neon-coral)' : 'var(--text-dim)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
              <path d="M12 12v9"/>
              <path d="m16 16-4-4-4 4"/>
            </svg>
          </div>
          <div className="font-display" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            {isDragOver ? 'Drop Song to Play Immediately' : 'Stage Ready — Drag & Drop Karaoke Files'}
          </div>
          <div style={{ fontSize: '13px', maxWidth: '360px', lineHeight: 1.5 }}>
            Accepts <strong>.zip (MP3+G)</strong>, <strong>.mp4</strong>, or select from your local library folder.
          </div>
        </div>
      )}

      {/* Top Left: Track & Singer Overlay */}
      {track && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          background: 'rgba(9, 10, 15, 0.85)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'none'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isPlaying.value ? 'var(--neon-coral)' : 'var(--neon-amber)'
          }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
              {track.title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {track.artist} {track.singerName ? `• Singer: ${track.singerName}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Top Right: Glowing Real-Time Audio Level VU Meter */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        background: 'rgba(9, 10, 15, 0.85)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none'
      }}>
        <span className="font-mono" style={{ fontSize: '9px', color: 'var(--text-dim)', marginRight: '4px' }}>
          VU
        </span>
        {[0.1, 0.2, 0.35, 0.5, 0.7, 0.85].map((threshold, idx) => {
          const isActive = vuLevel >= threshold;
          const isHigh = idx >= 4;
          return (
            <div
              key={idx}
              style={{
                width: '4px',
                height: `${8 + idx * 2.5}px`,
                borderRadius: '2px',
                backgroundColor: isActive
                  ? (isHigh ? 'var(--neon-coral)' : 'var(--neon-emerald)')
                  : 'rgba(255, 255, 255, 0.1)',
                boxShadow: isActive ? (isHigh ? '0 0 6px var(--neon-coral)' : '0 0 4px var(--neon-emerald)') : 'none',
                transition: 'background-color 0.05s'
              }}
            />
          );
        })}
      </div>

      {/* Bottom Left: Key Transposition Overlay */}
      {semitones.value !== 0 && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          background: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          color: 'var(--neon-amber)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 800,
          backdropFilter: 'blur(8px)'
        }}>
          KEY: {semitones.value > 0 ? `+${semitones.value} ♯` : `${semitones.value} ♭`}
        </div>
      )}
    </div>
  );
}
