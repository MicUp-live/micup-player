import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  formatYouTubeSearchQuery,
  normalizeYouTubeItem
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

test('normalizeYouTubeItem creates standard player track item', () => {
  const raw = {
    id: 'abc123xyz89',
    title: 'Adele - Hello (Karaoke Version)',
    channelTitle: 'Sing King Karaoke',
    thumbnail: 'https://i.ytimg.com/vi/abc123xyz89/hqdefault.jpg'
  };

  const item = normalizeYouTubeItem(raw);
  assert.equal(item.type, 'youtube');
  assert.equal(item.videoId, 'abc123xyz89');
  assert.equal(item.title, 'Adele - Hello (Karaoke Version)');
  assert.equal(item.channel, 'Sing King Karaoke');
  assert.ok(item.thumbnail);
});
