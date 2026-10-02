import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { CDGRenderer, CDG_WIDTH, CDG_HEIGHT } from './engine/cdg/cdg-renderer.js';
import { STAGE_CHANNEL_NAME } from './engine/display/second-screen.js';

function StageApp() {
  const [state, setState] = useState({
    mediaType: 'idle', // 'idle' | 'cdg' | 'video'
    title: '',
    artist: '',
    singerName: '',
    semitones: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    upNextSinger: null,
    showCode: 'MICUP-LIVE'
  });

  const [announcement, setAnnouncement] = useState(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const cdgRendererRef = useRef(null);

  useEffect(() => {
    const channel = new BroadcastChannel(STAGE_CHANNEL_NAME);

    // Announce readiness to host
    channel.postMessage({ type: 'STAGE_READY' });

    channel.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'STATE_UPDATE') {
        setState(prev => ({ ...prev, ...payload }));
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
      } else if (type === 'ANNOUNCEMENT') {
        setAnnouncement(payload.text);
        setTimeout(() => setAnnouncement(null), payload.durationMs || 5000);
      }
    };

    return () => channel.close();
  }, []);

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
            margin: '0 0 40px 0',
            fontWeight: 500
          }}>
            The mic is hot. Scan to browse the catalog & submit your song!
          </p>

          {/* Show Code & Instructions Card */}
          <div style={{
            background: 'rgba(18, 21, 30, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '24px',
            padding: '24px 48px',
            display: 'flex',
            alignItems: 'center',
            gap: '32px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(20px)'
          }}>
            <div>
              <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#f59e0b', fontWeight: 700 }}>
                Join At MicUp.live
              </div>
              <div style={{ fontSize: '38px', fontWeight: 900, letterSpacing: '0.08em', color: '#fff', margin: '4px 0' }}>
                {state.showCode}
              </div>
            </div>
          </div>

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
            src={`https://www.youtube-nocookie.com/embed/${state.videoId}?autoplay=1&enablejsapi=1&controls=0&rel=0`}
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
    </div>
  );
}

render(<StageApp />, document.getElementById('stage-app'));
