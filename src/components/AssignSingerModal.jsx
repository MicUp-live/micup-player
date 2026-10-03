import { useState, useEffect, useRef } from 'preact/hooks';
import { allShowSingers } from '../state/player-state.js';

export function AssignSingerModal({
  isOpen,
  track,
  initialAction = 'queue', // 'queue' | 'play'
  defaultSinger = '',
  onClose,
  onConfirm // (track, singerName, semitones, action) => void
}) {
  const [singerName, setSingerName] = useState(defaultSinger);
  const [semitones, setSemitones] = useState(0);
  const [action, setAction] = useState(initialAction);
  const inputRef = useRef(null);

  const existingSingers = allShowSingers.value || [];

  // Reset or initialize when opened
  useEffect(() => {
    if (isOpen) {
      setSingerName(defaultSinger || '');
      setSemitones(0);
      setAction(initialAction);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, track, defaultSinger, initialAction]);

  if (!isOpen || !track) return null;

  const trimmedSinger = singerName.trim();
  const isExisting = existingSingers.some(
    s => s.toLowerCase() === trimmedSinger.toLowerCase()
  );
  const isNew = trimmedSinger.length > 0 && !isExisting;

  const handleSubmit = (chosenAction = action) => {
    const finalSinger = trimmedSinger || 'Host Selection';
    onConfirm(track, finalSinger, semitones, chosenAction);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(action);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '20px'
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#0d1017',
          border: '1px solid rgba(255, 42, 95, 0.3)',
          borderRadius: 'var(--radius-lg, 16px)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 42, 95, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🎤</span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
              {action === 'play' ? 'Play Performance Now' : 'Add to Stage Rotation'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Song Card Preview */}
          <div style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {track.title || 'Untitled Track'}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text-muted, #94a3b8)',
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {track.artist || track.channel || 'Unknown Artist'}
                {track.code ? ` • [${track.code}]` : ''}
              </div>
            </div>

            <span className="badge badge-coral" style={{ fontSize: '10px', padding: '3px 8px', flexShrink: 0 }}>
              {track.videoId || track.youtubeId ? 'YOUTUBE' : 'LOCAL'}
            </span>
          </div>

          {/* Singer Input Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#fff'
              }}>
                Singer Name
              </label>

              {/* Status Badge */}
              {isExisting && (
                <span style={{
                  fontSize: '11px',
                  color: 'var(--neon-emerald, #10b981)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>✓</span> Existing Singer
                </span>
              )}
              {isNew && (
                <span style={{
                  fontSize: '11px',
                  color: 'var(--neon-coral, #ff2a5f)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>✨</span> New Singer
                </span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter singer name or choose below..."
                value={singerName}
                onInput={(e) => setSingerName(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: isNew
                    ? '1.5px solid var(--neon-coral, #ff2a5f)'
                    : (isExisting ? '1.5px solid var(--neon-emerald, #10b981)' : '1px solid rgba(255, 255, 255, 0.15)'),
                  borderRadius: '8px',
                  padding: '0 14px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  outline: 'none',
                  boxShadow: isNew ? '0 0 12px rgba(255, 42, 95, 0.2)' : 'none'
                }}
              />
            </div>

            {/* Existing Singers Quick Chips */}
            {existingSingers.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '6px' }}>
                  Existing Singers (Click to set):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                  {existingSingers.map((singer) => {
                    const isSelected = singer.toLowerCase() === trimmedSinger.toLowerCase();
                    return (
                      <button
                        key={singer}
                        type="button"
                        onClick={() => {
                          setSingerName(singer);
                          inputRef.current?.focus();
                        }}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          background: isSelected ? 'rgba(255, 42, 95, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: isSelected ? '1px solid var(--neon-coral, #ff2a5f)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#fff' : 'var(--text-main, #e2e8f0)',
                          fontSize: '12px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span>👤</span> {singer}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setSingerName('');
                      inputRef.current?.focus();
                    }}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      background: 'none',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      color: 'var(--text-muted, #94a3b8)',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    + New Singer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Key Shift Selection (Optional) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted, #94a3b8)'
            }}>
              Key Shift (Optional)
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setSemitones(Math.max(-6, semitones - 1))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                -
              </button>

              {[-2, -1, 0, 1, 2].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSemitones(val)}
                  style={{
                    flex: 1,
                    height: '32px',
                    borderRadius: '6px',
                    background: semitones === val ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    border: semitones === val ? '1px solid var(--neon-amber, #f59e0b)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: semitones === val ? 'var(--neon-amber, #f59e0b)' : 'var(--text-muted, #94a3b8)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {val === 0 ? 'Standard' : (val > 0 ? `+${val}♯` : `${val}♭`)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSemitones(Math.min(6, semitones + 1))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          background: 'rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'none',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {action === 'queue' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit('play')}
                  style={{
                    height: '38px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Skip rotation queue and play immediately"
                >
                  ▶ Play Now
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit('queue')}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: 'var(--grad-hotmic, linear-gradient(135deg, #ff2a5f, #f59e0b))',
                    border: 'none',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(255, 42, 95, 0.35)'
                  }}
                >
                  + Add to Queue
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit('queue')}
                  style={{
                    height: '38px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Add to queue instead of playing immediately"
                >
                  + Add to Queue
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit('play')}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: 'var(--grad-hotmic, linear-gradient(135deg, #ff2a5f, #f59e0b))',
                    border: 'none',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(255, 42, 95, 0.35)'
                  }}
                >
                  ▶ Play Now
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
