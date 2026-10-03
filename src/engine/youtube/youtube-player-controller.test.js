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

  assert.ok(url.includes('https://www.youtube.com/embed/9Lxm0iSnKNc'));
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

test('parseYouTubeMessage detects completion from infoDelivery playerState 0 and duration', () => {
  // infoDelivery with playerState: 0
  const endedInfoMsg = JSON.stringify({
    event: 'infoDelivery',
    info: {
      currentTime: 180.5,
      duration: 180.5,
      playerState: 0
    }
  });
  const parsed1 = parseYouTubeMessage(endedInfoMsg);
  assert.equal(parsed1.type, 'timeUpdate');
  assert.equal(parsed1.playerState, 0);
  assert.equal(parsed1.state, 'ended');
  assert.equal(parsed1.isEnded, true);

  // infoDelivery near duration (within 0.3s)
  const nearEndMsg = JSON.stringify({
    event: 'infoDelivery',
    info: {
      currentTime: 199.85,
      duration: 200.0,
      playerState: 1
    }
  });
  const parsed2 = parseYouTubeMessage(nearEndMsg);
  assert.equal(parsed2.type, 'timeUpdate');
  assert.equal(parsed2.isEnded, true);

  // infoDelivery mid-song
  const midSongMsg = JSON.stringify({
    event: 'infoDelivery',
    info: {
      currentTime: 50.0,
      duration: 200.0,
      playerState: 1
    }
  });
  const parsed3 = parseYouTubeMessage(midSongMsg);
  assert.equal(parsed3.type, 'timeUpdate');
  assert.equal(parsed3.playerState, 1);
  assert.equal(parsed3.state, 'playing');
  assert.equal(parsed3.isEnded, false);
});

test('YouTubePlayerController triggers onEnded for infoDelivery and deduplicates calls', () => {
  let endedCount = 0;
  let stateReceived = null;
  const sentMessages = [];

  const mockIframe = {
    contentWindow: {
      postMessage: (msg) => {
        sentMessages.push(typeof msg === 'string' ? JSON.parse(msg) : msg);
      }
    }
  };

  const controller = new YouTubePlayerController({
    onEnded: () => {
      endedCount++;
    },
    onStateChange: (state) => {
      stateReceived = state;
    }
  });

  // 1. Attaching iframe immediately dispatches listening handshake
  controller.attachIframe(mockIframe);
  const listeningMsgs = sentMessages.filter(m => m.event === 'listening');
  assert.ok(listeningMsgs.length >= 1, 'attachIframe must send listening event to iframe');

  // 2. Play Video resets ended flag and sends play command
  controller.play();
  assert.ok(sentMessages.some(m => m.event === 'command' && m.func === 'playVideo'));

  // 3. Receive infoDelivery with playerState: 1 (playing)
  controller.handleWindowMessage({
    data: JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 1.0, duration: 180.0, playerState: 1 }
    })
  });
  assert.equal(stateReceived, 'playing');
  assert.equal(endedCount, 0);

  // 4. Receive infoDelivery with playerState: 0 (ended)
  controller.handleWindowMessage({
    data: JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 180.0, duration: 180.0, playerState: 0 }
    })
  });
  assert.equal(endedCount, 1, 'onEnded must be called when infoDelivery playerState is 0');

  // 5. Subsequent duplicate infoDelivery messages at end of stream must be ignored
  controller.handleWindowMessage({
    data: JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 180.0, duration: 180.0, playerState: 0 }
    })
  });
  assert.equal(endedCount, 1, 'Duplicate ended events must be deduplicated');

  // 6. Starting playback again resets ended flag
  controller.play();
  controller.handleWindowMessage({
    data: JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 180.0, duration: 180.0, playerState: 0 }
    })
  });
  assert.equal(endedCount, 2, 'New playback cycle allows next onEnded trigger');
});
