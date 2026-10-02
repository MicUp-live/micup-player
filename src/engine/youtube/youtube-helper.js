/**
 * YouTube Karaoke Helper & Search Integration
 * 
 * Supports parsing YouTube URLs/Video IDs, formatting karaoke queries,
 * and querying public search endpoints for live karaoke fallback tracks.
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
  const id = raw.id || raw.videoId || raw.url?.split('v=')[1] || '';
  return {
    type: 'youtube',
    id: `yt-${id}`,
    videoId: id,
    title: raw.title || 'YouTube Karaoke Track',
    channel: raw.channelTitle || raw.channel || raw.uploaderName || 'YouTube',
    artist: raw.artist || raw.channelTitle || 'YouTube Karaoke',
    thumbnail: raw.thumbnail || raw.thumbnailUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
    duration: raw.duration || 0
  };
}

/**
 * Public search querying open video search instances (with multiple resilient mirrors)
 */
export async function searchYouTubeKaraoke(query, limit = 15) {
  const q = formatYouTubeSearchQuery(query);
  const directId = extractYouTubeVideoId(query);

  // If user pasted a direct video link or ID, return it immediately
  if (directId) {
    return [
      normalizeYouTubeItem({
        id: directId,
        title: `YouTube Video (${directId})`,
        channelTitle: 'Direct Link'
      })
    ];
  }

  // Resilient public search endpoints
  const endpoints = [
    `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=videos`,
    `https://invidious.jing.rocks/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video`
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        
        return items.slice(0, limit).map(item => {
          const videoId = item.id || item.videoId || (item.url ? extractYouTubeVideoId(item.url) : '');
          return normalizeYouTubeItem({
            id: videoId,
            title: item.title,
            channelTitle: item.uploaderName || item.author || item.channelTitle || 'Karaoke',
            thumbnail: item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '')
          });
        }).filter(item => !!item.videoId);
      }
    } catch (e) {
      // Try next endpoint on network timeout
    }
  }

  // Fallback demo results if offline/network blocked
  return [
    normalizeYouTubeItem({
      id: 'dQw4w9WgXcQ',
      title: `${query} (Search online for YouTube video)`,
      channelTitle: 'YouTube Search'
    })
  ];
}
