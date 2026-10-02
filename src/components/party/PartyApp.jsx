import { useState, useEffect } from 'preact/hooks';
import { PartyClient } from '../../engine/party/party-client.js';
import { searchYouTubeKaraoke } from '../../engine/youtube/youtube-helper.js';

export function PartyApp() {
  const [roomCode, setRoomCode] = useState('');
  const [singerName, setSingerName] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('micup_party_singer')) || '';
  });
  const [activeTab, setActiveTab] = useState('request'); // 'request' | 'queue' | 'soundboard'
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [client, setClient] = useState(null);

  // Queue state synced from host
  const [queue, setQueue] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);

  // Song Request Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customArtist, setCustomArtist] = useState('');
  const [preferredKey, setPreferredKey] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);

  // Auto-fill room from URL params (e.g. ?room=ROCK7)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('room');
      if (r) {
        setRoomCode(r.toUpperCase().trim());
      }
    }
  }, []);

  const showToast = (msg, ms = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  };

  const handleJoinParty = async () => {
    if (!roomCode.trim()) {
      alert('Please enter a party room code.');
      return;
    }
    const name = singerName.trim() || 'Party Guest';
    setSingerName(name);
    localStorage.setItem('micup_party_singer', name);

    setConnectionStatus('connecting');

    const partyClient = new PartyClient({
      onQueueUpdate: (newQueue, playingTrack) => {
        setQueue(newQueue || []);
        setCurrentTrack(playingTrack || null);
      },
      onConnected: () => {
        setConnectionStatus('connected');
        showToast('🎉 Connected to living room stage!');
      },
      onDisconnected: () => {
        setConnectionStatus('disconnected');
        showToast('⚠️ Disconnected from party');
      }
    });

    try {
      await partyClient.join(roomCode, name);
      setClient(partyClient);
      setConnectionStatus('connected');
    } catch (err) {
      console.error('Failed to join party:', err);
      setConnectionStatus('disconnected');
      alert('Could not connect to party room. Make sure you are on the same Wi-Fi or check the code.');
    }
  };

  const handleSearchYouTube = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchYouTubeKaraoke(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('YouTube search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmitSong = (e) => {
    e.preventDefault();
    if (!client || connectionStatus !== 'connected') {
      alert('Not connected to party host.');
      return;
    }

    let title = '';
    let artist = '';
    let source = 'local';
    let youtubeId = null;

    if (selectedSong) {
      title = selectedSong.title;
      artist = selectedSong.artist || 'Karaoke Track';
      source = 'youtube';
      youtubeId = selectedSong.videoId;
    } else {
      if (!customTitle.trim()) {
        alert('Please enter a song title or select a YouTube result.');
        return;
      }
      title = customTitle.trim();
      artist = customArtist.trim() || 'Various';
    }

    client.requestSong({
      title,
      artist,
      preferredKey,
      source,
      youtubeId
    });

    showToast(`✅ "${title}" added to queue!`);
    setSelectedSong(null);
    setCustomTitle('');
    setCustomArtist('');
    setSearchQuery('');
    setSearchResults([]);
    setPreferredKey(0);
    setActiveTab('queue');
  };

  const handleTriggerSfx = (pad, emoji, label) => {
    if (!client || connectionStatus !== 'connected') return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    client.triggerSfx(pad);
    showToast(`${emoji} ${label} blasted to living room!`, 1500);
  };

  return (
    <div style={{
      maxWidth: '480px',
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-obsidian)',
      position: 'relative',
      paddingBottom: '80px',
      boxSizing: 'border-box'
    }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'linear-gradient(135deg, var(--neon-coral), var(--neon-amber))',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '100px',
          fontSize: '14px',
          fontWeight: 800,
          boxShadow: '0 8px 30px rgba(255, 42, 95, 0.5)',
          textAlign: 'center',
          maxWidth: '90%'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <header style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(18, 21, 30, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🎤</span>
          <span className="font-display" style={{ fontSize: '17px', fontWeight: 900, color: '#fff' }}>
            HOUSE<span style={{ color: 'var(--neon-coral)' }}>PARTY</span>
          </span>
        </div>

        {connectionStatus === 'connected' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-cyan" style={{ fontSize: '11px', padding: '4px 8px' }}>
              🟢 ROOM: {roomCode}
            </span>
          </div>
        ) : (
          <span className="badge badge-amber" style={{ fontSize: '11px', padding: '4px 8px' }}>
            {connectionStatus === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
          </span>
        )}
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {connectionStatus !== 'connected' ? (
          /* Join Screen */
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛋️</div>
              <h2 className="font-display" style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                Join House Karaoke
              </h2>
              <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Pick songs & play crowd sound effects from your couch!
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                PARTY ROOM CODE:
              </label>
              <input
                type="text"
                maxLength={5}
                placeholder="e.g. ROCK7"
                value={roomCode}
                onInput={(e) => setRoomCode(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'var(--bg-obsidian)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '0 16px',
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '2px',
                  color: '#fff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                YOUR NAME / DUET:
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah & Dave"
                value={singerName}
                onInput={(e) => setSingerName(e.target.value)}
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'var(--bg-obsidian)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '0 16px',
                  fontSize: '15px',
                  color: '#fff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleJoinParty}
              disabled={connectionStatus === 'connecting'}
              style={{
                height: '48px',
                background: 'var(--neon-coral)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(255, 42, 95, 0.4)',
                marginTop: '8px'
              }}
            >
              {connectionStatus === 'connecting' ? 'JOINING ROOM...' : '🎉 JOIN THE PARTY'}
            </button>
          </div>
        ) : (
          /* Connected Experience */
          <div>
            {/* TAB 1: REQUEST A SONG */}
            {activeTab === 'request' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Search Bar */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Search YouTube Karaoke..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchYouTube()}
                    style={{
                      flex: 1,
                      height: '48px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '10px',
                      padding: '0 14px',
                      fontSize: '14px',
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={handleSearchYouTube}
                    disabled={isSearching}
                    style={{
                      width: '48px',
                      height: '48px',
                      background: 'var(--neon-coral)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                    aria-label="Search"
                  >
                    🔍
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {searchResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedSong(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px',
                          background: selectedSong?.id === item.id ? 'rgba(255, 42, 95, 0.15)' : 'var(--bg-surface)',
                          border: selectedSong?.id === item.id ? '1px solid var(--neon-coral)' : '1px solid var(--border-subtle)',
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        {item.thumbnailUrl && (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '6px' }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {item.channelTitle || 'YouTube Karaoke'}
                          </div>
                        </div>
                        {selectedSong?.id === item.id && (
                          <span style={{ color: 'var(--neon-coral)', fontSize: '16px', fontWeight: 800 }}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Or Custom Track Entry */}
                {!selectedSong && (
                  <div style={{
                    padding: '14px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      OR ENTER SONG MANUALLY:
                    </div>
                    <input
                      type="text"
                      placeholder="Song Title (e.g. Mr. Brightside)"
                      value={customTitle}
                      onInput={(e) => setCustomTitle(e.target.value)}
                      style={{
                        height: '44px',
                        background: 'var(--bg-obsidian)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '0 12px',
                        color: '#fff',
                        fontSize: '14px'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Artist (e.g. The Killers)"
                      value={customArtist}
                      onInput={(e) => setCustomArtist(e.target.value)}
                      style={{
                        height: '44px',
                        background: 'var(--bg-obsidian)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '0 12px',
                        color: '#fff',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                )}

                {/* Selected Song Preview Banner */}
                {selectedSong && (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 42, 95, 0.1)',
                    border: '1px solid var(--neon-coral)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '11px', color: 'var(--neon-coral)', fontWeight: 800 }}>SELECTED TRACK:</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedSong.title}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedSong(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Key Shift Selector */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    PREFERRED KEY SHIFT:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {[-2, -1, 0, 1, 2].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPreferredKey(k)}
                        style={{
                          height: '44px',
                          background: preferredKey === k ? 'var(--neon-coral)' : 'var(--bg-surface)',
                          border: preferredKey === k ? '1px solid var(--neon-coral)' : '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        {k === 0 ? '0' : k > 0 ? `+${k}♯` : `${k}♭`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit to Queue Button */}
                <button
                  onClick={handleSubmitSong}
                  style={{
                    height: '48px',
                    background: 'var(--neon-coral)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(255, 42, 95, 0.4)',
                    marginTop: '8px'
                  }}
                >
                  ➕ ADD TO PARTY QUEUE
                </button>
              </div>
            )}

            {/* TAB 2: LIVE PARTY QUEUE */}
            {activeTab === 'queue' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Now Playing Banner */}
                {currentTrack && (
                  <div style={{
                    padding: '16px',
                    background: 'linear-gradient(135deg, rgba(255, 42, 95, 0.15) 0%, rgba(18, 21, 30, 0.9) 100%)',
                    border: '1px solid var(--neon-coral)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span className="badge badge-coral" style={{ fontSize: '10px', padding: '3px 8px' }}>
                        NOW SINGING
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                      {currentTrack.singer || currentTrack.singerName || 'Someone'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      "{currentTrack.title}" — {currentTrack.artist}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ROTATION ORDER ({queue.length} Songs)
                </div>

                {queue.length === 0 ? (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-surface)',
                    borderRadius: '12px'
                  }}>
                    Queue is empty! Be the first to pick a song.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {queue.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          background: idx === 0 ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
                          border: idx === 0 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-subtle)',
                          borderRadius: '10px'
                        }}
                      >
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: idx === 0 ? 'var(--neon-amber)' : 'rgba(255,255,255,0.1)',
                          color: idx === 0 ? '#000' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 800,
                          flexShrink: 0
                        }}>
                          {idx + 1}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.singerName || item.singer || 'Guest'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{item.title}" {item.artist ? `— ${item.artist}` : ''}
                          </div>
                        </div>

                        {item.semitones !== 0 && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'var(--neon-amber)'
                          }}>
                            {item.semitones > 0 ? `+${item.semitones}♯` : `${item.semitones}♭`}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: CROWD SOUNDBOARD REACTIONS */}
            {activeTab === 'soundboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                    Living Room Crowd Reactions 🔊
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Tap to trigger live sound effects on the main TV speakers!
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {[
                    { pad: 'applause', emoji: '👏', label: 'Applause' },
                    { pad: 'airhorn', emoji: '🎺', label: 'Air Horn' },
                    { pad: 'drumroll', emoji: '🥁', label: 'Drum Roll' },
                    { pad: 'rimshot', emoji: '💥', label: 'Rimshot' },
                    { pad: 'laugh', emoji: '😂', label: 'Laugh Track' },
                    { pad: 'scratch', emoji: '📀', label: 'DJ Scratch' }
                  ].map((sfx) => (
                    <button
                      key={sfx.pad}
                      onClick={() => handleTriggerSfx(sfx.pad, sfx.emoji, sfx.label)}
                      style={{
                        minHeight: '80px',
                        background: 'linear-gradient(135deg, rgba(255, 42, 95, 0.1) 0%, rgba(18, 21, 30, 0.95) 100%)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        color: '#fff',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'transform 0.1s ease',
                        active: { transform: 'scale(0.96)' }
                      }}
                    >
                      <span style={{ fontSize: '28px' }}>{sfx.emoji}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>{sfx.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Mobile Tab Bar */}
      {connectionStatus === 'connected' && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: '480px',
          margin: '0 auto',
          height: '64px',
          background: 'rgba(18, 21, 30, 0.95)',
          borderTop: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(16px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          zIndex: 90
        }}>
          <button
            onClick={() => setActiveTab('request')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'request' ? 'var(--neon-coral)' : 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '18px' }}>➕</span>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Request</span>
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'queue' ? 'var(--neon-coral)' : 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '18px' }}>📋</span>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Queue ({queue.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('soundboard')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'soundboard' ? 'var(--neon-coral)' : 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '18px' }}>🔊</span>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Soundboard</span>
          </button>
        </nav>
      )}
    </div>
  );
}
