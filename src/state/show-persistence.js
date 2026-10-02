/**
 * Show State Persistence in Cookies & Web Storage
 * 
 * Preserves the karaoke show rotation, queue, pitch shifts, cloud link,
 * and party codes in cookies across host page refreshes.
 */

const COOKIE_NAME = 'micup_show_state';
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function parseCookieString(cookieString, name) {
  if (!cookieString || typeof cookieString !== 'string') return null;
  const match = cookieString.match(new RegExp('(?:^|; )' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)'));
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  }
  return null;
}

export function formatCookieString(name, value, options = {}) {
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const path = options.path || '/';
  const sameSite = options.sameSite || 'Lax';
  const encodedVal = encodeURIComponent(typeof value === 'string' ? value : JSON.stringify(value));
  return `${name}=${encodedVal}; Max-Age=${maxAge}; Path=${path}; SameSite=${sameSite}`;
}

export function compactShowState(state = {}) {
  const queue = Array.isArray(state.queue) ? state.queue.map(item => ({
    id: item.id || `q-${Date.now()}`,
    singerName: item.singerName || 'Singer',
    title: item.title || 'Untitled',
    artist: item.artist || '',
    semitones: typeof item.semitones === 'number' ? item.semitones : 0,
    source: item.source || (item.videoId || item.youtubeId ? 'youtube' : 'local'),
    type: item.type || (item.videoId || item.youtubeId ? 'youtube' : 'local'),
    videoId: item.videoId || item.youtubeId || null,
    youtubeId: item.youtubeId || item.videoId || null,
    status: item.status || 'queued',
    requestedAt: item.requestedAt || ''
  })) : [];

  return {
    queue,
    showCode: state.showCode || 'MICUP-LIVE',
    isCloudLinked: Boolean(state.isCloudLinked),
    autoApplause: state.autoApplause !== undefined ? Boolean(state.autoApplause) : true,
    isPartyActive: Boolean(state.isPartyActive),
    partyRoomCode: state.partyRoomCode || ''
  };
}

export function serializeShowState(state) {
  return JSON.stringify(compactShowState(state));
}

export function deserializeShowState(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return null;
  try {
    const parsed = JSON.parse(jsonString);
    return compactShowState(parsed);
  } catch (err) {
    return null;
  }
}

export function saveShowStateToCookie(state, docObj = (typeof document !== 'undefined' ? document : null)) {
  const compacted = compactShowState(state);
  const serialized = JSON.stringify(compacted);

  // 1. Write to document.cookie
  if (docObj) {
    docObj.cookie = formatCookieString(COOKIE_NAME, serialized);
  }

  // 2. Also mirror to localStorage when available
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(COOKIE_NAME, serialized);
    }
  } catch (e) {}
}

export function loadShowStateFromCookie(docObj = (typeof document !== 'undefined' ? document : null)) {
  let raw = null;

  // 1. Try reading from cookie
  if (docObj && docObj.cookie) {
    raw = parseCookieString(docObj.cookie, COOKIE_NAME);
  }

  // 2. Fallback to localStorage if cookie empty
  if (!raw) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(COOKIE_NAME);
      }
    } catch (e) {}
  }

  if (raw) {
    return deserializeShowState(raw);
  }

  return null;
}

export function clearShowState(docObj = (typeof document !== 'undefined' ? document : null)) {
  if (docObj) {
    docObj.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(COOKIE_NAME);
    }
  } catch (e) {}
}
