import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { CDGRenderer, CDG_WIDTH, CDG_HEIGHT } from './engine/cdg/cdg-renderer.js';
import { STAGE_CHANNEL_NAME } from './engine/display/second-screen.js';
import { QRCodeView } from './components/QRCodeView.jsx';

function StageApp() {
  const [state, setState] = useState({
    mediaType: 'idle', // 'idle' | 'cdg' | 'video' | 'youtube'
    title: '',
    artist: '',
    singerName: '',
    semitones: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    upNextSinger: null,
    isPartyActive: false,
    partyRoomCode: ''
  });

  const [announcement, setAnnouncement] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const youtubeRef = useRef(null);
  const cdgRendererRef = useRef(null);

  // Monitor fullscreen change
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const channel = new BroadcastChannel(STAGE_CHANNEL_NAME);

    // Announce readiness to host
    channel.postMessage({ type: 'STAGE_READY' });

    channel.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'STATE_UPDATE') {
        setState(prev => ({ ...prev, ...payload }));
        if (payload.mediaType === 'video' && payload.videoUrl && videoRef.current) {
          if (videoRef.current.src !== payload.videoUrl) {
            videoRef.current.src = payload.videoUrl;
            videoRef.current.muted = true;
          }
          if (payload.isPlaying) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        }
      } else if (type === 'CDG_LOAD') {
        if (!cdgRendererRef.current && canvasRef.current) {
          cdgRendererRef.current = new CDGRenderer(canvasRef.current);
        }
        if (cdgRendererRef.current) {
          cdgRendererRef.current.loadData(payload);
        }
      } else if (type === 'TIME_SYNC') {
        if (cdgRendererRef.current) {
          cdgRendererRef.current.syncToTime(payload.time);
        }
        if (videoRef.current && Math.abs(videoRef.current.currentTime - payload.time) > 0.3) {
          videoRef.current.currentTime = payload.time;
        }
        if (youtubeRef.current?.contentWindow) {
          if (payload.isPlaying) {
            youtubeRef.current.contentWindow.postMessage(JSON.stringify({
              event: 'command',
              func: 'playVideo',
              args: []
            }), '*');
          } else {
            youtubeRef.current.contentWindow.postMessage(JSON.stringify({
              event: 'command',
              func: 'pauseVideo',
              args: []
            }), '*');
          }
        }
      } else if (type === 'ANNOUNCEMENT') {
        setAnnouncement(payload.text);
        setTimeout(() => setAnnouncement(null), payload.durationMs || 5000);
      } else if (type === 'PARTY_STATE') {
        setState(prev => ({
          ...prev,
          isPartyActive: Boolean(payload.isPartyActive),
          partyRoomCode: payload.partyRoomCode || '',
          partyBroker: payload.partyBroker || 'hivemq',
          partySessionId: payload.partySessionId || ''
        }));
      }
    };

    return () => channel.close();
  }, []);

  const isPartyActive = Boolean(state.isPartyActive && state.partyRoomCode);
  const joinUrl = isPartyActive && typeof window !== 'undefined' && window.location
    ? new URL(`party.html?room=${encodeURIComponent(state.partyRoomCode)}&broker=${encodeURIComponent(state.partyBroker || 'hivemq')}&session=${encodeURIComponent(state.partySessionId || '')}`, window.location.href).href
    : '';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at 50% 120%, rgba(255, 42, 95, 0.15) 0%, rgba(9, 10, 15, 1) 75%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      color: '#fff'
    }}>
      {/* Semi-transparent Fullscreen Quick Button (Upper Right Hand Corner) */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          background: 'rgba(18, 21, 30, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          opacity: 0.28,
          transition: 'all 0.25s ease',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.95';
          e.currentTarget.style.background = 'rgba(18, 21, 30, 0.88)';
          e.currentTarget.style.borderColor = 'rgba(255, 42, 95, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.28';
          e.currentTarget.style.background = 'rgba(18, 21, 30, 0.45)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {isFullscreen ? (
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          ) : (
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          )}
        </svg>
        <span>{isFullscreen ? 'Exit Full' : 'Full Page'}</span>
      </button>

      {/* Background Stage Glow Lighting */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '20%',
        width: '60vw',
        height: '40vh',
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* ANNOUNCEMENT TOAST */}
      {announcement && (
        <div style={{
          position: 'absolute',
          top: '40px',
          zIndex: 100,
          background: 'linear-gradient(135deg, #ff2a5f, #f59e0b)',
          color: '#fff',
          padding: '18px 36px',
          borderRadius: '100px',
          fontSize: '28px',
          fontWeight: 800,
          boxShadow: '0 12px 40px rgba(255, 42, 95, 0.6)',
          animation: 'pulse 1.5s infinite alternate'
        }}>
          {announcement}
        </div>
      )}

      {/* IDLE / WAITING SCREEN */}
      {state.mediaType === 'idle' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '900px',
          padding: '40px'
        }}>
          {/* Animated Glowing Mic Icon */}
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255, 42, 95, 0.2), rgba(245, 158, 11, 0.2))',
            border: '2px solid rgba(255, 42, 95, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            boxShadow: '0 0 50px rgba(255, 42, 95, 0.4)'
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff2a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>

          <h1 style={{
            fontSize: '56px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            margin: '0 0 12px 0',
            background: 'linear-gradient(135deg, #ffffff 40%, #ff2a5f 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            THE STAGE IS CALLING
          </h1>

          <p style={{
            fontSize: '22px',
            color: '#a0aec0',
            margin: '0 0 36px 0',
            fontWeight: 500
          }}>
            {isPartyActive ? 'The mic is hot. Scan to browse songs & join the queue!' : 'The mic is hot. Ready for the next singer on stage.'}
          </p>

          {/* Show Code & Instructions Card (ONLY IF PARTY IS ACTIVE) */}
          {isPartyActive && (
            <div style={{
              background: 'rgba(18, 21, 30, 0.92)',
              border: '2px solid rgba(255, 42, 95, 0.6)',
              borderRadius: '24px',
              padding: '24px 40px',
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 42, 95, 0.25)',
              backdropFilter: 'blur(20px)'
            }}>
              <div style={{ background: '#fff', padding: '8px', borderRadius: '12px', display: 'flex' }}>
                <QRCodeView
                  text={joinUrl}
                  size={150}
                  color="#090a0f"
                  bgColor="#ffffff"
                />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(255, 42, 95, 0.2)',
                  color: '#ff2a5f',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  🎉 MOBILE SINGER QUEUE
                </div>
                <div style={{ fontSize: '15px', color: '#cbd5e1', marginTop: '8px' }}>
                  Scan with your phone to pick songs & react!
                </div>
                <div style={{ fontSize: '44px', fontWeight: 900, letterSpacing: '0.08em', color: '#fff', margin: '4px 0' }}>
                  CODE: <span style={{ color: '#06b6d4' }}>{state.partyRoomCode}</span>
                </div>
              </div>
            </div>
          )}

          {/* Up Next Singer Card */}
          {state.upNextSinger && (
            <div style={{
              marginTop: '40px',
              padding: '16px 32px',
              background: 'rgba(255, 42, 95, 0.1)',
              border: '1px solid rgba(255, 42, 95, 0.3)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <span style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff2a5f', fontWeight: 800 }}>
                UP NEXT:
              </span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>
                {state.upNextSinger.singerName}
              </span>
              <span style={{ fontSize: '18px', color: '#a0aec0' }}>
                — "{state.upNextSinger.title}"
              </span>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE PLAYBACK (CD+G Canvas) */}
      <div style={{
        display: state.mediaType === 'cdg' ? 'flex' : 'none',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        position: 'relative'
      }}>
        <canvas
          ref={canvasRef}
          width={CDG_WIDTH}
          height={CDG_HEIGHT}
          style={{
            maxWidth: '96vw',
            maxHeight: '92vh',
            aspectRatio: '300/216',
            imageRendering: 'pixelated',
            boxShadow: '0 0 80px rgba(0,0,0,0.9)',
            borderRadius: '12px'
          }}
        />

        {/* Singer Lower-Third Overlay Banner */}
        {state.singerName && (
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '32px',
            background: 'rgba(18, 21, 30, 0.92)',
            border: '1px solid rgba(255, 42, 95, 0.4)',
            borderRadius: '16px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ff2a5f',
              boxShadow: '0 0 10px #ff2a5f'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff2a5f', fontWeight: 800 }}>
                ON STAGE
              </span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
                {state.singerName}
              </span>
            </div>
            {state.semitones !== 0 && (
              <span style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700
              }}>
                {state.semitones > 0 ? `+${state.semitones}♯` : `${state.semitones}♭`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE PLAYBACK (Video MP4) */}
      <div style={{
        display: state.mediaType === 'video' ? 'flex' : 'none',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <video
          ref={videoRef}
          style={{
            maxWidth: '100vw',
            maxHeight: '100vh',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* ACTIVE PLAYBACK (YouTube Video) */}
      {state.mediaType === 'youtube' && state.videoId && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <iframe
            ref={youtubeRef}
            src={`https://www.youtube-nocookie.com/embed/${state.videoId}?autoplay=1&enablejsapi=1&controls=0&rel=0&mute=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
            title={state.title}
            allow="autoplay; encrypted-media"
            allowFullScreen
            style={{
              width: '100vw',
              height: '100vh',
              border: 'none'
            }}
          />

          {/* Lower-third overlay on YouTube video */}
          {state.singerName && (
            <div style={{
              position: 'absolute',
              bottom: '32px',
              left: '40px',
              background: 'rgba(18, 21, 30, 0.92)',
              border: '1px solid rgba(255, 42, 95, 0.4)',
              borderRadius: '16px',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
              backdropFilter: 'blur(10px)',
              zIndex: 10
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#ff2a5f',
                boxShadow: '0 0 10px #ff2a5f'
              }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff2a5f', fontWeight: 800 }}>
                  ON STAGE
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
                  {state.singerName}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtle Corner QR Code Badge during Active Playback (ONLY IF PARTY IS ACTIVE) */}
      {isPartyActive && state.mediaType !== 'idle' && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          background: 'rgba(18, 21, 30, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          zIndex: 90,
          opacity: 0.85
        }}>
          <div style={{ background: '#fff', padding: '4px', borderRadius: '6px', display: 'flex' }}>
            <QRCodeView
              text={joinUrl}
              size={48}
              color="#090a0f"
              bgColor="#ffffff"
            />
          </div>
          <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#ff2a5f',
              textTransform: 'uppercase',
              letterSpacing: '0.08em'
            }}>
              PARTY QUEUE
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
              CODE: <span style={{ color: '#06b6d4' }}>{state.partyRoomCode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

render(<StageApp />, document.getElementById('stage-app'));
