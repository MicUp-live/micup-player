import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SoundPads, SOUND_DEFINITIONS, SOUND_ALIASES, getSfxUrl } from './sound-pads.js';

describe('SoundPads SFX Engine', () => {
  it('defines 9 studio sound effects with valid asset filenames', () => {
    const keys = Object.keys(SOUND_DEFINITIONS);
    assert.equal(keys.length, 9);
    assert.deepEqual(keys.sort(), [
      'airhorn',
      'applause',
      'boo',
      'crickets',
      'drumroll',
      'fail',
      'laughter',
      'rimshot',
      'scratch'
    ]);

    for (const [key, def] of Object.entries(SOUND_DEFINITIONS)) {
      assert.ok(def.file, `${key} must have a file defined`);
      assert.ok(def.label, `${key} must have a label defined`);
      assert.ok(def.icon, `${key} must have an icon defined`);
      assert.ok(typeof def.gain === 'number' && def.gain > 0 && def.gain <= 1.0);
    }
  });

  it('correctly maps compatibility aliases', () => {
    const pads = new SoundPads();
    assert.equal(pads.resolveKey('laugh'), 'laughter');
    assert.equal(pads.resolveKey('trombone'), 'fail');
    assert.equal(pads.resolveKey('sad-trombone'), 'fail');
    assert.equal(pads.resolveKey('sad_trombone'), 'fail');
    assert.equal(pads.resolveKey('booing'), 'boo');
    assert.equal(pads.resolveKey('AIRHORN'), 'airhorn');
    assert.equal(pads.resolveKey('applause'), 'applause');
    assert.equal(pads.resolveKey('unknown'), 'unknown');
    assert.equal(pads.resolveKey(''), null);
    assert.equal(pads.resolveKey(null), null);
  });

  it('resolves sfx asset URLs cleanly', () => {
    const airhornUrl = getSfxUrl('airhorn.mp3');
    assert.ok(airhornUrl.endsWith('/sfx/airhorn.mp3') || airhornUrl === 'sfx/airhorn.mp3');
  });

  it('handles play safely in non-browser/node environment without crashing', async () => {
    const pads = new SoundPads();
    let notifiedKey = null;
    pads.onPlay = (k) => { notifiedKey = k; };

    await assert.doesNotReject(async () => {
      await pads.play('airhorn');
    });
    assert.equal(notifiedKey, 'airhorn');

    await assert.doesNotReject(async () => {
      await pads.play('laugh');
    });
    assert.equal(notifiedKey, 'laughter');

    await assert.doesNotReject(async () => {
      await pads.play('unknown-pad');
    });
  });

  it('provides synthetic sound fallback generators for all 9 sounds', () => {
    const pads = new SoundPads();
    const mockCtx = {
      sampleRate: 44100,
      currentTime: 0,
      destination: {},
      createBuffer: () => ({
        getChannelData: () => new Float32Array(100)
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {}
      }),
      createBiquadFilter: () => ({
        type: '',
        frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
        Q: { setValueAtTime: () => {} },
        connect: () => {}
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {}
      }),
      createOscillator: () => ({
        type: '',
        frequency: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {},
        start: () => {},
        stop: () => {}
      })
    };

    const keys = Object.keys(SOUND_DEFINITIONS);
    for (const key of keys) {
      assert.doesNotThrow(() => {
        pads.playSynthetic(mockCtx, key);
      }, `playSynthetic should succeed for ${key}`);
    }
  });
});
