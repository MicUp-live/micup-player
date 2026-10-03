import { useState, useEffect, useRef } from 'preact/hooks';
import { PartyClient } from '../../engine/party/party-client.js';
import { DEFAULT_BROKER, BROKERS } from '../../engine/party/mqtt-transport.js';
import { searchYouTubeKaraoke, extractYouTubeVideoId } from '../../engine/youtube/youtube-helper.js';

export function PartyApp() {
  const [roomCode, setRoomCode] = useState('');
  const [brokerId, setBrokerId] = useState(DEFAULT_BROKER);
  const [sessionId, setSessionId] = useState('');
  const [singerName, setSingerName] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('micup_party_singer')) || '';
  });

  const [activeTab, setActiveTab] = useState('request'); // 'request' | 'queue' | 'soundboard'
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'failed'
  const [connectionError, setConnectionError] = useState(null);
  const [client, setClient] = useState(null);

  // Authoritative host queue snapshot + local outbox
  const [confirmedQueue, setConfirmedQueue] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);

  // Request form state
  const [directYtInput, setDirectYtInput] = useState('');
  const [directYtId, setDirectYtId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customArtist, setCustomArtist] = useState('');
  const [preferredKey, setPreferredKey] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);

  const pendingTimersRef = useRef(new Map());

  const showToast = (msg, ms = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  };

  // 1. Auto-fill room & broker from URL params on mount and auto-join
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('room');
      const b = params.get('broker');
      const s = params.get('session');

      if (r) {
        const cleanedRoom = r.toUpperCase().trim();
        setRoomCode(cleanedRoom);
        const resolvedBroker = b && BROKERS[b] ? b : DEFAULT_BROKER;
        setBrokerId(resolvedBroker);
        if (s) setSessionId(s);

        // Auto-join if room param exists
        const name = (localStorage.getItem('micup_party_singer') || '').trim() || 'Party Guest';
        setSingerName(name);
        initiateJoin(cleanedRoom, name, resolvedBroker);
      }
    }
  }, []);

  // Watch direct YouTube input for instant ID / URL recognition
  useEffect(() => {
    const id = extractYouTubeVideoId(directYtInput);
    setDirectYtId(id);
    if (id && !selectedSong) {
      setSelectedSong({
        id: `yt-${id}`,
        videoId: id,
        title: `YouTube Video (${id})`,
        artist: 'YouTube Video'
      });
    }
  }, [directYtInput]);

  const initiateJoin = async (targetRoom, targetSinger, targetBroker) => {
    if (!targetRoom.trim()) {
      alert('Please enter a party room code.');
      return;
    }
    const name = targetSinger.trim() || 'Party Guest';
    setSingerName(name);
    localStorage.setItem('micup_party_singer', name);

    setConnectionError(null);
    setConnectionStatus('connecting');

    const partyClient = new PartyClient({
      brokerId: targetBroker || brokerId,
      onConnected: ({ queue: initialQueue, currentTrack: playing, sessionId: hostSession }) => {
        setConnectionStatus('connected');
        setConnectionError(null);
        setConfirmedQueue(initialQueue || []);
        setCurrentTrack(playing || null);
        if (hostSession) setSessionId(hostSession);
        showToast('🎉 Connected to living room stage!');
      },
      onConnectionFailed: (err) => {
        setConnectionStatus('failed');
        setConnectionError(err?.message || 'Host did not respond. Check room code and ensure host is active.');
        showToast(`❌ Connection failed: ${err?.message || 'Host did not respond'}`);
      },
      onQueueUpdate: (newQueue, playingTrack) => {
        const updated = Array.isArray(newQueue) ? newQueue : [];
        setConfirmedQueue(updated);
        setCurrentTrack(playingTrack || null);

        // Prune pending outbox requests that are now present in host queue
        setPendingRequests(prev => prev.filter(p => {
          const isConfirmed = updated.some(qItem => 
            qItem.requestId === p.requestId ||
            (qItem.title && qItem.title.toLowerCase() === p.title.toLowerCase() &&
             qItem.singerName && qItem.singerName.toLowerCase() === p.singer.toLowerCase())
          );
          return !isConfirmed;
        }));
      },
      onSongAck: ({ requestId, accepted, error }) => {
        if (!requestId) return;
        setPendingRequests(prev => prev.map(p => {
          if (p.requestId === requestId) {
            return {
              ...p,
              status: accepted ? 'accepted' : 'rejected',
              error: error || null
            };
          }
          return p;
        }));

        if (accepted) {
          showToast('✅ Song confirmed by Living Room Stage!');
        } else {
          showToast(`❌ Request rejected: ${error || 'Host declined'}`);
        }
      },
      onDisconnected: () => {
        setConnectionStatus('disconnected');
        showToast('⚠️ Disconnected from party host');
      }
    });

    try {
      await partyClient.join(targetRoom, name, targetBroker || brokerId);
      setClient(partyClient);
      setConnectionStatus('handshaking');
    } catch (err) {
      console.error('Failed to join party:', err);
      setConnectionStatus('failed');
      setConnectionError(err?.message || 'Could not connect to party room');
      partyClient.disconnect();
    }
  };

  const handleManualJoin = () => {
    initiateJoin(roomCode, singerName, brokerId);
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

  const openYouTubeSearchTab = () => {
    const q = searchQuery.trim() || customTitle.trim() || 'karaoke';
    const query = encodeURIComponent(`${q} karaoke`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
  };

  const handleSubmitSong = (e) => {
    if (e) e.preventDefault();
    if (!client || connectionStatus !== 'connected') {
      alert('Not connected to party host. Please connect to a party room first.');
      return;
    }

    let title = '';
    let artist = '';
    let source = 'local';
    let youtubeId = null;

    // 1. Direct YouTube link/ID input
    if (directYtId) {
      title = selectedSong?.title || `YouTube Video (${directYtId})`;
      artist = selectedSong?.artist || 'YouTube Video';
      source = 'youtube';
      youtubeId = directYtId;
    }
    // 2. Selected YouTube search result
    else if (selectedSong) {
      title = selectedSong.title;
      artist = selectedSong.artist || selectedSong.channel || 'Karaoke Track';
      source = 'youtube';
      youtubeId = selectedSong.videoId || selectedSong.youtubeId || null;
    }
    // 3. Search query fallback (if user typed into search bar and pressed Add to Queue)
    else if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const parts = q.includes(' - ') ? q.split(' - ') : q.includes(' by ') ? q.split(' by ') : null;
      if (parts && parts.length >= 2) {
        artist = parts[0].trim();
        title = parts[1].trim();
      } else {
        title = q;
        artist = customArtist.trim() || 'Various';
      }
      source = 'request';
      youtubeId = null;
    }
    // 4. Custom manual entry
    else if (customTitle.trim()) {
      title = customTitle.trim();
      artist = customArtist.trim() || 'Various';
      source = 'local';
    } else {
      alert('Please enter a song title, search YouTube, or paste a YouTube link.');
      return;
    }

    // Generate unique request ID
    const reqId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const pendingItem = {
      requestId: reqId,
      title,
      artist,
      singer: singerName.trim() || 'Party Guest',
      preferredKey,
      source,
      youtubeId,
      status: 'pending',
      timestamp: Date.now()
    };

    // Add to optimistic pending outbox immediately
    setPendingRequests(prev => [...prev, pendingItem]);

    // Send request over MQTT transport
    try {
      client.requestSong({
        requestId: reqId,
        title,
        artist,
        preferredKey,
        source,
        youtubeId
      });
    } catch (err) {
      console.error('Failed to send song request:', err);
      setPendingRequests(prev => prev.map(p => p.requestId === reqId ? { ...p, status: 'unconfirmed', error: err.message } : p));
    }

    // Set 4.5s unconfirmed fallback timeout if host ACK doesn't arrive
    const timeoutId = setTimeout(() => {
      setPendingRequests(prev => prev.map(p => {
        if (p.requestId === reqId && p.status === 'pending') {
          return { ...p, status: 'unconfirmed' };
        }
        return p;
      }));
    }, 4500);
    pendingTimersRef.current.set(reqId, timeoutId);

    showToast(`📝 "${title}" submitted to stage!`);

    // Reset inputs
    setSelectedSong(null);
    setDirectYtInput('');
    setDirectYtId(null);
    setCustomTitle('');
    setCustomArtist('');
    setSearchQuery('');
    setSearchResults([]);
    setPreferredKey(0);

    // Switch to queue view so user sees their pending request immediately
    setActiveTab('queue');
  };

  const handleRetryRequest = (pendingItem) => {
    if (!client || connectionStatus !== 'connected') return;

    setPendingRequests(prev => prev.map(p => p.requestId === pendingItem.requestId ? { ...p, status: 'pending' } : p));

    try {
      client.requestSong({
        requestId: pendingItem.requestId,
        title: pendingItem.title,
        artist: pendingItem.artist,
        preferredKey: pendingItem.preferredKey,
        source: pendingItem.source,
        youtubeId: pendingItem.youtubeId
      });
      showToast(`🔄 Retrying "${pendingItem.title}"...`);
    } catch (err) {
      console.error('Retry failed:', err);
    }
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
          <span className={`badge ${connectionStatus === 'failed' ? 'badge-coral' : 'badge-amber'}`} style={{ fontSize: '11px', padding: '4px 8px' }}>
            {connectionStatus === 'connecting'
              ? 'CONNECTING...'
              : connectionStatus === 'handshaking'
              ? 'HANDSHAKING...'
              : connectionStatus === 'failed'
              ? 'CONNECTION FAILED'
              : 'DISCONNECTED'}
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
                Pick songs & blast reactions from your phone on any network!
              </p>
            </div>

            {/* Visible Handshake Failure Feedback */}
            {connectionError && (
              <div style={{
                background: 'rgba(255, 42, 95, 0.15)',
                border: '1px solid rgba(255, 42, 95, 0.6)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '13px',
                lineHeight: 1.4
              }}>
                <div style={{ fontWeight: 800, color: 'var(--neon-coral)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>⚠️</span> Connection Failed
                </div>
                <div>{connectionError}</div>
              </div>
            )}

            {/* Connecting / Handshaking Progress */}
            {(connectionStatus === 'connecting' || connectionStatus === 'handshaking') && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--neon-amber)',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', background: 'var(--neon-amber)' }} />
                  <span>{connectionStatus === 'connecting' ? 'Connecting to broker...' : 'Handshaking with host...'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (client) client.disconnect();
                    setConnectionStatus('disconnected');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    textDecoration: 'underline',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

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
                YOUR SINGER / DUET NAME:
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
              onClick={handleManualJoin}
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
              🎉 JOIN THE PARTY
            </button>
          </div>
        ) : (
          /* Connected Experience */
          <div>
            {/* TAB 1: REQUEST A SONG */}
            {activeTab === 'request' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Direct YouTube Link or Video ID (Most Reliable Path) */}
                <div style={{
                  padding: '14px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--neon-coral)' }}>
                      🔴 PASTE YOUTUBE LINK OR VIDEO ID:
                    </span>
                    <button
                      type="button"
                      onClick={openYouTubeSearchTab}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--neon-cyan)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Open YouTube ↗
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="https://youtu.be/... or 11-char ID"
                    value={directYtInput}
                    onInput={(e) => setDirectYtInput(e.target.value)}
                    style={{
                      height: '44px',
                      background: 'var(--bg-obsidian)',
                      border: directYtId ? '1px solid var(--neon-cyan)' : '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                  {directYtId && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 8px',
                      background: 'rgba(0, 240, 255, 0.08)',
                      borderRadius: '8px'
                    }}>
                      <img
                        src={`https://i.ytimg.com/vi/${directYtId}/hqdefault.jpg`}
                        alt=""
                        style={{ width: '50px', height: '38px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                      <div style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>
                        ✓ YouTube Video Detected ({directYtId})
                      </div>
                    </div>
                  )}
                </div>

                {/* Integrated Search Bar */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Or Search YouTube Karaoke..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchYouTube()}
                    style={{
                      flex: 1,
                      height: '46px',
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
                      width: '46px',
                      height: '46px',
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
                    {isSearching ? '⏳' : '🔍'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
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
                        {(item.thumbnail || item.thumbnailUrl) && (
                          <img
                            src={item.thumbnail || item.thumbnailUrl}
                            alt=""
                            style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '6px' }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {item.channel || item.channelTitle || 'YouTube Karaoke'}
                          </div>
                        </div>
                        {selectedSong?.id === item.id && (
                          <span style={{ color: 'var(--neon-coral)', fontSize: '16px', fontWeight: 800 }}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Or Custom Manual Entry */}
                {!selectedSong && !directYtId && (
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
                        height: '42px',
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
                        height: '42px',
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
                      onClick={() => { setSelectedSong(null); setDirectYtId(null); setDirectYtInput(''); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Key Shift Selector */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    KEY ADJUSTMENT PRESET:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {[-2, -1, 0, 1, 2].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPreferredKey(k)}
                        style={{
                          height: '42px',
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

                {/* Optimistic Pending Requests Section */}
                {pendingRequests.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--neon-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>⏳</span>
                      <span>AWAITING HOST CONFIRMATION ({pendingRequests.length})</span>
                    </div>
                    {pendingRequests.map((p) => (
                      <div
                        key={p.requestId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px dashed rgba(245, 158, 11, 0.5)',
                          borderRadius: '10px'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                            {p.singer}: "{p.title}"
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {p.artist} {p.preferredKey !== 0 ? `(${p.preferredKey > 0 ? `+${p.preferredKey}♯` : `${p.preferredKey}♭`})` : ''}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {p.status === 'pending' && (
                            <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                              SENDING...
                            </span>
                          )}
                          {p.status === 'accepted' && (
                            <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                              CONFIRMED ✓
                            </span>
                          )}
                          {p.status === 'unconfirmed' && (
                            <button
                              onClick={() => handleRetryRequest(p)}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--neon-coral)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Confirmed Rotation Order */}
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ROTATION ORDER ({confirmedQueue.length} Confirmed Songs)
                </div>

                {confirmedQueue.length === 0 && pendingRequests.length === 0 ? (
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
                    {confirmedQueue.map((item, idx) => (
                      <div
                        key={item.id || item.requestId || idx}
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { pad: 'applause', emoji: '👏', label: 'Applause' },
                    { pad: 'airhorn', emoji: '📯', label: 'Air Horn' },
                    { pad: 'drumroll', emoji: '🥁', label: 'Drum Roll' },
                    { pad: 'rimshot', emoji: '💥', label: 'Rimshot' },
                    { pad: 'laughter', emoji: '😂', label: 'Laughter' },
                    { pad: 'scratch', emoji: '🎧', label: 'Scratch' },
                    { pad: 'crickets', emoji: '🦗', label: 'Crickets' },
                    { pad: 'fail', emoji: '🎺', label: 'Sad Trombone' },
                    { pad: 'boo', emoji: '👎', label: 'Crowd Boo' }
                  ].map((sfx) => (
                    <button
                      key={sfx.pad}
                      onClick={() => handleTriggerSfx(sfx.pad, sfx.emoji, sfx.label)}
                      style={{
                        height: '76px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '12px',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        userSelect: 'none'
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>{sfx.emoji}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '95%'
                      }}>
                        {sfx.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Sticky Navigation */}
      {connectionStatus !== 'disconnected' && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '480px',
          height: '64px',
          background: 'rgba(18, 21, 30, 0.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          zIndex: 100,
          boxSizing: 'border-box'
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
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '18px' }}>📜</span>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Queue ({confirmedQueue.length + pendingRequests.length})</span>
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
            <span style={{ fontSize: '18px' }}>📢</span>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Reactions</span>
          </button>
        </nav>
      )}
    </div>
  );
}
