import { useState, useEffect } from 'preact/hooks';
import { libraryStore } from '../engine/library/library-store.js';

export function LibraryModal({ isOpen, onClose, onSelectTrack, onQueueTrack }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    const unsubscribe = libraryStore.subscribe((store) => {
      setIsScanning(store.isScanning);
      setScanCount(store.tracks.length);
      setTracks(store.search(searchQuery));
    });
    setTracks(libraryStore.search(searchQuery));
    return unsubscribe;
  }, [searchQuery]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setTracks(libraryStore.search(q));
  };

  const handleSelectFolder = async () => {
    try {
      await libraryStore.selectDirectory();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '780px',
        maxHeight: '85vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8)',
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
          justifyContent: 'space-between'
        }}>
          <div>
            <div className="font-display" style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
              LOCAL MUSIC LIBRARY
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isScanning ? (
                <span style={{ color: 'var(--neon-amber)' }}>
                  Scanning folder... Found {scanCount} tracks
                </span>
              ) : (
                <span>
                  {libraryStore.tracks.length > 0
                    ? `${libraryStore.tracks.length} tracks indexed from local storage`
                    : 'No folder connected yet'}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSelectFolder}
              disabled={isScanning}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-medium)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                gap: '6px'
              }}
            >
              📁 {libraryStore.tracks.length > 0 ? 'Change Folder' : 'Connect Folder'}
            </button>

            <button
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                fontSize: '16px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(9, 10, 15, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0 14px'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" x2="16.65" y1="21" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by artist, song title, or disc code..."
              value={searchQuery}
              onInput={handleSearch}
              style={{
                flex: 1,
                height: '44px',
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fff',
                paddingLeft: '12px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
              autoFocus
            />
          </div>
        </div>

        {/* Track List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {tracks.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-dim)'
            }}>
              {libraryStore.tracks.length === 0 ? (
                <>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    No karaoke folder connected
                  </div>
                  <div style={{ fontSize: '13px', maxWidth: '380px', marginBottom: '20px' }}>
                    Click <strong>Connect Folder</strong> to link your local hard drive or external USB drive containing .zip (MP3+G) or .mp4 files.
                  </div>
                  <button
                    onClick={handleSelectFolder}
                    style={{
                      height: '40px',
                      padding: '0 20px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--grad-hotmic)',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700
                    }}
                  >
                    Select Karaoke Folder
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    No matches found for "{searchQuery}"
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    Try searching by artist name or partial song title.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tracks.map((track) => (
                <div
                  key={track.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {track.artist} {track.code ? `• [${track.code}]` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
                    <button
                      onClick={() => {
                        onQueueTrack(track);
                        onClose();
                      }}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--text-main)',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      + Queue
                    </button>
                    <button
                      onClick={() => {
                        onSelectTrack(track);
                        onClose();
                      }}
                      style={{
                        height: '32px',
                        padding: '0 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--grad-hotmic)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      Play Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
