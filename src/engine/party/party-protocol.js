/**
 * Party Protocol definitions and helpers for WebRTC DataChannel messaging
 */

export const PartyAction = Object.freeze({
  ADD_SONG: 'ADD_SONG',
  QUEUE_UPDATE: 'QUEUE_UPDATE',
  TRIGGER_SFX: 'TRIGGER_SFX',
  SEARCH_REQ: 'SEARCH_REQ',
  SEARCH_RES: 'SEARCH_RES',
  PEER_JOIN: 'PEER_JOIN',
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

/**
 * Create normalized ADD_SONG message
 */
export function createAddSongMessage({
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

  return {
    action: PartyAction.ADD_SONG,
    payload: {
      id: `party_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      singer: String(singer || 'Guest').trim(),
      title: String(title || '').trim(),
      artist: String(artist || '').trim(),
      preferredKey: key,
      source: source === 'youtube' ? 'youtube' : 'local',
      youtubeId: youtubeId ? String(youtubeId).trim() : null,
      notes: notes ? String(notes).trim() : '',
      createdAt: Date.now()
    }
  };
}

/**
 * Create QUEUE_UPDATE message broadcast to all peers
 */
export function createQueueUpdateMessage(queue = [], currentTrack = null) {
  return {
    action: PartyAction.QUEUE_UPDATE,
    payload: {
      queue: Array.isArray(queue) ? queue : [],
      currentTrack: currentTrack || null,
      timestamp: Date.now()
    }
  };
}

/**
 * Create TRIGGER_SFX message
 */
export function createSfxMessage(pad, sender = 'Guest') {
  return {
    action: PartyAction.TRIGGER_SFX,
    payload: {
      pad: String(pad).toLowerCase().trim(),
      sender: String(sender || 'Guest').trim(),
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
