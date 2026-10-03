/**
 * Normalized Track and Queue Item Model
 * 
 * Provides consistent data structures and validation across
 * host UI, second screen, party networking, and persistence.
 */

export function isPlayableYouTube(item) {
  if (!item) return false;
  const id = item.youtubeId || item.videoId || item.trackMatch?.videoId;
  return Boolean(id && typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id.trim()));
}

export function normalizeQueueItem(raw = {}) {
  const id = raw.id || raw.requestId || `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const singerName = String(raw.singerName || raw.singer || 'Singer').trim();
  const title = String(raw.title || 'Untitled Track').trim();
  const artist = String(raw.artist || raw.channel || 'Unknown Artist').trim();
  
  let semitones = typeof raw.semitones === 'number' ? raw.semitones : (typeof raw.preferredKey === 'number' ? raw.preferredKey : 0);
  semitones = Math.max(-12, Math.min(12, Math.round(semitones)));

  const extractedYtId = raw.youtubeId || raw.videoId || raw.trackMatch?.videoId || null;
  const validYtId = isPlayableYouTube({ youtubeId: extractedYtId }) ? extractedYtId.trim() : null;

  let source = raw.source || (validYtId ? 'youtube' : 'local');
  if (source === 'youtube' && !validYtId) {
    source = 'request';
  }

  let type = raw.type || (validYtId ? 'youtube' : 'request');
  if (type === 'youtube' && !validYtId) {
    type = 'request';
  }

  return {
    id,
    singerName,
    title,
    artist,
    semitones,
    source,
    type,
    youtubeId: validYtId,
    videoId: validYtId,
    code: String(raw.code || raw.trackMatch?.code || '').trim(),
    filename: String(raw.filename || raw.trackMatch?.filename || '').trim(),
    handle: raw.handle || raw.trackMatch?.handle || null,
    file: raw.file || raw.trackMatch?.file || null,
    status: raw.status || 'queued',
    requestedAt: raw.requestedAt || Date.now(),
    clientId: raw.clientId || null
  };
}

/**
 * Compact queue item for cookie & local storage persistence
 * Strips binary data, handles, and temporary DOM references
 */
export function compactQueueItem(item) {
  const norm = normalizeQueueItem(item);
  return {
    id: norm.id,
    singerName: norm.singerName,
    title: norm.title,
    artist: norm.artist,
    semitones: norm.semitones,
    source: norm.source,
    type: norm.type,
    youtubeId: norm.youtubeId,
    videoId: norm.videoId,
    code: norm.code,
    filename: norm.filename,
    status: norm.status,
    requestedAt: norm.requestedAt,
    clientId: norm.clientId
  };
}

/**
 * Disambiguates and matches a queue item against local indexed library items.
 * Prioritizes stable file identity (exact filename) first, then disc code + title,
 * preventing songs sharing the same disc code from resolving to the wrong track.
 */
export function matchTrackInLibrary(queueItem, libraryStore) {
  if (!libraryStore || typeof libraryStore.search !== 'function') return null;

  const code = (queueItem.code || '').trim().toLowerCase();
  const filename = (queueItem.filename || '').trim().toLowerCase();
  const artist = (queueItem.artist || '').trim().toLowerCase();
  const title = (queueItem.title || '').trim().toLowerCase();

  const allTracks = libraryStore.tracks || [];

  // 1. Exact Filename match (stable file identity)
  if (filename) {
    const found = allTracks.find(t => t.filename && t.filename.toLowerCase() === filename);
    if (found) return found;
  }

  // 2. Exact Disc Code AND Title match (resolves multi-track discs like SC8812-01 vs SC8812-02)
  if (code && title) {
    const found = allTracks.find(t =>
      t.code && t.code.toLowerCase() === code &&
      t.title && t.title.toLowerCase() === title
    );
    if (found) return found;
  }

  // 3. Exact Artist + Title match
  if (artist && title) {
    const found = allTracks.find(t => 
      t.artist && t.artist.toLowerCase() === artist &&
      t.title && t.title.toLowerCase() === title
    );
    if (found) return found;
  }

  // 4. Disc Code AND fuzzy title match
  if (code && title) {
    const found = allTracks.find(t =>
      t.code && t.code.toLowerCase() === code &&
      t.title && (t.title.toLowerCase().includes(title) || title.includes(t.title.toLowerCase()))
    );
    if (found) return found;
  }

  // 5. Disc Code ONLY if there is uniquely a single track on that code and no conflicting title requested
  if (code && !title) {
    const matchingCodeTracks = allTracks.filter(t => t.code && t.code.toLowerCase() === code);
    if (matchingCodeTracks.length === 1) {
      return matchingCodeTracks[0];
    }
  }

  // 6. Fallback to LibraryStore matchRequest
  if (typeof libraryStore.matchRequest === 'function') {
    return libraryStore.matchRequest(queueItem.artist, queueItem.title);
  }

  return null;
}
