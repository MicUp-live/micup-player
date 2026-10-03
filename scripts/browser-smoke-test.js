/**
 * Browser Integration Smoke Test
 * 
 * NOTE: This is an automated headless browser smoke test designed to verify
 * mounted-stage DOM event routing, canvas element initialization, and iframe
 * window-provenance isolation in a real browser engine (Chromium / Google Chrome).
 * 
 * Scope & Limitations:
 * - Tests mounted DOM rendering and BroadcastChannel/window-message synchronization.
 * - Uses synthetic player events and placeholder media to verify controller routing.
 * - DOES NOT substitute for live venue verification: actual YouTube video streaming,
 *   AudioWorklet real-time pitch-shifting audio quality, hardware audio output
 *   routing, and multi-hour show-length stability must still be verified in live rehearsal.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(REPO_ROOT, 'dist');
const PORT = 5188;

function findChromeBinary() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidates = [
    path.join(process.env.HOME || '', '.config/Antigravity/bin/google-chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const which = execSync('which google-chrome || which chromium || which chromium-browser', { encoding: 'utf8' }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch (e) {}
  return 'google-chrome';
}

// Ensure dist/ exists
if (!fs.existsSync(path.join(DIST_DIR, 'stage.html'))) {
  console.log('Production build not found. Running build first...');
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
}

// 1. Static file server
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/stage.html';
  const filePath = path.join(DIST_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found: ' + reqPath);
  }
});

await new Promise(r => server.listen(PORT, r));
console.log(`[Smoke Test] Static server serving stage build at http://127.0.0.1:${PORT}`);

const chromeBin = findChromeBinary();
console.log(`[Smoke Test] Launching Chrome binary: ${chromeBin}`);

// 2. Launch headless Chrome with DevTools Protocol
const chromeProc = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=9222',
  `http://127.0.0.1:${PORT}/stage.html`
], { stdio: 'pipe' });

// Wait for CDP endpoint
let wsUrl = null;
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 200));
  try {
    const res = await fetch('http://127.0.0.1:9222/json');
    const tabs = await res.json();
    const stageTab = tabs.find(t => t.url.includes('stage.html'));
    if (stageTab?.webSocketDebuggerUrl) {
      wsUrl = stageTab.webSocketDebuggerUrl;
      break;
    }
  } catch (e) {}
}

assert.ok(wsUrl, 'Failed to obtain Chrome WebSocket Debugger URL');
console.log(`[Smoke Test] Connected to Chrome DevTools Protocol at ${wsUrl}`);

const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);

let idCounter = 1;
const pending = new Map();
const consoleErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    if (msg.params.type === 'error') {
      const errText = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      consoleErrors.push(errText);
      console.log('[Browser console.error]', errText);
    }
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const text = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
    consoleErrors.push(text);
    console.log('[Browser uncaught exception]', text);
  }

  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
};

function sendCdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = idCounter++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');

async function evaluate(expression) {
  const res = await sendCdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (res.exceptionDetails) {
    throw new Error('Eval exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

// Wait for stage application initialization
await new Promise(r => setTimeout(r, 1000));
console.log('[Smoke Test] Stage page mounted and ready.');

try {
  // --- JOURNEY 1: FIRST CD+G LOAD WITH REAL CANVAS ---
  console.log('\n--- Journey 1: First CD+G Load on Stage ---');
  await evaluate(`
    window.__testHostChannel = new BroadcastChannel('micup_stage_broadcast');
    window.__receivedHostMessages = [];
    window.__testHostChannel.onmessage = (e) => {
      window.__receivedHostMessages.push(e.data);
    };
    true;
  `);

  // 1. Host announces CD+G state
  await evaluate(`
    window.__testHostChannel.postMessage({
      type: 'STATE_UPDATE',
      payload: {
        mediaType: 'cdg',
        trackId: 'track-cdg-smoke-1',
        title: 'Smoke Test CD+G',
        artist: 'Test Singer',
        isPlaying: true
      }
    });
  `);

  await new Promise(r => setTimeout(r, 300));

  // 2. Host sends CDG binary subcode packets
  await evaluate(`
    const packet = new Uint8Array(24);
    packet[0] = 0x09; // CDG command
    packet[1] = 0x01; // Memory Preset
    window.__testHostChannel.postMessage({
      type: 'CDG_LOAD',
      payload: packet
    });
  `);

  await new Promise(r => setTimeout(r, 400));

  // Verify no uncaught exceptions on canvas loadData
  const cdgErrors = consoleErrors.filter(e => e.includes('cdg') || e.includes('loadData') || e.includes('TypeError'));
  assert.equal(cdgErrors.length, 0, `Expected 0 CD+G errors, got: ${cdgErrors.join(', ')}`);
  console.log('✔ Journey 1 Passed: First CD+G load initialized renderer on canvas without error.');

  // --- JOURNEY 2: YOUTUBE TRACK TRANSITION & WINDOW PROVENANCE ISOLATION ---
  console.log('\n--- Journey 2: YouTube A -> YouTube B & Stale Window Provenance ---');

  // 1. Switch to YouTube Track A
  await evaluate(`
    window.__receivedHostMessages = [];
    window.__testHostChannel.postMessage({
      type: 'STATE_UPDATE',
      payload: {
        mediaType: 'youtube',
        videoId: 'mockVideoA',
        trackId: 'track-yt-A',
        title: 'Track A',
        isPlaying: true
      }
    });
  `);

  await new Promise(r => setTimeout(r, 600));

  // Capture WindowProxy of Iframe A
  const iframeA = await evaluate(`
    (() => {
      const el = document.querySelector('iframe');
      if (el) window.__iframeAWindow = el.contentWindow;
      return { hasIframe: Boolean(el), src: el ? el.src : '' };
    })()
  `);
  assert.ok(iframeA.hasIframe, 'Iframe A must be mounted');
  assert.ok(iframeA.src.includes('mockVideoA'));

  // 2. Transition host to YouTube Track B
  await evaluate(`
    window.__testHostChannel.postMessage({
      type: 'STATE_UPDATE',
      payload: {
        mediaType: 'youtube',
        videoId: 'mockVideoB',
        trackId: 'track-yt-B',
        title: 'Track B',
        isPlaying: true
      }
    });
  `);

  await new Promise(r => setTimeout(r, 600));

  // Verify Iframe B was remounted with a distinct WindowProxy
  const iframeB = await evaluate(`
    (() => {
      const el = document.querySelector('iframe');
      return {
        hasIframe: Boolean(el),
        src: el ? el.src : '',
        isDistinctWindow: el && el.contentWindow !== window.__iframeAWindow
      };
    })()
  `);
  assert.ok(iframeB.hasIframe, 'Iframe B must be mounted');
  assert.ok(iframeB.src.includes('mockVideoB'));
  assert.ok(iframeB.isDistinctWindow, 'Iframe B must have a distinct contentWindow from Iframe A');

  // 3. Dispatch delayed event from OLD Iframe A window
  await evaluate(`
    (() => {
      const delayedEvent = new MessageEvent('message', {
        data: JSON.stringify({ event: 'onStateChange', info: 0 }), // ended
        source: window.__iframeAWindow
      });
      window.dispatchEvent(delayedEvent);
    })()
  `);

  await new Promise(r => setTimeout(r, 300));

  // Verify host channel DID NOT receive STAGE_PLAYBACK_ENDED for track B from old window
  const endedMsgsDelayed = await evaluate(`
    window.__receivedHostMessages.filter(m => m.type === 'STAGE_PLAYBACK_ENDED');
  `);
  assert.equal(endedMsgsDelayed.length, 0, 'Delayed completion from prior YouTube iframe must be rejected');
  console.log('✔ Stale event from old YouTube window was blocked from terminating Track B.');

  // 4. Dispatch valid event from ACTIVE Iframe B window
  await evaluate(`
    (() => {
      const el = document.querySelector('iframe');
      const validEvent = new MessageEvent('message', {
        data: JSON.stringify({ event: 'onStateChange', info: 0 }), // ended
        source: el.contentWindow
      });
      window.dispatchEvent(validEvent);
    })()
  `);

  await new Promise(r => setTimeout(r, 300));

  const endedMsgsValid = await evaluate(`
    window.__receivedHostMessages.filter(m => m.type === 'STAGE_PLAYBACK_ENDED');
  `);
  assert.equal(endedMsgsValid.length, 1, 'Legitimate completion from active YouTube iframe must be accepted');
  assert.equal(endedMsgsValid[0].payload.trackId, 'track-yt-B', 'Completion must carry Track B ID');
  console.log('✔ Journey 2 Passed: Provenance validation accepted legitimate Track B completion.');

  console.log('\n[Smoke Test] All browser smoke test assertions PASSED.');
} finally {
  ws.close();
  chromeProc.kill();
  server.close();
}
