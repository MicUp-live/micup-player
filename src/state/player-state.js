/**
 * Global Player State using Preact Signals
 */

import { signal, computed } from '@preact/signals';

export const currentTrack = signal(null);
export const isPlaying = signal(false);
export const currentTime = signal(0);
export const duration = signal(0);
export const semitones = signal(0);
export const volume = signal(1.0);
export const audioLevel = signal(0);

// Playout Queue & Singer Rotation
export const queue = signal([]);
export const activeQueueItemId = signal(null);

export const activeQueueItem = computed(() => {
  if (!activeQueueItemId.value) return null;
  return queue.value.find(item => item.id === activeQueueItemId.value) || null;
});

export const activeTab = signal('queue'); // 'queue' | 'library' | 'pads'
export const isSecondScreenConnected = signal(false);
export const bgmActive = signal(false);
export const autoApplause = signal(true);
export const isMuted = signal(false);
export const audioOutputTarget = signal('stage'); // 'stage' | 'host'

// Computed helpers
export const upNextSinger = computed(() => {
  if (!activeQueueItemId.value) {
    return queue.value.length > 0 ? queue.value[0] : null;
  }
  return queue.value.find(item => item.id !== activeQueueItemId.value) || null;
});

export const remainingTime = computed(() => {
  const rem = Math.max(0, duration.value - currentTime.value);
  const m = Math.floor(rem / 60);
  const s = Math.floor(rem % 60);
  return `-${m}:${s.toString().padStart(2, '0')}`;
});

export const formattedCurrentTime = computed(() => {
  const cur = currentTime.value;
  const m = Math.floor(cur / 60);
  const s = Math.floor(cur % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
});

export const formattedDuration = computed(() => {
  const dur = duration.value;
  const m = Math.floor(dur / 60);
  const s = Math.floor(dur % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
});

// Pitch text display: e.g. "-2 ♭", "0", "+1 ♯"
export const pitchDisplay = computed(() => {
  const s = semitones.value;
  if (s > 0) return `+${s} ♯`;
  if (s < 0) return `${s} ♭`;
  return '0 (Standard)';
});

// Known Singers Roster & Session Storage
const INITIAL_SINGERS_STORAGE_KEY = 'micup_known_singers';

function loadStoredSingers() {
  try {
    if (typeof window !== 'undefined' && window?.localStorage) {
      const saved = window.localStorage.getItem(INITIAL_SINGERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(s => typeof s === 'string' && s.trim());
        }
      }
    }
  } catch (e) {}
  return [];
}

export const knownSingers = signal(loadStoredSingers());

export function saveKnownSingers(singersList) {
  try {
    if (typeof window !== 'undefined' && window?.localStorage) {
      window.localStorage.setItem(INITIAL_SINGERS_STORAGE_KEY, JSON.stringify(singersList));
    }
  } catch (e) {}
}

export function addKnownSinger(name) {
  if (!name || typeof name !== 'string') return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (['host selection', 'singer', 'guest', 'party guest', 'unknown', 'direct link'].includes(lower)) {
    return;
  }
  const current = knownSingers.value;
  if (!current.some(s => s.toLowerCase() === lower)) {
    const updated = [...current, trimmed];
    knownSingers.value = updated;
    saveKnownSingers(updated);
  }
}

export function removeKnownSinger(name) {
  if (!name || typeof name !== 'string') return;
  const lower = name.trim().toLowerCase();
  const updated = knownSingers.value.filter(s => s.toLowerCase() !== lower);
  knownSingers.value = updated;
  saveKnownSingers(updated);
}

export function clearKnownSingers() {
  knownSingers.value = [];
  saveKnownSingers([]);
}

/**
 * Reactive computed list of all unique singers in current show:
 * Aggregates knownSingers, active queue singers, and current track singer.
 */
export const allShowSingers = computed(() => {
  const map = new Map();

  const add = (s) => {
    if (!s || typeof s !== 'string') return;
    const trimmed = s.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (['host selection', 'singer', 'guest', 'party guest', 'unknown', 'direct link'].includes(lower)) {
      return;
    }
    if (!map.has(lower)) {
      map.set(lower, trimmed);
    }
  };

  // 1. Registered known singers
  if (Array.isArray(knownSingers.value)) {
    for (const s of knownSingers.value) add(s);
  }

  // 2. Singers currently in rotation queue
  if (Array.isArray(queue.value)) {
    for (const item of queue.value) add(item?.singerName);
  }

  // 3. Current playing track singer
  if (currentTrack.value?.singerName) {
    add(currentTrack.value.singerName);
  }

  return Array.from(map.values());
});
