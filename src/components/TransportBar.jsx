import {
  isPlaying,
  currentTime,
  duration,
  semitones,
  volume,
  isMuted,
  formattedCurrentTime,
  remainingTime,
  pitchDisplay,
  autoApplause,
  bgmActive
} from '../state/player-state.js';

export function TransportBar({ onPlayPause, onSeek, onNextSong, onRestart, onPitchChange, onVolumeChange }) {
  const handleScrubberChange = (e) => {
    const val = parseFloat(e.target.value);
    onSeek(val);
  };

  const handlePitchStep = (delta) => {
    const next = Math.max(-12, Math.min(12, semitones.value + delta));
    onPitchChange(next);
  };

  const handlePitchReset = () => {
    onPitchChange(0);
  };

  return (
    <div style={{
      background: 'rgba(18, 21, 30, 0.95)',
      borderTop: '1px solid var(--border-subtle)',
      padding: '16px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      backdropFilter: 'blur(20px)',
      flexShrink: 0
    }}>
      {/* Upper Row: Time Scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '40px' }}>
          {formattedCurrentTime.value}
        </span>

        <input
          type="range"
          min="0"
          max={duration.value || 100}
          step="0.1"
          value={currentTime.value}
          onInput={handleScrubberChange}
          style={{
            flex: 1,
            height: '6px',
            accentColor: 'var(--neon-coral)',
            cursor: 'pointer'
          }}
        />

        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '45px', textAlign: 'right' }}>
          {remainingTime.value}
        </span>
      </div>

      {/* Lower Row: Playback Buttons, Pitch Shift, & Volume */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Left: Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Restart */}
          <button
            onClick={onRestart}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)'
            }}
            title="Restart Song (Ctrl + Left)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>

          {/* Big Play / Pause Button */}
          <button
            onClick={onPlayPause}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--grad-hotmic)',
              boxShadow: 'var(--glow-coral)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
            title="Play / Pause (Space)"
          >
            {isPlaying.value ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            )}
          </button>

          {/* Next Song */}
          <button
            onClick={onNextSong}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)'
            }}
            title="Next Song / Finish Performance (Ctrl + Right)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" x2="19" y1="5" y2="19"/>
            </svg>
          </button>
        </div>

        {/* Center: Tactile Real-Time Key Shifter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(9, 10, 15, 0.6)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <span className="font-mono" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: '4px' }}>
            PITCH
          </span>

          <button
            onClick={() => handlePitchStep(-2)}
            style={{
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--neon-amber)',
              fontSize: '11px',
              fontWeight: 700
            }}
            title="Down 2 Semitones"
          >
            -2♭
          </button>

          <button
            onClick={() => handlePitchStep(-1)}
            style={{
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--neon-amber)',
              fontSize: '11px',
              fontWeight: 700
            }}
            title="Down 1 Semitone"
          >
            -1♭
          </button>

          {/* Current Pitch Display / Reset */}
          <button
            onClick={handlePitchReset}
            style={{
              height: '30px',
              padding: '0 12px',
              borderRadius: '6px',
              background: semitones.value !== 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: semitones.value !== 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border-subtle)',
              color: semitones.value !== 0 ? 'var(--neon-amber)' : '#fff',
              fontSize: '12px',
              fontWeight: 800,
              minWidth: '70px'
            }}
            title="Reset Pitch to 0"
          >
            {pitchDisplay.value}
          </button>

          <button
            onClick={() => handlePitchStep(1)}
            style={{
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--neon-amber)',
              fontSize: '11px',
              fontWeight: 700
            }}
            title="Up 1 Semitone"
          >
            +1♯
          </button>

          <button
            onClick={() => handlePitchStep(2)}
            style={{
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--neon-amber)',
              fontSize: '11px',
              fontWeight: 700
            }}
            title="Up 2 Semitones"
          >
            +2♯
          </button>
        </div>

        {/* Right: Master Volume & Atmosphere Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Auto-Applause Toggle */}
          <button
            onClick={() => { autoApplause.value = !autoApplause.value; }}
            style={{
              height: '30px',
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              background: autoApplause.value ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: autoApplause.value ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border-subtle)',
              color: autoApplause.value ? 'var(--neon-emerald)' : 'var(--text-dim)',
              fontSize: '11px',
              fontWeight: 700,
              gap: '6px'
            }}
            title="Automatically play crowd applause at the end of every song"
          >
            👏 Auto-Clap
          </button>

          {/* Volume Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                isMuted.value = !isMuted.value;
                onVolumeChange(isMuted.value ? 0 : volume.value);
              }}
              style={{
                background: 'none',
                color: isMuted.value ? 'var(--neon-coral)' : 'var(--text-muted)',
                padding: '4px'
              }}
            >
              {isMuted.value ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="22" x2="16" y1="9" y2="15"/>
                  <line x1="16" x2="22" y1="9" y2="15"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={isMuted.value ? 0 : volume.value}
              onInput={(e) => {
                const v = parseFloat(e.target.value);
                isMuted.value = false;
                onVolumeChange(v);
              }}
              style={{
                width: '80px',
                accentColor: 'var(--neon-coral)',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
