import { queue, upNextSinger } from '../state/player-state.js';

function isYouTubeItem(item) {
  if (!item) return false;
  return Boolean(
    item.type === 'youtube' ||
    item.videoId ||
    item.youtubeId ||
    item.source === 'youtube' ||
    item.trackMatch?.type === 'youtube' ||
    item.trackMatch?.videoId
  );
}

export function QueuePanel({ onStartSong, onAddFromLibrary }) {
  const upNext = upNextSinger.value;
  const queueList = queue.value;

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const items = [...queue.value];
    const temp = items[index - 1];
    items[index - 1] = items[index];
    items[index] = temp;
    queue.value = items;
  };

  const handleMoveDown = (index) => {
    if (index >= queue.value.length - 1) return;
    const items = [...queue.value];
    const temp = items[index + 1];
    items[index + 1] = items[index];
    items[index] = temp;
    queue.value = items;
  };

  const handleDelete = (index) => {
    const items = queue.value.filter((_, i) => i !== index);
    queue.value = items;
  };

  return (
    <aside style={{
      width: '380px',
      background: 'rgba(18, 21, 30, 0.75)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      backdropFilter: 'blur(16px)'
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-display" style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
            STAGE ROTATION
          </span>
          <span className="badge badge-coral" style={{ fontSize: '10px' }}>
            {queueList.length} IN QUEUE
          </span>
        </div>

        <button
          onClick={onAddFromLibrary}
          style={{
            height: '28px',
            padding: '0 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 42, 95, 0.15)',
            border: '1px solid rgba(255, 42, 95, 0.4)',
            color: 'var(--neon-coral)',
            fontSize: '11px',
            fontWeight: 700,
            gap: '4px'
          }}
        >
          + Add Song
        </button>
      </div>

      {/* UP NEXT SPOTLIGHT CARD */}
      {upNext && (
        <div style={{
          margin: '14px 16px',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, rgba(255, 42, 95, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)',
          border: '1px solid rgba(255, 42, 95, 0.35)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--neon-coral)', fontWeight: 800 }}>
              UP NEXT ON STAGE
            </span>
            {upNext.semitones !== 0 && (
              <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                KEY: {upNext.semitones > 0 ? `+${upNext.semitones}♯` : `${upNext.semitones}♭`}
              </span>
            )}
          </div>

          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>
            {upNext.singerName}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>"{upNext.title}"</span>
            {isYouTubeItem(upNext) && (
              <span className="badge badge-coral" style={{ fontSize: '9px', padding: '1px 5px' }}>
                YOUTUBE
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            {upNext.artist}
          </div>

          <button
            onClick={() => onStartSong(upNext)}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--grad-hotmic)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              gap: '6px',
              boxShadow: '0 4px 14px rgba(255, 42, 95, 0.4)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start Performance
          </button>
        </div>
      )}

      {/* QUEUE LIST */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 12px 14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        {queueList.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-dim)',
            textAlign: 'center',
            padding: '20px'
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '10px' }}>
              <path d="m9 18 6-6-6-6"/>
            </svg>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>Queue is empty</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Add songs from library or wait for singer requests.</div>
          </div>
        ) : (
          queueList.map((item, index) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: index === 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                gap: '10px'
              }}
            >
              {/* Order Number */}
              <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-dim)', minWidth: '18px' }}>
                #{index + 1}
              </span>

              {/* Singer & Song Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.singerName}
                  </span>
                  {item.semitones !== 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--neon-amber)', fontWeight: 700 }}>
                      ({item.semitones > 0 ? `+${item.semitones}♯` : `${item.semitones}♭`})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {isYouTubeItem(item) && (
                    <span style={{ color: 'var(--neon-coral)', fontWeight: 800, fontSize: '9px' }}>[YT]</span>
                  )}
                  <span>{item.title} — {item.artist}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  style={{
                    background: 'none',
                    color: index === 0 ? 'var(--border-subtle)' : 'var(--text-muted)',
                    padding: '4px'
                  }}
                  title="Move Up"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index >= queueList.length - 1}
                  style={{
                    background: 'none',
                    color: index >= queueList.length - 1 ? 'var(--border-subtle)' : 'var(--text-muted)',
                    padding: '4px'
                  }}
                  title="Move Down"
                >
                  ▼
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  style={{
                    background: 'none',
                    color: 'var(--neon-coral)',
                    padding: '4px',
                    fontSize: '14px'
                  }}
                  title="Remove from Queue"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
