import { signal } from '@preact/signals';
import { PartyHost } from '../engine/party/party-host.js';
import { queue, currentTrack } from './player-state.js';
import { LibraryStore } from '../engine/library/library-store.js';
import { SoundPads } from '../engine/sfx/sound-pads.js';

export const isPartyActive = signal(false);
export const partyRoomCode = signal('');
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
export async function startPartyHost(preferredCode = null, customTransport = null) {
  if (isPartyActive.value && partyHostInstance) {
    return partyRoomCode.value;
  }

  partyHostInstance = new PartyHost({
    transport: customTransport,
    onAddSong: (song) => {
      const newItem = {
        id: song.id || `party_${Date.now()}`,
        singerName: song.singer || 'Guest',
        title: song.title || 'Untitled Song',
        artist: song.artist || 'Unknown Artist',
        semitones: song.preferredKey || 0,
        requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'queued',
        source: song.source || 'local',
        youtubeId: song.youtubeId || null
      };

      // Auto-match with local library if track title/artist available
      if (newItem.source === 'local' && (newItem.title || newItem.artist)) {
        const match = LibraryStore.matchRequest({
          song_artist: newItem.artist,
          song_title: newItem.title
        });
        if (match) {
          newItem.mediaItem = match;
        }
      }

      queue.value = [...queue.value, newItem];
      addPartyLog(`🎤 ${newItem.singerName} added "${newItem.title}"`);

      // Broadcast fresh queue back to all party guests
      broadcastCurrentPartyQueue();
    },
    onTriggerSfx: (sfx) => {
      if (sfx && sfx.pad) {
        SoundPads.trigger(sfx.pad);
        const padEmoji = {
          airhorn: '🎺',
          applause: '👏',
          drumroll: '🥁',
          rimshot: '💥',
          laugh: '😂',
          scratch: '📀'
        }[sfx.pad] || '🔊';

        addPartyLog(`${padEmoji} ${sfx.sender || 'Someone'} triggered ${sfx.pad}`);
      }
    },
    onSearch: (query) => {
      return LibraryStore.search(query).slice(0, 15);
    }
  });

  const code = await partyHostInstance.start(preferredCode);
  partyRoomCode.value = code;
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
