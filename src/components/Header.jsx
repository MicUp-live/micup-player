import { secondScreen } from '../engine/display/second-screen.js';
import { activeTab, isSecondScreenConnected } from '../state/player-state.js';
import { isPartyActive, partyRoomCode } from '../state/party-state.js';

export function Header({ onOpenLibrary, onOpenPads, onOpenParty }) {
  const handleOpenSecondScreen = async () => {
    await secondScreen.openStageWindow();
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header style={{
      height: '64px',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(18, 21, 30, 0.85)',
      borderBottom: '1px solid var(--border-subtle)',
      backdropFilter: 'blur(16px)',
      flexShrink: 0,
      zIndex: 20
    }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Angled Mic SVG */}
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(255, 42, 95, 0.15), rgba(245, 158, 11, 0.15))',
            border: '1px solid rgba(255, 42, 95, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff2a5f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(-25deg)' }}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="font-display" style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff' }}>
                MICUP<span style={{ color: 'var(--neon-coral)' }}>.PLAYER</span>
              </span>
              <span className="badge badge-coral" style={{ fontSize: '9px', padding: '2px 6px' }}>
                PRO
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
              <div className="pulse-dot" />
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                The mic is hot
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Status / Party Room */}
      {isPartyActive.value ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 42, 95, 0.12)',
          padding: '6px 16px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid rgba(255, 42, 95, 0.4)',
          boxShadow: '0 0 15px rgba(255, 42, 95, 0.2)'
        }}>
          <span style={{ fontSize: '14px' }}>🎉</span>
          <span className="font-mono" style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>
            ROOM: <strong style={{ color: 'var(--neon-coral)' }}>{partyRoomCode.value}</strong>
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--neon-emerald)',
            background: 'rgba(16, 185, 129, 0.15)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700
          }}>
            LIVE
          </span>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(9, 10, 15, 0.5)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--neon-emerald)' }} />
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            STANDALONE PLAYER
          </span>
        </div>
      )}

      {/* Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Open 2nd Screen Window */}
        <button
          onClick={handleOpenSecondScreen}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md)',
            background: isSecondScreenConnected.value ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            border: isSecondScreenConnected.value ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-medium)',
            color: isSecondScreenConnected.value ? 'var(--neon-emerald)' : '#fff',
            fontSize: '13px',
            fontWeight: 600,
            gap: '8px'
          }}
          title="Open audience display window for second monitor, TV, or projector"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="3" rx="2"/>
            <line x1="8" x2="16" y1="21" y2="21"/>
            <line x1="12" x2="12" y1="17" y2="21"/>
          </svg>
          2nd Screen (TV)
        </button>

        {/* Music Library */}
        <button
          onClick={onOpenLibrary}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-medium)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            gap: '8px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>
          </svg>
          Folder / Library
        </button>

        {/* Sound Pads */}
        <button
          onClick={onOpenPads}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-medium)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            gap: '8px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="7" height="7" x="3" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="14" rx="1"/>
            <rect width="7" height="7" x="3" y="14" rx="1"/>
          </svg>
          SFX Pads
        </button>

        {/* House Party Button */}
        <button
          onClick={onOpenParty}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md)',
            background: isPartyActive.value ? 'rgba(255, 42, 95, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            border: isPartyActive.value ? '1px solid var(--neon-coral)' : '1px solid var(--border-medium)',
            color: isPartyActive.value ? 'var(--neon-coral)' : '#fff',
            fontSize: '13px',
            fontWeight: 700,
            gap: '8px',
            boxShadow: isPartyActive.value ? '0 0 14px rgba(255, 42, 95, 0.35)' : 'none',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Open P2P House Party mode for friends on Wi-Fi"
        >
          <span>🎉</span>
          {isPartyActive.value ? `Party: ${partyRoomCode.value}` : 'House Party'}
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={handleToggleFullscreen}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-muted)'
          }}
          title="Toggle Fullscreen"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
