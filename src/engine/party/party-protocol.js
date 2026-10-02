/**
 * Party Protocol definitions, creators, and validators for House Party Mode
 */

export const PartyAction = Object.freeze({
  HELLO: 'HELLO',
  WELCOME: 'WELCOME',
  ADD_SONG: 'ADD_SONG',
  ADD_SONG_ACK: 'ADD_SONG_ACK',
  QUEUE_UPDATE: 'QUEUE_UPDATE',
  TRIGGER_SFX: 'TRIGGER_SFX',
  SEARCH_REQ: 'SEARCH_REQ',
  SEARCH_RES: 'SEARCH_RES',
  PEER_JOIN: 'PEER_JOIN'
});

/**
 * Generate a friendly 5-character alphanumeric room code
 * (avoiding confusing chars like 0/O, 1/I)
 */
export function generateRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateNonce() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create HELLO handshake message (Guest -> Host)
 */
export function createHelloMessage({
  clientId = '',
  singer = 'Guest',
  nonce = null,
  session = ''
} = {}) {
  return {
    action: PartyAction.HELLO,
    payload: {
      clientId: String(clientId || `guest_${Date.now()}`),
      singer: String(singer || 'Guest').trim(),
      nonce: nonce || generateNonce(),
      session: String(session || ''),
      timestamp: Date.now()
    }
  };
}

/**
 * Create WELCOME handshake response (Host -> Guest)
 */
export function createWelcomeMessage({
  nonce = '',
  sessionId = '',
  revision = 1,
  queue = [],
  currentTrack = null
} = {}) {
  return {
    action: PartyAction.WELCOME,
    payload: {
      nonce: String(nonce || ''),
      sessionId: String(sessionId || ''),
      revision: Number(revision) || 1,
      queue: Array.isArray(queue) ? queue : [],
      currentTrack: currentTrack || null,
      timestamp: Date.now()
    }
  };
}

/**
 * Create normalized ADD_SONG message (Guest -> Host)
 */
export function createAddSongMessage({
  id = null,
  requestId = null,
  sessionId = '',
  clientId = '',
  singer = 'Guest',
  title = '',
  artist = '',
  preferredKey = 0,
  source = 'local',
  youtubeId = null,
  notes = ''
}) {
  let key = parseInt(preferredKey, 10);
  if (isNaN(key)) key = 0;
  key = Math.max(-6, Math.min(6, key));

  const reqId = requestId || id || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  return {
    action: PartyAction.ADD_SONG,
    payload: {
      id: String(reqId),
      requestId: String(reqId),
      sessionId: String(sessionId || ''),
      clientId: String(clientId || ''),
      singer: String(singer || 'Guest').trim().slice(0, 60),
      title: String(title || '').trim().slice(0, 120),
      artist: String(artist || '').trim().slice(0, 120),
      preferredKey: key,
      source: source === 'youtube' ? 'youtube' : 'local',
      youtubeId: youtubeId ? String(youtubeId).trim().slice(0, 32) : null,
      notes: notes ? String(notes).trim().slice(0, 200) : '',
      createdAt: Date.now()
    }
  };
}

/**
 * Create ADD_SONG_ACK message (Host -> Guest)
 */
export function createAddSongAckMessage({
  requestId,
  accepted = true,
  error = null,
  songId = null,
  revision = 1
}) {
  return {
    action: PartyAction.ADD_SONG_ACK,
    payload: {
      requestId: String(requestId || ''),
      accepted: Boolean(accepted),
      error: error ? String(error) : null,
      songId: songId ? String(songId) : null,
      revision: Number(revision) || 1,
      timestamp: Date.now()
    }
  };
}

/**
 * Create QUEUE_UPDATE message broadcast to all peers (Host -> Guests)
 */
export function createQueueUpdateMessage(queue = [], currentTrack = null, revision = 1) {
  return {
    action: PartyAction.QUEUE_UPDATE,
    payload: {
      revision: Number(revision) || 1,
      queue: Array.isArray(queue) ? queue : [],
      currentTrack: currentTrack || null,
      timestamp: Date.now()
    }
  };
}

/**
 * Create TRIGGER_SFX message (Guest -> Host)
 */
export function createSfxMessage(pad, sender = 'Guest') {
  return {
    action: PartyAction.TRIGGER_SFX,
    payload: {
      id: `sfx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      pad: String(pad).toLowerCase().trim(),
      sender: String(sender || 'Guest').trim().slice(0, 40),
      timestamp: Date.now()
    }
  };
}

/**
 * Parse and validate incoming party message
 */
export function parsePartyMessage(raw) {
  if (!raw) return null;

  let msg = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!msg || typeof msg !== 'object') return null;
  if (!msg.action || !Object.values(PartyAction).includes(msg.action)) {
    return null;
  }

  return msg;
}
