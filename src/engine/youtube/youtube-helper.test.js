import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  formatYouTubeSearchQuery,
  normalizeYouTubeItem,
  searchYouTubeKaraoke,
  getYouTubeApiKey,
  setYouTubeApiKey,
  getCustomSearchEndpoint,
  setCustomSearchEndpoint
} from './youtube-helper.js';

test('extractYouTubeVideoId parses standard youtube.com watch URLs', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.equal(extractYouTubeVideoId(url), 'dQw4w9WgXcQ');

  const urlWithParams = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=shared';
  assert.equal(extractYouTubeVideoId(urlWithParams), 'dQw4w9WgXcQ');
});

test('extractYouTubeVideoId parses youtu.be short URLs', () => {
  const shortUrl = 'https://youtu.be/dQw4w9WgXcQ';
  assert.equal(extractYouTubeVideoId(shortUrl), 'dQw4w9WgXcQ');
});

test('extractYouTubeVideoId parses embed URLs', () => {
  const embedUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1';
  assert.equal(extractYouTubeVideoId(embedUrl), 'dQw4w9WgXcQ');
});

test('extractYouTubeVideoId recognizes raw 11-character video IDs', () => {
  const rawId = 'dQw4w9WgXcQ';
  assert.equal(extractYouTubeVideoId(rawId), 'dQw4w9WgXcQ');
});

test('extractYouTubeVideoId returns null for invalid non-video URLs', () => {
  assert.equal(extractYouTubeVideoId('https://google.com'), null);
  assert.equal(extractYouTubeVideoId('random string text'), null);
  assert.equal(extractYouTubeVideoId(''), null);
});

test('formatYouTubeSearchQuery appends karaoke keyword without duplicating', () => {
  assert.equal(
    formatYouTubeSearchQuery('Espresso', 'Sabrina Carpenter'),
    'Sabrina Carpenter Espresso karaoke'
  );

  assert.equal(
    formatYouTubeSearchQuery('Queen - Bohemian Rhapsody Karaoke'),
    'Queen - Bohemian Rhapsody Karaoke'
  );
});

test('extractYouTubeVideoId parses shorts and live URLs', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtube.com/live/dQw4w9WgXcQ?feature=share'), 'dQw4w9WgXcQ');
});

test('normalizeYouTubeItem creates standard player track item with both videoId and youtubeId', () => {
  const raw = {
    id: 'abc123xyz89',
    title: 'Adele - Hello (Karaoke Version)',
    channelTitle: 'Sing King Karaoke',
    thumbnail: 'https://i.ytimg.com/vi/abc123xyz89/hqdefault.jpg'
  };

  const item = normalizeYouTubeItem(raw);
  assert.equal(item.type, 'youtube');
  assert.equal(item.videoId, 'abc123xyz89');
  assert.equal(item.youtubeId, 'abc123xyz89');
  assert.equal(item.title, 'Adele - Hello (Karaoke Version)');
  assert.equal(item.channel, 'Sing King Karaoke');
  assert.equal(item.thumbnail, 'https://i.ytimg.com/vi/abc123xyz89/hqdefault.jpg');
});

test('searchYouTubeKaraoke immediately resolves direct URL or ID without network request', async () => {
  const directUrl = 'https://youtu.be/9Lxm0iSnKNc';
  const results = await searchYouTubeKaraoke(directUrl);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, '9Lxm0iSnKNc');
  assert.equal(results[0].type, 'youtube');
});

test('searchYouTubeKaraoke supports custom YouTube Data API v3 key', async () => {
  const mockFetcher = async (url) => {
    assert.ok(url.includes('googleapis.com/youtube/v3/search'));
    assert.ok(url.includes('key=TEST_KEY_123'));
    return {
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: 'vidGoogle1' },
            snippet: {
              title: 'Queen - Don\'t Stop Me Now (Karaoke)',
              channelTitle: 'Karaoke Channel',
              thumbnails: { high: { url: 'https://example.com/thumb.jpg' } }
            }
          }
        ]
      })
    };
  };

  const results = await searchYouTubeKaraoke('Queen Don\'t Stop Me Now', {
    apiKey: 'TEST_KEY_123',
    fetcher: mockFetcher
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'vidGoogle1');
  assert.equal(results[0].title, 'Queen - Don\'t Stop Me Now (Karaoke)');
  assert.equal(results[0].channel, 'Karaoke Channel');
});

test('searchYouTubeKaraoke queries custom proxy endpoint', async () => {
  const mockFetcher = async (url) => {
    assert.ok(url.startsWith('https://my-karaoke-worker.workers.dev/search'));
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            videoId: 'workerVid1',
            title: 'Journey - Don\'t Stop Believin\' (Karaoke)',
            channel: 'Sing King'
          }
        ]
      })
    };
  };

  const results = await searchYouTubeKaraoke('Journey Don\'t Stop Believin', {
    endpoint: 'https://my-karaoke-worker.workers.dev/search',
    fetcher: mockFetcher
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'workerVid1');
  assert.equal(results[0].title, 'Journey - Don\'t Stop Believin\' (Karaoke)');
});

test('searchYouTubeKaraoke returns empty list on network error rather than dummy fallback', async () => {
  const failingFetcher = async () => {
    throw new Error('Network timeout');
  };

  const results = await searchYouTubeKaraoke('Obscure Song', {
    fetcher: failingFetcher
  });

  assert.deepEqual(results, []);
});

