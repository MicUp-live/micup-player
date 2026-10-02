import { useState, useEffect } from 'preact/hooks';
import { soundPads } from '../engine/sfx/sound-pads.js';

export function SoundPadsDrawer({ isOpen, onClose }) {
  const [activePad, setActivePad] = useState(null);

  const pads = [
    { id: 'applause', label: 'Applause', icon: '👏', key: '1', color: 'var(--neon-coral)' },
    { id: 'airhorn', label: 'Air Horn', icon: '📯', key: '2', color: 'var(--neon-amber)' },
    { id: 'drumroll', label: 'Drum Roll', icon: '🥁', key: '3', color: 'var(--neon-cyan)' },
    { id: 'rimshot', label: 'Rimshot', icon: '💥', key: '4', color: 'var(--neon-violet)' },
    { id: 'laughter', label: 'Laughter', icon: '😂', key: '5', color: '#ec4899' },
    { id: 'scratch', label: 'Scratch', icon: '🎧', key: '6', color: 'var(--neon-emerald)' },
    { id: 'crickets', label: 'Crickets', icon: '🦗', key: '7', color: '#84cc16' },
    { id: 'fail', label: 'Sad Trombone', icon: '🎺', key: '8', color: '#f59e0b' },
    { id: 'boo', label: 'Crowd Boo', icon: '👎', key: '9', color: '#ef4444' },
  ];

  // Preload sound buffers for zero-latency instant playback
  useEffect(() => {
    soundPads.preloadAll();
  }, []);

  const handleTrigger = (padId) => {
    setActivePad(padId);
    setTimeout(() => {
      setActivePad(prev => (prev === padId ? null : prev));
    }, 180);
    soundPads.play(padId);
  };

  // Keyboard shortcut triggers (keys 1 through 9)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't fire if user is typing into an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const matched = pads.find(p => p.key === e.key);
      if (matched) {
        handleTrigger(matched.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '100px',
      right: '24px',
      background: 'rgba(18, 21, 30, 0.95)',
      border: '1px solid var(--border-medium)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(6, 182, 212, 0.1)',
      backdropFilter: 'blur(24px)',
      zIndex: 50,
      width: '340px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🎛️</span>
          <div className="font-display" style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
            STUDIO SFX PADS
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '16px',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: '4px'
          }}
          title="Close Soundboard"
        >
          ✕
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px'
      }}>
        {pads.map((pad) => {
          const isActive = activePad === pad.id;
          return (
            <button
              key={pad.id}
              onClick={() => handleTrigger(pad.id)}
              style={{
                height: '82px',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                border: isActive ? `1.5px solid ${pad.color}` : '1px solid var(--border-subtle)',
                boxShadow: isActive ? `0 0 16px ${pad.color}` : 'none',
                transform: isActive ? 'scale(0.96)' : 'scale(1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
                userSelect: 'none'
              }}
            >
              <span style={{ fontSize: '24px', filter: isActive ? 'brightness(1.3)' : 'none' }}>
                {pad.icon}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isActive ? '#fff' : 'var(--text-main)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '90%'
              }}>
                {pad.label}
              </span>
              <span className="font-mono" style={{
                position: 'absolute',
                top: '4px',
                right: '6px',
                fontSize: '9px',
                fontWeight: 600,
                color: isActive ? pad.color : 'var(--text-dim)'
              }}>
                [{pad.key}]
              </span>
            </button>
          );
        })}
      </div>

      <div style={{
        marginTop: '14px',
        textAlign: 'center',
        fontSize: '11px',
        color: 'var(--text-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
      }}>
        <span>Hotkeys <strong style={{ color: 'var(--text-main)' }}>1</strong> – <strong style={{ color: 'var(--text-main)' }}>9</strong> trigger instantly</span>
      </div>
    </div>
  );
}
