/**
 * YouTube Karaoke Helper & Search Integration
 * 
 * Supports parsing YouTube URLs/Video IDs, formatting karaoke queries,
 * querying custom YouTube Data API v3 keys, custom search workers,
 * or resilient public Invidious CORS mirrors.
 */

export function extractYouTubeVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // 1. Direct 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // 2. youtu.be/<id>
  const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // 3. youtube.com/watch?v=<id>
  const watchMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // 4. youtube.com/embed/<id>
  const embedMatch = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // 5. youtube.com/shorts/<id>
  const shortsMatch = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // 6. youtube.com/live/<id>
  const liveMatch = str.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch) return liveMatch[1];

  return null;
}

export function formatYouTubeSearchQuery(title, artist = '') {
  let combined = artist ? `${artist} ${title}`.trim() : title.trim();
  if (!/\bkaraoke\b/i.test(combined)) {
    combined = `${combined} karaoke`;
  }
  return combined;
}

export function normalizeYouTubeItem(raw) {
  const id = raw.id || raw.videoId || (raw.url ? extractYouTubeVideoId(raw.url) : '') || '';
  return {
    type: 'youtube',
    id: `yt-${id}`,
    videoId: id,
    youtubeId: id,
    title: raw.title || 'YouTube Karaoke Track',
    channel: raw.channelTitle || raw.channel || raw.uploaderName || raw.author || 'YouTube Karaoke',
    artist: raw.artist || raw.channelTitle || raw.channel || raw.uploaderName || raw.author || 'YouTube Karaoke',
    thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : (raw.thumbnail || raw.thumbnailUrl || ''),
    duration: raw.duration || raw.lengthSeconds || 0
  };
}

export function getYouTubeApiKey() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('micup_yt_api_key') || '';
    }
  } catch (e) {}
  return '';
}

export function setYouTubeApiKey(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!key) {
        window.localStorage.removeItem('micup_yt_api_key');
      } else {
        window.localStorage.setItem('micup_yt_api_key', key.trim());
      }
    }
  } catch (e) {}
}

export function getCustomSearchEndpoint() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('micup_yt_endpoint') || '';
    }
  } catch (e) {}
  return '';
}

export function setCustomSearchEndpoint(endpoint) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!endpoint) {
        window.localStorage.removeItem('micup_yt_endpoint');
      } else {
        window.localStorage.setItem('micup_yt_endpoint', endpoint.trim());
      }
    }
  } catch (e) {}
}

/**
 * Multi-tier search:
 * 1. Direct ID/URL resolution
 * 2. Optional user YouTube Data API v3 key
 * 3. Optional user custom search worker/proxy endpoint
 * 4. Active Invidious CORS mirrors
 */
export async function searchYouTubeKaraoke(query, options = {}) {
  if (!query || typeof query !== 'string') return [];
  const qTrim = query.trim();
  if (!qTrim) return [];

  // Direct video link or ID paste
  const directId = extractYouTubeVideoId(qTrim);
  if (directId) {
    return [
      normalizeYouTubeItem({
        id: directId,
        title: `YouTube Video (${directId})`,
        channelTitle: 'Direct Link'
      })
    ];
  }

  const limit = options.limit || 15;
  const fetchFn = options.fetcher || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) return [];

  const apiKey = options.apiKey || getYouTubeApiKey();
  const endpoint = options.endpoint || getCustomSearchEndpoint();
  const q = formatYouTubeSearchQuery(qTrim);

  // Tier 1: YouTube Data API v3
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetchFn(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        return items.map(item => normalizeYouTubeItem({
          id: item.id?.videoId || item.id,
          title: item.snippet?.title,
          channelTitle: item.snippet?.channelTitle,
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url
        })).filter(item => !!item.videoId);
      }
    } catch (e) {
      console.warn('YouTube Data API search error:', e);
    }
  }

  // Tier 2: Custom search endpoint / worker
  if (endpoint) {
    try {
      const glue = endpoint.includes('?') ? '&' : '?';
      const url = `${endpoint}${glue}q=${encodeURIComponent(q)}&limit=${limit}`;
      const res = await fetchFn(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || data.items || []);
        return items.slice(0, limit).map(item => normalizeYouTubeItem({
          id: item.videoId || item.id || (item.url ? extractYouTubeVideoId(item.url) : ''),
          title: item.title,
          channelTitle: item.channel || item.channelTitle || item.author,
          thumbnail: item.thumbnail
        })).filter(item => !!item.videoId);
      }
    } catch (e) {
      console.warn('Custom search endpoint error:', e);
    }
  }

  // Tier 3: Active public Invidious CORS mirrors
  const publicMirrors = [
    `https://invidious.f5.si/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    `https://invidious.flokinet.to/api/v1/search?q=${encodeURIComponent(q)}&type=video`
  ];

  for (const mirror of publicMirrors) {
    try {
      const res = await fetchFn(mirror, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.slice(0, limit).map(item => normalizeYouTubeItem({
            id: item.videoId || item.id,
            title: item.title,
            channelTitle: item.author || item.uploaderName || item.channelTitle,
            thumbnail: item.videoThumbnails?.[0]?.url || item.thumbnail
          })).filter(item => !!item.videoId);
        }
      }
    } catch (e) {
      // Try next mirror
    }
  }

  return [];
}
