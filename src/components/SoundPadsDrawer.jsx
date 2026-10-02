import { useEffect } from 'preact/hooks';
import { soundPads } from '../engine/sfx/sound-pads.js';

export function SoundPadsDrawer({ isOpen, onClose }) {
  const pads = [
    { id: 'applause', label: 'Applause', icon: '👏', key: '1', color: 'var(--neon-coral)' },
    { id: 'airhorn', label: 'Air Horn', icon: '📯', key: '2', color: 'var(--neon-amber)' },
    { id: 'drumroll', label: 'Drum Roll', icon: '🥁', key: '3', color: 'var(--neon-cyan)' },
    { id: 'rimshot', label: 'Rimshot', icon: '💥', key: '4', color: 'var(--neon-violet)' },
    { id: 'laughter', label: 'Laughter', icon: '😂', key: '5', color: '#ec4899' },
    { id: 'scratch', label: 'Scratch', icon: '🎧', key: '6', color: 'var(--neon-emerald)' },
  ];

  const handleTrigger = (padId) => {
    soundPads.play(padId);
  };

  // Keyboard shortcut triggers (keys 1 through 6)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't fire if user is typing into an input
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
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(20px)',
      zIndex: 50,
      width: '320px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div className="font-display" style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
          HOT SFX PADS
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            color: 'var(--text-muted)',
            fontSize: '14px',
            padding: '4px'
          }}
        >
          ✕
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px'
      }}>
        {pads.map((pad) => (
          <button
            key={pad.id}
            onClick={() => handleTrigger(pad.id)}
            style={{
              height: '80px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '24px' }}>{pad.icon}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>
              {pad.label}
            </span>
            <span className="font-mono" style={{
              position: 'absolute',
              top: '4px',
              right: '6px',
              fontSize: '9px',
              color: 'var(--text-dim)'
            }}>
              [{pad.key}]
            </span>
          </button>
        ))}
      </div>
      <div style={{
        marginTop: '12px',
        textAlign: 'center',
        fontSize: '11px',
        color: 'var(--text-dim)'
      }}>
        Press hotkeys <strong>1</strong> through <strong>6</strong> anytime
      </div>
    </div>
  );
}
