import { useState, useEffect } from 'preact/hooks';
import { libraryStore } from '../engine/library/library-store.js';
import { allShowSingers, addKnownSinger } from '../state/player-state.js';
import { AssignSingerModal } from './AssignSingerModal.jsx';
import {
  searchYouTubeKaraoke,
  extractYouTubeVideoId,
  getYouTubeApiKey,
  setYouTubeApiKey,
  getCustomSearchEndpoint,
  setCustomSearchEndpoint
} from '../engine/youtube/youtube-helper.js';

export function LibraryModal({ isOpen, onClose, onSelectTrack, onQueueTrack }) {
  const [activeTab, setActiveTab] = useState('local'); // 'local' | 'youtube'
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  // YouTube search state
  const [ytResults, setYtResults] = useState([]);
  const [isYtSearching, setIsYtSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getYouTubeApiKey());
  const [endpointInput, setEndpointInput] = useState(getCustomSearchEndpoint());
  const [searchFeedback, setSearchFeedback] = useState('');

  // Singer Assignment & Modal state
  const [selectedSinger, setSelectedSinger] = useState('');
  const [pendingTrack, setPendingTrack] = useState(null); // { track, action: 'queue' | 'play' }

  useEffect(() => {
    const unsubscribe = libraryStore.subscribe((store) => {
      setIsScanning(store.isScanning);
      setScanCount(store.tracks.length);
      if (activeTab === 'local') {
        setTracks(store.search(searchQuery));
      }
    });
    if (activeTab === 'local') {
      setTracks(libraryStore.search(searchQuery));
    }
    return unsubscribe;
  }, [searchQuery, activeTab]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (activeTab === 'local') {
      setTracks(libraryStore.search(q));
    } else {
      const directId = extractYouTubeVideoId(q);
      if (directId) {
        setYtResults([{
          type: 'youtube',
          id: `yt-${directId}`,
          videoId: directId,
          youtubeId: directId,
          title: `Direct YouTube Track (${directId})`,
          channel: 'Direct Link',
          artist: 'Direct Link',
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
          duration: 0
        }]);
      }
    }
  };

  const handleYouTubeSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsYtSearching(true);
    setSearchFeedback('');
    try {
      const results = await searchYouTubeKaraoke(searchQuery);
      setYtResults(results);
      if (results.length === 0) {
        setSearchFeedback('No videos found. You can paste any direct YouTube link (e.g. https://youtu.be/... or 11-char ID), or configure an API key.');
      }
    } catch (err) {
      console.warn('YouTube search error:', err);
      setSearchFeedback('Search failed. Check your network or paste a direct YouTube link.');
    } finally {
      setIsYtSearching(false);
    }
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
        {/* Modal Header & Tabs */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Tab Selector */}
          <div style={{
            display: 'flex',
            background: 'rgba(9, 10, 15, 0.6)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            gap: '4px'
          }}>
            <button
              onClick={() => setActiveTab('local')}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '6px',
                background: activeTab === 'local' ? 'rgba(255, 255, 255, 0.1)' : 'none',
                color: activeTab === 'local' ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                gap: '6px'
              }}
            >
              📁 Local Media ({libraryStore.tracks.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('youtube');
                if (searchQuery.trim() && ytResults.length === 0) {
                  handleYouTubeSearch();
                }
              }}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '6px',
                background: activeTab === 'youtube' ? 'rgba(255, 42, 95, 0.2)' : 'none',
                color: activeTab === 'youtube' ? 'var(--neon-coral)' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                gap: '6px'
              }}
            >
              🔴 YouTube Karaoke
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeTab === 'youtube' && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: showSettings ? 'rgba(255, 42, 95, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  border: showSettings ? '1px solid var(--neon-coral)' : '1px solid var(--border-medium)',
                  color: showSettings ? 'var(--neon-coral)' : '#fff',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                ⚙️ API Settings
              </button>
            )}

            {activeTab === 'local' && (
              <button
                onClick={handleSelectFolder}
                disabled={isScanning}
                style={{
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-medium)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                {libraryStore.tracks.length > 0 ? 'Change Folder' : 'Connect Folder'}
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                fontSize: '14px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Optional YouTube API Settings Drawer */}
        {showSettings && activeTab === 'youtube' && (
          <div style={{
            background: 'rgba(255, 42, 95, 0.06)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>
              ⚙️ YouTube Search Configuration (Optional)
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              By default, MicUp queries high-availability CORS mirrors or resolves direct YouTube URLs. You can also provide your own Google YouTube Data API v3 key or custom Cloudflare Worker for 100% dedicated availability.
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Google YouTube Data API v3 Key (AIzaSy...)"
                value={apiKeyInput}
                onInput={(e) => setApiKeyInput(e.target.value)}
                style={{
                  flex: 1,
                  height: '34px',
                  background: 'rgba(9, 10, 15, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '0 12px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={() => {
                  setYouTubeApiKey(apiKeyInput);
                  alert(apiKeyInput ? 'YouTube API key saved!' : 'YouTube API key removed.');
                }}
                style={{
                  height: '34px',
                  padding: '0 14px',
                  background: 'var(--neon-coral)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Singer Selection Bar */}
        <div style={{
          padding: '10px 24px',
          background: 'rgba(255, 42, 95, 0.04)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--neon-coral)' }}>
              🎤 Singer:
            </span>
            <input
              type="text"
              placeholder="Pick or type singer name..."
              value={selectedSinger}
              onInput={(e) => setSelectedSinger(e.target.value)}
              style={{
                height: '30px',
                background: 'rgba(9, 10, 15, 0.7)',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                padding: '0 10px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                width: '180px'
              }}
            />
            {allShowSingers.value.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quick set:</span>
                {allShowSingers.value.slice(0, 5).map(s => {
                  const isSel = selectedSinger.trim().toLowerCase() === s.toLowerCase();
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSinger(s)}
                      style={{
                        height: '24px',
                        padding: '0 8px',
                        borderRadius: '4px',
                        background: isSel ? 'rgba(255, 42, 95, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        border: isSel ? '1px solid var(--neon-coral)' : '1px solid var(--border-subtle)',
                        color: isSel ? '#fff' : 'var(--text-main)',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      👤 {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selectedSinger.trim() && (
            <button
              type="button"
              onClick={() => setSelectedSinger('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Clear Singer
            </button>
          )}
        </div>

        {/* Search Input Bar */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <form onSubmit={activeTab === 'youtube' ? handleYouTubeSearch : (e) => e.preventDefault()} style={{
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
              placeholder={activeTab === 'local' ? 'Search local songs by artist, title, disc code...' : 'Search YouTube karaoke or paste YouTube link...'}
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
            {activeTab === 'youtube' && (
              <button
                type="submit"
                disabled={isYtSearching}
                style={{
                  height: '30px',
                  padding: '0 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--neon-coral)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                {isYtSearching ? 'Searching...' : 'Search YouTube'}
              </button>
            )}
          </form>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {/* TAB 1: LOCAL MEDIA */}
          {activeTab === 'local' && (
            tracks.length === 0 ? (
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
                      Click <strong>Connect Folder</strong> to link your local hard drive or external drive containing .zip (MP3+G) or .mp4 files.
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
                      Can't find it locally? Switch to the <strong>🔴 YouTube Karaoke</strong> tab above!
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingTrack({
                        track: {
                          title: searchQuery,
                          artist: 'Custom Request',
                          source: 'request',
                          type: 'request'
                        },
                        action: 'queue'
                      })}
                      style={{
                        marginTop: '12px',
                        height: '32px',
                        padding: '0 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--border-medium)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      + Add "{searchQuery}" as Custom Singer Request
                    </button>
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
                        onClick={() => setPendingTrack({ track, action: 'queue' })}
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
                        onClick={() => setPendingTrack({ track, action: 'play' })}
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
            )
          )}

          {/* TAB 2: YOUTUBE KARAOKE */}
          {activeTab === 'youtube' && (
            isYtSearching ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⏳</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                  Searching YouTube Karaoke...
                </div>
              </div>
            ) : ytResults.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '50px 20px',
                textAlign: 'center',
                color: 'var(--text-dim)'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔴</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                  Live YouTube Karaoke Fallback
                </div>
                <div style={{ fontSize: '13px', maxWidth: '420px', lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Search for any brand new pop release or obscure track requested by a singer.
                  Videos play directly onto the second screen / TV window!
                </div>
                {searchFeedback && (
                  <div style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    background: 'rgba(255, 42, 95, 0.1)',
                    border: '1px solid rgba(255, 42, 95, 0.3)',
                    color: 'var(--neon-coral)',
                    fontSize: '12px',
                    maxWidth: '440px',
                    lineHeight: 1.4
                  }}>
                    {searchFeedback}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ytResults.map((item) => (
                  <div
                    key={item.videoId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      gap: '14px'
                    }}
                  >
                    {/* Video Thumbnail */}
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        style={{
                          width: '88px',
                          height: '52px',
                          objectFit: 'cover',
                          borderRadius: '6px',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div style={{ width: '88px', height: '52px', background: '#000', borderRadius: '6px' }} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {item.channel}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => setPendingTrack({ track: item, action: 'queue' })}
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
                        onClick={() => setPendingTrack({ track: item, action: 'play' })}
                        style={{
                          height: '32px',
                          padding: '0 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--neon-coral)',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700
                        }}
                      >
                        Play Video
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Assign Singer Dialog */}
      {pendingTrack && (
        <AssignSingerModal
          isOpen={Boolean(pendingTrack)}
          track={pendingTrack.track}
          initialAction={pendingTrack.action}
          defaultSinger={selectedSinger}
          onClose={() => setPendingTrack(null)}
          onConfirm={(track, singerName, semitones, chosenAction) => {
            const finalSinger = singerName || 'Singer';
            addKnownSinger(finalSinger);
            setSelectedSinger(finalSinger);
            setPendingTrack(null);
            if (chosenAction === 'play') {
              onSelectTrack(track, finalSinger, semitones);
            } else {
              onQueueTrack(track, finalSinger, semitones);
            }
            onClose();
          }}
        />
      )}
    </div>
  );
}
