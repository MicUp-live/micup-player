import { signal } from '@preact/signals';
import { PartyHost } from '../engine/party/party-host.js';
import { queue, currentTrack } from './player-state.js';
import { libraryStore } from '../engine/library/library-store.js';
import { soundPads } from '../engine/sfx/sound-pads.js';

export const isPartyActive = signal(false);
export const partyRoomCode = signal('');
export const partyBroker = signal('hivemq');
export const partySessionId = signal('');
export const connectedPeersCount = signal(0);
export const partyActivityLogs = signal([]);

let partyHostInstance = null;

function addPartyLog(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = { id: Date.now() + Math.random(), time, text };
  partyActivityLogs.value = [entry, ...partyActivityLogs.value.slice(0, 49)];
}

/**
 * Start the P2P House Party Host
 */
export async function startPartyHost(preferredCode = null, customTransport = null, brokerId = 'hivemq') {
  if (isPartyActive.value && partyHostInstance) {
    return partyRoomCode.value;
  }

  partyHostInstance = new PartyHost({
    transport: customTransport,
    brokerId,
    onAddSong: (song) => {
      const newItem = {
        id: song.id || `party_${Date.now()}`,
        requestId: song.requestId || null,
        singerName: song.singer || 'Guest',
        title: song.title || 'Untitled Song',
        artist: song.artist || 'Unknown Artist',
        semitones: song.preferredKey || 0,
        requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'queued',
        source: song.source || (song.youtubeId ? 'youtube' : 'local'),
        type: song.source === 'youtube' || song.youtubeId ? 'youtube' : 'local',
        videoId: song.youtubeId || null,
        youtubeId: song.youtubeId || null
      };

      // Auto-match with local library if track title/artist available
      if (newItem.source === 'local' && (newItem.title || newItem.artist)) {
        try {
          const match = libraryStore.matchRequest(newItem.artist, newItem.title);
          if (match) {
            newItem.mediaItem = match;
          }
        } catch (err) {
          console.warn('Library match error:', err);
        }
      }

      queue.value = [...queue.value, newItem];
      addPartyLog(`🎤 ${newItem.singerName} added "${newItem.title}"`);

      // Broadcast fresh queue back to all party guests
      broadcastCurrentPartyQueue();

      return newItem;
    },
    onTriggerSfx: (sfx) => {
      if (sfx && sfx.pad) {
        soundPads.play(sfx.pad).catch(console.error);
        const padEmoji = {
          airhorn: '🎺',
          applause: '👏',
          drumroll: '🥁',
          rimshot: '💥',
          laughter: '😂',
          laugh: '😂',
          scratch: '📀'
        }[sfx.pad] || '🔊';

        addPartyLog(`${padEmoji} ${sfx.sender || 'Someone'} triggered ${sfx.pad}`);
      }
    },
    onSearch: (query) => {
      try {
        return libraryStore.search(query).slice(0, 15);
      } catch {
        return [];
      }
    },
    onPeersChange: (count) => {
      connectedPeersCount.value = count;
    }
  });

  const code = await partyHostInstance.start(preferredCode);
  partyRoomCode.value = code;
  partyBroker.value = partyHostInstance.brokerId || brokerId;
  partySessionId.value = partyHostInstance.sessionId || '';
  isPartyActive.value = true;
  connectedPeersCount.value = partyHostInstance.connectedPeersCount;
  addPartyLog(`🏠 House Party started with room code [${code}]`);

  // Send initial queue
  broadcastCurrentPartyQueue();

  return code;
}

/**
 * Broadcast current queue state to peers
 */
export function broadcastCurrentPartyQueue() {
  if (partyHostInstance && isPartyActive.value) {
    partyHostInstance.broadcastQueue(queue.value, currentTrack.value);
  }
}

/**
 * Stop the P2P House Party Host
 */
export function stopPartyHost() {
  if (partyHostInstance) {
    partyHostInstance.stop();
    partyHostInstance = null;
  }
  isPartyActive.value = false;
  partyRoomCode.value = '';
  connectedPeersCount.value = 0;
  addPartyLog('⏹️ House Party ended');
}
