import { useState } from 'preact/hooks';
import {
  isPartyActive,
  partyRoomCode,
  partyBroker,
  partySessionId,
  connectedPeersCount,
  partyActivityLogs,
  startPartyHost,
  stopPartyHost
} from '../state/party-state.js';
import { QRCodeView } from './QRCodeView.jsx';

export function HousePartyModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [customCode, setCustomCode] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const active = isPartyActive.value;
  const room = partyRoomCode.value;
  const broker = partyBroker.value || 'hivemq';
  const session = partySessionId.value || '';
  const peers = connectedPeersCount.value;
  const logs = partyActivityLogs.value;

  const partyUrl = (active && typeof window !== 'undefined' && window.location)
    ? new URL(`party.html?room=${encodeURIComponent(room)}&broker=${encodeURIComponent(broker)}&session=${encodeURIComponent(session)}`, window.location.href).href
    : '';

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startPartyHost(customCode || null, null, 'hivemq');
    } catch (err) {
      console.error('Failed to start party:', err);
      alert('Could not start party connection. Please check network.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = () => {
    stopPartyHost();
  };

  const handleCopyLink = () => {
    if (!partyUrl) return;
    navigator.clipboard.writeText(partyUrl).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(9, 10, 15, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: '540px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-glow)',
        borderRadius: '16px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.8), 0 0 30px rgba(255, 42, 95, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(255, 42, 95, 0.08) 0%, rgba(0,0,0,0) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🏠</span>
            <div>
              <h2 id="party-modal-title" className="font-display" style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                House Party Mode (P2P)
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Mobile room: friends can scan from any device (cellular, 5G, or Wi-Fi)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '22px',
              cursor: 'pointer',
              minWidth: '48px',
              minHeight: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px'
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
          {!active ? (
            /* Party Inactive State */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                padding: '16px',
                background: 'rgba(255, 42, 95, 0.05)',
                border: '1px solid rgba(255, 42, 95, 0.2)',
                borderRadius: '12px',
                fontSize: '13px',
                lineHeight: '1.5',
                color: 'var(--text-secondary)'
              }}>
                <strong style={{ color: 'var(--neon-coral)' }}>🛋️ Mobile Song Requests & Reactions:</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>Guests scan the QR code on their phone (works on any network — cellular 5G or Wi-Fi).</li>
                  <li>Anyone can search YouTube, request songs, and preset their key.</li>
                  <li>Guests get a live <strong>Crowd Soundboard</strong> (airhorn, applause, rimshot) that blasts out your living room speakers!</li>
                </ul>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Custom Party Room Code (Optional):
                </label>
                <input
                  type="text"
                  maxLength={5}
                  placeholder="e.g. ROCK7 (leave blank to auto-generate)"
                  value={customCode}
                  onInput={(e) => setCustomCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    height: '48px',
                    background: 'var(--bg-obsidian)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '0 16px',
                    fontSize: '16px',
                    fontWeight: 700,
                    letterSpacing: '2px',
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                onClick={handleStart}
                disabled={isStarting}
                style={{
                  height: '48px',
                  background: 'var(--neon-coral)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor: isStarting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(255, 42, 95, 0.4)'
                }}
              >
                {isStarting ? 'CONNECTING ROOM...' : '🎉 START HOUSE PARTY'}
              </button>
            </div>
          ) : (
            /* Party Active State */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Room Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--neon-cyan)', fontWeight: 700 }}>
                    Party Room Code
                  </div>
                  <div className="font-display" style={{ fontSize: '32px', fontWeight: 900, color: '#fff', letterSpacing: '3px' }}>
                    {room}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    🟢 {peers} {peers === 1 ? 'Guest' : 'Guests'} Connected
                  </span>
                </div>
              </div>

              {/* QR Code and Instructions */}
              <div style={{
                display: 'flex',
                gap: '20px',
                alignItems: 'center',
                background: 'var(--bg-obsidian)',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{
                  padding: '8px',
                  background: '#fff',
                  borderRadius: '10px',
                  display: 'flex'
                }}>
                  <QRCodeView text={partyUrl} size={150} color="#090a0f" bgColor="#ffffff" />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                    Point Phone Camera to Join
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Friends on the same Wi-Fi can scan this QR code or visit:
                  </div>
                  <div style={{
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    color: 'var(--neon-coral)',
                    wordBreak: 'break-all'
                  }}>
                    {partyUrl}
                  </div>

                  <button
                    onClick={handleCopyLink}
                    style={{
                      height: '36px',
                      background: copyFeedback ? 'var(--neon-cyan)' : 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: copyFeedback ? '#000' : '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      marginTop: '4px'
                    }}
                  >
                    {copyFeedback ? '✓ Link Copied!' : '📋 Copy Guest Link'}
                  </button>
                </div>
              </div>

              {/* Live Party Activity Ticker */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Live Party Activity
                </div>
                <div style={{
                  background: 'var(--bg-obsidian)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '10px',
                  height: '130px',
                  overflowY: 'auto',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {logs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
                      Waiting for guests to join and pick songs...
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>[{log.time}]</span>
                        <span>{log.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* End Party Button */}
              <button
                onClick={handleStop}
                style={{
                  height: '44px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                ⏹️ End House Party
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
