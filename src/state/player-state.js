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
export const queue = signal([
  {
    id: 'demo-1',
    singerName: 'Marcus Vance',
    title: 'Don\'t Stop Believin\'',
    artist: 'Journey',
    semitones: 0,
    requestedAt: '8:45 PM',
    status: 'up_next'
  },
  {
    id: 'demo-2',
    singerName: 'Elena Rostova',
    title: 'Rolling in the Deep',
    artist: 'Adele',
    semitones: -1,
    requestedAt: '8:50 PM',
    status: 'queued'
  },
  {
    id: 'demo-3',
    singerName: 'David K.',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    semitones: 1,
    requestedAt: '8:56 PM',
    status: 'queued'
  }
]);

export const activeTab = signal('queue'); // 'queue' | 'library' | 'pads'
export const isSecondScreenConnected = signal(false);
export const bgmActive = signal(false);
export const autoApplause = signal(true);
export const isMuted = signal(false);

// Computed helpers
export const upNextSinger = computed(() => {
  return queue.value.length > 0 ? queue.value[0] : null;
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
