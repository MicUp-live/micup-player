import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YouTubePlayerController,
  formatYouTubeEmbedUrl,
  parseYouTubeMessage
} from './youtube-player-controller.js';

test('formatYouTubeEmbedUrl constructs valid embed URL with parameters', () => {
  const url = formatYouTubeEmbedUrl('9Lxm0iSnKNc', {
    autoplay: true,
    controls: false,
    muted: true,
    origin: 'https://micup.live'
  });

  assert.ok(url.includes('https://www.youtube-nocookie.com/embed/9Lxm0iSnKNc'));
  assert.ok(url.includes('autoplay=1'));
  assert.ok(url.includes('enablejsapi=1'));
  assert.ok(url.includes('controls=0'));
  assert.ok(url.includes('mute=1'));
  assert.ok(url.includes('origin=https%3A%2F%2Fmicup.live'));
});

test('parseYouTubeMessage identifies ended, playing, and paused states', () => {
  // onStateChange ended (0)
  const endedMsg = JSON.stringify({ event: 'onStateChange', info: 0 });
  const parsedEnded = parseYouTubeMessage(endedMsg);
  assert.equal(parsedEnded.type, 'stateChange');
  assert.equal(parsedEnded.state, 'ended');

  // onStateChange playing (1)
  const playingMsg = JSON.stringify({ event: 'onStateChange', info: 1 });
  const parsedPlaying = parseYouTubeMessage(playingMsg);
  assert.equal(parsedPlaying.type, 'stateChange');
  assert.equal(parsedPlaying.state, 'playing');

  // onStateChange paused (2)
  const pausedMsg = JSON.stringify({ event: 'onStateChange', info: 2 });
  const parsedPaused = parseYouTubeMessage(pausedMsg);
  assert.equal(parsedPaused.type, 'stateChange');
  assert.equal(parsedPaused.state, 'paused');
});

test('parseYouTubeMessage extracts time and duration info', () => {
  const infoMsg = JSON.stringify({
    event: 'infoDelivery',
    info: {
      currentTime: 42.5,
      duration: 210.0,
      playerState: 1
    }
  });

  const parsed = parseYouTubeMessage(infoMsg);
  assert.equal(parsed.type, 'timeUpdate');
  assert.equal(parsed.currentTime, 42.5);
  assert.equal(parsed.duration, 210.0);
});

test('parseYouTubeMessage handles embed restriction errors (101/150)', () => {
  const errorMsg = JSON.stringify({ event: 'onError', info: 150 });
  const parsed = parseYouTubeMessage(errorMsg);
  assert.equal(parsed.type, 'error');
  assert.equal(parsed.errorCode, 150);
  assert.equal(parsed.isEmbedRestricted, true);
});

test('YouTubePlayerController dispatches commands to target iframe', () => {
  let postedMessage = null;
  const mockIframe = {
    contentWindow: {
      postMessage: (msg) => {
        postedMessage = msg;
      }
    }
  };

  const controller = new YouTubePlayerController();
  controller.attachIframe(mockIframe);

  controller.play();
  assert.deepEqual(JSON.parse(postedMessage), {
    event: 'command',
    func: 'playVideo',
    args: []
  });

  controller.pause();
  assert.deepEqual(JSON.parse(postedMessage), {
    event: 'command',
    func: 'pauseVideo',
    args: []
  });

  controller.seekTo(75);
  assert.deepEqual(JSON.parse(postedMessage), {
    event: 'command',
    func: 'seekTo',
    args: [75, true]
  });

  controller.setMuted(true);
  assert.deepEqual(JSON.parse(postedMessage), {
    event: 'command',
    func: 'mute',
    args: []
  });

  controller.setVolume(0.8);
  assert.deepEqual(JSON.parse(postedMessage), {
    event: 'command',
    func: 'setVolume',
    args: [80]
  });
});
