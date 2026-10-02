/**
 * MicUp.live Cloud Queue Sync Client
 * 
 * Synchronizes with MicUp.live's cloud-managed singer queue,
 * maps mobile singer requests and remembered pitch transpositions,
 * and matches tracks against the host's local media library.
 */

export function normalizeCloudRequest(raw) {
  let semitones = 0;
  if (typeof raw.preferred_key === 'number') {
    semitones = raw.preferred_key;
  } else if (typeof raw.preferred_key === 'string') {
    const parsed = parseInt(raw.preferred_key, 10);
    if (!isNaN(parsed)) {
      semitones = parsed;
    }
  }

  return {
    id: raw.id || `req-${Date.now()}`,
    singerName: raw.singer_name || raw.singer_display_name || 'Guest Singer',
    title: raw.song_title || raw.title || 'Untitled Track',
    artist: raw.song_artist || raw.artist || 'Unknown Artist',
    semitones,
    status: raw.status || 'queued',
    code: raw.disc_code || raw.song_code || '',
    createdAt: raw.created_at || raw.requested_at || '',
    isMatched: false,
    matchedTrack: null
  };
}

export class CloudQueueClient {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:8080';
    this.eventId = options.eventId || null;
    this.queueVersion = null;
    this.isPolling = false;
    this.timer = null;
    this.interval = options.interval || 3500;
  }

  /**
   * Filter, sort, and match raw cloud requests against the local library
   */
  processIncomingRequests(rawRequests, libraryTracks = []) {
    const activeStatuses = new Set(['up_next', 'accepted', 'queued', 'pending']);
    const active = [];

    for (const r of rawRequests) {
      if (activeStatuses.has(r.status)) {
        const norm = normalizeCloudRequest(r);

        // Try to match track from local library
        if (libraryTracks && libraryTracks.length > 0) {
          const a = norm.artist.toLowerCase().trim();
          const t = norm.title.toLowerCase().trim();
          const matched = libraryTracks.find(track => {
            const trackA = track.artist.toLowerCase();
            const trackT = track.title.toLowerCase();
            return (trackA === a && trackT === t) ||
                   (trackA.includes(a) && trackT.includes(t)) ||
                   (a.includes(trackA) && t.includes(trackT));
          });

          if (matched) {
            norm.isMatched = true;
            norm.matchedTrack = matched;
          }
        }

        active.push(norm);
      }
    }

    // Sort: 'up_next' takes priority at index 0, followed by accepted/queued
    active.sort((a, b) => {
      if (a.status === 'up_next' && b.status !== 'up_next') return -1;
      if (b.status === 'up_next' && a.status !== 'up_next') return 1;
      return 0;
    });

    return active;
  }

  /**
   * Start polling MicUp.live event requests
   */
  startPolling({ eventId, onUpdate, onError, libraryStore }) {
    this.stopPolling();
    this.eventId = eventId;
    this.isPolling = true;
    this.queueVersion = null;

    const poll = async () => {
      if (!this.isPolling || !this.eventId) return;

      const endpoint = `${this.apiBaseUrl}/api/events/${this.eventId}/requests`;
      const url = this.queueVersion !== null
        ? `${endpoint}?since=${encodeURIComponent(this.queueVersion)}`
        : endpoint;

      try {
        const res = await fetch(url);
        if (res.status === 200) {
          const data = await res.json();
          if (data) {
            if (Number.isInteger(data.queue_version)) {
              this.queueVersion = data.queue_version;
            }
            const processed = this.processIncomingRequests(
              data.requests || [],
              libraryStore ? libraryStore.tracks : []
            );
            onUpdate?.(processed, data);
          }
        }
      } catch (err) {
        onError?.(err);
      } finally {
        if (this.isPolling) {
          this.timer = setTimeout(poll, this.interval);
        }
      }
    };

    poll();
  }

  stopPolling() {
    this.isPolling = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Update request status on MicUp.live (e.g. 'completed' when song ends)
   */
  async updateStatus(requestId, status) {
    if (!this.eventId || !requestId) return;
    try {
      await fetch(`${this.apiBaseUrl}/api/events/${this.eventId}/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (err) {
      console.warn('Failed to update request status on MicUp.live:', err);
    }
  }
}

export const cloudQueueClient = new CloudQueueClient();
